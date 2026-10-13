"""Independent CPU-only continuation preparation/lineage review.

All datasets, metadata, adapters and output bundles live in temporary directories.
Tokenizer is a deterministic mock; no Hugging Face/Kaggle/API/GPU call occurs.
Run: python -m unittest discover -s experiments/specialist-v2/inference -p test_production_review.py
"""
import ast
import base64
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zlib

PARENT = Path(__file__).resolve().parent.parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, PARENT / filename)
    imported = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(imported)
    return imported


production = module("review_production_prepare", "prepare_production.py")
training = module("review_kaggle_training", "kaggle_train.py")


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")


def jsonl(path, values):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(value, ensure_ascii=False) + "\n" for value in values), encoding="utf-8")


def rows(prefix, split, count):
    return [{"id": f"{prefix}-{split}-{index + 1}", "split": split,
             "messages": [{"role": "system", "content": "Compose all requested controls."},
                          {"role": "user", "content": "Full Hub request " + str(index + 1)},
                          {"role": "assistant", "content": '{"window":{},"pages":[]}'}],
             "expected": {"localOnlySentinel": "NEVER_UPLOAD_EXPECTED_LABELS"}}
            for index in range(count)]


class FakeTokenizer:
    @staticmethod
    def from_pretrained(model, revision):
        if model != production.MODEL or revision != production.REVISION:
            raise AssertionError("Tokenizer must remain pinned")
        return FakeTokenizer()

    def encode(self, text, add_special_tokens):
        if add_special_tokens:
            raise AssertionError("Template supplies its own special tokens")
        return types.SimpleNamespace(ids=[1] * len(text))


class Fixture:
    def __init__(self, root):
        self.api = Path(root) / "api"
        self.here = self.api / "experiments" / "specialist-v2"
        self.work = self.api / "test-results" / "specialist-v2"
        self.utility = self.work / "dataset"
        self.prod = self.here / "production" / "train" / "artifacts"
        self.source = self.api / "src" / "lib" / "owned-source.ts"
        self.source.parent.mkdir(parents=True, exist_ok=True)
        self.source.write_text("export const ownedSource = true;\n", encoding="utf-8")
        jsonl(self.utility / "train.jsonl", rows("utility", "train", 256))
        dump(self.utility / "manifest.json", {"files": {"train": {"sha256": production.digest((self.utility / "train.jsonl").read_bytes())}}})
        self.utility_hash = production.digest((self.utility / "manifest.json").read_bytes())
        self.prod_rows = {split: rows("production", split, count) for split, count in (("train", 48), ("validation", 8), ("dev", 4))}
        for split, group in self.prod_rows.items():
            jsonl(self.prod / f"{split}.jsonl", group)
        self.refresh_production_manifest()
        self.export = self.work / "kaggle-output" / "owned-export"
        self.adapter = self.export / "adapter"
        dump(self.adapter / "adapter_config.json", {"base_model_name_or_path": production.MODEL, "peft_type": "LORA"})
        (self.adapter / "adapter_model.safetensors").write_bytes(b"OFFLINE_TEST_ADAPTER_BYTES")
        self.adapter_hashes = {path.name: production.digest(path.read_bytes()) for path in self.adapter.iterdir()}
        self.summary = self.export / "training-summary.json"
        dump(self.summary, {"model": production.MODEL, "revision": production.REVISION,
             "datasetManifestSha256": self.utility_hash, "steps": 96, "adapterSha256": self.adapter_hashes})
        dump(self.work / "kaggle-run" / "kernel-metadata.json", {"id": "sciptrush/scriptrush-specialist-v2-1940b014"})
        # This is the real current trainer source, copied into a TEMP fixture.
        (self.here / "kaggle_train.py").write_text((PARENT / "kaggle_train.py").read_text(encoding="utf-8"), encoding="utf-8")

    def refresh_production_manifest(self):
        dump(self.prod / "manifest.json", {"counts": {"train": 48, "validation": 8, "dev": 4},
             "heldoutAudit": {"overlaps": []}, "sourceSha256": {"owned-source.ts": production.digest(self.source.read_bytes())},
             "files": {split: {"sha256": production.digest((self.prod / f"{split}.jsonl").read_bytes())} for split in self.prod_rows}})

    def prepare(self):
        with ExitStack() as stack:
            for name, value in (("HERE", self.here), ("API", self.api), ("WORK", self.work), ("UTILITY_MANIFEST_SHA", self.utility_hash)):
                stack.enter_context(patch.object(production, name, value))
            stack.enter_context(patch.dict(sys.modules, {"tokenizers": types.SimpleNamespace(Tokenizer=FakeTokenizer)}))
            stack.enter_context(patch("builtins.print"))
            return production.prepare()


class ProductionReviewTests(unittest.TestCase):
    def test_continuation_bundle_counts_bounds_labels_and_lineage(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            receipt = fixture.prepare()
            self.assertEqual(receipt["counts"], {"train": 144, "validation": 8, "dev": 4})
            self.assertEqual(receipt["run"]["steps"], 32)
            self.assertEqual(receipt["run"]["learningRate"], 3e-5)
            self.assertEqual(receipt["run"]["evaluationSteps"], 16)
            self.assertEqual(receipt["run"]["maxContext"], 8192)
            self.assertTrue(receipt["run"]["assistantLogitsOnly"])
            self.assertEqual(receipt["run"]["initialManifestSha256"], fixture.utility_hash)
            self.assertEqual(receipt["run"]["initialSummarySha256"], production.digest(fixture.summary.read_bytes()))
            run = fixture.work / "production-kaggle-run"
            source = (run / "train.py").read_text(encoding="utf-8")
            injected = ast.literal_eval(source.splitlines()[0].split("=", 1)[1].strip())
            bundle = json.loads(zlib.decompress(base64.b64decode(injected)))
            self.assertEqual(set(bundle), {"train", "validation", "dev", "manifestSha256", "run"})
            self.assertEqual(len(bundle["train"]), 144)
            self.assertEqual(sum(row["id"].startswith("utility-") for row in bundle["train"]), 96)
            self.assertTrue(all(set(row) == {"id", "messages"} for split in ("train", "validation", "dev") for row in bundle[split]))
            self.assertTrue(all([message["role"] for message in row["messages"]] == ["system", "user", "assistant"] for row in bundle["train"] + bundle["validation"]))
            self.assertTrue(all([message["role"] for message in row["messages"]] == ["system", "user"] for row in bundle["dev"]))
            self.assertNotIn("NEVER_UPLOAD_EXPECTED_LABELS", json.dumps(bundle))
            metadata = json.loads((run / "kernel-metadata.json").read_text(encoding="utf-8"))
            self.assertTrue(metadata["is_private"])
            self.assertEqual(metadata["kernel_sources"], ["sciptrush/scriptrush-specialist-v2-1940b014"])
            self.assertFalse(receipt["finalInputsUploaded"])
            self.assertFalse(receipt["finalAnswersUploaded"])
            with self.assertRaisesRegex(RuntimeError, "PRESERVE_EXISTING_PRODUCTION_SUBMISSION"):
                fixture.prepare()

    def test_utility_training_hash_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            with (fixture.utility / "train.jsonl").open("a", encoding="utf-8") as handle:
                handle.write("\n")
            with self.assertRaisesRegex(RuntimeError, "UTILITY_TRAINING_FILE_CHANGED"):
                fixture.prepare()

    def test_production_split_source_and_adapter_changes_are_rejected(self):
        for target, expected in (("split", "PRODUCTION_SPLIT_HASH_MISMATCH"), ("source", "PRODUCTION_SOURCES_CHANGED"), ("adapter", "INITIAL_ADAPTER_HASH_MISMATCH")):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as temporary:
                fixture = Fixture(temporary)
                path = fixture.prod / "train.jsonl" if target == "split" else fixture.source if target == "source" else fixture.adapter / "adapter_model.safetensors"
                with path.open("ab") as handle:
                    handle.write(b"changed")
                with self.assertRaisesRegex(RuntimeError, expected):
                    fixture.prepare()

    def test_missing_completed_summary_and_duplicate_case_fail(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            fixture.summary.unlink()
            with self.assertRaisesRegex(RuntimeError, "COMPLETED_UTILITY_SUMMARY_REQUIRED"):
                fixture.prepare()
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            fixture.prod_rows["train"][1]["id"] = fixture.prod_rows["train"][0]["id"]
            jsonl(fixture.prod / "train.jsonl", fixture.prod_rows["train"])
            fixture.refresh_production_manifest()
            with self.assertRaisesRegex(RuntimeError, "DUPLICATE_TEACHING_CASE"):
                fixture.prepare()

    def test_development_missing_user_cannot_compile_submission(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            fixture.prod_rows["dev"][0]["messages"] = [{"role": "system", "content": "Keep English UI"}, {"role": "assistant", "content": "local answer"}]
            jsonl(fixture.prod / "dev.jsonl", fixture.prod_rows["dev"])
            fixture.refresh_production_manifest()
            with self.assertRaisesRegex(RuntimeError, "INVALID_STAGE_MESSAGES"):
                fixture.prepare()
            self.assertFalse((fixture.work / "production-kaggle-run" / "train.py").exists())

    def test_mounted_resume_checks_summary_manifest_and_export_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Fixture(temporary)
            config = {"initialAdapterSha256": fixture.adapter_hashes,
                      "initialSummarySha256": production.digest(fixture.summary.read_bytes()),
                      "initialManifestSha256": fixture.utility_hash}
            real_path = Path
            def mapped_path(value):
                return fixture.work / "kaggle-output" if value == "/kaggle/input" else real_path(value)
            with patch.object(training, "Path", side_effect=mapped_path):
                self.assertEqual(training.mounted_adapter(config, production.MODEL, production.REVISION), fixture.adapter)
                for field in ("initialSummarySha256", "initialManifestSha256"):
                    changed = {**config, field: "0" * 64}
                    with self.assertRaisesRegex(RuntimeError, "UNIQUE_COMPLETE_PINNED_INITIAL_ADAPTER_NOT_FOUND"):
                        training.mounted_adapter(changed, production.MODEL, production.REVISION)
                (fixture.adapter / "adapter_model.safetensors").write_bytes(b"wrong exported weights")
                with self.assertRaisesRegex(RuntimeError, "UNIQUE_COMPLETE_PINNED_INITIAL_ADAPTER_NOT_FOUND"):
                    training.mounted_adapter(config, production.MODEL, production.REVISION)


if __name__ == "__main__":
    unittest.main(verbosity=2)
