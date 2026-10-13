"""Offline private dataset admission/confirmation; never imports Kaggle itself."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import checkpoint_dataset as dataset


class Result(SimpleNamespace):
    def to_dict(self):
        return vars(self)


class CheckpointDatasetTests(unittest.TestCase):
    def fixture(self, root):
        recovered = root / "production-checkpoint-recovery" / "probe-c5e2dcd5"
        recovered.mkdir(parents=True)
        hashes, files = {}, {}
        for index, name in enumerate(dataset.FILES):
            raw = ("inert-" + name).encode()
            (recovered / name).write_bytes(raw)
            hashes[name] = dataset.digest(raw)
            files[name] = {"sha256": hashes[name], "bytes": len(raw)}
        receipt = {"sourceNotebook": dataset.SOURCE_NOTEBOOK, "sourceVersion": 1, "complete": True,
                   "trainingSummaryFabricated": False, "globalStep": 32, "bestGlobalStep": 32, "files": files}
        raw = json.dumps(receipt).encode()
        (recovered / "recovery-receipt.json").write_bytes(raw)
        return hashes, dataset.digest(raw)

    def test_preparation_copies_only_four_pinned_files_and_blocks_reuse_or_extra_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hashes, receipt_hash = self.fixture(root)
            with patch.object(dataset, "WORK", root), patch.object(dataset, "FILES", hashes), \
                    patch.object(dataset, "RECOVERY_SHA256", receipt_hash):
                receipt = dataset.prepare()
                self.assertFalse(receipt["uploadConfirmed"])
                self.assertEqual(set(receipt["files"]), {dataset.PREFIX + name for name in hashes})
                metadata = json.loads((root / "checkpoint-dataset" / "dataset-metadata.json").read_bytes())
                self.assertEqual(metadata["licenses"], [{"name": "apache-2.0"}])
                with self.assertRaises(FileExistsError):
                    dataset.prepare()
                (root / "checkpoint-dataset" / "final-labels.json").write_text("{}")
                api = Mock()
                with self.assertRaises(ValueError):
                    dataset.create(api)
                api.dataset_create_new.assert_not_called()

    def test_create_explicitly_private_and_records_only_response_hash_then_refuses_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hashes, receipt_hash = self.fixture(root)
            with patch.object(dataset, "WORK", root), patch.object(dataset, "FILES", hashes), \
                    patch.object(dataset, "RECOVERY_SHA256", receipt_hash):
                receipt = dataset.prepare()
                api = Mock()
                api.dataset_create_new.return_value = Result(status="ok", error=None, ref=receipt["datasetRef"],
                                                           url="https://invalid.example/signed?secret=never-save")
                result = dataset.create(api)
                self.assertFalse(result["ready"])
                api.dataset_create_new.assert_called_once_with(str(root / "checkpoint-dataset"), public=False,
                                                              quiet=True, convert_to_csv=False, dir_mode="zip")
                raw = (root / "checkpoint-dataset-create.json").read_bytes()
                self.assertNotIn(b"secret", raw)
                self.assertNotIn(b"invalid.example", raw)
                self.assertTrue(json.loads(raw)["createConfirmed"])
                self.assertFalse((root / "checkpoint-dataset-transport.json").exists())
                with self.assertRaises(FileExistsError):
                    dataset.create(api)

    def test_unknown_create_outcome_is_preserved_and_cannot_be_retried(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hashes, receipt_hash = self.fixture(root)
            with patch.object(dataset, "WORK", root), patch.object(dataset, "FILES", hashes), \
                    patch.object(dataset, "RECOVERY_SHA256", receipt_hash):
                dataset.prepare()
                api = Mock()
                api.dataset_create_new.side_effect = TimeoutError("do not expose error body")
                with self.assertRaises(TimeoutError):
                    dataset.create(api)
                self.assertFalse(json.loads((root / "checkpoint-dataset-create.json").read_bytes())["createConfirmed"])
                with self.assertRaises(FileExistsError):
                    dataset.create(api)

    def test_ready_requires_confirmed_private_owner_version_and_complete_file_inventory(self):
        receipt = {"datasetRef": "sciptrush/scriptrush-v2-checkpoint-1234abcd", "private": True,
                   "files": {dataset.PREFIX + name: {} for name in dataset.FILES},
                   "sourceNotebook": dataset.SOURCE_NOTEBOOK, "sourceVersion": 1,
                   "recoveryReceiptSha256": dataset.RECOVERY_SHA256, "trainerStateSha256": "b" * 64,
                   "datasetMetadataSha256": "c" * 64}
        created = {"datasetRef": receipt["datasetRef"], "createAttempted": True, "createConfirmed": True,
                   "uploadResponseSha256": "a" * 64}
        view = SimpleNamespace(ref=receipt["datasetRef"], is_private=True, owner_ref="sciptrush", current_version_number=1)
        listing = SimpleNamespace(dataset_files=[SimpleNamespace(name=name) for name in receipt["files"]],
                                  error_message=None, next_page_token=None)
        proof = dataset.verify_remote_proof(receipt, created, "ready", view, listing)
        self.assertTrue(proof["uploadConfirmed"])
        self.assertEqual(proof["artifactKind"], "private-checkpoint-transport")
        self.assertEqual(proof["status"], "READY")
        self.assertEqual(len(proof), 13)
        for field, wrong in (("is_private", False), ("owner_ref", "other"), ("current_version_number", 0),
                             ("ref", "sciptrush/other")):
            bad = SimpleNamespace(**{**vars(view), field: wrong})
            with self.assertRaises(ValueError):
                dataset.verify_remote_proof(receipt, created, "ready", bad, listing)
        for observed in ("processing", "failed", "unknown", None):
            with self.assertRaises(ValueError):
                dataset.verify_remote_proof(receipt, created, observed, view, listing)
        listing.dataset_files.pop()
        with self.assertRaises(ValueError):
            dataset.verify_remote_proof(receipt, created, "ready", view, listing)
        listing.dataset_files = [SimpleNamespace(name="training.zip")]
        self.assertEqual(dataset.verify_remote_proof(receipt, created, "ready", view, listing)["status"], "READY")
        created["createConfirmed"] = False
        created.pop("uploadResponseSha256")
        recovered = dataset.verify_remote_proof(receipt, created, "ready", view, listing)
        self.assertTrue(recovered["uploadConfirmed"])
        self.assertEqual(len(recovered["uploadResponseSha256"]), 64)
        created["createAttempted"] = False
        with self.assertRaises(ValueError):
            dataset.verify_remote_proof(receipt, created, "ready", view, listing)

    def test_empty_sdk_create_status_retains_received_response_hash_and_safe_diagnostics(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            hashes, receipt_hash = self.fixture(root)
            with patch.object(dataset, "WORK", root), patch.object(dataset, "FILES", hashes), \
                    patch.object(dataset, "RECOVERY_SHA256", receipt_hash):
                receipt = dataset.prepare()
                api = Mock()
                api.dataset_create_new.return_value = Result(status="", error=None, ref=receipt["datasetRef"],
                                                           url="https://invalid.example/signed?secret=never-save")
                with self.assertRaisesRegex(ValueError, "DATASET_CREATE_NOT_CONFIRMED") as error:
                    dataset.create(api)
                result = dataset.safe_failure(error.exception)
                recorded = json.loads((root / "checkpoint-dataset-create.json").read_bytes())
                self.assertEqual(len(recorded["uploadResponseSha256"]), 64)
                self.assertTrue(recorded["responseReceived"])
                self.assertFalse(recorded["createConfirmed"])
                self.assertEqual(result["errorCode"], "DATASET_CREATE_NOT_CONFIRMED")
                self.assertEqual(result["createEvidence"]["safeResponseStatus"], "OTHER_OR_EMPTY")
                self.assertNotIn("secret", json.dumps(result))

    def test_non_tty_credentials_are_rejected_before_getpass(self):
        with patch("kaggle_remote.sys.stdin.isatty", return_value=False), patch("kaggle_remote.getpass.getpass") as read:
            with self.assertRaisesRegex(ValueError, "TTY_REQUIRED"):
                dataset.read_credential()
            read.assert_not_called()


if __name__ == "__main__":
    unittest.main()
