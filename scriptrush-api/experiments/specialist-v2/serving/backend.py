"""Hash-pinned GPU backend. Importing this module does not import/load Torch."""
import hashlib
import importlib.metadata
import json
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


def verify_artifacts(manifest_path, adapter_directory, summary_path):
    """Explicit deployment manifest supplies hashes; no implicit artifact override."""
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    expected = {"formatVersion", "model", "revision", "servedModel", "trainingManifestSha256", "trainingSummarySha256", "adapterSha256", "allowedSystemSha256"}
    if not isinstance(manifest, dict) or set(manifest) != expected or type(manifest["formatVersion"]) is not int or manifest["formatVersion"] != 1:
        raise ServiceError("INVALID_DEPLOYMENT_MANIFEST", 500)
    if manifest["model"] != MODEL or manifest["revision"] != REVISION or manifest["servedModel"] != SERVED_MODEL:
        raise ServiceError("UNEXPECTED_PINNED_MODEL", 500)
    if not sha(manifest["trainingManifestSha256"]) or not sha(manifest["trainingSummarySha256"]):
        raise ServiceError("INVALID_TRAINING_HASHES", 500)
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
    def __init__(self, manifest_path, adapter_directory, summary_path):
        self.ready = False
        self.manifest, adapter = verify_artifacts(manifest_path, adapter_directory, summary_path)
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
