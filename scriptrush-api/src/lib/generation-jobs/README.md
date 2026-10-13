# Private generation jobs V2

Opt-in extension of the existing API. The legacy generation routes and provider are unchanged. No database schema or deployment has been applied.

## Configuration after approval

`SCRIPTRUSH_KNOWLEDGE_V2_ENABLED=true` enables `/api/v2/*`; absent/other values return 404. It does not enable the frontend automatically.

Choose a durable backend explicitly:

- Dedicated Node host/local demo: `SCRIPTRUSH_GENERATION_STORE=filesystem` and `SCRIPTRUSH_GENERATION_DIRECTORY=<absolute private persistent directory>`. Files are immutable JSON revisions with exclusive hard-link CAS; temporary writes are flushed before commit. The volume must support hard links. This backend is refused when `VERCEL` is set because Vercel's function filesystem cannot provide durable job storage.
- Vercel or another distributed host: `SCRIPTRUSH_GENERATION_STORE=supabase`, `SCRIPTRUSH_GENERATION_SUPABASE_URL=https://<project>.supabase.co`, `SCRIPTRUSH_GENERATION_SUPABASE_SERVICE_KEY=<server credential>`. Review `prepare-supabase.sql` and apply the schema only after approval. Never put the service key in a `NEXT_PUBLIC_*` variable. RLS is enabled and forced, no public policies exist, and table permissions are revoked from `anon`/`authenticated`. Backend CAS uses a single filtered PATCH on both job ID and expected revision. Existing database policies have not been inspected or changed; a real project requires schema/security advisors and a private integration test before deployment.

With no configured durable backend, job creation returns `503 DURABLE_GENERATION_STORE_REQUIRED`. There is no silent in-memory fallback. `MemoryGenerationStore` exists only for tests/demos. This implementation does not create accounts, provision storage or enable paid services.

Optional trusted server binaries: `SCRIPTRUSH_LUAU_COMPILER` and `SCRIPTRUSH_PROJECT_MOCK_RUNNER`. Missing binaries leave compilation `not_checked` and simulated/game tests `not_run`. The mock runner must return an executed, hash-bound assertion report; it is never selected from a request or retrieved repository.

## API and ownership

`POST /api/v2/generations` accepts `{request, game?:{url?,placeId?,query?}, role, intent?:"generate"|"patch", files?:[{path,content}], allowModelProcessing:boolean}`. No `.rbxl` is required. Runtime roles are `project_client`, `project_server`, `executor_client`. It returns `{jobId,capability,job}` once. The random capability contains 256 bits; only its SHA256 is persisted. Keep the capability private and send it in `Authorization: Bearer <capability>` on every job route. Never put it in a URL/log or share it with a model.

Capabilities authorize possession of one job, rather than identifying a signed-in account. Losing a capability loses access; account recovery/sharing/revocation and retention controls remain future work. Production opt-in needs appropriate account/rate-limit policy. Creation is not a claim of account ownership or an unlimited public inference budget.

| Route | Result |
| --- | --- |
| `POST /api/v2/games/resolve {placeIdOrUrl}` or GET with `?placeIdOrUrl=` | Public identity, source provenance and explicit unknowns |
| `POST /api/v2/knowledge/query {request,role}` or GET | Versioned, role-filtered retrieval; no model call |
| `GET /api/v2/generations/:id` or `/status` | `{job}`; no capability hash, blobs, lease or operations |
| `POST /:id/advance {idempotencyKey}` | Execute one actual stage, return `{job}` |
| `POST /:id/resume {idempotencyKey}` | Same operation for interrupted/failed work; use a fresh key |
| `GET /:id/files?snapshotId=&compareTo=` | Authorized complete files, SHA256 manifest and optional textual diff |
| `POST /:id/abort` | Fence the current lease, cancel a same-process handler, retain work |
| `POST /:id/rollback {snapshotId,idempotencyKey}` | Select the exact preserved snapshot and schedule new validation |
| `POST /:id/feedback {kind:"worked"|"failed"|"issue",artifactSha256,message?,featureId?}` | Feedback bound to snapshot+manifest; always self-reported |

All responses use private/no-store caching. Unknown/unauthorized jobs return the same 404. Artifacts are persisted outside chat and served only through the authorized files route; no public storage links are produced.

## Execution, retry and proof rules

Stages are `discovery → retrieval → planning → generation → validation → ready`. Pending/running/completed/failed values come from operations that actually start or finish. Public metadata proves identity only. Catalogue candidates and recipes do not prove game mechanics.

Each `advance` claims a lease via revision CAS before performing work. Concurrent claims fail, completed idempotency keys replay without repeating work, and failed/abandoned keys cannot silently issue another request. A new key can retry the same stage, with at most three attempts per stage and two logical generation operations per job. Leases expire after the stage deadline plus five seconds; a new service process can resume the same stage after expiry. Late old workers cannot commit because their lease owner/revision has changed. An abort cannot guarantee that a different process or an external provider immediately stops billing, but it always prevents the abandoned result from replacing artifacts.

Default deadline is 125 seconds per stage, with the model receiving at most 120 seconds. The existing provider can perform up to two transport requests per logical generation operation (fallback/capacity recovery), so the current maximum is four provider requests per job. Transport attempts are not token/cost estimates. No paid model requests were executed for these job tests; monetary cost and real-model latency are unmeasured. Stage timestamps and available provider attempt counts are recorded. API JSON input is bounded to 900 KB, project content to 600 KB/16 files, durable documents to 8 MB, operation keys to 64, snapshots to 12, and feedback records to 24.

Snapshots preserve original uploads and generated/targeted patched versions. SHA256 is checked for both the manifest and every blob before returning files or rollback. Rollback invalidates compilation/mock status and runs checks against the selected bytes again. Feedback remains attached to its original version.

The public verification level is `DRAFT`, `SYNTAX_PASSED`, `MOCK_PASSED` or `REPORTED_GAME_PASS`. No live runner is connected, so `OBSERVED_GAME_PASS` is never emitted. A pass requires an executed operation and evidence. Feedback does not change `inGameTests.executed` or certify game functionality. No 100% claim is made.

## Local verification and limits

Run `node --experimental-strip-types --test tests/generation-jobs*.test.ts` and `npx tsc --noEmit` from `scriptrush-api`. The tests include cross-job denial, restart recovery, simultaneous CAS, timeout/abort fencing, consent/model bounds, versioned rollback, HTTP parsing, and an actual resolver→retrieval→plan with only public API fixtures and no game file/model.

Supabase is tested against an in-process PostgREST-compatible fake, not a real database. Local filesystem persistence is tested on the actual host. Power-loss behavior depends on the filesystem/volume; no cross-region replication, backup/retention/deletion service or public production load test is included. JSON revision storage intentionally favors simple auditing; retention and usage quotas should be set before public rollout.

Documentation checked 13 October 2026: [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api), [Supabase changelog](https://supabase.com/changelog), [PostgREST table filtering and updates](https://docs.postgrest.org/en/stable/references/api/tables_views.html). No relevant REST CAS API change was found; the current TLS change requires modern TLS, provided by Node's HTTPS stack.
