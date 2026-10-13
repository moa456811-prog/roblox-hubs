"""Bounded, no-retry APInex benchmark. Self-tests never access the network."""
import argparse
import codecs
from dataclasses import dataclass, field
import getpass
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
import tempfile
import unittest
from unittest import mock
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "test-results" / "specialist-v2"
ENDPOINT = "https://api.apinex.bond/v1/chat/completions"
MODEL = "free/gpt-6-luna"
MANIFEST_SHA256 = "73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053"
MAX_TOKENS = 4096
TIMEOUT_SECONDS = 240
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
CASE_COUNTS = {"dev": 4, "test": 12, "production": 8}
PRODUCTION = HERE / "production" / "artifacts"
SOURCE_ROOT = HERE.parents[1] / "src" / "lib"
PRODUCTION_SOURCE_FILES = (
    "generation.ts", "generation-contract.ts", "hub-spec.ts", "hub-composer.ts",
    "provider-client.ts", "provider-config.ts", "ui-language.ts", "a7dev-generation-guide.ts",
    "game-actions.ts", "game-adapters/catalog.ts", "game-adapters/blox-fruits-runtime.ts",
    "game-adapters/blox-fruits-quest-data.ts",
)


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


class ProviderResponseError(Exception):
    def __init__(self, status=None):
        super().__init__("PROVIDER_RESPONSE_ERROR")
        self.status = status if isinstance(status, int) and not isinstance(status, bool) and 300 <= status <= 599 else None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise urllib.error.HTTPError(request.full_url, code, "REDIRECT_BLOCKED", headers, None)


def safe_status(value):
    if isinstance(value, str) and len(value) == 3 and value.isascii() and value.isdigit():
        value = int(value)
    return value if isinstance(value, int) and not isinstance(value, bool) and 300 <= value <= 599 else None


def safe_failure(error):
    status = safe_status(error.code if isinstance(error, urllib.error.HTTPError) else getattr(error, "status", None))
    # Never stringify exceptions: URLs, headers, credentials and provider text may be attached.
    result = {"error": type(error).__name__}
    if status is not None:
        result["status"] = status
    return result


def token_usage(value):
    if not isinstance(value, dict):
        return {}
    result = {}
    for source, target in (("prompt_tokens", "inputTokens"), ("completion_tokens", "outputTokens")):
        count = value.get(source)
        if isinstance(count, (int, float)) and not isinstance(count, bool) and math.isfinite(count) and count >= 0 and count == int(count):
            result[target] = int(count)
    return result


@dataclass
class Completion:
    output: str = ""
    finish_reason: str | None = None
    model: str | None = None
    usage: dict = field(default_factory=dict)

    def consume(self, payload, streaming):
        if not isinstance(payload, dict):
            raise ProviderResponseError()
        if "error" in payload:
            error = payload["error"]
            status = safe_status(error.get("code", error.get("status"))) if isinstance(error, dict) else None
            raise ProviderResponseError(status)
        reported = payload.get("model")
        if isinstance(reported, str) and 0 < len(reported) <= 200:
            if self.model is not None and self.model != reported:
                raise ProviderResponseError()
            self.model = reported
        self.usage.update(token_usage(payload.get("usage")))
        choices = payload.get("choices", [])
        if not isinstance(choices, list):
            raise ProviderResponseError()
        if not choices:
            return
        choice = next((entry for entry in choices if isinstance(entry, dict) and entry.get("index", 0) == 0), None)
        if choice is None:
            return
        source = choice.get("delta" if streaming else "message", {})
        if not isinstance(source, dict):
            raise ProviderResponseError()
        content = source.get("content")
        if content is not None and not isinstance(content, str):
            raise ProviderResponseError()
        if isinstance(content, str):
            if streaming:
                self.output += content
            else:
                self.output = content
        finish = choice.get("finish_reason")
        if finish is not None:
            if finish not in ("stop", "eos", "length"):
                raise ProviderResponseError()
            if self.finish_reason is not None and self.finish_reason != finish:
                raise ProviderResponseError()
            self.finish_reason = finish

    def fields(self):
        fields = {"output": self.output, "finishReason": self.finish_reason, **self.usage}
        if self.model is not None:
            fields["reportedModel"] = self.model
        # [DONE] alone is transport termination, not evidence of a complete model answer.
        if self.finish_reason is not None:
            fields["stoppedWithEos"] = self.finish_reason in ("stop", "eos")
        return fields


def parse_sse(lines):
    completion = Completion()
    data = []

    def consume_event():
        if data:
            event = "\n".join(data)
            data.clear()
            if event != "[DONE]":
                completion.consume(json.loads(event), streaming=True)

    for line in lines:
        if line == "":
            consume_event()
        elif line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
        # SSE comments, event IDs and event names are transport metadata.
    consume_event()
    return completion


def parse_response(content_type, lines):
    if "text/event-stream" in content_type.lower():
        return parse_sse(lines)
    completion = Completion()
    completion.consume(json.loads("\n".join(lines)), streaming=False)
    return completion


def response_lines(response, deadline, raw_parts):
    """Decode arbitrarily split UTF-8 while preserving the successful raw wire body."""
    decoder = codecs.getincrementaldecoder("utf-8")("strict")
    pending = ""
    total = 0
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("BENCHMARK_TIMEOUT")
        # urllib's HTTPResponse exposes the TLS socket here. Set each read to the
        # remaining total budget rather than restarting a fresh 240-second wait.
        sock = getattr(getattr(getattr(response, "fp", None), "raw", None), "_sock", None)
        if sock is not None:
            sock.settimeout(remaining)
        chunk = response.read1(65536)
        if not chunk:
            pending += decoder.decode(b"", final=True)
            break
        total += len(chunk)
        if total > MAX_RESPONSE_BYTES:
            raise ProviderResponseError()
        raw_parts.append(chunk)
        pending += decoder.decode(chunk)
        while "\n" in pending:
            line, pending = pending.split("\n", 1)
            yield line.removesuffix("\r")
    if pending:
        yield pending.removesuffix("\r")


def inference_messages(row, *, production=False):
    messages = row.get("messages")
    if not isinstance(messages, list) or any(not isinstance(message, dict) for message in messages):
        raise ValueError("INVALID_CASE_MESSAGES")
    roles = [message.get("role") for message in messages]
    if production and (roles != ["system", "user"] or any(set(message) != {"role", "content"} for message in messages) or "expected" in row):
        raise ValueError("PRODUCTION_MESSAGES_MUST_EXCLUDE_LABELS")
    if roles not in (["system", "user"], ["system", "user", "assistant"]):
        raise ValueError("INVALID_CASE_MESSAGES")
    clean = [{"role": message["role"], "content": message["content"]} for message in messages if message["role"] != "assistant"]
    if any(not isinstance(message["content"], str) or not message["content"] for message in clean):
        raise ValueError("INVALID_CASE_CONTENT")
    # Input files may carry local expected/assistant labels. Only these two
    # message fields enter the HTTP payload; no full row is serialized to it.
    if [message["role"] for message in clean] != ["system", "user"]:
        raise ValueError("INVALID_INFERENCE_ROLES")
    if not production:
        # Preserve the existing frozen specialist-v2 JSON-input guard.
        parsed_user = json.loads(clean[1]["content"])
        if not isinstance(parsed_user, dict) or "expected" in parsed_user:
            raise ValueError("UNEXPECTED_EVALUATION_LABELS")
    return clean


def load_production_cases(directory=None, source_root=None):
    directory = PRODUCTION if directory is None else Path(directory)
    source_root = SOURCE_ROOT if source_root is None else Path(source_root)
    manifest_raw = (directory / "manifest.json").read_bytes()
    manifest = json.loads(manifest_raw)
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1 or manifest.get("benchmark") != "production-composer-v1" or manifest.get("cases") != CASE_COUNTS["production"]:
        raise ValueError("INVALID_PRODUCTION_MANIFEST")
    ids = manifest.get("caseIds")
    if not isinstance(ids, list) or len(ids) != CASE_COUNTS["production"] or any(not isinstance(value, str) or not re.fullmatch(r"production-[a-z0-9-]+", value) for value in ids) or len(set(ids)) != len(ids):
        raise ValueError("INVALID_PRODUCTION_IDS")
    source_hashes = manifest.get("sourceSha256")
    if not isinstance(source_hashes, dict) or set(source_hashes) != set(PRODUCTION_SOURCE_FILES):
        raise ValueError("INVALID_PRODUCTION_SOURCE_SNAPSHOT")
    for name in PRODUCTION_SOURCE_FILES:
        wanted = source_hashes[name]
        if not isinstance(wanted, str) or not re.fullmatch(r"[a-f0-9]{64}", wanted) or digest((source_root / name).read_bytes()) != wanted:
            raise ValueError("PRODUCTION_SOURCE_CHANGED")
    raw = (directory / "prompts.jsonl").read_bytes()
    # Only hash the labelled case file. Never parse its answers for inference.
    if digest(raw) != manifest.get("promptsSha256") or digest((directory / "cases.jsonl").read_bytes()) != manifest.get("caseSha256"):
        raise ValueError("PRODUCTION_ARTIFACT_HASH_CHANGED")
    selected = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    if len(selected) != CASE_COUNTS["production"] or any(not isinstance(row, dict) for row in selected) or [row.get("id") for row in selected] != ids:
        raise ValueError("INVALID_PRODUCTION_CASE_COUNT_OR_IDS")
    cases = []
    for row in selected:
        if set(row) != {"id", "benchmark", "messages", "promptSha256"} or row.get("benchmark") != "production-composer-v1":
            raise ValueError("PRODUCTION_PROMPT_FILE_HAS_UNEXPECTED_FIELDS")
        messages = inference_messages(row, production=True)
        prompt_hash = digest(compact(messages))
        if row.get("promptSha256") != prompt_hash:
            raise ValueError("PRODUCTION_PROMPT_HASH_CHANGED")
        cases.append({"id": row["id"], "messages": messages, "promptSha256": prompt_hash,
                      "productionManifestSha256": digest(manifest_raw), "productionCasesSha256": manifest["caseSha256"],
                      "sourceSha256": source_hashes})
    return cases, digest(raw)


def load_cases(split):
    if split == "production":
        return load_production_cases()
    if split not in ("dev", "test"):
        raise ValueError("INVALID_CASE_SPLIT")
    # No arbitrary input path, provider URL or model can be supplied by the CLI.
    case_file = WORK / f"pilot-{split}.jsonl"
    manifest_file = WORK / "dataset" / "manifest.json"
    if digest(manifest_file.read_bytes()) != MANIFEST_SHA256:
        raise ValueError("DATASET_MANIFEST_CHANGED")
    manifest = json.loads(manifest_file.read_bytes())
    original_raw = (WORK / "dataset" / f"{split}.jsonl").read_bytes()
    if digest(original_raw) != manifest["files"][split]["sha256"]:
        raise ValueError("FROZEN_SPLIT_FILE_CHANGED")
    original = [json.loads(line) for line in original_raw.decode("utf-8").splitlines() if line.strip()]
    permitted = {row["id"]: inference_messages(row) for row in original}
    raw = case_file.read_bytes()
    selected = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    if len(selected) != CASE_COUNTS[split] or len({row.get("id") for row in selected}) != len(selected):
        raise ValueError("INVALID_CASE_COUNT_OR_IDS")
    cases = []
    for row in selected:
        messages = inference_messages(row)
        if row.get("split") != split or row.get("id") not in permitted or messages != permitted[row["id"]]:
            raise ValueError("CASE_INPUT_DIFFERS_FROM_FROZEN_DATASET")
        cases.append({"id": row["id"], "messages": messages, "promptSha256": digest(compact(messages))})
    return cases, digest(raw)


def request_body(messages):
    return {"model": MODEL, "temperature": 0, "max_tokens": MAX_TOKENS,
            "stream": True, "thinking": {"type": "disabled"},
            "response_format": {"type": "json_object"}, "messages": messages}


def request_once(case, key, opener):
    body = compact(request_body(case["messages"])).encode("utf-8")
    record = {"id": case["id"], "variant": "api", "provider": "apinex", "model": MODEL,
              "origin": "model-inference", "endpoint": ENDPOINT, "promptSha256": case["promptSha256"], "requestSha256": digest(body)}
    request = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={"Content-Type": "application/json", "Accept": "text/event-stream, application/json", "Authorization": "Bearer " + key})
    started = time.monotonic()
    raw_parts = []
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            completion = parse_response(response.headers.get("Content-Type", ""), response_lines(response, started + TIMEOUT_SECONDS, raw_parts))
        raw = b"".join(raw_parts).decode("utf-8")
        if key in raw or key in completion.output:
            raise ProviderResponseError()
        record.update(completion.fields())
        record["raw"] = raw
        record["modelIdentitySha256"] = digest(compact({"provider": "apinex", "endpoint": ENDPOINT, "requestedModel": MODEL, "reportedModel": completion.model}))
        if not completion.output.strip():
            record["error"] = "EmptyCompletion"
    except Exception as error:
        # In particular, never read/save HTTP diagnostic bodies or stringify an
        # error. A successful-but-malformed body is retained only after key guard.
        raw = b"".join(raw_parts).decode("utf-8", errors="replace")
        record.update({"output": "", **safe_failure(error)})
        if raw and key not in raw:
            record["raw"] = raw
        if isinstance(error, urllib.error.HTTPError):
            error.close()
    record["durationMs"] = round((time.monotonic() - started) * 1000, 3)
    return record


def benchmark(split):
    cases, file_hash = load_cases(split)
    if len(cases) != CASE_COUNTS[split]:
        raise ValueError("CASE_COUNT_EXCEEDS_FROZEN_CALL_BUDGET")
    output = WORK / f"api-{split}"
    predictions = output / "predictions.jsonl"
    if predictions.exists():
        raise FileExistsError("BENCHMARK_ALREADY_EXISTS_NO_AUTOMATIC_RETRY")
    if not sys.stdin.isatty():
        raise ValueError("TTY_REQUIRED_FOR_NON_ECHOING_CREDENTIAL_INPUT")
    output.mkdir(parents=True, exist_ok=True)
    # Refuse getpass's visible fallback. No file, environment variable or CLI
    # argument contains this key. HTTP Authorization exists in process memory.
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        key = getpass.getpass("APInex credential (not echoed or saved): ").strip()
    if len(key) < 8 or len(key) > 512 or "\n" in key or "\r" in key:
        raise ValueError("INVALID_CREDENTIAL_INPUT")
    records = []
    stop_reason = None
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with predictions.open("x", encoding="utf-8", newline="\n") as stream:
            for case in cases[:CASE_COUNTS[split]]:
                if split == "production":
                    # Recheck captured inputs and current application sources
                    # immediately before every token-consuming request.
                    current_cases, current_hash = load_cases(split)
                    if current_hash != file_hash or current_cases != cases:
                        raise ValueError("PRODUCTION_CHANGED_DURING_BENCHMARK")
                result = request_once(case, key, opener)
                provenance = {"caseFileSha256": file_hash}
                if split == "production":
                    provenance.update({name: case[name] for name in ("productionManifestSha256", "productionCasesSha256", "sourceSha256")})
                else:
                    provenance["datasetManifestSha256"] = MANIFEST_SHA256
                result.update(provenance)
                stream.write(compact(result) + "\n")
                stream.flush()
                records.append(result)
                # Console progress is an allowlist of nonsecret outcome fields.
                print(compact({name: result[name] for name in ("id", "variant", "durationMs", "error", "status", "inputTokens", "outputTokens", "stoppedWithEos") if name in result}), flush=True)
                if result.get("status") in (402, 429):
                    stop_reason = "quota-stop"
                    break
                if result.get("status") in (401, 403) or 300 <= result.get("status", 0) < 400:
                    stop_reason = "authorization-or-redirect-stop"
                    break
    finally:
        key = ""
    attempted = {record["id"] for record in records}
    summary = {"provider": "apinex", "requestedModel": MODEL, "endpoint": ENDPOINT, "split": split,
               "expectedCases": len(cases), "attemptedCases": len(records), "requests": len(records),
               "automaticRetries": 0, "fallbacks": 0, "stopReason": stop_reason,
               "missingOutputs": len(cases) - len(records), "notAttemptedIds": [case["id"] for case in cases if case["id"] not in attempted],
               "failures": sum("error" in record for record in records),
               "confirmedEos": sum(record.get("stoppedWithEos") is True for record in records),
               "maxOutputTokens": MAX_TOKENS, "requestTimeoutSeconds": TIMEOUT_SECONDS,
               "caseFileSha256": file_hash,
               "comparisonScope": ("Same captured production writer system/user messages; fixed reference planner, Blox Fruits source-backed fixtures only." if split == "production" else "Same frozen specialist-v2 system/user messages.") + " Provider JSON mode and greedy temperature 0; no response repair or reference answer injection. Costs are unknown and omitted."}
    if split == "production":
        summary.update({name: cases[0][name] for name in ("productionManifestSha256", "productionCasesSha256", "sourceSha256")})
    else:
        summary["datasetManifestSha256"] = MANIFEST_SHA256
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(compact(summary), flush=True)
    return summary


class ParserTests(unittest.TestCase):
    def production_fixture(self, root):
        directory = root / "artifacts"
        source_root = root / "src" / "lib"
        directory.mkdir(parents=True)
        source_hashes = {}
        for name in PRODUCTION_SOURCE_FILES:
            path = source_root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("// offline source fixture: " + name, encoding="utf-8")
            source_hashes[name] = digest(path.read_bytes())
        rows = []
        for index in range(CASE_COUNTS["production"]):
            messages = [{"role": "system", "content": "Exact captured writer system message"},
                        {"role": "user", "content": f"Full Hub {index + 1}, custom English UI.\nKeep Unicode: é, 水; preserve spaces  ."}]
            rows.append({"id": f"production-fixture-{index + 1}", "benchmark": "production-composer-v1",
                         "messages": messages, "promptSha256": digest(compact(messages))})
        raw = ("\n".join(compact(row) for row in rows) + "\n").encode("utf-8")
        (directory / "prompts.jsonl").write_bytes(raw)
        # Deliberately not JSON: inference must hash this file, never read labels.
        labelled = b"LOCAL_ANSWER_MUST_NOT_ENTER_AN_API_REQUEST"
        (directory / "cases.jsonl").write_bytes(labelled)
        manifest = {"schemaVersion": 1, "benchmark": "production-composer-v1", "cases": 8,
                    "caseIds": [row["id"] for row in rows], "sourceSha256": source_hashes,
                    "promptsSha256": digest(raw), "caseSha256": digest(labelled)}
        (directory / "manifest.json").write_text(compact(manifest), encoding="utf-8")
        return directory, source_root, rows, manifest

    def test_fixed_development_and_final_call_budgets(self):
        self.assertEqual(CASE_COUNTS, {"dev": 4, "test": 12, "production": 8})

    def test_production_preserves_exact_freeform_messages_and_v2_json_guard(self):
        messages = [{"role": "system", "content": "  Original system\nJSON only  "},
                    {"role": "user", "content": "Full Hub, English UI.\nTitle: 水 é\nDo not trim  "}]
        self.assertEqual(request_body(inference_messages({"messages": messages}, production=True))["messages"], messages)
        with self.assertRaises(json.JSONDecodeError):
            inference_messages({"messages": messages})

    def test_production_rejects_assistant_and_expected_labels(self):
        messages = [{"role": "system", "content": "Captured system"}, {"role": "user", "content": "Full Hub"}]
        for row in ({"messages": messages + [{"role": "assistant", "content": "answer"}]},
                    {"messages": messages, "expected": {"answer": "hidden"}},
                    {"messages": [messages[0], {**messages[1], "expected": "hidden"}]}):
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, "PRODUCTION_MESSAGES_MUST_EXCLUDE_LABELS"):
                inference_messages(row, production=True)

    def test_production_loads_only_exact_inputs_with_source_and_file_hashes(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory, source_root, rows, _manifest = self.production_fixture(Path(temporary))
            cases, file_hash = load_production_cases(directory, source_root)
            self.assertEqual(len(cases), 8)
            self.assertEqual(file_hash, digest((directory / "prompts.jsonl").read_bytes()))
            self.assertEqual([case["messages"] for case in cases], [row["messages"] for row in rows])
            self.assertNotIn("LOCAL_ANSWER", compact(cases))
            (source_root / PRODUCTION_SOURCE_FILES[0]).write_text("// changed application source", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "PRODUCTION_SOURCE_CHANGED"):
                load_production_cases(directory, source_root)

    def test_production_rejects_changed_artifacts_and_duplicate_ids(self):
        for changed in ("prompts", "cases", "ids"):
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as temporary:
                directory, source_root, _rows, manifest = self.production_fixture(Path(temporary))
                if changed == "ids":
                    manifest["caseIds"][1] = manifest["caseIds"][0]
                    (directory / "manifest.json").write_text(compact(manifest), encoding="utf-8")
                    error = "INVALID_PRODUCTION_IDS"
                else:
                    with (directory / f"{changed}.jsonl").open("ab") as stream:
                        stream.write(b" ")
                    error = "PRODUCTION_ARTIFACT_HASH_CHANGED"
                with self.assertRaisesRegex(ValueError, error):
                    load_production_cases(directory, source_root)

    def test_production_budget_eight_no_retry_and_quota_stop_without_network(self):
        class FakeResponse:
            headers = {"Content-Type": "application/json"}
            def __init__(self):
                self.body = compact({"model": "offline-upstream", "choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}).encode("utf-8")
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read1(self, _size):
                body, self.body = self.body, b""
                return body

        class FakeOpener:
            def __init__(self, quota):
                self.quota = quota
                self.requests = []
            def open(self, request, timeout):
                self.requests.append((request, timeout))
                if self.quota:
                    raise urllib.error.HTTPError(ENDPOINT, 429, "diagnostics must not be saved", {}, None)
                return FakeResponse()

        for quota in (False, True):
            with self.subTest(quota=quota), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory, source_root, rows, _manifest = self.production_fixture(root)
                opener = FakeOpener(quota)
                with mock.patch.dict(globals(), {"PRODUCTION": directory, "SOURCE_ROOT": source_root, "WORK": root / "results"}), \
                     mock.patch.object(sys.stdin, "isatty", return_value=True), \
                     mock.patch.object(getpass, "getpass", return_value="offline-test-credential"), \
                     mock.patch.object(urllib.request, "build_opener", return_value=opener), \
                     mock.patch("builtins.print"):
                    summary = benchmark("production")
                    with self.assertRaisesRegex(FileExistsError, "BENCHMARK_ALREADY_EXISTS"):
                        benchmark("production")
                expected_calls = 1 if quota else 8
                self.assertEqual(len(opener.requests), expected_calls)
                self.assertEqual(summary["requests"], expected_calls)
                self.assertEqual(summary["automaticRetries"], 0)
                self.assertEqual(summary["missingOutputs"], 8 - expected_calls)
                self.assertEqual(summary["stopReason"], "quota-stop" if quota else None)
                for index, (request, timeout) in enumerate(opener.requests):
                    payload = json.loads(request.data)
                    self.assertEqual(payload, request_body(rows[index]["messages"]))
                    self.assertEqual(request.full_url, ENDPOINT)
                    self.assertEqual(timeout, TIMEOUT_SECONDS)
                    self.assertNotIn("LOCAL_ANSWER", compact(payload))
                predictions = [json.loads(line) for line in (root / "results" / "api-production" / "predictions.jsonl").read_text(encoding="utf-8").splitlines()]
                self.assertEqual(len(predictions), expected_calls)
                self.assertTrue(all(record["origin"] == "model-inference" for record in predictions))
                self.assertTrue(all(record["sourceSha256"] == summary["sourceSha256"] for record in predictions))

    def test_json_keeps_exact_model_output_and_numeric_usage_only(self):
        output = ' {"window":{},"pages":[]}\n'
        body = {"model": "reported-model", "choices": [{"message": {"content": output}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 42, "completion_tokens": "13", "total_tokens": 55}}
        fields = parse_response("application/json", [compact(body)]).fields()
        self.assertEqual(fields["output"], output)
        self.assertEqual(fields["inputTokens"], 42)
        self.assertNotIn("outputTokens", fields)
        self.assertTrue(fields["stoppedWithEos"])

    def test_sse_comments_multiline_usage_and_stop(self):
        lines = [":keepalive", "event: message", 'data: {"model":"x","choices":[{"delta":{"content":"{\\\"a\\\":"},"finish_reason":null}]}', "", 'data: {"choices":[{"delta":{"content":"1}"},', 'data: "finish_reason":"stop"}]}', "", 'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":3}}', "", "data: [DONE]", ""]
        fields = parse_sse(lines).fields()
        self.assertEqual(fields["output"], '{"a":1}')
        self.assertEqual(fields["inputTokens"], 4)
        self.assertEqual(fields["outputTokens"], 3)
        self.assertTrue(fields["stoppedWithEos"])

    def test_done_without_finish_is_unknown_and_length_is_incomplete(self):
        unknown = parse_sse(['data: {"choices":[{"delta":{"content":"{}"}}]}', "", "data: [DONE]"]).fields()
        self.assertNotIn("stoppedWithEos", unknown)
        limited = parse_sse(['data: {"choices":[{"delta":{"content":"{"},"finish_reason":"length"}]}']).fields()
        self.assertFalse(limited["stoppedWithEos"])

    def test_embedded_quota_error_does_not_expose_diagnostics(self):
        with self.assertRaises(ProviderResponseError) as caught:
            parse_sse(['data: {"error":{"code":"429","message":"do-not-log-secret"}}', ""])
        self.assertEqual(safe_failure(caught.exception), {"error": "ProviderResponseError", "status": 429})

    def test_invalid_json_and_unsupported_finish_are_rejected(self):
        with self.assertRaises(json.JSONDecodeError):
            parse_sse(["data: invalid", ""])
        with self.assertRaises(ProviderResponseError):
            parse_response("application/json", ['{"choices":[{"message":{"content":"{}"},"finish_reason":"tool_calls"}]}'])

    def test_unknown_and_boolean_token_counts_are_omitted(self):
        self.assertEqual(token_usage({"prompt_tokens": True, "completion_tokens": None}), {})
        self.assertEqual(token_usage({"prompt_tokens": -1, "completion_tokens": float("nan")}), {})
        self.assertEqual(token_usage({"prompt_tokens": 3.0, "completion_tokens": 2}), {"inputTokens": 3, "outputTokens": 2})

    def test_stream_reader_preserves_split_utf8(self):
        wire = 'data: {"choices":[{"delta":{"content":"é€"},"finish_reason":"stop"}]}\r\n\r\n'.encode("utf-8")
        class FakeResponse:
            def __init__(self):
                self.chunks = iter(bytes([value]) for value in wire)
            def read1(self, _size):
                return next(self.chunks, b"")
        raw = []
        fields = parse_response("text/event-stream", response_lines(FakeResponse(), time.monotonic() + 1, raw)).fields()
        self.assertEqual(fields["output"], "é€")
        self.assertEqual(b"".join(raw), wire)

    def test_assistant_and_expected_never_enter_payload(self):
        row = {"expected": {"secret": "never-send"}, "messages": [{"role": "system", "content": "JSON only"}, {"role": "user", "content": '{"request":"Full Hub"}'}, {"role": "assistant", "content": "never-send"}]}
        payload = request_body(inference_messages(row))
        self.assertNotIn("never-send", compact(payload))
        self.assertEqual([message["role"] for message in payload["messages"]], ["system", "user"])
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(payload["thinking"], {"type": "disabled"})

    def test_redirect_is_blocked_before_forwarding_authorization(self):
        request = urllib.request.Request(ENDPOINT, headers={"Authorization": "Bearer fake-test-value"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            NoRedirect().redirect_request(request, None, 307, "ignore", {}, "https://other.example/")
        self.assertEqual(safe_failure(caught.exception), {"error": "HTTPError", "status": 307})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("dev", "test", "production"), default="dev")
    parser.add_argument("--self-test", action="store_true", help="Run offline parser/security tests; no credential or network.")
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ParserTests)
        return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1
    try:
        benchmark(args.split)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        print(compact(safe_failure(error)), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
