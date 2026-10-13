# ScriptRush specialist v2 evaluation

The functional gate keeps the production composition schema, complete feature coverage,
exact requested window, page order, labels, numeric ranges, initial states, English UI,
identity, required text, static safety and lifecycle checks. It additionally executes the
actual rendered controls in the closed Luau fixture harness. A schema-valid no-op fails.

V1 reference equality is retained separately in `referenceStrictPassed`, `referenceChecks`
and aggregate `referenceStrictPassRate`. Different callback bytes or an unrequested
description do not fail the functional gate by themselves. Explicitly supplied descriptions,
source, labels, states and ranges remain exact requirements. Effects must pass execution.
The runtime sandbox is an owned fictional mock; this is not live Roblox certification.

Run from `scriptrush-api`:

```powershell
node --experimental-strip-types experiments/specialist-v2/evaluate.ts cases.jsonl predictions.jsonl report.json train.jsonl
```

The default invokes `runtime/run.ts` for each parsed, statically safe output. The existing
official Luau executable is required (`LUAU_BIN` can name it). Alternatively, supply the
runtime harness JSON report as a fifth positional argument:

```powershell
node --experimental-strip-types experiments/specialist-v2/evaluate.ts cases.jsonl predictions.jsonl report.json train.jsonl runtime.json --include-api
```

Precomputed runtime evidence is bound to case, variant and SHA-256 of the actual rendered
candidate. Duplicate or unknown cases are rejected. `--no-runtime` provides diagnostics
only: it cannot yield functional passes. `--include-api` retains an API denominator even
when all API outputs are missing; otherwise API is included when an `api` candidate exists.
API provider identity, exact request settings and provenance must be recorded by the caller.

Candidates use `id`, `variant` (`base`, `specialist`, optionally `api`), `output`, and optional
duration/token/cost/EOS/error fields. Missing candidates and inference errors fail. Invalid
JSON leaves UI and feature execution unassessed, rather than inventing successful checks.
Unknown usage is `null`, never zero. Test and development split names are accepted.

`functionalPassed` excludes the independently reported decoding-budget check; `passed`
also rejects a confirmed non-EOS completion. Aggregate `strictPassRate` is this complete
accepted functional rate, while `referenceStrictPassRate` is the old byte-exact diagnostic.

Promotion eligibility requires at least twelve untouched final test cases with distinct
prompts and reference compositions, clean training separation, complete base outputs,
every specialist case accepted with confirmed completion, and a complete measured
production API comparison with strictly lower acceptance. Development cases cannot qualify.
Eligibility concerns this sample only. A deployable authorized inference endpoint and the
caller's provenance checks remain necessary; this program never deploys or activates a model.

Meaningful regression tests:

```powershell
node --experimental-strip-types --test experiments/specialist-v2/evaluation.test.ts
```
