"""CPU-only contract/security tests: no model load, network or credentials."""
import ast
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backend
import server


SYSTEM = "Return a ScriptRush window/pages composition as strict JSON."
SYSTEM_HASH = hashlib.sha256(SYSTEM.encode()).hexdigest()
KEY = "srsk_" + "a" * 43  # Deliberately fake, used only by this mock application.
AUTH = {"Authorization": "Bearer " + KEY}
OUTPUT = '{"window":{"title":""},"pages":[{"name":"Player","controls":[]}]}'


def request(**overrides):
    value = {"model": backend.SERVED_MODEL, "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "Use the supplied game evidence."}]}
    value.update(overrides)
    return json.dumps(value).encode()


class MockBackend:
    ready = True

    def __init__(self, output=OUTPUT, eos=True):
        self.calls = []
        self.output = output
        self.eos = eos

    def generate(self, messages, max_tokens):
        self.calls.append((messages, max_tokens))
        return {"output": self.output, "stoppedWithEos": self.eos, "inputTokens": 31, "outputTokens": 23}


class PayloadTests(unittest.TestCase):
    def assertCode(self, body, code):
        with self.assertRaises(backend.ServiceError) as caught:
            server.parse_payload(body, {SYSTEM_HASH})
        self.assertEqual(caught.exception.code, code)

    def test_valid_payload_is_exact_two_messages_and_bounded_budget(self):
        messages, budget = server.parse_payload(request(max_tokens=2048, stream=False, temperature=0, top_p=1, n=1, response_format={"type": "json_object"}), {SYSTEM_HASH})
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        self.assertEqual(budget, 2048)
        self.assertEqual(server.parse_payload(request(), {SYSTEM_HASH})[1], 4096)

    def test_no_general_chat_tool_calls_assistant_or_unqualified_system(self):
        messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "x"}]
        self.assertCode(request(messages=messages + [{"role": "assistant", "content": "answer"}]), "EXACTLY_TWO_COMPOSER_MESSAGES_REQUIRED")
        self.assertCode(request(messages=list(reversed(messages))), "SYSTEM_USER_ROLES_REQUIRED")
        messages[1]["name"] = "extra"
        self.assertCode(request(messages=messages), "EXACTLY_TWO_COMPOSER_MESSAGES_REQUIRED")
        self.assertCode(request(tools=[]), "UNSUPPORTED_REQUEST_FIELDS")
        self.assertCode(request(messages=[{"role": "system", "content": "Other system"}, {"role": "user", "content": "x"}]), "UNQUALIFIED_COMPOSER_SYSTEM")

    def test_greedy_json_nonstream_single_choice(self):
        for overrides, code in [({"stream": True}, "STREAMING_UNSUPPORTED"), ({"stream": 0}, "STREAMING_UNSUPPORTED"), ({"temperature": 0.1}, "GREEDY_SINGLE_COMPLETION_REQUIRED"), ({"temperature": False}, "GREEDY_SINGLE_COMPLETION_REQUIRED"), ({"n": 2}, "GREEDY_SINGLE_COMPLETION_REQUIRED"), ({"n": 1.0}, "GREEDY_SINGLE_COMPLETION_REQUIRED"), ({"top_p": True}, "GREEDY_SINGLE_COMPLETION_REQUIRED"), ({"response_format": {"type": "text"}}, "JSON_OBJECT_MODE_REQUIRED"), ({"model": "unqualified-model"}, "UNSUPPORTED_MODEL")]:
            with self.subTest(overrides=overrides):
                self.assertCode(request(**overrides), code)

    def test_input_and_output_limits_are_rejected_without_truncation(self):
        for budget in [0, -1, 4097, True, 1.0, "4096"]:
            self.assertCode(request(max_tokens=budget), "INVALID_OUTPUT_TOKEN_BUDGET")
        self.assertCode(b"x" * (server.MAX_BODY_BYTES + 1), "REQUEST_BODY_TOO_LARGE")
        self.assertCode(b"\xff", "INVALID_JSON")
        self.assertCode(b"{", "INVALID_JSON")
        self.assertCode(request(messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": "x" * 96001}]), "INVALID_MESSAGE_CONTENT")
        self.assertCode(request(messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\ud800"}]), "INVALID_MESSAGE_CONTENT")


class RouterTests(unittest.TestCase):
    def app(self, model=None):
        return server.Application(model or MockBackend(), KEY, [SYSTEM_HASH])

    def test_health_is_nonsecret_and_unknown_routes_are_closed(self):
        app = self.app()
        status, value = app.handle("GET", "/health", {})
        self.assertEqual((status, value), (200, {"status": "ready", "model": backend.SERVED_MODEL, "busy": False}))
        self.assertNotIn(KEY, json.dumps(value))
        self.assertEqual(app.handle("GET", "/health?key=" + KEY, {})[0], 404)
        self.assertEqual(app.handle("GET", "/v1/chat/completions", AUTH)[0], 404)
        app.backend.ready = False
        self.assertEqual(app.handle("GET", "/health", {})[0], 503)
        self.assertEqual(app.handle("POST", "/v1/chat/completions", AUTH, request())[1]["error"]["code"], "MODEL_UNAVAILABLE")

    def test_key_is_dedicated_env_only_removed_after_read(self):
        with patch.dict(os.environ, {server.KEY_ENV: KEY}):
            self.assertEqual(server.read_server_key(), KEY)
            self.assertNotIn(server.KEY_ENV, os.environ)
        for key in [None, "", "sk-fake-other-provider", "KGAT_fake", "srsk_short"]:
            self.assertFalse(server.valid_key(key))
        app = self.app()
        self.assertTrue(app.authorized(AUTH))
        for headers in [{}, {"Authorization": "Bearer srsk_" + "b" * 43}, {"Authorization": KEY}, {"Authorization": "Bearer " + KEY + "\n"}]:
            self.assertFalse(app.authorized(headers))
            status, value = app.handle("POST", "/v1/chat/completions", headers, request())
            self.assertEqual(status, 401)
            self.assertEqual(value, server.error_payload("UNAUTHORIZED"))
        self.assertFalse(hasattr(app, "key"))

    def test_openai_envelope_preserves_exact_raw_json_and_actual_usage(self):
        model = MockBackend()
        status, value = self.app(model).handle("POST", "/v1/chat/completions", AUTH, request(max_tokens=1700))
        self.assertEqual(status, 200)
        self.assertEqual(value["choices"][0], {"index": 0, "message": {"role": "assistant", "content": OUTPUT}, "finish_reason": "stop"})
        self.assertEqual(value["usage"], {"prompt_tokens": 31, "completion_tokens": 23, "total_tokens": 54})
        self.assertEqual(value["model"], backend.SERVED_MODEL)
        self.assertEqual(model.calls[0][1], 1700)
        status, value = self.app(MockBackend(eos=False)).handle("POST", "/v1/chat/completions", AUTH, request())
        self.assertEqual(value["choices"][0]["finish_reason"], "length")

    def test_no_fences_repair_labels_or_generic_json_accepted(self):
        for output in ["```json\n" + OUTPUT + "\n```", "{}", '{"window":{},"pages":[]}', '{"window":{},"pages":[{}],"expected":"hidden"}', "answer", "[]"]:
            status, value = self.app(MockBackend(output)).handle("POST", "/v1/chat/completions", AUTH, request())
            self.assertEqual(status, 502)
            self.assertEqual(value, server.error_payload("INVALID_COMPOSITION"))

    def test_single_gpu_generation_busy_then_lock_released(self):
        entered, release = threading.Event(), threading.Event()
        class BlockingBackend(MockBackend):
            def generate(self, messages, max_tokens):
                entered.set()
                if not release.wait(2):
                    raise RuntimeError("mock wait expired")
                return super().generate(messages, max_tokens)
        app = self.app(BlockingBackend())
        with ThreadPoolExecutor(max_workers=1) as executor:
            first = executor.submit(app.handle, "POST", "/v1/chat/completions", AUTH, request())
            try:
                self.assertTrue(entered.wait(1))
                self.assertTrue(app.handle("GET", "/health", {})[1]["busy"])
                status, value = app.handle("POST", "/v1/chat/completions", AUTH, request())
                self.assertEqual((status, value), (503, server.error_payload("MODEL_BUSY")))
                self.assertEqual(len(app.backend.calls), 0)
            finally:
                release.set()
            self.assertEqual(first.result(timeout=2)[0], 200)
        self.assertFalse(app._gpu_lock.locked())
        self.assertEqual(len(app.backend.calls), 1)

    def test_failure_contains_fixed_names_only_and_releases_lock(self):
        class FailureBackend(MockBackend):
            def generate(self, messages, max_tokens):
                raise RuntimeError(KEY + " sensitive input " + messages[1]["content"])
        app = self.app(FailureBackend())
        status, value = app.handle("POST", "/v1/chat/completions", AUTH, request())
        self.assertEqual((status, value), (500, server.error_payload("MODEL_FAILURE")))
        self.assertFalse(app._gpu_lock.locked())
        class LongPromptBackend(MockBackend):
            def generate(self, messages, max_tokens):
                raise backend.ServiceError("PROMPT_TOO_LONG", 400)
        self.assertEqual(self.app(LongPromptBackend()).handle("POST", "/v1/chat/completions", AUTH, request()), (400, server.error_payload("PROMPT_TOO_LONG")))

    def test_request_logs_and_error_tracebacks_are_disabled(self):
        handler = server.handler(self.app())
        with patch("sys.stderr.write") as stderr:
            handler.log_message(None, "%s", KEY)
            handler.log_request(None, KEY)
            server.PrivateHttpServer.handle_error(None, None, None)
            stderr.assert_not_called()


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.adapter = self.root / "adapter"
        self.adapter.mkdir()
        (self.adapter / "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": backend.MODEL, "peft_type": "LORA"}))
        (self.adapter / "adapter_model.safetensors").write_bytes(b"mock weights, not a model")
        self.hashes = {name: backend.file_hash(self.adapter / name) for name in ["adapter_config.json", "adapter_model.safetensors"]}
        self.summary = self.root / "training-summary.json"
        self.summary_value = {"model": backend.MODEL, "revision": backend.REVISION, "datasetManifestSha256": "a" * 64, "adapterSha256": self.hashes}
        self.summary.write_text(json.dumps(self.summary_value))
        self.manifest = self.root / "deployment.json"
        self.manifest_value = {"formatVersion": 1, "model": backend.MODEL, "revision": backend.REVISION, "servedModel": backend.SERVED_MODEL, "trainingManifestSha256": "a" * 64, "trainingSummarySha256": backend.file_hash(self.summary), "adapterSha256": self.hashes, "allowedSystemSha256": [SYSTEM_HASH]}
        self.write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self):
        self.manifest.write_text(json.dumps(self.manifest_value))

    def verify(self):
        return backend.verify_artifacts(self.manifest, self.adapter, self.summary)

    def assertCode(self, code):
        with self.assertRaises(backend.ServiceError) as caught:
            self.verify()
        self.assertEqual(caught.exception.code, code)

    def test_explicit_hash_pins_validated_without_loading_any_model(self):
        value, path = self.verify()
        self.assertEqual(path, self.adapter.resolve())
        self.assertEqual(value, self.manifest_value)
        tree = ast.parse(Path(backend.__file__).read_text())
        top_imports = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom))]
        self.assertFalse(any("torch" in ast.unparse(node) or "transformers" in ast.unparse(node) or "peft" in ast.unparse(node) for node in top_imports))

    def test_adapter_weights_tamper_rejected(self):
        (self.adapter / "adapter_model.safetensors").write_bytes(b"changed weights")
        self.assertCode("ADAPTER_HASH_MISMATCH")

    def test_summary_raw_bytes_tamper_rejected(self):
        self.summary.write_text(json.dumps(self.summary_value) + "\n")
        self.assertCode("TRAINING_SUMMARY_HASH_MISMATCH")

    def test_summary_lineage_cannot_be_overridden_by_adapter_alone(self):
        self.summary_value["datasetManifestSha256"] = "b" * 64
        self.summary.write_text(json.dumps(self.summary_value))
        self.manifest_value["trainingSummarySha256"] = backend.file_hash(self.summary)
        self.write_manifest()
        self.assertCode("TRAINING_LINEAGE_MISMATCH")

    def test_revision_pins_and_safe_adapter_filenames(self):
        self.manifest_value["revision"] = "main"
        self.write_manifest()
        self.assertCode("UNEXPECTED_PINNED_MODEL")
        self.manifest_value["revision"] = backend.REVISION
        self.manifest_value["adapterSha256"]["../weights"] = "b" * 64
        self.write_manifest()
        self.assertCode("INVALID_ADAPTER_MANIFEST")

    def test_allowed_system_hashes_are_explicit_unique_and_bounded(self):
        for systems in [[], ["invalid"], [SYSTEM_HASH] * 2, [str(i) * 64 for i in range(9)]]:
            self.manifest_value["allowedSystemSha256"] = systems
            self.write_manifest()
            self.assertCode("INVALID_ALLOWED_COMPOSER_SYSTEMS")

    def test_dependency_drift_rejected_before_importing_torch(self):
        with patch.object(backend.importlib.metadata, "version", return_value="unexpected"):
            with self.assertRaises(backend.ServiceError) as caught:
                backend.GpuBackend(self.manifest, self.adapter, self.summary)
        self.assertEqual(caught.exception.code, "DEPENDENCY_VERSION_MISMATCH")


class GenerationBudgetTests(unittest.TestCase):
    def make_backend(self, prompt_length, eos=True):
        value = backend.GpuBackend.__new__(backend.GpuBackend)
        tokens = list(range(prompt_length))
        value.tokenizer = Mock(eos_token_id=2, pad_token_id=2)
        value.tokenizer.apply_chat_template.return_value = tokens
        value.tokenizer.decode.return_value = OUTPUT
        tensor = Mock(shape=(1, prompt_length))
        value.torch = Mock(long="mock-long")
        value.torch.tensor.return_value = tensor
        value.torch.inference_mode.side_effect = nullcontext
        value.torch.autocast.side_effect = lambda **kwargs: nullcontext()
        class Generated:
            def __getitem__(self, index):
                assert index == (0, slice(prompt_length, None, None))
                return [Mock(item=Mock(return_value=2 if eos else 8))]
        value.model = Mock(device="mock-device")
        value.model.generate.return_value = Generated()
        return value

    def test_token_limit_counted_before_gpu_and_never_truncated(self):
        value = self.make_backend(16385)
        with self.assertRaises(backend.ServiceError) as caught:
            value.generate([{"role": "system", "content": SYSTEM}, {"role": "user", "content": "x"}], 4096)
        self.assertEqual(caught.exception.code, "PROMPT_TOO_LONG")
        value.torch.tensor.assert_not_called()
        value.model.generate.assert_not_called()
        value.tokenizer.apply_chat_template.assert_called_once_with([{"role": "system", "content": SYSTEM}, {"role": "user", "content": "x"}], tokenize=True, add_generation_prompt=True)

    def test_gpu_generation_settings_and_eos_are_preserved(self):
        for eos in [True, False]:
            value = self.make_backend(16384, eos=eos)
            result = value.generate([{"role": "system", "content": SYSTEM}, {"role": "user", "content": "x"}], 4096)
            settings = value.model.generate.call_args.kwargs
            self.assertEqual(settings["max_new_tokens"], 4096)
            self.assertEqual(settings["max_time"], 240)
            self.assertFalse(settings["do_sample"])
            self.assertEqual(settings["logits_to_keep"], 1)
            self.assertEqual(settings["eos_token_id"], 2)
            value.torch.autocast.assert_called_once_with(device_type="cuda", dtype=value.torch.float16)
            self.assertEqual((result["inputTokens"], result["outputTokens"], result["stoppedWithEos"], result["output"]), (16384, 1, eos, OUTPUT))
            value.torch.cuda.empty_cache.assert_called_once()

    def test_generation_failure_releases_temporary_cache(self):
        value = self.make_backend(100)
        value.model.generate.side_effect = RuntimeError("mock CUDA failure")
        with self.assertRaises(RuntimeError):
            value.generate([], 100)
        value.torch.cuda.empty_cache.assert_called_once()


if __name__ == "__main__":
    unittest.main()
