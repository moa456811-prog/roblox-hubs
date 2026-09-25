# Slayer 2 V20 — supplied visual reference

Presentation adapted from the user's image(9).png on 2026-09-25: dark neutral backgrounds, blue accents, wide cards, nested Main navigation and compact switches. Branding remains A7DEV HUB.

Main contains Settings, Auto Farm, World Bosses, Auto Quest and Collect. Existing pages remain accessible; Preferences contains saved configuration. Farm Position and Farm Safety move into Main / Settings. Existing section IDs and controls are retained. The second native columns remain available to feature installers, while sections are routed into a single visible wide column.

Height Offset and Distance have mouse/touch sliders tied to the existing registered input Apply callbacks. Existing numeric inputs remain usable. Original limits remain Height 2–30, Distance 1–25; no default gameplay values are changed to imitate screenshot values. Config-driven text updates synchronize the sliders.

The GUI-owned object prefix check now uses the correct 13-character length, preventing internal decoration from being restyled as native controls.

Validation:
- Luau compilation: runtime and complete payload passed.
- Protected base and automation subsystems, including Auto Sell, byte-identical to V19.
- Mobile mock test: six viewports, rotation while minimized, touch drag/tap distinction, PC restoration passed.
- Extracted slider tests: mouse/touch, clamping, release and saved-value synchronization passed.
- Nested navigation test: 12 entries fit and Main expands/collapses.
- Supabase embedded emergency fallback exact-match verified; router/auth files unchanged.
- No actual Roblox render or physical phone validation; visual fidelity must be assessed in game.

Release: runtime-v20-reference-ui-20260925
SHA-256: c31b26d88bb7eef5894e1233d75df96f25fbd8a89eff2bfb82c299c1f8b512b1
Payload bytes: 786298
Runtime commit: 26084c86a985edc7ae720beaab1b664bf7b03fb5
Supabase secure function version: 36
Previous V19 retained and backed up. Loader, loadstrings and key behavior unchanged.
