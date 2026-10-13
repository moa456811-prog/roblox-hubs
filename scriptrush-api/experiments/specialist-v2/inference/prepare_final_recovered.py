"""Stage final blind inference for a hash-pinned recovered production checkpoint.

Do not run preparation until the four production DEV outputs have passed.
Importing this module does not open any input or artifact. No credentials,
submission, model generation, labels or completed training summary are used.
"""
import argparse
import base64
import json
from pathlib import Path
import uuid
import zlib

import prepare as input_validation
import prepare_dev_retry as tokenizer_measurement
import prepare_production_dev_retry as recovery_prepare
import runner

HERE=Path(__file__).resolve().parent
WORK=HERE.parents[2]/"test-results"/"specialist-v2"


def pinned_inputs(path,group,expected_sha):
    if runner.file_digest(path)!=expected_sha:
        raise ValueError("FROZEN_FINAL_INPUT_FILE_CHANGED")
    cases,observed_sha=input_validation.load_inputs(path,group)
    if observed_sha!=expected_sha:
        raise ValueError("FROZEN_FINAL_INPUT_FILE_CHANGED_DURING_READ")
    return cases


def prepare_final_recovered(recovery_receipt,test_inputs,production_inputs,checkpoint_dataset_receipt=None):
    # Verify the real recovered checkpoint before reading any final prompt.
    metadata=recovery_prepare.recovery_metadata(recovery_receipt)
    dataset_ref=None
    if checkpoint_dataset_receipt is not None:
        transport,dataset_ref=recovery_prepare.checkpoint_dataset_transport(checkpoint_dataset_receipt,{"mode":"production-development-retry",**metadata})
    tests=pinned_inputs(test_inputs,"test",runner.RECOVERED_FINAL_UTILITY_SHA256)
    production=pinned_inputs(production_inputs,"production",runner.RECOVERED_FINAL_PRODUCTION_SHA256)
    if len(tests)!=12 or len(production)!=8:
        raise ValueError("EXACTLY_TWELVE_UTILITY_AND_EIGHT_PRODUCTION_FINAL_CASES_REQUIRED")
    cases=tokenizer_measurement.measure_offline(tests+production)
    sources=dict(metadata["sourceFiles"])
    sources.pop("productionDevSha256")
    sources.update(testInputsSha256=runner.RECOVERED_FINAL_UTILITY_SHA256,productionInputsSha256=runner.RECOVERED_FINAL_PRODUCTION_SHA256)
    bundle={"formatVersion":1,"mode":"final-recovered-checkpoint","artifactKind":"recovered-checkpoint",**metadata,
            "sourceFiles":sources,"cases":cases,
            "limits":{"maxInputTokens":runner.MAX_INPUT_TOKENS,"maxNewTokens":runner.MAX_NEW_TOKENS,"maxSeconds":runner.MAX_SECONDS}}
    if checkpoint_dataset_receipt is not None:
        bundle["checkpointDatasetTransport"]=transport
    runner.validate_bundle(bundle)
    target=WORK/"final-recovered-inference-run"
    if (target/"run.py").exists() or (target/"kernel-metadata.json").exists():
        raise FileExistsError("PRESERVE_EXISTING_FINAL_RECOVERED_INFERENCE_RUN")
    payload=base64.b64encode(zlib.compress(runner.compact(bundle).encode("utf-8"),9)).decode("ascii")
    script=f'SCRIPTRUSH_INFERENCE_BUNDLE = "{payload}"\n'+(HERE/"runner.py").read_text(encoding="utf-8")
    suffix=uuid.uuid4().hex[:8]
    kaggle={"id":"sciptrush/scriptrush-v2-final-recovered-inference-"+suffix,"title":"ScriptRush v2 final recovered inference "+suffix,
            "code_file":"run.py","language":"python","kernel_type":"script","is_private":True,"enable_gpu":True,
            "enable_internet":True,"machine_shape":"NvidiaTeslaT4","dataset_sources":[dataset_ref] if dataset_ref else [],"competition_sources":[],
            "kernel_sources":[] if dataset_ref else [runner.PRODUCTION_SOURCE]}
    recovery_prepare.validate_kernel_identity(kaggle["id"],kaggle["title"])
    target.mkdir(parents=True,exist_ok=True)
    (target/"run.py").write_text(script,encoding="utf-8",newline="\n")
    (target/"kernel-metadata.json").write_text(json.dumps(kaggle,indent=2)+"\n",encoding="utf-8",newline="\n")
    receipt={"stage":"final-recovered-inference","mode":"final-recovered-checkpoint","artifactKind":"recovered-checkpoint",
             "sourceNotebook":runner.PRODUCTION_SOURCE,"sourceVersion":1,"checkpoint":"checkpoint-32","notebook":kaggle["id"],
             "model":runner.MODEL,"revision":runner.REVISION,"scriptSha256":runner.digest(script),"bundleSha256":runner.digest(runner.compact(bundle)),
             "adapterSha256":bundle["adapterSha256"],"trainerStateSha256":bundle["trainerStateSha256"],
             "recoveryReceiptSha256":bundle["recoveryReceiptSha256"],"datasetManifestSha256":runner.PRODUCTION_MANIFEST,
             "sourceFiles":sources,"testCases":12,"productionCases":8,"expectedOutputs":40,"limits":bundle["limits"],
             "inputTokens":[{"id":row["id"],"group":row["group"],"tokens":row["preparedInputTokens"],"promptSha256":row["promptSha256"]} for row in cases],
             "trainingSummaryFabricated":False,"answersUploaded":False,"expectedLabelsUploaded":False,"trainingUploaded":False,
             "credentialsIncluded":False,"private":True,"gpuSmokeBeforeFinalInference":True,
             **({"checkpointDatasetRef":dataset_ref,"checkpointDatasetReceiptSha256":bundle["checkpointDatasetTransport"]["receiptSha256"]} if dataset_ref else {})}
    (WORK/"final-recovered-inference-submission-manifest.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps(receipt,indent=2))
    return receipt


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-receipt",required=True)
    parser.add_argument("--test-inputs",required=True)
    parser.add_argument("--production-inputs",required=True)
    parser.add_argument("--checkpoint-dataset-receipt")
    args=parser.parse_args()
    try:
        prepare_final_recovered(args.recovery_receipt,args.test_inputs,args.production_inputs,args.checkpoint_dataset_receipt)
    except Exception as error:
        print(json.dumps({"errorType":type(error).__name__}),file=__import__("sys").stderr)
        raise SystemExit(1)
