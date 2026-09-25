# Migration preparation

The Cloudflare Worker, D1 database and private R2 bucket have been provisioned. The preparation entrypoint checks D1 and R2 on GET /health and returns HTTP 503 with ready=false. Other requests cannot issue sessions or serve scripts.

Use wrangler.preparation.example.jsonc as a template and fill resource identifiers in a private local configuration. Never commit account identifiers, private exports or secrets.

## Current blocker

Supabase management SQL queries time out. An independently authenticated, time-limited read-only export function also timed out when calling the Supabase REST data API. That temporary function was disabled immediately after testing. No data was exported or imported. A timeout alone does not establish the underlying cause.

Inspect database health and resource usage in the Supabase dashboard; a project restart is the next recovery option. Restart briefly interrupts service. Do not pause, delete, reset, or restore over the production database.

## Resume after recovery

- Export scripts, manual grants and required legacy sessions from the authoritative database.
- Reconcile permanent grants implemented in the deployed secure function as well as database grants.
- Preserve signed-session compatibility before any production cutover.
- Stage immutable script objects in R2, compare SHA-256, and verify all access records and rollback behavior.
- Follow MIGRATION.md. Keep Loader, loadstrings and existing Supabase functions unchanged.

The full backend is not ready for production. The preparation Worker is intentionally gated. Emergency fallback scripts are not a verified substitute for a complete export.
