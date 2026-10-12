# ScriptRush delivery — 2026-10-13

Live site: https://scriptrush.vercel.app

## Current release — preset-only generation and AI usage fix

The user reported a rejected Full Hub request after AI usage and confirmed they had only pressed Full Hub. The previous reference-hub checks did not establish that the unchanged button, used with an empty draft and without verified game adapters, reliably succeeded. The correction is released on the canonical domains: that exact preset builds with **zero model calls**, while custom requests and meaningful implementation evidence retain contextual AI analysis. The new canonical browser test reproduced empty draft → Full Hub → Generate Script with the existing observation-only profile, returned the full script and displayed the zero-AI notice.

### Current behavior and scope

- The unchanged shipped Full Hub preset appended to an empty draft produces one complete English A7DEV script: 680 × 460 rounded charcoal/purple panel, eight Home/Farm/Boss/Quests/Loot/Movement/Session/Settings pages, working navigation, dragging, minimize/restore and full closure/owned-connection cleanup. Its standard capabilities are Walk Speed, Jump Power, Rejoin, Theme and the hub interface lifecycle.
- Auto Farm, Auto Boss, Quest Farm and Auto Loot each retain their own visible, disabled control and precise `Needs game profile` explanation. They have no wired game action. Research feature scores, scanner counts and observed remote names do not enable automation or prove remote arguments, normal interaction flow or server success. **No actual game automation is claimed as confirmed.**
- The local path matches only the exact preset-only request, with no patch or runtime diagnostic, and absent sources or known observation-only profile forms. A custom title, palette, size, feature list, edited preset, current-script correction, executable source, interaction schema or unfamiliar source/profile fields remain on the contextual AI path. The local default must not replace an explicit user design.
- The backend returns strategy and usage metadata. A successful local build reports `local-profile-hub`, `model: "none"`, zero model calls and zero model input/output characters; the frontend displays `Built locally · 0 AI calls · no AI tokens used.` Custom AI requests report call counts. Character counts are diagnostics, not provider token or billing measurements.
- Rejected AI builds preserve the previous script and input, show a bounded, sanitized list of failed checks and report the model-call count when available. They no longer advise a blind retry. Diagnostics use only review findings, redact known API-key/Bearer patterns, remove URLs and markup, and exclude arbitrary raw provider error payloads.
- The caller AbortSignal now reaches generation, provider fetch/stream processing and retry backoff. Cancellation prevents subsequent planner/composer/reviewer/repair calls and preserves the user's work. Local tests verify abort before generation and after planning, pending provider operations and retry delay. Already completed model work is not refunded by cancellation.
- A curated A7DEV V2 guide teaches each existing AI stage the analysis → profile → adapter → implementation method, fresh-game reset, evidence boundaries, honest unavailable features, bounded state machines, caching, respawn and cleanup. Only about 2.3–2.4 KB of relevant guidance is added per stage; the complete 34 KB skill is not injected. The supplied reference is attributed to A7DEV / `a7med_o6t` with its version and SHA256. Functional UI remains English, and explicit user scope/design/custom titles override reference defaults.
- APInex remains configured in backend production (`apinex/free` health), with the existing server-only secret and fixed provider origin. This release verification made no model requests and did not spend APInex tokens. Custom AI generation still uses that provider; prior actual provider checks are documented in the historical release below.

### Current local validation

**114 backend + 60 frontend = 174 automated tests passed**, with both final TypeScript checks and production builds passing. The application runtime source is commit `54ff97af3c4f5b376a4a76eb3c88c81eda8bda27`. Both production builds reached READY and their canonical aliases were verified on 2026-10-12 at 23:10 UTC (2026-10-13 in Europe/Paris).

| Gate | Checkpoint result |
| --- | --- |
| Exact empty-draft Full Hub preset | PASS locally — zero model calls; nine explicit coverage entries, five standard capabilities and four unavailable game actions. A throwing mock provider proves the model is not needed. |
| Custom request / implementation evidence | PASS locally — additional design requirements, edited presets, diagnostics, corrections, code-bearing profiles, nested implementation fields, guided records and unfamiliar JSON fields retain contextual analysis. Observation-only records never enable game actions. |
| A7DEV reference guidance | PASS — compact per-stage prompt budget and reference attribution checks; reference files were read without executing archive code. |
| Preset script runtime | PASS — 123/123 isolated Luau assertions: exact size/radius/palette; eight non-overlapping left-navigation tabs with exclusive pages; four independent disabled controls with their own dependency reasons and no action callbacks; current-character numeric ranges and effects; Rejoin only on click; two-way visible theme; dragging/release; minimize/restore; full GUI closure and zero remaining owned connections. |
| Runtime harness regressions | PASS — 32/32 self-tests, including wrong preset palette/theme, missing tabs, enabled or wired unknown actions, vague/hidden reasons, and all earlier strict Full Hub/English UI cases. Earlier Full Hub remains 57 checks; English and translated UI remain 24. |
| Usage, diagnostics and caller cancellation | PASS locally — typed, bounded metadata; sanitized failures; caller abort prevents later AI stages and cancels provider work/backoff. |
| New deployment READY / canonical aliases | PASS — both exact deployments READY; frontend and API aliases map to the IDs below. Nine canonical GET checks and invalid POST `{}` → 400 also passed. |
| Canonical preset build / zero-AI metadata / output actions | PASS — staged backend and frontend each returned HTTP 200, model none, zero model calls/input/output characters and nine coverage entries. The canonical browser also returned the 21,696-character script with the zero-AI notice; exact clipboard/download, fullscreen and Escape passed. Its actual saved script compiled and passed 123/123 runtime assertions with zero runtime errors. |
| Canonical responsive layout / history / custom-request preservation | PASS — 1440×900 and 390×844, no page horizontal overflow or output-action overlap. History retained all five old versions plus V6 after reload; V6 matches the output exactly. Two Full Hub clicks preserved a custom design draft and appended the preset only once; no custom AI request was submitted. Browser warning/error log empty. |

### Current deployment evidence

| Component | Canonical domain | New deployment / source | Immutable deployment URL |
| --- | --- | --- | --- |
| Frontend | `scriptrush.vercel.app` | `dpl_4xJU1hmu3rPkZBZaHCqNxSddzSNL` — source `54ff97a`; READY and canonical alias verified | https://scriptrush-clear-epq4asz0t-ahmed-601f.vercel.app |
| Backend | `scriptrush-api.vercel.app` | `dpl_7TTTHzbESutJ84s9hwnXAmtJinPF` — source `54ff97a`; READY and canonical alias verified | https://scriptrush-9yjifrwu8-ahmed-601f.vercel.app |

Rollback references: frontend `dpl_FCpJHcx6YRpDLBT4Pszo57wc5aU7` / https://scriptrush-clear-lgbitla9k-ahmed-601f.vercel.app; backend `dpl_4RNSXyH7jtbygv6whydeEAy2kxqv` / https://scriptrush-kgh40mjw5-ahmed-601f.vercel.app. Final documentation changes do not modify the deployed application runtime.

### Current evidence and limits

Changed source includes backend `src/lib/local-full-hub.ts`, `a7dev-generation-guide.ts`, generation/guest-chat usage integration, caller-abort/provider handling and the matching frontend diagnostics/notice integration. The reusable runtime scenario is documented in `scriptrush-api/tests/runtime/README.md`. Ignored local evidence, excluded from deployment uploads:

- Backend `test-results/a7dev-preset/`: exact request/local script, unit/build logs and staged-cloud runtime log. `test-results/runtime/self-test/summary.json`: 32 passing harness cases.
- Frontend `test-results/full-hub/a7dev-backend-staged/` and `a7dev-frontend-staged/`: exact response/script and zero-AI metadata assertions.
- Frontend `test-results/full-hub/a7dev-canonical-browser/`: actual `create.lua`, `runtime.json` (123 checks), `browser-summary.json`, success/output and desktop/mobile screenshots.
- Frontend `test-results/full-hub/a7dev-aliases.json`, `a7dev-invalid-post.json`, and `final-http-a7dev-release/summary.json`: exact canonical mappings and ten HTTP checks (nine GET checks plus separate invalid POST).

Runtime checks use the official Luau CLI with closed Roblox API mocks. They do not establish real engine rendering, service availability, successful live teleport or gameplay server compatibility. A profile's object names and counts are observations, not executable adapters. The four unavailable game features require confirmed interaction dependencies before implementation; a useful complete hub shell with standard utilities does not make those actions functional. Custom generation still uses APInex and may consume model usage or fail validation. No archive code, generated script or scanner was executed in real Roblox during this change.

## Historical Full Hub / requested UI / APInex release — 2026-10-13

This earlier follow-up was released on the canonical domains with APInex active. Actual model requests produced a complete four-feature Full Hub and an English interface from a French request. That release's public Create, Fix, Learn, output actions, history and desktop/mobile layout passed their acceptance checks. Alias mappings and invalid POST validation were verified on 2026-10-12 at 22:25 UTC (2026-10-13 in Europe/Paris). Its evidence and limitations are retained below as a historical snapshot; they do not certify the new preset-only change above.

### Historical delivered behavior

- Full Hub selection preserves the complete draft and appends the preset once. Generation plans every independent requested feature, validates composition/action bindings, checks actual control-to-effect evidence and returns per-feature coverage. Missing behavior or requested UI fails validation; the browser retains its existing input and previous script.
- Fresh Full Hub and interface builds use schema-validated compositions with shared Luau UI and lifecycle primitives. The model specifies the requested title, dimensions, colors, navigation, typography, pages and controls. Standard Rejoin, WalkSpeed, JumpPower and theme controls have independent implementations. Fix receives the complete current script and preserves working features.
- Standard actions must match their original requirements: WalkSpeed cannot certify JumpPower. Custom and unavailable features cannot borrow window/page navigation as implementation evidence. Grounded references apply only to byte-identical trusted renderer output and do not change semantic findings or acceptance verdicts.
- Functional UI labels and page content follow the English UI policy, including for French requests. Known French labels and matching required-text checks follow the actual UI role; custom titles and requested visual specifications are preserved. A local guard checks common French labels; arbitrary prose, custom Luau and raw Fix output rely on the model and independent review under the same policy.
- Malformed planner JSON/shape receives one bounded format correction with the full original request. Reviewer shape/evidence errors receive bounded correction without rewriting a working script solely for an evidence error. Semantic omissions remain failures. The backend shares a 285-second deadline; the frontend generation proxy has a bounded 290-second timeout. Research and the read-only scanner remain separate.

In that release the authorized credential was stored only as the backend production secret `APINEX_API_KEY`, absent from Git and browser code. APInex used the fixed `https://api.apinex.bond/v1/chat/completions` endpoint and `free/gpt-6-luna`, with SSE completion checks and no paid fallback. Its canonical health reported `apinex/free`; actual provider calls and public Create/Fix flows succeeded during those historical checks.

### Historical deployments

| Component | Canonical domain | Deployment / source | Immutable deployment URL |
| --- | --- | --- | --- |
| Frontend | `scriptrush.vercel.app` | `dpl_FCpJHcx6YRpDLBT4Pszo57wc5aU7` — READY; `0c3b5ba` | https://scriptrush-clear-lgbitla9k-ahmed-601f.vercel.app |
| Backend | `scriptrush-api.vercel.app` | `dpl_4RNSXyH7jtbygv6whydeEAy2kxqv` — READY; `428d70d` | https://scriptrush-kgh40mjw5-ahmed-601f.vercel.app |

Frontend project: `prj_h1pY21Aw8ObcDJvVvBqzaMY1LnBh` (`ahmed-601f/scriptrush-clear-ui`). Backend project: `prj_Uz3JWo9bdfHf9xgCY3SGqCS6Oc7u` (`ahmed-601f/scriptrush`). Source branch: `codex/scriptrush-multipage` in `moa456811-prog/roblox-hubs`.

For that release, previous verified mappings were rollback references: frontend `dpl_foG7dmUVytSDSo6q1ky8k99EMuBL`; backend `dpl_Ei5LpWjLhLtuSprX5fffbNBWTRaD`. Its final documentation and runtime-QA-only changes did not modify that deployed application runtime or require another cloud build.

### Historical validation

**94 backend + 54 frontend = 148 automated unit/integration tests passed.** Both applications passed TypeScript checks and production builds. The separate isolated-runtime harness passed **23 self-tests**, including positive controls and deliberately defective-script mutations.

**All 14 original redesign criteria: PASS on that historical release.** Those checks covered separate routes and explanations (1–3), Create and output actions (4), Learn/import (5), full-script Fix (6), persisted history (7), desktop/mobile output layout (8–11), production builds (12), READY deployments (13), and canonical aliases (14), plus the Full Hub/APInex/English-UI gates below.

| Acceptance gate | Result |
| --- | --- |
| Complete Full Hub through actual APInex | PASS — HTTP 200 in 13.142 s; complete 389-line script; Rejoin, Walk Speed, Jump Power and Theme Toggle implemented; UI review passed without issues or incomplete response. |
| Requested Full Hub behavior | PASS — 57/57 assertions on that exact script: 480 × 360 rounded navy/cyan Aurora Hub; real Movement/Session/Settings tabs; separate inputs and Apply controls; inclusive 8–32 / 20–75 bounds and invalid-input rejection; immediate current-character effects and UseJumpPower; correct Rejoin only on click; two-way visible theme changes; dragging, minimize/restore, complete GUI closure and disconnected owned connections. |
| French request with English functional UI | PASS — actual APInex HTTP 200 in 11.098 s; 261-line Aurora Panel; unchanged title, exact 420 × 280 dimensions and navy/cyan palette; English Home/Settings/Welcome/Settings/Close text; 24/24 interaction assertions. Paramètres accepts Settings or Preferences as actual page content; a tab label alone is insufficient. The explicit English Preferences scenario remains strict. |
| Public Home and five workflows | PASS — exact Home/Create/Learn/Fix/History headings and routes; Home workflow explanations verified. |
| Canonical browser Create | PASS — Blox Fruits selected; Full Hub preset preserved the draft and requested English functional text; complete 15,212-character / 389-line result with four main features and panel lifecycle coverage; requested UI checked; exact script compiled and passed 57/57 interaction assertions. |
| Canonical browser Fix | PASS after retry — full script loaded; first attempt rejected with `REQUIREMENTS_NOT_MET` and preserved input. Retry corrected the deliberate Aurora Hbu title typo, changing one line while preserving the rest of the 15,212-character / 389-line script. Corrected script compiled and passed 57/57 interaction assertions. |
| Copy / download / fullscreen | PASS — copied and downloaded code matched exactly; fullscreen/Escape restored focus. |
| History and rollback | PASS — both new versions retained; comparison showed one changed line; rollback restored the previous version; fixed V5 set current and loaded fully in Fix; five versions unchanged after reload. |
| Learn and profile import | PASS — canonical scanner retrieved, 29,164 characters. Synthetic profile displayed exactly 3 NPCs / 1 boss / 2 prompts / 4 tools / 5 GUIs / 6 remotes. Original profile backed up and restored through the UI. Scanner was not executed in Roblox. |
| Desktop / mobile output layout | PASS — 1440 × 900 and 390 × 844; no horizontal page overflow or output-action overlap; code has its own scroll container; browser console errors empty. |
| Canonical HTTP smoke | PASS — all nine GET checks: five pages, scanner, research and health returned 200; unsupported guest-chat GET returned 405. Separate `POST /api/guest-chat` with `{}` returned 400, `Invalid request.` |
| Production deployment / aliases | PASS — both deployments READY; canonical frontend and API aliases map to the exact deployment IDs above. |

Official Luau compilation and isolated interaction assertions were separate checks. Both direct APInex scripts and that release's canonical browser Create/Fix scripts compiled successfully. At that release, earlier failed candidates and provider experiments were historical diagnostics rather than outstanding blockers. The successful Fix retry did not imply every model attempt would pass validation.

### Historical evidence and limits

Local QA artifacts are ignored by Git and excluded from deployment uploads:

- `test-results/full-hub/full-hub-verified/` and `english-ui-verified/`: actual provider requests, responses, summaries and exact returned scripts. Their HTTP summaries retain the intermediate `parsed-awaiting-semantic-review` marker; the subsequent independent runtime reports establish completed interaction checks.
- `test-results/full-hub/canonical-browser/`: `browser-summary.json`, verified `aliases.json`, separate `invalid-post.json`, `create.lua`, `fix.lua`, Fix request, and desktop/mobile screenshots.
- `test-results/full-hub/final-http-release-final/summary.json`: nine passing canonical GET checks.
- Backend `scriptrush-api/test-results/runtime/`: exact-script reports `script.lua.full-hub.runtime.json` (57 assertions), `script.lua.translated-ui.runtime.json` (24), `create.lua.full-hub.runtime.json` (57), and `fix.lua.full-hub.runtime.json` (57). The harness matrix had 23 cases at that release; its reusable ignored `self-test/summary.json` is overwritten by later QA runs. Harness details are in `scriptrush-api/tests/runtime/README.md`.

The interaction checks execute actual generated Luau in the official CLI against closed, pure Roblox API mocks. They are **not real Roblox Studio/client execution** and do not establish engine rendering, exact font glyph metrics, game-specific server permissions, service availability or a successful live teleport. Geometry and text height are modeled. The Full Hub acceptance covers the four requested standard client utilities, not unrelated game-specific actions. No generated script or scanner was executed in real Roblox. The imported QA profile was synthetic; history remains browser-local. Validation can reject a model attempt while preserving the user's work, as observed in the first Fix attempt.

## Historical previous frontend release — 2026-10-12

The remainder records the previous frontend release and its 14 original redesign criteria. Its deployment IDs, counts and browser evidence are historical; the preceding historical October 13 release superseded that snapshot. Neither historical record verifies the new preset-only change.

### Historical implementation

The Next.js App Router frontend has separate Home, Create, Learn, Fix and History pages. Shared components provide navigation, game selection, code output, profile summaries, progress and error states. Client workflows use typed API contracts, validated responses and a versioned local store retaining 25 versions, with legacy migration and import/export recovery.

Changed source groups in `scriptrush-proxy`:

- `app/`: layout, styles, icon and five page routes; the old inline HTML route was removed.
- `components/`: shared controls, editor, output actions, states and profile/evidence presentation.
- `workflows/`: Create/Fix, Learn, History and browser file actions.
- `lib/`: API, types, validation, storage and server-only scanner privacy adapter.
- `tests/`: request, response, storage and scanner regression coverage.
- Package, TypeScript, rewrite and deployment configuration; README and this delivery record.

The recovered existing API source is preserved in `scriptrush-api`. Targeted generation changes fix Lua/Luau extraction, accept complete short outputs, preserve full accepted correction inputs, keep requested scope, use an explicit free model, and return honest errors instead of generic fallback successes. Research and memory logic remain intact. Credentials stay in the existing backend project.

### Historical API integration

- `GET /api/research-game?q=...` → existing ScriptRush API.
- `POST /api/guest-chat` → existing API, `mode: build` or `mode: fix`, with the complete `currentScript` for correction.
- `GET /api/scanner` → existing live scanner, through a hash-locked server privacy transformation.
- Other `/api/*` requests rewrite directly to the API; frontend assets are served by this frontend.

### Historical validation

| Acceptance | Result |
| --- | --- |
| 1–3: exact home headline, Create/Learn/Fix explanations, separate URLs | PASS |
| 4: select game, request, real backend call, complete output, copy/download/full screen | PASS |
| 5: retrieve/display scanner, import valid runtime report, accurate summary | PASS |
| 6: load current script, submit error with full script and fix mode, corrected new version | PASS |
| 7: history survives reload | PASS — two production-origin versions |
| 8–11: 1440×900 and 390×844, no output overlap or page overflow | PASS — populated output also measured |
| 12: production build | PASS — frontend and API, including strict TypeScript |
| 13: final Vercel deployment READY | PASS |
| 14: main alias points to final frontend | PASS — Vercel API and CLI verified |

Automated tests: **35 frontend + 6 API = 41 passed**. Final HTTP smoke: all five pages, scanner, research and health returned 200. Browser warning/error log was empty. The main-domain Create produced 64 lines; Fix preserved that structure while correcting the requested API mistakes and welcome text. Clipboard matched exactly, download worked, fullscreen/Escape restored focus, and history export/import merged without duplicates. Stop preserved the request and current script.

### Historical deployments and rollback

- Canonical frontend project: `prj_h1pY21Aw8ObcDJvVvBqzaMY1LnBh` (`ahmed-601f/scriptrush-clear-ui`).
- Frontend: `dpl_foG7dmUVytSDSo6q1ky8k99EMuBL`, READY; uploaded frontend runtime commit `defa1dd4f39f0bc518e06a96c5596cfebfe3a3db`.
- API: `dpl_Ei5LpWjLhLtuSprX5fffbNBWTRaD`, READY; commit `ab0cb9dc11199512df9beec30b32ea4de8723e6e`.
- The main alias was assigned directly after the CLI promotion could not remap all aliases. Its final mapping was independently verified.
- Previous frontend `dpl_7o3YMUqSGYfnNzaYYJJgeHEeyYxs` and API `dpl_EGabBKrzr3ugEQTba9mWKiMFv8oh` remain available for rollback.
- Source branch: `codex/scriptrush-multipage` in `moa456811-prog/roblox-hubs`.

Local evidence and screenshots are in `test-results/final`; real backend request/response evidence is in `test-results/backend-candidate`. These test artifacts are excluded from Git and deployment uploads.

### Historical observed limitation

The model initially generated incorrect Roblox property casing and GUI parenting during one real browser test; Fix corrected those issues. Static checks do not guarantee in-game correctness. Neither a generated script nor the scanner was executed in Roblox. The imported QA runtime report was synthetic. History remains local to the browser.
