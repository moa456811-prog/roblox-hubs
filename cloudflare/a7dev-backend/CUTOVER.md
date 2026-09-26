# Cloudflare primary, Supabase relay and fallback

The user authorized production cutover on 2026-09-25 after the staging import. The deployed Worker uses src/production.js. The existing Supabase secure API address now forwards requests to Cloudflare. Existing Loader, legacy per-game bootstrap function and GitHub loadstrings remain byte-for-byte unchanged.

Cloudflare D1 supplies access records and active script pointers; private R2 supplies verified source objects. New sessions are issued by Cloudflare for 24 hours, retaining permanent-access flags. Supabase remains the relay for the unchanged URLs and the automatic fallback. This preserves compatibility; it does not remove dependency on Supabase's public endpoint.

## Failover and sessions

The relay uses Cloudflare first. Network failures, timeouts, redirects and server errors fall back to the original Supabase implementation. Authentication denials, missing grants and rate limits remain denials; they do not trigger another authorization attempt.

New a7cf1 sessions use Ed25519. The private signing key exists only in Cloudflare secret configuration. Supabase receives the public verification key, so it accepts existing Cloudflare sessions during a Cloudflare outage without calling Cloudflare. Old a7v2 Supabase sessions continue to validate through the authenticated compatibility bridge. Existing legacy hashed sessions keep their original expirations.

The public health endpoint now reports ready=true after checking D1 and R2. Administrative script-management endpoints remain authenticated. Preparation-only test routes are absent.

## Checks performed

- Nine active sources match authoritative Supabase SHA-256 values and the delivered source on both Cloudflare and independently forced Supabase fallback.
- The six permanent grants and expired grant match the source snapshot. A fresh pre-cutover query found no grant changes.
- The 60 imported legacy session records remain intact. At cutover 55 were still valid at source, and there were no new unimported records.
- New Cloudflare sessions are accepted by both backends; wrong-user and modified-token requests are rejected by both.
- Old Supabase sessions are accepted by Cloudflare through the unchanged public API address.
- Local tests cover session signatures, expiry, user identity, Work.ink request/response behavior with a mock upstream, and failover routing for network/server failures versus authorization denials.
- The Work.ink URL, token extraction and consume-on-validation behavior match the original implementation. No real user's valid Work.ink token was consumed for testing.
- Gameplay source and UI code were not modified. In-game execution was not available for this infrastructure check.

## Reproducing the deployment

Use the production entrypoint and preserve existing Worker secrets. SESSION_ED25519_PRIVATE is base64url PKCS8; SESSION_ED25519_PUBLIC is the corresponding base64url raw public key. Do not rotate keys during routine script updates. Keep SESSION_SIGNING_KEY for preparation-issued session compatibility and LEGACY_BRIDGE_TOKEN for the existing Supabase bridge.

Export the original Supabase function privately. Run supabase/prepare-legacy.py with its index.ts, the public verification key and an output path outside the repository. Deploy that output as legacy.ts, src/session-verifier.js, router.ts derived from supabase/router.example.ts, the original deno.json, and cutover-entry.example.ts as index.ts. Configure the Cloudflare endpoint privately or substitute it in the deployment-only router. Set import_map_path explicitly to deno.json. Never publish the original backend export: it embeds protected game content.

## Rollback

Redeploy the relay using rollback-entry.example.ts as index.ts, retaining legacy.ts and session-verifier.js. This restores direct Supabase serving while accepting already-issued Cloudflare sessions. Do not restore the older function without the added public-key verifier, as that would reject those sessions.

Script updates must keep the Supabase fallback version aligned until fallback is deliberately retired. D1 and Supabase are not continuously replicated. Stage and verify changes, preserve the previous version, update the fallback copy, then activate the new Cloudflare version. Apply access grants/revocations to both stores during this transition.
