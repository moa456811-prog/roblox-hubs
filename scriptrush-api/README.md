# ScriptRush API

This directory preserves the source serving the existing `scriptrush-api.vercel.app` alias, recovered from deployment `dpl_EGabBKrzr3ugEQTba9mWKiMFv8oh`. Research, diagnostic and memory behavior remain intact.

Generation first extracts all requested features and UI requirements, then produces one complete Lua/Luau block and reviews actual control-to-behavior coverage. A failed feature/UI check receives one targeted repair and another review. Missing, incomplete or unreviewed output returns a structured 502; it never becomes a generic fallback success. Full hubs have a larger output budget, without smaller truncated retries. Explicit user layout, colors, labels and language take priority over defaults.

The full accepted prompt, context and correction input are preserved. Missing game-specific evidence produces clearly unavailable controls and a feature checklist; standard client/UI functions do not require a game scan. The model and source-evidence checks are static, not an execution guarantee. With `APINEX_API_KEY` configured, the backend selects APInex's `free/gpt-6-luna`; otherwise it uses the existing OpenRouter free Dots route. Each credential is bound to its own fixed provider origin, and redirects are rejected. No paid route or automatic provider switch is used. Credentials stay server-side in the existing Vercel API project.

`GET /api/health` reports service configuration, not provider availability. `GET /api/research-game` identifies a game. `POST /api/guest-chat` accepts build/fix requests. Static review is a rejection check, not proof that a generated script runs correctly inside Roblox.

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` to validate. The existing Vercel project is `ahmed-601f/scriptrush` (`prj_Uz3JWo9bdfHf9xgCY3SGqCS6Oc7u`), root `.` when uploading this directory, Node.js 22. Do not deploy the frontend wrapper as the API or rewrite the API back to itself.

Deploy with `--prod --skip-domain`, verify the unique deployment URL, then assign only `scriptrush-api.vercel.app` to that verified deployment. Keep the prior alias target for rollback. No private environment values belong in Git or deployment uploads.
