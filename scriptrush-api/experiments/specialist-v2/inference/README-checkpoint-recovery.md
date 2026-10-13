# Exact production checkpoint probe

This helper performs only read-only download requests for the owned notebook `sciptrush/scriptrush-v2-production-8af8851d`, version 1, checkpoint 32. It does not cancel, submit or infer a session ID. A running notebook's file listing can be empty; this probe tests the separate SDK `DownloadKernelOutput` operation with an exact version and fixed file paths. Success while running is not assumed.

```powershell
test-results/specialist/kaggle-env/Scripts/python.exe experiments/specialist-v2/inference/probe_checkpoint.py
```

The credential enters through a non-echoing TTY and stays in the SDK client process memory. It is never placed in environment variables, arguments, source or a credential file. Authenticated API requests refuse redirects. An allowed HTTPS storage redirect is fetched through a separate anonymous session, with no API credentials or cookies. URLs, headers, provider response bodies and exception strings are not logged.

The helper verifies the frozen local submission receipt, source script and training manifest before contacting Kaggle. It requests `trainer_state.json`, `adapter_config.json`, `adapter_model.safetensors`, then optional `README.md` from the exact `scriptrush-specialist-v2/training/checkpoint-32/` path. Downloads are bounded to 200 MiB total, with 2 MiB metadata limits. A required unavailable file stops the probe immediately; no retry or alternative source is attempted. Partial downloads remain unpromoted and are removed.

Ignored `test-results/specialist-v2/production-checkpoint-recovery/probe-*/recovery-receipt.json` records exact file hashes, raw source lineage and the observed checkpoint/validation state. `complete:true` requires all mandatory files, global and best step 32, selected checkpoint 32, best validation loss near `0.03299146145582199` with a matching evaluation at step 32 in the raw log history, the pinned LoRA base/revision, and consistent safetensors tensor ranges and payload size. The original files are retained byte for byte. Tensor finiteness remains a separate CPU check. This is a **recovered-checkpoint** receipt; no `training-summary.json` is invented and it does not claim that the source job completed successfully.

Cancellation remains separate. The SDK cancellation request requires a real `kernel_session_id`; public GetStatus/GetKernel/SaveKernel responses do not provide this identity in the installed SDK. A version number or kernel ID is not assumed to be a cancellable session ID. The absence of output files does not establish that stopping the source job will preserve its filesystem. Confirm actual recovered files before considering cancellation.

```powershell
python -m unittest discover -s experiments/specialist-v2/inference -p test_probe_checkpoint.py
```

Tests are offline and use temporary files/fake HTTP responses. They cover source pinning, byte preservation, unavailable-file stop, unsafe redirects, download bounds and malformed/truncated checkpoints. No authenticated probe has been executed by the helper author.

## Production DEV inference from a recovered checkpoint

Only after real recovery produced a valid `complete:true` receipt, prepare the independent inference job:

```powershell
python experiments/specialist-v2/inference/prepare_production_dev_retry.py --recovery-receipt <actual-recovery-receipt.json>
```

This reads the four frozen `production-teach-dev-001` through `004` prompts from the production teaching DEV split. It verifies that file and its frozen manifest, removes assistant/reference fields, and never reads final test or final production prompts. It embeds the exact nonsecret recovery receipt, its SHA, raw trainer-state SHA and all adapter hashes, with the original source script/submission/training-manifest lineage. The remote loader independently checks the mounted checkpoint bytes and selection state. It never creates a training summary or treats a failed source run as completed.

The output is ignored `production-dev-inference-run/{run.py,kernel-metadata.json}` plus `production-dev-inference-submission-manifest.json`; existing prepared files are preserved. The [official metadata contract](https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels_metadata.md) documents `kernel_sources` as `username/kernel-slug`; it does not establish that a `/version` suffix is accepted by the backend. Metadata therefore uses the exact original private slug, whose first run is the recovered source, and retains version 1 as provenance in the receipt. Exact mounted checkpoint hashes remain mandatory; another version with different artifacts is rejected. Root controls any remote submission with the `production-dev-inference` stage. The runner first clears two-token base/adapted smoke on both independent T4 workers, then produces exactly eight raw paired outputs with the benchmark's AMP/dtype/greedy/context/output/time settings. Remote results are under `/kaggle/working/scriptrush-v2-production-dev-inference/` and carry `artifactKind:"recovered-checkpoint"` plus checkpoint provenance. This DEV-only job cannot qualify deployment or substitute for the untouched final comparison.

## Final recovered-checkpoint inference support

`prepare_final_recovered.py` is a separate preparer, intended to be run by root only after all four production DEV cases pass. Merely importing it performs no file reads or preparation. The support was tested with fake local fixtures; no real final input was opened or bundled while implementing it.

```powershell
python experiments/specialist-v2/inference/prepare_final_recovered.py --recovery-receipt <actual-recovery-receipt.json> --test-inputs <frozen-twelve-utility-prompts.jsonl> --production-inputs <frozen-eight-production-prompts.jsonl>
```

It first verifies the real recovered checkpoint and its source lineage. Only then does it read input files, requiring exact raw SHA256 values `59e1d9a94339bb26c9c9f60947ec6a4be11272066c0cc98814d19fbbebc2a3f3` for utility and `4a10d44d63fbc01e3378d6bf1c61eb3ad394bc3aeb3d311ac1503349d9ceeba8` for production. Each accepted row supplies only `id/messages` and optionally checked benign metadata; assistant messages, reference answers and unexpected fields are rejected. Exactly 12 utility plus 8 production cases are required. Tokenizer measurement uses the pinned local cache with no silent truncation.

The `final-recovered-checkpoint` mode retains the same raw recovered receipt/state/adapter/source pins and never invents a training summary. It writes ignored `final-recovered-inference-run` and `final-recovered-inference-submission-manifest.json`, with source and input provenance and 40 expected base/adapted outputs. Root controls submission through the `final-recovered-inference` stage. Outputs are under `/kaggle/working/scriptrush-v2-final-recovered-inference/`. Both workers clear their small smoke before full inference; the worst-case generation allowance is roughly 80 minutes across two T4s, plus startup and the between-step deadline limitation. The script does not evaluate or promote any model; actual final results and the current production API comparison remain necessary.

## Private dataset transport for an errored source notebook

Kaggle can reject an errored notebook in `kernel_sources` even when its checkpoint files were recovered successfully. Both preparers therefore accept optional `--checkpoint-dataset-receipt <actual-ready-transport.json>`. This is a separate transport receipt produced after the exact recovered files were uploaded to the owner's private dataset and its identity, private access, version 1, ready state and file listing were confirmed. Unknown/pending status, incomplete upload proof, another owner/version, extra fields and any source/probe/state/file-hash divergence are rejected. The transport changes neither the original failed source provenance nor the recovered artifact kind.

With this argument, metadata uses exactly one `dataset_sources` entry and an empty `kernel_sources` list. The DEV preparer writes the separate `production-dev-dataset-inference-run`, receipt and `production-dev-dataset-inference` control stage, preserving earlier source-based DEV runs. The final preparer retains its final stage and receives the same transport argument only after production DEV passes.

Generated DEV identities use the short `scriptrush-v2-prod-dev-<8hex>` slug and matching title. Both DEV and final preparers refuse a slug or title longer than 50 characters, a wrong owner or a title/slug mismatch before writing submission files. This local guard follows the observed Kaggle rejection of the previous 55-character DEV identity; output folder and control-stage names can remain descriptive.

The runtime admits already unpacked `training/checkpoint-32` files or normalizes an exact bare `checkpoint-32` directory into its working output. If Kaggle instead mounts `training.zip`, it verifies all four declared files and their sizes/hashes before bounded extraction to `checkpoint-dataset-extracted/training/checkpoint-32`. It never calls `extractall`; traversal, symlink, duplicate, unknown, oversized or changed archive entries fail. The total declared payload stays within 200 MiB and at most eight archive candidates are inspected. The original checkpoint finder and state checks then validate the normalized files. This transport receipt proves artifact delivery only and cannot imply model qualification or successful completion of the failed training notebook.
