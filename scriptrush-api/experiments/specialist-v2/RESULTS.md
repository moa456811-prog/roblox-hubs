# ScriptRush specialist v2 — measured status

Snapshot: **2026-10-13 04:03 UTC**. The specialist is **not activated on ScriptRush**. The corrected utility development harness accepts four of four specialist outputs versus zero of four base outputs. The base nevertheless passes 23 of 39 required feature instances after missing valid Roblox interfaces were added to the mock. These four development cases do not establish final Full Hub acceptance or superiority over the production API. The production-input continuation ended in ERROR after step 32 with a captured NCCL collective timeout. Its actual checkpoint-32 files were recovered and independently verified; no completed training summary was invented. The first production development inference attempt failed before loading the model and produced zero quality outputs. A private dataset transfer of the exact recovered weights is being prepared, with no upload completed at this snapshot. The corrected training runner separately completed its diagnostic on two T4s.

## Current experiments

| Experiment | Recorded state | What the result supports |
|---|---|---|
| Utility fit, `sciptrush/scriptrush-specialist-v2-1940b014` | Completed 96 optimizer steps on 256 training examples; recovered adapter and summary hashes verified. | Training completed and produced a recoverable adapter. |
| Original utility development generation | All eight attempted outputs, base/specialist on four inputs, ended in `RuntimeError`; no usable generated hubs. | **Invalid quality comparison**. This cannot establish either model's functional acceptance or relative quality. |
| Independent development retry, `sciptrush/scriptrush-v2-dev-inference-fe8cdef2` | Completed eight outputs on four inputs; all ended at EOS with no inference errors. Specialist: 4/4 functional and strict accepted; base: 0/4. | Measured improvement on these four utility development cases, including requested UI and runtime effects; ineligible for production promotion. |
| Production-input continuation, `sciptrush/scriptrush-v2-production-8af8851d` | ERROR after 32/32 optimizer steps and validation loss 0.0329914615 at step 32, improving from 0.0569468662 at step 16. Rank 1 timed out on NCCL ALLGATHER sequence 296 with timeout 1,800,000 ms. | Recorded training progress and recoverable checkpoint, not a successfully completed source job or production quality result. |
| Exact production checkpoint recovery, `probe-c5e2dcd5` | Recovery receipt `complete:true`; exact version-1 checkpoint-32 bytes and hashes retained. CPU audit confirms 392 finite tensors and 40,370,176 parameters. | The actual saved adapter is recoverable. No completed `training-summary.json` was fabricated. |
| First production DEV inference, `sciptrush/scriptrush-v2-production-dev-inference-bb807b39` | ERROR before model loading; `invalidKernelSources` for the errored source job and no resolved mounted checkpoint. Zero quality outputs; failed attempt preserved. | Infrastructure failure, not evidence of poor or successful model behavior. |
| Corrected pipeline smoke, `sciptrush/scriptrush-v2-pipeline-smoke-1751cdb7` | COMPLETE; one optimizer step, two T4s, 144/8/4 bundle unchanged, validated checkpoint 1, fitting receipts and adapter exported. All 392 adapter tensors (40,370,176 parameters) are finite; exported hashes match the receipt. | Real two-GPU pipeline validation. Explicitly diagnostic, with development generation skipped; no model-quality or promotion evidence. |
| Private checkpoint dataset transfer | Preparation in progress for mounting the exact recovered weights; not uploaded yet. | A recovery route without retraining, not a completed mount, inference result or hosted endpoint. |

The generation correction uses explicit CUDA FP16 autocast with FP32 stabilized norms and the FP16 vocabulary head. The new continuation also performs a two-token smoke **before training**. The original failure remains a generation/pipeline failure; its eight errors are retained rather than counted as evidence of poor learned behavior. No fallback reference answer or repaired synthetic output replaces a model error.

Captured logs now establish the distributed failure: rank 1's ALLGATHER sequence 296 timed out after 1,800,072 ms, followed by rank 0's sequence 297 timeout and `DISTRIBUTED_WORKER_FAILED`. The checkpoint-path race in the pinned [Transformers Trainer source](https://github.com/huggingface/transformers/blob/v4.51.3/src/transformers/trainer.py#L2909) remains the diagnosis consistent with this rank desynchronization, rather than a proven full Python stack for the original race. The corrected runner synchronizes all ranks after checkpoint saving and reconstructs the same validated best checkpoint path. Eight offline tests cover the race, preservation of an earlier better checkpoint, atomic fitting receipts and diagnostic-only development skipping. The real two-GPU smoke completed with fitting receipt SHA-256 `565816632f04ae774e49e674a9b1dbfa2b0109ad4d4ee1e2fd69c9dbdd1025fb` and frozen script SHA-256 `1b6a6bc04b7e7f405017f6caeeff796545f384f55a51ecb81a9c1fc460281144`. Its validation loss is not a quality gate. The original submitted production script and failure log are preserved unchanged.

The earlier running-job probe returned 404; after the source job ended in ERROR, `probe-c5e2dcd5` recovered the mandatory files from exact checkpoint 32 and recorded `complete:true` with `artifactKind:"recovered-checkpoint"`. The independent byte/finite-tensor proof is `production-kaggle-output/scriptrush-specialist-v2/training/checkpoint-32/local-byte-audit.json`. No cancellation was requested, no fitting-completion receipt was inferred from these weights, and no `training-summary.json` was fabricated. The first production DEV notebook could not mount that errored kernel source and failed in checkpoint resolution before model loading. Its zero outputs are retained as an infrastructure failure. Preparing a private dataset containing the same hash-verified weights avoids repeating training; preparation is not an upload or a successful inference run.

## Measured utility development comparison

**Baseline audit resolved:** the initial mock omitted valid service aliases such as `game.Players.LocalPlayer`, child indexing on Workspace and the vector/vector overload of `CFrame.new`. The corrected mock implements those APIs; expected functional/UI assertions are unchanged. The initial 29 base feature failures unfairly included mock exceptions and are superseded by the corrected counts below. No runtime exceptions remain in the corrected report. The original report is preserved as `dev-inference-report-initial-mock.json`, and the correction is recorded in `dev-inference-mock-correction.json`. The same eight raw outputs were rescored without model inference or data changes; their file SHA-256 remains `b1c9b02133d23be28b1e9f134074ca739e7604967b7004a0083aa554b3479449`.

The actual evaluator CLI scored the retry against the original 256 training rows. `dev-inference-report.json` records clean leakage checks, four paired cases, four specialist wins and no missing outputs or inference errors.

| Variant | EOS completions | Functional acceptance | Strict acceptance | Feature instances passed | Median generation latency | p95 generation latency |
|---|---:|---:|---:|---:|---:|---:|
| Base 7B | 4/4 | 0/4 | 0/4 | 23/39 | 192,499.390 ms | 239,898.430 ms |
| Specialist utility adapter | 4/4 | 4/4 | 4/4 | 39/39 | 149,622.1355 ms | 190,267.582 ms |

All 39 required specialist feature instances were assessed and passed, with schema, coverage, requested UI and functional runtime checks satisfied. The base had 23 assessed feature instances pass, six fail and ten unassessed because `v2-dev-005` failed the camera-control schema. Its remaining failures are live currency reads in `v2-dev-001`/`013`, and currency, highlight color/off/cleanup and HUD restoration in `v2-dev-012`. Unassessed instances remain in the complete-case denominator. This is a four-case **development** result. The evaluator reports `superiority-not-established` and promotion `eligible: false`: untouched final cases and the production API comparison are still missing. No final or API quality result is inferred from this improvement.

## Model and fitting configuration

Base: `Qwen/Qwen2.5-Coder-7B-Instruct`, revision `c03e6d358207e414f1eca0bb1891e29f1db0e242`. The [publisher's pinned model card](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/tree/c03e6d358207e414f1eca0bb1891e29f1db0e242) identifies an instruction-tuned code model under Apache-2.0. It was selected as a larger code-capable candidate than the prior 1.5B experiment, with a compatible quantized training path. This choice does not assert measured superiority over GLM, APInex or another untested model.

- QLoRA NF4, double quantization, FP16 compute, SDPA; LoRA rank 16 / alpha 32 / dropout 0.05 on attention q/k/v/o and MLP gate/up/down projections; 40,370,176 trainable parameters.
- Seed 39107; effective batch four. Initial run used two Tesla T4s, per-device batch one and two accumulation steps. It completed 1.5 training epochs in 2,758.79 fitting seconds; rank-zero CUDA peak allocation was 10.163 GiB.
- Recorded environment: Torch `2.11.0+cu128`, Transformers `4.51.3`, PEFT `0.15.2`, Accelerate `1.6.0`, bitsandbytes `0.45.5`.
- Initial mean training loss: `0.010784961577087415`. Best validation loss: `0.000015270410585799254`, measured on **eight of the 24 validation examples** and selected at step 96.
- Continuation: learning rate `3e-5`, 32 steps, validation/checkpoint interval 16, maximum context 8,192, assistant-only vocabulary-head projection. Largest complete production teaching example: 6,542 tokens; none is truncated.

Loss uses shifted assistant-only token cross-entropy. Independent numerical tests match both values and gradients against full masked CE, including the sliced vocabulary-head path. Original validation prompts and complete answers have no exact training overlap. The very low loss concerns repeated structured UI/code patterns under teacher forcing; it does **not** prove complete autoregressive outputs, correct gameplay, a general game analyst or superior live-site results.

## Artifact lineage and frozen comparisons

Raw SHA-256 values below were checked against local artifact bytes. Windows CRLF serialization in an **unsubmitted** production preparation was identified and archived under `test-results/specialist-v2/preflight-crlf/`. The current preparation writes LF and its actual bytes match its receipts.

| Artifact | SHA-256 |
|---|---|
| Original utility dataset manifest | `73dab1baacae753eb01c1b6dd41033b0bc84d3220f54c7b8cca213e581cef053` |
| Recovered utility adapter weights | `ec19098c446619b5035452409f1f4bac3ec24eacde42f5fc5e8ce66c734e6afb` |
| Recovered utility adapter configuration | `966c66475ebea9114e7ea3e3b257e177ff9fbcaa600741d2bae08a822273c51c` |
| Recovered utility training summary | `0adebdde8bfb996594dafadbd3ca1d391fe44c27c905423b6a13981871dfc45c` |
| Production continuation dataset manifest | `1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca` |
| Production continuation script | `39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9` |
| Recovered production checkpoint-32 weights | `f4444faa252a120bbd8e39e702294faa4079ca1237cee2c7006cf6abfe6e826d` |
| Recovered production checkpoint-32 configuration | `38da868a30f3108dd74030f9079284e09461c5d74b377668f3b37ad392cf2183` |
| Recovered production checkpoint-32 trainer state | `d45bad1c48a1e0edec2d684cf8e7076789adeb17efddfd65996db825af21b85c` |
| Frozen 12-case utility inference input | `59e1d9a94339bb26c9c9f60947ec6a4be11272066c0cc98814d19fbbebc2a3f3` |
| Frozen eight-case production prompts | `4a10d44d63fbc01e3378d6bf1c61eb3ad394bc3aeb3d311ac1503349d9ceeba8` |
| Frozen eight-case production references | `051f02ce84fb3f0624d8d6478694a9c45b14c22bf261e012f5f2699fce619780` |
| Captured production API parameter receipt | `bf7949b664a569bc05738424f728710dc2833b51144a0f8c48d8660418984aca` |

The continuation's mounted source is the completed private utility notebook. Its loader requires exactly one matching summary and verifies every listed adapter file, base revision and initial dataset lineage before loading trainable weights. Development uploads contain only `system,user` messages; their assistant references remain local. Training/validation uploads contain only admitted teaching messages. The production bundle contains 144 training, eight validation and four development records, with no final IDs or final user/assistant messages. No final answer is included in a model prompt.

The frozen final comparison is separate: 12 synthetic utility cases plus eight new production-composer cases. The production cases use actual captured `HUB_COMPOSER_SYSTEM`/provider formatting, freeform French/English requests, unnamed/custom titles and varied exact UI. Every one requires all four admitted Blox Fruits actions plus utilities and lifecycle. The 48/8/4 production teaching set has different designs and page/action grouping families; its prompts and answers do not overlap the frozen test records. Final inputs have not yet been used for model-quality selection in this snapshot.

The production API comparison now follows the actual site writer's captured budget: maximum 14,000 output tokens, temperature 0.1, JSON mode and a 120-second timeout. The offline sidecar verifies those parameters for all eight frozen prompts and the same twelve source hashes; no API call has been made. Utility API comparisons retain the controlled 4,096-token cap, temperature 0 and 240-second timeout. The production specialist/base candidate still uses 4,096 tokens and greedy decoding with 240 seconds, so production latency and decoding budgets are not controlled across variants. The API's larger token cap does not require it to produce a long response.

## Verification already completed

These counts are **tooling regression tests**, not generated-model success rates:

| Suite | Last reported passing tests | Scope |
|---|---:|---|
| Node experiment/evaluator/runtime suites | 68 | Root rerun at 04:02 UTC: schema, coverage, exact UI, full denominators, negative mutations, closed Luau execution and production writer parameter capture. |
| Inference helpers | 42 | Latest reported passing set: input/lineage restrictions, bundles, limits and development/final separation. Additional transport-hardening tests are still being checked; no later result is claimed here. |
| Staged serving contract | 21 | Mocked authentication, artifact validation, bounds, concurrency and fixed error handling. |
| Masked-loss numerical tests | 4 | CE values/gradients and assistant-head slicing alignment. |
| API benchmark helper | 17 | Offline provenance, production-prompt/parameter admission, utility settings unchanged, bounded requests and quota stop; no API quality result. |
| Training recovery helpers | 8 | Rank convergence, best checkpoint selection and durable fitting receipts; offline only. |
| Checkpoint download probe | 7 | Fixed owned source, bounded downloads, safe redirects and incomplete-file rejection; offline only. |
| Pipeline smoke preparer | 5 | Frozen source and bundle admission, no final/DEV labels, raw LF hashing and no replacement of prior runs. |

TypeScript checking passed the root rerun at 04:02 UTC. Suite counts can overlap and must not be summed into a model success rate. Separately, eight authored production references and all 60 production teaching references passed the parameterized runtime. Those results validate reference implementations and harness behavior; **they are not model generations**. Decorative/no-op callbacks, wrong dispatch, missing controls, altered requested UI and lexical sandbox access are rejected. Internal IDs, auxiliary text bindings and unrequested descriptions do not substitute for effects or create extra UI requirements.

## Required before activation

1. Mount the exact recovered production checkpoint through the prepared private dataset transfer, then complete and score its four independent production development cases without retraining. The failed first attempt supplies no quality evidence. The utility retry is already scored; development reports remain ineligible for promotion even at four accepted hubs.
2. Evaluate untouched final inputs with complete base/specialist outputs, confirmed completion and unchanged gates; compare the same prompts against the current production API. Retain missing outputs, errors and decode-budget failures in their denominators.
3. Establish specialist improvement on the measured production task, then validate an authorized deployable GPU endpoint and composer-only integration. The planner, semantic reviewer and existing-script correction paths need separate evidence before any custom routing.

The utility fixtures cover 11 local primitives, not general farming/quest support. Production gameplay currently tests only the admitted, source-backed Blox Fruits controller in closed mocks; neither this library nor a passing mock certifies live server behavior, physics reachability, visual rendering or anti-cheat compatibility. The writer benchmark supplies a reference planner inventory and does not evaluate real planner/reviewer quality. English detection includes finite known-label checks and exact requested texts, not a complete language classifier.

No qualified hosted GPU endpoint is currently available. Serving files are staged and tested with mocks; weights have not been served to ScriptRush. Kaggle remains a private bounded batch environment, not the site's public API. Production routing and activation have not changed in this experiment.

Reproducibility records are under `test-results/specialist-v2/`: `submission-manifest.json`, `kaggle-output/.../training-summary.json`, `dev-inference-submission-manifest.json`, `dev-inference-report.json`, `dev-inference-report-initial-mock.json`, `dev-inference-mock-correction.json`, `production-submission-manifest.json`, `production-dataset/manifest.json`, `production-checkpoint-recovery/probe-c5e2dcd5/recovery-receipt.json`, `production-kaggle-output/.../checkpoint-32/local-byte-audit.json`, the preserved `production-dev-inference-kaggle-output/` failure, `production-api-parameters.json` and `final-selection.json`. Commands and gate definitions are documented in `README-evaluation.md`, `production/README.md`, `production/train/README.md`, `README-api-benchmark.md` and `serving/README.md`. No credential, raw generated script or full job log belongs in this report.
