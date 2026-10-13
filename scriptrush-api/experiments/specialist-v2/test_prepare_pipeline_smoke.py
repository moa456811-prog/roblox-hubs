"""Offline admission and raw-byte tests for the one-step private diagnostic."""
import ast
import base64
from contextlib import redirect_stdout
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zlib

import prepare_pipeline_smoke as smoke


def sample_bundle():
    def rows(prefix, count, answer):
        return [{"id": f"{prefix}{i:03d}", "messages": [
            {"role": "system", "content": "Return a complete composition."},
            {"role": "user", "content": "Preserve the requested UI."},
        ] + ([{"role": "assistant", "content": "{}"}] if answer else [])} for i in range(1, count + 1)]
    return {"train": rows("production-teach-train-", 48, True) + rows("v2-train-", 96, True),
            "validation": rows("production-teach-validation-", 8, True), "dev": rows("production-teach-dev-", 4, False),
            "manifestSha256": smoke.DATASET_MANIFEST_SHA256,
            "run": {"steps": 32, "evaluationSteps": 16, "learningRate": 3e-5, "maxContext": 8192,
                    "assistantLogitsOnly": True, "initialAdapterSha256": {"adapter_model.safetensors": "a" * 64,
                    "adapter_config.json": "b" * 64}, "initialSummarySha256": "c" * 64,
                    "initialManifestSha256": "d" * 64}}


def frozen_script(bundle):
    payload = base64.b64encode(zlib.compress(smoke.compact(bundle))).decode("ascii")
    return f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n# old frozen source\n'.encode("utf-8")


def receipt_for(bundle, script):
    return {"stage": "production-resume-v2", "sourceNotebook": smoke.SOURCE_NOTEBOOK,
            "notebook": smoke.FROZEN_NOTEBOOK, "model": smoke.MODEL, "revision": smoke.REVISION,
            "counts": smoke.COUNTS, "datasetManifestSha256": smoke.DATASET_MANIFEST_SHA256,
            "scriptSha256": smoke.digest(script), "initialAdapterSha256": bundle["run"]["initialAdapterSha256"],
            "initialSummarySha256": bundle["run"]["initialSummarySha256"], "run": copy.deepcopy(bundle["run"]),
            "private": True, "developmentLabelsUploaded": False, "finalInputsUploaded": False, "finalAnswersUploaded": False}


class PipelineSmokePreparationTests(unittest.TestCase):
    def load(self, bundle, receipt_mutation=lambda value: None):
        raw = frozen_script(bundle)
        receipt = receipt_for(bundle, raw)
        receipt_mutation(receipt)
        # Only test fixtures override the pinned constant; the executable helper
        # exposes no CLI or environment override for the real frozen SHA.
        with patch.object(smoke, "FROZEN_SCRIPT_SHA256", smoke.digest(raw)):
            return smoke.load_frozen_bundle(raw, receipt)

    def test_rejects_changed_frozen_raw_bytes_even_when_normalized_text_matches(self):
        bundle = sample_bundle()
        raw = frozen_script(bundle)
        with patch.object(smoke, "FROZEN_SCRIPT_SHA256", smoke.digest(raw)):
            with self.assertRaisesRegex(ValueError, "FROZEN_PRODUCTION_SCRIPT_CHANGED"):
                smoke.load_frozen_bundle(raw.replace(b"\n", b"\r\n"), receipt_for(bundle, raw))

    def test_rejects_labels_final_ids_and_additional_bundle_fields(self):
        mutations = [lambda bundle: bundle["dev"][0]["messages"].append({"role": "assistant", "content": "answer"}),
                     lambda bundle: bundle["dev"][0].update(expected="answer"),
                     lambda bundle: bundle["train"][0].update(id="v2-test-001"),
                     lambda bundle: bundle.update(test=[]),
                     lambda bundle: bundle["validation"].pop()]
        for mutate in mutations:
            bundle = sample_bundle()
            mutate(bundle)
            with self.assertRaises(ValueError):
                self.load(bundle)

    def test_rejects_receipt_identity_lineage_and_private_flag_changes(self):
        for mutate in (lambda value: value.update(sourceNotebook="other/notebook"),
                       lambda value: value.update(private=False),
                       lambda value: value.update(initialAdapterSha256={}),
                       lambda value: value.update(finalInputsUploaded=True),
                       lambda value: value["run"].update(steps=1)):
            with self.assertRaises(ValueError):
                self.load(sample_bundle(), mutate)

    def test_prepare_preserves_every_input_and_adapter_and_hashes_actual_lf_bytes(self):
        bundle = sample_bundle()
        raw = frozen_script(bundle)
        source = (smoke.HERE / "kaggle_train.py").read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            here = directory / "source"
            here.mkdir()
            (here / "kaggle_train.py").write_bytes(source.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
            work = directory / "work"
            (work / "production-kaggle-run").mkdir(parents=True)
            (work / "production-kaggle-run" / "train.py").write_bytes(raw)
            (work / "production-submission-manifest.json").write_text(json.dumps(receipt_for(bundle, raw)))
            with patch.object(smoke, "WORK", work), patch.object(smoke, "HERE", here), \
                    patch.object(smoke, "FROZEN_SCRIPT_SHA256", smoke.digest(raw)), redirect_stdout(io.StringIO()):
                receipt = smoke.prepare()
                script_raw = (work / "pipeline-smoke-run" / "train.py").read_bytes()
                metadata_raw = (work / "pipeline-smoke-run" / "kernel-metadata.json").read_bytes()
                payload = ast.literal_eval(ast.parse(script_raw.decode().splitlines()[0]).body[0].value)
                prepared = json.loads(zlib.decompress(base64.b64decode(payload)))
                for split in ("train", "validation", "dev"):
                    self.assertEqual(prepared[split], bundle[split])
                self.assertEqual(prepared["run"], {**bundle["run"], "steps": 1, "evaluationSteps": 1,
                                                 "skipDevelopment": True, "runPurpose": "pipeline-smoke"})
                self.assertEqual(receipt["scriptSha256"], smoke.digest(script_raw))
                self.assertEqual(receipt["metadataSha256"], smoke.digest(metadata_raw))
                self.assertNotIn(b"\r", script_raw)
                self.assertNotIn(b"\r", metadata_raw)
                self.assertEqual(json.loads(metadata_raw)["kernel_sources"], [smoke.SOURCE_NOTEBOOK])
                self.assertTrue(receipt["diagnosticOnly"])
                self.assertFalse(receipt["productionPromotionEligible"])
                self.assertEqual(receipt["expectedDevelopmentOutputs"], 0)
                with self.assertRaises(FileExistsError):
                    smoke.prepare()
                self.assertEqual((work / "pipeline-smoke-run" / "train.py").read_bytes(), script_raw)

    def test_existing_empty_run_is_preserved_before_any_source_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            (work / "pipeline-smoke-run").mkdir()
            with patch.object(smoke, "WORK", work):
                with self.assertRaisesRegex(FileExistsError, "PRESERVE_EXISTING"):
                    smoke.prepare()


if __name__ == "__main__":
    unittest.main()
