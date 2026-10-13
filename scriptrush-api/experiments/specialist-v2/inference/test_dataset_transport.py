"""Private dataset transport contract with tiny fake archives; no auth/network."""
import ast
import base64
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

import prepare_production_dev_retry as prepare_prod
import prepare_final_recovered as prepare_final
import runner
import test_production_dev_retry as production_tests
import test_final_recovered as final_tests


def transport_receipt(bundle):
    recovered=json.loads(bundle["recoveryReceiptRaw"])
    return {"artifactKind":"private-checkpoint-transport","private":True,"uploadConfirmed":True,"status":"READY",
            "datasetRef":"sciptrush/scriptrush-v2-checkpoint-1188a68d","datasetVersion":1,
            "sourceNotebook":runner.PRODUCTION_SOURCE,"sourceVersion":1,"recoveryReceiptSha256":bundle["recoveryReceiptSha256"],
            "trainerStateSha256":bundle["trainerStateSha256"],"files":{"training/checkpoint-32/"+name:record for name,record in recovered["files"].items()},
            "datasetMetadataSha256":"a"*64,"uploadResponseSha256":"b"*64}


class DatasetTransportTests(unittest.TestCase):
    def fixture(self,root):
        receipt=production_tests.ProductionRecoveryTests.fixture(self,root)
        _,bundle,_=production_tests.ProductionRecoveryTests.prepared(self,root,receipt)
        value=transport_receipt(bundle)
        path=root/"checkpoint-dataset-transport.json"
        path.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8",newline="\n")
        bundle["checkpointDatasetTransport"]={"receiptRaw":path.read_text(encoding="utf-8"),"receiptSha256":runner.file_digest(path)}
        return receipt,path,bundle

    def test_valid_private_transport_keeps_original_failed_source_and_exact_file_pins(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);_,path,bundle=self.fixture(root)
            self.assertEqual(runner.validate_bundle(bundle),bundle)
            value=runner.validate_checkpoint_dataset_transport(bundle["checkpointDatasetTransport"],bundle)
            self.assertEqual(value["datasetRef"],"sciptrush/scriptrush-v2-checkpoint-1188a68d")
            self.assertEqual(value["sourceNotebook"],runner.PRODUCTION_SOURCE)
            self.assertEqual(value["recoveryReceiptSha256"],bundle["recoveryReceiptSha256"])

    def test_unknown_upload_status_public_dataset_wrong_owner_or_changed_hashes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);_,_,bundle=self.fixture(root)
            for mutation in [{"private":False},{"uploadConfirmed":False},{"status":"PROCESSING"},{"status":None},
                             {"datasetRef":"someone/scriptrush-v2-checkpoint-1188a68d"},{"datasetVersion":2},
                             {"recoveryReceiptSha256":"0"*64},{"trainerStateSha256":"0"*64},{"uploadResponseSha256":None},
                             {"expected":"never upload labels"}]:
                value=transport_receipt(bundle);value.update(mutation)
                changed=copy.deepcopy(bundle)
                raw=json.dumps(value)
                changed["checkpointDatasetTransport"]={"receiptRaw":raw,"receiptSha256":runner.digest(raw)}
                with self.assertRaises(ValueError):runner.validate_bundle(changed)
            changed=copy.deepcopy(bundle)
            changed["checkpointDatasetTransport"]["receiptSha256"]="0"*64
            with self.assertRaises(ValueError):runner.validate_bundle(changed)

    def test_dataset_dev_preparer_preserves_version_one_folder_and_uses_only_one_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,transport,_=self.fixture(root)
            original=root/"production-dev-inference-run"/"run.py";before=original.read_bytes()
            with patch.object(prepare_prod,"WORK",root),patch.object(prepare_prod.utility_prepare,"measure_offline",side_effect=lambda cases:[dict(row,preparedInputTokens=6000) for row in cases]),patch("builtins.print"):
                result=prepare_prod.prepare_production_dev_retry(receipt,transport)
            script=root/"production-dev-dataset-inference-run"/"run.py"
            metadata=json.loads((script.parent/"kernel-metadata.json").read_bytes())
            self.assertLessEqual(len(metadata["id"].split("/")[1]),50)
            self.assertLessEqual(len(metadata["title"]),50)
            self.assertTrue(metadata["id"].startswith("sciptrush/scriptrush-v2-prod-dev-"))
            self.assertEqual(metadata["kernel_sources"],[])
            self.assertEqual(metadata["dataset_sources"],["sciptrush/scriptrush-v2-checkpoint-1188a68d"])
            self.assertEqual(result["sourceNotebook"],runner.PRODUCTION_SOURCE)
            self.assertEqual(result["sourceVersion"],1)
            self.assertEqual(result["stage"],"production-dev-dataset-inference")
            self.assertEqual(original.read_bytes(),before)
            self.assertEqual(result["scriptSha256"],runner.file_digest(script))
            self.assertFalse(result["trainingSummaryFabricated"])

    def test_archive_and_bare_checkpoint_mounts_are_normalized_to_the_same_verified_locator(self):
        for kind in ("zip","bare","training"):
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);receipt,_,bundle=self.fixture(root)
                mounted=root/"input"/"private-dataset";mounted.mkdir(parents=True)
                if kind=="zip":
                    with zipfile.ZipFile(mounted/"training.zip","w") as archive:
                        for name in json.loads(bundle["recoveryReceiptRaw"])["files"]:
                            archive.write(receipt.parent/name,"checkpoint-32/"+name)
                else:
                    directory=mounted/("training/checkpoint-32" if kind=="training" else "checkpoint-32")
                    directory.mkdir(parents=True)
                    for name in json.loads(bundle["recoveryReceiptRaw"])["files"]:shutil.copyfile(receipt.parent/name,directory/name)
                with patch.object(runner,"OUT",root/"working"):
                    result=runner.resolve_adapter(root/"input",bundle)
                    self.assertEqual(result.name,"checkpoint-32")
                    self.assertEqual(result.parent.name,"training")
                    self.assertEqual(runner.file_digest(result/"trainer_state.json"),bundle["trainerStateSha256"])
                    self.assertEqual(runner.file_digest(result/"adapter_model.safetensors"),bundle["adapterSha256"]["adapter_model.safetensors"])

    def test_extra_traversal_symlink_or_tampered_zip_never_materializes_checkpoint(self):
        for mutation in ("traversal","symlink","tampered"):
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);receipt,_,bundle=self.fixture(root)
                mounted=root/"input";mounted.mkdir()
                with zipfile.ZipFile(mounted/"training.zip","w") as archive:
                    for name in json.loads(bundle["recoveryReceiptRaw"])["files"]:
                        raw=(receipt.parent/name).read_bytes()
                        info=zipfile.ZipInfo("checkpoint-32/"+name)
                        if mutation=="symlink" and name=="README.md":info.external_attr=(0o120777<<16)
                        if mutation=="tampered" and name=="adapter_model.safetensors":raw=raw[:-1]+b"x"
                        archive.writestr(info,raw)
                    if mutation=="traversal":archive.writestr("../../outside.txt",b"forbidden")
                with patch.object(runner,"OUT",root/"working"),self.assertRaises(RuntimeError):
                    runner.resolve_adapter(mounted,bundle)
                self.assertFalse((root/"outside.txt").exists())
                self.assertFalse((root/"working/checkpoint-dataset-extracted").exists())

    def test_final_dataset_preparer_retains_twenty_fake_inputs_and_no_kernel_dependency(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            fixture=final_tests.FinalRecoveryTests()
            receipt,tests,production=fixture.fixture(root)
            with fixture.context(root,tests,production):
                metadata=prepare_prod.recovery_metadata(receipt)
                fake_bundle={"mode":"production-development-retry",**metadata}
                value=transport_receipt(fake_bundle)
                transport=root/"transport.json";transport.write_text(json.dumps(value),encoding="utf-8")
                result=prepare_final.prepare_final_recovered(receipt,tests,production,transport)
                script=root/"final-recovered-inference-run/run.py"
                bundle=fixture.bundle(script)
                self.assertEqual(runner.validate_bundle(bundle),bundle)
            kaggle=json.loads((script.parent/"kernel-metadata.json").read_bytes())
            self.assertLessEqual(len(kaggle["id"].split("/")[1]),50)
            self.assertLessEqual(len(kaggle["title"]),50)
            self.assertEqual(kaggle["kernel_sources"],[])
            self.assertEqual(kaggle["dataset_sources"],[value["datasetRef"]])
            self.assertEqual(result["expectedOutputs"],40)
            self.assertEqual(result["checkpointDatasetReceiptSha256"],runner.file_digest(transport))

    def test_unknown_dataset_proof_prevents_any_final_input_read(self):
        with patch.object(prepare_final.recovery_prepare,"recovery_metadata",return_value={}),patch.object(prepare_final.recovery_prepare,"checkpoint_dataset_transport",side_effect=ValueError("PROOF_UNKNOWN")),patch.object(prepare_final,"pinned_inputs") as reader:
            with self.assertRaisesRegex(ValueError,"PROOF_UNKNOWN"):
                prepare_final.prepare_final_recovered("recovery","must-not-read","must-not-read","unknown-transport")
            reader.assert_not_called()

    def test_bad_generated_identity_never_writes_a_dataset_dev_submission(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,transport,_=self.fixture(root)
            original=root/"production-dev-inference-run/run.py";before=original.read_bytes()
            with patch.object(prepare_prod,"WORK",root),patch.object(prepare_prod.utility_prepare,"measure_offline",side_effect=lambda cases:[dict(row,preparedInputTokens=6000) for row in cases]),patch.object(prepare_prod,"validate_kernel_identity",side_effect=ValueError("INVALID_BOUNDED_KAGGLE_IDENTITY")):
                with self.assertRaisesRegex(ValueError,"INVALID_BOUNDED_KAGGLE_IDENTITY"):
                    prepare_prod.prepare_production_dev_retry(receipt,transport)
            self.assertFalse((root/"production-dev-dataset-inference-run").exists())
            self.assertFalse((root/"production-dev-dataset-inference-submission-manifest.json").exists())
            self.assertEqual(original.read_bytes(),before)


if __name__=="__main__":
    unittest.main()
