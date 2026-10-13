# ScriptRush specialist v2

Private, reproducible model experiment. Nothing in this directory changes the
production provider chain, deploys an endpoint or activates the candidate model.
The current production generator remains the baseline to beat.

## Model and fitting

The candidate is `Qwen/Qwen2.5-Coder-7B-Instruct`, revision
`c03e6d358207e414f1eca0bb1891e29f1db0e242`, with QLoRA NF4, rank 16, alpha 32,
dropout 0.05 and adapters on attention and MLP projections. The private Kaggle
experiment uses two T4 GPUs, effective batch size four and 96 optimizer steps
(1.5 passes over 256 training examples). It selects a checkpoint by validation
loss, never by the final test answers. Model and adapter provenance are recorded
in the output summary.

Qwen was chosen for its public, nongated code model weights and compatibility
with the available T4 memory. This is a practical experiment choice, not a claim
that it beats GLM or the current API. GLM's larger mixture models still require
memory for all loaded weights; their active parameter count alone does not make
them fit this notebook.

The training loss is causal, assistant-only cross entropy. Prompt tokens are
masked. Computing FP32 cross entropy in chunks avoids upcasting the entire
151k-token vocabulary tensor, including the masked prompt. Numerical tests
compare both loss and gradients with ordinary full masked cross entropy. No
answer is truncated to make it fit.

The independent production continuation is prepared by `prepare_production.py`
after the initial private job has completed. It resumes its hash-pinned adapter
on 48 new production training examples plus 96 original utility training examples,
with eight independent production validation and four development cases. It uses
32 steps at learning rate 0.00003, context at most 8192 and checkpoint selection
every 16 steps. The optional assistant-only vocabulary projection preserves the
causal predictor before the first assistant token; numerical tests verify both
loss and gradients. The original utility submission remains frozen.

## Evidence and acceptance

1. Build the original deterministic dataset described in
   [dataset/README.md](dataset/README.md). Training, validation, development and
   final designs, fictional paths and action combinations are separated.
2. Run `prepare_kaggle.py` once for a new private experiment. It uploads training
   and validation messages, and four development prompts without their answers.
   It does not upload final test prompts or labels. The submission receipt binds
   the generated script to a SHA-256 hash.
3. Submit and retrieve only the user's private notebook with `kaggle_remote.py`.
   `kaggle_watch.py` streams the user's job progress. A log-stream reconnect is
   separate from job failure; status and final output determine completion.
4. Evaluate raw development generations with [evaluate.ts](evaluate.ts) and the
   [isolated Luau harness](runtime/README.md). Schema, every requested control,
   exact UI values, English labels, identity and actual callback effects matter.
   No output repair or reference substitution occurs in the benchmark.
5. Only a development candidate that works proceeds to untouched final cases
   and the separate production-prompt benchmark. The latter is necessary because
   structured synthetic inputs do not match the website's free-form composer
   prompt and do not cover its game-specific Farm/Boss/Quest/Loot controller.
   `freeze_final.py` selects twelve utility cases by fixed metadata independently
   of outcomes, with all four French/English and unnamed/custom combinations for
   each action family. It writes a labelled local evaluation file and a separate
   `id/messages`-only inference file. `evaluate_production_dev.ts` evaluates the
   four independent production development generations without using the eight
   final production cases; its results can never qualify a production model.
6. Compare the same inputs with the actual APInex baseline using
   [api_benchmark.py](api_benchmark.py). Quota exhaustion stops this comparison;
   missing or failed API outputs do not establish superiority.
7. Activate only after complete final acceptance, a strictly better measured
   result than the production API, production-prompt compatibility and an
   authorized usable inference endpoint. The experiment does not authorize
   replacing planner/reviewer calls with a composition-only model.

All final test answers stay local. If an experiment is changed after inspecting
a final benchmark, that benchmark is no longer untouched and cannot be reused
to establish final superiority.

## Limits

The synthetic set teaches eleven client-local operations in original fictional
fixtures. Passing it is not proof of live-game server automation. The closed
Luau harness executes real rendered handlers, but does not reproduce the Roblox
engine, permissions, remote server responses or actual glyph rendering.

The ordinary Full Hub preset may be served by the existing verified local
composer without any model call. Preserve that path. A new specialist is useful
only where generation is actually required and its tested behavior improves it.

Kaggle is used for private fitting and evaluation. There is currently no other
user-provided GPU host. A successful adapter alone is not a public inference
service; no tunnel from the training notebook is created for site visitors.

## Local checks

From `scriptrush-api`:

```powershell
node --experimental-strip-types --test experiments/specialist-v2/dataset/build-dataset.test.ts experiments/specialist-v2/evaluation.test.ts experiments/specialist-v2/runtime/runtime.test.ts
python experiments/specialist-v2/test_masked_loss.py
python experiments/specialist-v2/api_benchmark.py --self-test
```

These validate the experiment tools and reference fixtures. Only the separate
measured generation report can say whether the trained model succeeds.

Credentials enter non-echoing TTY prompts, stay in process memory and are never
included in notebook code, datasets, receipts, logs or repository files. Weights,
raw generations and downloaded evidence stay under ignored
`test-results/specialist-v2/`. `experiments` is excluded from Vercel deployments.
Generated production teaching/benchmark artifacts are also ignored locally.
The Kaggle control and log helpers accept `--stage utility|production|dev-inference|inference`,
with separate fixed input/output folders for each job. Use Python `-X utf8` on
Windows when retrieving SDK logs.

Generation uses explicit CUDA FP16 autocast, matching the precision used while
fitting. The frozen vocabulary head is FP16 and stabilized norms are FP32; without
autocast, generation can fail with a matrix dtype mismatch even when training
works. A two-token generation smoke test now runs before fitting. A private
[development-only retry](inference/README-dev-retry.md) can test the recovered
adapter without repeating training or exposing any final test inputs. Generated
files use explicit LF newlines so manifest hashes match their actual bytes on
Windows as well as Linux.

## Primary references

- [Qwen2.5-Coder-7B-Instruct model card](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct)
- [Qwen2.5-Coder family](https://qwenlm.github.io/blog/qwen2.5-coder-family/)
- [PEFT quantization guide](https://huggingface.co/docs/peft/developer_guides/quantization)
- [bitsandbytes 0.45.5 release](https://github.com/bitsandbytes-foundation/bitsandbytes/releases/tag/0.45.5)
- [Kaggle notebook documentation](https://www.kaggle.com/docs/notebooks)
- [Kaggle terms](https://www.kaggle.com/terms)
