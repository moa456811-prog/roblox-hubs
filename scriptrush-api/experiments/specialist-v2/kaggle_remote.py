"""Private Kaggle experiment control. Credentials enter through a non-echoing terminal only."""
import contextlib
import argparse
import getpass
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import sys
import warnings

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "test-results" / "specialist-v2"
RUN = WORK / "kaggle-run"
STAGES = {"utility": ("kaggle-run", "kaggle-output", "kaggle-runtime.log"),
          "production": ("production-kaggle-run", "production-kaggle-output", "production-kaggle-runtime.log"),
          "production-retry": ("production-retry-kaggle-run", "production-retry-kaggle-output", "production-retry-kaggle-runtime.log"),
          "production-retry-dev-inference": ("production-retry-dev-inference-run", "production-retry-dev-inference-kaggle-output", "production-retry-dev-inference-kaggle-runtime.log"),
          "dev-inference": ("dev-inference-run", "dev-inference-kaggle-output", "dev-inference-kaggle-runtime.log"),
          "production-dev-inference": ("production-dev-inference-run", "production-dev-inference-kaggle-output", "production-dev-inference-kaggle-runtime.log"),
          "production-dev-dataset-inference": ("production-dev-dataset-inference-run", "production-dev-dataset-inference-kaggle-output", "production-dev-dataset-inference-kaggle-runtime.log"),
          "final-recovered-inference": ("final-recovered-inference-run", "final-recovered-inference-kaggle-output", "final-recovered-inference-kaggle-runtime.log"),
          "pipeline-smoke": ("pipeline-smoke-run", "pipeline-smoke-kaggle-output", "pipeline-smoke-kaggle-runtime.log"),
          "inference": ("inference-run", "inference-kaggle-output", "inference-kaggle-runtime.log")}
logging.disable(logging.CRITICAL)
INFERENCE_OUTPUT_PATTERN = r"^(?!.*(?:^|[/\\])checkpoint-dataset-extracted(?:[/\\]|$)).*$"


def emit(value):
    print(json.dumps(value), flush=True)


def read_credential():
    if not sys.stdin.isatty():
        raise ValueError("TTY_REQUIRED_FOR_NON_ECHOING_CREDENTIAL_INPUT")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        token = getpass.getpass("Kaggle credential (not echoed or saved): ").strip()
    if not token or "\n" in token or "\r" in token:
        raise ValueError("INVALID_CREDENTIAL_INPUT")
    return token


def sanitized_failure(error):
    description = str(error).lower()
    response = getattr(error, "response", None)
    return {"ok": False, "errorType": type(error).__name__,
            "status": getattr(response, "status_code", None),
            "categories": [word for word in ("credential", "token", "unauthorized", "forbidden", "permission", "verify", "verification", "phone", "quota", "gpu", "internet", "timeout") if word in description]}


def bounded_kernel_identity(value, owner, returned=False):
    if not isinstance(value, str) or not isinstance(owner, str):
        raise ValueError("INVALID_BOUNDED_KERNEL_IDENTITY")
    if returned and value.startswith("/code/"):
        value = value.removeprefix("/code/")
    match = re.fullmatch(r"([a-z0-9][a-z0-9_-]{0,49})/([a-z0-9][a-z0-9-]{4,48}[a-z0-9])", value)
    if match is None or match.group(1) != owner:
        raise ValueError("KERNEL_IDENTITY_OWNER_OR_BOUND_MISMATCH")
    return value


def prepared_kernel(run, owner):
    raw = (run / "kernel-metadata.json").read_bytes()
    metadata = json.loads(raw)
    if metadata.get("is_private") is not True:
        raise ValueError("PRIVATE_KERNEL_REQUIRED")
    identifier = bounded_kernel_identity(metadata.get("id"), owner)
    return identifier, hashlib.sha256(raw).hexdigest(), raw


def identity_sidecar(run):
    # Keep remote bookkeeping outside the immutable prepared upload directory.
    return WORK / (run.name + "-accepted-identity.json")


def resolve_kernel_identity(run, owner):
    prepared, metadata_hash, _ = prepared_kernel(run, owner)
    path = identity_sidecar(run)
    if not path.exists():
        return prepared
    value = json.loads(path.read_bytes())
    if (set(value) != {"formatVersion", "preparedId", "acceptedId", "preparedMetadataSha256"}
            or value.get("formatVersion") != 1 or value.get("preparedId") != prepared
            or value.get("preparedMetadataSha256") != metadata_hash):
        raise ValueError("ACCEPTED_KERNEL_IDENTITY_DOES_NOT_MATCH_PREPARATION")
    return bounded_kernel_identity(value.get("acceptedId"), owner)


def push_kernel(api, run, owner, stage):
    prepared, metadata_hash, raw = prepared_kernel(run, owner)
    # Refuse a stale sidecar before any mutation is sent to Kaggle.
    resolve_kernel_identity(run, owner)
    result = api.kernels_push(str(run), timeout="900" if stage == "pipeline-smoke" else "10800",
                              acc="NvidiaTeslaT4").to_dict()
    if (run / "kernel-metadata.json").read_bytes() != raw:
        raise ValueError("PREPARED_KERNEL_METADATA_CHANGED_DURING_PUSH")
    if not isinstance(result, dict):
        raise ValueError("INVALID_KERNEL_PUSH_RESPONSE")
    fields = {key.replace("_", "").lower(): value for key, value in result.items()}
    if fields.get("error") or fields.get("errormessage") or any(
            value for key, value in fields.items() if key.startswith("invalid") and key.endswith("sources")):
        raise ValueError("KERNEL_PUSH_REJECTED")
    accepted = bounded_kernel_identity(result.get("ref"), owner, returned=True)
    value = {"formatVersion": 1, "preparedId": prepared, "acceptedId": accepted,
             "preparedMetadataSha256": metadata_hash}
    path = identity_sidecar(run)
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_bytes((json.dumps(value, indent=2) + "\n").encode("utf-8"))
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return result


def experiment_action(api, owner, stage, action):
    run_name, output_name, log_name = STAGES[stage]
    run = WORK / run_name
    if action == "push":
        return push_kernel(api, run, owner, stage)
    if action not in ("status", "output", "logs"):
        raise ValueError("Unknown experiment action")
    identifier = resolve_kernel_identity(run, owner)
    if action == "status":
        return api.kernels_status(identifier).to_dict()
    if action == "logs":
        logs = api.kernels_logs(identifier)
        (WORK / log_name).write_text(logs, encoding="utf-8", newline="\n")
        # Only this experiment's fixed progress/loss JSON is forwarded.
        progress = []
        for entry in logs.splitlines():
            try:
                value = json.loads(entry)
            except ValueError:
                continue
            if isinstance(value, dict) and ("phase" in value or "loss" in value):
                progress.append(value)
        return {"logCharacters": len(logs), "progress": progress[-5:]}
    output = WORK / output_name
    output.mkdir(exist_ok=True)
    options = {"force": True, "quiet": True}
    if stage.endswith("inference"):
        options["file_pattern"] = INFERENCE_OUTPUT_PATTERN
    api.kernels_output(identifier, str(output), **options)
    return {"downloaded": True, "files": [str(path.relative_to(output)) for path in output.rglob("*") if path.is_file()]}


def main(stage="utility"):
    run_name, output_name, log_name = STAGES[stage]
    run = WORK / run_name
    WORK.mkdir(parents=True, exist_ok=True)
    os.environ["KAGGLE_CONFIG_DIR"] = str(WORK / "auth-empty")
    token = read_credential()
    if not token:
        emit({"ok": False, "errorType": "MissingCredential"})
        return
    os.environ["KAGGLE_API_TOKEN"] = token
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
            owner = api.get_config_value("username")
            quota = api.quota_view().to_dict()
        emit({"ok": True, "authenticated": True, "owner": owner, "quota": quota})
        for line in sys.stdin:
            try:
                command = json.loads(line)
                action = command.get("action")
                if action == "exit":
                    break
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    result = experiment_action(api, owner, stage, action)
                emit({"ok": True, "action": action, "result": result})
            except Exception as error:
                emit(sanitized_failure(error))
    except (Exception, SystemExit) as error:
        emit(sanitized_failure(error))
    finally:
        os.environ.pop("KAGGLE_API_TOKEN", None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=STAGES, default="utility")
    main(parser.parse_args().stage)
