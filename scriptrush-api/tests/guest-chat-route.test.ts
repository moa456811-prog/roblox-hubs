import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import { z } from "zod";
import type { GenerationContext, GenerationOutcome, ModelCall } from "../src/lib/generation.ts";

type RouteMocks = {
  outcome?: GenerationOutcome;
  profile?: Record<string, unknown> | null;
  curated?: Record<string, unknown> | null;
  researchError?: Error;
};
const generationProfile = { quality: { verification: "composition-structure-only", checks: [{ requirement: "window.title", passed: true }] }, knowledge: { retrievedSources: [], verifiedGameMechanics: false } };
const result = (): GenerationOutcome => ({
  script: 'local gui = Instance.new("ScreenGui")\nprint("fixture output")', model: "fixture-ai-provider", incomplete: false, issues: [], reason: "",
  contract: { fullHub: true, features: [{ id: "interface", label: "Interface", behavior: "Create the requested UI", availability: "supported", evidence: "Standard UI API", interaction: false }], ui: { instructions: "Preserve exact requested design", requiredText: ["My Hub"] } },
  coverage: { features: [{ id: "interface", label: "Interface", status: "implemented" }], uiVerified: true }, repaired: false, strategy: "requirements-coverage-review",
  usage: { modelCalls: 3, inputCharacters: 2500, outputCharacters: 1400 }, profile: generationProfile,
});

/** Execute the real route body; replace imports only so no model, research network or memory service is contacted. */
async function route(mocks: RouteMocks = {}) {
  const calls: GenerationContext[] = [];
  let researchCalls = 0;
  const fakeModel: ModelCall = async () => { throw new Error("The route must pass the provider to generation, not invoke it independently"); };
  const key = `__scriptrushGuestRouteTest_${randomUUID().replaceAll("-", "")}`;
  const registry = globalThis as unknown as Record<string, unknown>;
  registry[key] = {
    NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) }, z,
    runModel: fakeModel,
    generateCompleteScript: async (context: GenerationContext, model: ModelCall, deadline: number) => {
      calls.push(context); assert.equal(model, fakeModel);
      assert.ok(deadline > Date.now()); assert.ok(deadline <= Date.now() + 285_000);
      return mocks.outcome ?? result();
    },
    researchGame: async () => { researchCalls++; if (mocks.researchError) throw mocks.researchError; return mocks.profile ?? null; },
    publicResearchView: (profile: unknown) => profile,
    curatedGameKnowledge: () => mocks.curated ?? null,
    gameAdapterFor: () => null,
    mergeResearchKnowledge: (curated: unknown, researched: unknown) => researched ?? curated,
  };
  const source = readFileSync(new URL("../src/app/api/guest-chat/route.ts", import.meta.url), "utf8");
  const withoutImports = source.replace(/^import .*?;\r?\n/gm, "");
  const injected = `const { NextResponse, z, runModel, generateCompleteScript, researchGame, publicResearchView, curatedGameKnowledge, gameAdapterFor, mergeResearchKnowledge } = globalThis[${JSON.stringify(key)}];\n${withoutImports}`;
  try {
    const js = stripTypeScriptTypes(injected, { mode: "strip" });
    const handlers = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`) as { POST(request: Request): Promise<Response> };
    return { POST: handlers.POST, calls, researchCalls: () => researchCalls, dispose: () => { delete registry[key]; } };
  } catch (error) { delete registry[key]; throw error; }
}

const request = (body: unknown, signal?: AbortSignal) => new Request("https://scriptrush.test/api/guest-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
const fullHub = { game: "Anime Zero [Void Arbiter]", placeId: "123456", mode: "build", prompt: 'Full hub, custom title "My Hub", size 480 by 360, Auto Farm, Auto Boss, Quest Farm, Auto Loot. English UI.', sources: [] };

test("the public Full Hub route always invokes generation even when research finds no game evidence", async () => {
  const handler = await route();
  try {
    const response = await handler.POST(request(fullHub));
    assert.equal(response.status, 200); assert.equal(handler.researchCalls(), 1); assert.equal(handler.calls.length, 1);
    const context = handler.calls[0];
    assert.equal(context.prompt, fullHub.prompt); assert.equal(context.patch, false); assert.deepEqual(context.supportedFeatures, []);
    assert.equal(context.sources, ""); assert.equal(Object.hasOwn(context, "gameEvidence"), false);
    const body = await response.json();
    assert.equal(body.model, "fixture-ai-provider"); assert.equal(body.usage.modelCalls, 3); assert.equal(body.plan.mode, "requirements-build");
    assert.deepEqual(body.generationProfile, generationProfile); assert.deepEqual(body.plan.gameProfile, generationProfile);
    assert.match(body.message, /```lua/); assert.equal(body.review.passed, true);
  } finally { handler.dispose(); }
});

test("unavailable public research still passes the original requested design and sources to AI generation", async () => {
  const handler = await route({ researchError: new Error("Research temporarily unavailable") });
  const body = { ...fullHub, prompt: 'Full hub titled "Étoile Royale", accent #b578ff. Fix no unrelated UI.', sources: [{ name: "owned-reference.lua", content: '-- Preserve provided evidence\nprint("owned")', size: 50 }], runtimeDiagnostic: "An observed error report" };
  try {
    const response = await handler.POST(request(body));
    assert.equal(response.status, 200); assert.equal(handler.calls.length, 1);
    assert.equal(handler.calls[0].prompt, body.prompt); assert.match(handler.calls[0].sources, /owned-reference\.lua/);
    assert.ok(handler.calls[0].sources.includes(body.sources[0].content)); assert.equal(handler.calls[0].diagnostic, body.runtimeDiagnostic);
  } finally { handler.dispose(); }
});

test("fix mode sends the existing complete script and preserves quality diagnostics for a targeted correction", async () => {
  const failed = { ...result(), script: "", coverage: null, reason: "REQUIREMENTS_NOT_MET", issues: ["Jump Power: matching control missing"] };
  const handler = await route({ outcome: failed });
  const currentScript = '-- existing complete UI\nlocal title = "Étoile Royale"\nprint(title)';
  try {
    const response = await handler.POST(request({ ...fullHub, mode: "fix", currentScript, prompt: "Fix only Jump Power and preserve the UI" }));
    assert.equal(response.status, 502); assert.equal(handler.calls.length, 1); assert.equal(handler.calls[0].patch, true);
    assert.equal(handler.calls[0].currentScript, currentScript);
    const body = await response.json();
    assert.equal(body.code, "REQUIREMENTS_NOT_MET"); assert.deepEqual(body.review.issues, failed.issues); assert.equal(body.usage.modelCalls, 3);
    assert.deepEqual(body.generationProfile, generationProfile); assert.equal(body.patchMode, true);
  } finally { handler.dispose(); }
});

test("invalid AI data remains an actual model-output failure with usage and quality metadata", async () => {
  for (const reason of ["MODEL_OUTPUT_INVALID", "INCOMPLETE_RESPONSE"]) {
    const handler = await route({ outcome: { ...result(), reason, script: "", coverage: null, issues: ["Unable to validate complete AI output"] } });
    try {
      const response = await handler.POST(request(fullHub)); const body = await response.json();
      assert.equal(response.status, 502); assert.equal(handler.calls.length, 1); assert.equal(body.code, reason);
      assert.equal(body.usage.modelCalls, 3); assert.deepEqual(body.generationProfile, generationProfile);
      assert.doesNotMatch(body.error, /skipped|before writing|no further automatic/);
    } finally { handler.dispose(); }
  }
});

test("invalid input and cancelled requests never consume model generation", async () => {
  const handler = await route();
  try {
    const invalid = await handler.POST(request({ ...fullHub, prompt: "" })); assert.equal(invalid.status, 400);
    const controller = new AbortController(); controller.abort();
    const cancelled = await handler.POST(request(fullHub, controller.signal)); assert.equal(cancelled.status, 499);
    assert.equal(handler.calls.length, 0);
  } finally { handler.dispose(); }
});
