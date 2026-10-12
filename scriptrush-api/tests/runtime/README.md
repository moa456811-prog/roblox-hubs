# Isolated Full Hub interaction QA

This optional QA harness executes generated UI scripts in the official Luau CLI (tested with 0.742) against a pure, closed Roblox mock. It does not start Studio or contact Roblox. Source code receives a whitelist of pure Luau functions and mocked standard UI/client services; `require`, IO, networking, OS APIs, dynamic loading and environment/metatable reflection are absent. Provider/application environment variables are not passed to the interpreter. Each process has a six-second timeout and each mock has a callback limit.

Set `LUAU_BIN` to an installed official [Luau 0.742 interpreter](https://github.com/luau-lang/luau/releases/tag/0.742), or install it as `luau` on PATH. On this workspace, an existing ignored CLI under the frontend QA artifacts is also detected. The harness never downloads, installs or commits binaries, and it is separate from the default unit-test suite.

From the backend directory:

```powershell
node tests/runtime/run-runtime.mjs path/to/generated-hub.lua full-hub
node tests/runtime/run-runtime.mjs path/to/local-preset-hub.lua preset-hub
node tests/runtime/run-runtime.mjs path/to/english-script.lua english-ui
node tests/runtime/run-runtime.mjs path/to/translated-script.lua translated-ui
node tests/runtime/run-runtime.mjs path/to/french-script.lua french-ui
node tests/runtime/self-test.mjs
```

The runner writes a JSON report under ignored `test-results/runtime/`, or at the optional third path argument, and exits with 0 only when every assertion passes. Self-tests also keep generated mutation scripts and reports in that ignored directory.

The `full-hub` scenario checks an exact 480 × 360 navy/cyan Aurora Hub window, rounded panel, three distinct Movement/Session/Settings tabs, current-character WalkSpeed (8–32)/JumpPower (20–75) inputs with valid bounds and immediate effects, Rejoin only on click with correct Teleport arguments, visible two-way theme switching, mouse drag and release, minimize/restore, complete ScreenGui destruction and disconnected owned connections.

The separate `preset-hub` scenario checks the local A7DEV default without weakening `full-hub`: exact 680 × 460 window, radius 12, charcoal/purple initial colors, eight distinct Home/Farm/Boss/Quests/Loot/Movement/Session/Settings tabs in a left navigation column, exclusive page switching, the same working utility/lifecycle interactions, and charcoal/purple → navy/cyan → charcoal/purple theme switching. Auto Farm, Auto Boss, Quest Farm and Auto Loot must each retain a visible disabled control with its own visible `Needs game profile` explanation naming the missing feature dependency. They must remain inactive; the test does not certify those four game actions as implemented. An independent handwritten fixture is used for harness self-tests, including enabled unknown actions, missing tabs, vague/hidden reasons and wrong theme/palette mutations.

The `english-ui` acceptance scenario checks an exact 420 × 280 navy/cyan Aurora Panel, exact Home/Settings/Close strings and Welcome/Preferences page contents, active tab appearance and show/hide effects, complete ScreenGui destruction with no surviving owned connections or visible UI. The prompt may be written in French; these generated UI labels must be English.

The separate `translated-ui` scenario checks the same interactions and geometry when a French description requests Accueil/Réglages/Bienvenue/Paramètres/Fermer and the generated functional UI must be English. It accepts either Settings or Preferences as the translated second page's TextLabel content; the Settings tab button alone never counts as page content. `english-ui` remains strict when the request explicitly names Preferences. Self-tests cover both valid translations and reject French output and missing page content.

The `french-ui` scenario is retained solely as a legacy renderer Unicode regression: the same geometry/interactions with Accueil/Réglages/Fermer and Bienvenue/Paramètres. It is not the current generated-language acceptance requirement. Self-tests explicitly reject this French fixture for an English UI request.

`self-test.mjs` establishes positive controls and rejects deliberate defects: wrong dimensions, overlapping/header tabs, decorative Apply/Rejoin/theme handlers, invalid numeric ranges, missing JumpPower mode, absent restore, panel-only closure, leaked global connections, both pages remaining visible, forbidden require and an infinite loop.

Reports are evidence of actual execution/control flow against mocks. They are **not** evidence of real Roblox rendering, exact glyph metrics, gameplay compatibility, server permission, service availability or an actual successful teleport. UDim geometry, ancestry, standard property names, connection ownership and relevant signal callbacks are modeled; text height for AutomaticSize is approximate. A real generated result must separately pass syntax compilation, requirement/scope review and the HTTP/frontend acceptance workflow.
