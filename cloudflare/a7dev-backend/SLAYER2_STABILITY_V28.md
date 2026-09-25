# Slayer 2 V28 — farm and boss recovery

Version: runtime-v28-farm-boss-recovery-20260925
SHA-256: 2abac53dd1eba6b01d92318f7654e72b25fbd1c7c19e6f1e496e4b66be7e4d58

## Corrected paths
- Fishing: a submitted successful catch exits pending after the line disappears and its grace period elapses, then respects recast delay. Failed replies clear pending. A live line is not recast.
- Farm: retain a valid matching target instead of expiring the target hold timer. Time spent beyond 14 studs or with attacks disabled does not count as failed damage. In-range no-damage recovery remains.
- Boss: resume no-damage fallback/reposition without permitting stuck timeout to select another live boss. Selected bosses bypass generic farm eligibility, while civilian rejection remains. Release an unreachable physical mob lock before movement.
- Farm fallback does not override DungeonWait.
- Boss/Dungeon pause special quest and race loops. Muzan, Crow and Training have explicit priority guards. Main farm pause checks enabled flags rather than stale active flags. Dungeon no longer mutually waits on a paused race automation.
- Souls cannot interrupt a locked boss; fishing and special-quest routes pause soul travel.
- Yeti retains a live target except for intentional priority of spawned minions. Missing replication is not counted as death. Disable both Yeti toggles to clear its lock.
- Shared prompt index refreshes at most once per second. Training retains its live combat target and limits replacement scans to once per 1.5 seconds.

## Verification
Luau compilation passed for protected base, runtime and complete payload.
Extracted production-code tests passed for fishing success/recast, live line, conflicting flags, failed reply, priority ordering, farm travel/attack-disabled handling, stuck recovery, retained boss, damage reset and V27 boss lock regression.
Source comparisons confirm the Auto Sell implementation, Anti AFK and complete UI are unchanged.
Cloudflare deployment uses staging, hash checks and compare-and-swap activation; Supabase database and embedded fallback are mirrored with prior source backed up.

## Limits
No live Roblox session was available. Server-side damage, mobile FPS and prolonged AFK are not claimed verified. Permanently removed boss/Yeti models without death confirmation require explicit reset. No guessed instance identity recovery was added. Dungeon card heuristics, God Mode and Instant Kill are not claimed universally fixed. Long-running actions that were already started can still need a tick to observe changed flags.
Loader and loadstrings remain unchanged.
