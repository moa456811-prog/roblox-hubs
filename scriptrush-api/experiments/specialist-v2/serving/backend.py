"""Hash-pinned GPU backend. Importing this module does not import/load Torch."""
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import time

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
SERVED_MODEL = "scriptrush-specialist-v2"
MAX_INPUT_TOKENS = 16384
MAX_NEW_TOKENS = 4096
MAX_SECONDS = 240
DEPENDENCIES = {"transformers": "4.51.3", "peft": "0.15.2", "accelerate": "1.6.0", "bitsandbytes": "0.45.5"}
# The recovered branch is deliberately limited to the exact production run used
# by inference/runner.py. A new source/version/step needs a separately audited
# loader change and qualification, not an environment or manifest override.
RECOVERED_SOURCE = "sciptrush/scriptrush-v2-production-8af8851d"
RECOVERED_TRAINING_MANIFEST = "1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca"
RECOVERED_SOURCE_SCRIPT = "39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9"
RECOVERED_PRODUCTION_MANIFEST = "b20636e92834148cc20c76e8c4afcfbc6f5df7ea5c62ae9ba3183823a7ba0e83"
RECOVERED_STEP = 32
RECOVERED_BEST_METRIC = 0.03299146145582199
MAX_RECOVERY_BYTES = 200 * 1024 * 1024


class ServiceError(Exception):
    def __init__(self, code, status):
        super().__init__(code)
        self.code = code
        self.status = status


def file_hash(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def sha(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def read_recovery_json(path, maximum, code):
    """Bounded metadata only; hashes are always computed over original bytes."""
    try:
        with Path(path).open("rb") as handle:
            raw = handle.read(maximum + 1)
        if not raw or len(raw) > maximum:
            raise ValueError("metadata bounds")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("metadata root")
        return raw, value
    except (OSError, ValueError, RecursionError):
        raise ServiceError(code, 500) from None


def finite_metric(value):
    return type(value) in (int, float) and math.isfinite(value)


def verify_recovered_artifacts(manifest, adapter, receipt_path):
    """Validate recovered evidence without synthesizing a completed summary."""
    if manifest["sourceNotebook"] != RECOVERED_SOURCE or type(manifest["sourceVersion"]) is not int or manifest["sourceVersion"] != 1 or manifest["checkpoint"] != "checkpoint-32" or manifest["trainingManifestSha256"] != RECOVERED_TRAINING_MANIFEST:
        raise ServiceError("UNEXPECTED_RECOVERED_CHECKPOINT_SOURCE", 500)
    if not sha(manifest["trainerStateSha256"]) or not sha(manifest["recoveryReceiptSha256"]):
        raise ServiceError("INVALID_RECOVERY_HASHES", 500)
    raw, receipt = read_recovery_json(receipt_path, 32768, "INVALID_RECOVERY_RECEIPT")
    if hashlib.sha256(raw).hexdigest() != manifest["recoveryReceiptSha256"]:
        raise ServiceError("RECOVERY_RECEIPT_HASH_MISMATCH", 500)
    keys = {"artifactKind", "sourceNotebook", "sourceVersion", "checkpoint", "sourceRelativePath", "sourceReceiptSha256", "sourceTrainingManifestSha256", "sourceScriptSha256", "complete", "trainingSummaryFabricated", "files", "cancelRequested", "globalStep", "bestGlobalStep", "selectedCheckpoint", "bestValidationMetric", "totalBytes"}
    if set(receipt) != keys or receipt["artifactKind"] != "recovered-checkpoint" or receipt["complete"] is not True or receipt["trainingSummaryFabricated"] is not False:
        raise ServiceError("EXPLICIT_RECOVERY_RECEIPT_REQUIRED", 500)
    if receipt["sourceNotebook"] != RECOVERED_SOURCE or type(receipt["sourceVersion"]) is not int or receipt["sourceVersion"] != 1 or receipt["checkpoint"] != "checkpoint-32" or receipt["selectedCheckpoint"] != "checkpoint-32" or type(receipt["globalStep"]) is not int or receipt["globalStep"] != RECOVERED_STEP or type(receipt["bestGlobalStep"]) is not int or receipt["bestGlobalStep"] != RECOVERED_STEP or type(receipt["cancelRequested"]) is not bool or receipt["sourceRelativePath"] != "scriptrush-specialist-v2/training/checkpoint-32/":
        raise ServiceError("RECOVERY_SOURCE_OR_STEP_MISMATCH", 500)
    metric = receipt["bestValidationMetric"]
    if receipt["sourceTrainingManifestSha256"] != RECOVERED_TRAINING_MANIFEST or receipt["sourceScriptSha256"] != RECOVERED_SOURCE_SCRIPT or not finite_metric(metric) or not math.isclose(metric, RECOVERED_BEST_METRIC, rel_tol=0, abs_tol=1e-8):
        raise ServiceError("RECOVERY_LINEAGE_OR_METRIC_MISMATCH", 500)
    sources = manifest["sourceFiles"]
    if not isinstance(sources, dict) or set(sources) != {"productionManifestSha256", "sourceScriptSha256", "sourceSubmissionReceiptSha256"} or sources["productionManifestSha256"] != RECOVERED_PRODUCTION_MANIFEST or sources["sourceScriptSha256"] != RECOVERED_SOURCE_SCRIPT or not sha(receipt["sourceReceiptSha256"]) or sources["sourceSubmissionReceiptSha256"] != receipt["sourceReceiptSha256"]:
        raise ServiceError("RECOVERY_SOURCE_FILES_MISMATCH", 500)
    files = receipt["files"]
    if not isinstance(files, dict) or not {"trainer_state.json", "adapter_config.json", "adapter_model.safetensors"} <= set(files) or not set(files) <= {"trainer_state.json", "adapter_config.json", "adapter_model.safetensors", "README.md"}:
        raise ServiceError("RECOVERY_FILE_SET_MISMATCH", 500)
    for record in files.values():
        if not isinstance(record, dict) or set(record) != {"sha256", "bytes"} or not sha(record["sha256"]) or type(record["bytes"]) is not int or not 1 <= record["bytes"] <= MAX_RECOVERY_BYTES:
            raise ServiceError("INVALID_RECOVERY_FILE_HASH_OR_SIZE", 500)
    if type(receipt["totalBytes"]) is not int or receipt["totalBytes"] != sum(record["bytes"] for record in files.values()) or receipt["totalBytes"] > MAX_RECOVERY_BYTES or files["trainer_state.json"]["sha256"] != manifest["trainerStateSha256"] or {name: record["sha256"] for name, record in files.items() if name != "trainer_state.json"} != manifest["adapterSha256"]:
        raise ServiceError("RECOVERY_FILE_HASH_MAP_MISMATCH", 500)
    try:
        for name, record in files.items():
            path = (adapter / name).resolve(strict=True)
            if path.parent != adapter or not path.is_file() or path.stat().st_size != record["bytes"] or file_hash(path) != record["sha256"]:
                raise ServiceError("RECOVERY_FILE_BYTES_MISMATCH", 500)
    except OSError:
        raise ServiceError("RECOVERY_FILE_BYTES_MISMATCH", 500) from None
    _, state = read_recovery_json(adapter / "trainer_state.json", 2 * 1024 * 1024, "INVALID_RECOVERED_TRAINER_STATE")
    history = state.get("log_history")
    evaluations = [entry for entry in history if isinstance(entry, dict) and type(entry.get("step")) is int and entry["step"] == RECOVERED_STEP and "eval_loss" in entry] if isinstance(history, list) else []
    checkpoint = state.get("best_model_checkpoint")
    if type(state.get("global_step")) is not int or state["global_step"] != RECOVERED_STEP or type(state.get("best_global_step")) is not int or state["best_global_step"] != RECOVERED_STEP or not finite_metric(state.get("best_metric")) or state["best_metric"] != metric or len(evaluations) != 1 or not finite_metric(evaluations[0]["eval_loss"]) or not math.isclose(evaluations[0]["eval_loss"], metric, rel_tol=0, abs_tol=1e-8) or not isinstance(checkpoint, str) or not checkpoint.replace("\\", "/").endswith("/checkpoint-32"):
        raise ServiceError("RECOVERED_TRAINER_STATE_MISMATCH", 500)
    _, config = read_recovery_json(adapter / "adapter_config.json", 2 * 1024 * 1024, "INVALID_RECOVERED_ADAPTER_CONFIG")
    if config.get("base_model_name_or_path") != MODEL or config.get("peft_type") != "LORA" or config.get("revision") != REVISION:
        raise ServiceError("UNEXPECTED_RECOVERED_ADAPTER_TYPE", 500)


def verify_artifacts(manifest_path, adapter_directory, summary_path=None, *, recovery_receipt_path=None):
    """Explicit deployment manifest supplies hashes; no implicit artifact override."""
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    completed_fields = {"formatVersion", "model", "revision", "servedModel", "trainingManifestSha256", "trainingSummarySha256", "adapterSha256", "allowedSystemSha256"}
    recovered_fields = (completed_fields - {"trainingSummarySha256"}) | {"artifactKind", "sourceNotebook", "sourceVersion", "checkpoint", "trainerStateSha256", "recoveryReceiptSha256", "sourceFiles"}
    recovered = isinstance(manifest, dict) and manifest.get("artifactKind") == "recovered-checkpoint"
    if not isinstance(manifest, dict) or set(manifest) != (recovered_fields if recovered else completed_fields) or type(manifest["formatVersion"]) is not int or manifest["formatVersion"] != (2 if recovered else 1):
        raise ServiceError("INVALID_DEPLOYMENT_MANIFEST", 500)
    if manifest["model"] != MODEL or manifest["revision"] != REVISION or manifest["servedModel"] != SERVED_MODEL:
        raise ServiceError("UNEXPECTED_PINNED_MODEL", 500)
    if not sha(manifest["trainingManifestSha256"]) or (not recovered and not sha(manifest["trainingSummarySha256"])):
        raise ServiceError("INVALID_TRAINING_HASHES", 500)
    if (recovered and (summary_path is not None or recovery_receipt_path is None)) or (not recovered and (summary_path is None or recovery_receipt_path is not None)):
        raise ServiceError("ARTIFACT_PROVENANCE_ARGUMENT_MISMATCH", 500)
    systems = manifest["allowedSystemSha256"]
    if not isinstance(systems, list) or not 1 <= len(systems) <= 8 or not all(sha(value) for value in systems) or len(systems) != len(set(systems)):
        raise ServiceError("INVALID_ALLOWED_COMPOSER_SYSTEMS", 500)
    adapter = Path(adapter_directory).resolve(strict=True)
    hashes = manifest["adapterSha256"]
    if not isinstance(hashes, dict) or not {"adapter_config.json", "adapter_model.safetensors"} <= set(hashes) or len(hashes) > 16:
        raise ServiceError("INVALID_ADAPTER_MANIFEST", 500)
    for name, expected_hash in hashes.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name) or Path(name).name != name or not sha(expected_hash):
            raise ServiceError("INVALID_ADAPTER_MANIFEST", 500)
        path = (adapter / name).resolve(strict=True)
        if path.parent != adapter or not path.is_file() or file_hash(path) != expected_hash:
            raise ServiceError("ADAPTER_HASH_MISMATCH", 500)
    if recovered:
        verify_recovered_artifacts(manifest, adapter, recovery_receipt_path)
    else:
        summary_file = Path(summary_path).resolve(strict=True)
        if file_hash(summary_file) != manifest["trainingSummarySha256"]:
            raise ServiceError("TRAINING_SUMMARY_HASH_MISMATCH", 500)
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        if summary.get("model") != MODEL or summary.get("revision") != REVISION or summary.get("datasetManifestSha256") != manifest["trainingManifestSha256"] or summary.get("adapterSha256") != hashes:
            raise ServiceError("TRAINING_LINEAGE_MISMATCH", 500)
    config = json.loads((adapter / "adapter_config.json").read_text(encoding="utf-8"))
    if config.get("base_model_name_or_path") != MODEL or config.get("peft_type") != "LORA":
        raise ServiceError("UNEXPECTED_ADAPTER_TYPE", 500)
    return manifest, adapter


class GpuBackend:
    def __init__(self, manifest_path, adapter_directory, summary_path=None, *, recovery_receipt_path=None):
        self.ready = False
        self.manifest, adapter = verify_artifacts(manifest_path, adapter_directory, summary_path, recovery_receipt_path=recovery_receipt_path)
        for package, expected in DEPENDENCIES.items():
            try:
                installed = importlib.metadata.version(package)
            except importlib.metadata.PackageNotFoundError:
                raise ServiceError("DEPENDENCY_VERSION_MISMATCH", 500) from None
            if installed != expected:
                raise ServiceError("DEPENDENCY_VERSION_MISMATCH", 500)
        os.environ.update({"HF_HUB_DISABLE_TELEMETRY": "1", "WANDB_DISABLED": "true", "TOKENIZERS_PARALLELISM": "false", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from transformers.utils import logging
        from peft import PeftModel, prepare_model_for_kbit_training
        logging.set_verbosity_error()
        if not torch.cuda.is_available():
            raise ServiceError("CUDA_GPU_REQUIRED", 500)
        torch.cuda.set_device(0)
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, trust_remote_code=False)
        self.tokenizer.pad_token = self.tokenizer.eos_token
        self.tokenizer.padding_side = "right"
        quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
        model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float16, quantization_config=quantization,
            device_map={"": 0}, attn_implementation="sdpa", trust_remote_code=False)
        if MAX_INPUT_TOKENS + MAX_NEW_TOKENS > model.config.max_position_embeddings:
            raise ServiceError("MODEL_CONTEXT_BUDGET_INVALID", 500)
        # Match the qualified benchmark's dtypes without constructing a Trainer,
        # optimizer or enabling gradient checkpointing/input gradients.
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=False)
        model.get_input_embeddings().to(dtype=torch.float16)
        model.get_output_embeddings().to(dtype=torch.float16)
        self.model = PeftModel.from_pretrained(model, str(adapter), is_trainable=False)
        self.model.requires_grad_(False)
        self.model.config.use_cache = True
        self.model.eval()
        self.ready = True

    def generate(self, messages, max_tokens):
        torch = self.torch
        tokens = self.tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True)
        if len(tokens) > MAX_INPUT_TOKENS:
            raise ServiceError("PROMPT_TOO_LONG", 400)
        inputs = torch.tensor([tokens], dtype=torch.long, device=self.model.device)
        torch.cuda.synchronize(0)
        started = time.perf_counter()
        try:
            # Trainer used AMP during fitting; FP32 norms with a FP16 lm_head
            # still require the same CUDA autocast during independent inference.
            with torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
                generated = self.model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=max_tokens,
                    do_sample=False, use_cache=True, pad_token_id=self.tokenizer.pad_token_id, eos_token_id=self.tokenizer.eos_token_id,
                    max_time=MAX_SECONDS, logits_to_keep=1)
            new_tokens = generated[0, inputs.shape[1]:]
            output = self.tokenizer.decode(new_tokens, skip_special_tokens=True)
            complete = bool(len(new_tokens) and new_tokens[-1].item() == self.tokenizer.eos_token_id)
            torch.cuda.synchronize(0)
            return {"output": output, "inputTokens": len(tokens), "outputTokens": len(new_tokens), "stoppedWithEos": complete,
                    "durationMs": round((time.perf_counter() - started) * 1000, 3)}
        finally:
            del inputs
            torch.cuda.empty_cache()
