"""Locally package the optional FP16 TP2 DEV benchmark; never submit it.

Call only after the owned continuation is actually COMPLETE and downloaded.
Its four original DEV messages and exact adapter come from the existing gate.
"""
import argparse
import ast
import base64
import json
from pathlib import Path
import sys
import uuid
import zlib

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "inference"))
import prepare_completed_production_dev as completed
import prepare_production_dev_retry as production_dev
import runner as lineage
sys.path.insert(0, str(HERE))
import fast_runner

WORK = HERE.parents[2] / "test-results" / "specialist-v2"
STAGE = "fast-dev-inference"


def standalone_lineage():
    source = Path(lineage.__file__).read_text(encoding="utf-8")
    names = {"compact", "canonical_digest", "digest", "file_digest", "clean_messages", "allowed_source_notebook",
             "validate_bundle", "validate_completed_production_sources", "validate_completed_production_summary",
             "validate_recovery_bundle", "validate_checkpoint_dataset_transport", "find_adapter", "resolve_adapter"}
    sections = []
    found = set()
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id.isupper():
            sections.append(ast.get_source_segment(source, node))
        elif isinstance(node, ast.FunctionDef) and node.name in names:
            sections.append(ast.get_source_segment(source, node)); found.add(node.name)
    if found != names:
        raise ValueError("COMPLETED_PRODUCTION_LINEAGE_VALIDATOR_MISSING")
    raw = ("import hashlib\nimport json\nimport math\nfrom pathlib import Path\nimport re\n\n" + "\n\n".join(sections) + "\n").encode("utf-8")
    compile(raw, "<completed-production-lineage>", "exec")
    return raw


def source_acceptance(bundle):
    raw = (WORK / "production-retry-accepted.json").read_bytes()
    receipt = json.loads(raw)
    if (receipt.get("notebook") != bundle["sourceNotebook"] or type(receipt.get("versionNumber")) is not int
            or receipt["versionNumber"] != 1 or type(receipt.get("kernelId")) is not int or receipt["kernelId"] < 1
            or receipt.get("preparedBytesUnchangedAfterPush") is not True
            or receipt.get("scriptSha256") != bundle["sourceFiles"]["sourceScriptSha256"]
            or receipt.get("metadataSha256") != lineage.file_digest(WORK / "production-retry-kaggle-run" / "kernel-metadata.json")):
        raise ValueError("ACTUAL_ACCEPTED_SOURCE_VERSION_AND_RAW_PREPARATION_REQUIRED")
    return receipt["versionNumber"], lineage.digest(raw)


def prepare(adapter_summary_path):
    target = WORK / (STAGE + "-run")
    receipt_path = WORK / (STAGE + "-submission-manifest.json")
    if target.exists() or receipt_path.exists():
        raise FileExistsError("PRESERVE_EXISTING_FAST_DEVELOPMENT_PREPARATION")
    bundle = completed.build_bundle(adapter_summary_path)
    source_version, acceptance_sha = source_acceptance(bundle)
    fast_runner.adapter_config(Path(adapter_summary_path).resolve(strict=True).parent / "adapter")
    validator = standalone_lineage()
    payload = base64.b64encode(zlib.compress(lineage.compact(bundle).encode("utf-8"), 9)).decode("ascii")
    validator_payload = base64.b64encode(zlib.compress(validator, 9)).decode("ascii")
    source = (HERE / "fast_runner.py").read_text(encoding="utf-8").replace("\r\n", "\n")
    script = (f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n'
              f'SCRIPTRUSH_LINEAGE_SOURCE = "{validator_payload}"\n'
              f'SCRIPTRUSH_LINEAGE_SHA256 = "{lineage.digest(validator)}"\n'
              f'SCRIPTRUSH_SOURCE_VERSION = {source_version}\n'
              f'SCRIPTRUSH_SOURCE_ACCEPTANCE_SHA256 = "{acceptance_sha}"\n' + source)
    compile(script, "prepared-fast-dev.py", "exec")
    suffix = uuid.uuid4().hex[:8]
    metadata = {"id": "sciptrush/scriptrush-v2-fast-dev-" + suffix, "title": "ScriptRush v2 fast dev " + suffix,
                "code_file": "run.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [], "competition_sources": [], "kernel_sources": [bundle["sourceNotebook"]]}
    production_dev.validate_kernel_identity(metadata["id"], metadata["title"])
    script_raw = script.encode("utf-8")
    metadata_raw = (json.dumps(metadata, indent=2) + "\n").encode("utf-8")
    result = {"stage": STAGE, "mode": bundle["mode"], "inferenceProfile": fast_runner.PROFILE,
              "notebook": metadata["id"], "sourceNotebook": bundle["sourceNotebook"], "sourceNotebookVersion": source_version,
              "sourceAcceptanceReceiptSha256": acceptance_sha,
              "model": lineage.MODEL, "revision": lineage.REVISION, "artifactKind": "completed-training-adapter",
              "scriptSha256": lineage.digest(script_raw), "metadataSha256": lineage.digest(metadata_raw),
              "bundleSha256": lineage.digest(lineage.compact(bundle)), "lineageValidatorSha256": lineage.digest(validator),
              "adapterSha256": bundle["adapterSha256"], "adapterSummarySha256": bundle["adapterSummarySha256"],
              "datasetManifestSha256": bundle["datasetManifestSha256"], "sourceFiles": bundle["sourceFiles"],
              "developmentIds": list(lineage.PRODUCTION_DEV_IDS), "devCases": 4, "expectedOutputs": 8,
              "limits": bundle["limits"], "inputTokens": [{"id": row["id"], "tokens": row["preparedInputTokens"], "promptSha256": row["promptSha256"]} for row in bundle["cases"]],
              "engineArguments": fast_runner.engine_arguments(bundle), "engineVersions": fast_runner.PACKAGES,
              "isolatedPython": fast_runner.PYTHON_VERSION, "isolatedUv": fast_runner.UV_VERSION,
              "systemTorchReplaced": False, "gpuSmokeBeforeDevelopment": True, "sourceNotebookCompleteMustBeVerifiedBeforePush": True,
              "trainingUploaded": False, "answersUploaded": False, "expectedLabelsUploaded": False,
              "finalInputsUploaded": False, "credentialsIncluded": False, "private": True, "productionPromotionEligible": False,
              "scope": "Experimental FP16 TP2 changes base arithmetic; rescore all four DEV before any final benchmark. No speed measured, no serving host."}
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
