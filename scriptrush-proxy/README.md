# ScriptRush web

Next.js App Router frontend for ScriptRush. All interface copy is English; accounts, email, billing and quotas are absent from this frontend.

## Architecture

- `/`: product introduction and Create / Learn / Fix entry points.
- `/create`: game identification, optional text sources and runtime profile, generation, validated single-script output.
- `/learn`: live scanner retrieval, safe report import, evidence summary and local profile management.
- `/fix`: complete current-script correction, comparison, new versions and rollback.
- `/history`: browser-local versions, import/export and recovery actions.
- `components/`: shared navigation, controls, output editor, states and profile presentation.
- `workflows/`: client interactions shared by route pages.
- `lib/`: typed API contracts, storage/migration, response validation and server-only scanner privacy adapter.

React renders all imported text as text. No generated code runs in the browser. No model credentials are required by, or exposed to, the frontend.

## Service integration

`next.config.mjs` rewrites `/api/*` directly to `https://scriptrush-api.vercel.app/api/*`. The explicit `/api/scanner` route takes precedence and retrieves the existing scanner from `https://scriptrush-live-scanner.vercel.app/api/scanner`.

Used endpoints:

- `GET /api/research-game?q=...`
- `POST /api/guest-chat`: `mode: build` or `mode: fix`, full `currentScript` for fixes, optional named runtime-profile source.
- `GET /api/scanner`

The scanner adapter preserves its interface and report format, excludes private/player-input subtrees, and redacts observed identities and sensitive values. It is locked to the reviewed upstream SHA-256 and fails closed if that source changes. Re-review the new source and update the fixture/hash together when upgrading the scanner. It adds no remote invocation, network requests or file reads to the scanner.

## Local data

The versioned store uses `scriptrush_history_v2` and retains the most recent 25 versions. Legacy `sr_game`, `sr_place`, `scriptrush_current_script`, and `scriptrush_runtime_profile` are copied without removing or truncating the old values. Corrupt data is retained for recovery; failed imports do not replace valid history. Fix requests and edited script drafts are preserved separately from the saved current version.

History is local to this browser. Export it before clearing site data or moving to a different device.

## Development and validation

Requires Node.js 24.

```sh
npm install
npm run dev
npm run test
npm run typecheck
npm run build
```

Tests cover migration, corruption/write failures, history/version recovery, request contracts, abort/timeout behavior, complete-code validation and scanner privacy transformation. Browser acceptance checks use real service calls in addition to synthetic report imports.

Validation checks code fences, placeholders, obvious truncation and lexical structure. They do not claim a full Luau typecheck or a test inside the Roblox client. Progress reports observed frontend phases and an indeterminate backend working state; elapsed time never fabricates completed backend stages.

## Canonical deployment

Existing project: `ahmed-601f/scriptrush-clear-ui` (`prj_h1pY21Aw8ObcDJvVvBqzaMY1LnBh`). Its root is `.` for deployments uploaded from this directory. Do not upload the monorepo with this root or create replacement frontend projects.

```sh
vercel link --project scriptrush-clear-ui --scope ahmed-601f --yes
vercel project inspect --scope ahmed-601f --non-interactive
vercel deploy --prod --skip-domain --scope ahmed-601f --non-interactive
```

Wait for READY, smoke-test the deployment, then promote that production build and verify `scriptrush.vercel.app`. Keep the prior deployment available for rollback. `.vercel`, environment files, dependencies and test artifacts are excluded from source control and deployment uploads.
