"""Prepare a private one-step pipeline diagnostic; never submit or authenticate.

Only the pinned production script/receipt and current training source are read.
The production teaching rows and utility adapter lineage are reused unchanged;
there are no final inputs, DEV labels or full DEV generations in this smoke.
"""
import ast
import base64
import hashlib
import json
from pathlib import Path
import uuid
import zlib

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist-v2"
FROZEN_SCRIPT_SHA256 = "39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9"
DATASET_MANIFEST_SHA256 = "1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca"
SOURCE_NOTEBOOK = "sciptrush/scriptrush-specialist-v2-1940b014"
FROZEN_NOTEBOOK = "sciptrush/scriptrush-v2-production-8af8851d"
MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
COUNTS = {"train": 144, "validation": 8, "dev": 4}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def load_frozen_bundle(script_raw, receipt):
    if digest(script_raw) != FROZEN_SCRIPT_SHA256:
        raise ValueError("FROZEN_PRODUCTION_SCRIPT_CHANGED")
    if (receipt.get("scriptSha256") != FROZEN_SCRIPT_SHA256
            or receipt.get("stage") != "production-resume-v2"
            or receipt.get("sourceNotebook") != SOURCE_NOTEBOOK
            or receipt.get("notebook") != FROZEN_NOTEBOOK
            or receipt.get("model") != MODEL or receipt.get("revision") != REVISION
            or receipt.get("counts") != COUNTS
            or receipt.get("datasetManifestSha256") != DATASET_MANIFEST_SHA256
            or receipt.get("private") is not True
            or any(receipt.get(name) is not False for name in
                   ("developmentLabelsUploaded", "finalInputsUploaded", "finalAnswersUploaded"))):
        raise ValueError("FROZEN_PRODUCTION_RECEIPT_MISMATCH")
    assignment = ast.parse(script_raw.decode("utf-8").splitlines()[0]).body
    if (len(assignment) != 1 or not isinstance(assignment[0], ast.Assign)
            or len(assignment[0].targets) != 1 or not isinstance(assignment[0].targets[0], ast.Name)
            or assignment[0].targets[0].id != "SCRIPTRUSH_DATA_BUNDLE"):
        raise ValueError("INVALID_FROZEN_BUNDLE_ASSIGNMENT")
    payload = ast.literal_eval(assignment[0].value)
    if not isinstance(payload, str):
        raise ValueError("INVALID_FROZEN_BUNDLE_LITERAL")
    bundle = json.loads(zlib.decompress(base64.b64decode(payload, validate=True)))
    if (set(bundle) != {"train", "validation", "dev", "manifestSha256", "run"}
            or bundle["manifestSha256"] != DATASET_MANIFEST_SHA256 or bundle["run"] != receipt.get("run")):
        raise ValueError("FROZEN_BUNDLE_LINEAGE_MISMATCH")
    run = bundle["run"]
    if (run.get("steps") != 32 or run.get("evaluationSteps") != 16
            or run.get("learningRate") != 3e-5 or run.get("maxContext") != 8192
            or run.get("assistantLogitsOnly") is not True
            or run.get("initialAdapterSha256") != receipt.get("initialAdapterSha256")
            or run.get("initialSummarySha256") != receipt.get("initialSummarySha256")
            or not {"adapter_model.safetensors", "adapter_config.json"} <= set(run.get("initialAdapterSha256", {}))):
        raise ValueError("FROZEN_TRAINING_RECIPE_MISMATCH")
    expected_ids = {
        "train": [f"production-teach-train-{i:03d}" for i in range(1, 49)] + [f"v2-train-{i:03d}" for i in range(1, 97)],
        "validation": [f"production-teach-validation-{i:03d}" for i in range(1, 9)],
        "dev": [f"production-teach-dev-{i:03d}" for i in range(1, 5)],
    }
    for split, expected in expected_ids.items():
        rows = bundle[split]
        if not isinstance(rows, list) or [row.get("id") for row in rows] != expected:
            raise ValueError("ONLY_FROZEN_TEACHING_AND_DEVELOPMENT_IDS_ALLOWED")
        roles = ["system", "user"] if split == "dev" else ["system", "user", "assistant"]
        for row in rows:
            if (set(row) != {"id", "messages"} or not isinstance(row["messages"], list)
                    or [message.get("role") for message in row["messages"]] != roles
                    or any(set(message) != {"role", "content"} or not isinstance(message["content"], str)
                           or not message["content"] for message in row["messages"])):
                raise ValueError("INVALID_OR_LABEL_LEAKING_FROZEN_MESSAGES")
    return bundle


def write_lf(path, value):
    text = value if isinstance(value, str) else json.dumps(value, indent=2) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")
    raw = path.read_bytes()
    if b"\r" in raw:
        raise ValueError("PREPARED_OUTPUT_MUST_BE_LF")
    return digest(raw)


def prepare():
    target = WORK / "pipeline-smoke-run"
    receipt_path = WORK / "pipeline-smoke-submission-manifest.json"
    if target.exists() or receipt_path.exists():
        raise FileExistsError("PRESERVE_EXISTING_PIPELINE_SMOKE_PREPARATION")
    frozen_script_raw = (WORK / "production-kaggle-run" / "train.py").read_bytes()
    frozen_receipt_raw = (WORK / "production-submission-manifest.json").read_bytes()
    bundle = load_frozen_bundle(frozen_script_raw, json.loads(frozen_receipt_raw))
    source_raw = (HERE / "kaggle_train.py").read_bytes()
    source = source_raw.decode("utf-8").replace("\r\n", "\n")
    source_ast = ast.parse(source)
    functions = {node.name for node in source_ast.body if isinstance(node, ast.FunctionDef)}
    if not {"checkpoint_safe_trainer", "persist_fit_summary", "development_policy"} <= functions:
        raise ValueError("CHECKPOINT_RECOVERY_AND_DIAGNOSTIC_POLICY_REQUIRED")
    bundle["run"] = {**bundle["run"], "steps": 1, "evaluationSteps": 1,
                     "skipDevelopment": True, "runPurpose": "pipeline-smoke"}
    bundle_raw = compact(bundle)
    payload = base64.b64encode(zlib.compress(bundle_raw, 9)).decode("ascii")
    script = f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n' + source
    preparation_id = str(uuid.uuid4())
    suffix = preparation_id.replace("-", "")[:8]
    metadata = {"id": "sciptrush/scriptrush-v2-pipeline-smoke-" + suffix,
                "title": "ScriptRush v2 pipeline smoke " + suffix,
                "code_file": "train.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4",
                "dataset_sources": [], "competition_sources": [], "kernel_sources": [SOURCE_NOTEBOOK]}
    # Validation finishes before creating the output directory. A partial write
    # also remains fail-closed on the next call; no existing run is replaced.
    target.mkdir(parents=True, exist_ok=False)
    script_hash = write_lf(target / "train.py", script)
    metadata_hash = write_lf(target / "kernel-metadata.json", metadata)
    receipt = {"stage": "pipeline-smoke", "preparationId": preparation_id, "runPurpose": "pipeline-smoke", "diagnosticOnly": True,
               "productionPromotionEligible": False, "sourceNotebook": SOURCE_NOTEBOOK,
               "notebook": metadata["id"], "model": MODEL, "revision": REVISION,
               "sourceProductionNotebook": FROZEN_NOTEBOOK,
               "sourceProductionScriptSha256": digest(frozen_script_raw),
               "sourceProductionReceiptSha256": digest(frozen_receipt_raw),
               "trainingSourceRawSha256": digest(source_raw), "trainingBodyLfSha256": digest(source.encode("utf-8")),
               "scriptSha256": script_hash, "metadataSha256": metadata_hash, "bundleSha256": digest(bundle_raw),
               "datasetManifestSha256": bundle["manifestSha256"], "counts": COUNTS,
               "run": bundle["run"], "expectedDevelopmentOutputs": 0, "developmentSkipped": True,
               "gpuSmokeBeforeTraining": True, "pretrainingSmokeTokensPerWorker": 2,
               "developmentLabelsUploaded": False, "finalInputsUploaded": False,
               "finalAnswersUploaded": False, "credentialsIncluded": False, "private": True}
    write_lf(receipt_path, receipt)
    print(json.dumps(receipt, indent=2))
    return receipt


if __name__ == "__main__":
    prepare()
