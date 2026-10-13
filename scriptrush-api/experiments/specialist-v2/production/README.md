# Separate production composer benchmark

Eight **new freeform requests** exercise the actual ScriptRush writer prompt. They do not reuse, replace or loosen the frozen specialist-v2 development/final tests. Four requests are French, four English; four are unnamed and four retain exact custom titles including accents, quotes and punctuation. The requested UI varies dimensions, five RGB roles, alternate palettes, corner radius, font, font size, sidebar/top navigation and four/seven/eight ordered pages.

Every case requires Auto Farm, Auto Boss, Quest Farm and Auto Loot, plus Walk Speed, Jump Power, Rejoin, Theme and complete UI lifecycle. The four gameplay controls must call the admitted Blox Fruits `ctx.gameplay.setEnabled` controller with the matching action. A utilities-only answer, empty callback, disabled replacement, guessed remote or wrong page fails. Only the server's original audited factory is embedded. Its public source observations are source-backed and **not live-game certification**. All eight cases are Blox Fruits because that is currently the only admitted complete four-action library; this does not establish equivalent support for any other game.

`prompts.ts` invokes the real `generateCompleteScript` using a locally supplied reference planner inventory, then aborts before model inference. The captured writer messages pass through the real `createProviderRunner` formatter with an injected inert fetch function. This includes the current `HUB_COMPOSER_SYSTEM`, English language policy, REQUIREMENTS, original request, exact game identity, evidence, library context and JSON schema, plus the provider's actual JSON reminder. No live fetch, secret or API call occurs. Twelve production source hashes and each exact prompt hash are recorded. The planner and semantic reviewer are **outside this writer-stage benchmark**.

From `scriptrush-api`:

```powershell
node --experimental-strip-types experiments/specialist-v2/production/build-benchmark.ts
node --experimental-strip-types --test experiments/specialist-v2/production/evaluation.test.ts experiments/specialist-v2/production/runtime.test.ts
node --experimental-strip-types experiments/specialist-v2/production/evaluate.ts experiments/specialist-v2/production/artifacts/cases.jsonl production-outputs.jsonl production-report.json actual-train.jsonl --include-api
```

For inference, read **only `artifacts/prompts.jsonl`** and send its two `messages` unchanged to base, specialist and the current production API. Never send `cases.jsonl`, expected compositions, assistant references or evaluator feedback to a candidate. Candidate JSONL follows:

```json
{"id":"production-anonymous-cyan-sidebar","variant":"specialist","output":"{...actual model output...}","stoppedWithEos":true,"model":"exact model/revision + adapter hash","origin":"model-inference","durationMs":1000,"inputTokens":5000,"outputTokens":2000}
```

Use variants `base`, `specialist`, `api`; retain errors and missing rows rather than dropping them. `stoppedWithEos=false` is a separately reported decode-budget failure. Missing/unknown completion cannot pass acceptance. With `--no-runtime`, static results remain diagnostic and no functional hub can pass. Reference answers can test the harness with `origin=reference-self-test` and `--reference-self-test`; they cannot qualify a model.

The evaluator separately requires schema, coverage, all four admitted gameplay callbacks, exact requested window/UI/control values, English labels, identity, required text, trusted rendering, static safety and the parameterized closed runtime. It ignores unrequested descriptions and implementation IDs; actual behavior is checked independently. Missing outputs, inference errors and unevaluated checks retain the full case denominator. Nonempty actual training data must be supplied and audited for exact prompt/answer separation. Source changes require a newly captured benchmark and fresh runs. Freeze generated case/prompt hashes before inference; do not edit these tests in response to candidate failures or add them to training.

`productionGate` is deliberately separate from specialist-v2's synthetic utility gate. It requires at least six distinct production-shaped cases, every specialist case passing, genuine named-model inference provenance, complete base/API comparisons, clean training separation and a higher specialist acceptance rate than the current API. **It never activates a model.** The untouched final utility gate, broader evidence for other games, current API comparison, prompt-aligned integration and a deployable authorized inference endpoint are also needed. Closed mocks do not measure real visual rendering, live network/server acceptance, physics reachability or anti-cheat behavior.

## Next training/integration step

The current v2 adapter learns a different input shape: a compact `SPECIALIST_SYSTEM` and a JSON user object (`request`, `requestedUi`, `requestedControls`, `requirements`, `gameEvidence`). Production sends a longer composer system prompt and a freeform context string. A score on synthetic v2 inputs cannot establish quality on that unseen distribution.

Two valid approaches require a new, independent training set and the above unchanged tests:

1. Teach the real production message pair and the four admitted library callbacks in a later stage, using independent titles, layouts, colors, page arrangements and ranges. Keep original v2 examples in a rehearsal mixture to avoid losing local behavior. Include unavailable/foreign-game evidence as separate honest tasks, rather than inheriting Blox Fruits actions.
2. Build a deterministic server-side adapter for the composer stage only, extracting an evidence-preserving structured request that exactly matches the trained format. Preserve the complete original request, custom UI, contract and exact game library identity. Validate its output with the current schema, bindings, language checks and renderer; keep planner/reviewer/fix-script routing unchanged. This changes production inputs and needs its own paired benchmark before enablement.

The first approach has the smaller semantic integration risk because it avoids adding another freeform-to-structured interpretation step. Neither approach supplies GPU hosting. A private Kaggle experiment is an offline training/evaluation environment, not a production API for visitors. No production file, provider routing, endpoint, credential or deployment is changed by this folder.
