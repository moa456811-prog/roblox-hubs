# Slayer 2 V21 — combat-only automatic skills

Fix requested 2026-09-25: automatic skills were firing without attacking mobs and causing gameplay problems.

Root cause: the watchdog treated enabled automation flags as proof of combat and ran unconditional startup/respawn warmups. Its fallback also repeatedly scanned the player GUI and simulated skill inputs.

Changes:
- Common gate in protected base applies to automatic skill ticks and warmup exports.
- Requires enabled Auto Skills/Auto Attack plus an enabled combat automation, living character and target, same target and character as the recent attack, attack age at most one second and distance at most 12 studs.
- Successful native attack invocation or Tool activation records target/character/time. This records a client attack attempt, not confirmed server damage.
- Shared 0.3-second attempt throttle plus existing successful skill cooldown.
- No automatic casts at startup or respawn; respawn invalidates attack context.
- Watchdog uses the native exports only while the gate is true. Removed UI scanning, simulated input fallback and forced enabling from warmup.
- Manual player skill input is not intercepted.
- UI, Auto Sell and all other runtime subsystems byte-identical to V20.

Verification: decoded base, runtime and complete payload compile. Extracted-code tests reject startup, stale attack, distant target, dead target, disabled farm/attack/skills, dead character, respawn and stale target identity. Valid nearby combat passes; warmup cooldown prevents duplicate casts. No live Roblox test.

Version: runtime-v21-combat-only-skills-20260925
SHA-256: f43e89dbd5865798a5f01d9704105253a0e485c60624a2010b9c853ea216732c
Runtime commit: f553073f9b701576e6eae6451336f206b14485c0
Supabase function version: 37. Previous V20 retained and backed up.
Full payload contains paired corrected base + runtime; standalone runtime does not contain base fixes.
