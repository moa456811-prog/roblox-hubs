# Slayer 2 V25 — red interface and anti-idle lifecycle

Version: runtime-v25-red-ui-antiafk-20260925
SHA-256: e5019dd07113df2dd35363bc86b3cdb3230e6da26b24248d9665db0a381bc2a2

Blue accents are replaced by red across the shared palette, native theme, minimized button border and boss selection rows. Layout and callbacks are preserved.

Anti-idle installs independently of optional restored features and GUI discovery. A 60-second input pulse runs on a 10-second low-frequency timer. Player.Idled adds a throttled fallback. VirtualInputManager cursor movement is attempted; VirtualUser CaptureController and ClickButton2 are tried when movement is rejected or Idled persists. No combat keys, character movement or held mouse buttons are introduced. Reinstallation, runtime stop and State.Destroyed stop the owned timer and connections. Unsupported methods warn once instead of silently swallowing all failures.

Successful calls mean input was sent, not proof the engine's idle timer reset. Executor permissions and background suspension can still prevent operation. Real in-game 20+ minute verification is pending.

Validation: runtime and complete payload compile with Luau. Extracted production anti-idle function passes a simulated 30-minute timer test, event deduplication, missing character/camera, fallback, both methods denied, reinstallation, destroy and runtime-stop tests. Boss V24 regression tests pass. Protected gameplay base is byte-for-byte unchanged; Auto Sell feature code remains unchanged apart from presentation color literals.

Published runtime: hubs/project-slayer-2/runtime_patch_v25.lua
Cloudflare R2 version and Supabase database/emergency fallback are synchronized, with prior version backed up. Loader, loadstrings and auth routing are unchanged.

Reference: https://create.roblox.com/docs/reference/engine/classes/Player#Idled
