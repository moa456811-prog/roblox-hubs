import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceCatalog, PLANNER_SYSTEM, REVIEW_SYSTEM } from "../src/lib/generation-contract.ts";
import { generateCompleteScript, type ModelCall } from "../src/lib/generation.ts";
import { HUB_COMPOSER_SYSTEM, type HubComposition } from "../src/lib/hub-spec.ts";
import { LOCAL_FULL_HUB_PRESET } from "../src/lib/local-full-hub.ts";

const plan = {
  features: [
    { id: "speed", label: "Walk Speed", behavior: "Click Apply to set the current humanoid speed to 24.", availability: "supported", evidence: "Standard client API", interaction: true },
    { id: "close", label: "Close", behavior: "Close destroys the entire UI.", availability: "supported", evidence: "Standard UI API", interaction: true },
  ],
  ui: { instructions: "Utility Hub, 320 by 200, navy Color3.fromRGB(18,24,42).", requiredText: ["Utility Hub", "Walk Speed", "Apply", "Close"] },
};
const spec: HubComposition = {
  window: { title: "Utility Hub", width: 320, height: 200, radius: 8, draggable: true, navigation: "none", font: "Gotham", textSize: 14, closeLabel: "Close", minimizeLabel: null, restoreLabel: "Restore", palette: { background: [18,24,42], foreground: [240,245,255], accent: [85,221,255], control: [30,43,68], muted: [175,191,213] }, alternatePalette: null, featureIds: ["close"] },
  pages: [{ id: "main", label: "Main", featureIds: [], items: [{ id: "speed-input", featureIds: ["speed"], kind: "number", label: "Walk Speed", description: "", applyLabel: "Apply", min: 24, max: 24, initial: 24, action: "walk-speed", code: "" }] }],
};

function review(user: string) {
  const script = user.split("ACTUAL GENERATED SCRIPT:\n")[1].split("\n\nSOURCE_CATALOG")[0];
  const entries = buildSourceCatalog(script);
  const ref = (kind: string, text: string) => {
    const found = entries.find(entry => entry.kind === kind && entry.code.includes(text));
    assert.ok(found, `Missing actual ${kind} evidence for ${text}`);
    return found.id;
  };
  return { missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ref("effect", "panel.Size =")] }, features: [
    { id: "speed", status: "implemented", reason: "Apply writes the current humanoid speed.", behaviorEvidence: ref("effect", "humanoid.WalkSpeed = value"), controlEvidence: ref("control", "humanoid.WalkSpeed = value") },
    { id: "close", status: "implemented", reason: "Closes the entire owned GUI.", behaviorEvidence: ref("effect", "gui:Destroy()"), controlEvidence: ref("control", "closeButton.Activated") },
  ] };
}

const input = { prompt: "Build a full hub titled Utility Hub, size 320 by 200, navy Color3.fromRGB(18,24,42). Walk Speed with Apply sets speed to 24. Close destroys the UI.", patch: false, currentScript: "", game: { name: "Test", placeId: "123" }, supportedFeatures: ["Walk Speed", "Close"], ledger: "Standard Roblox APIs", sources: "", diagnostic: "" };

test("a fresh full hub uses structured composition and reviews all rendered effects", async () => {
  const calls: string[] = [];
  const call: ModelCall = async (system, user) => {
    calls.push(system);
    const content = system === PLANNER_SYSTEM ? plan : system.startsWith(HUB_COMPOSER_SYSTEM) ? spec : review(user);
    if (system.startsWith(HUB_COMPOSER_SYSTEM)) assert.match(user, /HUB COMPOSITION JSON SCHEMA/);
    return { content: JSON.stringify(content), model: "test-provider", incomplete: false };
  };
  const outcome = await generateCompleteScript(input, call, Date.now() + 285000);
  assert.equal(outcome.reason, "");
  assert.equal(outcome.coverage?.uiVerified, true);
  assert.deepEqual(outcome.coverage?.features.map(feature => feature.id), ["speed", "close"]);
  assert.deepEqual(calls, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, REVIEW_SYSTEM]);
  assert.match(outcome.script, /humanoid.WalkSpeed = value/);
});

test("invalid composition shape is repaired once before review without a fallback script", async () => {
  let writes = 0;
  const call: ModelCall = async (system, user) => {
    let content: unknown;
    if (system === PLANNER_SYSTEM) content = plan;
    else if (system.startsWith(HUB_COMPOSER_SYSTEM)) {
      writes++;
      content = writes === 1 ? { ...spec, window: { ...spec.window, palette: [[18,24,42]] } } : spec;
      if (writes === 2) assert.match(user, /window.palette/);
    } else content = review(user);
    return { content: JSON.stringify(content), model: "test-provider", incomplete: false };
  };
  const outcome = await generateCompleteScript(input, call, Date.now() + 285000);
  assert.equal(outcome.reason, "");
  assert.equal(outcome.repaired, true);
  assert.equal(writes, 2);
  assert.equal(outcome.coverage?.features.length, 2);
});

test("missing RGB commas are recovered locally without a paid composition repair", async () => {
  const calls: string[] = [];
  const call: ModelCall = async (system, user) => {
    calls.push(system);
    const content = system === PLANNER_SYSTEM ? JSON.stringify(plan) : system.startsWith(HUB_COMPOSER_SYSTEM)
      ? JSON.stringify(spec).replace('"background":[18,24,42]', '"background":[18 24 42]') : JSON.stringify(review(user));
    return { content, model: "offline-fixture", incomplete: false };
  };
  const outcome = await generateCompleteScript(input, call, Date.now() + 285000);
  assert.equal(outcome.reason, ""); assert.equal(outcome.repaired, false);
  assert.deepEqual(calls, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, REVIEW_SYSTEM]);
  assert.match(outcome.script, /Color3.fromRGB\(18,\s*24,\s*42\)/);
  assert.equal(outcome.coverage?.features.length, 2);
});

test("ambiguous or truncated hub JSON is refused after one writer without full regeneration", async () => {
  for (const reply of [{ content: '{"window":', incomplete: false }, { content: JSON.stringify(spec).slice(0, 500), incomplete: true }]) {
    const calls: string[] = [];
    const outcome = await generateCompleteScript(input, async system => {
      calls.push(system);
      return system === PLANNER_SYSTEM ? { content: JSON.stringify(plan), model: "fixture", incomplete: false } : { ...reply, model: "fixture" };
    }, Date.now() + 285000);
    assert.equal(outcome.reason, reply.incomplete ? "INCOMPLETE_RESPONSE" : "MODEL_OUTPUT_INVALID");
    assert.equal(outcome.script, ""); assert.equal(outcome.coverage, null); assert.equal(outcome.repaired, false);
    assert.deepEqual(calls, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM]); assert.equal(outcome.usage.modelCalls, 2);
    assert.ok(!outcome.issues.some(issue => issue.includes("no complete Lua")));
  }
});

test("a failed semantic repair retains its actual cost and classifies invalid or truncated output honestly", async () => {
  for (const incomplete of [false, true]) {
    let writes = 0;
    const outcome = await generateCompleteScript(input, async system => {
      if (system === PLANNER_SYSTEM) return { content: JSON.stringify(plan), model: "fixture", incomplete: false };
      writes++;
      return writes === 1 ? { content: JSON.stringify({ ...spec, window: { ...spec.window, palette: [] } }), model: "fixture", incomplete: false }
        : { content: '{"window":', model: "fixture", incomplete };
    }, Date.now() + 285000);
    assert.equal(outcome.reason, incomplete ? "INCOMPLETE_RESPONSE" : "MODEL_OUTPUT_INVALID");
    assert.equal(outcome.repaired, true); assert.equal(writes, 2); assert.equal(outcome.usage.modelCalls, 3);
    assert.equal(outcome.script, ""); assert.equal(outcome.coverage, null);
    assert.match(outcome.issues.join(" "), /no further automatic/i);
  }
});

const missingEvidence = { hasContextToAnalyze: false, missingFeatures: ["Auto Farm", "Auto Boss", "Quest Farm", "Auto Loot"] };
test("the shipped full hub with established missing evidence stops before any model request", async () => {
  let calls = 0;
  const outcome = await generateCompleteScript({ ...input, prompt: LOCAL_FULL_HUB_PRESET, supportedFeatures: [], gameEvidence: missingEvidence }, async () => { calls++; throw new Error("must not call model"); }, Date.now() + 285000);
  assert.equal(outcome.reason, "GAME_EVIDENCE_REQUIRED"); assert.equal(calls, 0); assert.equal(outcome.usage.modelCalls, 0);
  assert.equal(outcome.script, ""); assert.equal(outcome.coverage, null); assert.equal(outcome.issues.length, 4);
});
test("a customized hub with missing gameplay evidence stops after planning and keeps the requested UI", async () => {
  let calls = 0;
  const request = "Full hub with Auto Farm and Auto Boss, exact title My Hub, purple UI";
  const gameplayPlan = { features: missingEvidence.missingFeatures.map((label, index) => ({ id: `feature-${index}`, label, behavior: "Perform the requested game interaction", availability: "needs-runtime", evidence: "No matching interaction flow", interaction: true })), ui: { instructions: "Exact title My Hub, purple UI", requiredText: ["My Hub"] } };
  const outcome = await generateCompleteScript({ ...input, prompt: request, gameEvidence: missingEvidence, supportedFeatures: [] }, async () => { calls++; return { content: JSON.stringify(gameplayPlan), incomplete: false, model: "fixture" }; }, Date.now() + 285000);
  assert.equal(outcome.reason, "GAME_EVIDENCE_REQUIRED"); assert.equal(calls, 1); assert.equal(outcome.usage.modelCalls, 1);
  assert.equal(outcome.contract?.ui.instructions, gameplayPlan.ui.instructions); assert.equal(outcome.script, "");
});
test("missing game evidence never blocks a full hub made only of standard client UI utilities", async () => {
  const outcome = await generateCompleteScript({ ...input, gameEvidence: missingEvidence }, async (system, user) => ({ content: JSON.stringify(system === PLANNER_SYSTEM ? plan : system.startsWith(HUB_COMPOSER_SYSTEM) ? spec : review(user)), model: "fixture", incomplete: false }), Date.now() + 285000);
  assert.equal(outcome.reason, ""); assert.equal(outcome.coverage?.features.length, 2);
});

test("a noninteractive UI text named Auto Farm is not mistaken for game automation", async () => {
  const textPlan = { features: [{ id: "auto-farm", label: "Auto Farm", behavior: "Display the requested informational text only", availability: "supported", evidence: "Standard UI text", interaction: false }], ui: { instructions: "Text-only UI", requiredText: ["Auto Farm"] } };
  const calls: string[] = [];
  const outcome = await generateCompleteScript({ ...input, gameEvidence: missingEvidence, supportedFeatures: [] }, async system => {
    calls.push(system);
    return { content: system === PLANNER_SYSTEM ? JSON.stringify(textPlan) : '{"window":', model: "fixture", incomplete: false };
  }, Date.now() + 285000);
  assert.deepEqual(calls, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM]);
  assert.equal(outcome.reason, "MODEL_OUTPUT_INVALID", "only the deliberately invalid writer output is rejected; the text plan passes preflight");
});

test("malformed planner JSON or shape gets one full-context correction before composition and review", async () => {
  for (const malformed of ["not JSON", JSON.stringify({ features: plan.features, ui: { instructions: "wrong shape", requiredText: "Close" } })]) {
    let plans = 0;
    const calls: Array<{ system: string; user: string; timeoutMs: number; deadlineMs: number }> = [];
    const deadline = Date.now() + 285000;
    const context = { ...input, prompt: `${input.prompt}\nDemande française : boutons « Appliquer » et « Fermer », interface anglaise. ORIGINAL-END`, sources: "SOURCE-END", diagnostic: "DIAGNOSTIC-END" };
    const call: ModelCall = async (system, user, _tokens, budget) => {
      calls.push({ system, user, timeoutMs: budget.timeoutMs, deadlineMs: budget.deadlineMs });
      const content = system === PLANNER_SYSTEM ? (++plans === 1 ? malformed : JSON.stringify(plan)) : JSON.stringify(system.startsWith(HUB_COMPOSER_SYSTEM) ? spec : review(user));
      return { content, model: "test-provider", incomplete: false };
    };
    const outcome = await generateCompleteScript(context, call, deadline);
    assert.equal(outcome.reason, "");
    assert.equal(outcome.coverage?.uiVerified, true);
    assert.equal(outcome.repaired, false, "correcting JSON does not regenerate an implementation");
    assert.deepEqual(calls.map(call => call.system), [PLANNER_SYSTEM, PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, REVIEW_SYSTEM]);
    assert.ok(calls[1].user.startsWith(calls[0].user));
    assert.match(calls[1].user, /CORRECT YOUR REQUIREMENTS FORMAT/);
    for (const call of calls) {
      assert.ok(call.user.includes(context.prompt));
      assert.ok(call.user.includes(context.sources));
      assert.ok(call.user.includes(context.diagnostic));
      assert.equal(call.deadlineMs, deadline);
    }
    assert.ok(calls[1].timeoutMs <= 40000);
    assert.deepEqual(outcome.contract?.features.map(feature => feature.id), ["speed", "close"]);
  }
});

test("French quoted required labels follow actual English composition while an identical custom title is preserved", async () => {
  const frenchPlan = {
    features: [{ id: "interface", label: "Interface", behavior: "Create a draggable UI window with two working tabs and Close", availability: "supported", evidence: "Standard UI API", interaction: true }],
    ui: { instructions: "420 by 280 navy/cyan panel, exact custom title Bienvenue, two real pages", requiredText: ["Bienvenue", "Accueil", "Réglages", "Paramètres", "Fermer"] },
  };
  const frenchSpec: HubComposition = {
    ...structuredClone(spec),
    window: { ...structuredClone(spec.window), title: "Bienvenue", width: 420, height: 280, navigation: "left", closeLabel: "Fermer", restoreLabel: "Restaurer", featureIds: ["interface"] },
    pages: [
      { id: "home", label: "Accueil", featureIds: [], items: [{ id: "welcome", kind: "text", featureIds: [], text: "Bienvenue" }] },
      { id: "settings", label: "Réglages", featureIds: [], items: [{ id: "preferences", kind: "text", featureIds: [], text: "Paramètres" }] },
    ],
  };
  let reviews = 0;
  const call: ModelCall = async (system, user) => {
    if (system === PLANNER_SYSTEM) return { content: JSON.stringify(frenchPlan), model: "test-provider", incomplete: false };
    if (system.startsWith(HUB_COMPOSER_SYSTEM)) return { content: JSON.stringify(frenchSpec), model: "test-provider", incomplete: false };
    reviews++;
    const submittedPlan = JSON.parse(user.split("REQUIREMENTS:\n")[1].split("\n\nORIGINAL USER REQUEST")[0]);
    assert.deepEqual(submittedPlan.ui.requiredText, ["Bienvenue", "Home", "Settings", "Preferences", "Close"]);
    assert.deepEqual(submittedPlan.features, frenchPlan.features, "language preference must not rewrite behavior requirements");
    return { content: JSON.stringify({ missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: ["selection error"] }, features: [{ id: "interface", status: "implemented", reason: "English UI matches the requested layout and behavior", behaviorEvidence: "selection error", controlEvidence: "selection error" }] }), model: "test-provider", incomplete: false };
  };
  const original = structuredClone(frenchSpec);
  const outcome = await generateCompleteScript({ ...input, prompt: 'Crée une interface 420 par 280, titre exact "Bienvenue", onglets "Accueil" et "Réglages", contenus "Bienvenue" et "Paramètres", bouton "Fermer".', supportedFeatures: [] }, call, Date.now() + 285000);
  assert.equal(outcome.reason, "");
  assert.equal(outcome.coverage?.uiVerified, true);
  assert.equal(outcome.repaired, false);
  assert.equal(reviews, 1);
  assert.deepEqual(outcome.contract?.ui.requiredText, ["Bienvenue", "Home", "Settings", "Preferences", "Close"]);
  assert.ok(outcome.script.includes('title.Text = "Bienvenue"'));
  for (const text of ["Home", "Settings", "Welcome", "Preferences", "Close"]) assert.ok(outcome.script.includes(`"${text}"`));
  for (const text of ["Accueil", "Réglages", "Paramètres", "Fermer"]) assert.equal(outcome.script.includes(`"${text}"`), false);
  assert.deepEqual(frenchSpec, original, "translation must not mutate the model input object");
});
