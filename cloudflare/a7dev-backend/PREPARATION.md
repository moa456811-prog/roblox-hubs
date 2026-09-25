# Cloudflare migration preparation

Historical preparation record. Production cutover was subsequently authorized and completed on 2026-09-25; see CUTOVER.md. The gating details below describe the earlier staging deployment.

## Deployed resources

- Worker: a7dev-backend
- D1 database: a7dev-db
- Private R2 bucket: a7dev-scripts

Use wrangler.preparation.example.jsonc with identifiers supplied in a private local configuration. Never commit identifiers, exports, session tokens or secrets.

The preparation entrypoint returns HTTP 503 with ready=false on public routes. GET /health probes D1 and R2. Administrative routes, including POST /admin/test/hub for integration checks, require ADMIN_API_TOKEN. The original Worker, Loader, loadstrings and existing Supabase production functions remain unchanged. Supabase continues serving production and remains the fallback.

## Import and verification results

The Supabase restart restored SQL and REST access.

- All 9 active script sources were exported, hashed independently, staged into R2, activated in staging D1 and delivered through the authenticated test route. All source SHA-256 values match. Delivery checks excluded only the backend watermark line.
- A final SQL comparison confirmed the active source inventory and hashes remained unchanged during import.
- 7 manual access records were reconciled: 6 permanent grants, including the grant implemented in the live function, and 1 expired temporary grant. All imported fields match the normalized export.
- 60 legacy session records valid at export were imported with token hashes and original expiry dates. All fields match; sessions continue to expire normally.
- A permanent grant issued a working Cloudflare session. An expired grant and an invalid session were rejected.
- A signed session from the unchanged Supabase production function successfully retrieved the matching script through Cloudflare. Reuse with another user ID was rejected.
- A same-source staging activation followed by explicit rollback restored the original version. All 9 original active version IDs and hashes were preserved, with exactly one active version per game.
- Anonymous administrative access was rejected. Public Cloudflare serving remains gated.
- The temporary export function was disabled after export. The temporary Worker diagnostic route was removed.

Inactive historical scripts remain in Supabase; this import covers the active inventory.

## Legacy signed-session bridge

src/index.js can verify legacy a7v2 sessions through an authenticated Supabase compatibility function, without exporting or replacing the existing signing secret. Configure LEGACY_VERIFY_URL and store LEGACY_BRIDGE_TOKEN as a Worker secret. The template supabase/session-compat.example.ts requires private deployment values. The bridge validates HMAC, user identity and expiry.

The Worker uses redirect=manual and rejects non-success upstream responses. Cloudflare Workers does not implement redirect=error. Upstream failures fail closed.

The preparation Worker also requires DB, SCRIPTS, ADMIN_API_TOKEN, SESSION_SIGNING_KEY and the existing administrator hash configuration. Supply secret values through private deployment tooling.

## Before any later cutover

Follow MIGRATION.md and obtain explicit authorization to change the Loader or loadstrings. Reconcile changing access records, sessions and script versions immediately before cutover; this import is a snapshot, not continuous replication.

Verification covers storage integrity and backend access behavior. It is not an in-game Roblox execution test or a live Work.ink end-to-end authorization test. Keep Supabase active and the public gate in place until the remaining checks are complete.
