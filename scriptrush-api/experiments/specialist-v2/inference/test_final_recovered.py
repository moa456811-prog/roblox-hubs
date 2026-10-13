"""Fake final inputs only: never open the real held-out utility/production files."""
import ast
import base64
from contextlib import ExitStack
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zlib

import prepare_final_recovered as final
import runner
import test_production_dev_retry as production_tests


class FinalRecoveryTests(unittest.TestCase):
    def fixture(self,root,test_count=12,production_count=8,extra=False):
        receipt=production_tests.ProductionRecoveryTests.fixture(self,root)
        paths=[]
        for group,count in [("test",test_count),("production",production_count)]:
            rows=[{"id":f"fake-{group}-{index:03d}","messages":[{"role":"system","content":"Fake strict composer system for offline fixture."},
                  {"role":"user","content":f"Original fake {group} prompt {index}."}]} for index in range(count)]
            if extra:rows[0]["expected"]="Never upload this fake reference."
            path=root/f"fake-{group}-inputs.jsonl"
            path.write_text("".join(json.dumps(row)+"\n" for row in rows),encoding="utf-8",newline="\n")
            paths.append(path)
        return receipt,*paths

    def context(self,root,tests,production):
        stack=ExitStack()
        stack.enter_context(patch.object(final,"WORK",root))
        stack.enter_context(patch.object(final.recovery_prepare,"WORK",root))
        stack.enter_context(patch.object(runner,"RECOVERED_FINAL_UTILITY_SHA256",runner.file_digest(tests)))
        stack.enter_context(patch.object(runner,"RECOVERED_FINAL_PRODUCTION_SHA256",runner.file_digest(production)))
        stack.enter_context(patch.object(final.tokenizer_measurement,"measure_offline",side_effect=lambda cases:[dict(row,preparedInputTokens=42) for row in cases]))
        stack.enter_context(patch("builtins.print"))
        return stack

    def bundle(self,script):
        encoded=ast.literal_eval(script.read_text(encoding="utf-8").splitlines()[0].split("=",1)[1].strip())
        return json.loads(zlib.decompress(base64.b64decode(encoded)))

    def test_final_recovered_preparation_preserves_twenty_input_messages_and_real_artifact_kind(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,tests,production=self.fixture(root)
            with self.context(root,tests,production):
                result=final.prepare_final_recovered(receipt,tests,production)
                script=root/"final-recovered-inference-run"/"run.py"
                bundle=self.bundle(script)
                self.assertEqual(runner.validate_bundle(bundle),bundle)
                self.assertEqual(len(bundle["cases"]),20)
                self.assertEqual([m["role"] for row in bundle["cases"] for m in row["messages"]],["system","user"]*20)
                self.assertEqual(bundle["mode"],"final-recovered-checkpoint")
                self.assertEqual(bundle["artifactKind"],"recovered-checkpoint")
                self.assertNotIn("adapterSummarySha256",bundle)
                self.assertNotIn("productionDevSha256",bundle["sourceFiles"])
                self.assertEqual(result["expectedOutputs"],40)
                self.assertFalse(result["answersUploaded"])
                self.assertFalse(result["trainingSummaryFabricated"])
                self.assertEqual(result["scriptSha256"],runner.file_digest(script))
                self.assertNotIn(b"\r\n",script.read_bytes())
                metadata=json.loads((script.parent/"kernel-metadata.json").read_bytes())
                self.assertEqual(metadata["kernel_sources"],[runner.PRODUCTION_SOURCE])
                self.assertTrue(metadata["is_private"])
                result_file=root/"final-recovered-inference-submission-manifest.json"
                self.assertEqual(result_file.read_bytes(),(json.dumps(result,indent=2)+"\n").encode())

    def test_only_exact_twelve_plus_eight_case_counts_allowed(self):
        for test_count,production_count in [(11,8),(12,7),(12,9)]:
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);receipt,tests,production=self.fixture(root,test_count,production_count)
                with self.context(root,tests,production),self.assertRaises(ValueError):
                    final.prepare_final_recovered(receipt,tests,production)
                self.assertFalse((root/"final-recovered-inference-run").exists())

    def test_changed_frozen_hash_or_reference_field_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,tests,production=self.fixture(root)
            with self.context(root,tests,production):
                tests.write_bytes(tests.read_bytes()+b"\n")
                with self.assertRaisesRegex(ValueError,"FROZEN_FINAL_INPUT_FILE_CHANGED"):
                    final.prepare_final_recovered(receipt,tests,production)
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,tests,production=self.fixture(root,extra=True)
            with self.context(root,tests,production),self.assertRaisesRegex(ValueError,"EXPECTED_LABEL_OR_UNEXPECTED_INPUT_FIELD"):
                final.prepare_final_recovered(receipt,tests,production)

    def test_recovered_loader_rejects_final_hash_change_labels_and_partial_counts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,tests,production=self.fixture(root)
            with self.context(root,tests,production):
                final.prepare_final_recovered(receipt,tests,production)
                bundle=self.bundle(root/"final-recovered-inference-run"/"run.py")
                for mutate in [lambda value:value["sourceFiles"].update(testInputsSha256="0"*64),
                               lambda value:value["sourceFiles"].update(productionInputsSha256="0"*64),
                               lambda value:value["cases"].pop(),lambda value:value["cases"][0].update(expected="forbidden"),
                               lambda value:value["cases"][0]["messages"].append({"role":"assistant","content":"forbidden"}),
                               lambda value:value.update(adapterSummarySha256="0"*64)]:
                    changed=copy.deepcopy(bundle);mutate(changed)
                    with self.assertRaises(ValueError):runner.validate_bundle(changed)

    def test_final_inputs_are_never_read_until_real_recovery_is_verified(self):
        with patch.object(final.recovery_prepare,"recovery_metadata",side_effect=ValueError("NO_REAL_RECOVERY")),patch.object(final,"pinned_inputs") as read_inputs:
            with self.assertRaisesRegex(ValueError,"NO_REAL_RECOVERY"):
                final.prepare_final_recovered("missing-recovery","must-not-read","must-not-read")
            read_inputs.assert_not_called()

    def test_existing_final_run_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);receipt,tests,production=self.fixture(root)
            with self.context(root,tests,production):
                final.prepare_final_recovered(receipt,tests,production)
                script=root/"final-recovered-inference-run"/"run.py";before=script.read_bytes()
                with self.assertRaises(FileExistsError):final.prepare_final_recovered(receipt,tests,production)
                self.assertEqual(script.read_bytes(),before)

    def test_real_frozen_hash_constants_are_pinned_without_reading_any_final_file(self):
        self.assertEqual(runner.RECOVERED_FINAL_UTILITY_SHA256,"59e1d9a94339bb26c9c9f60947ec6a4be11272066c0cc98814d19fbbebc2a3f3")
        self.assertEqual(runner.RECOVERED_FINAL_PRODUCTION_SHA256,"4a10d44d63fbc01e3378d6bf1c61eb3ad394bc3aeb3d311ac1503349d9ceeba8")


if __name__=="__main__":
    unittest.main()
