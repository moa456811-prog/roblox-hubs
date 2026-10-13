# Bounded APInex comparison

`api_benchmark.py` compares frozen specialist-v2 inputs or separately captured
production writer messages against APInex model `free/gpt-6-luna`, at the fixed HTTPS endpoint
`https://api.apinex.bond/v1/chat/completions`. It does not change ScriptRush routing.
Only the parent agent should run real requests, after the 7B specialist passes the
development functional gate, to avoid spending API tokens on a failed candidate.

The CLI permits three fixed local input sets:

- `test-results/specialist-v2/pilot-dev.jsonl`: exactly four dev cases.
- `test-results/specialist-v2/pilot-test.jsonl`: exactly twelve final blind cases.
- `experiments/specialist-v2/production/artifacts/prompts.jsonl`: exactly eight
  distinct `production-*` cases captured from the production writer path.

For `dev` and `test`, selected messages must exactly match their source frozen dataset split. The
dataset manifest SHA256 is pinned. Each request contains only the existing
`system` and `user` strings, with no appended provider prompt or repair instruction.
Assistant targets, full case objects and `expected` fields never enter a request.
Final case selection must be fixed before seeing any result and match the same
twelve cases used for specialist/base inference. The script does not choose cases.

For `production`, the ignored `production/artifacts/manifest.json` must identify
`production-composer-v1`, eight unique IDs and the exact hashes of both
`prompts.jsonl` and `cases.jsonl`. Only the prompt file is parsed for inference;
the labelled case file is hashed without reading its answers. The twelve
`sourceSha256` entries must exactly match the current files under `src/lib`,
including writer, provider, composer and admitted Blox Fruits controller sources.
Checks run before credential entry and again immediately before every request.
The prompt file must contain only its ID, benchmark, prompt hash and two exact
`system`/`user` messages. Freeform production user text is preserved byte for byte
after UTF-8 decoding; assistant messages and evaluation fields are rejected.
The existing specialist-v2 JSON user-input guard remains unchanged for `dev`/`test`.
Production capture uses a fixed local reference planner inventory; this benchmark
evaluates the composer and its callbacks, not planning or live game behavior.

An additional ignored `test-results/specialist-v2/production-api-parameters.json`
receipt captures the real `generateCompleteScript` callback's max-token and
timeout budget, followed by the real provider client's body through an inert
local transport. It must match all eight frozen messages, the prompt/manifest
hashes and the same twelve application source hashes. The benchmark verifies
this receipt before credential entry and every request; it never rewrites the
frozen prompts, answers or manifest.

Transport settings always include JSON object mode, streaming and
`thinking.type=disabled`. Utility `dev`/`test` comparisons retain temperature 0,
4,096 maximum output tokens and a 240-second request budget. `production` follows
the captured site writer: temperature 0.1, **14,000 maximum output tokens** and a
**120-second timeout**. This cap does not require a long answer. Specialist/base
production inference still uses greedy decoding, a 4,096-token cap and 240 seconds;
decoding budgets and latency are therefore **not controlled across production
variants**, and a production timing difference must not be attributed solely to
the model. The API has the larger token allowance. TLS
certificate verification stays enabled. Redirects are refused before credentials
can be forwarded. There is exactly one attempt per selected case, no automatic
retry, no model substitution, no fallback provider and no paid route.
The absolute call budgets are four development requests, twelve specialist-v2
final requests and eight separate production requests. These are distinct
benchmarks: eight production cases do not replace the twelve blind specialist-v2 cases.

On HTTP or SSE quota status 429/402, the script stops and leaves subsequent
predictions absent. Its summary lists all unattempted IDs and the missing-output
count; the evaluator must count those missing cases as failures, not silently
remove them from the denominator. Authorization failures and redirects also stop
the benchmark. Other failed attempts are recorded without raw provider error text.

Use a terminal/TTY. The credential is entered through non-echoing `getpass`, with
its visible fallback disabled. It is never read from or placed in a file,
environment variable, notebook, CLI argument, model message or log. Do not paste
the credential into the command itself.

```powershell
# Offline only: no credential and no HTTP request.
python experiments/specialist-v2/api_benchmark.py --self-test

# Parent-agent controlled, only after the specialist functional gate passes.
python experiments/specialist-v2/api_benchmark.py --split dev
# After final blind cases have been frozen locally:
python experiments/specialist-v2/api_benchmark.py --split test
# Offline only: capture budgets/body from the real writer and inert provider;
# this does not modify the frozen production artifacts or contact APInex.
node --experimental-strip-types experiments/specialist-v2/production/capture-api-parameters.ts
node --experimental-strip-types --test experiments/specialist-v2/production/api-parameters.test.ts
# Parent-agent controlled, after capture and source verification:
python experiments/specialist-v2/api_benchmark.py --split production
```

Results go to ignored `test-results/specialist-v2/api-dev/`, `api-test/` or
`api-production/`, with
`predictions.jsonl` and `summary.json`. Existing prediction files are refused,
including partial runs, to prevent an accidental second paid/token-consuming
execution. Repeating an experiment requires deliberately preserving the existing
artifact elsewhere first; no implicit resume or overwrite exists.

Each result, including failed attempts, uses `variant="api"` and
`origin="model-inference"` and preserves the exact generated output string,
without stripping fences, repairing JSON, filling missing controls or injecting
reference callbacks. A successful raw JSON/SSE body is preserved locally for
audit; any body containing the credential is suppressed. HTTP diagnostic bodies
are never read or saved. Console progress exposes only fixed outcome fields.
Errors contain only a class name and numeric status, never exception text,
request headers, credentials or provider diagnostic prose.

`stoppedWithEos=true` requires explicit `finish_reason=stop` or `eos`;
`length` is false. `[DONE]` without a finish reason remains unknown and does not
claim a complete answer. Token counts are included only when the provider supplies
valid numeric nonnegative integral observations. Unknown usage and costs are
omitted. The record includes measured latency, requested/reported model identity,
model-identity hash, exact prompt/request hashes and frozen dataset/case-file
hashes. Production records instead carry the production manifest, prompt-file,
labelled case-file, captured-parameter receipt and current application source
hashes, plus the actual requested temperature/token cap/timeout. A provider-reported identity is metadata, not independent verification of
its upstream model weights.

The embedded offline tests cover ordinary JSON, multiline SSE, comments, stop and
truncation, missing finish metadata, quota failures, malformed output, invalid
usage, split UTF-8, label exclusion and blocked redirects. Production checks also
cover exact freeform preservation, rejected assistant/expected labels, changed
source and artifact hashes, duplicate IDs, eight simulated requests without
retries, refusal to repeat a run and quota stop after one simulated request.
Tests reject changed writer parameters/provenance and check the production
request body and transport timeout, while preserving utility settings. The
TypeScript capture test checks all eight real writer fixtures with inert fetch.
No real API request is made by `--self-test`.
