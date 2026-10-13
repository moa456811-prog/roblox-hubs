"""Private OpenAI-compatible composition endpoint, staged and not deployed."""
import argparse
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import secrets
import threading
import time
import uuid

from backend import GpuBackend, MAX_NEW_TOKENS, SERVED_MODEL, ServiceError

MAX_BODY_BYTES = 128 * 1024
MAX_CONTENT_CHARACTERS = 96000
KEY_ENV = "SCRIPTRUSH_SPECIALIST_KEY"


def error_payload(code):
    # Fixed code names only: no request content, exception strings or paths.
    return {"error": {"type": code, "message": code, "code": code}}


def valid_key(value):
    # Dedicated prefix prevents reusing the user's APInex/Kaggle credentials.
    return isinstance(value, str) and re.fullmatch(r"srsk_[A-Za-z0-9_-]{43,128}", value) is not None


def read_server_key():
    value = os.environ.pop(KEY_ENV, None)
    if not valid_key(value):
        raise ServiceError("DEDICATED_SERVER_KEY_REQUIRED", 500)
    return value


def parse_payload(raw, allowed_system_hashes):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= MAX_BODY_BYTES:
        raise ServiceError("REQUEST_BODY_TOO_LARGE", 413)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeError, ValueError, RecursionError):
        raise ServiceError("INVALID_JSON", 400) from None
    allowed = {"model", "messages", "temperature", "max_tokens", "stream", "response_format", "n", "top_p"}
    if not isinstance(payload, dict) or not {"model", "messages"} <= set(payload) or not set(payload) <= allowed:
        raise ServiceError("UNSUPPORTED_REQUEST_FIELDS", 400)
    if payload["model"] != SERVED_MODEL:
        raise ServiceError("UNSUPPORTED_MODEL", 400)
    if payload.get("stream", False) is not False:
        raise ServiceError("STREAMING_UNSUPPORTED", 400)
    if payload.get("temperature", 0) != 0 or isinstance(payload.get("temperature", 0), bool) or type(payload.get("n", 1)) is not int or payload.get("n", 1) != 1 or payload.get("top_p", 1) != 1 or isinstance(payload.get("top_p", 1), bool):
        raise ServiceError("GREEDY_SINGLE_COMPLETION_REQUIRED", 400)
    if payload.get("response_format", {"type": "json_object"}) != {"type": "json_object"}:
        raise ServiceError("JSON_OBJECT_MODE_REQUIRED", 400)
    max_tokens = payload.get("max_tokens", MAX_NEW_TOKENS)
    if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or not 1 <= max_tokens <= MAX_NEW_TOKENS:
        raise ServiceError("INVALID_OUTPUT_TOKEN_BUDGET", 400)
    messages = payload["messages"]
    if not isinstance(messages, list) or len(messages) != 2 or any(not isinstance(message, dict) or set(message) != {"role", "content"} for message in messages):
        raise ServiceError("EXACTLY_TWO_COMPOSER_MESSAGES_REQUIRED", 400)
    if [message["role"] for message in messages] != ["system", "user"]:
        raise ServiceError("SYSTEM_USER_ROLES_REQUIRED", 400)
    if any(not isinstance(message["content"], str) or not 1 <= len(message["content"]) <= MAX_CONTENT_CHARACTERS for message in messages):
        raise ServiceError("INVALID_MESSAGE_CONTENT", 400)
    try:
        for message in messages:
            message["content"].encode("utf-8")
    except UnicodeError:
        raise ServiceError("INVALID_MESSAGE_CONTENT", 400) from None
    system_hash = hashlib.sha256(messages[0]["content"].encode("utf-8")).hexdigest()
    if system_hash not in allowed_system_hashes:
        raise ServiceError("UNQUALIFIED_COMPOSER_SYSTEM", 400)
    return [{"role": message["role"], "content": message["content"]} for message in messages], max_tokens


class Application:
    def __init__(self, backend, key, allowed_system_hashes):
        if not valid_key(key):
            raise ServiceError("DEDICATED_SERVER_KEY_REQUIRED", 500)
        self.backend = backend
        self.allowed_system_hashes = frozenset(allowed_system_hashes)
        self._pepper = secrets.token_bytes(32)
        self._key_digest = hmac.digest(self._pepper, key.encode("ascii"), "sha256")
        self._gpu_lock = threading.Lock()

    def authorized(self, headers):
        value = headers.get("Authorization", "")
        if not isinstance(value, str) or not value.startswith("Bearer ") or len(value) > 256:
            return False
        supplied = value[7:]
        if not valid_key(supplied):
            return False
        observed = hmac.digest(self._pepper, supplied.encode("ascii"), "sha256")
        return hmac.compare_digest(observed, self._key_digest)

    def handle(self, method, path, headers, raw=b""):
        if method == "GET" and path == "/health":
            ready = bool(self.backend.ready)
            return (200 if ready else 503), {"status": "ready" if ready else "unavailable", "model": SERVED_MODEL, "busy": self._gpu_lock.locked()}
        if method != "POST" or path != "/v1/chat/completions":
            return 404, error_payload("NOT_FOUND")
        if not self.authorized(headers):
            return 401, error_payload("UNAUTHORIZED")
        if not self.backend.ready:
            return 503, error_payload("MODEL_UNAVAILABLE")
        try:
            messages, budget = parse_payload(raw, self.allowed_system_hashes)
            if not self._gpu_lock.acquire(blocking=False):
                return 503, error_payload("MODEL_BUSY")
            try:
                result = self.backend.generate(messages, budget)
            finally:
                self._gpu_lock.release()
            # No JSON repair, fenced-block extraction or fallback code. Malformed
            # or non-composition answers fail, rather than pretending JSON mode.
            output = result["output"]
            try:
                composition = json.loads(output)
            except (TypeError, ValueError, RecursionError):
                raise ServiceError("INVALID_COMPOSITION", 502) from None
            if not isinstance(composition, dict) or set(composition) != {"window", "pages"} or not isinstance(composition["window"], dict) or not isinstance(composition["pages"], list) or not composition["pages"]:
                raise ServiceError("INVALID_COMPOSITION", 502)
            return 200, {"id": "chatcmpl-" + uuid.uuid4().hex, "object": "chat.completion", "created": int(time.time()), "model": SERVED_MODEL,
                "choices": [{"index": 0, "message": {"role": "assistant", "content": output}, "finish_reason": "stop" if result["stoppedWithEos"] else "length"}],
                "usage": {"prompt_tokens": result["inputTokens"], "completion_tokens": result["outputTokens"], "total_tokens": result["inputTokens"] + result["outputTokens"]}}
        except ServiceError as error:
            return error.status, error_payload(error.code)
        except Exception:
            return 500, error_payload("MODEL_FAILURE")


class PrivateHttpServer(ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, client_address):
        pass


def handler(application):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ScriptRushSpecialist"
        sys_version = ""
        protocol_version = "HTTP/1.0"

        def log_message(self, format, *args):
            pass

        def log_request(self, code="-", size="-"):
            pass

        def send_json(self, status, value):
            data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def send_error(self, code, message=None, explain=None):
            self.send_json(code, error_payload("HTTP_ERROR"))

        def do_GET(self):
            status, value = application.handle("GET", self.path, self.headers)
            self.send_json(status, value)

        def do_POST(self):
            if self.path != "/v1/chat/completions":
                self.send_json(404, error_payload("NOT_FOUND"))
                return
            if not application.authorized(self.headers):
                self.send_json(401, error_payload("UNAUTHORIZED"))
                return
            length = self.headers.get("Content-Length", "")
            if not length.isascii() or not length.isdigit() or len(length) > 7 or self.headers.get("Transfer-Encoding"):
                self.send_json(400, error_payload("CONTENT_LENGTH_REQUIRED"))
                return
            size = int(length)
            if not 1 <= size <= MAX_BODY_BYTES:
                self.send_json(413, error_payload("REQUEST_BODY_TOO_LARGE"))
                return
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
                self.send_json(415, error_payload("JSON_CONTENT_TYPE_REQUIRED"))
                return
            self.connection.settimeout(15)
            try:
                raw = self.rfile.read(size)
            except (TimeoutError, OSError):
                self.send_json(408, error_payload("REQUEST_BODY_TIMEOUT"))
                return
            if len(raw) != size:
                self.send_json(400, error_payload("INCOMPLETE_REQUEST_BODY"))
                return
            status, value = application.handle("POST", self.path, self.headers, raw)
            self.send_json(status, value)
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment-manifest", required=True)
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--training-summary", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    key = read_server_key()
    try:
        backend = GpuBackend(args.deployment_manifest, args.adapter_dir, args.training_summary)
        application = Application(backend, key, backend.manifest["allowedSystemSha256"])
    finally:
        key = ""
    with PrivateHttpServer((args.host, args.port), handler(application)) as server:
        server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        print(json.dumps(error_payload("SERVER_STARTUP_FAILED")), file=__import__("sys").stderr)
        raise SystemExit(1)
