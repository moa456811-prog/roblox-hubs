# ScriptRush specialist v2 — measured status

Snapshot: **2026-10-13 03:01 UTC**. The specialist is **not activated on ScriptRush**. Model superiority and final Full Hub acceptance have not been established. Two private Kaggle jobs are in progress; running jobs and successful smoke tests are not completed quality benchmarks.

## Current experiments

| Experiment | Recorded state | What the result supports |
|---|---|---|
| Utility fit, `sciptrush/scriptrush-specialist-v2-1940b014` | Completed 96 optimizer steps on 256 training examples; recovered adapter and summary hashes verified. | Training completed and produced a recoverable adapter. |
| Original utility development generation | All eight attempted outputs, base/specialist on four inputs, ended in `RuntimeError`; no usable generated hubs. | **Invalid quality comparison**. This cannot establish either model's functional acceptance or relative quality. |
| Independent development retry, `sciptrush/scriptrush-v2-dev-inference-fe8cdef2` | Latest coordinator-reported progress: two-token smoke passed for base and specialist on two T4s at about 197 seconds; eight full outputs still pending. | Corrected generation can produce smoke tokens. Full outputs still require decoding, schema/UI/coverage and runtime evaluation. |
| Production-input continuation, `sciptrush/scriptrush-v2-production-8af8851d` | Submitted and running; resumes the verified utility adapter. Configured for 32 steps on 48 production references plus 96 utility rehearsal examples. | No completed fitting or model-quality result yet. |

The generation correction uses explicit CUDA FP16 autocast with FP32 stabilized norms and the FP16 vocabulary head. The new continuation also performs a two-token smoke **before training**. The original failure remains a generation/pipeline failure; its eight errors are retained rather than counted as evidence of poor learned behavior. No fallback reference answer or repaired synthetic output replaces a model error.

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
| Recovered adapter weights | `ec19098c446619b5035452409f1f4bac3ec24eacde42f5fc5e8ce66c734e6afb` |
| Recovered adapter configuration | `966c66475ebea9114e7ea3e3b257e177ff9fbcaa600741d2bae08a822273c51c` |
| Recovered training summary | `0adebdde8bfb996594dafadbd3ca1d391fe44c27c905423b6a13981871dfc45c` |
| Production continuation dataset manifest | `1ff9b06300ada84a1be8576278b053ecd3f9d508bc6c5add8eb8e214e9a9a3ca` |
| Production continuation script | `39f4236f26f373c4d10aabeee1feb860ea6cb167f385c8de209ffd0c996a2bd9` |
| Frozen 12-case utility inference input | `59e1d9a94339bb26c9c9f60947ec6a4be11272066c0cc98814d19fbbebc2a3f3` |
| Frozen eight-case production prompts | `4a10d44d63fbc01e3378d6bf1c61eb3ad394bc3aeb3d311ac1503349d9ceeba8` |
| Frozen eight-case production references | `051f02ce84fb3f0624d8d6478694a9c45b14c22bf261e012f5f2699fce619780` |

The continuation's mounted source is the completed private utility notebook. Its loader requires exactly one matching summary and verifies every listed adapter file, base revision and initial dataset lineage before loading trainable weights. Development uploads contain only `system,user` messages; their assistant references remain local. Training/validation uploads contain only admitted teaching messages. The production bundle contains 144 training, eight validation and four development records, with no final IDs or final user/assistant messages. No final answer is included in a model prompt.

The frozen final comparison is separate: 12 synthetic utility cases plus eight new production-composer cases. The production cases use actual captured `HUB_COMPOSER_SYSTEM`/provider formatting, freeform French/English requests, unnamed/custom titles and varied exact UI. Every one requires all four admitted Blox Fruits actions plus utilities and lifecycle. The 48/8/4 production teaching set has different designs and page/action grouping families; its prompts and answers do not overlap the frozen test records. Final inputs have not yet been used for model-quality selection in this snapshot.

## Verification already completed

These counts are **tooling regression tests**, not generated-model success rates:

| Suite | Last reported passing tests | Scope |
|---|---:|---|
| Node experiment/evaluator/runtime suites | 61 | Schema, coverage, exact UI, full denominators, negative mutations and closed Luau execution. |
| Inference helpers | 22 | Input/lineage restrictions, bundles, limits and development/final separation. |
| Staged serving contract | 21 | Mocked authentication, artifact validation, bounds, concurrency and fixed error handling. |
| Masked-loss numerical tests | 4 | CE values/gradients and assistant-head slicing alignment. |
| API benchmark helper | 15 | Offline preparation/provenance and production-prompt admission; no API quality result. |

TypeScript checking passes. Separately, eight authored production references and all 60 production teaching references passed the parameterized runtime. Those results validate reference implementations and harness behavior; **they are not model generations**. Decorative/no-op callbacks, wrong dispatch, missing controls, altered requested UI and lexical sandbox access are rejected. Internal IDs, auxiliary text bindings and unrequested descriptions do not substitute for effects or create extra UI requirements.

## Required before activation

1. Recover and score the corrected development outputs, then the production continuation's four development cases. Development reports remain ineligible for promotion even at four accepted hubs.
2. Evaluate untouched final inputs with complete base/specialist outputs, confirmed completion and unchanged gates; compare the same prompts against the current production API. Retain missing outputs, errors and decode-budget failures in their denominators.
3. Establish specialist improvement on the measured production task, then validate an authorized deployable GPU endpoint and composer-only integration. The planner, semantic reviewer and existing-script correction paths need separate evidence before any custom routing.

The utility fixtures cover 11 local primitives, not general farming/quest support. Production gameplay currently tests only the admitted, source-backed Blox Fruits controller in closed mocks; neither this library nor a passing mock certifies live server behavior, physics reachability, visual rendering or anti-cheat compatibility. The writer benchmark supplies a reference planner inventory and does not evaluate real planner/reviewer quality. English detection includes finite known-label checks and exact requested texts, not a complete language classifier.

No qualified hosted GPU endpoint is currently available. Serving files are staged and tested with mocks; weights have not been served to ScriptRush. Kaggle remains a private bounded batch environment, not the site's public API. Production routing and activation have not changed in this experiment.

Reproducibility records are under `test-results/specialist-v2/`: `submission-manifest.json`, `kaggle-output/.../training-summary.json`, `dev-inference-submission-manifest.json`, `production-submission-manifest.json`, `production-dataset/manifest.json` and `final-selection.json`. Commands and gate definitions are documented in `README-evaluation.md`, `production/README.md`, `production/train/README.md`, `README-api-benchmark.md` and `serving/README.md`. No credential, raw generated script or full job log belongs in this report.
