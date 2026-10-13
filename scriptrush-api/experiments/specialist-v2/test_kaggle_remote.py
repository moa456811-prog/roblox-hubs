"""Offline controller regressions: immutable preparations and bounded identities."""
import hashlib
import json
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import kaggle_remote as remote


def response(value):
    return SimpleNamespace(to_dict=lambda: value)


class KaggleRemoteTests(unittest.TestCase):
    def fixture(self, work, stage="production-dev-dataset-inference", private=True, owner="sciptrush", crlf=False):
        run = work / remote.STAGES[stage][0]
        run.mkdir()
        raw = (json.dumps({"id": owner + "/scriptrush-v2-prepared-12345678", "title": "ScriptRush v2 prepared 12345678",
                           "is_private": private, "code_file": "run.py"}, indent=2) + "\n").encode("utf-8")
        if crlf:
            raw = raw.replace(b"\n", b"\r\n")
        (run / "kernel-metadata.json").write_bytes(raw)
        (run / "run.py").write_bytes(b"# inert fixture\n")
        return run, raw

    def test_push_preserves_exact_prepared_bytes_and_routes_returned_identity_separately(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            run, raw = self.fixture(work)
            api = Mock()
            accepted = "sciptrush/scriptrush-v2-accepted-87654321"
            api.kernels_push.return_value = response({"ref": "/code/" + accepted})
            api.kernels_status.return_value = response({"status": "running"})
            api.kernels_logs.return_value = '{"phase":"smoke"}\n'
            with patch.object(remote, "WORK", work):
                remote.experiment_action(api, "sciptrush", "production-dev-dataset-inference", "push")
                self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)
                self.assertEqual((run / "run.py").read_bytes(), b"# inert fixture\n")
                saved = json.loads(remote.identity_sidecar(run).read_bytes())
                self.assertEqual(saved["acceptedId"], accepted)
                self.assertEqual(saved["preparedMetadataSha256"], hashlib.sha256(raw).hexdigest())
                self.assertEqual(set(path.name for path in run.iterdir()), {"kernel-metadata.json", "run.py"})
                remote.experiment_action(api, "sciptrush", "production-dev-dataset-inference", "status")
                remote.experiment_action(api, "sciptrush", "production-dev-dataset-inference", "logs")
                remote.experiment_action(api, "sciptrush", "production-dev-dataset-inference", "output")
            api.kernels_status.assert_called_once_with(accepted)
            api.kernels_logs.assert_called_once_with(accepted)
            self.assertEqual(api.kernels_output.call_args.args[0], accepted)
            self.assertEqual(api.kernels_output.call_args.kwargs["file_pattern"], remote.INFERENCE_OUTPUT_PATTERN)

    def test_private_owner_and_bounded_prepared_identity_are_verified_before_push(self):
        for private, owner in ((False, "sciptrush"), (True, "other")):
            with tempfile.TemporaryDirectory() as temporary:
                work = Path(temporary)
                run, raw = self.fixture(work, private=private, owner=owner)
                api = Mock()
                with patch.object(remote, "WORK", work):
                    with self.assertRaises(ValueError):
                        remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                api.kernels_push.assert_not_called()
                self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)

    def test_returned_other_owner_or_malformed_ref_never_creates_active_identity(self):
        for ref in ("/code/other/scriptrush-abcdef", "/code/sciptrush/../other", "https://untrusted.example/signed?token=x",
                    "sciptrush/" + "a" * 51, None, ""):
            with tempfile.TemporaryDirectory() as temporary:
                work = Path(temporary)
                run, raw = self.fixture(work)
                api = Mock()
                api.kernels_push.return_value = response({"ref": ref})
                with patch.object(remote, "WORK", work):
                    with self.assertRaises(ValueError):
                        remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                    self.assertFalse(remote.identity_sidecar(run).exists())
                self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)

    def test_sdk_push_errors_and_invalid_sources_do_not_activate_or_rewrite_metadata(self):
        for result in ({"ref": "/code/sciptrush/scriptrush-abcdef", "error": "rejected"},
                       {"ref": "/code/sciptrush/scriptrush-abcdef", "invalidKernelSources": ["bad"]},
                       {"ref": "/code/sciptrush/scriptrush-abcdef", "invalid_dataset_sources": ["bad"]}):
            with tempfile.TemporaryDirectory() as temporary:
                work = Path(temporary)
                run, raw = self.fixture(work)
                api = Mock()
                api.kernels_push.return_value = response(result)
                with patch.object(remote, "WORK", work):
                    with self.assertRaisesRegex(ValueError, "KERNEL_PUSH_REJECTED"):
                        remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                    self.assertFalse(remote.identity_sidecar(run).exists())
                self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)

    def test_api_exception_preserves_preparation_and_no_sidecar_is_written(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            run, raw = self.fixture(work)
            api = Mock()
            api.kernels_push.side_effect = TimeoutError("transport timeout")
            with patch.object(remote, "WORK", work):
                with self.assertRaises(TimeoutError):
                    remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                self.assertFalse(remote.identity_sidecar(run).exists())
            self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)

    def test_existing_runs_without_sidecar_use_their_prepared_identity_including_crlf(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            run, raw = self.fixture(work, stage="utility", crlf=True)
            api = Mock()
            api.kernels_status.return_value = response({"status": "complete"})
            with patch.object(remote, "WORK", work):
                remote.experiment_action(api, "sciptrush", "utility", "status")
                remote.experiment_action(api, "sciptrush", "utility", "output")
            api.kernels_status.assert_called_once_with("sciptrush/scriptrush-v2-prepared-12345678")
            self.assertNotIn("file_pattern", api.kernels_output.call_args.kwargs)
            self.assertEqual((run / "kernel-metadata.json").read_bytes(), raw)

    def test_sidecar_is_bound_to_raw_bytes_and_rejects_same_json_with_different_newlines(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            run, raw = self.fixture(work)
            api = Mock()
            api.kernels_push.return_value = response({"ref": "/code/sciptrush/scriptrush-accepted-abcdef"})
            with patch.object(remote, "WORK", work):
                remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                (run / "kernel-metadata.json").write_bytes(raw.replace(b"\n", b"\r\n"))
                with self.assertRaisesRegex(ValueError, "DOES_NOT_MATCH_PREPARATION"):
                    remote.resolve_kernel_identity(run, "sciptrush")
                api.kernels_push.reset_mock()
                with self.assertRaises(ValueError):
                    remote.push_kernel(api, run, "sciptrush", "production-dev-dataset-inference")
                api.kernels_push.assert_not_called()

    def test_output_filter_excludes_only_exact_extracted_checkpoint_directory(self):
        excluded = ["checkpoint-dataset-extracted/training/checkpoint-32/adapter_model.safetensors",
                    "scriptrush-v2-inference/checkpoint-dataset-extracted/training/checkpoint-32/adapter_model.safetensors",
                    r"scriptrush\checkpoint-dataset-extracted\training\checkpoint-32\adapter_model.safetensors"]
        included = ["predictions.jsonl", "summary-worker-0.json", "inference-summary.json", "failure.json", "smoke-worker-1.json",
                    "logs/checkpoint-dataset-extracted-note.json", "checkpoint-dataset-extracted.json",
                    "scriptrush/training/checkpoint-32/adapter_model.safetensors"]
        for name in excluded:
            self.assertIsNone(re.search(remote.INFERENCE_OUTPUT_PATTERN, name), name)
        for name in included:
            self.assertIsNotNone(re.search(remote.INFERENCE_OUTPUT_PATTERN, name), name)
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            with patch.object(remote, "WORK", work):
                for stage in remote.STAGES:
                    self.fixture(work, stage=stage)
                    api = Mock()
                    remote.experiment_action(api, "sciptrush", stage, "output")
                    self.assertEqual("file_pattern" in api.kernels_output.call_args.kwargs, stage.endswith("inference"), stage)


if __name__ == "__main__":
    unittest.main()
