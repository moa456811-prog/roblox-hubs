# One-time Cloudflare setup

The preparation in this directory does not affect production.

## Minimum user action

Cloudflare requires account authorization. On a Windows PC:

1. Install Node.js if it is not already installed.
2. Open PowerShell in this directory.
3. Run:
   `npx wrangler login`
4. Complete the Cloudflare authorization in the browser.
5. Run:
   `.\\bootstrap.ps1`

The bootstrap then performs the infrastructure work automatically:

- creates/fetches D1 `a7dev-db`;
- updates the local Wrangler D1 binding;
- creates R2 `a7dev-scripts` if missing;
- applies `schema.sql`;
- generates a fresh Worker session signing secret;
- generates an admin API token;
- asks for the existing A7DEV admin key locally and stores only its SHA-256 in Cloudflare;
- deploys the staging Worker;
- keeps the generated admin API token only in a Git-ignored local file.

It does **not** switch A7DEV production.

Do not send the Cloudflare password, API token, A7DEV admin key, or generated admin token through chat.
