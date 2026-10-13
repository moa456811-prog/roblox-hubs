"""Private, bounded LoRA pilot. Embedded inputs contain no credentials or test answers."""
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
import zlib

MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
REVISION = "2e1fd397ee46e1388853d2af2c993145b0f1098a"
OUT = Path("/kaggle/working/scriptrush-specialist")
MAX_CONTEXT = 6144
MAX_NEW_TOKENS = 3072
STEPS = 16
SEED = 29017


def checkpoint(phase, **fields):
    OUT.mkdir(parents=True, exist_ok=True)
    value = {"phase": phase, "time": time.time(), **fields}
    (OUT / "progress.json").write_text(json.dumps(value), encoding="utf-8")
    print(json.dumps(value), flush=True)


def main():
    start = time.perf_counter()
    checkpoint("dependencies")
    os.environ.update({"HF_HUB_DISABLE_TELEMETRY": "1", "WANDB_DISABLED": "true", "TOKENIZERS_PARALLELISM": "false", "CUDA_VISIBLE_DEVICES": "0"})
    dependencies = {"transformers": "4.51.3", "peft": "0.15.2", "accelerate": "1.6.0"}
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

    import torch
    from torch.utils.data import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, set_seed
    from peft import LoraConfig, get_peft_model

    if not torch.cuda.is_available():
        raise RuntimeError("GPU_NOT_AVAILABLE")
    set_seed(SEED)
    random.seed(SEED)
    bundle = json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_DATA_BUNDLE)))
    if any(any(message["role"] == "assistant" for message in row["messages"]) for row in bundle["test"]):
        raise RuntimeError("TEST_ANSWER_LEAKAGE")
    checkpoint("load_model", gpu=torch.cuda.get_device_name(0), model=MODEL, revision=REVISION)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float16, attn_implementation="sdpa", trust_remote_code=False)
    model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "o_proj"], bias="none", task_type="CAUSAL_LM"))
    model.config.use_cache = False
    model.enable_input_require_grads()

    def encode(rows):
        encoded = []
        skipped = 0
        for row in rows:
            messages = row["messages"]
            prompt = tokenizer.apply_chat_template(messages[:-1], tokenize=True, add_generation_prompt=True)
            full = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)
            if full[:len(prompt)] != prompt:
                raise RuntimeError("CHAT_TEMPLATE_PREFIX_MISMATCH")
            if len(full) > MAX_CONTEXT:
                skipped += 1
                continue
            labels = [-100] * len(prompt) + full[len(prompt):]
            if not any(label != -100 for label in labels):
                raise RuntimeError("EMPTY_ASSISTANT_LABELS")
            encoded.append({"input_ids": full, "attention_mask": [1] * len(full), "labels": labels})
        return encoded, skipped

    train_rows, train_skipped = encode(bundle["train"])
    val_rows, val_skipped = encode(bundle["validation"])
    if len(train_rows) < 32 or not val_rows:
        raise RuntimeError("INSUFFICIENT_NONTRUNCATED_EXAMPLES")

    class Rows(Dataset):
        def __init__(self, rows):
            self.rows = rows
        def __len__(self):
            return len(self.rows)
        def __getitem__(self, index):
            return self.rows[index]

    def collate(rows):
        size = max(len(row["input_ids"]) for row in rows)
        return {name: torch.tensor([row[name] + [pad] * (size - len(row[name])) for row in rows], dtype=torch.long)
                for name, pad in (("input_ids", tokenizer.pad_token_id), ("attention_mask", 0), ("labels", -100))}

    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    checkpoint("training", examples=len(train_rows), skippedOversize=train_skipped, trainableParameters=trainable, steps=STEPS)
    args = TrainingArguments(output_dir=str(OUT / "training"), max_steps=STEPS, per_device_train_batch_size=1,
        gradient_accumulation_steps=4, learning_rate=1e-4, warmup_steps=2, lr_scheduler_type="cosine",
        fp16=True, gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=4, save_strategy="no", report_to=[], optim="adamw_torch", seed=SEED,
        data_seed=SEED, remove_unused_columns=False, dataloader_num_workers=0, disable_tqdm=True,
        per_device_eval_batch_size=1, label_names=["labels"])
    trainer = Trainer(model=model, args=args, train_dataset=Rows(train_rows), data_collator=collate)
    train_start = time.perf_counter()
    result = trainer.train()
    training_seconds = time.perf_counter() - train_start
    validation = trainer.evaluate(eval_dataset=Rows(val_rows[:4]))
    model.save_pretrained(OUT / "adapter", safe_serialization=True)
    tokenizer.save_pretrained(OUT / "tokenizer")
    model.gradient_checkpointing_disable()
    model.config.use_cache = True
    model.eval()
    torch.cuda.empty_cache()

    checkpoint("blind_comparison", cases=len(bundle["test"]))
    outputs = OUT / "predictions.jsonl"
    # No teacher, test target, repair, JSON postprocessing or unequal prompt is used.
    with outputs.open("w", encoding="utf-8") as handle:
        for index, row in enumerate(bundle["test"]):
            inputs = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True, return_tensors="pt").to(model.device)
            variants = ("base", "specialist") if index % 2 == 0 else ("specialist", "base")
            for variant in variants:
                before = time.perf_counter()
                record = {"id": row["id"], "variant": variant}
                try:
                    scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
                    with scope, torch.inference_mode():
                        generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=MAX_NEW_TOKENS,
                            do_sample=False, use_cache=True, pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id, max_time=100)
                    tokens = generated[0, inputs.shape[1]:]
                    record.update(output=tokenizer.decode(tokens, skip_special_tokens=True), outputTokens=len(tokens),
                        stoppedWithEos=bool(len(tokens) and tokens[-1].item() == tokenizer.eos_token_id))
                except Exception as error:
                    record.update(output="", error=type(error).__name__)
                    torch.cuda.empty_cache()
                record["durationMs"] = round((time.perf_counter() - before) * 1000)
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                handle.flush()
                checkpoint("blind_comparison", case=index + 1, variant=variant, outputTokens=record.get("outputTokens", 0))

    adapter_hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (OUT / "adapter").iterdir() if path.is_file()}
    summary = {"model": MODEL, "revision": REVISION, "method": "LoRA", "seed": SEED, "steps": STEPS,
        "trainableParameters": trainable, "trainExamples": len(train_rows), "trainOversizeSkipped": train_skipped,
        "validationExamples": min(4, len(val_rows)), "validationOversizeSkipped": val_skipped,
        "trainingSeconds": round(training_seconds, 2), "trainingLoss": result.training_loss, "validationLoss": validation.get("eval_loss"),
        "blindTestIds": [row["id"] for row in bundle["test"]], "maxNewTokens": MAX_NEW_TOKENS,
        "datasetManifestSha256": bundle["manifestSha256"], "adapterSha256": adapter_hashes,
        "totalSeconds": round(time.perf_counter() - start, 2), "gpu": torch.cuda.get_device_name(0),
        "torch": torch.__version__, "packages": dependencies,
        "scope": "Private synthetic composition pilot; no live-game or API-provider superiority claim."}
    (OUT / "training-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    checkpoint("complete", **summary)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        checkpoint("failed", errorType=type(error).__name__, reason=str(error)[:300])
        traceback.print_exc()
        raise
