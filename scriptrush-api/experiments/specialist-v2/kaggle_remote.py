"""Private Kaggle experiment control. Credentials enter through a non-echoing terminal only."""
import contextlib
import argparse
import getpass
import io
import json
import logging
import os
from pathlib import Path
import sys
import warnings

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "test-results" / "specialist-v2"
RUN = WORK / "kaggle-run"
STAGES = {"utility": ("kaggle-run", "kaggle-output", "kaggle-runtime.log"),
          "production": ("production-kaggle-run", "production-kaggle-output", "production-kaggle-runtime.log"),
          "dev-inference": ("dev-inference-run", "dev-inference-kaggle-output", "dev-inference-kaggle-runtime.log"),
          "production-dev-inference": ("production-dev-inference-run", "production-dev-inference-kaggle-output", "production-dev-inference-kaggle-runtime.log"),
          "production-dev-dataset-inference": ("production-dev-dataset-inference-run", "production-dev-dataset-inference-kaggle-output", "production-dev-dataset-inference-kaggle-runtime.log"),
          "final-recovered-inference": ("final-recovered-inference-run", "final-recovered-inference-kaggle-output", "final-recovered-inference-kaggle-runtime.log"),
          "pipeline-smoke": ("pipeline-smoke-run", "pipeline-smoke-kaggle-output", "pipeline-smoke-kaggle-runtime.log"),
          "inference": ("inference-run", "inference-kaggle-output", "inference-kaggle-runtime.log")}
logging.disable(logging.CRITICAL)


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
                    if action == "push":
                        metadata_path = run / "kernel-metadata.json"
                        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                        if metadata.get("is_private") is not True:
                            raise ValueError("Private kernel required")
                        metadata["id"] = f"{owner}/{metadata['id'].split('/')[-1]}"
                        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                        result = api.kernels_push(str(run), timeout="900" if stage == "pipeline-smoke" else "10800", acc="NvidiaTeslaT4").to_dict()
                        # Kaggle may derive a new slug from the title. Use the
                        # returned identity for subsequent status/output calls.
                        if isinstance(result.get("ref"), str) and result["ref"].startswith("/code/"):
                            metadata["id"] = result["ref"].removeprefix("/code/")
                            metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                    elif action in ("status", "output", "logs"):
                        metadata = json.loads((run / "kernel-metadata.json").read_text(encoding="utf-8"))
                        if action == "status":
                            result = api.kernels_status(metadata["id"]).to_dict()
                        elif action == "logs":
                            logs = api.kernels_logs(metadata["id"])
                            (WORK / log_name).write_text(logs, encoding="utf-8")
                            # Only this experiment's fixed progress/loss JSON is
                            # forwarded. Full logs stay in the ignored evidence.
                            progress = []
                            for entry in logs.splitlines():
                                try:
                                    value = json.loads(entry)
                                except ValueError:
                                    continue
                                if isinstance(value, dict) and ("phase" in value or "loss" in value):
                                    progress.append(value)
                            result = {"logCharacters": len(logs), "progress": progress[-5:]}
                        else:
                            output = WORK / output_name
                            output.mkdir(exist_ok=True)
                            api.kernels_output(metadata["id"], str(output), force=True, quiet=True)
                            result = {"downloaded": True, "files": [str(path.relative_to(output)) for path in output.rglob("*") if path.is_file()]}
                    else:
                        raise ValueError("Unknown experiment action")
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
