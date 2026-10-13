"""Recovered production DEV lineage tests; temporary files, no GPU or network."""
import ast
import base64
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zlib

import prepare_production_dev_retry as prepare_prod
import probe_checkpoint as recovery
import runner
from test_probe_checkpoint import files,Response


class ProductionRecoveryTests(unittest.TestCase):
    def fixture(self,root):
        original=prepare_prod.WORK
        for relative in ["production-submission-manifest.json","production-kaggle-run/train.py","production-dataset/manifest.json"]:
            dest=root/relative;dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(original/relative,dest)
        lineage={"sourceReceiptSha256":runner.file_digest(root/"production-submission-manifest.json"),
                 "sourceTrainingManifestSha256":runner.PRODUCTION_MANIFEST,"sourceScriptSha256":runner.PRODUCTION_SCRIPT}
        content=files()
        receipt,target=recovery.probe(lambda name:Response(content[name]),lineage,root/"recovered")
        self.assertTrue(receipt["complete"])
        return target/"recovery-receipt.json"

    def prepared(self,root,receipt_path):
        def measure(cases):
            for row in cases:row["preparedInputTokens"]=6000
            return cases
        with patch.object(prepare_prod,"WORK",root),patch.object(prepare_prod.utility_prepare,"measure_offline",side_effect=measure),patch("builtins.print"):
            result=prepare_prod.prepare_production_dev_retry(receipt_path)
        script=root/"production-dev-inference-run"/"run.py"
        payload=ast.literal_eval(script.read_text(encoding="utf-8").splitlines()[0].split("=",1)[1].strip())
        bundle=json.loads(zlib.decompress(base64.b64decode(payload)))
        return result,bundle,script

    def test_recovered_dev_bundle_has_exact_inputs_raw_hashes_and_no_completed_summary(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            result,bundle,script=self.prepared(root,receipt_path)
            self.assertEqual(runner.validate_bundle(bundle),bundle)
            self.assertEqual(bundle["artifactKind"],"recovered-checkpoint")
            self.assertEqual(tuple(row["id"] for row in bundle["cases"]),runner.PRODUCTION_DEV_IDS)
            self.assertEqual([message["role"] for row in bundle["cases"] for message in row["messages"]],["system","user"]*4)
            self.assertFalse(set(bundle)&{"expected","train","validation","test","adapterSummarySha256","trainingSummary"})
            self.assertEqual(bundle["recoveryReceiptRaw"].encode(),receipt_path.read_bytes())
            self.assertEqual(bundle["recoveryReceiptSha256"],runner.file_digest(receipt_path))
            self.assertEqual(bundle["trainerStateSha256"],runner.file_digest(receipt_path.parent/"trainer_state.json"))
            self.assertFalse(result["trainingSummaryFabricated"])
            self.assertFalse(result["answersUploaded"])
            self.assertFalse(result["finalInputsUploaded"])
            self.assertEqual(result["scriptSha256"],runner.file_digest(script))
            self.assertNotIn(b"\r\n",script.read_bytes())
            metadata=json.loads((script.parent/"kernel-metadata.json").read_bytes())
            self.assertEqual(metadata["kernel_sources"],[runner.PRODUCTION_SOURCE])
            self.assertTrue(metadata["is_private"])
            prepared_receipt=root/"production-dev-inference-submission-manifest.json"
            self.assertEqual(prepared_receipt.read_bytes(),(json.dumps(result,indent=2)+"\n").encode())

    def test_runtime_finds_only_exact_checkpoint_state_and_bytes_without_any_summary(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            _,bundle,_=self.prepared(root,receipt_path)
            mounted=root/"input"/"source"/"scriptrush-specialist-v2"/"training"/"checkpoint-32"
            mounted.mkdir(parents=True)
            for name in recovery.FILES:shutil.copyfile(receipt_path.parent/name,mounted/name)
            self.assertFalse((mounted/"training-summary.json").exists())
            self.assertEqual(runner.resolve_adapter(root/"input",bundle),mounted)
            (mounted/"trainer_state.json").write_bytes((mounted/"trainer_state.json").read_bytes()+b"\n")
            with self.assertRaisesRegex(RuntimeError,"PINNED_RECOVERED_CHECKPOINT"):
                runner.resolve_adapter(root/"input",bundle)

    def test_changed_source_version_final_case_labels_or_receipt_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            _,bundle,_=self.prepared(root,receipt_path)
            for mutate in [lambda value:value.update(sourceVersion=2),lambda value:value.update(sourceNotebook=runner.SOURCE_NOTEBOOK),
                           lambda value:value.update(recoveryReceiptRaw=value["recoveryReceiptRaw"]+"\n"),
                           lambda value:value["cases"][0].update(id="v2-test-001"),lambda value:value["cases"][0].update(expected="answer"),
                           lambda value:value["cases"][0]["messages"].append({"role":"assistant","content":"answer"}),
                           lambda value:value.update(adapterSummarySha256="a"*64),
                           lambda value:value["sourceFiles"].update(productionDevSha256="a"*64)]:
                changed=copy.deepcopy(bundle);mutate(changed)
                with self.assertRaises(ValueError):runner.validate_bundle(changed)

    def test_recovery_receipt_cannot_hide_labels_or_invent_best_metrics(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            _,bundle,_=self.prepared(root,receipt_path)
            for mutation in [{"expected":"secret answer"},{"complete":False},{"bestValidationMetric":0.00001},{"bestGlobalStep":16},{"cancelRequested":{"assistant":"answer"}}]:
                changed=copy.deepcopy(bundle)
                receipt=json.loads(changed["recoveryReceiptRaw"]);receipt.update(mutation)
                changed["recoveryReceiptRaw"]=json.dumps(receipt)
                changed["recoveryReceiptSha256"]=runner.digest(changed["recoveryReceiptRaw"])
                with self.assertRaises(ValueError):runner.validate_bundle(changed)

    def test_no_recovery_or_changed_local_state_prevents_preparation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            receipt=json.loads(receipt_path.read_bytes());receipt["complete"]=False
            receipt_path.write_text(json.dumps(receipt))
            with patch.object(prepare_prod,"WORK",root),self.assertRaisesRegex(ValueError,"ACTUAL_COMPLETE_RECOVERY"):
                prepare_prod.prepare_production_dev_retry(receipt_path)
            self.assertFalse((root/"production-dev-inference-run").exists())
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            state=json.loads((receipt_path.parent/"trainer_state.json").read_bytes());state["best_global_step"]=16
            (receipt_path.parent/"trainer_state.json").write_text(json.dumps(state))
            with patch.object(prepare_prod,"WORK",root),self.assertRaises(recovery.ProbeError):
                prepare_prod.prepare_production_dev_retry(receipt_path)

    def test_existing_prepared_run_is_preserved_and_no_final_file_is_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt_path=self.fixture(root)
            _,_,script=self.prepared(root,receipt_path)
            original=script.read_bytes()
            with patch.object(prepare_prod,"WORK",root),patch.object(prepare_prod.utility_prepare,"measure_offline",side_effect=lambda cases:[dict(row,preparedInputTokens=6000) for row in cases]),self.assertRaises(FileExistsError):
                prepare_prod.prepare_production_dev_retry(receipt_path)
            self.assertEqual(script.read_bytes(),original)
        source=Path(prepare_prod.__file__).read_text(encoding="utf-8")
        self.assertNotIn('"test.jsonl"',source)
        self.assertNotIn('"prompts.jsonl"',source)
        self.assertNotIn('"training-summary.json"',source)


if __name__=="__main__":
    unittest.main()
