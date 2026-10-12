# ScriptRush delivery — 2026-10-12

Live site: https://scriptrush.vercel.app

## Full Hub / requested UI / APInex follow-up — acceptance pending

The follow-up is **not released**. The source fixes preserve the user's complete request when selecting Full Hub, plan every independent feature, retain requested UI instructions, display checked feature coverage, and reject failed coverage instead of returning a misleading single-feature success. The generation proxy now has an explicit bounded Node route for long requests. Research and the read-only scanner remain separate.

The user-authorized APInex credential is stored as the existing backend project's production secret `APINEX_API_KEY`. It is not in Git or browser code. Real authenticated provider calls returned HTTP 200. The integration uses the fixed APInex origin, SSE transport and fail-closed completion checks; it does not purchase credit or use paid fallback routes.

Current validation:

- **54 frontend + 47 API = 101 automated tests passed.** API production build and TypeScript passed; frontend build passed for the staged frontend. These results do not mean the real model acceptance tests passed.
- API candidate **`dpl_8mm7G8dCZm9tMEQutf9vsobKN5mX`**, READY, source commit **`4baa94e`**: `https://scriptrush-4jv1m5fqm-ahmed-601f.vercel.app`.
- Candidate health reports `apinex/free`; health/research return 200 and an invalid generation request returns 400.
- Frontend candidate **`dpl_Fut5E9aQs5Lh2ARsR5GkuLuRKE2X`**, READY: `https://scriptrush-clear-3rnkeqcei-ahmed-601f.vercel.app`. Its five pages load; the preset preservation/idempotence was checked in the browser.
- **Real multi-feature hub acceptance: FAIL.** Seven advertised free APInex routes were exercised. Observed outputs included truncated generation/review, missing or fabricated source evidence, incorrect Roblox APIs, local-variable scope errors, overlapping navigation, broken dragging and incomplete cleanup. Some provider reviews incorrectly claimed success; manual code inspection prevented release. Official Luau syntax compilation alone passed one semantically broken candidate and is not sufficient acceptance.
- **Final candidate French custom-UI test: FAIL**, HTTP 502, `REQUIREMENTS_NOT_MET` (27.7 s). No failed output replaced a prior script. Evidence is under ignored `test-results/full-hub/apinex-final-french-ui` and the other `local-*` experiment directories.
- The previous OpenRouter free route also reached its daily provider limit during this follow-up.

No canonical alias was moved. Verified mappings remain frontend **`dpl_foG7dmUVytSDSo6q1ky8k99EMuBL`** and API **`dpl_Ei5LpWjLhLtuSprX5fffbNBWTRaD`**. The APInex candidate is reviewable but is not serving `scriptrush-api.vercel.app` yet. The outstanding release gate is a real complete multi-feature hub and a faithful custom UI, followed by the browser flow through the canonical proxy. No in-game execution was performed.

## Previously verified frontend release

The previous frontend release passed the 14 original redesign criteria. The five routes, real Create and Fix calls, output actions, scanner retrieval, report import and browser-local version persistence were verified at that time. The historical evidence below does not certify the newer Full Hub/APInex follow-up.

## Implementation

The Next.js App Router frontend has separate Home, Create, Learn, Fix and History pages. Shared components provide navigation, game selection, code output, profile summaries, progress and error states. Client workflows use typed API contracts, validated responses and a versioned local store retaining 25 versions, with legacy migration and import/export recovery.

Changed source groups in `scriptrush-proxy`:

- `app/`: layout, styles, icon and five page routes; the old inline HTML route was removed.
- `components/`: shared controls, editor, output actions, states and profile/evidence presentation.
- `workflows/`: Create/Fix, Learn, History and browser file actions.
- `lib/`: API, types, validation, storage and server-only scanner privacy adapter.
- `tests/`: request, response, storage and scanner regression coverage.
- Package, TypeScript, rewrite and deployment configuration; README and this delivery record.

The recovered existing API source is preserved in `scriptrush-api`. Targeted generation changes fix Lua/Luau extraction, accept complete short outputs, preserve full accepted correction inputs, keep requested scope, use an explicit free model, and return honest errors instead of generic fallback successes. Research and memory logic remain intact. Credentials stay in the existing backend project.

## API integration

- `GET /api/research-game?q=...` → existing ScriptRush API.
- `POST /api/guest-chat` → existing API, `mode: build` or `mode: fix`, with the complete `currentScript` for correction.
- `GET /api/scanner` → existing live scanner, through a hash-locked server privacy transformation.
- Other `/api/*` requests rewrite directly to the API; frontend assets are served by this frontend.

## Validation

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

## Deployments and rollback

- Canonical frontend project: `prj_h1pY21Aw8ObcDJvVvBqzaMY1LnBh` (`ahmed-601f/scriptrush-clear-ui`).
- Frontend: `dpl_foG7dmUVytSDSo6q1ky8k99EMuBL`, READY; uploaded frontend runtime commit `defa1dd4f39f0bc518e06a96c5596cfebfe3a3db`.
- API: `dpl_Ei5LpWjLhLtuSprX5fffbNBWTRaD`, READY; commit `ab0cb9dc11199512df9beec30b32ea4de8723e6e`.
- The main alias was assigned directly after the CLI promotion could not remap all aliases. Its final mapping was independently verified.
- Previous frontend `dpl_7o3YMUqSGYfnNzaYYJJgeHEeyYxs` and API `dpl_EGabBKrzr3ugEQTba9mWKiMFv8oh` remain available for rollback.
- Source branch: `codex/scriptrush-multipage` in `moa456811-prog/roblox-hubs`.

Local evidence and screenshots are in `test-results/final`; real backend request/response evidence is in `test-results/backend-candidate`. These test artifacts are excluded from Git and deployment uploads.

## Observed limitation

The model initially generated incorrect Roblox property casing and GUI parenting during one real browser test; Fix corrected those issues. Static checks do not guarantee in-game correctness. Neither a generated script nor the scanner was executed in Roblox. The imported QA runtime report was synthetic. History remains local to the browser.
