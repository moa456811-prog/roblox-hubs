# ScriptRush specialist experiment

This is a private offline LoRA pilot, separate from the public generation API. It adapts the pinned Apache-2.0 `Qwen/Qwen2.5-Coder-1.5B-Instruct` model to the application's existing hub composition format. The verified renderer produces the final self-contained Luau UI. This is a real weight adapter, not a renamed prompt, a model trained from scratch, or a replacement already deployed to visitors.

The original synthetic dataset contains 128 training, 16 validation and 24 held-out cases. Examples cover six to eight local working controls, multiple pages, exact design requirements, English functional text and absent/custom titles. See [dataset methodology](README-dataset.md) and [evaluation methodology](README-evaluation.md). No visitor prompts, private conversations or scraped scripts enter training.

## Reproduce

From `scriptrush-api`:

```powershell
node --experimental-strip-types experiments/specialist/build-dataset.ts
node --experimental-strip-types --test experiments/specialist/dataset/build-dataset.test.ts experiments/specialist/evaluation.test.ts
python experiments/specialist/prepare_kaggle.py
```

Install the Kaggle CLI in an isolated environment, then run `kaggle_remote.py` there. Enter the existing authorized Kaggle credential at its non-echoing prompt; it stays in process memory, not in argv, source, metadata, the notebook or a saved credential file. The helper first checks authentication and quota. Its JSON-line commands are `{"action":"push"}`, `{"action":"status"}`, `{"action":"output"}` and `{"action":"exit"}`. Push uses a private GPU script with a one-hour maximum. Remote work and downloaded artifacts live under ignored `test-results/specialist/`.

The notebook pins the base model revision and training libraries, retains the existing CUDA PyTorch, and runs LoRA for 16 optimizer steps with four-example gradient accumulation. It masks prompt labels, trains only on assistant completions, and excludes oversized examples completely rather than silently truncating their features. Test inputs contain only system/user messages; expected answers remain local. Validation loss does not select a checkpoint or alter held-out results in this first pilot.

After training, both variants use the same frozen base weights, tokenizer, exact prompts and greedy generation budget. The baseline disables the adapter; pair order alternates. Each generation has a 3,072-token and 100-second maximum. An output that stops without EOS is marked separately as a budget failure. No repair or reference answer is supplied during inference.

Download the output and evaluate only the selected pilot cases:

```powershell
node --experimental-strip-types experiments/specialist/evaluate.ts test-results/specialist/pilot-test.jsonl test-results/specialist/kaggle-output/scriptrush-specialist/predictions.jsonl test-results/specialist/report.json test-results/specialist/dataset/train.jsonl
```

Exact downloaded subdirectories are listed by the remote helper. The adapter's SHA256, losses, GPU, package versions, generation outputs and timings are recorded by the notebook. The private Kaggle experiment uses GPU notebook quota, not the Benchmarks API's credit allocation.

Run `python experiments/specialist/export_result.py` after evaluation to verify the paired outputs and adapter hashes, write [the measured results](RESULTS.md), and package only the adapter, tokenizer and evaluation evidence in the ignored local ZIP. It excludes credentials, raw logs and base-model weights.

## Interpretation

Six cases and 16 training steps are an initial experiment. The selected cases are all French requests for untitled hubs with English UI; they cover three design families and three action families. Custom titles and English requests exist in the full dataset but are not evaluated by this first subset. Passing compositions do not establish current real-game server behavior; this pilot uses fictional owned-game evidence and local client effects. The evaluator conservatively compares audited callback code; equivalent code may fail that check. Its known-word language guard is not a complete language classifier. UI structure and requested properties are checked statically, not visually rendered inside Roblox.

This compares one small base model with its adapter. It does not compare APInex/OpenRouter or prove that the specialist is suitable for arbitrary visitor requests. The public provider chain stays on its verified release. A production replacement requires a larger independent comparison and runtime validation on authorized game fixtures.
