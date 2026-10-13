"""Temporary recovered metadata and dummy bytes only; no GPU or actual outputs."""
import copy
import ast
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backend
import server


class RecoveredArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.adapter = self.root / "checkpoint-32"
        self.adapter.mkdir()
        self.config = {"base_model_name_or_path": backend.MODEL, "revision": backend.REVISION, "peft_type": "LORA"}
        self.state = {"global_step": 32, "best_global_step": 32, "best_metric": backend.RECOVERED_BEST_METRIC,
                      "best_model_checkpoint": "/kaggle/working/scriptrush-specialist-v2/training/checkpoint-32",
                      "log_history": [{"step": 16, "eval_loss": 0.04}, {"step": 32, "eval_loss": backend.RECOVERED_BEST_METRIC}]}
        self.write_json(self.adapter / "adapter_config.json", self.config)
        self.write_json(self.adapter / "trainer_state.json", self.state)
        (self.adapter / "adapter_model.safetensors").write_bytes(b"dummy weights; never load as a model")
        (self.adapter / "README.md").write_bytes(b"dummy model card")
        self.receipt_path = self.root / "recovery-receipt.json"
        self.manifest_path = self.root / "deployment.json"
        self.receipt = {"artifactKind": "recovered-checkpoint", "sourceNotebook": backend.RECOVERED_SOURCE, "sourceVersion": 1,
                        "checkpoint": "checkpoint-32", "sourceRelativePath": "scriptrush-specialist-v2/training/checkpoint-32/",
                        "sourceReceiptSha256": "b" * 64, "sourceTrainingManifestSha256": backend.RECOVERED_TRAINING_MANIFEST,
                        "sourceScriptSha256": backend.RECOVERED_SOURCE_SCRIPT, "complete": True, "trainingSummaryFabricated": False,
                        "files": {}, "cancelRequested": False, "globalStep": 32, "bestGlobalStep": 32,
                        "selectedCheckpoint": "checkpoint-32", "bestValidationMetric": backend.RECOVERED_BEST_METRIC, "totalBytes": 0}
        self.manifest = {"formatVersion": 2, "artifactKind": "recovered-checkpoint", "model": backend.MODEL,
                         "revision": backend.REVISION, "servedModel": backend.SERVED_MODEL,
                         "trainingManifestSha256": backend.RECOVERED_TRAINING_MANIFEST,
                         "sourceNotebook": backend.RECOVERED_SOURCE, "sourceVersion": 1, "checkpoint": "checkpoint-32",
                         "trainerStateSha256": "", "recoveryReceiptSha256": "", "adapterSha256": {},
                         "sourceFiles": {"productionManifestSha256": backend.RECOVERED_PRODUCTION_MANIFEST,
                                         "sourceScriptSha256": backend.RECOVERED_SOURCE_SCRIPT,
                                         "sourceSubmissionReceiptSha256": "b" * 64},
                         "allowedSystemSha256": ["c" * 64]}
        self.repin_files()

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def write_json(path, value):
        path.write_text(json.dumps(value) + "\n", encoding="utf-8", newline="\n")

    def repin_receipt(self):
        self.write_json(self.receipt_path, self.receipt)
        self.manifest["recoveryReceiptSha256"] = backend.file_hash(self.receipt_path)
        self.write_json(self.manifest_path, self.manifest)

    def repin_files(self):
        self.receipt["files"] = {name: {"sha256": backend.file_hash(self.adapter / name), "bytes": (self.adapter / name).stat().st_size}
                                 for name in ["adapter_config.json", "adapter_model.safetensors", "trainer_state.json", "README.md"]}
        self.receipt["totalBytes"] = sum(record["bytes"] for record in self.receipt["files"].values())
        self.manifest["trainerStateSha256"] = self.receipt["files"]["trainer_state.json"]["sha256"]
        self.manifest["adapterSha256"] = {name: record["sha256"] for name, record in self.receipt["files"].items() if name != "trainer_state.json"}
        self.repin_receipt()

    def verify(self, **kwargs):
        return backend.verify_artifacts(self.manifest_path, self.adapter, recovery_receipt_path=self.receipt_path, **kwargs)

    def assertCode(self, code):
        with self.assertRaises(backend.ServiceError) as caught:
            self.verify()
        self.assertEqual(caught.exception.code, code)

    def test_real_recovery_shape_accepted_without_completed_summary(self):
        manifest, directory = self.verify()
        self.assertEqual(manifest, self.manifest)
        self.assertEqual(directory, self.adapter.resolve())
        self.assertFalse(list(self.root.rglob("*training-summary*")))
        self.assertNotIn("trainingSummarySha256", manifest)
        self.assertEqual(self.receipt["files"]["trainer_state.json"]["sha256"], manifest["trainerStateSha256"])

    def test_fixed_identity_matches_inference_loader_without_importing_it(self):
        source = Path(__file__).resolve().parents[1] / "inference" / "runner.py"
        constants = {node.targets[0].id: ast.literal_eval(node.value)
                     for node in ast.parse(source.read_text(encoding="utf-8")).body
                     if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
                     and node.targets[0].id in {"MODEL", "REVISION", "PRODUCTION_SOURCE", "PRODUCTION_MANIFEST", "PRODUCTION_SCRIPT", "PRODUCTION_FIXTURE_MANIFEST", "RECOVERED_BEST_METRIC"}}
        self.assertEqual((backend.MODEL, backend.REVISION, backend.RECOVERED_SOURCE, backend.RECOVERED_TRAINING_MANIFEST,
                          backend.RECOVERED_SOURCE_SCRIPT, backend.RECOVERED_PRODUCTION_MANIFEST, backend.RECOVERED_BEST_METRIC),
                         tuple(constants[name] for name in ["MODEL", "REVISION", "PRODUCTION_SOURCE", "PRODUCTION_MANIFEST", "PRODUCTION_SCRIPT", "PRODUCTION_FIXTURE_MANIFEST", "RECOVERED_BEST_METRIC"]))

    def test_raw_receipt_and_file_tampering_rejected_without_repinning(self):
        original_receipt = self.receipt_path.read_bytes()
        self.receipt_path.write_bytes(original_receipt + b"\n")
        self.assertCode("RECOVERY_RECEIPT_HASH_MISMATCH")
        self.receipt_path.write_bytes(original_receipt)
        for name, code in [("adapter_model.safetensors", "ADAPTER_HASH_MISMATCH"), ("trainer_state.json", "RECOVERY_FILE_BYTES_MISMATCH"), ("README.md", "ADAPTER_HASH_MISMATCH")]:
            with self.subTest(name=name):
                path = self.adapter / name
                original = path.read_bytes()
                path.write_bytes(original + b" ")
                self.assertCode(code)
                path.write_bytes(original)

    def test_manifest_source_version_checkpoint_and_training_lineage_fixed(self):
        for field, changed in [("sourceNotebook", "sciptrush/other"), ("sourceVersion", 2), ("sourceVersion", True),
                               ("checkpoint", "checkpoint-16"), ("trainingManifestSha256", "a" * 64)]:
            with self.subTest(field=field, changed=changed):
                original = self.manifest[field]
                self.manifest[field] = changed
                self.write_json(self.manifest_path, self.manifest)
                self.assertCode("UNEXPECTED_RECOVERED_CHECKPOINT_SOURCE")
                self.manifest[field] = original

    def test_receipt_cannot_claim_other_source_step_or_completed_training(self):
        for changed, code in [({"complete": False}, "EXPLICIT_RECOVERY_RECEIPT_REQUIRED"),
                              ({"trainingSummaryFabricated": True}, "EXPLICIT_RECOVERY_RECEIPT_REQUIRED"),
                              ({"expected": "hidden labels"}, "EXPLICIT_RECOVERY_RECEIPT_REQUIRED"),
                              ({"trainingSummary": {}}, "EXPLICIT_RECOVERY_RECEIPT_REQUIRED"),
                              ({"sourceVersion": 2}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"sourceNotebook": "sciptrush/other"}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"globalStep": 16}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"bestGlobalStep": 16}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"selectedCheckpoint": "checkpoint-16"}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"globalStep": True}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"cancelRequested": "false"}, "RECOVERY_SOURCE_OR_STEP_MISMATCH"),
                              ({"sourceScriptSha256": "a" * 64}, "RECOVERY_LINEAGE_OR_METRIC_MISMATCH")]:
            with self.subTest(changed=changed):
                original = copy.deepcopy(self.receipt)
                self.receipt.update(changed)
                self.repin_receipt()
                self.assertCode(code)
                self.receipt = original

    def test_invalid_metrics_and_source_receipt_hash_rejected_even_if_repinned(self):
        for value in [0.0001, float("nan"), float("inf"), True, "0.03299146145582199"]:
            with self.subTest(value=value):
                self.receipt["bestValidationMetric"] = value
                self.repin_receipt()
                self.assertCode("RECOVERY_LINEAGE_OR_METRIC_MISMATCH")
        self.receipt["bestValidationMetric"] = backend.RECOVERED_BEST_METRIC
        for changed in [{"sourceSubmissionReceiptSha256": "a" * 64}, {"sourceScriptSha256": "a" * 64},
                        {"productionManifestSha256": "a" * 64}, {"expected": "labels"}]:
            with self.subTest(changed=changed):
                original = copy.deepcopy(self.manifest["sourceFiles"])
                self.manifest["sourceFiles"].update(changed)
                self.repin_receipt()
                self.assertCode("RECOVERY_SOURCE_FILES_MISMATCH")
                self.manifest["sourceFiles"] = original

    def test_trainer_state_semantics_validated_after_all_hashes_recomputed(self):
        original = copy.deepcopy(self.state)
        mutations = [{"global_step": 16}, {"best_global_step": 16}, {"best_global_step": 32.0}, {"best_metric": float("nan")},
                     {"best_model_checkpoint": "/training/checkpoint-16"}, {"log_history": []}, {"log_history": {}},
                     {"log_history": [{"step": 32, "eval_loss": 0.03}]},
                     {"log_history": [{"step": 32, "eval_loss": float("inf")}]},
                     {"log_history": [original["log_history"][1]] * 2}]
        for changed in mutations:
            with self.subTest(changed=changed):
                self.state = {**original, **changed}
                self.write_json(self.adapter / "trainer_state.json", self.state)
                self.repin_files()
                self.assertCode("RECOVERED_TRAINER_STATE_MISMATCH")

    def test_exact_model_revision_and_lora_required_despite_repinning(self):
        for changed in [{"base_model_name_or_path": "another/model"}, {"revision": "main"}, {"peft_type": "OTHER"}]:
            with self.subTest(changed=changed):
                self.write_json(self.adapter / "adapter_config.json", {**self.config, **changed})
                self.repin_files()
                self.assertCode("UNEXPECTED_RECOVERED_ADAPTER_TYPE")

    def test_receipt_file_set_size_and_hash_mapping_exact(self):
        for mutation, code in [
            (lambda: self.receipt["files"].update({"../weights": {"sha256": "a" * 64, "bytes": 1}}), "RECOVERY_FILE_SET_MISMATCH"),
            (lambda: self.receipt["files"].update({"extra.json": {"sha256": "a" * 64, "bytes": 1}}), "RECOVERY_FILE_SET_MISMATCH"),
            (lambda: self.receipt["files"]["trainer_state.json"].update(bytes=True), "INVALID_RECOVERY_FILE_HASH_OR_SIZE"),
            (lambda: self.receipt["files"]["trainer_state.json"].update(bytes=backend.MAX_RECOVERY_BYTES + 1), "INVALID_RECOVERY_FILE_HASH_OR_SIZE"),
            (lambda: self.receipt.update(totalBytes=1), "RECOVERY_FILE_HASH_MAP_MISMATCH"),
            (lambda: self.receipt["files"]["trainer_state.json"].update(sha256="a" * 64), "RECOVERY_FILE_HASH_MAP_MISMATCH"),
            (lambda: self.receipt["files"]["trainer_state.json"].update(bytes=self.receipt["files"]["trainer_state.json"]["bytes"] + 1), "RECOVERY_FILE_HASH_MAP_MISMATCH")]:
            with self.subTest(code=code):
                original = copy.deepcopy(self.receipt)
                mutation()
                self.repin_receipt()
                self.assertCode(code)
                self.receipt = original
        self.receipt["files"]["trainer_state.json"]["bytes"] += 1
        self.receipt["totalBytes"] += 1
        self.repin_receipt()
        self.assertCode("RECOVERY_FILE_BYTES_MISMATCH")

    def test_state_missing_or_nonobject_and_receipt_bounds_rejected(self):
        path = self.adapter / "trainer_state.json"
        original = path.read_bytes()
        path.unlink()
        self.assertCode("RECOVERY_FILE_BYTES_MISMATCH")
        path.write_bytes(b"[]")
        self.repin_files()
        self.assertCode("INVALID_RECOVERED_TRAINER_STATE")
        path.write_bytes(original)
        self.repin_files()
        self.receipt_path.write_bytes(b" " * 32769)
        self.manifest["recoveryReceiptSha256"] = backend.file_hash(self.receipt_path)
        self.write_json(self.manifest_path, self.manifest)
        self.assertCode("INVALID_RECOVERY_RECEIPT")

    def test_artifact_modes_cannot_mix_or_silently_use_completed_summary(self):
        with self.assertRaises(backend.ServiceError) as caught:
            self.verify(summary_path=self.root / "invented-training-summary.json")
        self.assertEqual(caught.exception.code, "ARTIFACT_PROVENANCE_ARGUMENT_MISMATCH")
        with self.assertRaises(backend.ServiceError) as caught:
            backend.verify_artifacts(self.manifest_path, self.adapter)
        self.assertEqual(caught.exception.code, "ARTIFACT_PROVENANCE_ARGUMENT_MISMATCH")
        self.manifest["trainingSummarySha256"] = "a" * 64
        self.write_json(self.manifest_path, self.manifest)
        self.assertCode("INVALID_DEPLOYMENT_MANIFEST")
        del self.manifest["trainingSummarySha256"]
        for field in ["trainerStateSha256", "sourceFiles", "artifactKind"]:
            original = self.manifest.pop(field)
            self.write_json(self.manifest_path, self.manifest)
            self.assertCode("INVALID_DEPLOYMENT_MANIFEST")
            self.manifest[field] = original

    def test_recovery_validation_precedes_dependency_or_gpu_loading(self):
        self.receipt_path.write_bytes(self.receipt_path.read_bytes() + b"\n")
        with patch.object(backend.importlib.metadata, "version") as dependency:
            with self.assertRaises(backend.ServiceError) as caught:
                backend.GpuBackend(self.manifest_path, self.adapter, recovery_receipt_path=self.receipt_path)
        self.assertEqual(caught.exception.code, "RECOVERY_RECEIPT_HASH_MISMATCH")
        dependency.assert_not_called()


class ProvenanceCliTests(unittest.TestCase):
    def test_recovery_cli_passes_receipt_without_summary_or_http_changes(self):
        value = Mock(manifest={"allowedSystemSha256": ["c" * 64]})
        with patch.object(sys, "argv", ["server.py", "--deployment-manifest", "deployment.json", "--adapter-dir", "checkpoint-32", "--recovery-receipt", "recovery-receipt.json"]), \
                patch.object(server, "read_server_key", return_value="unused mock key"), patch.object(server, "GpuBackend", return_value=value) as constructor, \
                patch.object(server, "Application"), patch.object(server, "PrivateHttpServer") as http:
            server.main()
        constructor.assert_called_once_with("deployment.json", "checkpoint-32", None, recovery_receipt_path="recovery-receipt.json")
        self.assertEqual(http.call_args.args[0], ("127.0.0.1", 8000))

    def test_existing_completed_cli_remains_supported(self):
        value = Mock(manifest={"allowedSystemSha256": ["c" * 64]})
        with patch.object(sys, "argv", ["server.py", "--deployment-manifest", "deployment.json", "--adapter-dir", "adapter", "--training-summary", "training-summary.json"]), \
                patch.object(server, "read_server_key", return_value="unused mock key"), patch.object(server, "GpuBackend", return_value=value) as constructor, \
                patch.object(server, "Application"), patch.object(server, "PrivateHttpServer"):
            server.main()
        constructor.assert_called_once_with("deployment.json", "adapter", "training-summary.json", recovery_receipt_path=None)

    def test_cli_requires_exactly_one_provenance_path_before_reading_key(self):
        common = ["server.py", "--deployment-manifest", "deployment.json", "--adapter-dir", "checkpoint-32"]
        for options in [[], ["--training-summary", "summary.json", "--recovery-receipt", "receipt.json"]]:
            with self.subTest(options=options), patch.object(sys, "argv", common + options), patch.object(server, "read_server_key") as key, patch("sys.stderr"), self.assertRaises(SystemExit) as caught:
                server.main()
            self.assertEqual(caught.exception.code, 2)
            key.assert_not_called()


if __name__ == "__main__":
    unittest.main()
