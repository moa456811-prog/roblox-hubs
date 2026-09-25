# Cutover checklist

## Locked during preparation
- Loader UI
- Existing GitHub per-game loadstrings
- Current Supabase Edge Function URLs
- Key duration (24h)
- Existing permanent/manual grants
- Roblox gameplay scripts

## Required export before cutover
- a7dev_hub_scripts: game_key, version, source, source_sha256, active
- a7dev_hub_script_backups: retained separately until Cloudflare import is verified
- a7dev_hub_manual_grants
- any still-valid legacy a7dev_hub_sessions required for compatibility

## Validation gates
- Every imported R2 source hash equals its Supabase source hash.
- Every active game has exactly one active D1 version.
- Manual/permanent grants match the Supabase export.
- authorize response shape matches the current Loader.
- script response compiles with the same loader path.
- old per-game loadstrings still enter through the Supabase loader shim.
- rollback restores the previous R2 version and D1 active pointer.
- no gameplay source is modified as part of infrastructure migration.

## Production switch
Do not switch until all validation gates pass.
