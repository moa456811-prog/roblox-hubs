# Private specialist composition server, staged only

This directory prepares a future GPU endpoint. It has not been hosted, started with model weights, connected to ScriptRush or used as evidence that the specialist passes qualification. Training and final comparison remain independent gates. Kaggle is used for bounded private batch jobs, not a persistent public server.

`GET /health` returns only readiness, the public model alias and a busy flag. `POST /v1/chat/completions` returns an OpenAI-shaped, non-streaming JSON completion. Only one generation runs at once; another authorized request receives `503 MODEL_BUSY` with no queued generation. The model outputs a composition for ScriptRush's existing renderer. The server checks the JSON root; the application must continue performing its full schema, requirement, UI and runtime validation.

## Runtime and artifacts

Use a dedicated CUDA-enabled Python 3.10+ GPU runtime with its compatible Torch and GPU driver already installed. The four packages in `requirements.txt` match the batch benchmark and are version checked at startup. This preparation does not install Torch or select a host, Docker image or paid/free GPU service. A T4 memory budget for the maximum context still needs a real GPU measurement before deployment.

The base is pinned to `Qwen/Qwen2.5-Coder-7B-Instruct` revision `c03e6d358207e414f1eca0bb1891e29f1db0e242`, loaded with NF4, double quantization, FP16 compute and SDPA. As in the benchmark, `prepare_model_for_kbit_training` leaves norms in FP32, then the input/output embeddings return to FP16. Generation uses CUDA FP16 autocast to keep those mixed frozen dtypes compatible, matching the AMP context used while fitting. The adapter is inference-only. No trainer, optimizer, training labels or requests are saved. Base files may be downloaded from Hugging Face at startup, or supplied through the normal pinned model cache.

Create a private deployment manifest from `deployment-manifest.example.json` only after qualification. Place the completed adapter and the exact `training-summary.json` from the qualified run outside source control. Populate all hashes from their exact bytes. `trainingManifestSha256` must match the summary's `datasetManifestSha256`; `adapterSha256` must exactly match its complete adapter hash mapping. The loader verifies every listed local file, the raw summary hash, the pinned base/revision and the LoRA base configuration. An explicit manifest is the only way to select new adapter hashes; no automatic newest-adapter or environment override exists. The example has deliberately invalid placeholders and cannot start a server.

The original completed-training path keeps its format-1 manifest and `--training-summary` argument. For the production checkpoint recovered after the training job ended in ERROR, use the distinct format-2 `deployment-manifest.recovered.example.json` and `--recovery-receipt` instead. The loader accepts only `sciptrush/scriptrush-v2-production-8af8851d`, version 1, checkpoint 32 and the pinned original source-script/training/production-manifest hashes. The private deployment manifest pins the raw recovery receipt hash, raw trainer-state hash, original submission-receipt hash and the complete adapter hash map. Those pins come from the qualified artifacts and their receipts, never an HTTP request or an automatically selected newest directory. Both examples contain invalid placeholders and are deliberately unusable before qualification.

Place the unmodified recovered `trainer_state.json`, `adapter_config.json`, `adapter_model.safetensors` and, if listed by its receipt, `README.md` together in the explicit adapter directory. Keep the original `recovery-receipt.json` separately; no completed `training-summary.json` is needed or synthesized. The receipt must have its exact admitted fields, `complete: true` (recovery of the listed files), and `trainingSummaryFabricated: false`. The loader verifies every receipt file's raw byte size/SHA and the total bound of 200 MiB. The adapter map exactly excludes `trainer_state.json` and includes every other receipt file. It also checks global/best step 32, the selected checkpoint, validation metric `0.03299146145582199`, exactly one consistent step-32 evaluation, and the pinned Qwen revision in the LoRA configuration. The receipt may be at most 32 KiB; trainer/config metadata at most 2 MiB each. File hashes establish artifact identity, not tensor finiteness or quality; independent finite-weight and final functional checks still apply. No final prompts, expected answers, training examples or Kaggle transport credentials are needed by this loader.

`allowedSystemSha256` contains 1–8 distinct hashes of exact qualified composer system strings, encoded as UTF-8. Pin the production composer system used in its benchmark. Any different system, including planner/reviewer/general-chat instructions, is rejected. Update this list only when the corresponding new composer prompt has been qualified. Neither the manifest nor the server contains an answer, final test fixture or provider credential.

## Future private launch

Provision a **new** secret named `SCRIPTRUSH_SPECIALIST_KEY` in the server runtime's secret/environment facility. Its value must be `srsk_` followed by 43–128 URL-safe characters, with at least 32 random bytes before URL-safe encoding. Existing APInex, Kaggle and other provider keys are rejected by this format. The key is removed from `os.environ` during startup and the application retains a peppered HMAC digest for constant-time Bearer-token comparison. Python strings cannot promise secure memory erasure; use a dedicated server process and provision the secret only there. The command line takes artifact locations, never the secret:

```sh
python experiments/specialist-v2/serving/server.py \
  --deployment-manifest /private/qualified/deployment.json \
  --adapter-dir /private/qualified/adapter \
  --training-summary /private/qualified/training-summary.json
```

The recovered-checkpoint alternative, only after its independent qualification and an authorized usable GPU host exist, is:

```sh
python experiments/specialist-v2/serving/server.py \
  --deployment-manifest /private/qualified/recovered-deployment.json \
  --adapter-dir /private/qualified/checkpoint-32 \
  --recovery-receipt /private/qualified/recovery-receipt.json
```

The two provenance arguments are mutually exclusive. A recovered manifest rejects a completed summary, and a completed manifest rejects a recovery receipt. This support changes artifact loading only; it does not qualify the checkpoint, reconcile the site's current request parameters or deadlines, create hosting, start a server or activate routing.

The default bind is `127.0.0.1:8000`. A future deployment should use a private network/TLS proxy with its request, response and Authorization logging disabled. The built-in server has no access, request-body, header or exception-text logs. Unknown endpoints, malformed input and model failures return fixed error names. Health includes no file paths, hashes, secrets or prompt content. No CORS, public UI, signup or deployment is included.

Clients send `Authorization: Bearer <dedicated-server-secret>`, `Content-Type: application/json` and an explicit `Content-Length`. The JSON contract is:

```json
{
  "model": "scriptrush-specialist-v2",
  "messages": [
    {"role": "system", "content": "<exact qualified composer system>"},
    {"role": "user", "content": "<game evidence and complete composition requirements>"}
  ],
  "temperature": 0,
  "top_p": 1,
  "n": 1,
  "stream": false,
  "response_format": {"type": "json_object"},
  "max_tokens": 4096
}
```

Only the displayed fields are accepted. Exactly two messages, in `system,user` order, are required; tools, assistant messages and unknown fields are rejected. Requests are at most 128 KiB; each message has at most 96,000 characters. The pinned tokenizer counts the full chat-template prompt before generation and refuses over 16,384 tokens without truncation. Output is 1–4,096 new tokens and greedy. `max_time=240` stops between generation steps, so an in-flight CUDA operation can overrun the requested 240 seconds; no unsafe forced thread cancellation is used. A hard process deadline must be supplied by the future GPU supervisor if required, and cannot be claimed as tested here.

Successful responses preserve the exact model JSON string, report measured tokenizer counts and use `finish_reason: stop` for EOS or `length` otherwise. Invalid composition JSON is a `502 INVALID_COMPOSITION`; there is no JSON repair, retry, template replacement or paid-provider fallback. The GPU lock stays held until generation exits, including timeout/failure handling. Health and all response JSON use `Cache-Control: no-store`.

## Offline verification

```sh
python -m unittest discover -s experiments/specialist-v2/serving -p 'test_*.py'
python -m py_compile experiments/specialist-v2/serving/backend.py experiments/specialist-v2/serving/server.py
```

Tests use fake keys, temporary artifact files and a mocked backend. They check authentication, composer restrictions, bounds, JSON/EOS response handling, one active generation, fixed errors, suppressed logs, completed adapter/summary/model lineage, and recovered receipt/state/source/file lineage. Recovered tests recompute hashes around deliberately invalid metadata to ensure source/version/step/metric/config checks provide independent validation. They also verify that a single whitespace change in a pinned receipt, weights or state is rejected. Importing the modules does not import Torch or load weights. Passing these tests proves only the offline endpoint contract; it does not prove GPU fit, throughput or model quality.
