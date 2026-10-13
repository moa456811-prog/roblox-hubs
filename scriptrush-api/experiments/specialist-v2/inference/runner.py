"""Private Kaggle inference only; no optimizer, training rows, labels or credential.

Prepared as one script by prepare.py, with SCRIPTRUSH_INFERENCE_BUNDLE injected.
Two subprocesses load independent NF4 model copies on the two T4s, then execute
disjoint cases with adapter off/on. No DDP or inter-GPU collectives are used.
Outputs are untouched decoded model strings, not filled or repaired compositions.
"""
import base64
import contextlib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import traceback
import zlib

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
SOURCE_NOTEBOOK = "sciptrush/scriptrush-specialist-v2-1940b014"
V2_TRAINING_MANIFEST_SHA256 = "73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053"
MAX_INPUT_TOKENS = 16384
MAX_NEW_TOKENS = 4096
MAX_SECONDS = 240
SEED = 39107
OUT = Path("/kaggle/working/scriptrush-specialist-v2-inference")
DEPENDENCIES = {"transformers": "4.51.3", "peft": "0.15.2", "accelerate": "1.6.0", "bitsandbytes": "0.45.5"}
DEV_IDS = ("v2-dev-001", "v2-dev-005", "v2-dev-012", "v2-dev-013")


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


def file_digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def clean_messages(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("EXACTLY_TWO_INFERENCE_MESSAGES_REQUIRED")
    if any(not isinstance(message, dict) or set(message) != {"role", "content"} for message in value):
        raise ValueError("UNEXPECTED_MESSAGE_FIELDS")
    if [message["role"] for message in value] != ["system", "user"]:
        raise ValueError("ASSISTANT_AND_TOOL_MESSAGES_FORBIDDEN")
    if any(not isinstance(message["content"], str) or not message["content"] for message in value):
        raise ValueError("EMPTY_OR_NONSTRING_INFERENCE_CONTENT")
    return [{"role": message["role"], "content": message["content"]} for message in value]


def allowed_source_notebook(value):
    return isinstance(value, str) and (value == SOURCE_NOTEBOOK or re.fullmatch(r"sciptrush/scriptrush-v2-production-[a-z0-9][a-z0-9-]{0,63}", value) is not None)


def validate_bundle(bundle):
    allowed = {"formatVersion", "sourceNotebook", "model", "revision", "adapterSha256", "adapterSummarySha256", "datasetManifestSha256", "sourceFiles", "cases", "limits"}
    if not isinstance(bundle, dict) or set(bundle) not in (allowed, allowed | {"mode"}):
        raise ValueError("UNEXPECTED_BUNDLE_FIELDS_OR_LABELS")
    mode = bundle.get("mode", "final")
    if mode not in ("final", "development-retry"):
        raise ValueError("UNEXPECTED_INFERENCE_MODE")
    if bundle["formatVersion"] != 1 or not allowed_source_notebook(bundle["sourceNotebook"]) or bundle["model"] != MODEL or bundle["revision"] != REVISION:
        raise ValueError("UNEXPECTED_SOURCE_MODEL_OR_NOTEBOOK")
    if any(not isinstance(bundle[name], str) or not re.fullmatch(r"[0-9a-f]{64}", bundle[name]) for name in ("datasetManifestSha256", "adapterSummarySha256")):
        raise ValueError("INVALID_PINNED_TRAINING_OR_SUMMARY_HASH")
    if bundle["limits"] != {"maxInputTokens": MAX_INPUT_TOKENS, "maxNewTokens": MAX_NEW_TOKENS, "maxSeconds": MAX_SECONDS}:
        raise ValueError("INFERENCE_BUDGET_CHANGED")
    hashes = bundle["adapterSha256"]
    if not isinstance(hashes, dict) or "adapter_config.json" not in hashes or "adapter_model.safetensors" not in hashes:
        raise ValueError("INCOMPLETE_ADAPTER_HASH_MANIFEST")
    for name, value in hashes.items():
        if not isinstance(name, str) or Path(name).name != name or not re.fullmatch(r"[a-zA-Z0-9_.-]+", name) or not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ValueError("INVALID_ADAPTER_HASH_MANIFEST")
    cases = bundle["cases"]
    if not isinstance(cases, list) or not cases or len(cases) > 20:
        raise ValueError("INVALID_CASE_BUDGET")
    ids = set()
    groups = {"dev": 0} if mode == "development-retry" else {"test": 0, "production": 0}
    for row in cases:
        if not isinstance(row, dict) or set(row) != {"id", "group", "messages", "promptSha256", "preparedInputTokens"}:
            raise ValueError("CASE_LABEL_OR_UNEXPECTED_FIELD")
        if not isinstance(row["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,100}", row["id"]) or row["id"] in ids:
            raise ValueError("INVALID_OR_DUPLICATE_CASE_ID")
        ids.add(row["id"])
        if row["group"] not in groups:
            raise ValueError("INVALID_CASE_GROUP")
        groups[row["group"]] += 1
        messages = clean_messages(row["messages"])
        if digest(compact(messages)) != row["promptSha256"]:
            raise ValueError("PROMPT_HASH_MISMATCH")
        count = row["preparedInputTokens"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 1 or count > MAX_INPUT_TOKENS:
            raise ValueError("PREPARED_TOKEN_BUDGET_EXCEEDED")
    if mode == "development-retry":
        if tuple(row["id"] for row in cases) != DEV_IDS or groups != {"dev": 4} or bundle["sourceNotebook"] != SOURCE_NOTEBOOK or bundle["datasetManifestSha256"] != V2_TRAINING_MANIFEST_SHA256:
            raise ValueError("ONLY_FOUR_ORIGINAL_UTILITY_DEVELOPMENT_CASES_ALLOWED")
    elif groups["test"] != 12 or groups["production"] > 8:
        raise ValueError("TWELVE_FINAL_TESTS_AND_AT_MOST_EIGHT_PRODUCTION_CASES_REQUIRED")
    return bundle


def assignment(cases, worker, count):
    if count not in (1, 2) or worker not in range(count):
        raise ValueError("INVALID_WORKER_ASSIGNMENT")
    return [(index, row) for index, row in enumerate(cases) if index % count == worker]


def variant_order(index, count):
    # Alternate within each independent worker, not merely by global parity
    # (global parity would give one T4 only base-first cases).
    return ("base", "specialist") if (index // count) % 2 == 0 else ("specialist", "base")


def progress(phase, worker=None, **fields):
    OUT.mkdir(parents=True, exist_ok=True)
    value = {"phase": phase, "time": time.time(), **fields}
    if worker is not None:
        value["worker"] = worker
    path = OUT / ("progress.json" if worker is None else f"progress-worker-{worker}.json")
    path.write_text(json.dumps(value), encoding="utf-8")
    print(compact(value), flush=True)


def diagnostic(error):
    """Useful stack locations and fixed fault classes; never exception text/locals."""
    text = str(error).lower()
    if "out of memory" in text:
        code = "CUDA_OUT_OF_MEMORY"
    elif any(value in text for value in ("same dtype", "same type", "expected scalar type", "mat1 and mat2")):
        code = "DTYPE_MISMATCH"
    elif "same device" in text or "expected all tensors to be on" in text:
        code = "DEVICE_MISMATCH"
    elif "device-side assert" in text:
        code = "CUDA_DEVICE_ASSERT"
    elif "nccl" in text or "collective" in text:
        code = "DISTRIBUTED_COLLECTIVE"
    else:
        code = "INFERENCE_FAILURE"
    frames = [{"file": Path(frame.filename).name, "function": frame.name, "line": frame.lineno}
              for frame in traceback.extract_tb(error.__traceback__)[-24:]]
    return {"errorType": type(error).__name__, "errorCode": code, "traceback": frames}


def smoke_generation(model, tokenizer, torch, worker, count, mode):
    """A tiny forward and cache-enabled generation must pass before development."""
    tokens = tokenizer.apply_chat_template([{"role": "system", "content": "Return JSON."}, {"role": "user", "content": "{}"}], tokenize=True, add_generation_prompt=True)
    inputs = torch.tensor([tokens], dtype=torch.long, device=model.device)
    for variant in ("base", "specialist"):
        scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
        with scope, torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
            result = model(input_ids=inputs, attention_mask=torch.ones_like(inputs), use_cache=False, logits_to_keep=1)
            if not bool(torch.isfinite(result.logits).all()):
                raise RuntimeError("NONFINITE_SMOKE_LOGITS")
            del result
            generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=2, do_sample=False, use_cache=True,
                pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id, max_time=30, logits_to_keep=1)
        if generated.shape[1] <= inputs.shape[1]:
            raise RuntimeError("EMPTY_SMOKE_GENERATION")
        torch.cuda.synchronize(worker)
        progress("smoke_variant_passed", worker, variant=variant, inputTokens=len(tokens), outputTokens=generated.shape[1] - inputs.shape[1])
        del generated
    del inputs
    torch.cuda.empty_cache()
    (OUT / f"smoke-worker-{worker}.json").write_text(compact({"worker": worker, "passed": True, "autocast": "cuda-float16"}), encoding="utf-8")
    if mode == "development-retry":
        # Both independent GPUs must clear their small diagnostic before either
        # spends time on a full developer case. No DDP/collective is constructed.
        deadline = time.monotonic() + 900
        while not all((OUT / f"smoke-worker-{index}.json").is_file() for index in range(count)):
            if any((OUT / f"failure-worker-{index}.json").is_file() for index in range(count)):
                raise RuntimeError("ANOTHER_GPU_SMOKE_FAILED")
            if time.monotonic() > deadline:
                raise RuntimeError("INDEPENDENT_GPU_SMOKE_BARRIER_TIMEOUT")
            time.sleep(0.25)


def install():
    missing = []
    for name, version in DEPENDENCIES.items():
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


def find_adapter(root, expected_hashes, expected_summary_hash=None, expected_training_manifest=None):
    matches = []
    for config in Path(root).glob("**/adapter/adapter_config.json"):
        directory = config.parent
        if not all((directory / name).is_file() and file_digest(directory / name) == value for name, value in expected_hashes.items()):
            continue
        if expected_summary_hash is not None:
            summary_file = directory.parent / "training-summary.json"
            if not summary_file.is_file() or file_digest(summary_file) != expected_summary_hash:
                continue
            summary = json.loads(summary_file.read_text(encoding="utf-8"))
            if summary.get("model") != MODEL or summary.get("revision") != REVISION or summary.get("datasetManifestSha256") != expected_training_manifest or summary.get("adapterSha256") != expected_hashes:
                continue
        matches.append(directory)
    if len(matches) != 1:
        raise RuntimeError("EXACTLY_ONE_HASH_VERIFIED_SOURCE_ADAPTER_REQUIRED")
    config = json.loads((matches[0] / "adapter_config.json").read_text(encoding="utf-8"))
    if config.get("base_model_name_or_path") != MODEL or config.get("peft_type") != "LORA":
        raise RuntimeError("UNEXPECTED_ADAPTER_MODEL_OR_TYPE")
    return matches[0]


def loaded_bundle():
    return validate_bundle(json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_INFERENCE_BUNDLE))))


def worker_main(worker, count):
    started = time.perf_counter()
    bundle = loaded_bundle()
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, set_seed
    from peft import PeftModel, prepare_model_for_kbit_training
    torch.cuda.set_device(worker)
    set_seed(SEED + worker)
    adapter = find_adapter("/kaggle/input", bundle["adapterSha256"], bundle["adapterSummarySha256"], bundle["datasetManifestSha256"])
    progress("load_model", worker, gpu=torch.cuda.get_device_name(worker), model=MODEL, revision=REVISION)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    encoded = {}
    counts = []
    for row in bundle["cases"]:
        tokens = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True)
        if len(tokens) > MAX_INPUT_TOKENS:
            raise RuntimeError("INPUT_TOKEN_BUDGET_EXCEEDED_NO_TRUNCATION")
        if len(tokens) != row["preparedInputTokens"]:
            raise RuntimeError("PREPARED_AND_RUNTIME_TOKENIZER_COUNTS_DIFFER")
        encoded[row["id"]] = tokens
        counts.append({"id": row["id"], "inputTokens": len(tokens)})
    progress("token_budget_verified", worker, cases=len(counts), maxInputTokens=max(row["inputTokens"] for row in counts))
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
    model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float16, quantization_config=quantization, device_map={"": worker}, attn_implementation="sdpa", trust_remote_code=False)
    if MAX_INPUT_TOKENS + MAX_NEW_TOKENS > model.config.max_position_embeddings:
        raise RuntimeError("MODEL_CONTEXT_BUDGET_EXCEEDED")
    # Match training's frozen norm/matrix dtypes, without enabling gradients or
    # gradient checkpointing. No Trainer or optimizer is constructed.
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=False)
    model.get_input_embeddings().to(dtype=torch.float16)
    model.get_output_embeddings().to(dtype=torch.float16)
    model = PeftModel.from_pretrained(model, str(adapter), is_trainable=False)
    model.requires_grad_(False)
    model.config.use_cache = True
    model.eval()
    smoke_generation(model, tokenizer, torch, worker, count, bundle.get("mode", "final"))
    assigned = assignment(bundle["cases"], worker, count)
    output = OUT / f"predictions-worker-{worker}.jsonl"
    progress("inference", worker, cases=len(assigned), variantsPerCase=2)
    with output.open("w", encoding="utf-8") as handle:
        for global_index, row in assigned:
            inputs = torch.tensor([encoded[row["id"]]], dtype=torch.long, device=model.device)
            for position, variant in enumerate(variant_order(global_index, count)):
                record = {"id": row["id"], "group": row["group"], "variant": variant, "origin": "model-inference", "model": MODEL,
                          "revision": REVISION, "quantization": "NF4-double-FP16", "worker": worker, "variantPosition": position,
                          "promptSha256": row["promptSha256"], "inputTokens": inputs.shape[1], "sourceNotebook": bundle["sourceNotebook"],
                          "adapterManifestSha256": digest(compact(bundle["adapterSha256"])), "maxNewTokens": MAX_NEW_TOKENS, "maxTimeSeconds": MAX_SECONDS}
                torch.cuda.synchronize(worker)
                before = time.perf_counter()
                try:
                    scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
                    with scope, torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
                        generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=MAX_NEW_TOKENS,
                            do_sample=False, use_cache=True, pad_token_id=tokenizer.pad_token_id,
                            eos_token_id=tokenizer.eos_token_id, max_time=MAX_SECONDS, logits_to_keep=1)
                    tokens = generated[0, inputs.shape[1]:]
                    record.update(output=tokenizer.decode(tokens, skip_special_tokens=True), outputTokens=len(tokens),
                                  stoppedWithEos=bool(len(tokens) and tokens[-1].item() == tokenizer.eos_token_id))
                    del generated, tokens
                except Exception as error:
                    record.update(output="", error=type(error).__name__, diagnostic=diagnostic(error))
                    torch.cuda.empty_cache()
                torch.cuda.synchronize(worker)
                record["durationMs"] = round((time.perf_counter() - before) * 1000, 3)
                record["outputSha256"] = digest(record["output"])
                handle.write(compact(record) + "\n")
                handle.flush()
                progress("inference", worker, id=row["id"], variant=variant, outputTokens=record.get("outputTokens", 0), stoppedWithEos=record.get("stoppedWithEos"), errorType=record.get("error"))
            del inputs
    summary = {"worker": worker, "gpu": torch.cuda.get_device_name(worker), "cases": len(assigned), "totalSeconds": round(time.perf_counter() - started, 3),
               "peakMemoryGb": round(torch.cuda.max_memory_allocated(worker) / 2**30, 3), "tokenCounts": counts, "torch": torch.__version__}
    (OUT / f"summary-worker-{worker}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    progress("worker_complete", worker, cases=len(assigned), totalSeconds=summary["totalSeconds"])


def main():
    global OUT
    os.environ.update({"HF_HUB_DISABLE_TELEMETRY": "1", "WANDB_DISABLED": "true", "TOKENIZERS_PARALLELISM": "false", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
    started = time.perf_counter()
    bundle = loaded_bundle()
    if bundle.get("mode") == "development-retry":
        OUT = Path("/kaggle/working/scriptrush-specialist-v2-dev-inference")
    if len(sys.argv) == 4 and sys.argv[1] == "--worker":
        worker_main(int(sys.argv[2]), int(sys.argv[3]))
        return
    if len(sys.argv) != 1:
        raise ValueError("INVALID_RUNNER_ARGUMENTS")
    progress("dependencies")
    install()
    import torch
    count = min(2, torch.cuda.device_count())
    if count < 1:
        raise RuntimeError("GPU_NOT_AVAILABLE")
    progress("verify_adapter", acceleratorCount=count)
    find_adapter("/kaggle/input", bundle["adapterSha256"], bundle["adapterSummarySha256"], bundle["datasetManifestSha256"])
    processes = [subprocess.Popen([sys.executable, __file__, "--worker", str(worker), str(count)]) for worker in range(count)]
    codes = [process.wait() for process in processes]
    records = []
    for worker in range(count):
        source = OUT / f"predictions-worker-{worker}.jsonl"
        if source.is_file():
            records.extend(json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip())
    order = {row["id"]: index for index, row in enumerate(bundle["cases"])}
    records.sort(key=lambda row: (order[row["id"]], 0 if row["variant"] == "base" else 1))
    (OUT / "predictions.jsonl").write_text("".join(compact(row) + "\n" for row in records), encoding="utf-8")
    expected = {(row["id"], variant) for row in bundle["cases"] for variant in ("base", "specialist")}
    observed = {(row["id"], row["variant"]) for row in records}
    summary = {"model": MODEL, "revision": REVISION, "sourceNotebook": bundle["sourceNotebook"],
               "adapterSha256": bundle["adapterSha256"], "adapterSummarySha256": bundle["adapterSummarySha256"],
               "datasetManifestSha256": bundle["datasetManifestSha256"], "sourceFiles": bundle["sourceFiles"],
               "acceleratorCount": count, "parallelism": "Independent inference processes, one NF4 model per T4; no DDP",
               "cases": len(bundle["cases"]), "expectedOutputs": len(expected), "observedOutputs": len(records),
               "missingOutputs": [{"id": identity, "variant": variant} for identity, variant in sorted(expected - observed)],
               "workerExitCodes": codes, "limits": bundle["limits"], "seed": SEED, "packages": DEPENDENCIES,
               "totalSeconds": round(time.perf_counter() - started, 3),
               "mode": bundle.get("mode", "final"),
               "scope": "Offline inference only; no training, labels, response repair, API keys or public Kaggle serving. max_time is checked between generation steps, not during an in-flight CUDA kernel."}
    (OUT / "inference-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if any(codes) or observed != expected or len(records) != len(expected):
        raise RuntimeError("INFERENCE_WORKER_OR_OUTPUT_COUNT_FAILURE")
    progress("complete", cases=len(bundle["cases"]), outputs=len(records), totalSeconds=summary["totalSeconds"])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        worker = int(sys.argv[2]) if len(sys.argv) == 4 and sys.argv[1] == "--worker" and sys.argv[2].isdigit() else None
        detail = diagnostic(error)
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / ("failure.json" if worker is None else f"failure-worker-{worker}.json")).write_text(compact(detail), encoding="utf-8")
        progress("failed", worker, diagnostic=detail)
        raise SystemExit(1)
