"""Private QLoRA development run. Final test answers are never uploaded."""
import base64
import contextlib
import hashlib
import importlib.metadata
import json
import re
import os
from pathlib import Path
import random
import subprocess
import sys
import time
import traceback
import types
import zlib

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
OUT = Path("/kaggle/working/scriptrush-specialist-v2")
MAX_CONTEXT = 4608
MAX_NEW_TOKENS = 4096
STEPS = 96
SEED = 39107
PRODUCTION_RETRY_RECOVERY_SHA256 = "4457a3c35aa37ba853257b231b20c637b16453cff306b2f83b337df93ad6421c"
PRODUCTION_RETRY_TRANSPORT_SHA256 = "c4a41179b29326e8274797b3d18eb48c9f3c0b694aac19f12afa595593c0efb3"
PRODUCTION_RETRY_INITIAL_MANIFEST = "1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca"


def masked_causal_loss(logits, labels, chunk_size=128):
    """Same shifted assistant-only CE, without upcasting all prompt logits."""
    import torch
    shifted_labels = labels[:, 1:].reshape(-1)
    active = shifted_labels != -100
    targets = shifted_labels[active]
    if not targets.numel():
        raise RuntimeError("EMPTY_ASSISTANT_LABELS")
    selected = logits[:, :-1, :].reshape(-1, logits.shape[-1])[active]
    total = torch.zeros((), device=logits.device, dtype=torch.float32)
    for offset in range(0, len(targets), chunk_size):
        total = total + torch.nn.functional.cross_entropy(selected[offset:offset + chunk_size].float(), targets[offset:offset + chunk_size], reduction="sum")
    return total / targets.numel()


def assistant_logit_span(labels):
    """Keep the predictor immediately before the first assistant token too.

    This optional resumed-stage optimization uses the pinned Qwen2 implementation's
    logits_to_keep argument. It changes neither causal alignment nor supervision.
    The fitting and validation batches are deliberately one example per device.
    """
    if labels.ndim != 2 or labels.shape[0] != 1:
        raise RuntimeError("ASSISTANT_LOGIT_SLICE_REQUIRES_SINGLE_EXAMPLE")
    active = (labels[0] != -100).nonzero(as_tuple=False)
    if not active.numel() or active[0].item() < 1:
        raise RuntimeError("INVALID_ASSISTANT_LOGIT_ALIGNMENT")
    return labels.shape[1] - int(active[0].item()) + 1


def mounted_adapter(config, model, revision):
    """Find only a complete, hash-pinned output adapter in a mounted private run."""
    if "initialRecoveredCheckpoint" in config:
        return mounted_recovered_adapter(config, model, revision)
    hashes = config.get("initialAdapterSha256")
    summary_hash = config.get("initialSummarySha256")
    manifest_hash = config.get("initialManifestSha256")
    if not isinstance(hashes, dict) or not hashes or "adapter_model.safetensors" not in hashes or not isinstance(summary_hash, str) or not isinstance(manifest_hash, str):
        raise RuntimeError("MISSING_PINNED_INITIAL_ADAPTER_HASHES")
    matches = []
    for summary_path in Path("/kaggle/input").rglob("training-summary.json"):
        raw = summary_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != summary_hash:
            continue
        summary = json.loads(raw)
        adapter = summary_path.parent / "adapter"
        if summary.get("model") != model or summary.get("revision") != revision or summary.get("datasetManifestSha256") != manifest_hash or summary.get("adapterSha256") != hashes:
            continue
        if all(Path(name).name == name and (adapter / name).is_file()
               and hashlib.sha256((adapter / name).read_bytes()).hexdigest() == expected for name, expected in hashes.items()):
            matches.append(adapter)
    if len(matches) != 1:
        raise RuntimeError("UNIQUE_COMPLETE_PINNED_INITIAL_ADAPTER_NOT_FOUND")
    return matches[0]


def validate_production_retry_bundle(bundle):
    """Exactly the original teaching rows, with independent external DEV only."""
    if not isinstance(bundle, dict) or set(bundle) != {"train", "validation", "dev", "manifestSha256", "run"}:
        raise RuntimeError("INVALID_PRODUCTION_RETRY_BUNDLE_FIELDS")
    config = bundle["run"]
    fields = {"steps", "evaluationSteps", "learningRate", "maxContext", "assistantLogitsOnly", "seed", "developmentMode", "runPurpose", "initialAdapterSha256", "initialManifestSha256", "initialRecoveredCheckpoint", "inputRowsSha256"}
    if not isinstance(config, dict) or set(config) != fields or any(type(config[name]) is not int or config[name] != expected for name, expected in (("steps", 64), ("evaluationSteps", 16), ("maxContext", 8192), ("seed", 39119))) or type(config["learningRate"]) not in (int, float) or config["learningRate"] != 2e-5 or config["assistantLogitsOnly"] is not True or config["developmentMode"] != "external" or config["runPurpose"] != "production-continuation-fit" or config["initialManifestSha256"] != PRODUCTION_RETRY_INITIAL_MANIFEST:
        raise RuntimeError("PRODUCTION_RETRY_RECIPE_CHANGED")
    expected_ids = {"train": [f"production-teach-train-{i:03d}" for i in range(1, 49)] + [f"v2-train-{i:03d}" for i in range(1, 97)],
                    "validation": [f"production-teach-validation-{i:03d}" for i in range(1, 9)],
                    "dev": [f"production-teach-dev-{i:03d}" for i in range(1, 5)]}
    hashes = config["inputRowsSha256"]
    if not isinstance(hashes, dict) or set(hashes) != set(expected_ids) or not isinstance(bundle["manifestSha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", bundle["manifestSha256"]):
        raise RuntimeError("INVALID_PRODUCTION_RETRY_DATASET_PINS")
    for split, identifiers in expected_ids.items():
        rows = bundle[split]
        roles = ["system", "user"] if split == "dev" else ["system", "user", "assistant"]
        if not isinstance(rows, list) or any(not isinstance(row, dict) or set(row) != {"id", "messages"} for row in rows) or [row["id"] for row in rows] != identifiers:
            raise RuntimeError("PRODUCTION_RETRY_TEACHING_IDS_CHANGED")
        for row in rows:
            messages = row["messages"]
            if not isinstance(messages, list) or any(not isinstance(message, dict) or set(message) != {"role", "content"} or not isinstance(message["content"], str) or not message["content"] for message in messages) or [message["role"] for message in messages] != roles:
                raise RuntimeError("PRODUCTION_RETRY_MESSAGES_OR_LABEL_LEAKAGE")
        raw = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if hashlib.sha256(raw).hexdigest() != hashes[split]:
            raise RuntimeError("FROZEN_PRODUCTION_RETRY_ROWS_CHANGED")
    initial = config["initialRecoveredCheckpoint"]
    fields = {"artifactKind", "mode", "sourceNotebook", "sourceVersion", "model", "revision", "adapterSha256", "trainerStateSha256", "recoveryReceiptSha256", "recoveryReceiptRaw", "datasetManifestSha256", "sourceFiles", "checkpointDatasetTransport"}
    if not isinstance(initial, dict) or set(initial) != fields or initial["artifactKind"] != "recovered-checkpoint" or initial["mode"] != "production-development-retry" or initial["model"] != MODEL or initial["revision"] != REVISION or initial["adapterSha256"] != config["initialAdapterSha256"] or initial["datasetManifestSha256"] != config["initialManifestSha256"] or initial["recoveryReceiptSha256"] != PRODUCTION_RETRY_RECOVERY_SHA256 or not isinstance(initial["checkpointDatasetTransport"], dict) or initial["checkpointDatasetTransport"].get("receiptSha256") != PRODUCTION_RETRY_TRANSPORT_SHA256:
        raise RuntimeError("PRODUCTION_RETRY_RECOVERY_LINEAGE_CHANGED")
    return bundle


def mounted_recovered_adapter(config, model, revision, root=None, extraction=None):
    """Standalone prepared script embeds audited stdlib-only runner validators."""
    if model != MODEL or revision != REVISION or "initialSummarySha256" in config:
        raise RuntimeError("RECOVERED_ADAPTER_CANNOT_USE_COMPLETED_SUMMARY")
    initial = config["initialRecoveredCheckpoint"]
    if not isinstance(initial, dict) or initial.get("artifactKind") != "recovered-checkpoint" or initial.get("mode") != "production-development-retry" or initial.get("model") != MODEL or initial.get("revision") != REVISION or initial.get("adapterSha256") != config.get("initialAdapterSha256") or initial.get("datasetManifestSha256") != PRODUCTION_RETRY_INITIAL_MANIFEST or initial.get("recoveryReceiptSha256") != PRODUCTION_RETRY_RECOVERY_SHA256 or not isinstance(initial.get("checkpointDatasetTransport"), dict) or initial["checkpointDatasetTransport"].get("receiptSha256") != PRODUCTION_RETRY_TRANSPORT_SHA256:
        raise RuntimeError("PRODUCTION_RETRY_RECOVERY_LINEAGE_CHANGED")
    source = globals().get("SCRIPTRUSH_RECOVERY_VALIDATORS")
    expected = globals().get("SCRIPTRUSH_RECOVERY_VALIDATORS_SHA256")
    if not isinstance(source, str) or not isinstance(expected, str):
        raise RuntimeError("EMBEDDED_RECOVERY_VALIDATORS_REQUIRED")
    raw = zlib.decompress(base64.b64decode(source, validate=True))
    if hashlib.sha256(raw).hexdigest() != expected:
        raise RuntimeError("EMBEDDED_RECOVERY_VALIDATORS_CHANGED")
    import tempfile
    scratch = Path(extraction) if extraction is not None else Path(tempfile.gettempdir()) / "scriptrush-recovered-input" / ("rank-" + os.environ.get("LOCAL_RANK", "0"))
    namespace = {"__name__": "scriptrush_embedded_recovery", "OUT": scratch}
    exec(compile(raw.decode("utf-8"), "<pinned-recovery-validators>", "exec"), namespace)
    namespace["validate_recovery_bundle"](initial)
    namespace["validate_checkpoint_dataset_transport"](initial["checkpointDatasetTransport"], initial)
    return namespace["resolve_adapter"](Path(root) if root is not None else Path("/kaggle/input"), initial)


def checkpoint_safe_trainer(trainer_type):
    """Synchronize the pinned Trainer's rank-local best-checkpoint discovery.

    Transformers 4.51.3 calls _save_checkpoint on every rank. Its rank-zero-only
    save can race another rank's exists() check, leaving that rank with no best
    checkpoint and therefore skipping the conditional end-of-training barrier.
    Keep the original save/rotation and validated best_global_step selection;
    all ranks synchronize before reconstructing the same saved adapter path.
    """
    class CheckpointSafeTrainer(trainer_type):
        def _save_checkpoint(self, model, trial):
            super()._save_checkpoint(model, trial)
            self.accelerator.wait_for_everyone()
            best_step = self.state.best_global_step
            if best_step is None:
                if self.state.best_metric is not None:
                    raise RuntimeError("VALIDATED_BEST_CHECKPOINT_STEP_MISSING")
                return
            if type(best_step) is not int or not 1 <= best_step <= self.state.global_step:
                raise RuntimeError("INVALID_VALIDATED_BEST_CHECKPOINT_STEP")
            best_path = Path(self._get_output_dir(trial=trial)) / f"checkpoint-{best_step}"
            if (not best_path.is_dir() or not (best_path / "adapter_config.json").is_file()
                    or not any((best_path / name).is_file() for name in ("adapter_model.safetensors", "adapter_model.bin"))):
                raise RuntimeError("SHARED_VALIDATED_ADAPTER_CHECKPOINT_MISSING")
            self.state.best_model_checkpoint = str(best_path)

    return CheckpointSafeTrainer


def write_json_atomic(path, value):
    """Keep a complete previous receipt if serialization or replacement fails."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def selected_training_lineage(config, steps, best_step):
    """Distinguish fitting progress from the earlier best exported adapter."""
    if type(steps) is not int or type(best_step) is not int or not 1 <= best_step <= steps:
        raise RuntimeError("INVALID_SELECTED_CHECKPOINT_STEP")
    selected = {"selectedCheckpointStep": best_step}
    if "initialRecoveredCheckpoint" in config:
        selected.update(initialProductionSteps=32, additionalProductionSteps=steps,
                        cumulativeProductionSteps=32 + steps, selectedCumulativeProductionSteps=32 + best_step,
                        optimizerStateResumed=False)
    return selected


def persist_fit_summary(output_directory, summary):
    """Commit fitting proof before optional autoregressive development work."""
    status = "external-pending" if summary.get("developmentMode") == "external" else "skipped" if summary.get("developmentSkipped", False) else "pending"
    value = {**summary, "fitStatus": "complete", "developmentStatus": status}
    output_directory = Path(output_directory)
    # The separate fit receipt remains immutable when the DEV summary changes.
    write_json_atomic(output_directory / "fit-summary.json", value)
    write_json_atomic(output_directory / "training-summary.json", value)
    return value


def development_policy(config):
    """Only an explicitly diagnostic pipeline smoke may omit the DEV outputs."""
    skip = config.get("skipDevelopment", False)
    if not isinstance(skip, bool):
        raise RuntimeError("INVALID_SKIP_DEVELOPMENT_FLAG")
    if skip and config.get("runPurpose") != "pipeline-smoke":
        raise RuntimeError("DEVELOPMENT_SKIP_REQUIRES_DIAGNOSTIC_PIPELINE_SMOKE")
    mode = config.get("developmentMode", "inline")
    if mode not in ("inline", "external") or (mode == "external" and (skip or config.get("runPurpose") != "production-continuation-fit")) or (config.get("runPurpose") == "production-continuation-fit" and mode != "external"):
        raise RuntimeError("INVALID_EXTERNAL_DEVELOPMENT_POLICY")
    return skip


def checkpoint(phase, **fields):
    if int(os.environ.get("RANK", "0")) != 0:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    value = {"phase": phase, "time": time.time(), **fields}
    (OUT / "progress.json").write_text(json.dumps(value), encoding="utf-8")
    print(json.dumps(value), flush=True)


def install():
    dependencies = {"transformers": "4.51.3", "peft": "0.15.2", "accelerate": "1.6.0", "bitsandbytes": "0.45.5"}
    missing = []
    for name, version in dependencies.items():
        try:
            installed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            installed = None
        if installed != version:
            missing.append(f"{name}=={version}")
    if missing:
        result = subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", *missing], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError("DEPENDENCY_INSTALL_FAILED")
    return dependencies


def main():
    start = time.perf_counter()
    bundle = json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_DATA_BUNDLE)))
    config = bundle.get("run", {})
    skip_development = development_policy(config)
    external_development = config.get("developmentMode") == "external"
    if "initialRecoveredCheckpoint" in config or external_development:
        validate_production_retry_bundle(bundle)
    seed = config.get("seed", SEED)
    if type(seed) is not int or not 1 <= seed < 2**31:
        raise RuntimeError("INVALID_TRAINING_SEED")
    os.environ.update({"HF_HUB_DISABLE_TELEMETRY": "1", "WANDB_DISABLED": "true", "TOKENIZERS_PARALLELISM": "false", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
    checkpoint("dependencies")
    dependencies = install()
    import torch
    from torch.utils.data import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, set_seed
    from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training

    if not torch.cuda.is_available():
        raise RuntimeError("GPU_NOT_AVAILABLE")
    local_rank = int(os.environ.get("LOCAL_RANK", "0"))
    world_size = int(os.environ.get("WORLD_SIZE", "1"))
    torch.cuda.set_device(local_rank)
    set_seed(seed)
    random.seed(seed)
    steps = int(config.get("steps", STEPS))
    max_context = int(config.get("maxContext", MAX_CONTEXT))
    assistant_logits_only = config.get("assistantLogitsOnly", False)
    learning_rate = float(config.get("learningRate", 1e-4))
    evaluation_steps = int(config.get("evaluationSteps", min(32, steps)))
    if steps < 1 or steps > 256:
        raise RuntimeError("INVALID_BOUNDED_TRAINING_STEPS")
    if not 4608 <= max_context <= 8192 or not 0 < learning_rate <= 1e-4 or not isinstance(assistant_logits_only, bool):
        raise RuntimeError("INVALID_BOUNDED_TRAINING_CONFIG")
    if not 1 <= evaluation_steps <= steps or steps % evaluation_steps:
        raise RuntimeError("INVALID_CHECKPOINT_INTERVAL")
    if "test" in bundle:
        raise RuntimeError("FINAL_TEST_MUST_REMAIN_LOCAL_DURING_DEVELOPMENT")
    if any(any(message["role"] == "assistant" for message in row["messages"]) for row in bundle["dev"]):
        raise RuntimeError("DEVELOPMENT_ANSWER_LEAKAGE")
    initial_adapter = mounted_adapter(config, MODEL, REVISION) if config.get("initialAdapterSha256") else None
    checkpoint("load_model", gpu=torch.cuda.get_device_name(local_rank), acceleratorCount=world_size, model=MODEL, revision=REVISION)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
    model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float16,
        quantization_config=quantization, device_map={"": local_rank}, attn_implementation="sdpa", trust_remote_code=False)
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})
    # These large frozen matrices need no FP32 optimizer state. Keep layer norms
    # in FP32, but avoid spending several GB on frozen vocabulary matrices.
    model.get_input_embeddings().to(dtype=torch.float16)
    model.get_output_embeddings().to(dtype=torch.float16)
    if initial_adapter:
        model = PeftModel.from_pretrained(model, str(initial_adapter), is_trainable=True)
    else:
        model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            bias="none", task_type="CAUSAL_LM", revision=REVISION))
    # Trainer supplies mixed precision during fitting. Generation also needs
    # explicit autocast because the frozen vocabulary head is FP16 while the
    # stabilized layer norms are FP32. Fail here before spending a training run.
    model.eval()
    smoke = tokenizer.apply_chat_template(bundle["dev"][0]["messages"], tokenize=True,
        add_generation_prompt=True, return_tensors="pt").to(model.device)
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
        smoke_output = model.generate(smoke, attention_mask=torch.ones_like(smoke), max_new_tokens=2,
            do_sample=False, use_cache=True, logits_to_keep=1, pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id)
    if smoke_output.shape[1] <= smoke.shape[1]:
        raise RuntimeError("PRETRAINING_GENERATION_SMOKE_FAILED")
    checkpoint("generation_smoke_passed", generatedTokens=smoke_output.shape[1] - smoke.shape[1])
    del smoke, smoke_output
    torch.cuda.empty_cache()
    model.train()
    model.config.use_cache = False
    model.enable_input_require_grads()
    original_forward = model.forward

    def training_forward(self, input_ids=None, attention_mask=None, labels=None, **kwargs):
        kwargs.pop("num_items_in_batch", None)
        if labels is not None and assistant_logits_only:
            span = assistant_logit_span(labels)
            kwargs["logits_to_keep"] = span
            labels = labels[:, -span:]
        outputs = original_forward(input_ids=input_ids, attention_mask=attention_mask, **kwargs)
        if labels is None:
            return outputs
        # Returning only the scalar loss also avoids Accelerate upcasting the
        # complete 151k-vocabulary logits (including masked prompt positions).
        return {"loss": masked_causal_loss(outputs.logits, labels)}

    model.forward = types.MethodType(training_forward, model)

    def encode(rows):
        encoded, skipped, lengths = [], [], []
        for row in rows:
            prompt = tokenizer.apply_chat_template(row["messages"][:-1], tokenize=True, add_generation_prompt=True)
            full = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=False)
            if full[:len(prompt)] != prompt:
                raise RuntimeError("CHAT_TEMPLATE_PREFIX_MISMATCH")
            if len(full) > max_context:
                skipped.append(row["id"])
                continue
            labels = [-100] * len(prompt) + full[len(prompt):]
            if not any(label != -100 for label in labels):
                raise RuntimeError("EMPTY_ASSISTANT_LABELS")
            encoded.append({"input_ids": full, "attention_mask": [1] * len(full), "labels": labels})
            lengths.append(len(full))
        return encoded, skipped, lengths

    train_rows, train_skipped, train_lengths = encode(bundle["train"])
    val_rows, val_skipped, _ = encode(bundle["validation"])
    if train_skipped or val_skipped or len(train_rows) < 128 or not val_rows:
        raise RuntimeError("DATASET_TOO_LONG_OR_INSUFFICIENT")

    class Rows(Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, index): return self.rows[index]

    def collate(rows):
        size = max(len(row["input_ids"]) for row in rows)
        return {name: torch.tensor([row[name] + [pad] * (size - len(row[name])) for row in rows], dtype=torch.long)
                for name, pad in (("input_ids", tokenizer.pad_token_id), ("attention_mask", 0), ("labels", -100))}

    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    checkpoint("training", examples=len(train_rows), steps=steps, trainableParameters=trainable,
        maxSequenceTokens=max(train_lengths), memoryAllocatedGb=round(torch.cuda.memory_allocated() / 2**30, 3))
    args = TrainingArguments(output_dir=str(OUT / "training"), max_steps=steps, per_device_train_batch_size=1,
        gradient_accumulation_steps=4 // world_size, learning_rate=learning_rate, warmup_steps=min(8, steps // 4), lr_scheduler_type="cosine",
        fp16=True, gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=4, eval_strategy="steps", eval_steps=evaluation_steps, save_strategy="steps", save_steps=evaluation_steps,
        save_total_limit=1, save_only_model=True, load_best_model_at_end=True, metric_for_best_model="eval_loss",
        greater_is_better=False, report_to=[], optim="adamw_torch", seed=seed, data_seed=seed,
        remove_unused_columns=False, dataloader_num_workers=0, disable_tqdm=True,
        per_device_eval_batch_size=1, label_names=["labels"], ddp_find_unused_parameters=False, prediction_loss_only=True)
    trainer = checkpoint_safe_trainer(Trainer)(model=model, args=args, train_dataset=Rows(train_rows), eval_dataset=Rows(val_rows[:8]), data_collator=collate)
    trainer.model_accepts_loss_kwargs = False
    before_training = time.perf_counter()
    result = trainer.train()
    training_seconds = time.perf_counter() - before_training
    validation = trainer.evaluate()
    trainer.accelerator.wait_for_everyone()
    if not trainer.is_world_process_zero():
        return
    model.forward = original_forward
    model.save_pretrained(OUT / "adapter", safe_serialization=True)
    tokenizer.save_pretrained(OUT / "tokenizer")
    summary = {"model": MODEL, "revision": REVISION, "method": "QLoRA-NF4", "seed": seed, "steps": steps,
        "maxContext": max_context, "assistantLogitsOnly": assistant_logits_only, "learningRate": learning_rate,
        "evaluationSteps": evaluation_steps,
        "initialAdapterSha256": config.get("initialAdapterSha256"),
        "initialSummarySha256": config.get("initialSummarySha256"), "initialManifestSha256": config.get("initialManifestSha256"),
        **({"initialRecoveredCheckpoint": config["initialRecoveredCheckpoint"]}
           if "initialRecoveredCheckpoint" in config else {}),
        **selected_training_lineage(config, steps, trainer.state.best_global_step),
        "gradientAccumulationPerDevice": 4 // world_size, "acceleratorCount": world_size, "effectiveBatchSize": 4,
        "trainableParameters": trainable, "trainExamples": len(train_rows),
        "trainEpochs": steps * 4 / len(train_rows), "trainOversizeSkipped": train_skipped,
        "validationExamples": min(8, len(val_rows)), "validationLoss": validation.get("eval_loss"),
        "bestValidationLoss": trainer.state.best_metric, "selectedCheckpoint": trainer.state.best_model_checkpoint,
        "trainingSeconds": round(training_seconds, 2), "trainingLoss": result.training_loss,
        "loss": "Shifted assistant-only token CE, chunked before float32 upcast; per-example mean with gradient accumulation",
        "developmentIds": [row["id"] for row in bundle["dev"]], "maxNewTokens": MAX_NEW_TOKENS,
        "datasetManifestSha256": bundle["manifestSha256"],
        "adapterSha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (OUT / "adapter").iterdir() if path.is_file()},
        "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "developmentSkipped": skip_development, "developmentMode": config.get("developmentMode", "inline"),
        "diagnosticOnly": config.get("runPurpose") == "pipeline-smoke", "productionPromotionEligible": False,
        "runPurpose": config.get("runPurpose", "development-training"),
        "totalSeconds": round(time.perf_counter() - start, 2), "gpu": torch.cuda.get_device_name(0),
        "peakMemoryGb": round(torch.cuda.max_memory_allocated() / 2**30, 3), "torch": torch.__version__, "packages": dependencies,
        "scope": "Development only; final held-out test remains local; no public serving from Kaggle."}
    summary = persist_fit_summary(OUT, summary)
    checkpoint("fit_complete", **summary)
    if skip_development or external_development:
        checkpoint("complete", **summary)
        return
    model.gradient_checkpointing_disable()
    model.config.use_cache = True
    model.eval()
    torch.cuda.empty_cache()
    checkpoint("development_comparison", cases=len(bundle["dev"]))
    with (OUT / "predictions.jsonl").open("w", encoding="utf-8") as handle:
        for index, row in enumerate(bundle["dev"]):
            inputs = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True, return_tensors="pt").to(model.device)
            for variant in (("base", "specialist") if index % 2 == 0 else ("specialist", "base")):
                before = time.perf_counter()
                record = {"id": row["id"], "variant": variant, "inputTokens": inputs.shape[1],
                    "model": MODEL, "revision": REVISION, "origin": "model-inference"}
                try:
                    scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
                    with scope, torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
                        generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=MAX_NEW_TOKENS,
                            do_sample=False, use_cache=True, pad_token_id=tokenizer.pad_token_id,
                            eos_token_id=tokenizer.eos_token_id, max_time=240, logits_to_keep=1)
                    tokens = generated[0, inputs.shape[1]:]
                    record.update(output=tokenizer.decode(tokens, skip_special_tokens=True), outputTokens=len(tokens),
                        stoppedWithEos=bool(len(tokens) and tokens[-1].item() == tokenizer.eos_token_id))
                except Exception as error:
                    record.update(output="", error=type(error).__name__, errorReason=str(error)[:300])
                    torch.cuda.empty_cache()
                record["durationMs"] = round((time.perf_counter() - before) * 1000)
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                handle.flush()
                checkpoint("development_comparison", case=index + 1, variant=variant, outputTokens=record.get("outputTokens", 0))
    summary.update(developmentStatus="complete", totalSeconds=round(time.perf_counter() - start, 2),
                   peakMemoryGb=round(torch.cuda.max_memory_allocated() / 2**30, 3))
    write_json_atomic(OUT / "training-summary.json", summary)
    checkpoint("complete", **summary)


if __name__ == "__main__":
    try:
        # Kaggle commonly supplies two T4s. Use both for fitting, while keeping
        # the effective batch and optimizer steps identical to a single GPU.
        if "LOCAL_RANK" not in os.environ:
            install()
            import torch
            count = min(2, torch.cuda.device_count())
            if count == 2:
                result = subprocess.run([sys.executable, "-m", "torch.distributed.run", "--standalone", "--nproc_per_node=2", __file__])
                if result.returncode:
                    raise RuntimeError("DISTRIBUTED_WORKER_FAILED")
            else:
                main()
        else:
            main()
    except Exception as error:
        checkpoint("failed", errorType=type(error).__name__, reason=str(error)[:300])
        traceback.print_exc()
        raise
