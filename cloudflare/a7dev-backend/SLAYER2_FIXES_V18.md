# Slayer 2 V18 — targeted corrections

Published 2026-09-25. User confirmed Auto Sell works; its implementation is byte-identical to V17.

## Changes
- Skills: require the native controller's explicit success result; try the next skill after a nil/false return. Update LastSkill only after confirmed start. UI/input fallback checks SHC state rather than pcall success.
- Quest priority: pause the farm planner after housekeeping and HP safety, rather than bypassing the entire main heartbeat.
- Config v2: preserve registered toggle states and input values; restore through existing callbacks/validators. Unchanged toggle callbacks are not replayed. Loading remains manual.
- Yeti: throttle full discovery to 1.5 seconds, retain minion priority, wait 2.5 seconds after target death before a bounded loot phase.
- Winter lantern: use confirmed Emberheart/Everburn accessory IDs and AccessoryEquip in an empty Stats slot; confirm replicated slot state; limit attempts. Does not replace equipped items.
- Training: replace the cosmetic All Active button with an actual objective refresh.
- Anti-idle: tracked idle listener with protected VirtualUser button pair, subject to executor capability.
- Keep V17 mobile layout/controller, Auto Sell, Loader, loadstrings, keys and other games unchanged.

## Validation
- Luau compilation passed for decoded base, runtime and complete delivery.
- Executed extracted-code tests: skills nil/false/success, priority housekeeping, config round trip, Yeti scan cache and minion ordering, lantern missing inventory/full slots/retry bound/confirmation.
- Mobile controller mock tests passed: six viewports, rotation while minimized, touch drag/tap distinction, PC restoration.
- Complete authenticated source from Cloudflare and original Supabase public endpoint matches candidate byte-for-byte.
- Supabase database and embedded emergency fallback contain the same candidate; routing and session verification files unchanged.
- No live Roblox session or physical phone test performed.

## Release
- Version: runtime-v18-targeted-fixes-20260925
- Full payload bytes: 777663
- SHA-256: 6a04b4df019a0d690804585cb92a519996e9a085700ccfc98e4917d6666e1f67
- Cloudflare version ID: 13; previous V17 ID: 12 retained.
- Supabase secure function version: 34.
- Runtime commit: 1e70c1eb8aa9e9b2f33a710f070701d5ad62d2e8
- The full private payload pairs the V18 runtime with the corrected protected base; the public runtime file alone does not contain the base changes.

## Remaining limits
Automatic acquisition/recharging of winter lanterns and complete automation of every training minigame are not established by the available saved game. The lantern correction equips an already owned supported item. Loot ownership and every server-side gameplay result still require live verification. Anti-idle depends on supported VirtualUser capability.

Rollback uses the retained V17 Cloudflare version and the backed-up Supabase script; restore both the database source and embedded fallback together.
