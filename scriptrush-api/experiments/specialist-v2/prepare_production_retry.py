"""Prepare exactly 64 additional LoRA fitting steps from recovered checkpoint 32.

Local preparation only: no submission, credentials, API, final inputs or answers.
The same frozen 144/8 teaching rows and four unlabelled DEV prompts are reused.
"""
import argparse
import ast
import base64
import copy
import hashlib
import json
import math
from pathlib import Path
import sys
import uuid
import zlib

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist-v2"
sys.path.insert(0, str(HERE / "inference"))
import runner
import probe_checkpoint
from prepare_production_dev_retry import validate_kernel_identity
import prepare_pipeline_smoke as frozen
import kaggle_train as training

RECOVERY_SHA256 = training.PRODUCTION_RETRY_RECOVERY_SHA256
TRANSPORT_SHA256 = training.PRODUCTION_RETRY_TRANSPORT_SHA256
COUNTS = {"train": 144, "validation": 8, "dev": 4}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def embedded_recovery_source(path):
    """Copy only required stdlib validators, never runner cases or entry points."""
    source = Path(path).read_text(encoding="utf-8")
    constants = {"MODEL", "REVISION", "PRODUCTION_SOURCE", "PRODUCTION_MANIFEST", "PRODUCTION_SCRIPT", "PRODUCTION_FIXTURE_MANIFEST", "PRODUCTION_DEV_FILE", "RECOVERED_BEST_METRIC"}
    functions = {"compact", "digest", "file_digest", "validate_recovery_bundle", "find_recovered_checkpoint", "validate_checkpoint_dataset_transport", "extract_checkpoint_dataset", "resolve_adapter"}
    selected = []
    found_constants, found_functions = set(), set()
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in constants:
            selected.append(ast.get_source_segment(source, node))
            found_constants.add(node.targets[0].id)
        elif isinstance(node, ast.FunctionDef) and node.name in functions:
            selected.append(ast.get_source_segment(source, node))
            found_functions.add(node.name)
    if found_constants != constants or found_functions != functions:
        raise ValueError("REQUIRED_STANDALONE_RECOVERY_VALIDATORS_MISSING")
    imports = "import hashlib\nimport json\nimport math\nfrom pathlib import Path\nimport re\nimport zipfile\n"
    raw = (imports + "\n\n" + "\n\n".join(selected) + "\n").encode("utf-8")
    compile(raw, "<pinned-recovery-validators>", "exec")
    return raw


def recovered_metadata(receipt_path, transport_path, frozen_receipt_raw):
    receipt_path = Path(receipt_path).resolve(strict=True)
    raw = receipt_path.read_bytes()
    if len(raw) > 32768 or digest(raw) != RECOVERY_SHA256:
        raise ValueError("EXACT_RECOVERED_CHECKPOINT_RECEIPT_REQUIRED")
    receipt = json.loads(raw)
    metadata = {"artifactKind": "recovered-checkpoint", "mode": "production-development-retry", "sourceNotebook": runner.PRODUCTION_SOURCE,
                "sourceVersion": 1, "model": runner.MODEL, "revision": runner.REVISION,
                "adapterSha256": {name: record["sha256"] for name, record in receipt["files"].items() if name != "trainer_state.json"},
                "trainerStateSha256": receipt["files"]["trainer_state.json"]["sha256"], "recoveryReceiptSha256": digest(raw),
                "recoveryReceiptRaw": raw.decode("utf-8"), "datasetManifestSha256": runner.PRODUCTION_MANIFEST,
                "sourceFiles": {"productionManifestSha256": runner.PRODUCTION_FIXTURE_MANIFEST, "productionDevSha256": runner.PRODUCTION_DEV_FILE,
                                "sourceScriptSha256": runner.PRODUCTION_SCRIPT, "sourceSubmissionReceiptSha256": digest(frozen_receipt_raw)}}
    runner.validate_recovery_bundle(metadata)
    for name, record in receipt["files"].items():
        path = (receipt_path.parent / name).resolve(strict=True)
        if path.parent != receipt_path.parent or not path.is_file() or path.stat().st_size != record["bytes"] or runner.file_digest(path) != record["sha256"]:
            raise ValueError("RECOVERED_CHECKPOINT_LOCAL_FILE_CHANGED")
    probe_checkpoint.validate_recovered(receipt_path.parent)
    transport_raw = Path(transport_path).read_bytes()
    if len(transport_raw) > 32768 or digest(transport_raw) != TRANSPORT_SHA256:
        raise ValueError("EXACT_READY_PRIVATE_DATASET_TRANSPORT_REQUIRED")
    transport = {"receiptRaw": transport_raw.decode("utf-8"), "receiptSha256": digest(transport_raw)}
    receipt = runner.validate_checkpoint_dataset_transport(transport, metadata)
    metadata["checkpointDatasetTransport"] = transport
    return metadata, receipt["datasetRef"]


def measure_offline(bundle):
    from huggingface_hub import try_to_load_from_cache
    from tokenizers import Tokenizer
    path = try_to_load_from_cache(runner.MODEL, "tokenizer.json", revision=runner.REVISION)
    if not isinstance(path, str) or not Path(path).is_file():
        raise ValueError("PINNED_TOKENIZER_REQUIRED_IN_LOCAL_CACHE")
    tokenizer = Tokenizer.from_file(path)
    measured = {}
    for split in ("train", "validation", "dev"):
        lengths = []
        for row in bundle[split]:
            chat = "".join(f'<|im_start|>{message["role"]}\n{message["content"]}<|im_end|>\n' for message in row["messages"])
            if split == "dev":
                chat += "<|im_start|>assistant\n"
            length = len(tokenizer.encode(chat, add_special_tokens=False).ids)
            if not 1 <= length <= (16384 if split == "dev" else 8192):
                raise ValueError("RETRY_INPUT_TOO_LONG_NO_TRUNCATION")
            lengths.append(length)
        ordered = sorted(lengths)
        measured[split] = {"count": len(lengths), "maxTokens": max(lengths), "p95Tokens": ordered[math.ceil(0.95 * len(ordered)) - 1]}
    return measured


def prepare(recovery_receipt, checkpoint_dataset_receipt):
    target = WORK / "production-retry-kaggle-run"
    dataset = WORK / "production-retry-dataset"
    receipt_path = WORK / "production-retry-submission-manifest.json"
    if target.exists() or dataset.exists() or receipt_path.exists():
        raise FileExistsError("PRESERVE_EXISTING_PRODUCTION_RETRY_PREPARATION")
    frozen_script_raw = (WORK / "production-kaggle-run" / "train.py").read_bytes()
    frozen_receipt_raw = (WORK / "production-submission-manifest.json").read_bytes()
    original = frozen.load_frozen_bundle(frozen_script_raw, json.loads(frozen_receipt_raw))
    initial, dataset_ref = recovered_metadata(recovery_receipt, checkpoint_dataset_receipt, frozen_receipt_raw)
    rows = {split: copy.deepcopy(original[split]) for split in COUNTS}
    row_hashes = {split: digest(compact(group)) for split, group in rows.items()}
    recipe = {"steps": 64, "evaluationSteps": 16, "learningRate": 2e-5, "maxContext": 8192,
              "assistantLogitsOnly": True, "seed": 39119, "developmentMode": "external", "runPurpose": "production-continuation-fit"}
    manifest = {"stage": "production-retry", "model": runner.MODEL, "revision": runner.REVISION,
                "originalDatasetManifestSha256": runner.PRODUCTION_MANIFEST,
                "originalProductionScriptSha256": digest(frozen_script_raw), "originalProductionReceiptSha256": digest(frozen_receipt_raw),
                "recoveryReceiptSha256": initial["recoveryReceiptSha256"], "trainerStateSha256": initial["trainerStateSha256"],
                "checkpointDatasetReceiptSha256": initial["checkpointDatasetTransport"]["receiptSha256"],
                "adapterSha256": initial["adapterSha256"], "counts": COUNTS, "inputRowsSha256": row_hashes,
                "runRecipe": recipe, "developmentLabelsIncluded": False, "finalInputsIncluded": False, "finalAnswersIncluded": False}
    manifest_raw = json.dumps(manifest, indent=2, allow_nan=False).encode("utf-8") + b"\n"
    run = {**recipe, "initialAdapterSha256": initial["adapterSha256"], "initialManifestSha256": runner.PRODUCTION_MANIFEST,
           "initialRecoveredCheckpoint": initial, "inputRowsSha256": row_hashes}
    bundle = {**rows, "manifestSha256": digest(manifest_raw), "run": run}
    training.validate_production_retry_bundle(bundle)
    measured = measure_offline(bundle)
    source_raw = (HERE / "kaggle_train.py").read_bytes()
    source = source_raw.decode("utf-8").replace("\r\n", "\n")
    required = {"checkpoint_safe_trainer", "persist_fit_summary", "development_policy", "validate_production_retry_bundle", "mounted_recovered_adapter"}
    if not required <= {node.name for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)}:
        raise ValueError("RECOVERED_CONTINUATION_TRAINER_SUPPORT_REQUIRED")
    validators = embedded_recovery_source(HERE / "inference" / "runner.py")
    payload = base64.b64encode(zlib.compress(compact(bundle), 9)).decode("ascii")
    validators_payload = base64.b64encode(zlib.compress(validators, 9)).decode("ascii")
    script = (f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n'
              f'SCRIPTRUSH_RECOVERY_VALIDATORS = "{validators_payload}"\n'
              f'SCRIPTRUSH_RECOVERY_VALIDATORS_SHA256 = "{digest(validators)}"\n' + source)
    compile(script, "prepared-production-retry.py", "exec")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "sciptrush/scriptrush-v2-production-retry-" + suffix, "title": "ScriptRush v2 production retry " + suffix,
                "code_file": "train.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [dataset_ref], "competition_sources": [], "kernel_sources": []}
    validate_kernel_identity(metadata["id"], metadata["title"])
    # All validation completes before any output directory exists. Existing
    # preparations are never replaced, including partial interrupted writes.
    target.mkdir(parents=True, exist_ok=False)
    dataset.mkdir(parents=True, exist_ok=False)
    (dataset / "manifest.json").write_bytes(manifest_raw)
    script_sha = frozen.write_lf(target / "train.py", script)
    metadata_sha = frozen.write_lf(target / "kernel-metadata.json", metadata)
    result = {"stage": "production-retry", "runPurpose": recipe["runPurpose"], "diagnosticOnly": False,
              "productionPromotionEligible": False, "notebook": metadata["id"], "model": runner.MODEL, "revision": runner.REVISION,
              "sourceNotebook": runner.PRODUCTION_SOURCE, "sourceVersion": 1, "sourceCheckpoint": "checkpoint-32",
              "sourceProductionScriptSha256": digest(frozen_script_raw), "sourceProductionReceiptSha256": digest(frozen_receipt_raw),
              "initialAdapterSha256": initial["adapterSha256"], "initialManifestSha256": runner.PRODUCTION_MANIFEST,
              "initialRecoveredCheckpointSha256": digest(compact(initial)), "recoveryReceiptSha256": initial["recoveryReceiptSha256"],
              "trainerStateSha256": initial["trainerStateSha256"], "checkpointDatasetRef": dataset_ref,
              "checkpointDatasetReceiptSha256": initial["checkpointDatasetTransport"]["receiptSha256"],
              "trainingSourceRawSha256": digest(source_raw), "trainingBodyLfSha256": digest(source.encode("utf-8")),
              "embeddedRecoveryValidatorsSha256": digest(validators), "scriptSha256": script_sha, "metadataSha256": metadata_sha,
              "bundleSha256": digest(compact(bundle)), "datasetManifestSha256": digest(manifest_raw), "counts": COUNTS,
              "inputRowsSha256": row_hashes, "run": run, "measuredTokens": measured,
              "additionalOptimizerSteps": 64, "initialProductionSteps": 32, "cumulativeProductionSteps": 96,
              "optimizerStateResumed": False, "developmentMode": "external", "developmentStatus": "external-pending",
              "developmentSkipped": False, "expectedDevelopmentOutputs": 0, "gpuSmokeBeforeTraining": True,
              "pretrainingSmokeTokensPerWorker": 2, "developmentLabelsUploaded": False,
              "finalInputsUploaded": False, "finalAnswersUploaded": False, "credentialsIncluded": False, "private": True}
    frozen.write_lf(receipt_path, result)
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-receipt", required=True)
    parser.add_argument("--checkpoint-dataset-receipt", required=True)
    args = parser.parse_args()
    try:
        prepare(args.recovery_receipt, args.checkpoint_dataset_receipt)
    except Exception as error:
        print(json.dumps({"errorType": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
