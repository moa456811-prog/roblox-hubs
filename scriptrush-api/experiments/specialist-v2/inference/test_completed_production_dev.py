"""Completed continuation DEV admission: inert temporary fixtures, no inference."""
import ast
import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zlib

import prepare_completed_production_dev as prepare_dev
import prepare_production_dev_retry as original_dev
import probe_checkpoint as recovery
import runner
from test_probe_checkpoint import files, Response


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value, indent=2) + "\n").encode("utf-8"))


def original_recovery(root):
    content = files()
    lineage = {"sourceReceiptSha256": "c" * 64, "sourceTrainingManifestSha256": runner.PRODUCTION_MANIFEST,
               "sourceScriptSha256": runner.PRODUCTION_SCRIPT}
    receipt, _ = recovery.probe(lambda name: Response(content[name]), lineage, root / "inert-recovery")
    raw = (json.dumps(receipt, indent=2) + "\n").encode("utf-8")
    initial = {"artifactKind": "recovered-checkpoint", "mode": "production-development-retry", "sourceNotebook": runner.PRODUCTION_SOURCE,
               "sourceVersion": 1, "model": runner.MODEL, "revision": runner.REVISION,
               "adapterSha256": {name: record["sha256"] for name, record in receipt["files"].items() if name != "trainer_state.json"},
               "trainerStateSha256": receipt["files"]["trainer_state.json"]["sha256"], "recoveryReceiptSha256": runner.digest(raw),
               "recoveryReceiptRaw": raw.decode(), "datasetManifestSha256": runner.PRODUCTION_MANIFEST,
               "sourceFiles": {"productionManifestSha256": runner.PRODUCTION_FIXTURE_MANIFEST, "productionDevSha256": runner.PRODUCTION_DEV_FILE,
                               "sourceScriptSha256": runner.PRODUCTION_SCRIPT, "sourceSubmissionReceiptSha256": "c" * 64}}
    transport = {"artifactKind": "private-checkpoint-transport", "private": True, "uploadConfirmed": True, "status": "READY",
                 "datasetRef": "sciptrush/scriptrush-v2-checkpoint-12345678", "datasetVersion": 1,
                 "sourceNotebook": runner.PRODUCTION_SOURCE, "sourceVersion": 1, "recoveryReceiptSha256": initial["recoveryReceiptSha256"],
                 "trainerStateSha256": initial["trainerStateSha256"],
                 "files": {"training/checkpoint-32/" + name: record for name, record in receipt["files"].items()},
                 "datasetMetadataSha256": "d" * 64, "uploadResponseSha256": "e" * 64}
    transport_raw = json.dumps(transport)
    initial["checkpointDatasetTransport"] = {"receiptRaw": transport_raw, "receiptSha256": runner.digest(transport_raw)}
    return initial


def fixture(root):
    initial = original_recovery(root)
    cases = []
    for identity in runner.PRODUCTION_DEV_IDS:
        messages = [{"role": "system", "content": "Inert composer fixture."}, {"role": "user", "content": identity}]
        cases.append({"id": identity, "group": "dev", "messages": messages, "promptSha256": runner.digest(runner.compact(messages)),
                      "preparedInputTokens": 40})
    rows = {"train": [{"id": f"inert-train-{index}", "messages": [{"role": "assistant", "content": "TRAINING_LABEL_ONLY"}]} for index in range(144)],
            "validation": [{"id": f"inert-val-{index}", "messages": [{"role": "assistant", "content": "VALIDATION_LABEL_ONLY"}]} for index in range(8)],
            "dev": [{"id": row["id"], "messages": row["messages"]} for row in cases]}
    row_hashes = {split: runner.digest(runner.compact(group)) for split, group in rows.items()}
    run = {**prepare_dev.RECIPE, "initialAdapterSha256": initial["adapterSha256"], "initialManifestSha256": runner.PRODUCTION_MANIFEST,
           "initialRecoveredCheckpoint": initial, "inputRowsSha256": row_hashes}
    manifest = {"stage": "production-retry", "model": runner.MODEL, "revision": runner.REVISION,
                "originalDatasetManifestSha256": runner.PRODUCTION_MANIFEST, "counts": prepare_dev.COUNTS,
                "inputRowsSha256": row_hashes, "runRecipe": prepare_dev.RECIPE, "developmentLabelsIncluded": False,
                "finalInputsIncluded": False, "finalAnswersIncluded": False, "adapterSha256": initial["adapterSha256"],
                "recoveryReceiptSha256": initial["recoveryReceiptSha256"], "trainerStateSha256": initial["trainerStateSha256"],
                "checkpointDatasetReceiptSha256": initial["checkpointDatasetTransport"]["receiptSha256"]}
    manifest_path = root / "production-retry-dataset" / "manifest.json"
    write_json(manifest_path, manifest)
    manifest_sha = runner.file_digest(manifest_path)
    bundle = {**rows, "manifestSha256": manifest_sha, "run": run}
    payload = base64.b64encode(zlib.compress(runner.compact(bundle).encode())).decode()
    script_path = root / "production-retry-kaggle-run" / "train.py"
    script_path.parent.mkdir(parents=True)
    script_path.write_bytes(f'SCRIPTRUSH_DATA_BUNDLE = "{payload}"\n# Inert test fixture, never executed.\n'.encode())
    metadata_path = script_path.parent / "kernel-metadata.json"
    metadata = {"id": "sciptrush/scriptrush-v2-production-retry-12345678", "title": "ScriptRush v2 production retry 12345678",
                "is_private": True, "code_file": "train.py", "kernel_sources": [], "competition_sources": [],
                "dataset_sources": ["sciptrush/scriptrush-v2-checkpoint-12345678"]}
    write_json(metadata_path, metadata)
    receipt = {"stage": "production-retry", "model": runner.MODEL, "revision": runner.REVISION, "private": True, "diagnosticOnly": False,
               "counts": prepare_dev.COUNTS, "developmentLabelsUploaded": False, "finalInputsUploaded": False,
               "finalAnswersUploaded": False, "credentialsIncluded": False, "notebook": metadata["id"], "run": run,
               "scriptSha256": runner.file_digest(script_path), "metadataSha256": runner.file_digest(metadata_path),
               "bundleSha256": runner.digest(runner.compact(bundle)), "datasetManifestSha256": manifest_sha,
               "inputRowsSha256": row_hashes, "initialAdapterSha256": initial["adapterSha256"], "initialManifestSha256": runner.PRODUCTION_MANIFEST,
               "initialRecoveredCheckpointSha256": runner.digest(runner.compact(initial)), "recoveryReceiptSha256": initial["recoveryReceiptSha256"],
               "trainerStateSha256": initial["trainerStateSha256"], "checkpointDatasetRef": metadata["dataset_sources"][0],
               "checkpointDatasetReceiptSha256": initial["checkpointDatasetTransport"]["receiptSha256"]}
    write_json(root / "production-retry-submission-manifest.json", receipt)
    adapter = root / "downloaded" / "source" / "scriptrush-specialist-v2" / "adapter"
    adapter.mkdir(parents=True)
    for name, raw in files().items():
        if name != "trainer_state.json":
            (adapter / name).write_bytes(raw)
    summary = {"model": runner.MODEL, "revision": runner.REVISION, "method": "QLoRA-NF4", **prepare_dev.RECIPE,
               "fitStatus": "complete", "developmentStatus": "external-pending", "developmentSkipped": False,
               "diagnosticOnly": False, "productionPromotionEligible": False, "trainExamples": 144, "validationExamples": 8,
               "trainOversizeSkipped": 0, "effectiveBatchSize": 4, "initialProductionSteps": 32, "additionalProductionSteps": 64,
               "cumulativeProductionSteps": 96, "optimizerStateResumed": False, "datasetManifestSha256": manifest_sha,
               "initialManifestSha256": runner.PRODUCTION_MANIFEST, "scriptSha256": receipt["scriptSha256"],
               "adapterSha256": {path.name: runner.file_digest(path) for path in adapter.iterdir()},
               "developmentIds": list(runner.PRODUCTION_DEV_IDS), "initialSummarySha256": None,
               "initialRecoveredCheckpoint": initial, "initialAdapterSha256": initial["adapterSha256"],
               "validationLoss": 0.1, "bestValidationLoss": 0.1, "trainingLoss": 0.2,
               "selectedCheckpoint": "/kaggle/working/scriptrush-specialist-v2/training/checkpoint-48",
               "selectedCheckpointStep": 48, "selectedCumulativeProductionSteps": 80}
    summary_path = adapter.parent / "training-summary.json"
    write_json(summary_path, summary)
    return cases, summary_path


class CompletedProductionDevelopmentTests(unittest.TestCase):
    def scope(self, root, cases):
        class Scope:
            def __enter__(self):
                self.patches = [patch.object(prepare_dev, "WORK", root),
                                patch.object(prepare_dev, "verify_current_production_sources"),
                                patch.object(prepare_dev.production_dev, "production_inputs", return_value=copy.deepcopy(cases))]
                for item in self.patches: item.start()
            def __exit__(self, *args):
                for item in reversed(self.patches): item.stop()
        return Scope()

    def test_only_four_original_dev_prompts_and_completed_adapter_are_prepared(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary_path = fixture(root)
            with self.scope(root, cases), patch("builtins.print"):
                result = prepare_dev.prepare(summary_path)
            script = root / (prepare_dev.STAGE + "-run") / "run.py"
            payload = ast.literal_eval(script.read_text().splitlines()[0].split("=", 1)[1].strip())
            bundle = json.loads(zlib.decompress(base64.b64decode(payload)))
            self.assertEqual(runner.validate_bundle(bundle), bundle)
            self.assertEqual(bundle["cases"], cases)
            self.assertEqual(bundle["mode"], "production-development-completed")
            self.assertFalse(set(bundle) & {"expected", "train", "validation", "test", "artifactKind", "recoveryReceiptRaw", "checkpointDatasetTransport"})
            self.assertNotIn("TRAINING_LABEL_ONLY", runner.compact(bundle))
            self.assertNotIn("VALIDATION_LABEL_ONLY", runner.compact(bundle))
            self.assertEqual(result["adapterSummarySha256"], runner.file_digest(summary_path))
            self.assertNotEqual(result["datasetManifestSha256"], runner.PRODUCTION_MANIFEST)
            self.assertFalse(result["productionPromotionEligible"])
            self.assertTrue(result["sourceNotebookCompleteMustBeVerifiedBeforePush"])
            self.assertFalse(result["answersUploaded"])
            self.assertFalse(result["finalInputsUploaded"])
            self.assertEqual(result["scriptSha256"], runner.file_digest(script))
            self.assertNotIn(b"\r\n", script.read_bytes())
            metadata_path = script.parent / "kernel-metadata.json"
            self.assertEqual(result["metadataSha256"], runner.file_digest(metadata_path))
            metadata = json.loads(metadata_path.read_bytes())
            self.assertEqual(metadata["kernel_sources"], [bundle["sourceNotebook"]])
            self.assertEqual(metadata["dataset_sources"], [])
            self.assertTrue(metadata["is_private"])
            self.assertEqual(runner.resolve_adapter(summary_path.parent, bundle), summary_path.parent / "adapter")

    def test_four_dev_inference_assignments_are_disjoint_and_balance_variant_order(self):
        with tempfile.TemporaryDirectory() as temporary:
            cases, _ = fixture(Path(temporary))
            assignments = [runner.assignment(cases, worker, 2) for worker in range(2)]
            self.assertEqual([{row["id"] for _, row in rows} for rows in assignments], [{cases[0]["id"], cases[2]["id"]}, {cases[1]["id"], cases[3]["id"]}])
            for rows in assignments:
                self.assertEqual([runner.variant_order(index, 2) for index, _ in rows], [("base", "specialist"), ("specialist", "base")])

    def test_incomplete_diagnostic_old_recipe_wrong_initial_or_false_summary_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary_path = fixture(root)
            original = json.loads(summary_path.read_bytes())
            changes = [{"fitStatus": "running"}, {"diagnosticOnly": True}, {"developmentSkipped": True}, {"steps": 32},
                       {"seed": 39107}, {"developmentMode": "inline"}, {"datasetManifestSha256": runner.PRODUCTION_MANIFEST},
                       {"scriptSha256": "a" * 64}, {"initialSummarySha256": "a" * 64}, {"initialAdapterSha256": {}},
                       {"bestValidationLoss": float("nan")}, {"selectedCheckpoint": "/training/checkpoint-1"},
                       {"selectedCheckpointStep": 64}, {"selectedCumulativeProductionSteps": 96},
                       {"developmentIds": list(runner.DEV_IDS)}, {"productionPromotionEligible": True}, {"steps": True}]
            for change in changes:
                with self.subTest(change=change):
                    write_json(summary_path, {**original, **change})
                    with self.scope(root, cases), self.assertRaises((ValueError, RuntimeError)):
                        prepare_dev.build_bundle(summary_path)
            self.assertFalse((root / (prepare_dev.STAGE + "-run")).exists())

    def test_runtime_requires_summary_and_weight_raw_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary_path = fixture(root)
            with self.scope(root, cases): bundle = prepare_dev.build_bundle(summary_path)
            summary_raw = summary_path.read_bytes()
            summary_path.write_bytes(summary_raw + b"\n")
            with self.assertRaisesRegex(RuntimeError, "HASH_VERIFIED_SOURCE_ADAPTER"):
                runner.resolve_adapter(summary_path.parent, bundle)
            summary_path.write_bytes(summary_raw)
            (summary_path.parent / "adapter" / "adapter_model.safetensors").write_bytes(b"other weights")
            with self.assertRaisesRegex(RuntimeError, "HASH_VERIFIED_SOURCE_ADAPTER"):
                runner.resolve_adapter(summary_path.parent, bundle)

    def test_changed_frozen_preparation_or_metadata_bytes_fail_closed(self):
        for relative in ("production-retry-kaggle-run/train.py", "production-retry-kaggle-run/kernel-metadata.json", "production-retry-dataset/manifest.json"):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary); cases, summary_path = fixture(root)
                path = root / relative
                path.write_bytes(path.read_bytes() + b"\n")
                with self.scope(root, cases), self.assertRaisesRegex(ValueError, "FROZEN_RAW_HASH_MISMATCH"):
                    prepare_dev.build_bundle(summary_path)

    def test_wrong_source_final_case_or_assistant_label_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary_path = fixture(root)
            with self.scope(root, cases): bundle = prepare_dev.build_bundle(summary_path)
            for mutate in [lambda value: value.update(sourceNotebook=runner.PRODUCTION_SOURCE),
                           lambda value: value.update(sourceNotebook="another/scriptrush-v2-production-retry-12345678"),
                           lambda value: value["cases"][0].update(id="v2-test-001"),
                           lambda value: value["cases"][0].update(expected="answer"),
                           lambda value: value["cases"][0]["messages"].append({"role": "assistant", "content": "answer"}),
                           lambda value: value["sourceFiles"].update(productionDevSha256="a" * 64),
                           lambda value: value["sourceFiles"].update(expected="answer"),
                           lambda value: value.update(artifactKind="recovered-checkpoint")]:
                changed = copy.deepcopy(bundle); mutate(changed)
                with self.assertRaises(ValueError): runner.validate_bundle(changed)

    def test_existing_run_or_receipt_preserved_before_any_source_read(self):
        for receipt_only in (False, True):
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                path = root / (prepare_dev.STAGE + ("-submission-manifest.json" if receipt_only else "-run"))
                if receipt_only: path.write_bytes(b"preserve me")
                else: path.mkdir(); (path / "run.py").write_bytes(b"preserve me")
                with patch.object(prepare_dev, "WORK", root), patch.object(prepare_dev, "build_bundle") as build, self.assertRaises(FileExistsError):
                    prepare_dev.prepare(root / "does-not-exist")
                build.assert_not_called()
                self.assertEqual((path if receipt_only else path / "run.py").read_bytes(), b"preserve me")

    def test_production_input_builder_removes_labels_without_loading_final_files(self):
        def measure(rows):
            return [dict(row, preparedInputTokens=6000) for row in rows]
        with patch.object(original_dev.utility_prepare, "measure_offline", side_effect=measure):
            cases = original_dev.production_inputs()
        self.assertEqual(tuple(row["id"] for row in cases), runner.PRODUCTION_DEV_IDS)
        for row in cases:
            self.assertEqual([message["role"] for message in row["messages"]], ["system", "user"])
        prepare_dev.verify_current_production_sources()
        source = Path(prepare_dev.__file__).read_text(encoding="utf-8")
        self.assertNotIn('"test.jsonl"', source)
        self.assertNotIn('"prompts.jsonl"', source)
        self.assertNotIn("authenticate", source)
        self.assertNotIn("kernels_push", source)


if __name__ == "__main__":
    unittest.main()
