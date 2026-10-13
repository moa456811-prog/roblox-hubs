"""Offline checks: python -m unittest discover -s experiments/specialist-v2/inference -p test_*.py

No GPU, LLM, Hugging Face download, Kaggle request or credential is used here.
"""
import ast
import base64
import copy
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zlib

import prepare
import runner


def sample_cases(test=12, production=8):
    result = []
    for group, count in (("test", test), ("production", production)):
        for index in range(count):
            messages = [{"role": "system", "content": "Return complete JSON."}, {"role": "user", "content": "Original prompt " + str(index)}]
            result.append({"id": f"{group}-{index + 1}", "group": group, "messages": messages, "promptSha256": runner.digest(runner.compact(messages)), "preparedInputTokens": 42})
    return result


def sample_bundle():
    return {"formatVersion": 1, "sourceNotebook": runner.SOURCE_NOTEBOOK, "model": runner.MODEL, "revision": runner.REVISION,
            "adapterSha256": {"adapter_config.json": "a" * 64, "adapter_model.safetensors": "b" * 64},
            "adapterSummarySha256": "c" * 64, "datasetManifestSha256": "d" * 64,
            "sourceFiles": {"testInputsSha256": "e" * 64, "productionInputsSha256": "f" * 64},
            "cases": sample_cases(), "limits": {"maxInputTokens": runner.MAX_INPUT_TOKENS, "maxNewTokens": runner.MAX_NEW_TOKENS, "maxSeconds": runner.MAX_SECONDS}}


class InferenceTests(unittest.TestCase):
    def test_bounded_blind_bundle_and_independent_balanced_worker_assignments(self):
        bundle = runner.validate_bundle(sample_bundle())
        assigned = [runner.assignment(bundle["cases"], worker, 2) for worker in range(2)]
        self.assertEqual([len(rows) for rows in assigned], [10, 10])
        self.assertEqual(set(index for index, _ in assigned[0]) & set(index for index, _ in assigned[1]), set())
        self.assertEqual(set(index for rows in assigned for index, _ in rows), set(range(20)))
        for rows in assigned:
            for group in ("test", "production"):
                first = [runner.variant_order(index, 2)[0] for index, row in rows if row["group"] == group]
                self.assertEqual(first.count("base"), first.count("specialist"))
        self.assertEqual(runner.variant_order(0, 1), ("base", "specialist"))
        self.assertEqual(runner.variant_order(1, 1), ("specialist", "base"))

    def test_labels_roles_extra_fields_and_wrong_prompt_hash_fail_closed(self):
        for mutate in (
            lambda bundle: bundle.update(expected={"answer": "forbidden"}),
            lambda bundle: bundle["cases"][0].update(expected={"answer": "forbidden"}),
            lambda bundle: bundle["cases"][0]["messages"].append({"role": "assistant", "content": "forbidden"}),
            lambda bundle: bundle["cases"][0]["messages"][0].update(tool_calls=[]),
            lambda bundle: bundle["cases"][0].update(promptSha256="0" * 64),
            lambda bundle: bundle["cases"][0].update(preparedInputTokens=runner.MAX_INPUT_TOKENS + 1),
            lambda bundle: bundle["cases"][1].update(id=bundle["cases"][0]["id"]),
            lambda bundle: bundle.update(sourceNotebook="someone/other-notebook"),
        ):
            bundle = sample_bundle()
            mutate(bundle)
            with self.assertRaises(ValueError):
                runner.validate_bundle(bundle)

    def test_counts_and_file_hash_manifest_are_bounded(self):
        bundle = sample_bundle()
        bundle["cases"] = sample_cases(test=11, production=8)
        with self.assertRaises(ValueError):
            runner.validate_bundle(bundle)
        bundle = sample_bundle()
        bundle["cases"] = sample_cases(test=12, production=9)
        with self.assertRaises(ValueError):
            runner.validate_bundle(bundle)
        for name in ("../adapter_config.json", "folder/weights", "C:\\secret"):
            bundle = sample_bundle()
            bundle["adapterSha256"][name] = "0" * 64
            with self.assertRaises(ValueError):
                runner.validate_bundle(bundle)

    def test_production_continuation_requires_owned_source_and_explicit_training_hash(self):
        source = "sciptrush/scriptrush-v2-production-1234abcd"
        self.assertTrue(runner.allowed_source_notebook(source))
        for invalid in ("other-owner/scriptrush-v2-production-1234abcd", "sciptrush/unrelated", source + "/outputs", "https://www.kaggle.com/code/" + source):
            self.assertFalse(runner.allowed_source_notebook(invalid))
        with self.assertRaises(ValueError):
            prepare.prepare("not-read", None, "not-read", source_notebook=source)
        bundle = sample_bundle()
        bundle["sourceNotebook"] = source
        bundle["datasetManifestSha256"] = "1" * 64
        self.assertEqual(runner.validate_bundle(bundle)["sourceNotebook"], source)
        with tempfile.TemporaryDirectory() as temporary:
            summary = Path(temporary) / "summary.json"
            summary.write_text(json.dumps({"model": runner.MODEL, "revision": runner.REVISION,
                "adapterSha256": bundle["adapterSha256"], "datasetManifestSha256": "1" * 64}), encoding="utf-8")
            with self.assertRaises(ValueError):
                prepare.adapter_metadata(summary)
            accepted = prepare.adapter_metadata(summary, "1" * 64)
            self.assertEqual(accepted["datasetManifestSha256"], "1" * 64)
            self.assertEqual(accepted["adapterSummarySha256"], runner.file_digest(summary))

    def test_adapter_requires_exact_export_hashes_and_correct_base_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "source" / "scriptrush-specialist-v2" / "adapter"
            directory.mkdir(parents=True)
            (directory / "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": runner.MODEL, "peft_type": "LORA"}), encoding="utf-8")
            (directory / "adapter_model.safetensors").write_bytes(b"owned offline test bytes")
            hashes = {path.name: runner.file_digest(path) for path in directory.iterdir()}
            self.assertEqual(runner.find_adapter(temporary, hashes), directory)
            summary = directory.parent / "training-summary.json"
            summary.write_text(json.dumps({"model": runner.MODEL, "revision": runner.REVISION,
                "datasetManifestSha256": "1" * 64, "adapterSha256": hashes}), encoding="utf-8")
            summary_hash = runner.file_digest(summary)
            self.assertEqual(runner.find_adapter(temporary, hashes, summary_hash, "1" * 64), directory)
            with self.assertRaises(RuntimeError):
                runner.find_adapter(temporary, hashes, "2" * 64, "1" * 64)
            with self.assertRaises(RuntimeError):
                runner.find_adapter(temporary, hashes, summary_hash, "3" * 64)
            (directory / "adapter_model.safetensors").write_bytes(b"changed")
            with self.assertRaises(RuntimeError):
                runner.find_adapter(temporary, hashes)
            (directory / "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": "wrong-model", "peft_type": "LORA"}), encoding="utf-8")
            changed = {path.name: runner.file_digest(path) for path in directory.iterdir()}
            with self.assertRaises(RuntimeError):
                runner.find_adapter(temporary, changed)

    def test_prepare_accepts_only_prompt_rows_and_discards_benign_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "cases.jsonl"
            rows = [{"id": row["id"], "messages": row["messages"], "promptSha256": row["promptSha256"], "benchmark": "owned-fixture"} for row in sample_cases(production=0)]
            source.write_text("".join(runner.compact(row) + "\n" for row in rows), encoding="utf-8")
            selected, file_hash = prepare.load_inputs(source, "test")
            self.assertEqual(len(selected), 12)
            self.assertEqual(len(file_hash), 64)
            self.assertTrue(all(set(row) == {"id", "group", "messages", "promptSha256"} for row in selected))
            rows[0]["expected"] = {"answer": "never-upload"}
            source.write_text("".join(runner.compact(row) + "\n" for row in rows), encoding="utf-8")
            with self.assertRaises(ValueError):
                prepare.load_inputs(source, "test")

    def test_prepare_preserves_exact_messages_and_never_emits_labels_or_training(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            test_path = root / "test-inputs.jsonl"
            rows = [{"id": row["id"], "messages": row["messages"]} for row in sample_cases(production=0)]
            test_path.write_text("".join(runner.compact(row) + "\n" for row in rows), encoding="utf-8")
            meta = {"adapterSha256": sample_bundle()["adapterSha256"], "adapterSummarySha256": "a" * 64, "datasetManifestSha256": "b" * 64}
            def count(cases):
                for row in cases:
                    row["preparedInputTokens"] = 42
                return cases
            with patch.object(prepare, "WORK", root / "ignored-work"), patch.object(prepare, "adapter_metadata", return_value=meta), patch.object(prepare, "measure_prompts", side_effect=count), patch("builtins.print"):
                receipt = prepare.prepare(test_path, None, root / "summary.json")
                run = prepare.WORK / "inference-run" / "run.py"
                self.assertEqual(receipt["scriptSha256"], runner.file_digest(run))
                self.assertNotIn(b"\r\n", run.read_bytes())
                receipt_path = prepare.WORK / "inference-submission-manifest.json"
                self.assertEqual(receipt_path.read_bytes(), (json.dumps(receipt, indent=2) + "\n").encode("utf-8"))
                self.assertNotIn(b"\r\n", (run.parent / "kernel-metadata.json").read_bytes())
                injected = ast.literal_eval(run.read_text(encoding="utf-8").splitlines()[0].split("=", 1)[1].strip())
                bundle = json.loads(zlib.decompress(base64.b64decode(injected)))
                self.assertEqual(bundle["cases"][0]["messages"], rows[0]["messages"])
                self.assertNotIn("train", bundle)
                self.assertNotIn("validation", bundle)
                self.assertNotIn("expected", runner.compact(bundle))
                self.assertNotIn("assistant", [message["role"] for row in bundle["cases"] for message in row["messages"]])
                self.assertFalse(receipt["trainingUploaded"])
                self.assertFalse(receipt["answersUploaded"])
                kaggle = json.loads((run.parent / "kernel-metadata.json").read_text(encoding="utf-8"))
                self.assertTrue(kaggle["is_private"])
                self.assertEqual(kaggle["kernel_sources"], [runner.SOURCE_NOTEBOOK])
                self.assertEqual(kaggle["dataset_sources"], [])
                with self.assertRaises(FileExistsError):
                    prepare.prepare(test_path, None, root / "summary.json")

    def test_measure_refuses_over_budget_without_truncation(self):
        class FakeTokenizer:
            @staticmethod
            def from_pretrained(model, revision):
                self.assertEqual(model, runner.MODEL)
                self.assertEqual(revision, runner.REVISION)
                return FakeTokenizer()
            def encode(self, text, add_special_tokens):
                self.text = text
                return types.SimpleNamespace(ids=[1] * (runner.MAX_INPUT_TOKENS + 1))
        with patch.dict(sys.modules, {"tokenizers": types.SimpleNamespace(Tokenizer=FakeTokenizer)}):
            with self.assertRaises(ValueError):
                prepare.measure_prompts(sample_cases(production=0))

    def test_runner_has_no_training_or_authenticated_network_api(self):
        source = Path(runner.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        calls = [node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else "" for node in ast.walk(tree) if isinstance(node, ast.Call)]
        self.assertFalse({"train", "backward", "step", "authenticate", "kernels_push", "getpass", "Trainer", "TrainingArguments"} & set(calls))
        self.assertNotIn("torch.distributed", source)
        self.assertIn("logits_to_keep=1", source)
        self.assertIn('"origin": "model-inference"', source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
