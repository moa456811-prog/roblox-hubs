"""Prepare four frozen DEV inputs for an actually completed production retry.

Local preparation only. The source notebook must be confirmed COMPLETE by the
caller before submission; this helper verifies its downloaded, completed fit,
exact weights and the frozen retry preparation. No final inputs are read.
"""
import argparse
import ast
import base64
import json
from pathlib import Path
import sys
import uuid
import zlib

import prepare_production_dev_retry as production_dev
import runner

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[2] / "test-results" / "specialist-v2"
LIBRARY = HERE.parents[2] / "src" / "lib"
STAGE = "production-retry-dev-inference"
COUNTS = {"train": 144, "validation": 8, "dev": 4}
RECIPE = {"steps": 64, "evaluationSteps": 16, "learningRate": 2e-5, "maxContext": 8192,
          "assistantLogitsOnly": True, "seed": 39119, "developmentMode": "external",
          "runPurpose": "production-continuation-fit"}


def encoded_bundle(script_raw):
    """Read the frozen data payload as a literal; never execute the trainer."""
    values = []
    for node in ast.parse(script_raw.decode("utf-8")).body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "SCRIPTRUSH_DATA_BUNDLE" for target in node.targets):
            values.append(ast.literal_eval(node.value))
    if len(values) != 1 or not isinstance(values[0], str):
        raise ValueError("ONE_FROZEN_RETRY_DATA_BUNDLE_REQUIRED")
    raw = zlib.decompress(base64.b64decode(values[0], validate=True))
    bundle = json.loads(raw)
    if not isinstance(bundle, dict) or set(bundle) != {"train", "validation", "dev", "manifestSha256", "run"}:
        raise ValueError("UNEXPECTED_RETRY_DATA_BUNDLE_FIELDS")
    return bundle


def verified_retry_source():
    receipt_raw = (WORK / "production-retry-submission-manifest.json").read_bytes()
    receipt = json.loads(receipt_raw)
    script_raw = (WORK / "production-retry-kaggle-run" / "train.py").read_bytes()
    metadata_raw = (WORK / "production-retry-kaggle-run" / "kernel-metadata.json").read_bytes()
    metadata = json.loads(metadata_raw)
    manifest_raw = (WORK / "production-retry-dataset" / "manifest.json").read_bytes()
    manifest = json.loads(manifest_raw)
    bundle = encoded_bundle(script_raw)
    if (receipt.get("stage") != "production-retry" or receipt.get("model") != runner.MODEL or receipt.get("revision") != runner.REVISION
            or receipt.get("private") is not True or receipt.get("diagnosticOnly") is not False
            or receipt.get("counts") != COUNTS or receipt.get("developmentLabelsUploaded") is not False
            or receipt.get("finalInputsUploaded") is not False or receipt.get("finalAnswersUploaded") is not False
            or receipt.get("credentialsIncluded") is not False):
        raise ValueError("PRIVATE_PRODUCTION_RETRY_PREPARATION_REQUIRED")
    if (runner.digest(script_raw) != receipt.get("scriptSha256") or runner.digest(metadata_raw) != receipt.get("metadataSha256")
            or runner.digest(manifest_raw) != receipt.get("datasetManifestSha256")
            or runner.digest(runner.compact(bundle)) != receipt.get("bundleSha256")):
        raise ValueError("PRODUCTION_RETRY_FROZEN_RAW_HASH_MISMATCH")
    if (metadata.get("id") != receipt.get("notebook") or metadata.get("is_private") is not True
            or metadata.get("code_file") != "train.py" or metadata.get("kernel_sources") != []
            or metadata.get("competition_sources") != [] or metadata.get("dataset_sources") != [receipt.get("checkpointDatasetRef")]):
        raise ValueError("PRODUCTION_RETRY_PRIVATE_SOURCE_METADATA_MISMATCH")
    production_dev.validate_kernel_identity(metadata["id"], metadata["title"])
    config = receipt.get("run")
    if not isinstance(config, dict) or config != bundle["run"] or any(type(config.get(key)) is not type(value) or config.get(key) != value for key, value in RECIPE.items()):
        raise ValueError("PRODUCTION_RETRY_RECIPE_MISMATCH")
    if (manifest.get("stage") != "production-retry" or manifest.get("model") != runner.MODEL or manifest.get("revision") != runner.REVISION
            or manifest.get("counts") != COUNTS or manifest.get("runRecipe") != RECIPE
            or manifest.get("originalDatasetManifestSha256") != runner.PRODUCTION_MANIFEST
            or manifest.get("developmentLabelsIncluded") is not False or manifest.get("finalInputsIncluded") is not False
            or manifest.get("finalAnswersIncluded") is not False
            or bundle["manifestSha256"] != receipt["datasetManifestSha256"]
            or config.get("initialManifestSha256") != runner.PRODUCTION_MANIFEST
            or receipt.get("initialManifestSha256") != runner.PRODUCTION_MANIFEST):
        raise ValueError("PRODUCTION_RETRY_DATASET_LINEAGE_MISMATCH")
    row_hashes = {}
    for split, count in COUNTS.items():
        rows = bundle[split]
        if not isinstance(rows, list) or len(rows) != count or len({row["id"] for row in rows}) != count:
            raise ValueError("PRODUCTION_RETRY_ROW_COUNTS_OR_IDENTITIES_MISMATCH")
        row_hashes[split] = runner.digest(runner.compact(rows))
    if (row_hashes != receipt.get("inputRowsSha256") or row_hashes != config.get("inputRowsSha256")
            or row_hashes != manifest.get("inputRowsSha256")):
        raise ValueError("PRODUCTION_RETRY_INPUT_ROW_HASH_MISMATCH")
    if tuple(row["id"] for row in bundle["dev"]) != runner.PRODUCTION_DEV_IDS:
        raise ValueError("ONLY_FOUR_FROZEN_PRODUCTION_DEVELOPMENT_CASES_ALLOWED")
    for row in bundle["dev"]:
        if set(row) != {"id", "messages"}:
            raise ValueError("UNLABELLED_RETRY_DEVELOPMENT_INPUTS_REQUIRED")
        runner.clean_messages(row["messages"])
    initial = config.get("initialRecoveredCheckpoint")
    if (not isinstance(initial, dict) or receipt.get("initialRecoveredCheckpointSha256") != runner.digest(runner.compact(initial))
            or receipt.get("initialAdapterSha256") != initial.get("adapterSha256")
            or config.get("initialAdapterSha256") != initial.get("adapterSha256")
            or manifest.get("adapterSha256") != initial.get("adapterSha256")
            or receipt.get("recoveryReceiptSha256") != initial.get("recoveryReceiptSha256")
            or manifest.get("recoveryReceiptSha256") != initial.get("recoveryReceiptSha256")
            or receipt.get("trainerStateSha256") != initial.get("trainerStateSha256")
            or manifest.get("trainerStateSha256") != initial.get("trainerStateSha256")):
        raise ValueError("PRODUCTION_RETRY_INITIAL_RECOVERY_MISMATCH")
    runner.validate_recovery_bundle(initial)
    transport = runner.validate_checkpoint_dataset_transport(initial.get("checkpointDatasetTransport"), initial)
    if (receipt.get("checkpointDatasetRef") != transport["datasetRef"]
            or receipt.get("checkpointDatasetReceiptSha256") != initial["checkpointDatasetTransport"]["receiptSha256"]
            or manifest.get("checkpointDatasetReceiptSha256") != initial["checkpointDatasetTransport"]["receiptSha256"]):
        raise ValueError("PRODUCTION_RETRY_INITIAL_TRANSPORT_MISMATCH")
    return receipt, runner.digest(receipt_raw), config


def verify_current_production_sources():
    raw = (production_dev.PRODUCTION / "manifest.json").read_bytes()
    if runner.digest(raw) != runner.PRODUCTION_FIXTURE_MANIFEST:
        raise ValueError("FROZEN_PRODUCTION_MANIFEST_CHANGED")
    sources = json.loads(raw).get("sourceSha256")
    if not isinstance(sources, dict) or len(sources) != 12:
        raise ValueError("TWELVE_CAPTURED_PRODUCTION_SOURCES_REQUIRED")
    root = LIBRARY.resolve(strict=True)
    for relative, expected in sources.items():
        path = (root / relative).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file() or runner.file_digest(path) != expected:
            raise ValueError("CAPTURED_PRODUCTION_APPLICATION_SOURCE_CHANGED")


def build_bundle(adapter_summary_path):
    receipt, receipt_sha, config = verified_retry_source()
    verify_current_production_sources()
    cases = production_dev.production_inputs()
    summary_path = Path(adapter_summary_path).resolve(strict=True)
    if summary_path.name != "training-summary.json":
        raise ValueError("DOWNLOADED_TRAINING_SUMMARY_FILE_REQUIRED")
    summary_raw = summary_path.read_bytes()
    summary = json.loads(summary_raw)
    bundle = {"formatVersion": 1, "mode": "production-development-completed", "sourceNotebook": receipt["notebook"],
              "model": runner.MODEL, "revision": runner.REVISION, "adapterSha256": summary.get("adapterSha256"),
              "adapterSummarySha256": runner.digest(summary_raw), "datasetManifestSha256": receipt["datasetManifestSha256"],
              "sourceFiles": {"productionManifestSha256": runner.PRODUCTION_FIXTURE_MANIFEST,
                              "productionDevSha256": runner.PRODUCTION_DEV_FILE, "sourceScriptSha256": receipt["scriptSha256"],
                              "sourceSubmissionReceiptSha256": receipt_sha,
                              "initialRecoveredCheckpointSha256": runner.canonical_digest(config["initialRecoveredCheckpoint"])},
              "cases": cases, "limits": {"maxInputTokens": runner.MAX_INPUT_TOKENS,
                                          "maxNewTokens": runner.MAX_NEW_TOKENS, "maxSeconds": runner.MAX_SECONDS}}
    runner.validate_bundle(bundle)
    runner.validate_completed_production_summary(summary, bundle)
    if summary.get("initialRecoveredCheckpoint") != config["initialRecoveredCheckpoint"] or summary.get("initialAdapterSha256") != config["initialAdapterSha256"]:
        raise ValueError("COMPLETED_SUMMARY_AND_FROZEN_RETRY_INITIAL_ADAPTER_DIFFER")
    if [row["messages"] for row in cases] != [row["messages"] for row in encoded_bundle((WORK / "production-retry-kaggle-run" / "train.py").read_bytes())["dev"]]:
        raise ValueError("FROZEN_RETRY_AND_ORIGINAL_DEVELOPMENT_INPUTS_DIFFER")
    adapter = runner.resolve_adapter(summary_path.parent, bundle)
    if adapter.parent != summary_path.parent:
        raise ValueError("COMPLETED_SUMMARY_AND_ADAPTER_MUST_BE_SIBLINGS")
    return bundle


def prepare(adapter_summary_path):
    target = WORK / (STAGE + "-run")
    receipt_path = WORK / (STAGE + "-submission-manifest.json")
    if target.exists() or receipt_path.exists():
        raise FileExistsError("PRESERVE_EXISTING_COMPLETED_PRODUCTION_DEVELOPMENT_PREPARATION")
    bundle = build_bundle(adapter_summary_path)
    payload = base64.b64encode(zlib.compress(runner.compact(bundle).encode("utf-8"), 9)).decode("ascii")
    source = (HERE / "runner.py").read_text(encoding="utf-8").replace("\r\n", "\n")
    script = f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n' + source
    compile(script, "prepared-completed-production-dev.py", "exec")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "sciptrush/scriptrush-v2-prod-retry-dev-" + suffix, "title": "ScriptRush v2 prod retry dev " + suffix,
                "code_file": "run.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [], "competition_sources": [], "kernel_sources": [bundle["sourceNotebook"]]}
    production_dev.validate_kernel_identity(metadata["id"], metadata["title"])
    script_raw = script.encode("utf-8")
    metadata_raw = (json.dumps(metadata, indent=2) + "\n").encode("utf-8")
    result = {"stage": STAGE, "mode": bundle["mode"], "artifactKind": "completed-training-adapter",
              "notebook": metadata["id"], "sourceNotebook": bundle["sourceNotebook"], "model": runner.MODEL, "revision": runner.REVISION,
              "scriptSha256": runner.digest(script_raw), "metadataSha256": runner.digest(metadata_raw),
              "bundleSha256": runner.digest(runner.compact(bundle)), "adapterSha256": bundle["adapterSha256"],
              "adapterSummarySha256": bundle["adapterSummarySha256"], "datasetManifestSha256": bundle["datasetManifestSha256"],
              "sourceFiles": bundle["sourceFiles"], "developmentIds": list(runner.PRODUCTION_DEV_IDS), "devCases": 4, "expectedOutputs": 8,
              "inputTokens": [{"id": row["id"], "tokens": row["preparedInputTokens"], "promptSha256": row["promptSha256"]} for row in bundle["cases"]],
              "limits": bundle["limits"], "sourceFitStatus": "complete", "sourceNotebookCompleteMustBeVerifiedBeforePush": True,
              "trainingSummaryFabricated": False, "answersUploaded": False, "expectedLabelsUploaded": False,
              "trainingUploaded": False, "finalInputsUploaded": False, "credentialsIncluded": False, "private": True,
              "gpuSmokeBeforeDevelopment": True, "productionPromotionEligible": False}
    target.mkdir(parents=True, exist_ok=False)
    (target / "run.py").write_bytes(script_raw)
    (target / "kernel-metadata.json").write_bytes(metadata_raw)
    receipt_path.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-summary", required=True)
    args = parser.parse_args()
    try:
        prepare(args.adapter_summary)
    except Exception as error:
        print(json.dumps({"errorType": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
