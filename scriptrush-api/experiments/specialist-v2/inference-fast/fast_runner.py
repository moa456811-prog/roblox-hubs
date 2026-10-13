"""Optional private DEV benchmark: vLLM V0, unquantized FP16, two T4s.

This profile changes base arithmetic. It never qualifies model promotion and
never serves an endpoint. Its standalone lineage validator is injected locally.
"""
import base64
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time
import traceback
import types
import zlib

OUT = Path("/kaggle/working/scriptrush-v2-fast-dev")
ENVIRONMENT = Path("/tmp/scriptrush-v2-fast-environment")
PYTHON_VERSION = "3.12.11"
UV_VERSION = "0.7.20"
PROFILE = "vllm-0.9.2-v0-fp16-tp2-xformers-eager"
PACKAGES = {"vllm": "0.9.2", "torch": "2.7.0+cu128", "torchaudio": "2.7.0+cu128",
            "torchvision": "0.22.0+cu128", "xformers": "0.0.30", "triton": "3.3.0",
            "transformers": "4.51.3", "bitsandbytes": "0.46.1", "huggingface-hub": "0.33.0",
            "tokenizers": "0.21.1", "safetensors": "0.5.3", "numpy": "1.26.4",
            "opencv-python-headless": "4.11.0.86", "ray": "2.48.0"}
RUNTIME_ENV = {"VLLM_USE_V1": "0", "VLLM_ATTENTION_BACKEND": "XFORMERS",
               "VLLM_WORKER_MULTIPROC_METHOD": "spawn", "VLLM_NO_USAGE_STATS": "1",
               "CUDA_VISIBLE_DEVICES": "0,1", "HF_HUB_DISABLE_TELEMETRY": "1",
               "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1", "TOKENIZERS_PARALLELISM": "false",
               "WANDB_DISABLED": "true", "TORCH_NCCL_ASYNC_ERROR_HANDLING": "1",
               "UV_CACHE_DIR": "/tmp/scriptrush-v2-fast-uv-cache"}
REQUEST_SECONDS = 240
WATCHDOG_GRACE_SECONDS = 30
STARTUP_SECONDS = 1800
TOTAL_ENGINE_SECONDS = STARTUP_SECONDS + 8 * (REQUEST_SECONDS + WATCHDOG_GRACE_SECONDS)
TARGET_MODULES = {"q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes((compact(value) + "\n").encode("utf-8"))
    temporary.replace(path)


def progress(phase, **fields):
    value = {"phase": phase, "monotonic": time.monotonic(), **fields}
    write_json(OUT / "progress.json", value)
    print(compact(value), flush=True)


def fault_diagnostic(error):
    """Fixed fault classes and stack locations only; no body, locals or URLs."""
    safe = {"ISOLATED_PYTHON_31211_REQUIRED", "PINNED_INFERENCE_PACKAGE_VERSION_MISMATCH",
            "EXACTLY_TWO_TURING_T4_GPUS_REQUIRED", "BASE_OR_LORA_FP16_TP2_SMOKE_FAILED",
            "FAST_DEVELOPMENT_OUTPUT_COUNT_OR_REQUEST_FAILURE", "ISOLATED_ENVIRONMENT_COMMAND_FAILED",
            "INFLIGHT_REQUEST_WATCHDOG_EXCEEDED", "ENGINE_STARTUP_WATCHDOG_EXCEEDED",
            "ENGINE_TOTAL_WALL_TIME_EXCEEDED", "ENGINE_IDLE_OR_SHUTDOWN_WATCHDOG_EXCEEDED",
            "FAST_ENGINE_SUBPROCESS_FAILED", "SINGLE_SEQUENCE_ENGINE_MUST_BE_IDLE",
            "UNEXPECTED_ENGINE_REQUEST_OR_SEQUENCE", "ENGINE_REQUEST_DID_NOT_ABORT_OR_FINISH"}
    message = str(error)
    lowered = message.lower()
    if message in safe:
        code = message
    elif "out of memory" in lowered:
        code = "CUDA_OUT_OF_MEMORY"
    elif "nccl" in lowered or "collective" in lowered:
        code = "DISTRIBUTED_COLLECTIVE_FAILURE"
    elif "triton" in lowered or "ptx" in lowered:
        code = "TRITON_OR_PTX_COMPILATION_FAILURE"
    elif any(fragment in lowered for fragment in ("same dtype", "same type", "expected scalar type", "mat1 and mat2")):
        code = "DTYPE_MISMATCH"
    else:
        code = "FAST_INFERENCE_FAILURE"
    return {"errorType": type(error).__name__, "errorCode": code,
            "traceback": [{"file": Path(frame.filename).name, "function": frame.name, "line": frame.lineno}
                          for frame in traceback.extract_tb(error.__traceback__)[-12:]]}


def validator_module():
    raw = zlib.decompress(base64.b64decode(SCRIPTRUSH_LINEAGE_SOURCE, validate=True))
    if digest(raw) != SCRIPTRUSH_LINEAGE_SHA256:
        raise ValueError("PINNED_LINEAGE_VALIDATOR_CHANGED")
    module = types.ModuleType("scriptrush_fast_lineage")
    exec(compile(raw, "<pinned-completed-production-lineage>", "exec"), module.__dict__)
    return module


def loaded_bundle():
    if (type(SCRIPTRUSH_SOURCE_VERSION) is not int or SCRIPTRUSH_SOURCE_VERSION != 1
            or not isinstance(SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256, str) or len(SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256) != 64
            or any(character not in "0123456789abcdef" for character in SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256)):
        raise ValueError("PINNED_ACCEPTED_SOURCE_VERSION_ONE_REQUIRED")
    value = json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_INFERENCE_BUNDLE, validate=True)))
    if not isinstance(value, dict) or value.get("mode") != "production-development-completed" or "artifactKind" in value:
        raise ValueError("ONLY_COMPLETED_PRODUCTION_DEVELOPMENT_BUNDLE_ALLOWED")
    lineage = validator_module()
    return lineage, lineage.validate_bundle(value)


def adapter_config(directory):
    config = json.loads((Path(directory) / "adapter_config.json").read_bytes())
    if (config.get("r") != 16 or type(config.get("r")) is not int or config.get("lora_alpha") != 32
            or config.get("bias") != "none" or set(config.get("target_modules", [])) != TARGET_MODULES
            or config.get("modules_to_save") or config.get("use_dora") or config.get("use_rslora")
            or config.get("rank_pattern") or config.get("alpha_pattern")):
        raise ValueError("EXACT_UNMERGED_LORA16_LINEAR_ADAPTER_REQUIRED")
    return config


def engine_arguments(bundle):
    return {"model": bundle["model"], "revision": bundle["revision"], "tokenizer": bundle["model"],
            "tokenizer_revision": bundle["revision"], "trust_remote_code": False, "hf_token": False,
            "model_impl": "vllm", "dtype": "float16", "quantization": None, "load_format": "safetensors",
            "tensor_parallel_size": 2, "pipeline_parallel_size": 1, "distributed_executor_backend": "mp",
            "disable_custom_all_reduce": True, "enforce_eager": True, "max_model_len": 20480,
            "max_num_seqs": 1, "max_num_batched_tokens": 20480, "enable_chunked_prefill": False,
            "enable_prefix_caching": False, "gpu_memory_utilization": 0.85, "cpu_offload_gb": 0,
            "swap_space": 0, "enable_lora": True, "max_lora_rank": 16, "max_loras": 1,
            "max_cpu_loras": 1, "lora_dtype": "float16", "lora_extra_vocab_size": 0,
            "generation_config": "vllm", "disable_log_stats": True, "seed": 39107}


def measured_tokens(tokenizer, row):
    tokens = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True)
    if len(tokens) != row["preparedInputTokens"] or not 1 <= len(tokens) <= 16384:
        raise ValueError("FROZEN_TOKENIZER_COUNT_OR_INPUT_BUDGET_MISMATCH_NO_TRUNCATION")
    if any(type(token) is not int or token < 0 for token in tokens):
        raise ValueError("INVALID_PROMPT_TOKEN_IDS")
    return tokens


def request_once(engine, identity, token_ids, sampling, lora_request, eos_id, seconds=REQUEST_SECONDS,
                 monotonic=time.monotonic, publish=None):
    """Exactly one request; deadline checks surround every synchronous step.

    abort_request cannot interrupt an in-flight CUDA kernel. The bootstrap
    supervisor separately kills this process group if a step remains stuck.
    """
    if engine.has_unfinished_requests():
        raise RuntimeError("SINGLE_SEQUENCE_ENGINE_MUST_BE_IDLE")
    started = monotonic()
    if publish:
        publish({"active": True, "id": identity, "startedMonotonic": started, "deadlineMonotonic": started + seconds})
    latest = None
    deadline_exceeded = False
    error = None
    detail = None
    try:
        engine.add_request(identity, {"prompt_token_ids": list(token_ids)}, sampling, lora_request=lora_request)
        while engine.has_unfinished_requests():
            if monotonic() - started >= seconds:
                deadline_exceeded = True
                engine.abort_request(identity)
                break
            outputs = engine.step()
            for output in outputs:
                if output.request_id != identity or len(output.outputs) != 1:
                    raise RuntimeError("UNEXPECTED_ENGINE_REQUEST_OR_SEQUENCE")
                latest = output
            if monotonic() - started >= seconds:
                deadline_exceeded = True
                engine.abort_request(identity)
                break
            if latest is not None and latest.finished:
                break
        if engine.has_unfinished_requests():
            raise RuntimeError("ENGINE_REQUEST_DID_NOT_ABORT_OR_FINISH")
    except Exception as fault:
        error = type(fault).__name__
        detail = fault_diagnostic(fault)
        engine.abort_request(identity)
    finally:
        duration_ms = (monotonic() - started) * 1000
        if publish:
            publish({"active": False, "id": identity, "durationMs": round(duration_ms, 3), "completedMonotonic": monotonic()})
    completion = latest.outputs[0] if latest is not None else None
    output = completion.text if completion is not None else ""
    ids = list(completion.token_ids) if completion is not None else []
    finish = completion.finish_reason if completion is not None else None
    stop = completion.stop_reason if completion is not None else None
    value = {"output": output, "outputSha256": digest(output), "outputTokens": len(ids), "outputTokenIds": ids,
             "durationMs": round(duration_ms, 3), "finished": bool(latest is not None and latest.finished),
             "finishReason": finish, "stopReason": stop, "deadlineExceeded": deadline_exceeded,
             "stoppedWithEos": bool(not deadline_exceeded and error is None and latest is not None and latest.finished
                                    and finish == "stop" and ids and ids[-1] == eos_id),
             "writerBudget120sMet": bool(not deadline_exceeded and error is None and latest is not None and latest.finished
                                          and finish == "stop" and ids and ids[-1] == eos_id and duration_ms < 120000)}
    if deadline_exceeded:
        value["error"] = "RequestDeadlineExceeded"
    elif error:
        value["error"] = error
        value["diagnostic"] = detail
    elif latest is None or not latest.finished:
        value["error"] = "IncompleteEngineOutput"
    return value


def checked_versions():
    if sys.version_info[:3] != (3, 12, 11):
        raise RuntimeError("ISOLATED_PYTHON_31211_REQUIRED")
    versions = {name: importlib.metadata.version(name) for name in PACKAGES}
    if versions != PACKAGES:
        raise RuntimeError("PINNED_INFERENCE_PACKAGE_VERSION_MISMATCH")
    return versions


def engine_main():
    os.environ.update(RUNTIME_ENV)
    started = time.monotonic()
    lineage, bundle = loaded_bundle()
    versions = checked_versions()
    import torch
    from transformers import AutoTokenizer
    from vllm import EngineArgs, LLMEngine, SamplingParams
    from vllm.lora.request import LoRARequest
    if torch.cuda.device_count() != 2 or any(torch.cuda.get_device_capability(index) != (7, 5) or "T4" not in torch.cuda.get_device_name(index) for index in range(2)):
        raise RuntimeError("EXACTLY_TWO_TURING_T4_GPUS_REQUIRED")
    adapter = lineage.resolve_adapter("/kaggle/input", bundle)
    adapter_config(adapter)
    progress("verified_completed_adapter", profile=PROFILE, adapterSummarySha256=bundle["adapterSummarySha256"])
    tokenizer = AutoTokenizer.from_pretrained(bundle["model"], revision=bundle["revision"], trust_remote_code=False, token=False)
    encoded = {row["id"]: measured_tokens(tokenizer, row) for row in bundle["cases"]}
    if type(tokenizer.eos_token_id) is not int:
        raise ValueError("ONE_PINNED_EOS_TOKEN_REQUIRED")
    kwargs = engine_arguments(bundle)
    progress("load_engine", profile=PROFILE)
    engine = LLMEngine.from_engine_args(EngineArgs(**kwargs))
    lora = LoRARequest("scriptrush-completed-production", 1, str(adapter))
    publish = lambda value: write_json(OUT / "active-request.json", value)
    smoke_prompt = tokenizer.apply_chat_template([{"role": "system", "content": "Return JSON."}, {"role": "user", "content": "{}"}], tokenize=True, add_generation_prompt=True)
    smoke = []
    for variant in ("base", "specialist"):
        sample = SamplingParams(temperature=0, max_tokens=2, n=1, ignore_eos=False,
                                stop_token_ids=[tokenizer.eos_token_id], truncate_prompt_tokens=None)
        result = request_once(engine, "smoke-" + variant, smoke_prompt, sample, lora if variant == "specialist" else None,
                              tokenizer.eos_token_id, seconds=90, publish=publish)
        smoke.append({"variant": variant, **result})
        write_json(OUT / "smoke.json", {"profile": PROFILE, "results": smoke, "passed": len(smoke) == 2 and all("error" not in row and row["outputTokens"] > 0 for row in smoke)})
        if "error" in result or result["outputTokens"] < 1:
            raise RuntimeError("BASE_OR_LORA_FP16_TP2_SMOKE_FAILED")
    progress("smoke_passed", profile=PROFILE, loadAndSmokeSeconds=round(time.monotonic() - started, 3))
    records = []
    infrastructure_failed = False
    try:
        with (OUT / "predictions.jsonl").open("x", encoding="utf-8", newline="\n") as handle:
            for index, row in enumerate(bundle["cases"]):
                order = ("base", "specialist") if index % 2 == 0 else ("specialist", "base")
                for position, variant in enumerate(order):
                    sample = SamplingParams(temperature=0, max_tokens=4096, n=1, ignore_eos=False,
                                            stop_token_ids=[tokenizer.eos_token_id], truncate_prompt_tokens=None)
                    result = request_once(engine, row["id"] + "-" + variant, encoded[row["id"]], sample,
                                          lora if variant == "specialist" else None, tokenizer.eos_token_id, publish=publish)
                    record = {"id": row["id"], "group": "dev", "variant": variant, "variantPosition": position,
                              "origin": "model-inference", "model": bundle["model"], "revision": bundle["revision"],
                              "promptSha256": row["promptSha256"], "inputTokens": len(encoded[row["id"]]),
                              "sourceNotebook": bundle["sourceNotebook"], "adapterManifestSha256": digest(lineage.compact(bundle["adapterSha256"])),
                              "sourceNotebookVersion": SCRIPTRUSH_SOURCE_VERSION,
                              "sourceAcceptanceReceiptSha256": SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256,
                              "adapterSha256": bundle["adapterSha256"], "adapterSummarySha256": bundle["adapterSummarySha256"],
                              "datasetManifestSha256": bundle["datasetManifestSha256"], "sourceFiles": bundle["sourceFiles"],
                              "artifactKind": "completed-training-adapter", "inferenceProfile": PROFILE, "quantization": "none",
                              "dtype": "float16", "tensorParallelSize": 2, "engineVersions": versions,
                              "maxNewTokens": 4096, "maxTimeSeconds": REQUEST_SECONDS, "productionPromotionEligible": False, **result}
                    handle.write(compact(record) + "\n"); handle.flush()
                    records.append(record)
                    progress("inference", id=row["id"], variant=variant, outputTokens=result["outputTokens"],
                             stoppedWithEos=result["stoppedWithEos"], durationMs=result["durationMs"], errorType=result.get("error"))
                    if stop_after_request(result):
                        infrastructure_failed = True
                        break
                if infrastructure_failed:
                    break
    finally:
        summary = {"mode": "production-development-completed", "inferenceProfile": PROFILE, "model": bundle["model"],
                   "revision": bundle["revision"], "sourceNotebook": bundle["sourceNotebook"], "adapterSha256": bundle["adapterSha256"],
                   "sourceNotebookVersion": SCRIPTRUSH_SOURCE_VERSION,
                   "sourceAcceptanceReceiptSha256": SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256,
                   "adapterSummarySha256": bundle["adapterSummarySha256"], "datasetManifestSha256": bundle["datasetManifestSha256"],
                   "sourceFiles": bundle["sourceFiles"], "engineVersions": versions, "engineArguments": kwargs,
                   "expectedOutputs": 8, "observedOutputs": len(records), "allOutputsEos": len(records) == 8 and all(row["stoppedWithEos"] for row in records),
                   "stoppedAfterInfrastructureFailure": infrastructure_failed,
                   "specialistRequestsUnder120s": sum(row["variant"] == "specialist" and row["writerBudget120sMet"] for row in records),
                   "totalSeconds": round(time.monotonic() - started, 3), "productionPromotionEligible": False,
                   "scope": "Four DEV prompts only. FP16 TP2 changes arithmetic from HF NF4; functional/UI rescoring is required. Request durations exclude environment installation, engine loading and smoke. No production hosting or endpoint."}
        write_json(OUT / "inference-summary.json", summary)
        engine.stop_remote_worker_execution_loop()
    if len(records) != 8 or any("error" in row for row in records):
        raise RuntimeError("FAST_DEVELOPMENT_OUTPUT_COUNT_OR_REQUEST_FAILURE")
    progress("complete", profile=PROFILE, outputs=8)


def stop_after_request(result):
    # A bounded model timeout is a measured failure, not a retry. CUDA/OOM,
    # dtype or engine faults invalidate this engine; do not spend seven more
    # requests repeatedly observing the same infrastructure failure.
    return "error" in result and result["error"] != "RequestDeadlineExceeded"


def bounded_install(command, timeout, log_name):
    with (OUT / log_name).open("wb") as log:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError("ISOLATED_ENVIRONMENT_COMMAND_FAILED")


def isolated_python():
    # A target-only uv installation never replaces Kaggle's Python/Torch.
    bootstrap = ENVIRONMENT / "bootstrap"
    environment = ENVIRONMENT / "python312"
    if environment.exists() or bootstrap.exists():
        raise FileExistsError("PRESERVE_EXISTING_FAST_ISOLATED_ENVIRONMENT")
    ENVIRONMENT.mkdir(parents=True, exist_ok=False)
    bounded_install([sys.executable, "-m", "pip", "--isolated", "install", "--index-url", "https://pypi.org/simple",
                     "--disable-pip-version-check", "--no-compile", "--target", str(bootstrap), "uv==" + UV_VERSION], 180, "bootstrap-install.log")
    # uv.find_uv_bin() prefers a global binary even when its module came from
    # --target. Select the owned target binary directly instead.
    uv_binary = str(bootstrap / "bin" / "uv")
    if not Path(uv_binary).is_file():
        raise RuntimeError("OWNED_PINNED_UV_BINARY_REQUIRED")
    check = subprocess.run([uv_binary, "--version"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
    if check.returncode or check.stdout.decode("utf-8").strip().split()[:2] != ["uv", UV_VERSION]:
        raise RuntimeError("PINNED_UV_VERSION_MISMATCH")
    bounded_install([uv_binary, "venv", "--no-config", "--python", PYTHON_VERSION, "--managed-python", str(environment)], 180, "python-environment.log")
    python = environment / "bin" / "python"
    bounded_install([uv_binary, "pip", "install", "--no-config", "--python", str(python), "--index-url", "https://pypi.org/simple",
                     "--index-strategy", "unsafe-best-match",
                     "--only-binary", ":all:", "--extra-index-url", "https://download.pytorch.org/whl/cu128",
                     *[name + "==" + version for name, version in PACKAGES.items()]], 1200, "dependencies-install.log")
    bounded_install([uv_binary, "pip", "check", "--no-config", "--python", str(python)], 60, "dependencies-check.log")
    bounded_install([uv_binary, "pip", "freeze", "--no-config", "--python", str(python)], 60, "environment-freeze.txt")
    return python


def watchdog_reason(started, now, active):
    if now - started > TOTAL_ENGINE_SECONDS:
        return "ENGINE_TOTAL_WALL_TIME_EXCEEDED"
    if isinstance(active, dict) and active.get("active") is True:
        deadline = active.get("deadlineMonotonic")
        if type(deadline) not in (float, int):
            return "INVALID_ACTIVE_REQUEST_DEADLINE"
        if now > deadline + WATCHDOG_GRACE_SECONDS:
            return "INFLIGHT_REQUEST_WATCHDOG_EXCEEDED"
    elif now - started > STARTUP_SECONDS and active is None:
        return "ENGINE_STARTUP_WATCHDOG_EXCEEDED"
    elif isinstance(active, dict) and active.get("active") is False:
        completed = active.get("completedMonotonic")
        if type(completed) not in (float, int):
            return "INVALID_COMPLETED_REQUEST_TIME"
        if now > completed + 60:
            return "ENGINE_IDLE_OR_SHUTDOWN_WATCHDOG_EXCEEDED"
    return None


def forward_engine_progress(path, last_monotonic, emit=None):
    """Forward only new, typed engine telemetry; never logs or generated text."""
    try:
        value = json.loads(Path(path).read_bytes())
    except (OSError, ValueError):
        return last_monotonic
    phases = {"verified_completed_adapter", "load_engine", "smoke_passed", "inference", "complete"}
    fields = {"phase", "profile", "monotonic", "id", "variant", "outputTokens", "stoppedWithEos",
              "durationMs", "errorType", "loadAndSmokeSeconds", "outputs"}
    if not isinstance(value, dict) or not isinstance(value.get("phase"), str) or value["phase"] not in phases:
        return last_monotonic
    stamp = value.get("monotonic")
    if type(stamp) not in (float, int) or not math.isfinite(stamp) or stamp < 0 or stamp <= last_monotonic:
        return last_monotonic
    safe = {name: item for name, item in value.items() if name in fields}
    if "profile" in safe and safe["profile"] != PROFILE:
        return last_monotonic
    if "id" in safe and (not isinstance(safe["id"], str) or safe["id"] not in {f"production-teach-dev-{index:03d}" for index in range(1, 5)}):
        return last_monotonic
    if "variant" in safe and safe["variant"] not in ("base", "specialist"):
        return last_monotonic
    for name, maximum in (("outputTokens", 4096), ("outputs", 8)):
        if name in safe and (type(safe[name]) is not int or not 0 <= safe[name] <= maximum):
            return last_monotonic
    for name in ("durationMs", "loadAndSmokeSeconds"):
        if name in safe and (type(safe[name]) not in (float, int) or not math.isfinite(safe[name]) or safe[name] < 0):
            return last_monotonic
    if "stoppedWithEos" in safe and type(safe["stoppedWithEos"]) is not bool:
        return last_monotonic
    error = safe.get("errorType")
    if error is not None and (not isinstance(error, str) or not error.isascii() or not error.isidentifier() or len(error) > 64):
        return last_monotonic
    serialized = compact(safe)
    if emit is None:
        print(serialized, flush=True)
    else:
        emit(serialized)
    return stamp


def terminate_process_group(process, signal_group=os.killpg if hasattr(os, "killpg") else None,
                            monotonic=time.monotonic, sleep=time.sleep):
    """Kill the owned session, including orphan TP workers after leader exit."""
    if signal_group is None or type(process.pid) is not int or process.pid <= 1:
        raise RuntimeError("OWNED_LINUX_PROCESS_GROUP_REQUIRED")
    def exists():
        try:
            signal_group(process.pid, 0)
            return True
        except ProcessLookupError:
            return False
    try:
        signal_group(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = monotonic() + 10
    while monotonic() < deadline:
        process.poll()  # Reap the leader; its exit does not prove workers exited.
        if not exists():
            break
        sleep(0.25)
    if exists():
        try:
            signal_group(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    process.wait(timeout=10)


def bootstrap_main():
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise RuntimeError("PRIVATE_LINUX_X86_64_KAGGLE_BATCH_ONLY")
    os.environ.update(RUNTIME_ENV)
    loaded_bundle()
    if OUT.exists():
        raise FileExistsError("PRESERVE_EXISTING_FAST_DEVELOPMENT_OUTPUTS")
    OUT.mkdir(parents=True, exist_ok=False)
    progress("isolated_environment", python=PYTHON_VERSION, profile=PROFILE)
    python = isolated_python()
    progress("engine_subprocess", profile=PROFILE)
    started = time.monotonic()
    with (OUT / "engine.log").open("wb") as log:
        process = subprocess.Popen([str(python), __file__, "--engine"], stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        last_forwarded = -1.0
        try:
            while process.poll() is None:
                last_forwarded = forward_engine_progress(OUT / "progress.json", last_forwarded)
                active_path = OUT / "active-request.json"
                try:
                    active = json.loads(active_path.read_bytes()) if active_path.is_file() else None
                except (OSError, ValueError):
                    active = None
                reason = watchdog_reason(started, time.monotonic(), active)
                if reason:
                    write_json(OUT / "watchdog-failure.json", {"errorCode": reason, "productionPromotionEligible": False})
                    raise RuntimeError(reason)
                time.sleep(1)
        finally:
            forward_engine_progress(OUT / "progress.json", last_forwarded)
            terminate_process_group(process)
    if process.returncode:
        raise RuntimeError("FAST_ENGINE_SUBPROCESS_FAILED")
    progress("batch_complete", profile=PROFILE)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--engine"]:
            engine_main()
        elif not sys.argv[1:]:
            bootstrap_main()
        else:
            raise ValueError("UNEXPECTED_FAST_RUNNER_ARGUMENTS")
    except Exception as error:
        if platform.system() == "Linux" and not isinstance(error, FileExistsError):
            OUT.mkdir(parents=True, exist_ok=True)
            failure = OUT / "failure.json"
            if not failure.exists():
                failure.write_bytes((compact({**fault_diagnostic(error), "profile": PROFILE,
                                              "productionPromotionEligible": False}) + "\n").encode("utf-8"))
        raise SystemExit(1)
