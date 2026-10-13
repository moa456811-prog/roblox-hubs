"""Prepare only the four original utility developer prompts after training.

No submission, GPU, credentials, final/test prompts or answers are included.
Writes ignored dev-inference-run and dev-inference-submission-manifest.json.
"""
import argparse
import base64
import json
from pathlib import Path
import uuid
import zlib

import prepare as final_prepare
import runner

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[2] / "test-results" / "specialist-v2"


def load_selected_inputs():
    manifest_file = WORK / "dataset" / "manifest.json"
    manifest_raw = manifest_file.read_bytes()
    if runner.digest(manifest_raw) != runner.V2_TRAINING_MANIFEST_SHA256:
        raise ValueError("FROZEN_UTILITY_MANIFEST_CHANGED")
    manifest = json.loads(manifest_raw)
    dev_raw = (manifest_file.parent / "dev.jsonl").read_bytes()
    if runner.digest(dev_raw) != manifest["files"]["dev"]["sha256"]:
        raise ValueError("FROZEN_DEVELOPMENT_FILE_CHANGED")
    frozen = {row["id"]: row for row in (json.loads(line) for line in dev_raw.decode("utf-8").splitlines() if line.strip())}
    selected_raw = (WORK / "pilot-dev.jsonl").read_bytes()
    selected = [json.loads(line) for line in selected_raw.decode("utf-8-sig").splitlines() if line.strip()]
    if tuple(row["id"] for row in selected) != runner.DEV_IDS:
        raise ValueError("FOUR_ORIGINAL_DEVELOPMENT_IDS_REQUIRED")
    cases = []
    for row in selected:
        if row.get("split") != "dev" or row["id"] not in frozen or frozen[row["id"]].get("split") != "dev":
            raise ValueError("ONLY_FROZEN_DEVELOPMENT_SPLIT_ALLOWED")
        # Labels stay local. Reject tools/other roles instead of stripping them.
        messages = runner.clean_messages([message for message in row["messages"] if message.get("role") != "assistant"])
        expected_inputs = runner.clean_messages([message for message in frozen[row["id"]]["messages"] if message.get("role") != "assistant"])
        if messages != expected_inputs:
            raise ValueError("INITIAL_DEVELOPMENT_PROMPT_CHANGED")
        cases.append({"id": row["id"], "group": "dev", "messages": messages, "promptSha256": runner.digest(runner.compact(messages))})
    return cases, {"devInputsSha256": runner.digest(selected_raw), "frozenManifestSha256": runner.digest(manifest_raw), "frozenDevSha256": runner.digest(dev_raw)}


def measure_offline(cases):
    from huggingface_hub import try_to_load_from_cache
    from tokenizers import Tokenizer
    local = try_to_load_from_cache(runner.MODEL, "tokenizer.json", revision=runner.REVISION)
    if not isinstance(local, str) or not Path(local).is_file():
        raise ValueError("PINNED_TOKENIZER_REQUIRED_IN_LOCAL_CACHE")
    tokenizer = Tokenizer.from_file(local)
    for row in cases:
        chat = "".join("<|im_start|>" + message["role"] + "\n" + message["content"] + "<|im_end|>\n" for message in row["messages"]) + "<|im_start|>assistant\n"
        row["preparedInputTokens"] = len(tokenizer.encode(chat, add_special_tokens=False).ids)
        if row["preparedInputTokens"] > runner.MAX_INPUT_TOKENS:
            raise ValueError("DEVELOPMENT_PROMPT_TOO_LONG_NO_TRUNCATION")
    return cases


def prepare_dev_retry(adapter_summary):
    cases, sources = load_selected_inputs()
    metadata = final_prepare.adapter_metadata(adapter_summary)
    summary = json.loads(Path(adapter_summary).read_bytes())
    if summary.get("steps") != 96 or tuple(summary.get("developmentIds", [])) != runner.DEV_IDS:
        raise ValueError("COMPLETED_ORIGINAL_UTILITY_TRAINING_REQUIRED")
    runner.find_adapter(Path(adapter_summary).parent, metadata["adapterSha256"], metadata["adapterSummarySha256"], metadata["datasetManifestSha256"])
    cases = measure_offline(cases)
    bundle = {"formatVersion": 1, "mode": "development-retry", "sourceNotebook": runner.SOURCE_NOTEBOOK, "model": runner.MODEL,
              "revision": runner.REVISION, **metadata, "sourceFiles": sources, "cases": cases,
              "limits": {"maxInputTokens": runner.MAX_INPUT_TOKENS, "maxNewTokens": runner.MAX_NEW_TOKENS, "maxSeconds": runner.MAX_SECONDS}}
    runner.validate_bundle(bundle)
    target = WORK / "dev-inference-run"
    if (target / "run.py").exists() or (target / "kernel-metadata.json").exists():
        raise FileExistsError("PRESERVE_EXISTING_DEVELOPMENT_INFERENCE_RUN")
    payload = base64.b64encode(zlib.compress(runner.compact(bundle).encode("utf-8"), 9)).decode("ascii")
    source = f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n' + (HERE / "runner.py").read_text(encoding="utf-8")
    suffix = uuid.uuid4().hex[:8]
    kaggle = {"id": "sciptrush/scriptrush-v2-dev-inference-" + suffix, "title": "ScriptRush v2 dev inference " + suffix,
              "code_file": "run.py", "language": "python", "kernel_type": "script", "is_private": True,
              "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4", "dataset_sources": [],
              "competition_sources": [], "kernel_sources": [runner.SOURCE_NOTEBOOK]}
    target.mkdir(parents=True, exist_ok=True)
    (target / "run.py").write_text(source, encoding="utf-8", newline="\n")
    (target / "kernel-metadata.json").write_text(json.dumps(kaggle, indent=2) + "\n", encoding="utf-8", newline="\n")
    receipt = {"stage": "dev-inference", "mode": "development-retry", "sourceNotebook": runner.SOURCE_NOTEBOOK,
               "notebook": kaggle["id"], "model": runner.MODEL, "revision": runner.REVISION, **metadata,
               "scriptSha256": runner.digest(source), "bundleSha256": runner.digest(runner.compact(bundle)),
               "developmentIds": list(runner.DEV_IDS), "devCases": 4, "expectedOutputs": 8, "sourceFiles": sources,
               "inputTokens": [{"id": row["id"], "tokens": row["preparedInputTokens"], "promptSha256": row["promptSha256"]} for row in cases],
               "maxInputTokens": max(row["preparedInputTokens"] for row in cases), "limits": bundle["limits"],
               "private": True, "trainingUploaded": False, "answersUploaded": False, "expectedLabelsUploaded": False,
               "finalInputsUploaded": False, "credentialsIncluded": False, "gpuSmokeBeforeDevelopment": True,
               "autocast": "cuda-float16"}
    (WORK / "dev-inference-submission-manifest.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(receipt, indent=2))
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-summary", required=True)
    args = parser.parse_args()
    try:
        prepare_dev_retry(args.adapter_summary)
    except Exception as error:
        print(json.dumps({"errorType": type(error).__name__}), file=__import__("sys").stderr)
        raise SystemExit(1)
