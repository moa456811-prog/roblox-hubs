# Slayer 2 V27 — confirmed boss death

Version: runtime-v27-confirmed-boss-death-20260925
SHA-256: e67e37b6e458bf9b4a641bc062156e3ac4eed737c8a465d99b91342468982a85

V24 still released an acquired boss after eight seconds without a usable model, despite having no death confirmation. Player respawn also cleared the boss. V27 retains the acquired instance until confirmed death or an explicit user selection/reset. Missing replication starts a throttled stream request around the last known location, without selecting a different boss. Player respawn preserves the lock while Auto Boss remains enabled.

Chest and drop travel cannot interrupt an unconfirmed boss; nearby interaction remains possible. Confirmed death retains the 2.5-second loot window. Initially absent bosses are still skipped.

Tradeoff: a permanently removed boss with no replicated death confirmation remains waiting. Toggle Auto Boss off/on or change selection to release it. Recovery of a replacement instance with unknown identity is not guessed.

Validation: base and complete payload compile. Extracted logic tests cover missing model beyond ten minutes, forced scan retention, recovery, missing root, confirmed death, loot delay and initially absent boss. Respawn preservation checked. Actual Roblox gameplay remains untested. V26 interface, Auto Sell and V25 Anti AFK are unchanged.

Protected source staged and hash-checked in Cloudflare; previous source backed up; Supabase database and emergency fallback synchronized. Existing Loader and loadstrings preserved.
