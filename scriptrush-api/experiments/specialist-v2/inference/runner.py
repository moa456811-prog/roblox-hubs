"""Private Kaggle inference only; no optimizer, training rows, labels or credential.

Prepared as one script by prepare.py, with SCRIPTRUSH_INFERENCE_BUNDLE injected.
Two subprocesses load independent NF4 model copies on the two T4s, then execute
disjoint cases with adapter off/on. No DDP or inter-GPU collectives are used.
Outputs are untouched decoded model strings, not filled or repaired compositions.
"""
import base64
import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import traceback
import zlib
import zipfile

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
SOURCE_NOTEBOOK = "sciptrush/scriptrush-specialist-v2-1940b014"
V2_TRAINING_MANIFEST_SHA256 = "73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053"
MAX_INPUT_TOKENS = 16384
MAX_NEW_TOKENS = 4096
MAX_SECONDS = 240
SEED = 39107
OUT = Path("/kaggle/working/scriptrush-specialist-v2-inference")
DEPENDENCIES = {"transformers": "4.51.3", "peft": "0.15.2", "accelerate": "1.6.0", "bitsandbytes": "0.45.5"}
DEV_IDS = ("v2-dev-001", "v2-dev-005", "v2-dev-012", "v2-dev-013")
PRODUCTION_SOURCE = "sciptrush/scriptrush-v2-production-8af8851d"
PRODUCTION_MANIFEST = "1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca"
PRODUCTION_SCRIPT = "39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9"
PRODUCTION_FIXTURE_MANIFEST = "b20636e92834148cc20c76e8c4afcfbc6f5df7ea5c62ae9ba3183823a7ba0e83"
PRODUCTION_DEV_FILE = "ca2a6c9f8af330a199a2497ed964c19e62a1e5a4e4a8b73a152ab6572560e7c5"
PRODUCTION_DEV_IDS = tuple(f"production-teach-dev-{index:03d}" for index in range(1,5))
RECOVERED_BEST_METRIC = 0.03299146145582199
RECOVERED_FINAL_UTILITY_SHA256 = "59e1d9a94339bb26c9c9f60947ec6a4be11272066c0cc98814d19fbbebc2a3f3"
RECOVERED_FINAL_PRODUCTION_SHA256 = "4a10d44d63fbc01e3378d6bf1c61eb3ad394bc3aeb3d311ac1503349d9ceeba8"


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def canonical_digest(value):
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False))


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


def file_digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def clean_messages(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("EXACTLY_TWO_INFERENCE_MESSAGES_REQUIRED")
    if any(not isinstance(message, dict) or set(message) != {"role", "content"} for message in value):
        raise ValueError("UNEXPECTED_MESSAGE_FIELDS")
    if [message["role"] for message in value] != ["system", "user"]:
        raise ValueError("ASSISTANT_AND_TOOL_MESSAGES_FORBIDDEN")
    if any(not isinstance(message["content"], str) or not message["content"] for message in value):
        raise ValueError("EMPTY_OR_NONSTRING_INFERENCE_CONTENT")
    return [{"role": message["role"], "content": message["content"]} for message in value]


def allowed_source_notebook(value):
    return isinstance(value, str) and (value == SOURCE_NOTEBOOK or re.fullmatch(r"sciptrush/scriptrush-v2-production-[a-z0-9][a-z0-9-]{0,63}", value) is not None)


def validate_bundle(bundle):
    allowed = {"formatVersion", "sourceNotebook", "model", "revision", "adapterSha256", "adapterSummarySha256", "datasetManifestSha256", "sourceFiles", "cases", "limits"}
    recovered_allowed = (allowed - {"adapterSummarySha256"}) | {"mode", "artifactKind", "sourceVersion", "trainerStateSha256", "recoveryReceiptSha256", "recoveryReceiptRaw"}
    recovered = isinstance(bundle,dict) and bundle.get("artifactKind") == "recovered-checkpoint"
    if not isinstance(bundle, dict) or set(bundle) not in ((recovered_allowed,recovered_allowed|{"checkpointDatasetTransport"}) if recovered else (allowed, allowed | {"mode"})):
        raise ValueError("UNEXPECTED_BUNDLE_FIELDS_OR_LABELS")
    mode = bundle.get("mode", "final")
    if mode not in ("final", "development-retry", "production-development-retry", "production-development-completed", "final-recovered-checkpoint") or recovered != (mode in ("production-development-retry","final-recovered-checkpoint")):
        raise ValueError("UNEXPECTED_INFERENCE_MODE")
    if bundle["formatVersion"] != 1 or not allowed_source_notebook(bundle["sourceNotebook"]) or bundle["model"] != MODEL or bundle["revision"] != REVISION:
        raise ValueError("UNEXPECTED_SOURCE_MODEL_OR_NOTEBOOK")
    hash_names = ("datasetManifestSha256", "trainerStateSha256", "recoveryReceiptSha256") if recovered else ("datasetManifestSha256", "adapterSummarySha256")
    if any(not isinstance(bundle[name], str) or not re.fullmatch(r"[0-9a-f]{64}", bundle[name]) for name in hash_names):
        raise ValueError("INVALID_PINNED_TRAINING_OR_SUMMARY_HASH")
    if recovered:
        validate_recovery_bundle(bundle)
        if "checkpointDatasetTransport" in bundle:
            validate_checkpoint_dataset_transport(bundle["checkpointDatasetTransport"],bundle)
    elif mode == "production-development-completed":
        validate_completed_production_sources(bundle)
    if bundle["limits"] != {"maxInputTokens": MAX_INPUT_TOKENS, "maxNewTokens": MAX_NEW_TOKENS, "maxSeconds": MAX_SECONDS}:
        raise ValueError("INFERENCE_BUDGET_CHANGED")
    hashes = bundle["adapterSha256"]
    if not isinstance(hashes, dict) or "adapter_config.json" not in hashes or "adapter_model.safetensors" not in hashes:
        raise ValueError("INCOMPLETE_ADAPTER_HASH_MANIFEST")
    for name, value in hashes.items():
        if not isinstance(name, str) or Path(name).name != name or not re.fullmatch(r"[a-zA-Z0-9_.-]+", name) or not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ValueError("INVALID_ADAPTER_HASH_MANIFEST")
    cases = bundle["cases"]
    if not isinstance(cases, list) or not cases or len(cases) > 20:
        raise ValueError("INVALID_CASE_BUDGET")
    ids = set()
    groups = {"dev": 0} if mode in ("development-retry","production-development-retry","production-development-completed") else {"test": 0, "production": 0}
    for row in cases:
        if not isinstance(row, dict) or set(row) != {"id", "group", "messages", "promptSha256", "preparedInputTokens"}:
            raise ValueError("CASE_LABEL_OR_UNEXPECTED_FIELD")
        if not isinstance(row["id"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,100}", row["id"]) or row["id"] in ids:
            raise ValueError("INVALID_OR_DUPLICATE_CASE_ID")
        ids.add(row["id"])
        if row["group"] not in groups:
            raise ValueError("INVALID_CASE_GROUP")
        groups[row["group"]] += 1
        messages = clean_messages(row["messages"])
        if digest(compact(messages)) != row["promptSha256"]:
            raise ValueError("PROMPT_HASH_MISMATCH")
        count = row["preparedInputTokens"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 1 or count > MAX_INPUT_TOKENS:
            raise ValueError("PREPARED_TOKEN_BUDGET_EXCEEDED")
    if mode == "development-retry":
        if tuple(row["id"] for row in cases) != DEV_IDS or groups != {"dev": 4} or bundle["sourceNotebook"] != SOURCE_NOTEBOOK or bundle["datasetManifestSha256"] != V2_TRAINING_MANIFEST_SHA256:
            raise ValueError("ONLY_FOUR_ORIGINAL_UTILITY_DEVELOPMENT_CASES_ALLOWED")
    elif mode in ("production-development-retry", "production-development-completed"):
        if tuple(row["id"] for row in cases) != PRODUCTION_DEV_IDS or groups != {"dev":4}:
            raise ValueError("ONLY_FOUR_FROZEN_PRODUCTION_DEVELOPMENT_CASES_ALLOWED")
    elif mode == "final-recovered-checkpoint":
        if groups!={"test":12,"production":8}:
            raise ValueError("EXACTLY_TWELVE_UTILITY_AND_EIGHT_PRODUCTION_FINAL_CASES_REQUIRED")
    elif groups["test"] != 12 or groups["production"] > 8:
        raise ValueError("TWELVE_FINAL_TESTS_AND_AT_MOST_EIGHT_PRODUCTION_CASES_REQUIRED")
    return bundle


def validate_completed_production_sources(bundle):
    sources = bundle["sourceFiles"]
    keys = {"productionManifestSha256", "productionDevSha256", "sourceScriptSha256", "sourceSubmissionReceiptSha256", "initialRecoveredCheckpointSha256"}
    if not isinstance(sources, dict) or set(sources) != keys or any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value) for value in sources.values()):
        raise ValueError("COMPLETED_PRODUCTION_SOURCE_HASHES_REQUIRED")
    if sources["productionManifestSha256"] != PRODUCTION_FIXTURE_MANIFEST or sources["productionDevSha256"] != PRODUCTION_DEV_FILE:
        raise ValueError("FROZEN_PRODUCTION_DEVELOPMENT_SOURCE_CHANGED")
    if not re.fullmatch(r"sciptrush/scriptrush-v2-production-retry-[0-9a-f]{8}", bundle["sourceNotebook"]):
        raise ValueError("OWNED_COMPLETED_PRODUCTION_RETRY_SOURCE_REQUIRED")
    if bundle["datasetManifestSha256"] == PRODUCTION_MANIFEST:
        raise ValueError("NEW_CONTINUATION_DATASET_MANIFEST_REQUIRED")


def validate_completed_production_summary(summary, bundle):
    """A completed fit is required; four DEV outputs never qualify promotion."""
    validate_completed_production_sources(bundle)
    required = {"model": MODEL, "revision": REVISION, "method": "QLoRA-NF4", "steps": 64, "seed": 39119,
                "fitStatus": "complete", "developmentStatus": "external-pending", "developmentMode": "external",
                "developmentSkipped": False, "diagnosticOnly": False, "productionPromotionEligible": False,
                "runPurpose": "production-continuation-fit", "maxContext": 8192, "assistantLogitsOnly": True,
                "evaluationSteps": 16, "trainExamples": 144, "validationExamples": 8, "trainOversizeSkipped": [],
                "effectiveBatchSize": 4, "initialProductionSteps": 32, "additionalProductionSteps": 64,
                "cumulativeProductionSteps": 96, "optimizerStateResumed": False,
                "datasetManifestSha256": bundle["datasetManifestSha256"], "initialManifestSha256": PRODUCTION_MANIFEST,
                "scriptSha256": bundle["sourceFiles"]["sourceScriptSha256"], "adapterSha256": bundle["adapterSha256"],
                "developmentIds": list(PRODUCTION_DEV_IDS)}
    if not isinstance(summary, dict) or any(type(summary.get(key)) is not type(value) or summary.get(key) != value for key, value in required.items()):
        raise ValueError("COMPLETED_PRODUCTION_FIT_LINEAGE_OR_RECIPE_MISMATCH")
    if not isinstance(summary.get("learningRate"), (int, float)) or isinstance(summary["learningRate"], bool) or not math.isclose(summary["learningRate"], 2e-5, rel_tol=0, abs_tol=1e-12):
        raise ValueError("COMPLETED_PRODUCTION_LEARNING_RATE_MISMATCH")
    if summary.get("initialSummarySha256") is not None:
        raise ValueError("RECOVERED_INITIAL_SUMMARY_MUST_NOT_BE_FABRICATED")
    initial = summary.get("initialRecoveredCheckpoint")
    if not isinstance(initial, dict) or canonical_digest(initial) != bundle["sourceFiles"]["initialRecoveredCheckpointSha256"]:
        raise ValueError("COMPLETED_PRODUCTION_INITIAL_RECOVERY_LINEAGE_MISMATCH")
    validate_recovery_bundle(initial)
    validate_checkpoint_dataset_transport(initial.get("checkpointDatasetTransport"), initial)
    if summary.get("initialAdapterSha256") != initial["adapterSha256"]:
        raise ValueError("COMPLETED_PRODUCTION_INITIAL_ADAPTER_MISMATCH")
    for key in ("validationLoss", "bestValidationLoss", "trainingLoss"):
        value = summary.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("COMPLETED_PRODUCTION_FINITE_LOSS_REQUIRED")
    selected = re.search(r"/checkpoint-(16|32|48|64)$", str(summary.get("selectedCheckpoint", "")).replace("\\", "/"))
    if (not selected or type(summary.get("selectedCheckpointStep")) is not int or summary["selectedCheckpointStep"] != int(selected.group(1))
            or type(summary.get("selectedCumulativeProductionSteps")) is not int
            or summary["selectedCumulativeProductionSteps"] != 32 + summary["selectedCheckpointStep"]):
        raise ValueError("COMPLETED_PRODUCTION_VALIDATION_SELECTED_CHECKPOINT_REQUIRED")
    return summary


def validate_recovery_bundle(bundle):
    if bundle["sourceNotebook"] != PRODUCTION_SOURCE or type(bundle["sourceVersion"]) is not int or bundle["sourceVersion"] != 1 or bundle["datasetManifestSha256"] != PRODUCTION_MANIFEST:
        raise ValueError("UNEXPECTED_RECOVERED_CHECKPOINT_SOURCE")
    raw = bundle["recoveryReceiptRaw"]
    if not isinstance(raw,str) or len(raw)>32768 or digest(raw) != bundle["recoveryReceiptSha256"]:
        raise ValueError("RECOVERY_RECEIPT_HASH_MISMATCH")
    receipt = json.loads(raw)
    keys = {"artifactKind","sourceNotebook","sourceVersion","checkpoint","sourceRelativePath","sourceReceiptSha256","sourceTrainingManifestSha256","sourceScriptSha256","complete","trainingSummaryFabricated","files","cancelRequested","globalStep","bestGlobalStep","selectedCheckpoint","bestValidationMetric","totalBytes"}
    if not isinstance(receipt,dict) or set(receipt)!=keys or receipt["complete"] is not True or receipt["trainingSummaryFabricated"] is not False or receipt["artifactKind"]!="recovered-checkpoint":
        raise ValueError("COMPLETE_EXPLICIT_RECOVERY_RECEIPT_REQUIRED")
    if receipt["sourceNotebook"]!=PRODUCTION_SOURCE or type(receipt["sourceVersion"]) is not int or receipt["sourceVersion"]!=1 or receipt["checkpoint"]!="checkpoint-32" or receipt["selectedCheckpoint"]!="checkpoint-32" or type(receipt["globalStep"]) is not int or receipt["globalStep"]!=32 or type(receipt["bestGlobalStep"]) is not int or receipt["bestGlobalStep"]!=32 or type(receipt["cancelRequested"]) is not bool or receipt["sourceRelativePath"]!="scriptrush-specialist-v2/training/checkpoint-32/":
        raise ValueError("RECOVERY_RECEIPT_SOURCE_OR_STEP_MISMATCH")
    if receipt["sourceTrainingManifestSha256"]!=PRODUCTION_MANIFEST or receipt["sourceScriptSha256"]!=PRODUCTION_SCRIPT or not isinstance(receipt["bestValidationMetric"],(int,float)) or not math.isclose(receipt["bestValidationMetric"],RECOVERED_BEST_METRIC,rel_tol=0,abs_tol=1e-8):
        raise ValueError("RECOVERY_RECEIPT_LINEAGE_OR_METRIC_MISMATCH")
    sources = bundle["sourceFiles"]
    final=bundle.get("mode")=="final-recovered-checkpoint"
    source_keys={"productionManifestSha256","sourceScriptSha256","sourceSubmissionReceiptSha256"} | ({"testInputsSha256","productionInputsSha256"} if final else {"productionDevSha256"})
    if not isinstance(sources,dict) or set(sources)!=source_keys or sources["productionManifestSha256"]!=PRODUCTION_FIXTURE_MANIFEST or sources["sourceScriptSha256"]!=PRODUCTION_SCRIPT or sources["sourceSubmissionReceiptSha256"]!=receipt["sourceReceiptSha256"] or not isinstance(receipt["sourceReceiptSha256"],str) or not re.fullmatch(r"[0-9a-f]{64}",receipt["sourceReceiptSha256"]):
        raise ValueError("RECOVERY_SOURCE_FILES_MISMATCH")
    if final and (sources["testInputsSha256"]!=RECOVERED_FINAL_UTILITY_SHA256 or sources["productionInputsSha256"]!=RECOVERED_FINAL_PRODUCTION_SHA256) or not final and sources["productionDevSha256"]!=PRODUCTION_DEV_FILE:
        raise ValueError("RECOVERY_INPUT_FILE_HASH_MISMATCH")
    files = receipt["files"]
    if not isinstance(files,dict) or not {"trainer_state.json","adapter_config.json","adapter_model.safetensors"}<=set(files) or not set(files)<={"trainer_state.json","adapter_config.json","adapter_model.safetensors","README.md"}:
        raise ValueError("RECOVERY_FILE_SET_MISMATCH")
    for name,record in files.items():
        if not isinstance(record,dict) or set(record)!={"sha256","bytes"} or not isinstance(record["sha256"],str) or not re.fullmatch(r"[0-9a-f]{64}",record["sha256"]) or type(record["bytes"]) is not int or not 1<=record["bytes"]<=200*1024*1024:
            raise ValueError("INVALID_RECOVERY_FILE_HASH_OR_SIZE")
    if type(receipt["totalBytes"]) is not int or receipt["totalBytes"]!=sum(record["bytes"] for record in files.values()) or receipt["totalBytes"]>200*1024*1024 or files["trainer_state.json"]["sha256"]!=bundle["trainerStateSha256"] or {name:record["sha256"] for name,record in files.items() if name!="trainer_state.json"}!=bundle["adapterSha256"]:
        raise ValueError("RECOVERY_FILE_HASH_MAP_MISMATCH")
    return receipt


def find_recovered_checkpoint(root,bundle):
    receipt = validate_recovery_bundle(bundle)
    matches=[]
    for config_path in Path(root).glob("**/training/checkpoint-32/adapter_config.json"):
        directory=config_path.parent
        if not all((directory/name).is_file() and (directory/name).stat().st_size==record["bytes"] and file_digest(directory/name)==record["sha256"] for name,record in receipt["files"].items()):
            continue
        state=json.loads((directory/"trainer_state.json").read_bytes())
        config=json.loads(config_path.read_bytes())
        evaluations=[entry for entry in state.get("log_history",[]) if isinstance(entry,dict) and entry.get("step")==32 and "eval_loss" in entry]
        if state.get("global_step")!=32 or state.get("best_global_step")!=32 or state.get("best_metric")!=receipt["bestValidationMetric"] or len(evaluations)!=1 or not math.isclose(evaluations[0]["eval_loss"],receipt["bestValidationMetric"],rel_tol=0,abs_tol=1e-8) or not str(state.get("best_model_checkpoint","")).replace("\\","/").endswith("/checkpoint-32"):
            continue
        if config.get("base_model_name_or_path")!=MODEL or config.get("peft_type")!="LORA" or config.get("revision")!=REVISION:
            continue
        matches.append(directory)
    if len(matches)!=1:
        raise RuntimeError("EXACTLY_ONE_PINNED_RECOVERED_CHECKPOINT_REQUIRED")
    return matches[0]


def validate_checkpoint_dataset_transport(transport,bundle):
    if not isinstance(transport,dict) or set(transport)!={"receiptRaw","receiptSha256"}:
        raise ValueError("EXPLICIT_CHECKPOINT_DATASET_RECEIPT_REQUIRED")
    raw=transport["receiptRaw"]
    if not isinstance(raw,str) or len(raw)>32768 or digest(raw)!=transport["receiptSha256"]:
        raise ValueError("CHECKPOINT_DATASET_RECEIPT_HASH_MISMATCH")
    receipt=json.loads(raw)
    keys={"artifactKind","private","uploadConfirmed","status","datasetRef","datasetVersion","sourceNotebook","sourceVersion","recoveryReceiptSha256","trainerStateSha256","files","datasetMetadataSha256","uploadResponseSha256"}
    if not isinstance(receipt,dict) or set(receipt)!=keys or receipt["artifactKind"]!="private-checkpoint-transport" or receipt["private"] is not True or receipt["uploadConfirmed"] is not True or receipt["status"]!="READY":
        raise ValueError("VERIFIED_PRIVATE_READY_CHECKPOINT_DATASET_REQUIRED")
    if not isinstance(receipt["datasetRef"],str) or not re.fullmatch(r"sciptrush/scriptrush-v2-checkpoint-[0-9a-f]{8}",receipt["datasetRef"]) or type(receipt["datasetVersion"]) is not int or receipt["datasetVersion"]!=1:
        raise ValueError("UNEXPECTED_CHECKPOINT_DATASET_ID_OR_VERSION")
    if receipt["sourceNotebook"]!=PRODUCTION_SOURCE or type(receipt["sourceVersion"]) is not int or receipt["sourceVersion"]!=1 or receipt["recoveryReceiptSha256"]!=bundle["recoveryReceiptSha256"] or receipt["trainerStateSha256"]!=bundle["trainerStateSha256"]:
        raise ValueError("CHECKPOINT_DATASET_SOURCE_LINEAGE_MISMATCH")
    for name in ("datasetMetadataSha256","uploadResponseSha256"):
        if not isinstance(receipt[name],str) or not re.fullmatch(r"[0-9a-f]{64}",receipt[name]):
            raise ValueError("CHECKPOINT_DATASET_UPLOAD_PROOF_REQUIRED")
    recovered=validate_recovery_bundle(bundle)
    expected={"training/checkpoint-32/"+name:record for name,record in recovered["files"].items()}
    if receipt["files"]!=expected:
        raise ValueError("CHECKPOINT_DATASET_FILE_HASHES_MISMATCH")
    return receipt


def extract_checkpoint_dataset(root,bundle):
    """Admit a dataset training.zip only if every byte matches recovered files."""
    receipt=validate_checkpoint_dataset_transport(bundle["checkpointDatasetTransport"],bundle)
    expected=receipt["files"]
    target=OUT/"checkpoint-dataset-extracted"
    # Some dataset mounts unpack training.zip and omit the outer training
    # directory. Normalize only an exact, hash-verified checkpoint suffix.
    bare=[]
    for config in Path(root).rglob("checkpoint-32/adapter_config.json"):
        directory=config.parent
        if directory.parent.name=="training":continue
        if all((directory/Path(relative).name).is_file() and (directory/Path(relative).name).stat().st_size==record["bytes"] and file_digest(directory/Path(relative).name)==record["sha256"] for relative,record in expected.items()):
            bare.append(directory)
    if len(bare)>1:
        raise RuntimeError("AMBIGUOUS_HASH_PINNED_CHECKPOINT_DATASET")
    if bare:
        for relative,record in expected.items():
            destination=target/relative
            destination.parent.mkdir(parents=True,exist_ok=True)
            if destination.exists():
                if file_digest(destination)!=record["sha256"]:raise RuntimeError("EXISTING_EXTRACTED_CHECKPOINT_CHANGED")
                continue
            with (bare[0]/Path(relative).name).open("rb") as source,destination.open("xb") as output:
                for chunk in iter(lambda:source.read(1024*1024),b""):output.write(chunk)
        return target
    verified=[]
    archives=list(Path(root).rglob("training.zip"))
    if len(archives)>8:
        raise RuntimeError("CHECKPOINT_DATASET_ARCHIVE_COUNT_EXCEEDED")
    for archive in archives:
        if archive.stat().st_size>200*1024*1024:continue
        try:
            with zipfile.ZipFile(archive) as zipped:
                entries={}
                for info in zipped.infolist():
                    name=info.filename.replace("\\","/")
                    if ((info.external_attr>>16)&0o170000)==0o120000:
                        raise ValueError("CHECKPOINT_ARCHIVE_SYMLINK_FORBIDDEN")
                    if info.is_dir():
                        if name.rstrip("/") not in ("training","training/checkpoint-32","checkpoint-32"):
                            raise ValueError("UNEXPECTED_CHECKPOINT_ARCHIVE_DIRECTORY")
                        continue
                    relative=name if name.startswith("training/") else "training/"+name
                    if relative not in expected or relative in entries or info.file_size!=expected[relative]["bytes"] or info.flag_bits&1:
                        raise ValueError("UNEXPECTED_CHECKPOINT_ARCHIVE_ENTRY")
                    entries[relative]=info
                if set(entries)!=set(expected):
                    continue
                valid=True
                for relative,info in entries.items():
                    hasher=hashlib.sha256();size=0
                    with zipped.open(info) as handle:
                        for chunk in iter(lambda:handle.read(1024*1024),b""):
                            size+=len(chunk)
                            if size>expected[relative]["bytes"]:
                                raise ValueError("CHECKPOINT_ARCHIVE_SIZE_EXCEEDED")
                            hasher.update(chunk)
                    if size!=expected[relative]["bytes"] or hasher.hexdigest()!=expected[relative]["sha256"]:
                        valid=False;break
                if valid:verified.append(archive)
        except (OSError,ValueError,zipfile.BadZipFile):
            continue
    if len(verified)!=1:
        raise RuntimeError("ONE_EXACT_HASH_PINNED_CHECKPOINT_DATASET_ARCHIVE_REQUIRED")
    with zipfile.ZipFile(verified[0]) as zipped:
        for info in zipped.infolist():
            if info.is_dir():continue
            name=info.filename.replace("\\","/")
            relative=name if name.startswith("training/") else "training/"+name
            if relative not in expected or info.file_size!=expected[relative]["bytes"]:
                raise RuntimeError("CHECKPOINT_ARCHIVE_CHANGED_AFTER_VERIFICATION")
            destination=target/relative
            destination.parent.mkdir(parents=True,exist_ok=True)
            if destination.exists():
                if file_digest(destination)!=expected[relative]["sha256"]:
                    raise RuntimeError("EXISTING_EXTRACTED_CHECKPOINT_CHANGED")
                continue
            # No extractall/path traversal; only the exact four admitted paths.
            with zipped.open(info) as source,destination.open("xb") as output:
                size=0
                for chunk in iter(lambda:source.read(1024*1024),b""):
                    size+=len(chunk)
                    if size>expected[relative]["bytes"]:raise RuntimeError("CHECKPOINT_ARCHIVE_SIZE_EXCEEDED")
                    output.write(chunk)
            if file_digest(destination)!=expected[relative]["sha256"]:
                raise RuntimeError("CHECKPOINT_ARCHIVE_CHANGED_AFTER_VERIFICATION")
    return target


def resolve_adapter(root,bundle):
    if bundle.get("artifactKind")=="recovered-checkpoint":
        if "checkpointDatasetTransport" in bundle:
            validate_checkpoint_dataset_transport(bundle["checkpointDatasetTransport"],bundle)
            try:return find_recovered_checkpoint(root,bundle)
            except RuntimeError:pass
            extracted=OUT/"checkpoint-dataset-extracted"
            try:return find_recovered_checkpoint(extracted,bundle)
            except RuntimeError:pass
            return find_recovered_checkpoint(extract_checkpoint_dataset(root,bundle),bundle)
        return find_recovered_checkpoint(root,bundle)
    directory = find_adapter(root,bundle["adapterSha256"],bundle["adapterSummarySha256"],bundle["datasetManifestSha256"])
    if bundle.get("mode") == "production-development-completed":
        validate_completed_production_summary(json.loads((directory.parent / "training-summary.json").read_bytes()), bundle)
        config = json.loads((directory / "adapter_config.json").read_bytes())
        if config.get("revision") != REVISION:
            raise ValueError("COMPLETED_PRODUCTION_ADAPTER_REVISION_MISMATCH")
    return directory


def assignment(cases, worker, count):
    if count not in (1, 2) or worker not in range(count):
        raise ValueError("INVALID_WORKER_ASSIGNMENT")
    return [(index, row) for index, row in enumerate(cases) if index % count == worker]


def variant_order(index, count):
    # Alternate within each independent worker, not merely by global parity
    # (global parity would give one T4 only base-first cases).
    return ("base", "specialist") if (index // count) % 2 == 0 else ("specialist", "base")


def progress(phase, worker=None, **fields):
    OUT.mkdir(parents=True, exist_ok=True)
    value = {"phase": phase, "time": time.time(), **fields}
    if worker is not None:
        value["worker"] = worker
    path = OUT / ("progress.json" if worker is None else f"progress-worker-{worker}.json")
    path.write_text(json.dumps(value), encoding="utf-8")
    print(compact(value), flush=True)


def diagnostic(error):
    """Useful stack locations and fixed fault classes; never exception text/locals."""
    text = str(error).lower()
    if "out of memory" in text:
        code = "CUDA_OUT_OF_MEMORY"
    elif any(value in text for value in ("same dtype", "same type", "expected scalar type", "mat1 and mat2")):
        code = "DTYPE_MISMATCH"
    elif "same device" in text or "expected all tensors to be on" in text:
        code = "DEVICE_MISMATCH"
    elif "device-side assert" in text:
        code = "CUDA_DEVICE_ASSERT"
    elif "nccl" in text or "collective" in text:
        code = "DISTRIBUTED_COLLECTIVE"
    else:
        code = "INFERENCE_FAILURE"
    frames = [{"file": Path(frame.filename).name, "function": frame.name, "line": frame.lineno}
              for frame in traceback.extract_tb(error.__traceback__)[-24:]]
    return {"errorType": type(error).__name__, "errorCode": code, "traceback": frames}


def smoke_generation(model, tokenizer, torch, worker, count, mode):
    """A tiny forward and cache-enabled generation must pass before development."""
    tokens = tokenizer.apply_chat_template([{"role": "system", "content": "Return JSON."}, {"role": "user", "content": "{}"}], tokenize=True, add_generation_prompt=True)
    inputs = torch.tensor([tokens], dtype=torch.long, device=model.device)
    for variant in ("base", "specialist"):
        scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
        with scope, torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
            result = model(input_ids=inputs, attention_mask=torch.ones_like(inputs), use_cache=False, logits_to_keep=1)
            if not bool(torch.isfinite(result.logits).all()):
                raise RuntimeError("NONFINITE_SMOKE_LOGITS")
            del result
            generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=2, do_sample=False, use_cache=True,
                pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id, max_time=30, logits_to_keep=1)
        if generated.shape[1] <= inputs.shape[1]:
            raise RuntimeError("EMPTY_SMOKE_GENERATION")
        torch.cuda.synchronize(worker)
        progress("smoke_variant_passed", worker, variant=variant, inputTokens=len(tokens), outputTokens=generated.shape[1] - inputs.shape[1])
        del generated
    del inputs
    torch.cuda.empty_cache()
    (OUT / f"smoke-worker-{worker}.json").write_text(compact({"worker": worker, "passed": True, "autocast": "cuda-float16"}), encoding="utf-8")
    if mode in ("development-retry","production-development-retry","production-development-completed","final-recovered-checkpoint"):
        # Both independent GPUs must clear their small diagnostic before either
        # spends time on a full developer case. No DDP/collective is constructed.
        deadline = time.monotonic() + 900
        while not all((OUT / f"smoke-worker-{index}.json").is_file() for index in range(count)):
            if any((OUT / f"failure-worker-{index}.json").is_file() for index in range(count)):
                raise RuntimeError("ANOTHER_GPU_SMOKE_FAILED")
            if time.monotonic() > deadline:
                raise RuntimeError("INDEPENDENT_GPU_SMOKE_BARRIER_TIMEOUT")
            time.sleep(0.25)


def install():
    missing = []
    for name, version in DEPENDENCIES.items():
        try:
            installed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            installed = None
        if installed != version:
            missing.append(f"{name}=={version}")
    if missing:
        result = subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", *missing], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError("DEPENDENCY_INSTALL_FAILED")


def find_adapter(root, expected_hashes, expected_summary_hash=None, expected_training_manifest=None):
    matches = []
    for config in Path(root).glob("**/adapter/adapter_config.json"):
        directory = config.parent
        if not all((directory / name).is_file() and file_digest(directory / name) == value for name, value in expected_hashes.items()):
            continue
        if expected_summary_hash is not None:
            summary_file = directory.parent / "training-summary.json"
            if not summary_file.is_file() or file_digest(summary_file) != expected_summary_hash:
                continue
            summary = json.loads(summary_file.read_text(encoding="utf-8"))
            if summary.get("model") != MODEL or summary.get("revision") != REVISION or summary.get("datasetManifestSha256") != expected_training_manifest or summary.get("adapterSha256") != expected_hashes:
                continue
        matches.append(directory)
    if len(matches) != 1:
        raise RuntimeError("EXACTLY_ONE_HASH_VERIFIED_SOURCE_ADAPTER_REQUIRED")
    config = json.loads((matches[0] / "adapter_config.json").read_text(encoding="utf-8"))
    if config.get("base_model_name_or_path") != MODEL or config.get("peft_type") != "LORA":
        raise RuntimeError("UNEXPECTED_ADAPTER_MODEL_OR_TYPE")
    return matches[0]


def loaded_bundle():
    return validate_bundle(json.loads(zlib.decompress(base64.b64decode(SCRIPTRUSH_INFERENCE_BUNDLE))))


def worker_main(worker, count):
    started = time.perf_counter()
    bundle = loaded_bundle()
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, set_seed
    from peft import PeftModel, prepare_model_for_kbit_training
    torch.cuda.set_device(worker)
    set_seed(SEED + worker)
    adapter = resolve_adapter("/kaggle/input",bundle)
    progress("load_model", worker, gpu=torch.cuda.get_device_name(worker), model=MODEL, revision=REVISION)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    encoded = {}
    counts = []
    for row in bundle["cases"]:
        tokens = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=True)
        if len(tokens) > MAX_INPUT_TOKENS:
            raise RuntimeError("INPUT_TOKEN_BUDGET_EXCEEDED_NO_TRUNCATION")
        if len(tokens) != row["preparedInputTokens"]:
            raise RuntimeError("PREPARED_AND_RUNTIME_TOKENIZER_COUNTS_DIFFER")
        encoded[row["id"]] = tokens
        counts.append({"id": row["id"], "inputTokens": len(tokens)})
    progress("token_budget_verified", worker, cases=len(counts), maxInputTokens=max(row["inputTokens"] for row in counts))
    quantization = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
    model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, torch_dtype=torch.float16, quantization_config=quantization, device_map={"": worker}, attn_implementation="sdpa", trust_remote_code=False)
    if MAX_INPUT_TOKENS + MAX_NEW_TOKENS > model.config.max_position_embeddings:
        raise RuntimeError("MODEL_CONTEXT_BUDGET_EXCEEDED")
    # Match training's frozen norm/matrix dtypes, without enabling gradients or
    # gradient checkpointing. No Trainer or optimizer is constructed.
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=False)
    model.get_input_embeddings().to(dtype=torch.float16)
    model.get_output_embeddings().to(dtype=torch.float16)
    model = PeftModel.from_pretrained(model, str(adapter), is_trainable=False)
    model.requires_grad_(False)
    model.config.use_cache = True
    model.eval()
    smoke_generation(model, tokenizer, torch, worker, count, bundle.get("mode", "final"))
    assigned = assignment(bundle["cases"], worker, count)
    output = OUT / f"predictions-worker-{worker}.jsonl"
    progress("inference", worker, cases=len(assigned), variantsPerCase=2)
    with output.open("w", encoding="utf-8") as handle:
        for global_index, row in assigned:
            inputs = torch.tensor([encoded[row["id"]]], dtype=torch.long, device=model.device)
            for position, variant in enumerate(variant_order(global_index, count)):
                record = {"id": row["id"], "group": row["group"], "variant": variant, "origin": "model-inference", "model": MODEL,
                          "revision": REVISION, "quantization": "NF4-double-FP16", "worker": worker, "variantPosition": position,
                          "promptSha256": row["promptSha256"], "inputTokens": inputs.shape[1], "sourceNotebook": bundle["sourceNotebook"],
                          "adapterManifestSha256": digest(compact(bundle["adapterSha256"])), "artifactKind":bundle.get("artifactKind","completed-training-adapter"),
                          **({"sourceVersion":bundle["sourceVersion"],"trainerStateSha256":bundle["trainerStateSha256"],"recoveryReceiptSha256":bundle["recoveryReceiptSha256"]} if bundle.get("artifactKind")=="recovered-checkpoint" else {}),
                          **({"checkpointDatasetReceiptSha256":bundle["checkpointDatasetTransport"]["receiptSha256"]} if "checkpointDatasetTransport" in bundle else {}),
                          **({"mode":bundle["mode"], "adapterSummarySha256":bundle["adapterSummarySha256"], "datasetManifestSha256":bundle["datasetManifestSha256"]} if bundle.get("mode")=="production-development-completed" else {}),
                          "maxNewTokens": MAX_NEW_TOKENS, "maxTimeSeconds": MAX_SECONDS}
                torch.cuda.synchronize(worker)
                before = time.perf_counter()
                try:
                    scope = model.disable_adapter() if variant == "base" else contextlib.nullcontext()
                    with scope, torch.inference_mode(), torch.autocast(device_type="cuda", dtype=torch.float16):
                        generated = model.generate(inputs, attention_mask=torch.ones_like(inputs), max_new_tokens=MAX_NEW_TOKENS,
                            do_sample=False, use_cache=True, pad_token_id=tokenizer.pad_token_id,
                            eos_token_id=tokenizer.eos_token_id, max_time=MAX_SECONDS, logits_to_keep=1)
                    tokens = generated[0, inputs.shape[1]:]
                    record.update(output=tokenizer.decode(tokens, skip_special_tokens=True), outputTokens=len(tokens),
                                  stoppedWithEos=bool(len(tokens) and tokens[-1].item() == tokenizer.eos_token_id))
                    del generated, tokens
                except Exception as error:
                    record.update(output="", error=type(error).__name__, diagnostic=diagnostic(error))
                    torch.cuda.empty_cache()
                torch.cuda.synchronize(worker)
                record["durationMs"] = round((time.perf_counter() - before) * 1000, 3)
                record["outputSha256"] = digest(record["output"])
                handle.write(compact(record) + "\n")
                handle.flush()
                progress("inference", worker, id=row["id"], variant=variant, outputTokens=record.get("outputTokens", 0), stoppedWithEos=record.get("stoppedWithEos"), errorType=record.get("error"))
            del inputs
    summary = {"worker": worker, "gpu": torch.cuda.get_device_name(worker), "cases": len(assigned), "totalSeconds": round(time.perf_counter() - started, 3),
               "peakMemoryGb": round(torch.cuda.max_memory_allocated(worker) / 2**30, 3), "tokenCounts": counts, "torch": torch.__version__}
    (OUT / f"summary-worker-{worker}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    progress("worker_complete", worker, cases=len(assigned), totalSeconds=summary["totalSeconds"])


def main():
    global OUT
    os.environ.update({"HF_HUB_DISABLE_TELEMETRY": "1", "WANDB_DISABLED": "true", "TOKENIZERS_PARALLELISM": "false", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
    started = time.perf_counter()
    bundle = loaded_bundle()
    if bundle.get("mode") == "development-retry":
        OUT = Path("/kaggle/working/scriptrush-specialist-v2-dev-inference")
    elif bundle.get("mode") == "production-development-retry":
        OUT = Path("/kaggle/working/scriptrush-v2-production-dev-inference")
    elif bundle.get("mode") == "production-development-completed":
        OUT = Path("/kaggle/working/scriptrush-v2-production-retry-dev-inference")
    elif bundle.get("mode") == "final-recovered-checkpoint":
        OUT = Path("/kaggle/working/scriptrush-v2-final-recovered-inference")
    if len(sys.argv) == 4 and sys.argv[1] == "--worker":
        worker_main(int(sys.argv[2]), int(sys.argv[3]))
        return
    if len(sys.argv) != 1:
        raise ValueError("INVALID_RUNNER_ARGUMENTS")
    progress("dependencies")
    install()
    import torch
    count = min(2, torch.cuda.device_count())
    if count < 1:
        raise RuntimeError("GPU_NOT_AVAILABLE")
    progress("verify_adapter", acceleratorCount=count)
    resolve_adapter("/kaggle/input",bundle)
    processes = [subprocess.Popen([sys.executable, __file__, "--worker", str(worker), str(count)]) for worker in range(count)]
    codes = [process.wait() for process in processes]
    records = []
    for worker in range(count):
        source = OUT / f"predictions-worker-{worker}.jsonl"
        if source.is_file():
            records.extend(json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip())
    order = {row["id"]: index for index, row in enumerate(bundle["cases"])}
    records.sort(key=lambda row: (order[row["id"]], 0 if row["variant"] == "base" else 1))
    (OUT / "predictions.jsonl").write_text("".join(compact(row) + "\n" for row in records), encoding="utf-8")
    expected = {(row["id"], variant) for row in bundle["cases"] for variant in ("base", "specialist")}
    observed = {(row["id"], row["variant"]) for row in records}
    summary = {"model": MODEL, "revision": REVISION, "sourceNotebook": bundle["sourceNotebook"],
               "adapterSha256": bundle["adapterSha256"],
               **({"artifactKind":"recovered-checkpoint","sourceVersion":bundle["sourceVersion"],"trainerStateSha256":bundle["trainerStateSha256"],"recoveryReceiptSha256":bundle["recoveryReceiptSha256"]} if bundle.get("artifactKind")=="recovered-checkpoint" else {"adapterSummarySha256":bundle["adapterSummarySha256"]}),
               "datasetManifestSha256": bundle["datasetManifestSha256"], "sourceFiles": bundle["sourceFiles"],
               "acceleratorCount": count, "parallelism": "Independent inference processes, one NF4 model per T4; no DDP",
               "cases": len(bundle["cases"]), "expectedOutputs": len(expected), "observedOutputs": len(records),
               "missingOutputs": [{"id": identity, "variant": variant} for identity, variant in sorted(expected - observed)],
               "workerExitCodes": codes, "limits": bundle["limits"], "seed": SEED, "packages": DEPENDENCIES,
               "totalSeconds": round(time.perf_counter() - started, 3),
               "mode": bundle.get("mode", "final"),
               **({"checkpointDatasetTransport":bundle["checkpointDatasetTransport"]} if "checkpointDatasetTransport" in bundle else {}),
               "scope": "Offline inference only; no training, labels, response repair, API keys or public Kaggle serving. max_time is checked between generation steps, not during an in-flight CUDA kernel."}
    (OUT / "inference-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if any(codes) or observed != expected or len(records) != len(expected):
        raise RuntimeError("INFERENCE_WORKER_OR_OUTPUT_COUNT_FAILURE")
    progress("complete", cases=len(bundle["cases"]), outputs=len(records), totalSeconds=summary["totalSeconds"])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        worker = int(sys.argv[2]) if len(sys.argv) == 4 and sys.argv[1] == "--worker" and sys.argv[2].isdigit() else None
        detail = diagnostic(error)
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / ("failure.json" if worker is None else f"failure-worker-{worker}.json")).write_text(compact(detail), encoding="utf-8")
        progress("failed", worker, diagnostic=detail)
        raise SystemExit(1)
