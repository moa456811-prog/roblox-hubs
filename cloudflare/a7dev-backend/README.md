# A7DEV Cloudflare Backend

This directory is a **parallel migration target**. It does not replace the live Supabase backend by itself.

## Safety rules

- Do not change `Loader.lua` or the current Supabase URLs until Cloudflare staging passes.
- Do not delete Supabase data during migration.
- Every script publication uses: **stage -> integrity check -> activate**.
- Previous active versions are archived automatically and remain rollback candidates.
- Script source is stored in R2; D1 stores metadata/grants/session compatibility records.
- No Cloudflare secret belongs in Git.

## Runtime compatibility

The Worker preserves the existing A7DEV request contract:

- `action=authorize`
- `action=manual_grant`
- `action=script`

The current Loader can therefore be switched by changing only its secure endpoint after staging validation.

Responses keep the fields used by the Loader:
`ok`, `session`, `expires_at`, `session_seconds`, `permanent`, and the raw Lua response for `script`.

## Cloudflare resources

Create:

1. Worker: `a7dev-backend`
2. D1 database: `a7dev-db`
3. R2 bucket: `a7dev-scripts`

Cloudflare recommends Wrangler configuration as the source of truth. The project uses `wrangler.jsonc` and native D1/R2 bindings.

After D1 creation, replace `REPLACE_AFTER_D1_CREATE` in `wrangler.jsonc`.

Required Worker secrets:

- `SESSION_SIGNING_KEY`
- `ADMIN_API_TOKEN`
- `ADMIN_KEY_SHA256`

Never commit their values.

## Database initialization

Run the schema against the new D1 database before importing any production data.

The schema intentionally does not seed permanent grants. The active Supabase grant table must be exported and compared before import so no existing user access is lost.

## Script publication flow

### Stage

`POST /admin/scripts/stage`

Bearer auth with `ADMIN_API_TOKEN`.

Body:

```json
{
  "game_key": "project-slayer-2",
  "version": "v16",
  "source": "<lua source>",
  "expected_active_sha256": "<optional current hash>"
}
```

The Worker computes SHA-256, writes a new immutable R2 object, and creates a D1 staging row. It does **not** change the active script.

### Activate

`POST /admin/scripts/activate`

```json
{
  "game_key": "project-slayer-2",
  "version_id": 123,
  "expected_active_sha256": "<optional current hash>"
}
```

Before activation the Worker rereads the R2 object and verifies its SHA-256. D1 changes are applied as one batch transaction. The old active version becomes archived.

### Rollback

`POST /admin/scripts/rollback`

```json
{
  "game_key": "project-slayer-2"
}
```

Without a version ID, the newest archived version is selected.

## Migration sequence

1. Create Cloudflare resources.
2. Initialize D1.
3. Export the current Supabase grants, active script metadata, legacy sessions still required, and all active Lua sources.
4. Import sources to R2 as immutable objects and import metadata to D1.
5. Compare SHA-256 hashes against Supabase.
6. Test `/health`.
7. Test authorize/manual grant/script using staging accounts.
8. Keep Supabase Loader and Secure endpoint unchanged while these tests run.
9. Add a compatibility bridge for already-issued Supabase signed sessions or wait for the migration window to be handled explicitly.
10. Change only the Loader secure endpoint to the Cloudflare Worker.
11. Keep the existing Supabase `a7dev-loader` as a DB-free compatibility shim so old per-game loadstrings continue to work.
12. Observe errors before considering Supabase data retirement.

## Important session note

The current Supabase backend signs `a7v2` sessions with a secret that is not committed to Git. Cloudflare must either receive the same signing secret or use a temporary validation bridge during cutover. Do not switch production before this is solved, otherwise already-issued sessions could require a new key.

## Current production status

Nothing in this directory changes the live A7DEV backend. It is safe to commit while Supabase remains production.
