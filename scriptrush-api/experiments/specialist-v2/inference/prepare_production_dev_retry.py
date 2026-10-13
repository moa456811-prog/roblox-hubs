"""Prepare four production DEV prompts against a real recovered checkpoint 32.

Never fabricate a completed training summary, upload labels, submit or use keys.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import uuid
import zlib

import probe_checkpoint as recovery
import prepare_dev_retry as utility_prepare
import runner

HERE=Path(__file__).resolve().parent
WORK=HERE.parents[2]/"test-results"/"specialist-v2"
PRODUCTION=HERE.parent/"production"/"train"/"artifacts"


def production_inputs():
    manifest_raw=(PRODUCTION/"manifest.json").read_bytes()
    if runner.digest(manifest_raw)!=runner.PRODUCTION_FIXTURE_MANIFEST:
        raise ValueError("FROZEN_PRODUCTION_MANIFEST_CHANGED")
    manifest=json.loads(manifest_raw)
    raw=(PRODUCTION/"dev.jsonl").read_bytes()
    if runner.digest(raw)!=runner.PRODUCTION_DEV_FILE or manifest["files"]["dev"]["sha256"]!=runner.PRODUCTION_DEV_FILE:
        raise ValueError("FROZEN_PRODUCTION_DEVELOPMENT_FILE_CHANGED")
    rows=[json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    if tuple(row["id"] for row in rows)!=runner.PRODUCTION_DEV_IDS or any(row.get("split")!="dev" for row in rows):
        raise ValueError("FOUR_FROZEN_PRODUCTION_DEVELOPMENT_CASES_REQUIRED")
    cases=[]
    for row in rows:
        messages=runner.clean_messages([message for message in row["messages"] if message.get("role")!="assistant"])
        cases.append({"id":row["id"],"group":"dev","messages":messages,"promptSha256":runner.digest(runner.compact(messages))})
    return utility_prepare.measure_offline(cases)


def recovery_metadata(receipt_path):
    receipt_file=Path(receipt_path).resolve(strict=True)
    raw=receipt_file.read_bytes()
    receipt=json.loads(raw)
    if receipt.get("complete") is not True or receipt.get("artifactKind")!="recovered-checkpoint":
        raise ValueError("ACTUAL_COMPLETE_RECOVERY_RECEIPT_REQUIRED")
    source_receipt=(WORK/"production-submission-manifest.json").read_bytes()
    source=json.loads(source_receipt)
    source_script=(WORK/"production-kaggle-run"/"train.py").read_bytes()
    source_manifest=(WORK/"production-dataset"/"manifest.json").read_bytes()
    production_manifest=(PRODUCTION/"manifest.json").read_bytes()
    if runner.digest(source_receipt)!=receipt.get("sourceReceiptSha256") or source.get("notebook")!=runner.PRODUCTION_SOURCE or source.get("scriptSha256")!=runner.PRODUCTION_SCRIPT or source.get("datasetManifestSha256")!=runner.PRODUCTION_MANIFEST or runner.digest(source_script)!=runner.PRODUCTION_SCRIPT or runner.digest(source_manifest)!=runner.PRODUCTION_MANIFEST or runner.digest(production_manifest)!=runner.PRODUCTION_FIXTURE_MANIFEST:
        raise ValueError("FROZEN_RECOVERED_SOURCE_LINEAGE_MISMATCH")
    recovery.validate_recovered(receipt_file.parent)
    for name,record in receipt["files"].items():
        if name not in recovery.FILES or set(record)!={"sha256","bytes"}:
            raise ValueError("UNEXPECTED_RECOVERY_FILE")
        file=receipt_file.parent/name
        if file.stat().st_size!=record["bytes"] or runner.file_digest(file)!=record["sha256"]:
            raise ValueError("RECOVERED_FILE_CHANGED")
    return {"sourceNotebook":runner.PRODUCTION_SOURCE,"sourceVersion":1,"model":runner.MODEL,"revision":runner.REVISION,
            "adapterSha256":{name:record["sha256"] for name,record in receipt["files"].items() if name!="trainer_state.json"},
            "trainerStateSha256":receipt["files"]["trainer_state.json"]["sha256"],"recoveryReceiptSha256":runner.digest(raw),
            "recoveryReceiptRaw":raw.decode("utf-8"),"datasetManifestSha256":runner.PRODUCTION_MANIFEST,
            "sourceFiles":{"productionManifestSha256":runner.PRODUCTION_FIXTURE_MANIFEST,"productionDevSha256":runner.PRODUCTION_DEV_FILE,
                           "sourceScriptSha256":runner.PRODUCTION_SCRIPT,"sourceSubmissionReceiptSha256":runner.digest(source_receipt)}}


def checkpoint_dataset_transport(path,bundle):
    raw=Path(path).read_bytes()
    transport={"receiptRaw":raw.decode("utf-8"),"receiptSha256":runner.digest(raw)}
    receipt=runner.validate_checkpoint_dataset_transport(transport,bundle)
    return transport,receipt["datasetRef"]


def validate_kernel_identity(identifier,title):
    # Kaggle rejected a 55-character generated slug before creating a version.
    # Keep both URL component and title inside the observed 50-character cap.
    if not isinstance(identifier,str) or not isinstance(title,str) or identifier.count("/")!=1:
        raise ValueError("INVALID_BOUNDED_KAGGLE_IDENTITY")
    owner,slug=identifier.split("/")
    if owner!="sciptrush" or not 5<=len(slug)<=50 or not 5<=len(title)<=50 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*",slug) or not re.fullmatch(r"[A-Za-z0-9]+(?: [A-Za-z0-9]+)*",title) or title.lower().replace(" ","-")!=slug:
        raise ValueError("INVALID_BOUNDED_KAGGLE_IDENTITY")


def prepare_production_dev_retry(receipt_path,checkpoint_dataset_receipt=None):
    metadata=recovery_metadata(receipt_path)
    dataset_ref=None
    if checkpoint_dataset_receipt is not None:
        transport,dataset_ref=checkpoint_dataset_transport(checkpoint_dataset_receipt,{"mode":"production-development-retry",**metadata})
    cases=production_inputs()
    bundle={"formatVersion":1,"mode":"production-development-retry","artifactKind":"recovered-checkpoint",**metadata,
            "cases":cases,"limits":{"maxInputTokens":runner.MAX_INPUT_TOKENS,"maxNewTokens":runner.MAX_NEW_TOKENS,"maxSeconds":runner.MAX_SECONDS}}
    if checkpoint_dataset_receipt is not None:
        bundle["checkpointDatasetTransport"]=transport
    runner.validate_bundle(bundle)
    stage="production-dev-dataset-inference" if dataset_ref else "production-dev-inference"
    target=WORK/(stage+"-run")
    if (target/"run.py").exists() or (target/"kernel-metadata.json").exists():
        raise FileExistsError("PRESERVE_EXISTING_PRODUCTION_DEVELOPMENT_INFERENCE_RUN")
    payload=base64.b64encode(zlib.compress(runner.compact(bundle).encode("utf-8"),9)).decode("ascii")
    script=f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n'+(HERE/"runner.py").read_text(encoding="utf-8")
    suffix=uuid.uuid4().hex[:8]
    phrase="prod dev"
    metadata={"id":"sciptrush/scriptrush-v2-"+phrase.replace(" ","-")+"-"+suffix,"title":"ScriptRush v2 "+phrase+" "+suffix,
              "code_file":"run.py","language":"python","kernel_type":"script","is_private":True,"enable_gpu":True,
              "enable_internet":True,"machine_shape":"NvidiaTeslaT4","dataset_sources":[dataset_ref] if dataset_ref else [],"competition_sources":[],
              "kernel_sources":[] if dataset_ref else [runner.PRODUCTION_SOURCE]}
    validate_kernel_identity(metadata["id"],metadata["title"])
    target.mkdir(parents=True,exist_ok=True)
    (target/"run.py").write_text(script,encoding="utf-8",newline="\n")
    (target/"kernel-metadata.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8",newline="\n")
    prepared={"stage":stage,"artifactKind":"recovered-checkpoint","sourceNotebook":runner.PRODUCTION_SOURCE,
              "sourceVersion":1,"checkpoint":"checkpoint-32","notebook":metadata["id"],"model":runner.MODEL,"revision":runner.REVISION,
              "scriptSha256":runner.digest(script),"bundleSha256":runner.digest(runner.compact(bundle)),
              "recoveryReceiptSha256":bundle["recoveryReceiptSha256"],"trainerStateSha256":bundle["trainerStateSha256"],"adapterSha256":bundle["adapterSha256"],
              "datasetManifestSha256":runner.PRODUCTION_MANIFEST,"sourceFiles":bundle["sourceFiles"],"developmentIds":list(runner.PRODUCTION_DEV_IDS),
              "devCases":4,"expectedOutputs":8,"inputTokens":[{"id":row["id"],"tokens":row["preparedInputTokens"],"promptSha256":row["promptSha256"]} for row in cases],
              "limits":bundle["limits"],"trainingSummaryFabricated":False,"answersUploaded":False,"expectedLabelsUploaded":False,
              "trainingUploaded":False,"finalInputsUploaded":False,"credentialsIncluded":False,"private":True,"gpuSmokeBeforeDevelopment":True,
              **({"checkpointDatasetRef":dataset_ref,"checkpointDatasetReceiptSha256":bundle["checkpointDatasetTransport"]["receiptSha256"]} if dataset_ref else {})}
    (WORK/(stage+"-submission-manifest.json")).write_text(json.dumps(prepared,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps(prepared,indent=2))
    return prepared


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-receipt",required=True)
    parser.add_argument("--checkpoint-dataset-receipt")
    args=parser.parse_args()
    try:
        prepare_production_dev_retry(args.recovery_receipt,args.checkpoint_dataset_receipt)
    except Exception as error:
        print(json.dumps({"errorType":type(error).__name__}),file=__import__("sys").stderr)
        raise SystemExit(1)
