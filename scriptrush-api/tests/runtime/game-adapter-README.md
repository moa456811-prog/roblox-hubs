# Closed Blox Fruits adapter QA

This separate suite executes the original adapter factory, then the actual
generated Full Hub, in finite Luau fixtures. The existing UI acceptance harness
and its strict scenarios are unchanged.

From `scriptrush-api`:

```powershell
node --experimental-strip-types tests/runtime/game-adapter-run.mjs src/lib/game-adapters/blox-fruits-runtime.ts factory
node --experimental-strip-types tests/runtime/game-adapter-self-test.mjs
node tests/runtime/game-adapter-run.mjs test-results/game-adapter-runtime/full-blox-hub.lua full-hub
node --experimental-strip-types tests/runtime/game-adapter-self-test.mjs src/lib/game-adapters/blox-fruits-runtime.ts test-results/game-adapter-runtime/full-blox-hub.lua
```

`LUAU_BIN` can select an installed official Luau CLI. The existing local Luau
0.742 QA executable is reused when available. Nothing is downloaded or installed.

The admitted fixture includes a current character and weapon, live/dead ordinary
enemies and attribute-marked bosses, typed quest modules and giver, the real
quest UI path, tagged chests and fruit Tools. It observes actual ordinary attack
input, quest commands and movement. It tests scheduler priority, activation
bounds, four-per-second attack limit, Stop, cancellation of queued work, disposal,
respawn, unknown PlaceIds, missing/fake modules and no action before a click.
Progress requires simulated Health changes, quest UI acknowledgment or a
collectible's state/inventory change; movement alone is insufficient.
The first-sea fallback must use the pinned factual quest ID/tier, corroborate its
giver with a live NPC, preserve UI acknowledgment, reject the known SkyExp2Quest
coordinate conflict without corroboration, and never apply first-sea facts to a
different sea. Movement stall, queued-operation and progress timeouts are bounded.
Automatic pauses must synchronize the visible generated toggle to Off.
Both factory and generated controls exercise availability-aware priority: a
waiting Boss does not starve a farm with a live target; a waiting Farm does not
starve available loot. Newly spawned live bosses or ordinary targets regain
their configured priority without erasing the waiting toggle's enabled intent.
The generated UI must show a confirmed collection message when the actual
collectible state changes. The current suite has 126 factory checks, 100 actual
Full Hub checks and 19 mutation self-test cases when a generated hub is supplied.

The mock exposes only explicit inert ModuleScript data through `require`. It
provides no arbitrary require, file IO, network, executor globals, real client,
Studio, debug hooks or host reflection. Candidate processes receive no provider
secrets and have a six-second execution limit. Mutation self-tests prove that
decorative buttons, fabricated progress, wrong dispatch, automatic activation,
mutable state and missing disposal are rejected.

Reports go to ignored `test-results/game-adapter-runtime/`. A pass establishes
control flow against these fixtures only. It does **not** certify live Blox Fruits
compatibility, server acceptance, physics pickup, world path reachability,
rendering, or anti-cheat behavior. Public source facts and a mocked test must
never be relabeled as a successful live-game test.
