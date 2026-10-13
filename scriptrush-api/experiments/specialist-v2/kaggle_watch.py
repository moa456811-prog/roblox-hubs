"""Reconnect a read-only progress stream for this private experiment."""
import ast
import argparse
import contextlib
import getpass
import io
import json
import logging
import os
import time
from kaggle_remote import WORK, STAGES, sanitized_failure, read_credential


def main(stage="utility"):
    logging.disable(logging.CRITICAL)
    os.environ["KAGGLE_CONFIG_DIR"] = str(WORK / "auth-empty")
    os.environ["KAGGLE_API_TOKEN"] = read_credential()
    seen = set()
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
        metadata = json.loads((WORK / STAGES[stage][0] / "kernel-metadata.json").read_text(encoding="utf-8"))
        with (WORK / ("kaggle-live.jsonl" if stage == "utility" else f"{stage}-kaggle-live.jsonl")).open("a", encoding="utf-8") as handle:
            for attempt in range(120):
                try:
                    for event in api.kernels_logs_stream(metadata["id"]):
                        encoded = json.dumps(event)
                        if encoded in seen:
                            continue
                        seen.add(encoded)
                        handle.write(encoded + "\n")
                        handle.flush()
                        for line in str(event.get("data", "")).splitlines():
                            try:
                                value = json.loads(line)
                            except ValueError:
                                try:
                                    value = ast.literal_eval(line)
                                except (ValueError, SyntaxError):
                                    continue
                            if not isinstance(value, dict):
                                continue
                            safe = {key: item for key, item in value.items() if key in ("loss", "eval_loss", "grad_norm", "learning_rate", "epoch", "steps", "examples", "case", "outputTokens", "acceleratorCount", "maxSequenceTokens", "memoryAllocatedGb", "peakMemoryGb", "finished", "expectedOutputs") and isinstance(item, (int, float))}
                            if value.get("phase") in ("dependencies", "verify_adapter", "load_model", "token_budget_verified", "smoke_variant_passed", "generation_smoke_passed", "training", "inference", "worker_complete", "development_comparison", "final_comparison", "complete", "failed"):
                                safe["phase"] = value["phase"]
                            if value.get("variant") in ("base", "specialist"):
                                safe["variant"] = value["variant"]
                            if safe:
                                print(json.dumps(safe), flush=True)
                            if value.get("phase") in ("complete", "failed"):
                                return
                    return
                except Exception as error:
                    print(json.dumps({**sanitized_failure(error), "streamReconnect": attempt + 1}), flush=True)
                    time.sleep(5)
    finally:
        os.environ.pop("KAGGLE_API_TOKEN", None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=STAGES, default="utility")
    main(parser.parse_args().stage)
