# Offline specialist evaluation

Run from `scriptrush-api` after downloading both models' inference results:

```powershell
node --experimental-strip-types experiments/specialist/evaluate.ts test-results/specialist/pilot-test.jsonl test-results/specialist/kaggle-output/scriptrush-specialist/predictions.jsonl test-results/specialist/report.json test-results/specialist/dataset/train.jsonl
node --experimental-strip-types --test experiments/specialist/evaluation.test.ts
```

The paths can be replaced with the actual dataset and output locations. No API keys, paid calls, model downloads, generated-code execution, or site changes are performed by this evaluator.

Each output record is JSONL:

```json
{"id":"held-out-case-id","variant":"base","output":"{\"window\":...,\"pages\":[...]}","durationMs":1200}
```

Use `variant: "specialist"` for the adapted model. Optional `error`, `inputTokens`, `outputTokens`, and `costUsd` record measured failures and resource usage. Omitted measurements remain `null`, never an invented zero. Include failures with `output: ""`; an absent result also counts as failure. Duplicates and unknown case IDs are rejected. `stoppedWithEos: false` independently fails `completion-budget`, even if its partial output parses as JSON; `true` passes this check. An omitted EOS flag is recorded as unknown and flagged in the report. A bounded token/time generation ending without EOS is an incomplete-decoding failure; it cannot by itself establish a failed training method.

Cases follow the dataset format `{id,split,designFamily,actionFamily,messages,expected:{composition,contract,ui,featureIds}}`. **Only messages whose role is not `assistant` may be sent to either model.** Both models receive exactly the same input; evaluation expected answers never enter inference. Use the same decoding settings and token limit for both variants and keep test cases out of training and adapter selection.

Strict acceptance requires a valid complete composition, all original feature bindings, exact requested window dimensions/colors/title/fonts/navigation/page text, English functional labels, requested identity, independent controls with matching action/range/state/labels, and successful rendering through the existing trusted server renderer. Known placeholder/loader and lifecycle rejection checks also apply. Custom callback text must match the audited reference after line ending normalization and trimming. Implementation item IDs may differ. This callback check intentionally rejects unproved alternatives, including potentially equivalent code; the benchmark is a controlled composition task, not a general code-equivalence oracle.

The report includes each case, strict pass rates, diagnostic soft scores, paired wins/losses/ties, latency, measured usage, output hashes, EOS completion/budget counts, and a leakage audit against training prompts, answers, design families and action families. Check aggregates distinguish actual UI failures from checks that could not be evaluated because the JSON was incomplete. Feature aggregates include required/assessed/passed/failed counts and per-feature counts. Missing cases remain in both denominators. Empty datasets, small samples and unaudited/leaked splits are explicitly flagged. This evaluator never labels a model generally superior, even when a descriptive pass rate is higher. The notebook compares its local base model with its LoRA specialist, **not APInex or OpenRouter**.

These are **static checks on synthetic, owned-game fixtures**. They cannot prove live-game compatibility, visual rendering, server behavior, or arbitrary custom logic. A real inference run for both models and a separate closed runtime/Studio evaluation are required before claiming broader improvements or deploying an adapter. The existing optional isolated Luau mock can test compatible rendered scripts separately; it has no networking, filesystem or real Roblox access. Generated model text must never be executed directly on the host.
