# Slayer 2 V17 Mobile — 2026-09-25

The V16 interface imposed a minimum scale of 0.62, making the 820px-wide panel overflow narrow screens. Its minimize control also shrank with the panel and dragging only accepted mouse input.

V17 changes only the layout/controller section:
- Fit the window to the ScreenGui safe area without an oversized minimum, with reserved space for the touch control.
- Center using an anchor point and clamp movement within the available area.
- Use a separate 52×52 touch button, outside the scaled panel. "-" hides the entire window; "A7" restores it.
- Preserve page visibility and gameplay state while minimized.
- Support one touch pointer or mouse dragging, and distinguish dragging the floating button from tapping it.
- Recalculate geometry on safe-area/orientation changes, with event connections included in existing cleanup.

V16 remains unchanged for rollback. The protected gameplay base and runtime content outside the layout section are byte-identical. Existing loadstrings and Loader are unchanged.

Validation: official Luau compilation of runtime and complete payload; the actual extracted controller executed in a mocked Luau UI harness across six phone/tablet dimensions, rotation while minimized, dragging, tap restoration, and desktop behavior. Physical-device Roblox testing remains unavailable.

Deployment version: runtime-v17-mobile-fit-minimize-20260925
Payload SHA-256: 6fa316ac3d94eb2c5771b7c55ea86e14c72ff14eca6496498fd594b5f1fe63ad

R2/D1, the Supabase database fallback and the emergency fallback source have been updated together. The prior source is retained in Supabase backup 49 and the previous R2/D1 version.
