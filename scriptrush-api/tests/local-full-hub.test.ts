import assert from "node:assert/strict";
import test from "node:test";
import { appendPreset } from "../../scriptrush-proxy/lib/presets.ts";
import { buildLocalFullHub, isLocalFullHubPrompt, LOCAL_FULL_HUB_PRESET } from "../src/lib/local-full-hub.ts";
import { generateCompleteScript, type GenerationContext } from "../src/lib/generation.ts";

const context = (overrides: Partial<GenerationContext> = {}): GenerationContext => ({ prompt: appendPreset("", "full-hub"), patch: false, currentScript: "", diagnostic: "", game: { name: "Blox Fruits", placeId: "2753915549" }, sources: "", supportedFeatures: ["Auto Farm", "Auto Boss", "Quest Farm", "Auto Loot"], ledger: "Public keyword scores suggest these features; no executable adapters.", ...overrides });

test("the exact shipped Full Hub button matches the zero-AI path without swallowing custom requirements", () => {
  assert.equal(appendPreset("", "full-hub"), LOCAL_FULL_HUB_PRESET);
  assert.equal(isLocalFullHubPrompt(" \r\n" + LOCAL_FULL_HUB_PRESET.replace(/\n/g, "\r\n") + " \r\n"), true);
  for (const prompt of [appendPreset("Make a cyan 420x280 hub titled My Hub.", "full-hub"), LOCAL_FULL_HUB_PRESET + "\nUse a red panel.", LOCAL_FULL_HUB_PRESET.replace("Auto Loot", "Manual Loot")]) {
    assert.equal(isLocalFullHubPrompt(prompt), false);
    assert.equal(buildLocalFullHub(context({ prompt })), null);
  }
});

test("Full Hub button succeeds with zero model calls and independently usable local controls", async () => {
  let calls = 0;
  const result = await generateCompleteScript(context(), async () => { calls++; throw new Error("Unexpected billable model call"); }, Date.now() + 300000);
  assert.equal(calls, 0);
  assert.equal(result.strategy, "local-profile-hub");
  assert.equal(result.model, "none");
  assert.deepEqual(result.usage, { modelCalls: 0, inputCharacters: 0, outputCharacters: 0 });
  assert.deepEqual(result.issues, []);
  assert.equal(result.coverage?.uiVerified, true);
  assert.equal(result.coverage?.features.length, 9);
  assert.deepEqual(result.coverage?.features.filter(item => item.status === "unavailable").map(item => item.id), ["auto-farm", "auto-boss", "quest-farm", "auto-loot"]);
  for (const item of result.coverage!.features.filter(item => item.status === "unavailable")) assert.match(item.reason!, /^Needs game profile:/);
  assert.doesNotMatch(result.script, /FireServer|InvokeServer|HttpGet|loadstring/);
  assert.match(result.script, /humanoid\.WalkSpeed = value/);
  assert.match(result.script, /humanoid\.UseJumpPower = true/);
  assert.match(result.script, /TeleportService:Teleport\(game.PlaceId, player\)/);
  assert.match(result.script, /Created by a7med_o6t/);
});

test("scanner counts and claimed research support never enable game actions", async () => {
  const sources = '--- scriptrush-runtime-profile.json ---\n' + JSON.stringify({ game: { name: "Blox Fruits", placeId: 2753915549 }, counts: { npcs: 300, bosses: 20, remotes: 600 }, featureSignals: [{ feature: "Auto Farm", confidence: "high" }], remotes: [{ path: "ReplicatedStorage.Network.Farm", className: "RemoteEvent" }] });
  const result = await generateCompleteScript(context({ sources }), async () => { throw new Error("Unexpected model call for observation-only profile"); }, Date.now() + 300000);
  assert.equal(result.strategy, "local-profile-hub");
  assert.equal(result.usage.modelCalls, 0);
  assert.equal(result.coverage?.features.filter(item => item.status === "unavailable").length, 4);
  const spec = buildLocalFullHub(context({ sources }))!.spec;
  assert.deepEqual(spec.pages.map(page => page.label), ["Home", "Farm", "Boss", "Quests", "Loot", "Movement", "Session", "Settings"]);
  assert.equal(spec.pages.flatMap(page => page.items).filter(item => item.kind === "disabled").length, 4);
});

test("code, interaction schemas, recordings, fixes and diagnostics retain contextual analysis", () => {
  const sources = [
    '--- client.lua ---\nremote:FireServer("Pickup", dropId)',
    '--- profile.json ---\n' + JSON.stringify({ game: { placeId: 123 }, network: { remotes: [{ path: "ReplicatedStorage.Pickup", payload: { dropId: "string" } }] } }),
    '--- profile.json ---\n' + JSON.stringify({ game: { placeId: 123 }, records: [{ before: {}, after: {} }] }),
  ];
  for (const source of sources) assert.equal(buildLocalFullHub(context({ sources: source })), null);
  assert.equal(buildLocalFullHub(context({ patch: true, currentScript: "old script" })), null);
  assert.equal(buildLocalFullHub(context({ diagnostic: "attempt to index nil" })), null);
});

test("the shipped scanner observation schema with no guided flow uses zero model calls", async () => {
  const sources = '--- scriptrush-runtime-profile.json ---\n' + JSON.stringify({
    version: "2.0", type: "live-client-read-only", game: { placeId: "2753915549", universeId: "994732206" },
    capabilities: { executor: "unknown", clipboard: false, writefile: false, gethui: false, remoteObservationOnly: true },
    scan: { mode: "quick", counts: { instances: 100, remotes: 5 }, remotes: [{ path: "ReplicatedStorage.Network", className: "RemoteEvent" }] },
    features: [{ key: "farm", label: "Auto Farm", score: 80, confidence: "high", evidence: ["NPC candidates: 16"] }],
    generatedAt: 1791842400, guided: null,
  });
  let calls = 0;
  const result = await generateCompleteScript(context({ sources }), async () => { calls++; throw new Error("Unexpected model call"); }, Date.now() + 300000);
  assert.equal(calls, 0);
  assert.equal(result.strategy, "local-profile-hub");
  assert.equal(result.coverage?.features.filter(item => item.status === "unavailable").length, 4);
});

test("guided scanner flows and unfamiliar JSON fields defer to contextual analysis", () => {
  const profile = { version: "2.0", type: "live-client-read-only", game: { placeId: "2753915549" }, scan: { mode: "deep" }, guided: null };
  for (const extra of [
    { guided: { gui: { changed: [{ path: "PlayerGui.Quest", before: "0", after: "1" }] } } },
    { guided: [{ before: {}, after: {} }] },
    { customUi: { title: "My Hub", accent: "cyan" } },
    { additionalEvidence: null },
  ]) {
    const sources = '--- profile.json ---\n' + JSON.stringify({ ...profile, ...extra });
    assert.equal(buildLocalFullHub(context({ sources })), null);
  }
});

test("code fields inside otherwise observational JSON never get silently discarded", () => {
  for (const key of ["script", "scripts", "snippet", "snippets", "scriptSource", "lua", "luau", "body", "implementation", "source", "code"]) {
    for (const value of [
      { game: { placeId: "2753915549" }, [key]: "remote:FireServer(1)" },
      { game: { placeId: "2753915549" }, scan: { remotes: [{ path: "ReplicatedStorage.Pickup", [key]: "remote:FireServer(1)" }] } },
    ]) {
      const sources = '--- profile.json ---\n' + JSON.stringify(value);
      assert.equal(buildLocalFullHub(context({ sources })), null, key);
    }
  }
});

test("game display names are Lua-escaped and do not inject code", () => {
  const result = buildLocalFullHub(context({ game: { name: 'Odd " Game\nprint("bad")', placeId: "1" } }))!;
  assert.match(result.script, /Odd \\" Game\\010print\(\\"bad\\"\)/);
  assert.equal(result.contract.ui.requiredText[0], "A7DEV");
});

test("French game proper names remain exact without rejecting the English functional UI", async () => {
  const name = "Bienvenue à Bloxburg";
  let calls = 0;
  const result = await generateCompleteScript(context({ game: { name, placeId: "185655149" } }), async () => { calls++; throw new Error("Unexpected model call"); }, Date.now() + 300000);
  assert.equal(calls, 0);
  assert.equal(result.strategy, "local-profile-hub");
  assert.match(result.script, /Game: Bienvenue à Bloxburg/);
  assert.equal(result.coverage?.uiVerified, true);
  const local = buildLocalFullHub(context({ game: { name } }))!;
  assert.deepEqual(local.spec.pages.map(page => page.label), ["Home", "Farm", "Boss", "Quests", "Loot", "Movement", "Session", "Settings"]);
});

test("an aborted request performs no model call or local build", async () => {
  const abort = new AbortController();
  abort.abort(new DOMException("Stopped", "AbortError"));
  let calls = 0;
  await assert.rejects(generateCompleteScript(context({ signal: abort.signal }), async () => { calls++; throw new Error("Unexpected call"); }, Date.now() + 300000), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("abort after a completed planner prevents composer/review/repair calls", async () => {
  const abort = new AbortController();
  let calls = 0;
  await assert.rejects(generateCompleteScript(context({ prompt: "Custom blue full hub", signal: abort.signal }), async (_system, _user, _tokens, budget) => {
    assert.equal(budget.signal, abort.signal);
    calls++;
    abort.abort(new DOMException("Stopped", "AbortError"));
    return { content: "{}", model: "mock", incomplete: false };
  }, Date.now() + 300000), { name: "AbortError" });
  assert.equal(calls, 1);
});
