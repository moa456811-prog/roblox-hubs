"""Offline retry preparation, leakage guards and AMP smoke checks."""
import ast
import base64
from contextlib import nullcontext
import copy
import json
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch
import zlib

import prepare_dev_retry as prepare_dev
import runner
from test_inference import sample_bundle


def dev_bundle():
    value = sample_bundle()
    value["mode"] = "development-retry"
    value["datasetManifestSha256"] = runner.V2_TRAINING_MANIFEST_SHA256
    value["cases"] = value["cases"][:4]
    for row, identity in zip(value["cases"], runner.DEV_IDS):
        row.update(id=identity, group="dev")
    return value


class DevRetryTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec("torch"), "Optional existing CPU Torch unavailable")
    def test_real_cpu_mixed_norm_head_boundary_needs_autocast(self):
        # Reproduce the dtype boundary, without loading a model or using CUDA.
        import torch
        hidden = torch.ones((1, 8), dtype=torch.float16)
        norm_weight = torch.ones(8, dtype=torch.float32)
        normalized = norm_weight * hidden
        self.assertEqual(normalized.dtype, torch.float32)
        head = torch.nn.Linear(8, 4, bias=False, dtype=torch.float16)
        with self.assertRaises(RuntimeError):
            head(normalized)
        with torch.autocast(device_type="cpu", dtype=torch.float16):
            self.assertEqual(head(normalized).dtype, torch.float16)

    def test_only_exact_original_development_ids_and_utility_adapter_allowed(self):
        self.assertEqual(len(runner.validate_bundle(dev_bundle())["cases"]), 4)
        for mutate in [lambda value: value["cases"][0].update(group="test"), lambda value: value["cases"][0].update(id="v2-dev-002"),
                       lambda value: value["cases"][0].update(expected="answer"), lambda value: value["cases"].pop(),
                       lambda value: value.update(sourceNotebook="sciptrush/scriptrush-v2-production-1234abcd"),
                       lambda value: value.update(datasetManifestSha256="0" * 64)]:
            value = dev_bundle()
            mutate(value)
            with self.assertRaises(ValueError):
                runner.validate_bundle(value)

    def fixture(self, root):
        original = prepare_dev.WORK
        (root / "dataset").mkdir()
        for name in ["manifest.json", "dev.jsonl"]:
            shutil.copyfile(original / "dataset" / name, root / "dataset" / name)
        shutil.copyfile(original / "pilot-dev.jsonl", root / "pilot-dev.jsonl")
        directory = root / "recovered" / "adapter"
        directory.mkdir(parents=True)
        (directory / "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": runner.MODEL, "peft_type": "LORA"}))
        (directory / "adapter_model.safetensors").write_bytes(b"fake CPU fixture weights")
        hashes = {path.name: runner.file_digest(path) for path in directory.iterdir()}
        summary = directory.parent / "training-summary.json"
        summary.write_text(json.dumps({"model": runner.MODEL, "revision": runner.REVISION, "steps": 96,
            "developmentIds": list(runner.DEV_IDS), "datasetManifestSha256": runner.V2_TRAINING_MANIFEST_SHA256, "adapterSha256": hashes}))
        return summary

    def test_prepared_bundle_contains_no_local_answers_or_final_cases(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            summary = self.fixture(root)
            def counts(cases):
                for row in cases:
                    row["preparedInputTokens"] = 42
                return cases
            with patch.object(prepare_dev, "WORK", root), patch.object(prepare_dev, "measure_offline", side_effect=counts), patch("builtins.print"):
                receipt = prepare_dev.prepare_dev_retry(summary)
                script = root / "dev-inference-run" / "run.py"
                self.assertEqual(receipt["scriptSha256"], runner.file_digest(script))
                self.assertNotIn(b"\r\n", script.read_bytes())
                receipt_path = root / "dev-inference-submission-manifest.json"
                self.assertEqual(receipt_path.read_bytes(), (json.dumps(receipt, indent=2) + "\n").encode("utf-8"))
                self.assertNotIn(b"\r\n", (script.parent / "kernel-metadata.json").read_bytes())
                payload = ast.literal_eval(script.read_text(encoding="utf-8").splitlines()[0].split("=", 1)[1].strip())
                bundle = json.loads(zlib.decompress(base64.b64decode(payload)))
                self.assertEqual(tuple(row["id"] for row in bundle["cases"]), runner.DEV_IDS)
                self.assertEqual([message["role"] for row in bundle["cases"] for message in row["messages"]], ["system", "user"] * 4)
                self.assertTrue(all(row["group"] == "dev" for row in bundle["cases"]))
                self.assertNotIn("expected", bundle)
                self.assertNotIn("train", bundle)
                self.assertNotIn("validation", bundle)
                self.assertNotIn("test", bundle)
                self.assertEqual(receipt["expectedOutputs"], 8)
                self.assertFalse(receipt["answersUploaded"])
                self.assertFalse(receipt["finalInputsUploaded"])
                metadata = json.loads((script.parent / "kernel-metadata.json").read_text())
                self.assertEqual(metadata["kernel_sources"], [runner.SOURCE_NOTEBOOK])
                self.assertTrue(metadata["is_private"])
                original_script = script.read_bytes()
                with self.assertRaises(FileExistsError):
                    prepare_dev.prepare_dev_retry(summary)
                self.assertEqual(script.read_bytes(), original_script)

    def test_changed_initial_development_prompt_or_adapter_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            summary = self.fixture(root)
            with patch.object(prepare_dev, "WORK", root):
                inputs = root / "pilot-dev.jsonl"
                raw = inputs.read_bytes()
                rows = [json.loads(line) for line in raw.decode().splitlines()]
                rows[0]["messages"][1]["content"] += " changed"
                inputs.write_text("".join(json.dumps(row) + "\n" for row in rows))
                with self.assertRaisesRegex(ValueError, "INITIAL_DEVELOPMENT_PROMPT_CHANGED"):
                    prepare_dev.load_selected_inputs()
                inputs.write_bytes(raw)
                (summary.parent / "adapter" / "adapter_model.safetensors").write_bytes(b"changed")
                with self.assertRaisesRegex(RuntimeError, "HASH_VERIFIED"):
                    prepare_dev.prepare_dev_retry(summary)

    def test_sanitized_diagnostic_contains_dtype_class_and_stack_only(self):
        try:
            raise RuntimeError("mat1 and mat2 must have the same dtype: Float and Half; SECRET_DO_NOT_OUTPUT /private/key")
        except RuntimeError as error:
            detail = runner.diagnostic(error)
        self.assertEqual(detail["errorCode"], "DTYPE_MISMATCH")
        self.assertEqual(detail["errorType"], "RuntimeError")
        self.assertTrue(detail["traceback"])
        text = json.dumps(detail)
        self.assertNotIn("SECRET_DO_NOT_OUTPUT", text)
        self.assertNotIn("/private/key", text)
        self.assertTrue(all(set(frame) == {"file", "function", "line"} for frame in detail["traceback"]))

    def test_two_variant_smoke_requires_amp_and_nonempty_generation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = Mock(device="fake-device")
            model.disable_adapter.side_effect = nullcontext
            model.generate.return_value.shape = (1, 5)
            tokenizer = Mock(eos_token_id=2, pad_token_id=2)
            tokenizer.apply_chat_template.return_value = [1, 2, 3]
            torch = Mock(float16="fake-fp16", long="fake-long")
            torch.tensor.return_value.shape = (1, 3)
            torch.inference_mode.side_effect = nullcontext
            torch.autocast.side_effect = lambda **kwargs: nullcontext()
            torch.isfinite.return_value.all.return_value = True
            with patch.object(runner, "OUT", root), patch("builtins.print"):
                runner.smoke_generation(model, tokenizer, torch, 0, 1, "development-retry")
            self.assertEqual(torch.autocast.call_count, 2)
            self.assertEqual(model.generate.call_count, 2)
            for call in torch.autocast.call_args_list:
                self.assertEqual(call.kwargs, {"device_type": "cuda", "dtype": "fake-fp16"})
            for call in model.generate.call_args_list:
                self.assertEqual(call.kwargs["max_new_tokens"], 2)
                self.assertEqual(call.kwargs["logits_to_keep"], 1)
                self.assertFalse(call.kwargs["do_sample"])
            self.assertTrue(json.loads((root / "smoke-worker-0.json").read_text())["passed"])

    def test_failed_gpu_smoke_never_creates_a_pass_marker(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = Mock(device="fake-device")
            model.disable_adapter.side_effect = nullcontext
            tokenizer = Mock()
            tokenizer.apply_chat_template.return_value = [1, 2, 3]
            torch = Mock()
            torch.inference_mode.side_effect = nullcontext
            torch.autocast.side_effect = lambda **kwargs: nullcontext()
            torch.isfinite.return_value.all.return_value = False
            with patch.object(runner, "OUT", root), self.assertRaisesRegex(RuntimeError, "NONFINITE_SMOKE_LOGITS"):
                runner.smoke_generation(model, tokenizer, torch, 0, 1, "development-retry")
            model.generate.assert_not_called()
            self.assertFalse((root / "smoke-worker-0.json").exists())


if __name__ == "__main__":
    unittest.main()
