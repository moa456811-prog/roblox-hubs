import test from "node:test";
import assert from "node:assert/strict";
import { GENERATION_PROXY_TIMEOUT_MS, proxyGeneration } from "../lib/guest-chat-proxy.ts";

test("generation proxy preserves the full request and reviewed response, without forwarding browser credentials", async () => {
  const body = JSON.stringify({ prompt: "Hub bleu nuit, quatre fonctions. ".repeat(500), currentScript: "-- complete script\n".repeat(5000) });
  const output = { script: "local gui = Instance.new('ScreenGui')", review: { passed: true }, coverage: { features: [] } };
  const response = await proxyGeneration(new Request("https://frontend.test/api/guest-chat", { method: "POST", body, headers: { cookie: "private", authorization: "private" } }), async (url, init) => {
    assert.equal(url, "https://scriptrush-api.vercel.app/api/guest-chat");
    assert.equal(init?.body, body);
    assert.deepEqual(init?.headers, { "content-type": "application/json", accept: "application/json" });
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return Response.json(output, { headers: { "set-cookie": "private" } });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), output);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(GENERATION_PROXY_TIMEOUT_MS > 120_000 && GENERATION_PROXY_TIMEOUT_MS < 300_000);
});

test("generation proxy preserves a rejected requirements review", async () => {
  const failure = { error: "Requested features could not be verified.", code: "REQUIREMENTS_NOT_MET", review: { passed: false } };
  const response = await proxyGeneration(new Request("https://frontend.test/api/guest-chat", { method: "POST", body: "{}" }), async () => Response.json(failure, { status: 502 }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), failure);
});

test("generation proxy hides upstream HTML and invalid JSON", async () => {
  for (const upstream of [new Response("<html>private diagnostic</html>"), new Response("invalid private JSON", { headers: { "content-type": "application/json" } })]) {
    const response = await proxyGeneration(new Request("https://frontend.test/api/guest-chat", { method: "POST", body: "{}" }), async () => upstream);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private/);
  }
});

test("generation proxy aborts a stalled upstream and propagates client cancellation", async () => {
  const stalled: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
  });
  // Keep Node alive until the unref'ed AbortSignal timeout fires.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const timed = await proxyGeneration(new Request("https://frontend.test/api/guest-chat", { method: "POST", body: "{}" }), stalled, 5);
    assert.equal(timed.status, 504);
    const controller = new AbortController();
    const pending = proxyGeneration(new Request("https://frontend.test/api/guest-chat", { method: "POST", body: "{}", signal: controller.signal }), stalled, 1000);
    setTimeout(() => controller.abort(), 5);
    assert.equal((await pending).status, 502);
  } finally { clearTimeout(keepAlive); }
});
