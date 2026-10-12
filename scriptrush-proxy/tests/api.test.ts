import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, fetchScanner, generateScript, generationNotice, researchGame } from "../lib/api.ts";
import type { GenerationCoverage } from "../lib/coverage.ts";
import { createProfileSource, parseRuntimeProfile, ValidationError } from "../lib/validation.ts";
import type { GenerationRequest } from "../lib/types.ts";
import { appendPreset } from "../lib/presets.ts";

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

test("Full Hub sends the original French visual requirements, English UI instruction and every expanded feature to the API", async () => {
  const restoreFetch = globalThis.fetch;
  const requirements = 'Interface bleu nuit et cyan, panneau 420x280. Titre exact "Mon Hub", jeu "Étoile Royale". Onglets à gauche.';
  const prompt = appendPreset(requirements, "full-hub");
  globalThis.fetch = async (_url, init) => {
    const posted = JSON.parse(String(init?.body));
    assert.equal(posted.prompt, prompt);
    assert.ok(posted.prompt.startsWith(requirements));
    assert.ok(posted.prompt.includes("Generate functional UI in English"));
    assert.ok(posted.prompt.includes("even if the request is in French"));
    assert.ok(posted.prompt.includes("Preserve custom hub titles, game names and other proper names exactly"));
    for (const feature of ["Auto Farm", "Auto Boss", "Quest Farm", "Auto Loot", "Settings"]) assert.ok(posted.prompt.includes(feature));
    return Response.json(response);
  };
  try { await generateScript({ ...build, prompt }); }
  finally { globalThis.fetch = restoreFetch; }
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

test("unmet requirements return a precise safe error and preserve the complete fix input", async () => {
  const restoreFetch = globalThis.fetch;
  const body: GenerationRequest = { ...build, mode: "fix", prompt: "Keep the UI and fix only the farm", currentScript: "\n-- original UI\r\nprint('keep')\n" };
  const snapshot = JSON.stringify(body);
  globalThis.fetch = async () => Response.json({
    code: "REQUIREMENTS_NOT_MET",
    error: "model timeout <script>alert('private server detail')</script>",
    issues: ["Private provider output", { __html: "attacker-controlled HTML" }],
  }, { status: 502 });
  try {
    await assert.rejects(generateScript(body), (issue: unknown) => {
      assert.ok(issue instanceof ApiError);
      assert.equal(issue.code, "requirements_not_met");
      assert.equal(issue.status, 502);
      assert.equal(issue.message, "Script validation stopped. Your input and previous script were preserved. The service could not confirm all requested features and UI details. Review these checks before starting another generation.");
      assert.deepEqual(issue.issues, []);
      assert.equal(issue.usage, undefined);
      return true;
    });
    assert.equal(JSON.stringify(body), snapshot);
    globalThis.fetch = async () => Response.json({ code: "requirements_not_met", error: "private server detail" }, { status: 502 });
    await assert.rejects(generateScript(body), (issue: unknown) => issue instanceof ApiError && issue.code === "generate_unavailable" && !issue.message.includes("private server detail"));
  } finally { globalThis.fetch = restoreFetch; }
});

test("unmet requirements show bounded review checks and measured model calls without another request", async () => {
  const restoreFetch = globalThis.fetch;
  let requests = 0;
  const usage = { modelCalls: 3, inputCharacters: 12345, outputCharacters: 9876 };
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ code: "REQUIREMENTS_NOT_MET", review: { issues: ["Jump Power: matching control missing", "required UI text missing: Close"] }, usage }, { status: 502 });
  };
  try {
    await assert.rejects(generateScript(build), (issue: unknown) => {
      assert.ok(issue instanceof ApiError);
      assert.deepEqual(issue.issues, ["Jump Power: matching control missing", "required UI text missing: Close"]);
      assert.deepEqual(issue.usage, usage);
      assert.ok(issue.message.includes("Jump Power: matching control missing"));
      assert.ok(issue.message.includes("AI calls: 3."));
      assert.ok(!/please try again|clearer requirements/i.test(issue.message));
      return true;
    });
    assert.equal(requests, 1);
  } finally { globalThis.fetch = restoreFetch; }
});

test("backend rate-limit reasons retain measured usage and avoid exposing provider error bodies", async () => {
  const restoreFetch = globalThis.fetch;
  const usage = { modelCalls: 1, inputCharacters: 300, outputCharacters: 0 };
  globalThis.fetch = async () => Response.json({ code: "GENERATION_REJECTED", reason: "RATE_LIMITED", error: "private upstream details", usage }, { status: 502 });
  try {
    await assert.rejects(generateScript(build), (issue: unknown) => issue instanceof ApiError && issue.code === "rate_limited" && issue.usage?.modelCalls === 1 && issue.message.includes("AI calls: 1.") && !issue.message.includes("private upstream"));
  } finally { globalThis.fetch = restoreFetch; }
});

test("generation notices count implemented and unavailable features and require target game testing", () => {
  const coverage: GenerationCoverage = { features: [
    { id: "farm", label: "Farm", status: "implemented" },
    { id: "ui", label: "UI", status: "implemented" },
    { id: "boss", label: "Boss", status: "unavailable", reason: "Missing evidence" },
  ], uiVerified: true };
  const summary = "Script ready. 2 requested features implemented; 1 need more game evidence. See the feature checklist below.";
  assert.equal(generationNotice(coverage, true, true), summary + " Saved as a new version. Test it in the target game to confirm behavior.");
  assert.equal(generationNotice(coverage, true, false), summary + " It could not be saved to History. Copy or download it to keep a backup. Test it in the target game to confirm behavior.");
});

test("generation notices retain UI and coverage uncertainty even when saving fails", () => {
  const coverage: GenerationCoverage = { features: [{ id: "farm", label: "Farm", status: "unavailable" }], uiVerified: false };
  for (const saved of [true, false]) {
    assert.ok(generationNotice(coverage, true, saved).includes("The requested UI needs verification."));
    assert.ok(generationNotice({ features: [], uiVerified: false }, true, saved).includes("The requested UI needs verification"));
    assert.ok(generationNotice(null, true, saved).includes("its feature coverage could not be verified"));
  }
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
    t.mock.timers.tick(304999);
    assert.equal(requestSignal?.aborted, false);
    t.mock.timers.tick(1);
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

test("game research retains its separate 45 second deadline", async (t) => {
  const restoreFetch = globalThis.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => requestSignal?.addEventListener("abort", () => reject(new DOMException("Abort", "AbortError")), { once: true }));
  };
  try {
    const waiting = researchGame("Known Game");
    const rejected = assert.rejects(waiting, (issue: unknown) => issue instanceof ApiError && issue.code === "timeout");
    t.mock.timers.tick(44999);
    assert.equal(requestSignal?.aborted, false);
    t.mock.timers.tick(1);
    await rejected;
    assert.equal(requestSignal?.aborted, true);
  } finally { t.mock.timers.reset(); globalThis.fetch = restoreFetch; }
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
