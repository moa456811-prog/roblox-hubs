# Optional fast DEV experiment

This is an **unmeasured, private batch experiment**, not a serving deployment. It
uses the completed production continuation's exact adapter bytes and the same
four frozen production DEV prompts. No final test prompts or expected answers
are packaged. `productionPromotionEligible` remains false even if all four pass.

The profile is vLLM **0.9.2**, V0, XFormers **0.0.30**, unquantized **FP16**,
tensor parallelism across **two T4s**, eager execution and one active sequence.
The model and tokenizer are `Qwen/Qwen2.5-Coder-7B-Instruct`, revision
`c03e6d358207e414f1eca0bb1891e29f1db0e242`. The existing LoRA16 is loaded per
request: base uses no LoRA request, specialist uses the verified adapter.

vLLM's versioned [GPU installation instructions](https://docs.vllm.ai/en/v0.9.2/getting_started/installation/gpu.html)
support Python 3.9–3.12 and T4. Its [CUDA requirements](https://github.com/vllm-project/vllm/blob/v0.9.2/requirements/cuda.txt)
pin Torch 2.7.0 and XFormers 0.0.30. The latter has official
[CUDA 12.8 wheels](https://download.pytorch.org/whl/cu128/xformers/).
The isolated environment pins Python **3.12.11**, uv **0.7.20**, Torch
**2.7.0+cu128**, Triton **3.3.0**, Transformers **4.51.3**, and BitsAndBytes
**0.46.1**; the last package is installed for a fixed dependency profile but is
**not used for quantization**. Full pins are in `fast_runner.py`.

Metadata-only resolution with uv 0.7.20 succeeded for all **151 packages** on
Python 3.12.11 / Linux manylinux 2.28; this was not a runtime installation.
`--index-strategy unsafe-best-match` is explicit because uv's default first-index
selection found an empty `vllm` listing on the official PyTorch index and refused
the required version on PyPI. Only those two official indexes are used; core
versions remain fixed, and `--only-binary :all:` refuses source builds. Resolution
selected the CUDA 12.8 XFormers wheel (SHA256
`e2602a3f36c1d5c3aec7dc9f79050e3db5c1e94fc11ad929afbdb409c6d611d5`).
The ignored resolution evidence has SHA256
`3f2abe7c615becb51b33bfb6834c33b18db6c1b2038ec902cdfcb8f177bd37a2`.
Runtime exports the complete installed environment as `environment-freeze.txt`.

The Python environment and package cache live under `/tmp`, outside notebook
outputs. A target-only uv bootstrap creates the environment; it does not replace
Kaggle's system Torch. The notebook needs internet for these public packages and
the public model. No Hugging Face credential or account creation is requested.

The [Qwen2 implementation](https://github.com/vllm-project/vllm/blob/v0.9.2/vllm/model_executor/models/qwen2.py)
supports LoRA, and vLLM documents
[single-node tensor parallelism](https://docs.vllm.ai/en/v0.9.2/serving/distributed_serving.html).
Its [FP16 LoRA kernels](https://github.com/vllm-project/vllm/blob/v0.9.2/vllm/lora/ops/triton_ops/lora_expand_op.py)
do not force BF16. **SM75 remains experimental here:** Triton 3.3.0's
[documented support](https://github.com/triton-lang/triton/blob/v3.3.0/README.md#compatibility)
starts at compute capability 8.0, although its
[compiler retains a FMA fallback below SM80](https://github.com/triton-lang/triton/blob/v3.3.0/lib/Dialect/TritonGPU/Transforms/AccelerateMatmul.cpp#L262).
That makes a bounded smoke test plausible; it does not prove runtime compatibility.

The NF4 vLLM profile was rejected: the exact
[0.9.2 BitsAndBytes calculation](https://github.com/vllm-project/vllm/blob/v0.9.2/vllm/model_executor/layers/quantization/bitsandbytes.py#L292)
forces BF16 internally. Setting `dtype=float16` does not make that path FP16.
No vendor patch or silent quantization fallback is included.

For context, an analytical estimate is approximately **7.09 GiB of FP16 base
weights per T4**, plus **0.55 GiB of KV per T4** at 20,480 tokens, before LoRA,
activations, communication and runtime allocations. This is not measured memory.
The engine's actual memory profiling and smoke must pass. TP2 uses NCCL; disabling
custom all-reduce does not remove collectives.

After the source notebook is really **COMPLETE** and its output is downloaded:

```powershell
python -X utf8 experiments/specialist-v2/inference-fast/prepare.py --adapter-summary <download>/scriptrush-specialist-v2/training-summary.json
```

The helper reuses `prepare_completed_production_dev.build_bundle()`, including
the frozen retry script/manifest/receipt, completed fit summary, original recovery
lineage, exact adapter, four original DEV messages and current production sources.
It additionally checks the real `production-retry-accepted.json` for version 1,
notebook identity and unchanged script/metadata hashes. Existing preparations
are refused. New files would be written only to ignored
`test-results/specialist-v2/fast-dev-inference-run/` and its separate submission
manifest. **The helper does not submit anything.** Confirming remote COMPLETE
remains the caller's read-only check before submission; accepted alone is insufficient.

At runtime, both the base and real adapter must first produce up to two tokens
from a small diagnostic prompt. Only then do the eight untouched DEV generations
run. Inputs are verified against pinned tokenizer counts, capped at **16,384**
tokens, with **4,096** output tokens and a **20,480** total context. There is no
prompt truncation, response repair, structured-decoding constraint or retry.

Each request uses `LLMEngine.add_request`, `step` and `abort_request`, with deadline
checks before and after synchronous steps. A request that finishes after **240s**
still fails. A process-group supervisor handles stuck CUDA/NCCL calls with an
additional 30s grace, plus bounded startup, shutdown and total time; it terminates
the entire owned worker group even if the leader has exited. Partial output is
retained and cannot pass the EOS check.
An infrastructure exception such as OOM stops the remaining comparisons; a
measured request deadline remains a failed sample and may continue to the next
planned variant. Missing comparisons still fail the eight-output requirement.

Results preserve raw engine text and token IDs, EOS/finish reason, duration,
prompt/output hashes, model revision, adapter/summary hashes, source acceptance
hash/version and exact engine versions. No unknown monetary cost is invented.
Durations include the request's prefill and decode, but exclude installation,
model loading and smoke. Those setup phases have separate progress/timing evidence.

The earlier HF NF4 runner used **one T4 per request**, with independent requests
on the two GPUs. This profile uses **both T4s for one request** and changes base
arithmetic to FP16. A latency change cannot be attributed solely to vLLM or treated
as equal GPU cost. Rescore all four DEV outputs for functional behavior and exact
UI before considering any final benchmark. An EOS below 120s alone proves neither
functional correctness nor end-to-end site latency. A GPU serving host would
still be required for production.

Offline checks only:

```powershell
python -X utf8 -m unittest discover -s experiments/specialist-v2/inference-fast -p 'test_*.py' -v
```

These tests check lineage packaging, exact DEV membership, no uploaded labels,
raw output preservation, EOS/deadline failures, bounded process-group cleanup and
the isolated profile. They do not execute vLLM, a model or a GPU.
