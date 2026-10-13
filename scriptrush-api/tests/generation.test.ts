import assert from "node:assert/strict";
import test from "node:test";
import { generateCompleteScript } from "../src/lib/generation.ts";
import type { GenerationContext, ModelCall } from "../src/lib/generation.ts";
import { GENERATOR_SYSTEM, PLANNER_SYSTEM, REVIEW_SYSTEM } from "../src/lib/generation-contract.ts";
import { createProviderRunner } from "../src/lib/provider-client.ts";
import type { ProviderConfig } from "../src/lib/provider-config.ts";

const speedCallback = `speed.Activated:Connect(function()
    local character = player.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if humanoid then humanoid.WalkSpeed = 24 end
end)`;
const closeCallback = `close.Activated:Connect(function()
    gui:Destroy()
end)`;
const appliedStyle = "panel.BackgroundColor3 = Color3.fromRGB(18, 24, 42)";
const goodScript = `local Players = game:GetService("Players")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "UtilityHub"
gui.Parent = player:WaitForChild("PlayerGui")
local panel = Instance.new("Frame")
panel.Parent = gui
panel.Size = UDim2.fromOffset(320, 180)
${appliedStyle}
local title = Instance.new("TextLabel")
title.Parent = panel
title.Text = "Utility Hub"
local speed = Instance.new("TextButton")
speed.Parent = panel
speed.Text = "Walk Speed"
${speedCallback}
local close = Instance.new("TextButton")
close.Parent = panel
close.Text = "Close"
${closeCallback}`;
const omittedScript = goodScript.replace(speedCallback, "");

const plan = {
  features: [
    { id: "walk-speed", label: "Walk Speed", behavior: "Click Walk Speed to set the local Humanoid.WalkSpeed to 24.", availability: "supported", evidence: "Standard Roblox client Humanoid and UI APIs.", interaction: true },
    { id: "close", label: "Close", behavior: "Click Close to destroy only this ScreenGui.", availability: "supported", evidence: "Standard Roblox Instance and UI APIs.", interaction: true },
  ],
  ui: { instructions: "Navy panel Color3.fromRGB(18,24,42), title Utility Hub and two working buttons.", requiredText: ["Utility Hub", "Walk Speed", "Close"] },
};

const implementedReview = {
  missingRequirements: [], scopeIssues: [],
  ui: { passed: true, issues: [], evidence: [appliedStyle] },
  features: [
    { id: "walk-speed", status: "implemented", reason: "The button updates the local humanoid in its callback.", behaviorEvidence: "if humanoid then humanoid.WalkSpeed = 24 end", controlEvidence: speedCallback },
    { id: "close", status: "implemented", reason: "The Close callback destroys the owned GUI.", behaviorEvidence: "gui:Destroy()", controlEvidence: closeCallback },
  ],
};
const omittedReview = {
  ...implementedReview,
  features: [
    { id: "walk-speed", status: "missing", reason: "Walk Speed is only a label: its button has no callback or property effect.", behaviorEvidence: "", controlEvidence: "" },
    implementedReview.features[1],
  ],
};

const context = (overrides: Partial<GenerationContext> = {}): GenerationContext => ({
  prompt: "Build a full hub with exactly two working actions: Walk Speed sets the local humanoid speed to 24, and Close destroys this UI. Title: Utility Hub. Navy Color3.fromRGB(18,24,42).",
  currentScript: goodScript, patch: true,
  game: { name: "Test Game", placeId: "123" },
  supportedFeatures: ["Walk Speed", "Close"],
  ledger: "Walk Speed and Close use standard client APIs; no game remotes are needed.",
  sources: "", diagnostic: "", ...overrides,
});

type Call = { system: string; user: string; tokens: number; budget: { timeoutMs: number; deadlineMs: number; attempts: number } };
type Reply = { content: string; model: string; incomplete: boolean } | Error;
const json = (value: unknown): Reply => ({ content: JSON.stringify(value), model: "mock-dots", incomplete: false });
const lua = (code: string): Reply => ({ content: "```lua\n" + code + "\n```", model: "mock-dots", incomplete: false });

function model(replies: Reply[]): { call: ModelCall; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const call: ModelCall = async (system, user, tokens, budget) => {
    calls.push({ system, user, tokens, budget });
    const reply = queue.shift();
    assert.ok(reply, "Unexpected extra model call; only the planned stages are allowed.");
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { call, calls };
}

function accepted(outcome: Awaited<ReturnType<typeof generateCompleteScript>>): boolean {
  return Boolean(outcome.script && !outcome.reason && !outcome.incomplete && !outcome.issues.length && outcome.coverage?.uiVerified);
}

test("existing-script pipeline plans, preserves the implementation and independently reviews behavior", async () => {
  const mock = model([json(plan), lua(goodScript), json(implementedReview)]);
  const deadline = Date.now() + 300000;
  const outcome = await generateCompleteScript(context(), mock.call, deadline);
  assert.equal(accepted(outcome), true);
  assert.equal(outcome.script, goodScript);
  assert.equal(outcome.repaired, false);
  assert.deepEqual(outcome.coverage?.features.map(feature => feature.id), ["walk-speed", "close"]);
  assert.deepEqual(mock.calls.map(call => call.system), [PLANNER_SYSTEM, GENERATOR_SYSTEM, REVIEW_SYSTEM]);
  assert.ok(mock.calls[1].user.includes('"id":"walk-speed"'));
  assert.ok(mock.calls[2].user.includes("ACTUAL GENERATED SCRIPT:\n" + goodScript));
  assert.ok(mock.calls.every(call => call.budget.deadlineMs === deadline && call.budget.attempts === 1));
});

test("one missing behavior triggers a full repair and a new independent review", async () => {
  const mock = model([json(plan), lua(omittedScript), json(omittedReview), lua(goodScript), json(implementedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), true);
  assert.equal(outcome.repaired, true);
  assert.equal(outcome.script, goodScript);
  assert.equal(mock.calls.length, 5);
  assert.equal(mock.calls[2].system, REVIEW_SYSTEM);
  assert.ok(mock.calls[3].system.startsWith(GENERATOR_SYSTEM));
  assert.match(mock.calls[3].system, /REPAIR MODE/);
  assert.match(mock.calls[3].user, /Walk Speed.*no callback/);
  assert.ok(mock.calls[3].user.includes("SCRIPT TO REPAIR:\n" + omittedScript));
  assert.ok(mock.calls[3].user.includes('"id":"close"'), "repair must retain already implemented requirements");
  assert.equal(mock.calls[4].system, REVIEW_SYSTEM);
  assert.ok(mock.calls[4].user.includes("ACTUAL GENERATED SCRIPT:\n" + goodScript));
});

test("an invalid source reference retries the reviewer without rewriting working features", async () => {
  const invalidEvidence = structuredClone(implementedReview);
  invalidEvidence.features[0].behaviorEvidence = "SRC_00000000_001";
  const mock = model([json(plan), lua(goodScript), json(invalidEvidence), json(implementedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), true);
  assert.equal(outcome.repaired, false);
  assert.equal(outcome.script, goodScript);
  assert.equal(mock.calls.filter(call => call.system.startsWith(GENERATOR_SYSTEM)).length, 1);
  assert.equal(mock.calls[3].system, REVIEW_SYSTEM);
  assert.match(mock.calls[3].user, /CORRECT YOUR REVIEW/);
  assert.match(mock.calls[3].user, /SOURCE_CATALOG/);
});

test("repeated omission is rejected after one repair without manufacturing a generic fallback", async () => {
  const mock = model([json(plan), lua(omittedScript), json(omittedReview), lua(omittedScript), json(omittedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), false);
  assert.equal(outcome.reason, "REQUIREMENTS_NOT_MET");
  assert.equal(outcome.repaired, true);
  assert.ok(outcome.issues.some(issue => /Walk Speed/.test(issue)));
  assert.equal(outcome.coverage?.uiVerified, false);
  assert.equal(outcome.script, omittedScript, "do not replace failed output with unrelated generated code");
  assert.doesNotMatch(outcome.model, /fallback/i);
  assert.doesNotMatch(outcome.script, /resilient fallback|Auto Farm|Auto Loot/);
  assert.equal(mock.calls.length, 5, "exactly one targeted repair is allowed");
});

test("a review provider timeout cannot become unreviewed success", async () => {
  const mock = model([json(plan), lua(goodScript), new Error("AI_TIMEOUT")]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(outcome.script, goodScript);
  assert.equal(accepted(outcome), false);
  assert.equal(outcome.reason, "AI_TIMEOUT");
  assert.equal(outcome.coverage, null);
  assert.ok(outcome.issues.includes("AI_TIMEOUT"));
  assert.equal(mock.calls.length, 3);
});

test("failure of the final review rejects even a plausible repaired script", async () => {
  const mock = model([json(plan), lua(omittedScript), json(omittedReview), lua(goodScript), new Error("RATE_LIMITED")]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(outcome.repaired, true);
  assert.equal(outcome.script, goodScript);
  assert.equal(accepted(outcome), false);
  assert.equal(outcome.reason, "RATE_LIMITED");
  assert.equal(outcome.coverage, null);
  assert.equal(mock.calls.length, 5);
});

test("every stage retains the full prompt, sources, diagnostic and original fix script", async () => {
  const original = goodScript.replace('title.Text = "Utility Hub"', 'title.Text = "Current Utility Hub"');
  const prompt = "Preserve the existing UI and both working behaviors. " + "Additional context. ".repeat(600) + "\nFINAL REQUEST: show Utility Hub, navy Color3.fromRGB(18,24,42), Walk Speed and Close.";
  const sources = "--- first.txt ---\n" + "source-one-Ω ".repeat(6000) + "\n--- last.lua ---\n" + "source-two ".repeat(6000) + "\nSOURCE-END-SENTINEL";
  const diagnostic = "Diagnostic start\n" + "D".repeat(8000) + "\nDIAGNOSTIC-END-SENTINEL";
  const input = context({ prompt, sources, diagnostic, patch: true, currentScript: original });
  const snapshot = structuredClone(input);
  const mock = model([json(plan), lua(omittedScript), json(omittedReview), lua(goodScript), json(implementedReview)]);
  const outcome = await generateCompleteScript(input, mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), true);
  for (const call of mock.calls) {
    assert.ok(call.user.includes(prompt), "the original request must not be truncated at planning, generation, review or repair");
    assert.ok(call.user.includes(sources), "all supplied source content must be preserved");
    assert.ok(call.user.includes(diagnostic), "the complete diagnostic must be preserved");
    assert.ok(call.user.includes("FULL CURRENT SCRIPT:\n" + original), "each stage needs the complete original version");
  }
  assert.deepEqual(input, snapshot, "generation must not mutate the user's input objects");
});

test("full hub generation and repair keep the same budget of at least 14000 output tokens", async () => {
  const mock = model([json(plan), lua(omittedScript), json(omittedReview), lua(goodScript), json(implementedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), true);
  const writes = mock.calls.filter(call => call.system.startsWith(GENERATOR_SYSTEM));
  assert.equal(writes.length, 2);
  assert.ok(writes[0].tokens >= 14000);
  assert.equal(writes[1].tokens, writes[0].tokens, "repair must not collapse a complete hub into a smaller answer");
  assert.ok(writes.every(call => call.tokens !== 4800 && call.budget.attempts === 1));
});

test("an incomplete provider response is repaired with the same complete-code budget", async () => {
  const first = { ...(lua(goodScript) as Exclude<Reply, Error>), incomplete: true };
  const mock = model([json(plan), first, lua(goodScript), json(implementedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
  assert.equal(accepted(outcome), true);
  assert.equal(outcome.repaired, true);
  assert.match(mock.calls[2].user, /provider response was incomplete/);
  assert.equal(mock.calls[2].tokens, mock.calls[1].tokens);
  assert.ok(mock.calls[2].tokens >= 14000);
  assert.equal(mock.calls[3].system, REVIEW_SYSTEM);
});

test("insufficient remaining deadline rejects omitted behavior instead of starting an unsafe partial repair", async () => {
  const mock = model([json(plan), lua(omittedScript), json(omittedReview)]);
  const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 45000);
  assert.equal(accepted(outcome), false);
  assert.equal(outcome.reason, "REQUIREMENTS_NOT_MET");
  assert.equal(outcome.repaired, false);
  assert.equal(mock.calls.length, 3);
});

test("malformed planning or review JSON never yields accepted code", async () => {
  const badPlan = model([{ content: "not JSON", model: "mock-dots", incomplete: false }, { content: '{"features":', model: "mock-dots", incomplete: false }]);
  const rejectedPlan = await generateCompleteScript(context(), badPlan.call, Date.now() + 300000);
  assert.equal(accepted(rejectedPlan), false);
  assert.equal(rejectedPlan.script, "");
  assert.equal(badPlan.calls.length, 2);
  assert.equal(rejectedPlan.contract, null);
  assert.ok(badPlan.calls.every(call => call.system === PLANNER_SYSTEM));
  const badReview = model([json(plan), lua(goodScript), { content: '{"features":', model: "mock-dots", incomplete: false }, { content: '{"features":', model: "mock-dots", incomplete: false }]);
  const rejectedReview = await generateCompleteScript(context(), badReview.call, Date.now() + 300000);
  assert.equal(accepted(rejectedReview), false);
  assert.equal(rejectedReview.coverage, null);
  assert.ok(rejectedReview.issues.length);
});

test("planner correction does not retry semantic omissions, provider errors or consume the implementation reserve", async () => {
  const incomplete = { ...plan, features: plan.features.slice(0, 1) };
  const duplicate = { ...plan, features: [plan.features[0], plan.features[0]] };
  for (const [reply, reason] of [[json(incomplete), "INCOMPLETE_REQUIREMENTS"], [json(duplicate), "INVALID_REQUIREMENTS"], [new Error("AI_TIMEOUT"), "AI_TIMEOUT"]] as Array<[Reply, string]>) {
    const mock = model([reply]);
    const outcome = await generateCompleteScript(context(), mock.call, Date.now() + 300000);
    assert.equal(outcome.reason, reason);
    assert.equal(outcome.contract, null);
    assert.equal(mock.calls.length, 1);
    assert.equal(outcome.script, "");
  }
  const shortDeadline = model([{ content: "not JSON", model: "mock-dots", incomplete: false }]);
  const rejected = await generateCompleteScript(context(), shortDeadline.call, Date.now() + 180000);
  assert.equal(accepted(rejected), false);
  assert.equal(shortDeadline.calls.length, 1);
});

const transportRoutes: ProviderConfig[] = [
  { name: "apinex", endpoint: "https://api.apinex.bond/v1/chat/completions", model: "free/mock-primary", key: "dummy-primary" },
  { name: "openrouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "mock/secondary:free", key: "dummy-secondary" },
];
const transportCompletion = (content: string) => Response.json({ model: "mock-transport-model", choices: [{ message: { content }, finish_reason: "stop" }] });

test("actual provider fallback completes three generation stages with four HTTP calls and never restarts the completed plan", async () => {
  const replies = [
    Response.json({ error: { message: "quota exhausted" } }, { status: 429, headers: { "retry-after": "60" } }),
    transportCompletion(JSON.stringify(plan)),
    transportCompletion("```lua\n" + goodScript + "\n```"),
    transportCompletion(JSON.stringify(implementedReview)),
  ];
  const sent: Array<{ url: string; model: string; max_tokens: number; messages: Array<{ role: string; content: string }> }> = [];
  const fetcher: typeof globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), ...JSON.parse(String(init?.body)) });
    const response = replies.shift();
    assert.ok(response, "Only the quota fallback, writer and independent reviewer may request output.");
    return response;
  };
  const run = createProviderRunner({ providers: () => transportRoutes, fetch: fetcher });
  const input = context();
  const outcome = await generateCompleteScript(input, run, Date.now() + 300_000);
  assert.equal(accepted(outcome), true);
  assert.equal(outcome.script, goodScript);
  assert.equal(outcome.repaired, false);
  assert.equal(sent.length, 4);
  assert.equal(outcome.usage.modelCalls, 4, "count HTTP attempts rather than three logical pipeline stages");
  assert.ok(outcome.usage.inputCharacters > 0);
  assert.equal(outcome.usage.outputCharacters, JSON.stringify(plan).length + ("```lua\n" + goodScript + "\n```").length + JSON.stringify(implementedReview).length);
  assert.deepEqual(sent.map(request => request.url), [transportRoutes[0].endpoint, transportRoutes[1].endpoint, transportRoutes[1].endpoint, transportRoutes[1].endpoint]);
  assert.ok(sent[0].messages[0].content.startsWith(PLANNER_SYSTEM));
  assert.equal(sent[1].messages[0].content, sent[0].messages[0].content);
  assert.equal(sent[2].messages[0].content, GENERATOR_SYSTEM);
  assert.ok(sent[3].messages[0].content.startsWith(REVIEW_SYSTEM));
  assert.match(sent[3].messages[0].content, /Return the actual value object/);
  assert.equal(sent[0].messages[1].content, sent[1].messages[1].content);
  assert.ok(sent[1].messages[1].content.includes(input.prompt));
  assert.ok(sent[1].messages[1].content.includes("FULL CURRENT SCRIPT:\n" + goodScript));
  assert.equal(sent[0].max_tokens, sent[1].max_tokens);
  assert.ok(sent[2].max_tokens >= 14_000);
  assert.equal(replies.length, 0);
});

test("a warm provider quota cooldown rejects the next generation with zero HTTP calls and zero sent characters", async () => {
  let requests = 0;
  const fetcher: typeof globalThis.fetch = async () => {
    requests++;
    return Response.json({ error: { message: "daily quota exhausted" } }, { status: 429, headers: { "retry-after": "60" } });
  };
  const run = createProviderRunner({ providers: () => [transportRoutes[0]], fetch: fetcher });
  const first = await generateCompleteScript(context(), run, Date.now() + 300_000);
  assert.equal(first.reason, "RATE_LIMITED");
  assert.equal(first.usage.modelCalls, 1);
  assert.ok(first.usage.inputCharacters > 0);
  const next = await generateCompleteScript(context(), run, Date.now() + 300_000);
  assert.equal(accepted(next), false);
  assert.equal(next.reason, "RATE_LIMITED");
  assert.equal(next.script, "");
  assert.equal(next.contract, null);
  assert.deepEqual(next.usage, { modelCalls: 0, inputCharacters: 0, outputCharacters: 0 });
  assert.equal(requests, 1, "the warm cooldown must not probe the exhausted provider again");
});

test("a failed generation accounts for both actual provider quota attempts without a formatting retry or accepted output", async () => {
  const prompts: string[] = [];
  const fetcher: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    prompts.push(body.messages[1].content);
    return Response.json({ error: { message: "quota exhausted" } }, { status: 429, headers: { "retry-after": "60" } });
  };
  const run = createProviderRunner({ providers: () => transportRoutes, fetch: fetcher });
  const outcome = await generateCompleteScript(context(), run, Date.now() + 300_000);
  assert.equal(accepted(outcome), false);
  assert.equal(outcome.reason, "RATE_LIMITED");
  assert.equal(outcome.script, "");
  assert.equal(outcome.contract, null);
  assert.equal(outcome.usage.modelCalls, 2);
  assert.ok(outcome.usage.inputCharacters > 0);
  assert.equal(outcome.usage.outputCharacters, 0);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0], prompts[1]);
});
