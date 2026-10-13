"""Read-only probe of the exact owned production checkpoint; never cancel a run.

Run with the existing Kaggle venv. A credential enters only through getpass TTY;
it is passed directly into the SDK HTTP client, never saved or put in env/argv.
No inference/training job is submitted. A successful probe is a checkpoint
recovery receipt, not a fabricated completed training-summary.json.
"""
import getpass
import hashlib
import json
import logging
import math
from pathlib import Path
import struct
import sys
import time
from urllib.parse import urljoin, urlsplit
import uuid
import warnings

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[2] / "test-results" / "specialist-v2"
SOURCE_NOTEBOOK = "sciptrush/scriptrush-v2-production-8af8851d"
SOURCE_VERSION = 1
TRAINING_MANIFEST_SHA256 = "1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca"
SOURCE_SCRIPT_SHA256 = "39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9"
PREFIX = "scriptrush-specialist-v2/training/checkpoint-32/"
FILES = ("trainer_state.json", "adapter_config.json", "adapter_model.safetensors", "README.md")
REQUIRED = frozenset(FILES[:3])
MAX_TOTAL_BYTES = 200 * 1024 * 1024
MAX_METADATA_BYTES = 2 * 1024 * 1024
MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
REVISION = "c03e6d358207e414f1eca0bb1891e29f1db0e242"
EXPECTED_BEST_METRIC = 0.03299146145582199


class ProbeError(Exception):
    def __init__(self, code, status=None):
        super().__init__(code)
        self.code, self.status = code, status


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_credential():
    if not sys.stdin.isatty():
        raise ProbeError("NON_ECHOING_TTY_REQUIRED")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        value = getpass.getpass("Kaggle credential (not echoed or saved): ").strip()
    if not value or "\r" in value or "\n" in value:
        raise ProbeError("INVALID_CREDENTIAL_INPUT")
    return value


def validate_local_source():
    receipt_file = WORK / "production-submission-manifest.json"
    receipt_raw = receipt_file.read_bytes()
    receipt = json.loads(receipt_raw)
    dataset = WORK / "production-dataset" / "manifest.json"
    script = WORK / "production-kaggle-run" / "train.py"
    if receipt.get("notebook") != SOURCE_NOTEBOOK or receipt.get("datasetManifestSha256") != TRAINING_MANIFEST_SHA256 or receipt.get("scriptSha256") != SOURCE_SCRIPT_SHA256:
        raise ProbeError("SOURCE_RECEIPT_MISMATCH")
    if sha(dataset.read_bytes()) != TRAINING_MANIFEST_SHA256 or sha(script.read_bytes()) != SOURCE_SCRIPT_SHA256:
        raise ProbeError("SOURCE_FILES_MISMATCH")
    return {"sourceReceiptSha256": sha(receipt_raw), "sourceTrainingManifestSha256": TRAINING_MANIFEST_SHA256, "sourceScriptSha256": SOURCE_SCRIPT_SHA256}


def safe_download_url(value):
    parts = urlsplit(value)
    host = parts.hostname or ""
    return (parts.scheme == "https" and not parts.username and not parts.password and parts.port in (None,443)
            and (host == "storage.googleapis.com" or host == "kaggleusercontent.com" or host.endswith(".kaggleusercontent.com")))


def resolve_file_response(response, anonymous_get):
    """Follow only storage redirects, always without SDK auth/cookies."""
    for _ in range(4):
        status = response.status_code
        if status in (301,302,303,307,308):
            location = response.headers.get("Location", "")
            target = urljoin(response.url, location)
            response.close()
            if not safe_download_url(target):
                raise ProbeError("UNSAFE_STORAGE_REDIRECT", status)
            response = anonymous_get(target)
            continue
        if status != 200:
            response.close()
            raise ProbeError("CHECKPOINT_UNAVAILABLE" if status in (404,409,425) else "CHECKPOINT_HTTP_FAILURE", status)
        if response.headers.get("Content-Type", "").split(";",1)[0].strip().lower() in ("text/html", "text/event-stream"):
            response.close()
            raise ProbeError("UNEXPECTED_FILE_CONTENT_TYPE", status)
        return response
    response.close()
    raise ProbeError("STORAGE_REDIRECT_LIMIT")


def save_bounded(response, target, limit):
    length = response.headers.get("Content-Length", "")
    if length and (not length.isdigit() or int(length) > limit):
        response.close()
        raise ProbeError("FILE_SIZE_BUDGET_EXCEEDED")
    temporary = target.with_suffix(target.suffix + ".part")
    size, digest = 0, hashlib.sha256()
    deadline = time.monotonic() + 240
    try:
        with temporary.open("xb") as handle:
            for chunk in response.iter_content(chunk_size=1024*1024):
                if not chunk:
                    continue
                size += len(chunk)
                if size > limit or time.monotonic() > deadline:
                    raise ProbeError("FILE_SIZE_OR_TIME_BUDGET_EXCEEDED")
                handle.write(chunk)
                digest.update(chunk)
        if size == 0 or (length and size != int(length)):
            raise ProbeError("INCOMPLETE_CHECKPOINT_FILE")
        temporary.rename(target)
        return {"sha256":digest.hexdigest(), "bytes":size}
    finally:
        response.close()
        if temporary.exists():
            temporary.unlink()


def validate_recovered(directory):
    state = json.loads((directory / "trainer_state.json").read_bytes())
    config = json.loads((directory / "adapter_config.json").read_bytes())
    if state.get("global_step") != 32 or state.get("best_global_step") != 32 or not isinstance(state.get("best_metric"),(int,float)) or not math.isfinite(state["best_metric"]) or not math.isclose(state["best_metric"],EXPECTED_BEST_METRIC,rel_tol=0,abs_tol=1e-8):
        raise ProbeError("UNEXPECTED_CHECKPOINT_TRAINER_STATE")
    evaluations = [entry for entry in state.get("log_history",[]) if isinstance(entry,dict) and entry.get("step")==32 and "eval_loss" in entry]
    if len(evaluations)!=1 or not isinstance(evaluations[0]["eval_loss"],(int,float)) or not math.isclose(evaluations[0]["eval_loss"],state["best_metric"],rel_tol=0,abs_tol=1e-8):
        raise ProbeError("CHECKPOINT_EVALUATION_HISTORY_MISMATCH")
    best = state.get("best_model_checkpoint", "")
    if not isinstance(best,str) or not best.replace("\\","/").endswith("/checkpoint-32"):
        raise ProbeError("EXPECTED_SELECTED_CHECKPOINT_32")
    if config.get("base_model_name_or_path") != MODEL or config.get("peft_type") != "LORA" or config.get("revision") != REVISION:
        raise ProbeError("UNEXPECTED_CHECKPOINT_ADAPTER_CONFIG")
    weights = directory / "adapter_model.safetensors"
    with weights.open("rb") as handle:
        raw = handle.read(8)
        if len(raw) != 8:
            raise ProbeError("INVALID_SAFETENSORS_HEADER")
        length = struct.unpack("<Q",raw)[0]
        if not 2 <= length <= 1024*1024 or 8+length >= weights.stat().st_size:
            raise ProbeError("INVALID_SAFETENSORS_HEADER")
        header = json.loads(handle.read(length))
        if not isinstance(header,dict) or not any(name != "__metadata__" for name in header):
            raise ProbeError("EMPTY_SAFETENSORS_CHECKPOINT")
        payload_bytes = weights.stat().st_size - 8 - length
        intervals = []
        for name,tensor in header.items():
            if name == "__metadata__":
                continue
            if not isinstance(tensor,dict) or set(tensor) != {"dtype","shape","data_offsets"}:
                raise ProbeError("INVALID_SAFETENSORS_TENSOR")
            widths = {"F16":2,"BF16":2,"F32":4}
            shape,offsets = tensor["shape"],tensor["data_offsets"]
            if tensor["dtype"] not in widths or not isinstance(shape,list) or any(type(dimension) is not int or dimension<1 for dimension in shape):
                raise ProbeError("INVALID_SAFETENSORS_TENSOR")
            if not isinstance(offsets,list) or len(offsets)!=2 or any(type(value) is not int for value in offsets):
                raise ProbeError("INVALID_SAFETENSORS_OFFSETS")
            first,last = offsets
            if not 0<=first<last<=payload_bytes or last-first != math.prod(shape)*widths[tensor["dtype"]]:
                raise ProbeError("INCOMPLETE_SAFETENSORS_PAYLOAD")
            intervals.append((first,last))
        cursor = 0
        for first,last in sorted(intervals):
            if first != cursor:
                raise ProbeError("NONCONTIGUOUS_SAFETENSORS_PAYLOAD")
            cursor = last
        if cursor != payload_bytes:
            raise ProbeError("INCOMPLETE_SAFETENSORS_PAYLOAD")
    return {"globalStep":32, "bestGlobalStep":32, "selectedCheckpoint":"checkpoint-32", "bestValidationMetric":state["best_metric"]}


def sdk_fetcher(credential):
    """Constrain the generated SDK client to one read-only service operation."""
    import requests
    from kagglesdk.kaggle_env import KaggleEnv
    from kagglesdk.kaggle_http_client import KaggleHttpClient
    from kagglesdk.kernels.services.kernels_api_service import KernelsApiClient
    from kagglesdk.kernels.types.kernels_api_service import ApiDownloadKernelOutputRequest
    class ReadOnlyClient(KaggleHttpClient):
        def call(self, service_name, request_name, request, response_type):
            if service_name != "kernels.KernelsApiService" or request_name != "DownloadKernelOutput":
                raise ProbeError("NON_RECOVERY_OPERATION_FORBIDDEN")
            self._init_session()
            self._session.trust_env = False
            prepared = self._prepare_request(service_name, request_name, request)
            if prepared.url != "https://api.kaggle.com/v1/kernels.KernelsApiService/DownloadKernelOutput":
                raise ProbeError("UNEXPECTED_KAGGLE_API_ENDPOINT")
            return self._session.send(prepared, stream=True, allow_redirects=False, timeout=(15,60))
    client = ReadOnlyClient(env=KaggleEnv.PROD, api_token=credential, verbose=False)
    api = KernelsApiClient(client)
    anonymous = requests.Session()
    anonymous.trust_env = False
    def get_anonymous(url):
        if not safe_download_url(url):
            raise ProbeError("UNSAFE_STORAGE_REDIRECT")
        return anonymous.get(url, stream=True, allow_redirects=False, timeout=(15,60))
    def fetch(name):
        if name not in FILES:
            raise ProbeError("UNEXPECTED_CHECKPOINT_FILENAME")
        request = ApiDownloadKernelOutputRequest()
        request.owner_slug, request.kernel_slug = SOURCE_NOTEBOOK.split("/")
        request.version_number = SOURCE_VERSION
        request.file_path = PREFIX + name
        response = api.download_kernel_output(request)
        return resolve_file_response(response, get_anonymous)
    def close():
        client.__exit__(None,None,None)
        anonymous.close()
    return fetch, close


def probe(fetch, lineage, destination=None):
    target = destination or WORK / "production-checkpoint-recovery" / ("probe-"+uuid.uuid4().hex[:8])
    target.mkdir(parents=True, exist_ok=False)
    files, total = {}, 0
    receipt = {"artifactKind":"recovered-checkpoint", "sourceNotebook":SOURCE_NOTEBOOK, "sourceVersion":SOURCE_VERSION,
               "checkpoint":"checkpoint-32", "sourceRelativePath":PREFIX, **lineage, "complete":False,
               "trainingSummaryFabricated":False, "files":files, "cancelRequested":False}
    try:
        for name in FILES:
            try:
                response = fetch(name)
                files[name] = save_bounded(response,target/name,min(MAX_TOTAL_BYTES-total, MAX_TOTAL_BYTES if name.endswith(".safetensors") else MAX_METADATA_BYTES))
                total += files[name]["bytes"]
            except ProbeError as error:
                if name == "README.md" and error.status == 404:
                    continue
                receipt.update(errorCode=error.code,status=error.status,unavailableFile=name)
                return receipt, target
        receipt.update(validate_recovered(target),complete=True,totalBytes=total)
        return receipt, target
    except Exception as error:
        receipt.update(errorCode=error.code if isinstance(error,ProbeError) else "RECOVERY_PROBE_FAILURE",errorType=type(error).__name__)
        return receipt,target
    finally:
        (target/"recovery-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8",newline="\n")


def main():
    logging.disable(logging.CRITICAL)
    lineage = validate_local_source()
    credential = read_credential()
    fetch,close = sdk_fetcher(credential)
    credential = ""
    try:
        receipt,target = probe(fetch,lineage)
        print(json.dumps({"receipt":str(target/"recovery-receipt.json"),"complete":receipt["complete"],"files":receipt["files"],
                          "errorCode":receipt.get("errorCode"),"status":receipt.get("status"),"cancelRequested":False}),flush=True)
        return 0 if receipt["complete"] else 2
    finally:
        close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"errorCode":error.code if isinstance(error,ProbeError) else "RECOVERY_PROBE_FAILURE", "errorType":type(error).__name__,"cancelRequested":False}),file=sys.stderr)
        raise SystemExit(2)
