import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchScanner, generateScript, researchGame } from "../lib/api.ts";
import { createProfileSource, parseRuntimeProfile, ValidationError } from "../lib/validation.ts";
import type { GenerationRequest } from "../lib/types.ts";

const response = { message: "```luau\nlocal ready = true\nprint(ready)\n```" };
const build: GenerationRequest = { game: "Known Game", placeId: "123", mode: "build", prompt: "Create a script", sources: [] };

test("build posts the exact generation contract and full runtime source", async () => {
  const restoreFetch = globalThis.fetch;
  const profile = parseRuntimeProfile(JSON.stringify({ game: { placeId: 123, universeId: 456 }, scan: { mode: "deep" }, evidence: "a".repeat(90000) }));
  const profileSource = createProfileSource(profile);
  const body = { ...build, sources: [profileSource, { name: "context.luau", content: "-- file supplied by user\n", size: 25 }] };
  let received: GenerationRequest | undefined;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/guest-chat");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
    assert.ok(init?.signal);
    received = JSON.parse(String(init?.body));
    return Response.json(response);
  };
  try {
    const result = await generateScript(body);
    assert.deepEqual(received, body);
    assert.equal(received?.sources[0].name, "scriptrush-runtime-profile.json");
    assert.equal(received?.sources[0].content, JSON.stringify(profile));
    assert.ok((received?.sources[0].content.length ?? 0) > 76000);
    assert.equal(Object.hasOwn(received!, "currentScript"), false);
    assert.equal(result.script, "local ready = true\nprint(ready)");
    assert.equal(result.message, response.message);
  } finally { globalThis.fetch = restoreFetch; }
});

test("fix sends original whitespace, non-ASCII characters and complete script", async () => {
  const restoreFetch = globalThis.fetch;
  const currentScript = "\n  -- Ω current script\r\n" + "print('keep this system')\r\n".repeat(10000);
  const body: GenerationRequest = { ...build, mode: "fix", prompt: "Fix the error without replacing other systems", currentScript };
  globalThis.fetch = async (_url, init) => {
    const posted = JSON.parse(String(init?.body));
    assert.equal(posted.mode, "fix");
    assert.equal(posted.currentScript, currentScript);
    assert.equal(posted.prompt, body.prompt);
    return Response.json(response);
  };
  try {
    await generateScript(body);
    assert.equal(body.currentScript, currentScript);
    assert.equal(body.prompt, "Fix the error without replacing other systems");
  } finally { globalThis.fetch = restoreFetch; }
});

test("research URL is encoded and number IDs become strings", async () => {
  const restoreFetch = globalThis.fetch;
  const query = "Game & second? / test";
  const featureSignals = [{ key: "farm", confidence: "low" }];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/research-game?q=" + encodeURIComponent(query));
    assert.equal(init?.method, "GET");
    assert.equal(init?.cache, "no-store");
    return Response.json({ profile: { name: "Actual Game", placeId: 123, universeId: 456, featureSignals } });
  };
  try {
    const result = await researchGame("  " + query + "  ");
    assert.equal(result.game, "Actual Game");
    assert.equal(result.placeId, "123");
    assert.equal(result.universeId, "456");
    assert.deepEqual(result.profile.featureSignals, featureSignals);
  } finally { globalThis.fetch = restoreFetch; }
});

test("bad request fields fail before network access and keep caller input intact", async () => {
  const restoreFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(response); };
  try {
    const original = JSON.stringify(build);
    await assert.rejects(generateScript({ ...build, prompt: " " }), ValidationError);
    await assert.rejects(generateScript({ ...build, game: "" }), ValidationError);
    await assert.rejects(generateScript({ ...build, mode: "fix" }), ValidationError);
    await assert.rejects(generateScript({ ...build, sources: Array.from({ length: 7 }, () => ({ name: "file.lua", content: "x", size: 1 })) }), ValidationError);
    await assert.rejects(researchGame(" "), ValidationError);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(build), original);
  } finally { globalThis.fetch = restoreFetch; }
});

test("generation rejects multiple blocks, missing output and truncation flags", async () => {
  const restoreFetch = globalThis.fetch;
  const badResponses = [
    { message: "```lua\nprint(1)\n```\n```lua\nprint(2)\n```" },
    { message: "```lua\nprint(1)\n```", metadata: { finish_reason: "length" } },
    { message: "```lua\nprint(1)\n```", truncated: true },
    { message: "```lua\n-- INSERT_REMOTE here\nprint(1)\n```" },
    { message: "```lua\nfunction unfinished()\n```" },
    { message: "The request finished." },
    { script: "print('wrong field')" },
  ];
  try {
    for (const invalid of badResponses) {
      globalThis.fetch = async () => Response.json(invalid);
      await assert.rejects(generateScript(build), /complete|incomplete|placeholder/);
    }
  } finally { globalThis.fetch = restoreFetch; }
});

test("API rejects the observed generic fallback and failed review without altering the original fix input", async () => {
  const restoreFetch = globalThis.fetch;
  const currentScript = "\n-- keep my original\r\nprint('original')\n";
  const body: GenerationRequest = { ...build, mode: "fix", currentScript, prompt: "Fix only this script" };
  const badResponses = [
    { ...response, model: "scriptrush-resilient-fallback", review: { passed: true, strategy: "deterministic-fallback" } },
    { ...response, model: "other", metadata: { review: { passed: true, strategy: "deterministic-fallback" } } },
    { message: "```lua\n-- ScriptRush resilient fallback\nprint('generic')\n```" },
    { ...response, review: { passed: false, issues: ["Unresolved issue"] } },
  ];
  try {
    for (const invalid of badResponses) {
      globalThis.fetch = async () => Response.json(invalid);
      await assert.rejects(generateScript(body), /fallback|unresolved review/);
      assert.equal(body.currentScript, currentScript);
      assert.equal(body.prompt, "Fix only this script");
    }
    globalThis.fetch = async () => Response.json({ ...response, model: "dots-studio/dots-3-note-preview:free", review: { passed: true } });
    assert.equal((await generateScript(build)).script, "local ready = true\nprint(ready)");
  } finally { globalThis.fetch = restoreFetch; }
});

test("an unchanged fix is rejected instead of creating a misleading corrected version", async () => {
  const restoreFetch = globalThis.fetch;
  const currentScript = "\n  print('current version')\n\n";
  globalThis.fetch = async () => Response.json({ message: "```luau\nprint('current version')\n```", model: "actual-provider", review: { passed: true } });
  try {
    await assert.rejects(generateScript({ ...build, mode: "fix", currentScript }), (issue: unknown) => issue instanceof ApiError && issue.code === "no_changes" && issue.message.includes("current script was preserved"));
    assert.equal(currentScript, "\n  print('current version')\n\n");
    assert.equal((await generateScript(build)).script, "print('current version')");
  } finally { globalThis.fetch = restoreFetch; }
});

test("status errors distinguish timeout, capacity and incomplete model output", async () => {
  const restoreFetch = globalThis.fetch;
  const cases: [number, unknown, string][] = [
    [504, { error: "upstream unavailable" }, "timeout"],
    [408, { error: "request expired" }, "timeout"],
    [429, { error: "busy" }, "rate_limited"],
    [502, { error: "model timeout" }, "timeout"],
    [502, { error: "The model returned truncated output" }, "incomplete_response"],
    [403, { error: "private server details" }, "generate_unavailable"],
  ];
  try {
    for (const [status, body, code] of cases) {
      globalThis.fetch = async () => Response.json(body, { status });
      await assert.rejects(generateScript(build), (issue: unknown) => issue instanceof ApiError && issue.code === code && !issue.message.includes("private server details"));
    }
    globalThis.fetch = async () => new Response("<html>Service crashed</html>", { status: 502 });
    await assert.rejects(generateScript(build), (issue: unknown) => issue instanceof ApiError && issue.code === "generate_unavailable");
    globalThis.fetch = async () => new Response('{"message":', { status: 200 });
    await assert.rejects(generateScript(build), (issue: unknown) => issue instanceof ApiError && issue.code === "invalid_response");
  } finally { globalThis.fetch = restoreFetch; }
});

test("generation enforces its own timeout and aborts the in-flight fetch", async (t) => {
  const restoreFetch = globalThis.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => requestSignal?.addEventListener("abort", () => reject(new DOMException("Abort", "AbortError")), { once: true }));
  };
  try {
    const waiting = generateScript(build);
    const rejected = assert.rejects(waiting, (issue: unknown) => issue instanceof ApiError && issue.code === "timeout");
    t.mock.timers.tick(240000);
    await rejected;
    assert.equal(requestSignal?.aborted, true);
  } finally { t.mock.timers.reset(); globalThis.fetch = restoreFetch; }
});

test("caller cancellation aborts generation, preserving request and source strings", async () => {
  const restoreFetch = globalThis.fetch;
  const body = { ...build, prompt: "Keep this request after Stop", sources: [{ name: "file.lua", content: "\nprint('original')\n", size: 19 }] };
  const snapshot = JSON.stringify(body);
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => requestSignal?.addEventListener("abort", () => reject(new DOMException("Abort", "AbortError")), { once: true }));
  };
  try {
    const controller = new AbortController();
    const waiting = generateScript(body, controller.signal);
    const rejected = assert.rejects(waiting, (issue: unknown) => issue instanceof ApiError && issue.name === "AbortError" && issue.code === "cancelled");
    controller.abort();
    await rejected;
    assert.equal(requestSignal?.aborted, true);
    assert.equal(JSON.stringify(body), snapshot);
  } finally { globalThis.fetch = restoreFetch; }
});

test("scanner result is returned verbatim and cannot be mistaken for current generated code", async () => {
  const restoreFetch = globalThis.fetch;
  const scanner = "\n-- standalone scanner\r\nprint('scan')\n\n";
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "/api/scanner");
    assert.equal(init?.method, "GET");
    return Response.json({ script: scanner });
  };
  try {
    assert.equal(await fetchScanner(), scanner);
    globalThis.fetch = async () => Response.json({ script: "" });
    await assert.rejects(fetchScanner(), (issue: unknown) => issue instanceof ApiError && issue.code === "scanner_unavailable");
  } finally { globalThis.fetch = restoreFetch; }
});
