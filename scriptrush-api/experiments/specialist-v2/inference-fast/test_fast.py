"""Offline fast-profile admission and deadline tests; no GPU/model/API imports."""
import ast
import base64
import copy
import importlib.util
import json
from pathlib import Path
import signal
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zlib

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "inference"))
import test_completed_production_dev as completed_tests
import runner as lineage
import prepare_completed_production_dev as completed
sys.path.insert(0, str(HERE))
import fast_runner as fast
fixture, write_json = completed_tests.fixture, completed_tests.write_json
spec = importlib.util.spec_from_file_location("fast_prepare", HERE / "prepare.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class Clock:
    def __init__(self): self.now = 0.0
    def __call__(self): return self.now
    def sleep(self, seconds): self.now += seconds


def output(identity, text, tokens, finished=True, reason="stop"):
    completion = types.SimpleNamespace(text=text, token_ids=tokens, finish_reason=reason, stop_reason=None)
    return types.SimpleNamespace(request_id=identity, outputs=[completion], finished=finished)


class Engine:
    def __init__(self, clock, steps):
        self.clock, self.steps, self.active, self.calls, self.aborted = clock, list(steps), False, [], []
    def has_unfinished_requests(self): return self.active
    def add_request(self, identity, prompt, sample, lora_request=None):
        self.active = True; self.identity = identity
        self.calls.append((identity, prompt, sample, lora_request))
    def step(self):
        seconds, result = self.steps.pop(0)
        self.clock.now += seconds
        if isinstance(result, Exception): raise result
        if result and result[0].finished: self.active = False
        return result
    def abort_request(self, identity):
        self.aborted.append(identity); self.active = False


class FastProfileTests(unittest.TestCase):
    def completed_fixture(self, root):
        cases, summary = fixture(root)
        config_path = summary.parent / "adapter" / "adapter_config.json"
        config = json.loads(config_path.read_bytes())
        config.update(r=16, lora_alpha=32, bias="none", target_modules=sorted(fast.TARGET_MODULES),
                      use_dora=False, use_rslora=False, modules_to_save=None, rank_pattern={}, alpha_pattern={})
        write_json(config_path, config)
        result = json.loads(summary.read_bytes())
        result["adapterSha256"]["adapter_config.json"] = lineage.file_digest(config_path)
        write_json(summary, result)
        accepted = {"notebook": "sciptrush/scriptrush-v2-production-retry-12345678", "versionNumber": 1, "kernelId": 42,
                    "scriptSha256": lineage.file_digest(root / "production-retry-kaggle-run" / "train.py"),
                    "metadataSha256": lineage.file_digest(root / "production-retry-kaggle-run" / "kernel-metadata.json"),
                    "preparedBytesUnchangedAfterPush": True, "status": "accepted-only", "qualityProven": False}
        write_json(root / "production-retry-accepted.json", accepted)
        return cases, summary

    def test_raw_output_eos_duration_and_baseoff_specialiston_are_preserved(self):
        for variant, lora in (("base", None), ("specialist", object())):
            with self.subTest(variant=variant):
                clock = Clock(); raw = '  {"exact":"raw\\n"}\n'
                engine = Engine(clock, [(12.0, [output("case", raw, [14, 99])])])
                published = []
                result = fast.request_once(engine, "case", [1, 2, 3], "sampling", lora, 99, monotonic=clock, publish=published.append)
                self.assertEqual(result["output"], raw)
                self.assertEqual(result["outputSha256"], fast.digest(raw))
                self.assertEqual(result["outputTokenIds"], [14, 99])
                self.assertEqual(result["durationMs"], 12000.0)
                self.assertTrue(result["stoppedWithEos"])
                self.assertTrue(result["writerBudget120sMet"])
                self.assertIs(engine.calls[0][3], lora)
                self.assertEqual(engine.calls[0][1], {"prompt_token_ids": [1, 2, 3]})
                self.assertEqual(engine.aborted, [])
                self.assertTrue(published[0]["active"])
                self.assertFalse(published[-1]["active"])

    def test_deadline_abort_preserves_partial_and_late_eos_cannot_pass(self):
        for result in (output("case", "partial raw", [14], finished=False, reason=None), output("case", "late raw", [14, 99])):
            with self.subTest(finished=result.finished):
                clock = Clock(); engine = Engine(clock, [(241.0, [result])])
                measured = fast.request_once(engine, "case", [1, 2], None, None, 99, monotonic=clock)
                self.assertEqual(measured["output"], result.outputs[0].text)
                self.assertEqual(measured["error"], "RequestDeadlineExceeded")
                self.assertTrue(measured["deadlineExceeded"])
                self.assertFalse(measured["stoppedWithEos"])
                self.assertFalse(measured["writerBudget120sMet"])
                self.assertEqual(engine.aborted, ["case"])

    def test_length_error_or_silent_engine_stop_are_not_reported_as_eos(self):
        for steps in [[(2, [output("case", "truncated", [14], reason="length")])], [(2, ValueError("private detail not recorded"))]]:
            clock = Clock(); engine = Engine(clock, steps)
            result = fast.request_once(engine, "case", [1], None, None, 99, monotonic=clock)
            self.assertFalse(result["stoppedWithEos"])
            self.assertFalse(result["writerBudget120sMet"])
            self.assertNotIn("private detail", fast.compact(result))
        clock = Clock(); engine = Engine(clock, [])
        engine.step = lambda: setattr(engine, "active", False) or []
        result = fast.request_once(engine, "case", [1], None, None, 99, monotonic=clock)
        self.assertEqual(result["error"], "IncompleteEngineOutput")

    def test_engine_profile_is_exactly_unquantized_fp16_tp2_without_cache_or_offload(self):
        args = fast.engine_arguments({"model": lineage.MODEL, "revision": lineage.REVISION})
        self.assertIsNone(args["quantization"])
        self.assertEqual(args["dtype"], "float16")
        self.assertEqual(args["lora_dtype"], "float16")
        self.assertEqual(args["tensor_parallel_size"], 2)
        self.assertEqual(args["max_model_len"], 16384 + 4096)
        self.assertEqual(args["max_num_seqs"], 1)
        self.assertEqual(args["max_lora_rank"], 16)
        self.assertTrue(args["enable_lora"])
        self.assertTrue(args["enforce_eager"])
        self.assertEqual(args["cpu_offload_gb"], 0)
        self.assertFalse(args["enable_prefix_caching"])
        self.assertEqual(fast.RUNTIME_ENV["VLLM_USE_V1"], "0")
        self.assertEqual(fast.RUNTIME_ENV["VLLM_ATTENTION_BACKEND"], "XFORMERS")
        self.assertEqual(fast.PACKAGES["torch"], "2.7.0+cu128")
        self.assertFalse(fast.ENVIRONMENT.is_relative_to(Path("/kaggle/working")))

    def test_prompt_measurement_refuses_changed_counts_or_over_budget_without_truncation(self):
        tokenizer = types.SimpleNamespace(apply_chat_template=lambda messages, **kwargs: list(range(4)))
        row = {"messages": [], "preparedInputTokens": 4}
        self.assertEqual(fast.measured_tokens(tokenizer, row), [0, 1, 2, 3])
        with self.assertRaises(ValueError): fast.measured_tokens(tokenizer, dict(row, preparedInputTokens=3))
        tokenizer.apply_chat_template = lambda messages, **kwargs: [0] * 16385
        with self.assertRaises(ValueError): fast.measured_tokens(tokenizer, dict(row, preparedInputTokens=16385))

    def test_watchdog_covers_inflight_startup_total_and_final_shutdown(self):
        self.assertIsNone(fast.watchdog_reason(0, 269, {"active": True, "deadlineMonotonic": 240}))
        self.assertEqual(fast.watchdog_reason(0, 271, {"active": True, "deadlineMonotonic": 240}), "INFLIGHT_REQUEST_WATCHDOG_EXCEEDED")
        self.assertEqual(fast.watchdog_reason(0, 1801, None), "ENGINE_STARTUP_WATCHDOG_EXCEEDED")
        self.assertEqual(fast.watchdog_reason(0, fast.TOTAL_ENGINE_SECONDS + 1, None), "ENGINE_TOTAL_WALL_TIME_EXCEEDED")
        self.assertEqual(fast.watchdog_reason(0, 162, {"active": False, "completedMonotonic": 100}), "ENGINE_IDLE_OR_SHUTDOWN_WATCHDOG_EXCEEDED")

    def test_environment_uses_owned_uv_and_directs_all_torch_packages_to_new_python(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); commands = []
            def install(command, timeout, log_name):
                commands.append(command)
                if "--target" in command:
                    binary = root / "environment" / "bootstrap" / "bin" / "uv"
                    binary.parent.mkdir(parents=True); binary.write_bytes(b"inert owned uv")
            fake_version = types.SimpleNamespace(returncode=0, stdout=b"uv 0.7.20 (inert fixture)\n")
            with patch.object(fast, "ENVIRONMENT", root / "environment"), patch.object(fast, "bounded_install", side_effect=install), patch.object(fast.subprocess, "run", return_value=fake_version) as run:
                python = fast.isolated_python()
                self.assertEqual(python, root / "environment" / "python312" / "bin" / "python")
                self.assertEqual(run.call_args.args[0][0], str(root / "environment" / "bootstrap" / "bin" / "uv"))
                self.assertIn("--target", commands[0])
                self.assertEqual(commands[0][-1], "uv==0.7.20")
                torch_install = next(command for command in commands if "torch==2.7.0+cu128" in command)
                self.assertEqual(torch_install[torch_install.index("--python") + 1], str(python))
                self.assertNotEqual(torch_install[0], sys.executable)
                self.assertIn("https://download.pytorch.org/whl/cu128", torch_install)
                self.assertEqual(torch_install[torch_install.index("--index-strategy") + 1], "unsafe-best-match")
                self.assertEqual(torch_install[torch_install.index("--only-binary") + 1], ":all:")
                self.assertTrue(any(command[1:3] == ["pip", "freeze"] for command in commands))
                with self.assertRaises(FileExistsError): fast.isolated_python()

    def test_fault_diagnostics_do_not_copy_exception_text_or_urls(self):
        for error, code in [(RuntimeError("CUDA out of memory SECRET https://secret.invalid/path"), "CUDA_OUT_OF_MEMORY"),
                            (RuntimeError("NCCL failure SECRET"), "DISTRIBUTED_COLLECTIVE_FAILURE"),
                            (RuntimeError("TRITON compile SECRET"), "TRITON_OR_PTX_COMPILATION_FAILURE")]:
            result = fast.fault_diagnostic(error)
            self.assertEqual(result["errorCode"], code)
            self.assertNotIn("SECRET", fast.compact(result))
            self.assertNotIn("https://", fast.compact(result))

    def test_infrastructure_fault_stops_remaining_requests_but_measured_timeout_can_continue(self):
        self.assertTrue(fast.stop_after_request({"error": "RuntimeError", "diagnostic": {"errorCode": "CUDA_OUT_OF_MEMORY"}}))
        self.assertTrue(fast.stop_after_request({"error": "IncompleteEngineOutput"}))
        self.assertFalse(fast.stop_after_request({"error": "RequestDeadlineExceeded", "deadlineExceeded": True}))
        self.assertFalse(fast.stop_after_request({"finishReason": "length", "stoppedWithEos": False}))

    def test_live_progress_forwards_only_new_known_typed_fields_without_output_or_logs(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "progress.json"; emitted = []
            self.assertEqual(fast.forward_engine_progress(path, -1, emitted.append), -1)
            value = {"phase": "inference", "monotonic": 100.0, "profile": fast.PROFILE,
                     "id": "production-teach-dev-001", "variant": "specialist", "outputTokens": 53,
                     "stoppedWithEos": True, "durationMs": 300.1, "errorType": None,
                     "output": "PRIVATE_GENERATED_TEXT", "engineLog": "PRIVATE_ENGINE_LOG", "arbitrary": "not forwarded"}
            write_json(path, value)
            stamp = fast.forward_engine_progress(path, -1, emitted.append)
            self.assertEqual(stamp, 100.0)
            self.assertEqual(json.loads(emitted[0]), {key: item for key, item in value.items() if key not in {"output", "engineLog", "arbitrary"}})
            self.assertNotIn("PRIVATE", emitted[0])
            self.assertEqual(fast.forward_engine_progress(path, stamp, emitted.append), stamp)
            self.assertEqual(len(emitted), 1)
            for change in [{"phase": "untrusted-phase"}, {"phase": {}}, {"monotonic": 99}, {"monotonic": float("nan")},
                           {"id": "PRIVATE_USER_REQUEST"}, {"id": {}}, {"variant": "api"}, {"outputTokens": True},
                           {"durationMs": -1}, {"stoppedWithEos": "true"}, {"errorType": "PRIVATE ERROR BODY"}]:
                write_json(path, {**value, "monotonic": 101.0, **change})
                self.assertEqual(fast.forward_engine_progress(path, stamp, emitted.append), stamp)
            self.assertEqual(len(emitted), 1)
            path.write_bytes(b"{partial atomic fixture")
            self.assertEqual(fast.forward_engine_progress(path, stamp, emitted.append), stamp)
            write_json(path, {"phase": "complete", "profile": fast.PROFILE, "monotonic": 102.0, "outputs": 8})
            self.assertEqual(fast.forward_engine_progress(path, stamp, emitted.append), 102.0)
            self.assertEqual(len(emitted), 2)

    def test_cleanup_kills_remaining_worker_group_even_after_leader_exits(self):
        clock = Clock(); signals = []; alive = [True]
        process = types.SimpleNamespace(pid=4242, poll=lambda: 0, wait=lambda timeout: 0)
        def signal_group(pid, value):
            self.assertEqual(pid, 4242)
            if not alive[0]: raise ProcessLookupError()
            signals.append(value)
            if value == 9: alive[0] = False
        with patch.object(fast, "signal", types.SimpleNamespace(SIGTERM=15, SIGKILL=9)):
            fast.terminate_process_group(process, signal_group=signal_group, monotonic=clock, sleep=clock.sleep)
        self.assertIn(15, signals)
        self.assertIn(9, signals)
        self.assertFalse(alive[0])
        self.assertLessEqual(clock.now, 10)
        with patch.object(fast, "signal", types.SimpleNamespace(SIGTERM=15, SIGKILL=9)):
            fast.terminate_process_group(process, signal_group=signal_group, monotonic=clock, sleep=clock.sleep)

    def test_private_packaging_reuses_completed_gate_and_uploads_no_labels_or_final_cases(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary = self.completed_fixture(root)
            scope = completed_tests.CompletedProductionDevelopmentTests().scope(root, cases)
            with scope, patch.object(prepare, "WORK", root), patch("builtins.print"):
                receipt = prepare.prepare(summary)
            script = root / "fast-dev-inference-run" / "run.py"
            tree = ast.parse(script.read_text(encoding="utf-8"))
            literals = {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body[:5]}
            bundle = json.loads(zlib.decompress(base64.b64decode(literals["SCRIPTRUSH_INFERENCE_BUNDLE"])))
            self.assertEqual(tuple(row["id"] for row in bundle["cases"]), lineage.PRODUCTION_DEV_IDS)
            self.assertEqual(bundle["cases"], cases)
            self.assertNotIn("TRAINING_LABEL_ONLY", lineage.compact(bundle))
            self.assertFalse(set(bundle) & {"train", "validation", "expected", "test"})
            self.assertEqual(receipt["sourceNotebookVersion"], 1)
            self.assertEqual(receipt["sourceAcceptanceReceiptSha256"], lineage.file_digest(root / "production-retry-accepted.json"))
            self.assertFalse(receipt["productionPromotionEligible"])
            self.assertFalse(receipt["finalInputsUploaded"])
            self.assertEqual(receipt["scriptSha256"], lineage.file_digest(script))
            metadata = script.parent / "kernel-metadata.json"
            self.assertEqual(receipt["metadataSha256"], lineage.file_digest(metadata))
            self.assertEqual(json.loads(metadata.read_bytes())["kernel_sources"], [receipt["sourceNotebook"]])
            self.assertTrue(json.loads(metadata.read_bytes())["is_private"])
            self.assertNotIn(b"\r\n", script.read_bytes())
            with patch.multiple(fast, **literals, create=True):
                validator, actual = fast.loaded_bundle()
                self.assertEqual(actual, bundle)
                self.assertEqual(validator.resolve_adapter(summary.parent, actual), summary.parent / "adapter")
                for mutate in [lambda value: value["cases"][0].update(id="v2-test-001"), lambda value: value["cases"][0].update(expected="label")]:
                    changed = copy.deepcopy(bundle); mutate(changed)
                    encoded = base64.b64encode(zlib.compress(lineage.compact(changed).encode())).decode()
                    with patch.object(fast, "SCRIPTRUSH_INFERENCE_BUNDLE", encoded), self.assertRaises(ValueError): fast.loaded_bundle()

    def test_existing_preparation_wrong_acceptance_or_unsupported_adapter_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); cases, summary = self.completed_fixture(root)
            accepted_path = root / "production-retry-accepted.json"
            accepted = json.loads(accepted_path.read_bytes()); accepted["versionNumber"] = 2
            write_json(accepted_path, accepted)
            with completed_tests.CompletedProductionDevelopmentTests().scope(root, cases), patch.object(prepare, "WORK", root), self.assertRaisesRegex(ValueError, "ACTUAL_ACCEPTED_SOURCE"):
                prepare.prepare(summary)
            self.assertFalse((root / "fast-dev-inference-run").exists())
            config = summary.parent / "adapter" / "adapter_config.json"
            value = json.loads(config.read_bytes()); value["use_dora"] = True
            write_json(config, value)
            with self.assertRaisesRegex(ValueError, "UNMERGED_LORA16"): fast.adapter_config(config.parent)
            target = root / "fast-dev-inference-run"; target.mkdir()
            (target / "run.py").write_bytes(b"preserve")
            with patch.object(prepare, "WORK", root), patch.object(completed, "build_bundle") as build, self.assertRaises(FileExistsError):
                prepare.prepare(summary)
            build.assert_not_called(); self.assertEqual((target / "run.py").read_bytes(), b"preserve")

    def test_no_training_server_unbounded_generate_or_system_torch_install_is_present(self):
        source = (HERE / "fast_runner.py").read_text(encoding="utf-8")
        calls = [node for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Call)]
        forbidden = {"generate", "train", "backward", "authenticate", "kernels_push", "getpass", "Trainer", "TrainingArguments"}
        names = {node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else "" for node in calls}
        self.assertFalse(names & forbidden)
        self.assertIn('"--target"', source)
        self.assertIn('"--python", str(python)', source)
        self.assertNotIn('"test.jsonl"', (HERE / "prepare.py").read_text(encoding="utf-8"))
        self.assertNotIn('"prompts.jsonl"', (HERE / "prepare.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
