"""Offline checkpoint-race and fit-receipt regressions; no ML imports or network."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from kaggle_train import checkpoint_safe_trainer, development_policy, persist_fit_summary, write_json_atomic


def adapter_fixture(directory, step):
    path = directory / f"checkpoint-{step}"
    path.mkdir()
    (path / "adapter_config.json").write_text("{}", encoding="utf-8")
    (path / "adapter_model.safetensors").write_bytes(b"inert-test-adapter")
    return path


class StubTrainer:
    def __init__(self, directory, state, wait=lambda: None):
        self.directory = directory
        self.state = state
        self.save_calls = 0
        self.wait_calls = 0

        def counted_wait():
            self.wait_calls += 1
            wait()

        self.accelerator = SimpleNamespace(wait_for_everyone=counted_wait)

    def _save_checkpoint(self, model, trial):
        self.save_calls += 1

    def _get_output_dir(self, trial):
        return str(self.directory)


class CheckpointRecoveryTests(unittest.TestCase):
    def test_two_ranks_discover_same_checkpoint_despite_rank_one_pre_save_miss(self):
        # Force the observed failure order: rank 1 observes no directory before
        # rank 0 creates it. A barrier conditional on its None state would hang.
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            rank_one_checked = threading.Event()
            barrier = threading.Barrier(2, timeout=3)

            class RacyPinnedSave(StubTrainer):
                def _save_checkpoint(self, model, trial):
                    super()._save_checkpoint(model, trial)
                    if self.rank == 1:
                        candidate = directory / "checkpoint-32"
                        self.state.best_model_checkpoint = str(candidate) if candidate.exists() else None
                        self.before_sync = self.state.best_model_checkpoint
                        rank_one_checked.set()
                    else:
                        if not rank_one_checked.wait(3):
                            raise RuntimeError("rank 1 did not reach discovery")
                        self.state.best_model_checkpoint = str(adapter_fixture(directory, 32))

            trainer_type = checkpoint_safe_trainer(RacyPinnedSave)
            trainers = []
            for rank in (0, 1):
                state = SimpleNamespace(global_step=32, best_global_step=32, best_metric=0.032,
                                        best_model_checkpoint=None)
                trainer = trainer_type(directory, state, barrier.wait)
                trainer.rank = rank
                trainers.append(trainer)
            with ThreadPoolExecutor(max_workers=2) as workers:
                futures = [workers.submit(trainer._save_checkpoint, None, None) for trainer in trainers]
                for future in futures:
                    future.result(timeout=5)
            self.assertIsNone(trainers[1].before_sync)
            self.assertEqual({trainer.state.best_model_checkpoint for trainer in trainers},
                             {str(directory / "checkpoint-32")})
            self.assertEqual([trainer.wait_calls for trainer in trainers], [1, 1])
            self.assertEqual([trainer.save_calls for trainer in trainers], [1, 1])

    def test_worse_latest_checkpoint_does_not_replace_validated_best(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            best = adapter_fixture(directory, 16)
            adapter_fixture(directory, 32)
            state = SimpleNamespace(global_step=32, best_global_step=16, best_metric=0.1,
                                    best_model_checkpoint=None)
            trainer = checkpoint_safe_trainer(StubTrainer)(directory, state)
            trainer._save_checkpoint(None, None)
            self.assertEqual(state.best_model_checkpoint, str(best))

    def test_missing_or_partial_best_checkpoint_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            state = SimpleNamespace(global_step=32, best_global_step=16, best_metric=0.1,
                                    best_model_checkpoint=None)
            trainer = checkpoint_safe_trainer(StubTrainer)(directory, state)
            for partial in (False, True):
                if partial:
                    (directory / "checkpoint-16").mkdir()
                    (directory / "checkpoint-16" / "adapter_config.json").write_text("{}")
                with self.assertRaisesRegex(RuntimeError, "SHARED_VALIDATED_ADAPTER_CHECKPOINT_MISSING"):
                    trainer._save_checkpoint(None, None)
            self.assertEqual(trainer.wait_calls, 2)

    def test_no_best_metric_still_participates_in_unconditional_barrier(self):
        state = SimpleNamespace(global_step=4, best_global_step=None, best_metric=None,
                                best_model_checkpoint=None)
        trainer = checkpoint_safe_trainer(StubTrainer)(Path("unused"), state)
        trainer._save_checkpoint(None, None)
        self.assertEqual(trainer.wait_calls, 1)
        self.assertIsNone(state.best_model_checkpoint)
        state.best_metric = 0.1
        with self.assertRaisesRegex(RuntimeError, "VALIDATED_BEST_CHECKPOINT_STEP_MISSING"):
            trainer._save_checkpoint(None, None)
        self.assertEqual(trainer.wait_calls, 2)

    def test_fit_proof_survives_development_failure_and_later_summary_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = {"selectedCheckpoint": "checkpoint-16", "bestValidationLoss": 0.1,
                      "datasetManifestSha256": "dataset-hash", "adapterSha256": {"weights": "weight-hash"}}
            try:
                summary = persist_fit_summary(directory, source)
                raise RuntimeError("unexpected generation failure")
            except RuntimeError:
                pass
            fit_bytes = (directory / "fit-summary.json").read_bytes()
            self.assertEqual(fit_bytes, (directory / "training-summary.json").read_bytes())
            self.assertEqual(json.loads(fit_bytes)["fitStatus"], "complete")
            self.assertEqual(json.loads(fit_bytes)["developmentStatus"], "pending")
            summary.update(developmentStatus="complete")
            write_json_atomic(directory / "training-summary.json", summary)
            self.assertEqual((directory / "fit-summary.json").read_bytes(), fit_bytes)
            self.assertEqual(json.loads((directory / "training-summary.json").read_bytes())["developmentStatus"], "complete")
            self.assertNotIn("fitStatus", source)

    def test_failed_atomic_receipt_replacement_preserves_previous_complete_json(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "training-summary.json"
            write_json_atomic(path, {"fitStatus": "complete"})
            before = path.read_bytes()
            with patch("kaggle_train.os.replace", side_effect=OSError("storage failure")):
                with self.assertRaises(OSError):
                    write_json_atomic(path, {"developmentStatus": "complete"})
            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(path.with_name(path.name + ".tmp").exists())
            with self.assertRaises(ValueError):
                write_json_atomic(path, {"validationLoss": float("nan")})
            self.assertEqual(path.read_bytes(), before)

    def test_skip_development_is_diagnostic_only_and_defaults_to_full_evaluation(self):
        self.assertFalse(development_policy({}))
        self.assertFalse(development_policy({"skipDevelopment": False}))
        self.assertTrue(development_policy({"skipDevelopment": True, "runPurpose": "pipeline-smoke"}))
        for config in ({"skipDevelopment": True}, {"skipDevelopment": True, "runPurpose": "production"},
                       {"skipDevelopment": "true", "runPurpose": "pipeline-smoke"}, {"skipDevelopment": 1}):
            with self.assertRaises(RuntimeError):
                development_policy(config)

    def test_skipped_smoke_receipt_cannot_claim_development_completion(self):
        with tempfile.TemporaryDirectory() as temporary:
            summary = persist_fit_summary(temporary, {"developmentSkipped": True, "diagnosticOnly": True,
                                                       "runPurpose": "pipeline-smoke"})
            self.assertEqual(summary["developmentStatus"], "skipped")
            self.assertTrue(summary["diagnosticOnly"])
            self.assertTrue(summary["developmentSkipped"])


if __name__ == "__main__":
    unittest.main()
