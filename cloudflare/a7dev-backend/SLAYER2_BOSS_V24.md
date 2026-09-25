# Slayer 2 V24: retain the active boss

Version: runtime-v24-boss-lock-20260925
SHA-256: 1ac68f8da6c92b11ab99914557beccea5977c42904eff3de2be0600b7e50bc3a

The protected base now retains its acquired boss instead of reapplying name filters every scan. Temporary missing model parts or streaming gaps pause target arbitration for up to 8 seconds. Confirmed death starts a 2.5-second loot pause. Sustained disappearance releases the target without counting a kill. Explicit selection changes, disabling Auto Boss and respawn still reset the lock.

Map streaming scans stop starting new requests while a boss is locked. Auto Farm fallback and its no-damage skip cannot replace the active boss during combat or recovery. Dungeon priority remains unchanged.

Presentation runtime remains runtime_patch_v23.lua. Auto Sell, skills, Loader, loadstrings and authentication are unchanged. Full protected source is versioned privately in R2 and mirrored to Supabase, including the emergency fallback. Previous active source is backed up.

Validation: base and complete payload compile with Luau; extracted boss logic tests cover living target retention, forced rescan, title changes, streaming recovery, health-zero death, loot wait, despawn timeout and absent bosses. Existing skills and Runtime initialization regression tests pass. No Roblox live gameplay test was available.
