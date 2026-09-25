# Dungeon V30

Build: runtime-v30-dungeon-ui-recovery-20260925

- Exclude A7DEV controls, disabled ScreenGuis and invisible ancestors from game UI searches.
- Prefer UI events with listeners; bounded retry alternatives when listener inspection is unavailable.
- Limit reward selection to card/reward/draft contexts; exclude paid and navigation actions. Three attempts per visible selection, with no claim of server success.
- Add opt-in Auto Skip Wave for explicit visible next-wave/vote controls. Defer while automatic card selection is pending.
- Enable the owning Auto Dungeon scheduler when Dungeon Auto Clear is enabled.
- Preserve the dungeon combat target and ensure auto attacks/equipment on resumed runs.
- Keep V29 Kill Aura, loader, loadstrings, and other gameplay subsystems.

Validation: Luau compilation of decoded base and full delivery wrapper; mocked regression tests for visibility, own-UI exclusion, paid-action exclusion, vote counters, card/wave retry bounds, new panels and outside-dungeon behavior.

Limitation: supplied game snapshot lacks live dungeon card/wave UI and listeners. No live Roblox end-to-end run performed. UI patterns fail closed when unmatched; a current dungeon capture may be needed. Auto Skip Wave is initially off; enable it in the dungeon session.
