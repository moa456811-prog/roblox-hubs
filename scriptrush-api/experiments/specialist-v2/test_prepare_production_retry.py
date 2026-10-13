"""Offline retry admission, standalone mount and external-fit provenance tests."""
import ast
import base64
from contextlib import ExitStack, redirect_stdout
import copy
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

import prepare_production_retry as retry
import kaggle_train as training
from test_prepare_pipeline_smoke import sample_bundle, frozen_script, receipt_for
from test_probe_checkpoint import files


def write_json(path, value):
    path.write_bytes(json.dumps(value, ensure_ascii=False).encode("utf-8") + b"\n")


class Fixture:
    def __init__(self, root):
        self.root = Path(root)
        self.work = self.root / "work"
        self.here = self.root / "source"
        self.here.mkdir()
        self.original = sample_bundle()
        self.script = frozen_script(self.original)
        self.script_sha = retry.digest(self.script)
        self.old_run = self.work / "production-kaggle-run"
        self.old_run.mkdir(parents=True)
        (self.old_run / "train.py").write_bytes(self.script)
        self.old_receipt = self.work / "production-submission-manifest.json"
        write_json(self.old_receipt, receipt_for(self.original, self.script))
        self.recovery = self.root / "recovered"
        self.recovery.mkdir()
        for name, raw in files().items():
            (self.recovery / name).write_bytes(raw)
        self.file_map = {name: {"sha256": retry.digest(raw), "bytes": len(raw)} for name, raw in files().items()}
        self.receipt = {"artifactKind": "recovered-checkpoint", "sourceNotebook": retry.runner.PRODUCTION_SOURCE,
                        "sourceVersion": 1, "checkpoint": "checkpoint-32", "selectedCheckpoint": "checkpoint-32",
                        "sourceRelativePath": "scriptrush-specialist-v2/training/checkpoint-32/",
                        "sourceReceiptSha256": retry.digest(self.old_receipt.read_bytes()),
                        "sourceTrainingManifestSha256": retry.runner.PRODUCTION_MANIFEST, "sourceScriptSha256": self.script_sha,
                        "complete": True, "trainingSummaryFabricated": False, "cancelRequested": False,
                        "files": self.file_map, "totalBytes": sum(record["bytes"] for record in self.file_map.values()),
                        "globalStep": 32, "bestGlobalStep": 32, "bestValidationMetric": retry.runner.RECOVERED_BEST_METRIC}
        self.receipt_path = self.recovery / "recovery-receipt.json"
        write_json(self.receipt_path, self.receipt)
        self.transport = {"artifactKind": "private-checkpoint-transport", "private": True, "uploadConfirmed": True, "status": "READY",
                          "datasetRef": "sciptrush/scriptrush-v2-checkpoint-1188a68d", "datasetVersion": 1,
                          "sourceNotebook": retry.runner.PRODUCTION_SOURCE, "sourceVersion": 1,
                          "recoveryReceiptSha256": retry.digest(self.receipt_path.read_bytes()),
                          "trainerStateSha256": self.file_map["trainer_state.json"]["sha256"],
                          "files": {"training/checkpoint-32/" + name: record for name, record in self.file_map.items()},
                          "datasetMetadataSha256": "e" * 64, "uploadResponseSha256": "f" * 64}
        self.transport_path = self.root / "transport.json"
        write_json(self.transport_path, self.transport)
        (self.here / "kaggle_train.py").write_bytes((retry.HERE / "kaggle_train.py").read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        (self.here / "inference").mkdir()
        source = (retry.HERE / "inference" / "runner.py").read_text(encoding="utf-8")
        source = source.replace(retry.runner.PRODUCTION_SCRIPT, self.script_sha)
        (self.here / "inference" / "runner.py").write_text(source, encoding="utf-8", newline="\n")

    def patches(self):
        stack = ExitStack()
        for module, name, value in [(retry, "WORK", self.work), (retry, "HERE", self.here),
                                    (retry.frozen, "FROZEN_SCRIPT_SHA256", self.script_sha),
                                    (retry.runner, "PRODUCTION_SCRIPT", self.script_sha),
                                    (retry, "RECOVERY_SHA256", retry.digest(self.receipt_path.read_bytes())),
                                    (retry, "TRANSPORT_SHA256", retry.digest(self.transport_path.read_bytes())),
                                    (training, "PRODUCTION_RETRY_RECOVERY_SHA256", retry.digest(self.receipt_path.read_bytes())),
                                    (training, "PRODUCTION_RETRY_TRANSPORT_SHA256", retry.digest(self.transport_path.read_bytes()))]:
            stack.enter_context(patch.object(module, name, value))
        stack.enter_context(patch.object(retry, "measure_offline", return_value={split: {"count": count, "maxTokens": 7000, "p95Tokens": 7000} for split, count in retry.COUNTS.items()}))
        stack.enter_context(redirect_stdout(io.StringIO()))
        return stack

    def prepare(self):
        with self.patches():
            receipt = retry.prepare(self.receipt_path, self.transport_path)
        script = (self.work / "production-retry-kaggle-run" / "train.py").read_bytes()
        payload = ast.literal_eval(ast.parse(script.decode().splitlines()[0]).body[0].value)
        bundle = json.loads(zlib.decompress(base64.b64decode(payload)))
        return receipt, bundle, script

    def namespace(self, script):
        namespace = {"__name__": "offline_prepared_retry"}
        exec(compile(script, "offline-prepared.py", "exec"), namespace)
        namespace["PRODUCTION_RETRY_RECOVERY_SHA256"] = retry.digest(self.receipt_path.read_bytes())
        namespace["PRODUCTION_RETRY_TRANSPORT_SHA256"] = retry.digest(self.transport_path.read_bytes())
        return namespace


class ProductionRetryPreparationTests(unittest.TestCase):
    def test_exact_frozen_rows_recipe_raw_hashes_and_old_preparation_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            old_script = (fixture.old_run / "train.py").read_bytes()
            old_receipt = fixture.old_receipt.read_bytes()
            receipt, bundle, script = fixture.prepare()
            for split in retry.COUNTS:
                self.assertEqual(bundle[split], fixture.original[split])
                self.assertEqual(bundle["run"]["inputRowsSha256"][split], retry.digest(retry.compact(fixture.original[split])))
            expected = {"steps": 64, "evaluationSteps": 16, "learningRate": 2e-5, "maxContext": 8192,
                        "assistantLogitsOnly": True, "seed": 39119, "developmentMode": "external", "runPurpose": "production-continuation-fit"}
            self.assertEqual({name: bundle["run"][name] for name in expected}, expected)
            self.assertNotIn("initialSummarySha256", bundle["run"])
            self.assertNotIn("skipDevelopment", bundle["run"])
            self.assertFalse(receipt["diagnosticOnly"])
            self.assertFalse(receipt["developmentSkipped"])
            self.assertEqual(receipt["developmentStatus"], "external-pending")
            self.assertFalse(receipt["productionPromotionEligible"])
            self.assertFalse(receipt["optimizerStateResumed"])
            self.assertEqual(receipt["cumulativeProductionSteps"], 96)
            self.assertEqual(receipt["expectedDevelopmentOutputs"], 0)
            self.assertEqual(receipt["scriptSha256"], retry.digest(script))
            self.assertNotIn(b"\r", script)
            metadata_raw = (fixture.work / "production-retry-kaggle-run" / "kernel-metadata.json").read_bytes()
            metadata = json.loads(metadata_raw)
            self.assertEqual(receipt["metadataSha256"], retry.digest(metadata_raw))
            self.assertEqual(metadata["dataset_sources"], [fixture.transport["datasetRef"]])
            self.assertEqual(metadata["kernel_sources"], [])
            self.assertTrue(metadata["is_private"])
            manifest = (fixture.work / "production-retry-dataset" / "manifest.json").read_bytes()
            self.assertEqual(receipt["datasetManifestSha256"], retry.digest(manifest))
            self.assertEqual(bundle["manifestSha256"], retry.digest(manifest))
            self.assertEqual(receipt["initialRecoveredCheckpointSha256"], retry.digest(retry.compact(bundle["run"]["initialRecoveredCheckpoint"])))
            self.assertEqual((fixture.old_run / "train.py").read_bytes(), old_script)
            self.assertEqual(fixture.old_receipt.read_bytes(), old_receipt)
            self.assertFalse(list(fixture.work.glob("**/training-summary.json")))
            with fixture.patches(), self.assertRaises(FileExistsError):
                retry.prepare(fixture.receipt_path, fixture.transport_path)
            self.assertEqual((fixture.work / "production-retry-kaggle-run" / "train.py").read_bytes(), script)

    def test_standalone_prepared_script_mounts_raw_checkpoint_without_repository_imports(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            _, bundle, script = fixture.prepare()
            namespace = fixture.namespace(script)
            self.assertEqual(namespace["validate_production_retry_bundle"](bundle), bundle)
            raw = fixture.root / "input" / "dataset" / "training" / "checkpoint-32"
            raw.mkdir(parents=True)
            for name in fixture.file_map:
                shutil.copyfile(fixture.recovery / name, raw / name)
            found = namespace["mounted_recovered_adapter"](bundle["run"], retry.runner.MODEL, retry.runner.REVISION, root=fixture.root / "input", extraction=fixture.root / "rank-0")
            self.assertEqual(found, raw)
            top = [node for node in ast.parse(script.decode()).body if isinstance(node, (ast.Import, ast.ImportFrom))]
            self.assertFalse(any(name in ast.unparse(node) for node in top for name in ["runner", "prepare_production", "kaggle_train", "torch", "transformers", "peft"]))
            (raw / "trainer_state.json").write_bytes((raw / "trainer_state.json").read_bytes() + b"\n")
            with self.assertRaises(RuntimeError):
                namespace["mounted_recovered_adapter"](bundle["run"], retry.runner.MODEL, retry.runner.REVISION, root=fixture.root / "input", extraction=fixture.root / "rank-0")

    def test_zip_mount_is_bounded_hash_pinned_and_extracted_separately_per_rank(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            _, bundle, script = fixture.prepare()
            namespace = fixture.namespace(script)
            mount = fixture.root / "input"
            mount.mkdir()
            with zipfile.ZipFile(mount / "training.zip", "w") as zipped:
                for name in fixture.file_map:
                    zipped.write(fixture.recovery / name, "checkpoint-32/" + name)
            found = [namespace["mounted_recovered_adapter"](bundle["run"], retry.runner.MODEL, retry.runner.REVISION, root=mount, extraction=fixture.root / f"rank-{rank}") for rank in (0, 1)]
            self.assertNotEqual(found[0], found[1])
            for path in found:
                self.assertEqual(retry.runner.file_digest(path / "adapter_model.safetensors"), fixture.file_map["adapter_model.safetensors"]["sha256"])
            with zipfile.ZipFile(mount / "training.zip", "a") as zipped:
                zipped.writestr("../escape", "forbidden")
            with self.assertRaises(RuntimeError):
                namespace["mounted_recovered_adapter"](bundle["run"], retry.runner.MODEL, retry.runner.REVISION, root=mount, extraction=fixture.root / "rank-2")
            self.assertFalse((fixture.root / "escape").exists())

    def test_modified_frozen_source_recovery_transport_or_weights_prevents_any_preparation(self):
        for changed in ["script", "receipt", "transport", "weights"]:
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as temporary:
                fixture = Fixture(temporary)
                with fixture.patches():
                    path = {"script": fixture.old_run / "train.py", "receipt": fixture.receipt_path,
                            "transport": fixture.transport_path, "weights": fixture.recovery / "adapter_model.safetensors"}[changed]
                    path.write_bytes(path.read_bytes() + b"\n")
                    with self.assertRaises((ValueError, RuntimeError)):
                        retry.prepare(fixture.receipt_path, fixture.transport_path)
                self.assertFalse((fixture.work / "production-retry-kaggle-run").exists())

    def test_runtime_rejects_changed_recipe_labels_or_dataset_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            _, bundle, script = fixture.prepare()
            namespace = fixture.namespace(script)
            mutations = [lambda value: value["run"].update(steps=32), lambda value: value["run"].update(seed=39107),
                         lambda value: value["run"].update(learningRate=3e-5), lambda value: value["run"].update(initialSummarySha256="a" * 64),
                         lambda value: value["run"].update(skipDevelopment=True), lambda value: value["run"].update(developmentMode="inline"),
                         lambda value: value.update(test=[]), lambda value: value["dev"][0].update(expected="labels"),
                         lambda value: value["dev"][0]["messages"].append({"role": "assistant", "content": "labels"}),
                         lambda value: value["train"][0]["messages"][1].update(content="changed training"),
                         lambda value: value["validation"].pop(),
                         lambda value: value["run"]["initialRecoveredCheckpoint"].update(recoveryReceiptSha256="a" * 64),
                         lambda value: value["run"]["initialRecoveredCheckpoint"]["checkpointDatasetTransport"].update(receiptSha256="a" * 64)]
            for mutate in mutations:
                with self.subTest(mutate=mutate):
                    changed = copy.deepcopy(bundle)
                    mutate(changed)
                    with self.assertRaises(RuntimeError):
                        namespace["validate_production_retry_bundle"](changed)

    def test_embedded_validator_bytes_are_verified_before_any_mount(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            _, bundle, script = fixture.prepare()
            namespace = fixture.namespace(script)
            namespace["SCRIPTRUSH_RECOVERY_VALIDATORS_SHA256"] = "a" * 64
            with self.assertRaisesRegex(RuntimeError, "EMBEDDED_RECOVERY_VALIDATORS_CHANGED"):
                namespace["mounted_recovered_adapter"](bundle["run"], retry.runner.MODEL, retry.runner.REVISION, root=fixture.root)


class ExternalDevelopmentPolicyTests(unittest.TestCase):
    def test_selected_adapter_step_does_not_claim_all_fitting_steps(self):
        config = {"initialRecoveredCheckpoint": {"sourceVersion": 1}}
        for best in [16, 32, 48, 64]:
            with self.subTest(best=best):
                lineage = training.selected_training_lineage(config, 64, best)
                self.assertEqual(lineage["cumulativeProductionSteps"], 96)
                self.assertEqual(lineage["selectedCheckpointStep"], best)
                self.assertEqual(lineage["selectedCumulativeProductionSteps"], 32 + best)
        self.assertEqual(training.selected_training_lineage({}, 96, 64), {"selectedCheckpointStep": 64})
        for best in [None, True, 0, 65, 16.0]:
            with self.subTest(best=best), self.assertRaises(RuntimeError):
                training.selected_training_lineage(config, 64, best)

    def test_external_mode_is_explicit_non_diagnostic_and_does_not_claim_skipping(self):
        config = {"runPurpose": "production-continuation-fit", "developmentMode": "external"}
        self.assertFalse(training.development_policy(config))
        for changed in [{"runPurpose": "pipeline-smoke"}, {"developmentMode": "inline"}, {"skipDevelopment": True}]:
            with self.subTest(changed=changed), self.assertRaises(RuntimeError):
                training.development_policy({**config, **changed})

    def test_fit_receipt_preserves_external_pending_and_is_not_mutated_by_later_dev(self):
        with tempfile.TemporaryDirectory() as temporary:
            summary = training.persist_fit_summary(temporary, {"developmentMode": "external", "developmentSkipped": False,
                                                               "diagnosticOnly": False, "productionPromotionEligible": False,
                                                               "runPurpose": "production-continuation-fit"})
            fit = Path(temporary) / "fit-summary.json"
            original = fit.read_bytes()
            self.assertEqual(summary["developmentStatus"], "external-pending")
            self.assertFalse(summary["developmentSkipped"])
            self.assertFalse(summary["diagnosticOnly"])
            summary["developmentStatus"] = "independently-tested"
            training.write_json_atomic(Path(temporary) / "training-summary.json", summary)
            self.assertEqual(fit.read_bytes(), original)

    def test_remote_stages_and_warm_start_semantics(self):
        import kaggle_remote
        self.assertEqual(kaggle_remote.STAGES["production-retry"], ("production-retry-kaggle-run", "production-retry-kaggle-output", "production-retry-kaggle-runtime.log"))
        self.assertEqual(kaggle_remote.STAGES["production-retry-dev-inference"][0], "production-retry-dev-inference-run")
        source = Path(training.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == "trainer" and node.func.attr == "train"]
        self.assertEqual(len(calls), 1)
        self.assertFalse(calls[0].args or calls[0].keywords)
        self.assertIn("checkpoint_safe_trainer(Trainer)", source)
        self.assertIn("if skip_development or external_development:", source)


if __name__ == "__main__":
    unittest.main()
