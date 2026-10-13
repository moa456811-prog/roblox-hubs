"""Prepare a private, inference-only Kaggle script; never submit it here.

Run only after the previous training job completes and its training-summary.json
has been downloaded. From scriptrush-api:

python experiments/specialist-v2/inference/prepare.py \
  --test-inputs test-results/specialist-v2/final-inputs.jsonl \
  --production-inputs experiments/specialist-v2/production/artifacts/prompts.jsonl \
  --adapter-summary test-results/specialist-v2/kaggle-output/scriptrush-specialist-v2/training-summary.json

For the separately trained production continuation, add BOTH:
  --source-notebook sciptrush/scriptrush-v2-production-<private-run-suffix>
  --training-manifest-sha256 <explicit-64-hex-SHA256-from-the-private-run-receipt>
Only that owner's production-prefixed notebook or the original pinned v2 source
is accepted. The source and expected training-manifest hash are embedded and
validated at runtime; adapter file and full training-summary hashes stay pinned.

Inputs contain id/messages only (optional benchmark/promptSha256 metadata is
checked, then discarded). Exactly 12 final test prompts and at most 8 production
prompts are accepted. Assistant messages, expected references and all other row
fields are refused. Model tokenizer is loaded at its pinned revision for a local
prompt-budget check; no LLM or Kaggle API is called. Raw training data, labels,
credentials and the complete training summary never enter the notebook.

Output: ignored test-results/specialist-v2/inference-run/{run.py,kernel-metadata.json}
and inference-submission-manifest.json. kernel_sources mounts only the private
completed training notebook. This module has no authentication or push code.

Budget: two independent T4 model copies, up to 40 outputs, 4096 new tokens and
240 seconds per output. Worst-case generation ceiling is about 80 minutes with
two GPUs, plus dependency/model loading. Actual inference may be much shorter.
HF max_time is checked between steps, so a final CUDA step can slightly overrun.
"""
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import re
import uuid
import zlib

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[2] / "test-results" / "specialist-v2"
_spec = importlib.util.spec_from_file_location("scriptrush_inference_runner", HERE / "runner.py")
runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runner)


def load_inputs(path, group):
    if group not in ("test", "production"):
        raise ValueError("INVALID_INPUT_GROUP")
    raw = Path(path).read_bytes()
    rows = [json.loads(line) for line in raw.decode("utf-8-sig").splitlines() if line.strip()]
    if (group == "test" and len(rows) != 12) or (group == "production" and not 1 <= len(rows) <= 8):
        raise ValueError("INVALID_INPUT_CASE_BUDGET")
    result = []
    for row in rows:
        if not isinstance(row, dict) or not {"id", "messages"} <= set(row) or not set(row) <= {"id", "messages", "benchmark", "promptSha256"}:
            raise ValueError("EXPECTED_LABEL_OR_UNEXPECTED_INPUT_FIELD")
        messages = runner.clean_messages(row["messages"])
        prompt_hash = runner.digest(runner.compact(messages))
        if "promptSha256" in row and row["promptSha256"] != prompt_hash:
            raise ValueError("PROVIDED_PROMPT_HASH_MISMATCH")
        result.append({"id": row["id"], "group": group, "messages": messages, "promptSha256": prompt_hash})
    return result, runner.digest(raw)


def adapter_metadata(path, expected_training_manifest=runner.V2_TRAINING_MANIFEST_SHA256):
    if not isinstance(expected_training_manifest, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_training_manifest):
        raise ValueError("INVALID_EXPECTED_TRAINING_MANIFEST_SHA256")
    raw = Path(path).read_bytes()
    summary = json.loads(raw)
    if summary.get("model") != runner.MODEL or summary.get("revision") != runner.REVISION:
        raise ValueError("UNEXPECTED_TRAINING_MODEL_REVISION")
    hashes = summary.get("adapterSha256")
    if not isinstance(hashes, dict) or "adapter_config.json" not in hashes or "adapter_model.safetensors" not in hashes:
        raise ValueError("MISSING_COMPLETED_ADAPTER_HASHES")
    for name, value in hashes.items():
        if not isinstance(name, str) or Path(name).name != name or not re.fullmatch(r"[a-zA-Z0-9_.-]+", name) or not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ValueError("INVALID_ADAPTER_HASHES")
    manifest_hash = summary.get("datasetManifestSha256")
    if manifest_hash != expected_training_manifest:
        raise ValueError("UNEXPECTED_FROZEN_DATASET_MANIFEST")
    return {"adapterSha256": hashes, "adapterSummarySha256": runner.digest(raw), "datasetManifestSha256": manifest_hash}


def measure_prompts(cases):
    from tokenizers import Tokenizer
    tokenizer = Tokenizer.from_pretrained(runner.MODEL, revision=runner.REVISION)
    for row in cases:
        # Exact simple Qwen system/user template, no tools or assistant prefill.
        # Runtime additionally verifies these counts with apply_chat_template.
        chat = "".join("<|im_start|>" + message["role"] + "\n" + message["content"] + "<|im_end|>\n" for message in row["messages"]) + "<|im_start|>assistant\n"
        row["preparedInputTokens"] = len(tokenizer.encode(chat, add_special_tokens=False).ids)
        if row["preparedInputTokens"] > runner.MAX_INPUT_TOKENS:
            raise ValueError("PROMPT_BUDGET_EXCEEDED_NO_TRUNCATION")
    return cases


def prepare(test_inputs, production_inputs, adapter_summary, source_notebook=runner.SOURCE_NOTEBOOK, training_manifest_sha256=None):
    if not runner.allowed_source_notebook(source_notebook):
        raise ValueError("UNEXPECTED_PRIVATE_SOURCE_NOTEBOOK")
    if source_notebook != runner.SOURCE_NOTEBOOK and training_manifest_sha256 is None:
        raise ValueError("PRODUCTION_CONTINUATION_REQUIRES_EXPLICIT_TRAINING_MANIFEST_SHA256")
    expected_manifest = training_manifest_sha256 or runner.V2_TRAINING_MANIFEST_SHA256
    tests, test_hash = load_inputs(test_inputs, "test")
    production, production_hash = load_inputs(production_inputs, "production") if production_inputs else ([], None)
    metadata = adapter_metadata(adapter_summary, expected_manifest)
    cases = measure_prompts(tests + production)
    bundle = {"formatVersion": 1, "sourceNotebook": source_notebook, "model": runner.MODEL, "revision": runner.REVISION,
              **metadata, "sourceFiles": {"testInputsSha256": test_hash, "productionInputsSha256": production_hash}, "cases": cases,
              "limits": {"maxInputTokens": runner.MAX_INPUT_TOKENS, "maxNewTokens": runner.MAX_NEW_TOKENS, "maxSeconds": runner.MAX_SECONDS}}
    runner.validate_bundle(bundle)
    payload = base64.b64encode(zlib.compress(runner.compact(bundle).encode("utf-8"), 9)).decode("ascii")
    source = f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n' + (HERE / "runner.py").read_text(encoding="utf-8")
    target = WORK / "inference-run"
    target.mkdir(parents=True, exist_ok=True)
    if (target / "run.py").exists() or (target / "kernel-metadata.json").exists():
        raise FileExistsError("EXISTING_INFERENCE_BUNDLE_PRESERVE_BEFORE_REPREPARING")
    suffix = uuid.uuid4().hex[:8]
    kaggle = {"id": "sciptrush/scriptrush-v2-inference-" + suffix, "title": "ScriptRush v2 inference " + suffix,
              "code_file": "run.py", "language": "python", "kernel_type": "script", "is_private": True,
              "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
              "dataset_sources": [], "competition_sources": [], "kernel_sources": [source_notebook]}
    (target / "run.py").write_text(source, encoding="utf-8", newline="\n")
    (target / "kernel-metadata.json").write_text(json.dumps(kaggle, indent=2), encoding="utf-8", newline="\n")
    receipt = {"sourceNotebook": source_notebook, "model": runner.MODEL, "revision": runner.REVISION,
               "scriptSha256": runner.digest(source), "bundleSha256": runner.digest(runner.compact(bundle)),
               "testCases": len(tests), "productionCases": len(production), "expectedOutputs": len(cases) * 2,
               "inputTokens": [{"id": row["id"], "group": row["group"], "tokens": row["preparedInputTokens"], "promptSha256": row["promptSha256"]} for row in cases],
               "maxInputTokens": max(row["preparedInputTokens"] for row in cases), "limits": bundle["limits"],
               "private": True, "trainingUploaded": False, "answersUploaded": False, "expectedLabelsUploaded": False,
               "credentialsIncluded": False, "sourceFiles": bundle["sourceFiles"], **metadata}
    (WORK / "inference-submission-manifest.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(receipt, indent=2))
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--test-inputs", required=True)
    parser.add_argument("--production-inputs")
    parser.add_argument("--adapter-summary", required=True)
    parser.add_argument("--source-notebook", default=runner.SOURCE_NOTEBOOK)
    parser.add_argument("--training-manifest-sha256", help="Explicit SHA256 from the private continuation receipt; required for a production source.")
    args = parser.parse_args()
    try:
        prepare(args.test_inputs, args.production_inputs, args.adapter_summary, args.source_notebook, args.training_manifest_sha256)
    except Exception as error:
        print(json.dumps({"errorType": type(error).__name__}), file=__import__("sys").stderr)
        raise SystemExit(1)
