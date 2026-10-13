# Production continuation from recovered checkpoint 32

This prepares a new private job; it does not submit, authenticate, change the
site, deploy a model or inspect final inputs. The original production notebook,
its prepared files, dataset, source receipt and recovered checkpoint are preserved.

The source is `sciptrush/scriptrush-v2-production-8af8851d`, version 1,
checkpoint 32. The exact recovery receipt SHA is
`4457a3c35aa37ba853257b231b20c637b16453cff306b2f83b337df93ad6421c`;
the ready private dataset-transport receipt SHA is
`c4a41179b29326e8274797b3d18eb48c9f3c0b694aac19f12afa595593c0efb3`.
The loader checks original source/manifest/receipt lineage, raw adapter/config/
trainer-state bytes and the step-32 metric. It does not invent a completed summary
for the failed original job. The private dataset is transport only, never hosting.

`prepare_production_retry.py` reads the SHA-pinned original prepared bundle and
reuses exactly its 144 training rows, eight validation rows and four DEV prompts.
DEV remains two messages (`system,user`), outside supervised training. It never
reads DEV answers or final files. The continuation performs 64 additional optimizer
steps at LR `2e-5`, evaluation/save every 16 steps, context 8,192, sliced assistant
cross-entropy and seed 39119. The seed differs from the original run. The original
checkpoint has no optimizer state; this is a LoRA weight warm start with a new
optimizer and schedule, not an optimizer-state resume.

Local preparation, only after the source receipts and pinned tokenizer are present:

```sh
python experiments/specialist-v2/prepare_production_retry.py \
  --recovery-receipt test-results/specialist-v2/production-checkpoint-recovery/probe-c5e2dcd5/recovery-receipt.json \
  --checkpoint-dataset-receipt test-results/specialist-v2/checkpoint-dataset-transport.json
```

The tokenizer is loaded only from the local cache at the pinned Qwen revision.
Overlong full examples fail before preparation; nothing is silently truncated.
New output locations are `test-results/specialist-v2/production-retry-kaggle-run`,
`production-retry-dataset/manifest.json` and
`production-retry-submission-manifest.json`. Existing or partial preparations
are never replaced. Metadata selects one ready private checkpoint dataset, no
failed notebook source, and a fresh short `sciptrush/scriptrush-v2-production-retry-*`
identity. Prepared text uses LF and receipts hash the actual written bytes.

The prepared script is standalone. It embeds only the necessary stdlib recovery
validators extracted from the inference runner, with their exact source SHA;
it does not import local repository files on Kaggle. Each fitting rank has a
distinct temporary extraction directory for a bounded, hash-verified dataset
archive. Raw mounted files are preferred. Fitting retains the synchronized best
checkpoint save fix, an initial two-token inference smoke and atomic fit receipts.

The explicit `developmentMode: external` / `runPurpose:
production-continuation-fit` mode is non-diagnostic. It neither sets
`skipDevelopment: true` nor claims DEV completion. After fitting, immutable
`fit-summary.json` and `training-summary.json` report `fitStatus: complete`,
`developmentStatus: external-pending`, `developmentSkipped: false`,
`diagnosticOnly: false` and `productionPromotionEligible: false`. Independent DEV
inference and all existing final/API/hosting gates remain required.

`steps: 64` and `cumulativeProductionSteps: 96` report fitting progress.
The exported best adapter may come from an earlier validation checkpoint:
`selectedCheckpointStep` records its actual continuation step and
`selectedCumulativeProductionSteps` equals 32 plus that selected step.
`initialRecoveredCheckpoint` is identical in the prepared receipt and fit summary,
preserving the raw recovery/dataset receipts and weight/state/config pins.

The previous 32-step fitting took approximately 26 minutes before its separate
DDP timeout. A 64-step continuation may therefore take roughly 50–55 minutes;
this is an estimate, not a completion guarantee or hosted-serving latency result.

Offline checks, with temporary dummy adapters and mocked token measurements:

```sh
python -m unittest discover -s experiments/specialist-v2 -p test_*.py
python -m py_compile experiments/specialist-v2/kaggle_train.py experiments/specialist-v2/prepare_production_retry.py
```
