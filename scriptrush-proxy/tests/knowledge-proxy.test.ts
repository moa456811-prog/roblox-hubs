import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeOrigin, knowledgeRoute, proxyKnowledge } from "../lib/knowledge-proxy.ts";

const token = "t".repeat(43), job = "job-12345678";
const endpoint = (suffix = "") => ["generations", job, ...suffix ? [suffix] : []];

test("v2 proxy forwards only the exact bounded capability to a fixed origin", async () => {
  const body = JSON.stringify({ idempotencyKey: "operation-12345678" });
  const response = await proxyKnowledge(new Request("https://site.test/api/v2/generations/" + job + "/advance", { method: "POST", body, headers: { authorization: "Bearer " + token, cookie: "private-cookie", "x-api-key": "private-key" } }), endpoint("advance"), async (url, init) => {
    assert.equal(url, "https://scriptrush-api.vercel.app/api/v2/generations/" + job + "/advance");
    assert.deepEqual(init?.headers, { accept: "application/json", authorization: "Bearer " + token, "content-type": "application/json" });
    assert.equal(init?.body, body); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    return Response.json({ id: job, revision: 1 }, { headers: { "set-cookie": "private-upstream-cookie" } });
  });
  assert.equal(response.status, 200); assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("creation never forwards unrelated browser authorization and owner routes require a capability", async () => {
  let calls = 0;
  const transport: typeof fetch = async (_url, init) => { calls++; assert.equal(new Headers(init?.headers).get("authorization"), null); return Response.json({ id: job, token }); };
  assert.equal((await proxyKnowledge(new Request("https://site.test/api/v2/generations", { method: "POST", body: "{}", headers: { authorization: "Bearer browser-secret", cookie: "browser-cookie" } }), ["generations"], transport)).status, 200);
  for (const value of [null, "Bearer short", "Basic " + token, "Bearer " + "t".repeat(257), "Bearer token.with.dots"]) {
    const headers: Record<string, string> = value ? { authorization: value } : {};
    assert.equal((await proxyKnowledge(new Request("https://site.test/api/v2/generations/" + job, { headers }), endpoint(), transport)).status, 401);
  }
  assert.equal(calls, 1);
});

test("only known paths, snapshot query values and development loopback overrides are permitted", async () => {
  for (const path of [["..", "private"], ["generations", "..", "files"], endpoint("credentials"), ["generations", job, "files", "extra"]]) assert.equal(knowledgeRoute(path, "GET"), null);
  assert.equal(knowledgeOrigin({ NODE_ENV: "test", SCRIPTRUSH_KNOWLEDGE_API_ORIGIN: "http://127.0.0.1:43210" }), "http://127.0.0.1:43210");
  for (const origin of ["http://127.0.0.1:43210", "https://evil.test", "https://scriptrush-api.vercel.app/path", "https://user:secret@scriptrush-api.vercel.app", "https://scriptrush-api.vercel.app/?key=secret"]) assert.throws(() => knowledgeOrigin({ NODE_ENV: "production", SCRIPTRUSH_KNOWLEDGE_API_ORIGIN: origin }));
  const url = "https://site.test/api/v2/generations/" + job + "/files?snapshotId=snap-1&compareTo=snap-2";
  const response = await proxyKnowledge(new Request(url, { headers: { authorization: "Bearer " + token } }), endpoint("files"), async (destination) => { assert.equal(destination, "https://scriptrush-api.vercel.app/api/v2/generations/" + job + "/files?snapshotId=snap-1&compareTo=snap-2"); return Response.json({ files: [] }); });
  assert.equal(response.status, 200);
  for (const query of ["token=secret", "snapshotId=../private", "snapshotId=snap-1&snapshotId=snap-2"]) assert.equal((await proxyKnowledge(new Request(url.split("?")[0] + "?" + query, { headers: { authorization: "Bearer " + token } }), endpoint("files"), async () => { throw new Error("must not call upstream"); })).status, 400);
});

test("proxy bounds payloads, hides upstream diagnostics and leaves failed jobs resumable", async () => {
  const headers = { authorization: "Bearer " + token };
  assert.equal((await proxyKnowledge(new Request("https://site.test/api/v2/generations", { method: "POST", body: "x".repeat(2_000_001) }), ["generations"], async () => { throw new Error("must not call"); })).status, 413);
  const invalid = await proxyKnowledge(new Request("https://site.test/api/v2/generations/" + job, { headers }), endpoint(), async () => new Response("private provider credential", { status: 500 }));
  assert.equal(invalid.status, 502); assert.doesNotMatch(await invalid.text(), /credential|private provider/);
  const stalled: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }); });
  const keepAlive = setTimeout(() => {}, 1000);
  try { const timeout = await proxyKnowledge(new Request("https://site.test/api/v2/generations/" + job, { headers }), endpoint(), stalled, { timeoutMs: 5 }); assert.equal(timeout.status, 504); assert.match(await timeout.text(), /saved job can be resumed/); }
  finally { clearTimeout(keepAlive); }
});
test("local dynamic V2 routes resolve before the unchanged legacy API destination", async () => {
  const configUrl = new URL("../next.config.mjs", import.meta.url).href;
  const { default: config } = await import(configUrl);
  const rewrites = await config.rewrites();
  assert.equal("afterFiles" in rewrites, false);
  assert.deepEqual(rewrites.fallback, [{ source: "/api/:path*", destination: "https://scriptrush-api.vercel.app/api/:path*" }]);
});
