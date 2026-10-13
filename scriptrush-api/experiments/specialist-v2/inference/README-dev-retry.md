# Utility development retry, inference only

The 96-step training adapter is retained. The original post-Trainer inference ran outside AMP after FP32 norm preparation and FP16 embedding/head conversion. A likely failure is a FP32 hidden-state / FP16 linear-head dtype mismatch. The independent runner now applies CUDA FP16 autocast to smoke forward, smoke generation and full generation; this is a diagnosis to confirm on GPU, not a quality result.

Prepare locally after downloading the completed utility adapter and its exact summary:

```sh
python experiments/specialist-v2/inference/prepare_dev_retry.py \
  --adapter-summary test-results/specialist-v2/kaggle-output/scriptrush-specialist-v2/training-summary.json
```

The command performs no GPU inference or submission. It reads only `pilot-dev.jsonl`, the frozen utility manifest/dev file, and the recovered adapter/summary. It verifies the frozen manifest and dev file hashes, checks the four original IDs `v2-dev-001`, `v2-dev-005`, `v2-dev-012`, `v2-dev-013`, and checks that each system/user pair exactly matches the frozen development source. Assistant messages and expected references stay local and are omitted. It refuses changed weights, summary lineage, step count, IDs or prompts. It counts prompts through the pinned tokenizer already in the local cache; it never fetches a tokenizer or truncates input.

Output is ignored `test-results/specialist-v2/dev-inference-run/{run.py,kernel-metadata.json}` and `dev-inference-submission-manifest.json`. These files preserve the original private utility notebook as their sole `kernel_sources` entry and pin full summary, training manifest and every adapter file SHA. Existing prepared runs are never overwritten. Root controls any later remote submission.

Each of the two independent T4 workers loads its own NF4 model and recovered adapter, with no DDP or Trainer. Before either worker generates a full developer case, both must pass a tiny forward plus cache-enabled two-token generation in both base and specialist modes. Smoke output text is not recorded or evaluated. Then the four developer inputs produce eight raw outputs, alternating base/specialist order within each worker. Full generation retains 16,384 input tokens, 4,096 new tokens, greedy decoding and the 240-second between-step HF deadline. The full generation ceiling is roughly 16 minutes across two GPUs, plus model/dependency load and short smoke. A final CUDA step can overrun the between-step deadline.

Cloud outputs are under `/kaggle/working/scriptrush-specialist-v2-dev-inference/`. `smoke-worker-*.json`, `predictions.jsonl`, `inference-summary.json` and optional `failure-worker-*.json` provide diagnostics. Errors contain a class, a fixed fault category and basename/function/line stack locations. They omit exception messages, source lines, local values, credentials and prompt text. Model predictions remain exact strings, with no repairs, canned replacements or retries.

```sh
python -m unittest discover -s experiments/specialist-v2/inference -p 'test_*.py'
```

These CPU-only tests use mocks and temporary files. They do not prove that the recovered adapter generates valid or functional hubs. Final/test cases and answers remain excluded from this retry.
