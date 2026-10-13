# Production composer execution gate

`runProductionRuntime(row, composition, options?)` accepts the newly authored production case shape `{id, game, expected:{composition,contract}}`. It resolves the audited adapter through the exact catalog game binding, renders the **model's own composition and callbacks**, and returns a `RuntimeReport` compatible report with a separate `factory` result and explicit `liveVerified:false` provenance.

```powershell
node --experimental-strip-types --test experiments/specialist-v2/production/runtime.test.ts
```

Both processes compile their candidate from a quoted string as a separate Luau chunk before applying the closed environment. The model cannot read host expectations, assertion tables or fixture internals through lexical capture. Neither candidate environment exposes a compiler, arbitrary `require`, network, files, OS or provider credentials. The only `require` route returns the inert ModuleScript data expressly admitted by the pre-existing game adapter mock. Raw/generalized iteration and table cloning/mutation of mock Instances are rejected while storing an Instance as an ordinary list value remains valid. Each process has its own six-second deadline.

The first process preserves **all existing factory assertions** without changing their source. This includes real ordinary attack dispatch, health-progress observation, typed quest data and UI acknowledgment, loot-state/inventory confirmation, lifecycle, admission, bounded work and priority arbitration. The second process verifies the actual generated farm, boss, quest and loot controls against the same fixture schema, resolves controls by requirement feature IDs, and tests exact custom dimensions, radius, title or absence, font, page order, navigation, active palette, text, numeric bounds, initial state, real operations, independent Stop, automatic pause display, respawned movement controls, rejoin, theme, drag, minimize/restore and close. Factory success alone cannot make an incomplete or decorative generated hub pass.

The three catalog Blox Fruits sea PlaceIds are covered. For another sea, the fixture's inert quest levels and guide list are placed within that sea's admitted level range; these are **simulated schema values**, not claims about the live game's exact quest modules. No game connection is made. A pass does not certify current server acceptance, real damage delivery, physics pickup, path reachability, rendering or compatibility with another game.

The positive self-test runs all eight new production UI profiles. Negative controls reject a no-op farm, wrong action dispatch, a missing independent boss control, mismatched custom UI and lexical harness access. Passing these self-tests validates the test harness, not the specialized model.
