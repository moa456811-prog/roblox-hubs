# Slayer 2 version recovery — 2026-09-25

The initial migration correctly copied the database row but missed the newer runtime used by the emergency backend during the database outage. Matching the database was not proof that the delivered version included the latest corrections.

## Recovered source

- The stale database source ended in premium-ui-v5-selection.
- The previous emergency assembly loaded runtime_patch_v15.lua and the protected base.
- runtime_patch_v16.lua, commit a66bb52e16417c7226a3bc1552c6aba69718f1f3, preserves V15 and fixes lexical scope for seven Muzan helpers. It had not been published because SQL was unavailable.
- The recovered complete payload retains the exact protected base from the emergency assembly and embeds the exact V16 runtime locally. It no longer depends on a second GitHub download for that runtime.
- Active version: runtime-v16-muzan-scope-config-20260925.
- Full payload SHA-256: 8aa93eff091bb60449ca0262acc841c6065d187631bb1eb2927b5b46527d9bb9.
- V16 runtime SHA-256: 4fc130d75c69542406e0f4e49dd0053c17db26189099499da26feb6d5c5cbf51.

The complete payload was staged and hash-verified in private R2. Supabase retained the preceding database source in its backup table before its active row was updated. The Cloudflare active pointer was then switched. The original D1/R2 version remains available for rollback. The Supabase emergency constant was updated too, so database fallback cannot silently restore V15.

## Verification

The complete payload, decoded protected base and V16 runtime compile successfully with the official Luau compiler (source commit 7a3d37eea5b0b26c97f05f6137ee0e411e6cd6ed). The unchanged public API and independently forced Supabase fallback both deliver bytes matching the full payload hash. The temporary verification function was disabled afterwards.

Loader, per-game loadstrings and other game sources were not changed. Already running clients must close the old hub and execute their usual loadstring again. Compilation and transport checks do not replace a live Roblox gameplay test.
