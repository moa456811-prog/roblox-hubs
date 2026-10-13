"""Prepare/create only the fixed private recovered-checkpoint dataset.

`prepare` is offline. `remote` reads a credential exclusively from a non-echoing
TTY, authenticates in memory, then accepts only create/status/exit JSON actions.
No response URLs, response bodies, credentials, versions or public mutations are
printed or saved. READY/private/version assertions require read-only API proof.
"""
import argparse
import contextlib
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sys
import uuid

from kaggle_remote import read_credential
from kaggle_train import write_json_atomic

WORK = Path(__file__).resolve().parents[2] / "test-results" / "specialist-v2"
RECOVERY_SHA256 = "4457a3c35aa37ba853257b231b20c637b16453cff306b2f83b337df93ad6421c"
SOURCE_NOTEBOOK = "sciptrush/scriptrush-v2-production-8af8851d"
OWNER = "sciptrush"
FILES = {
    "adapter_model.safetensors": "f4444faa252a120bbd8e39e702294faa4079ca1237cee2c7006cf6abfe6e826d",
    "adapter_config.json": "38da868a30f3108dd74030f9079284e09461c5d74b377668f3b37ad392cf2183",
    "README.md": "95e9780a8839178e75cb1702abda8d0b4a577fd9a735140ad600cfd66a22107f",
    "trainer_state.json": "d45bad1c48a1e0edec2d684cf8e7076789adeb17efddfd65996db825af21b85c",
}
PREFIX = "training/checkpoint-32/"
logging.disable(logging.CRITICAL)
ERROR_CODES = {"PRESERVE_EXISTING_CHECKPOINT_DATASET", "PINNED_RECOVERY_RECEIPT_CHANGED",
               "UNEXPECTED_RECOVERED_CHECKPOINT", "RECOVERED_CHECKPOINT_BYTES_CHANGED",
               "PRIVATE_CHECKPOINT_PREPARATION_INVALID", "PREPARED_CHECKPOINT_BYTES_CHANGED",
               "CREATE_ALREADY_ATTEMPTED_USE_READ_ONLY_STATUS", "DATASET_CREATE_NOT_CONFIRMED",
               "DATASET_READY_PRIVATE_OWNER_VERSION_NOT_CONFIRMED", "REMOTE_DATASET_FILE_SET_UNEXPECTED",
               "FIXED_DATASET_OWNER_REQUIRED", "ONLY_FIXED_CREATE_OR_READ_ONLY_STATUS_ALLOWED",
               "TTY_REQUIRED_FOR_NON_ECHOING_CREDENTIAL_INPUT", "INVALID_CREDENTIAL_INPUT"}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def file_digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def emit(value):
    print(json.dumps(value), flush=True)


def prepare():
    target = WORK / "checkpoint-dataset"
    receipt_path = WORK / "checkpoint-dataset-preparation.json"
    if target.exists() or receipt_path.exists():
        raise FileExistsError("PRESERVE_EXISTING_CHECKPOINT_DATASET")
    recovered = WORK / "production-checkpoint-recovery" / "probe-c5e2dcd5"
    recovery_raw = (recovered / "recovery-receipt.json").read_bytes()
    if digest(recovery_raw) != RECOVERY_SHA256:
        raise ValueError("PINNED_RECOVERY_RECEIPT_CHANGED")
    recovery = json.loads(recovery_raw)
    if (recovery.get("sourceNotebook") != SOURCE_NOTEBOOK or recovery.get("sourceVersion") != 1
            or recovery.get("complete") is not True or recovery.get("trainingSummaryFabricated") is not False
            or recovery.get("globalStep") != 32 or recovery.get("bestGlobalStep") != 32
            or set(recovery.get("files", {})) != set(FILES)):
        raise ValueError("UNEXPECTED_RECOVERED_CHECKPOINT")
    for name, expected in FILES.items():
        path = recovered / name
        recorded = recovery["files"][name]
        if (path.is_symlink() or file_digest(path) != expected or recorded.get("sha256") != expected
                or path.stat().st_size != recorded.get("bytes")):
            raise ValueError("RECOVERED_CHECKPOINT_BYTES_CHANGED")
    preparation_id = str(uuid.uuid4())
    suffix = preparation_id.replace("-", "")[:8]
    dataset_ref = f"{OWNER}/scriptrush-v2-checkpoint-{suffix}"
    metadata = {"title": "ScriptRush v2 checkpoint " + suffix, "id": dataset_ref,
                "licenses": [{"name": "apache-2.0"}],
                "description": "Private transport of the verified ScriptRush QLoRA checkpoint at step 32. No training examples or evaluation labels."}
    (target / PREFIX).mkdir(parents=True, exist_ok=False)
    for name in FILES:
        shutil.copyfile(recovered / name, target / PREFIX / name)
    write_json_atomic(target / "dataset-metadata.json", metadata)
    receipt = {"artifactKind": "private-checkpoint-preparation", "preparationId": preparation_id,
               "datasetRef": dataset_ref, "private": True, "uploadConfirmed": False,
               "expectedDatasetVersion": 1, "sourceNotebook": SOURCE_NOTEBOOK, "sourceVersion": 1,
               "recoveryReceiptSha256": RECOVERY_SHA256, "trainerStateSha256": FILES["trainer_state.json"],
               "files": {PREFIX + name: recovery["files"][name] for name in FILES},
               "datasetMetadataSha256": file_digest(target / "dataset-metadata.json"),
               "directoryMode": "zip", "trainingExamplesIncluded": False, "finalInputsIncluded": False,
               "evaluationLabelsIncluded": False, "credentialsIncluded": False}
    write_json_atomic(receipt_path, receipt)
    validate_preparation()
    return receipt


def validate_preparation():
    target = WORK / "checkpoint-dataset"
    receipt = json.loads((WORK / "checkpoint-dataset-preparation.json").read_bytes())
    metadata = json.loads((target / "dataset-metadata.json").read_bytes())
    expected_paths = {PREFIX + name for name in FILES} | {"dataset-metadata.json"}
    actual = {path.relative_to(target).as_posix() for path in target.rglob("*") if path.is_file()}
    if (target.is_symlink() or target.resolve().parent != WORK.resolve()
            or actual != expected_paths or any(path.is_symlink() for path in target.rglob("*"))
            or receipt.get("recoveryReceiptSha256") != RECOVERY_SHA256
            or receipt.get("sourceNotebook") != SOURCE_NOTEBOOK or receipt.get("sourceVersion") != 1
            or receipt.get("private") is not True or receipt.get("uploadConfirmed") is not False
            or not isinstance(receipt.get("datasetRef"), str)
            or not re.fullmatch(OWNER + r"/scriptrush-v2-checkpoint-[0-9a-f]{8}", receipt["datasetRef"])
            or metadata.get("id") != receipt["datasetRef"] or metadata.get("licenses") != [{"name": "apache-2.0"}]
            or file_digest(target / "dataset-metadata.json") != receipt.get("datasetMetadataSha256")
            or set(receipt.get("files", {})) != {PREFIX + name for name in FILES}):
        raise ValueError("PRIVATE_CHECKPOINT_PREPARATION_INVALID")
    for name, expected in FILES.items():
        path = target / PREFIX / name
        recorded = receipt["files"][PREFIX + name]
        if file_digest(path) != expected or recorded.get("sha256") != expected or recorded.get("bytes") != path.stat().st_size:
            raise ValueError("PREPARED_CHECKPOINT_BYTES_CHANGED")
    return target, receipt


def create(api):
    target, receipt = validate_preparation()
    attempt_path = WORK / "checkpoint-dataset-create.json"
    if attempt_path.exists():
        raise FileExistsError("CREATE_ALREADY_ATTEMPTED_USE_READ_ONLY_STATUS")
    write_json_atomic(attempt_path, {"datasetRef": receipt["datasetRef"], "createAttempted": True,
                                     "createConfirmed": False})
    result = api.dataset_create_new(str(target), public=False, quiet=True, convert_to_csv=False, dir_mode="zip")
    # SDK 2.2.3 response fields verified from its installed dataclass. Only a
    # local hash of the complete response is retained; no URL/body is emitted.
    response_hash = digest(json.dumps(result.to_dict(), sort_keys=True, default=str).encode("utf-8"))
    response_status = str(result.status).lower()
    safe_status = response_status.upper() if response_status in {"ok", "success", "error", "failed", "pending"} else "OTHER_OR_EMPTY"
    confirmed = response_status in {"ok", "success"} and not result.error and result.ref in ("", receipt["datasetRef"])
    evidence = {"datasetRef": receipt["datasetRef"], "createAttempted": True, "responseReceived": True,
                "createConfirmed": confirmed, "uploadResponseSha256": response_hash,
                "responseHashKind": "dataset-create-response", "safeResponseStatus": safe_status,
                "errorPresent": bool(result.error), "refMatches": result.ref in ("", receipt["datasetRef"])}
    write_json_atomic(attempt_path, evidence)
    if not confirmed:
        raise ValueError("DATASET_CREATE_NOT_CONFIRMED")
    return {"datasetRef": receipt["datasetRef"], "createConfirmed": True, "ready": False}


def verify_remote_proof(receipt, created, status, view, listing):
    # Explicit SDK properties avoid relying on differently cased to_dict keys.
    if (created.get("createAttempted") is not True or created.get("datasetRef") != receipt["datasetRef"]
            or str(status).lower() != "ready" or view.ref != receipt["datasetRef"]
            or view.is_private is not True or view.owner_ref != OWNER or view.current_version_number != 1
            or listing.error_message or listing.next_page_token):
        raise ValueError("DATASET_READY_PRIVATE_OWNER_VERSION_NOT_CONFIRMED")
    names = [file.name for file in listing.dataset_files]
    # Dataset processing may expand training.zip, or expose that single archive.
    # The inference runner still verifies every expected extracted file hash.
    expected = set(receipt["files"])
    bare = {path.removeprefix("training/") for path in expected}
    if len(set(names)) != len(names) or set(names) not in (expected, bare, {"training.zip"}):
        raise ValueError("REMOTE_DATASET_FILE_SET_UNEXPECTED")
    response_hash = created.get("uploadResponseSha256")
    if not isinstance(response_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", response_hash):
        # A timed-out/old CREATE may have lost its response. An authenticated,
        # read-only proof still establishes that this fresh private dataset
        # exists at the correct owner/version with only the admitted files.
        response_hash = digest(json.dumps({"ref": view.ref, "owner": view.owner_ref, "private": view.is_private,
                                           "version": view.current_version_number, "status": "READY",
                                           "files": sorted(names)}, sort_keys=True).encode("utf-8"))
    return {"artifactKind": "private-checkpoint-transport", "private": True, "uploadConfirmed": True,
            "status": "READY", "datasetRef": receipt["datasetRef"], "datasetVersion": view.current_version_number,
            "sourceNotebook": receipt["sourceNotebook"], "sourceVersion": receipt["sourceVersion"],
            "recoveryReceiptSha256": receipt["recoveryReceiptSha256"], "trainerStateSha256": receipt["trainerStateSha256"],
            "files": receipt["files"], "datasetMetadataSha256": receipt["datasetMetadataSha256"],
            "uploadResponseSha256": response_hash}


def status(api):
    from kagglesdk.datasets.types.dataset_api_service import ApiGetDatasetRequest
    _, receipt = validate_preparation()
    created = json.loads((WORK / "checkpoint-dataset-create.json").read_bytes())
    observed_status = api.dataset_status(receipt["datasetRef"])
    if str(observed_status).lower() != "ready":
        known = {"not_yet_persisted", "blobs_received", "blobs_decompressed", "blobs_copied_to_sds",
                 "individual_blobs_compressed", "failed", "deleted", "reprocessing"}
        state = str(observed_status).lower()
        return {"datasetRef": receipt["datasetRef"], "status": state.upper() if state in known else "UNKNOWN",
                "uploadConfirmed": False, "ready": False}
    request = ApiGetDatasetRequest()
    request.owner_slug, request.dataset_slug = receipt["datasetRef"].split("/")
    with api.build_kaggle_client() as client:
        view = client.datasets.dataset_api_client.get_dataset(request)
    listing = api.dataset_list_files(receipt["datasetRef"] + "/1", page_size=20)
    names = [file.name for file in listing.dataset_files]
    allowed_names = set(receipt["files"]) | {name.removeprefix("training/") for name in receipt["files"]} | {"training.zip"}
    verification = {"datasetRef": receipt["datasetRef"], "status": "READY",
                    "refMatches": view.ref == receipt["datasetRef"], "privateConfirmed": view.is_private is True,
                    "ownerMatches": view.owner_ref == OWNER, "versionMatches": view.current_version_number == 1,
                    "remoteFiles": [name if name in allowed_names else "UNEXPECTED_FILE" for name in names],
                    "recoveredUnknownCreate": created.get("createConfirmed") is not True,
                    "responseHashKind": created.get("responseHashKind", "read-only-recovery-proof"),
                    "remoteFileBytesVerified": False}
    write_json_atomic(WORK / "checkpoint-dataset-verification.json", verification)
    proof = verify_remote_proof(receipt, created, observed_status, view, listing)
    write_json_atomic(WORK / "checkpoint-dataset-transport.json", proof)
    return {"datasetRef": proof["datasetRef"], "datasetVersion": 1, "private": True,
            "uploadConfirmed": True, "status": "READY", "remoteFiles": verification["remoteFiles"],
            "recoveredUnknownCreate": verification["recoveredUnknownCreate"]}


def safe_failure(error):
    value = {"ok": False, "errorType": type(error).__name__}
    if isinstance(error, (ValueError, FileExistsError)) and str(error) in ERROR_CODES:
        value["errorCode"] = str(error)
    code = getattr(getattr(error, "response", None), "status_code", None)
    if isinstance(code, int) and 100 <= code <= 599:
        value["httpStatus"] = code
    attempt = WORK / "checkpoint-dataset-create.json"
    if attempt.is_file():
        recorded = json.loads(attempt.read_bytes())
        value["createEvidence"] = {key: recorded[key] for key in
                                   ("createAttempted", "responseReceived", "createConfirmed", "safeResponseStatus", "errorPresent", "refMatches") if key in recorded}
    verification = WORK / "checkpoint-dataset-verification.json"
    if verification.is_file():
        value["verification"] = json.loads(verification.read_bytes())
    return value


def remote():
    validate_preparation()
    token = read_credential()
    os.environ["KAGGLE_CONFIG_DIR"] = str(WORK / "auth-empty")
    os.environ["KAGGLE_API_TOKEN"] = token
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
            if api.get_config_value("username") != OWNER:
                raise ValueError("FIXED_DATASET_OWNER_REQUIRED")
        emit({"ok": True, "authenticated": True, "owner": OWNER})
        for line in sys.stdin:
            try:
                command = json.loads(line)
                action = command.get("action")
                if action == "exit":
                    break
                if set(command) != {"action"} or action not in ("create", "status"):
                    raise ValueError("ONLY_FIXED_CREATE_OR_READ_ONLY_STATUS_ALLOWED")
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    result = create(api) if action == "create" else status(api)
                emit({"ok": True, "action": action, "result": result})
            except Exception as error:
                emit(safe_failure(error))
    except (Exception, SystemExit) as error:
        emit(safe_failure(error))
    finally:
        os.environ.pop("KAGGLE_API_TOKEN", None)
        token = None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "remote"), nargs="?", default="prepare")
    mode = parser.parse_args().mode
    if mode == "prepare":
        emit(prepare())
    else:
        remote()
