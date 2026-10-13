"""Watch only the authorized private run; forward fixed progress and numeric loss fields."""
import ast
import contextlib
import getpass
import io
import json
import logging
import os
from pathlib import Path

from kaggle_remote import WORK, sanitized_failure


def main():
    logging.disable(logging.CRITICAL)
    os.environ["KAGGLE_CONFIG_DIR"] = str(WORK / "auth-empty")
    os.environ["KAGGLE_API_TOKEN"] = getpass.getpass("Kaggle credential (not echoed or saved): ").strip()
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
        metadata = json.loads((WORK / "kaggle-run" / "kernel-metadata.json").read_text(encoding="utf-8"))
        with (WORK / "kaggle-live.jsonl").open("w", encoding="utf-8") as handle:
            for event in api.kernels_logs_stream(metadata["id"]):
                handle.write(json.dumps(event) + "\n")
                handle.flush()
                for line in str(event.get("data", "")).splitlines():
                    try:
                        value = ast.literal_eval(line)
                    except (ValueError, SyntaxError):
                        continue
                    if not isinstance(value, dict):
                        continue
                    safe = {key: item for key, item in value.items() if key in ("loss", "grad_norm", "learning_rate", "epoch", "steps", "examples", "case", "outputTokens") and isinstance(item, (int, float))}
                    if value.get("phase") in ("dependencies", "load_model", "training", "blind_comparison", "complete", "failed"):
                        safe["phase"] = value["phase"]
                    if value.get("variant") in ("base", "specialist"):
                        safe["variant"] = value["variant"]
                    if safe:
                        print(json.dumps(safe), flush=True)
    except Exception as error:
        print(json.dumps(sanitized_failure(error)), flush=True)
    finally:
        os.environ.pop("KAGGLE_API_TOKEN", None)


if __name__ == "__main__":
    main()
