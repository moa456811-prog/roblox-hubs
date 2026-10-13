"""Private QLoRA development run. Final test answers are never uploaded."""
import base64
import contextlib
import hashlib
import importlib.metadata
import json
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
    set_seed(SEED)
    random.seed(SEED)
    bundle = json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_DATA_BUNDLE)))
    config = bundle.get("run", {})
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
    initial_adapter = mounted_adapter(config, MODEL, REVISION) if config.get("initialAdapterSha256") else None
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
        greater_is_better=False, report_to=[], optim="adamw_torch", seed=SEED, data_seed=SEED,
        remove_unused_columns=False, dataloader_num_workers=0, disable_tqdm=True,
        per_device_eval_batch_size=1, label_names=["labels"], ddp_find_unused_parameters=False, prediction_loss_only=True)
    trainer = Trainer(model=model, args=args, train_dataset=Rows(train_rows), eval_dataset=Rows(val_rows[:8]), data_collator=collate)
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
    summary = {"model": MODEL, "revision": REVISION, "method": "QLoRA-NF4", "seed": SEED, "steps": steps,
        "maxContext": max_context, "assistantLogitsOnly": assistant_logits_only, "learningRate": learning_rate,
        "evaluationSteps": evaluation_steps,
        "initialAdapterSha256": config.get("initialAdapterSha256"),
        "initialSummarySha256": config.get("initialSummarySha256"), "initialManifestSha256": config.get("initialManifestSha256"),
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
        "totalSeconds": round(time.perf_counter() - start, 2), "gpu": torch.cuda.get_device_name(0),
        "peakMemoryGb": round(torch.cuda.max_memory_allocated() / 2**30, 3), "torch": torch.__version__, "packages": dependencies,
        "scope": "Development only; final held-out test remains local; no public serving from Kaggle."}
    (OUT / "training-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
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
