# Slayer 2 V22 — initialization hotfix

User error: line 6930, attempt to index nil with skillCombatActive.
V21 assigned State.Runtime.skillCombatActive before State.Runtime was initialized at line 10680. Compilation alone did not catch the startup error.

The protected base now executes State.Runtime = State.Runtime or {} immediately before assigning the skill gate. The later initialization already preserves the table. This is the only base change; runtime_patch_v21.lua, UI and all gameplay behavior otherwise remain unchanged. The combat-only skills guard remains enabled.

Executed regression: absent Runtime initialization succeeds; existing Runtime fields are preserved. Combat gate and warmup tests still pass. Base and full payload compile. Live Roblox startup still requires in-game confirmation.

Version: runtime-v22-skills-init-fix-20260925
SHA-256: 7f8efed2bcec6e9960829507ceba4ddfaec6783bc2bff6b59ae61202096a8f6c
Supabase secure function version: 38.
Cloudflare source, Supabase database and embedded fallback updated; old loadstrings unchanged.
