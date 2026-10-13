import test from "node:test";
import assert from "node:assert/strict";
import { gameAdapterFor, gameplayBindingIssues, curatedGameKnowledge, adapterGenerationContext } from "../src/lib/game-adapters/catalog.ts";
import { buildLocalFullHub, LOCAL_FULL_HUB_PRESET } from "../src/lib/local-full-hub.ts";
import { generateCompleteScript, type GenerationContext } from "../src/lib/generation.ts";
import { assessContract, buildSourceCatalog, PLANNER_SYSTEM, REVIEW_SYSTEM, type GenerationContract } from "../src/lib/generation-contract.ts";
import { HUB_COMPOSER_SYSTEM } from "../src/lib/hub-spec.ts";
import { renderHubComposition } from "../src/lib/hub-composer.ts";
import { groundCompositionReview, libraryCompositionProofs } from "../src/lib/composition-evidence.ts";
import { compositionUsesGameplay } from "../src/lib/game-actions.ts";

const context = (overrides: Partial<GenerationContext> = {}): GenerationContext => ({ prompt: LOCAL_FULL_HUB_PRESET, currentScript: "", patch: false, game: { name: "Blox Fruits", placeId: "2753915549", universeId: "994732206" }, supportedFeatures: [], ledger: "", sources: "", diagnostic: "", ...overrides });

test("game libraries bind exact places and a conflicting universe cannot borrow them", () => {
  for (const placeId of ["2753915549", "4442272183", "7449423635"]) assert.equal(gameAdapterFor({ placeId })?.id, "blox-fruits");
  for (const game of [{ name: "Blox Fruits" }, { placeId: "123", name: "Blox Fruits" }, { placeId: "2753915549", universeId: "123" }]) assert.equal(gameAdapterFor(game), null);
  assert.equal(curatedGameKnowledge({ placeId: "2440500124" }), null, "DOORS evidence is bound to universe/GameId, not PlaceId");
  assert.ok(curatedGameKnowledge({ universeId: "2440500124" })?.knowledgeContext.includes("CurrentRooms"));
});

test("Blox reusable blueprint contains four real initially-off gameplay callbacks and utilities", async () => {
  const result = buildLocalFullHub(context())!;
  assert.equal(result.coverage?.features.length, 9);
  assert.ok(result.coverage?.features.every(feature => feature.status === "implemented"));
  const local = buildLocalFullHub(context())!;
  const controls = local.spec.pages.flatMap(page => page.items).filter(item => item.kind === "toggle" && item.action === "custom");
  assert.equal(controls.length, 4);
  assert.deepEqual(controls.map(item => item.featureIds[0]), ["auto-farm", "auto-boss", "quest-farm", "auto-loot"]);
  for (const control of controls) { if (control.kind !== "toggle") throw new Error("Missing gameplay toggle"); assert.equal(control.initial, false); assert.match(control.code, /^ctx\.gameplay\.setEnabled/); }
  assert.equal(local.spec.pages.flatMap(page => page.items).filter(item => item.kind === "disabled").length, 0);
  assert.equal(local.profile.runtimeVerified, false);
  assert.doesNotMatch(result.script, /A7DEV|a7med_o6t|loadstring|HttpGet|hookmetamethod|sethiddenproperty|setupvalue/);
  assert.match(result.script, /StartQuest/);
});

test("a library callback cannot certify a different feature or run without the matching game", () => {
  const local = buildLocalFullHub(context())!, pack = gameAdapterFor(context().game)!;
  assert.deepEqual(gameplayBindingIssues(local.spec, local.contract, pack), []);
  const farm = local.spec.pages.flatMap(page => page.items).find(item => item.id === "auto-farm")!;
  if (farm.kind !== "toggle") throw new Error("Missing farm toggle");
  farm.code = 'ctx.gameplay.setEnabled("quest", ctx.enabled)';
  assert.ok(gameplayBindingIssues(local.spec, local.contract, pack).some(issue => issue.includes("does not implement requirement: auto-farm")));
  farm.code = 'ctx.gameplay.setEnabled("farm", ctx.enabled)'; farm.initial = true;
  assert.ok(gameplayBindingIssues(local.spec, local.contract, pack).some(issue => issue.includes("initially-off")));
  assert.ok(gameplayBindingIssues(local.spec, local.contract, null).some(issue => issue.includes("No source-backed")));
});

test("curated context supplies complete original callback examples and provenance without claiming live verification", () => {
  const pack = gameAdapterFor(context().game)!;
  const input = adapterGenerationContext(pack);
  for (const key of ["farm", "boss", "quest", "loot"]) assert.ok(input.includes(`ctx.gameplay.setEnabled("${key}", ctx.enabled)`));
  assert.ok(pack.knowledge.features.every(feature => feature.basis === "source-backed"));
  for (const feature of pack.knowledge.features) for (const id of feature.sourceIds) assert.ok(pack.knowledge.sources.some(source => source.id === id));
  assert.match(input, /not live verified/);
  assert.doesNotMatch(input, /A7DEV|a7med_o6t/);
});

test("spaced Lua callbacks receive the same implementation, validation and toggle synchronization", () => {
  const local = buildLocalFullHub(context())!, pack = gameAdapterFor(context().game)!;
  for (const item of local.spec.pages.flatMap(page => page.items)) if (item.kind === "toggle" && item.action === "custom") item.code = item.code.replace('ctx.gameplay.setEnabled(', 'ctx . gameplay . setEnabled ( ').replace('ctx.enabled)', 'ctx . enabled );');
  assert.equal(compositionUsesGameplay(local.spec), true);
  assert.deepEqual(gameplayBindingIssues(local.spec, local.contract, pack), []);
  const code = renderHubComposition(local.spec, compositionUsesGameplay(local.spec) ? { gameplayFactory: pack.factory } : {});
  assert.doesNotMatch(code, /local gameplay = nil/);
  for (const key of ["farm", "boss", "quest", "loot"]) assert.ok(code.includes(`gameplayControlSetters["${key}"] = function(value)`));
});

test("actual research for an unsupported game reaches planning instead of the disabled local preset", async () => {
  const abort = new AbortController(); let calls = 0;
  const researchContext = 'Inspected client callback: game.ReplicatedStorage.Gather:FireServer(target.Id); confirm inventory state.';
  assert.equal(buildLocalFullHub(context({ game: { name: "Another Game", placeId: "123" }, researchContext })), null);
  await assert.rejects(generateCompleteScript(context({ game: { name: "Another Game", placeId: "123" }, researchContext, signal: abort.signal }), async (_system, user) => {
    calls++; assert.ok(user.includes(researchContext)); abort.abort();
    return { content: "{}", model: "mock", incomplete: false };
  }, Date.now() + 300000), { name: "AbortError" });
  assert.equal(calls, 1);
});

function customizedLibraryHub() {
  const input = context({ prompt: "Build a full hub titled Aurora, 720 by 480, background Color3.fromRGB(17,34,51), with Auto Farm, Auto Boss, Quest Farm, Auto Loot, Walk Speed, Jump Power, Rejoin, Theme, tabs, Close and Minimize." });
  const local = buildLocalFullHub(context())!;
  const spec = structuredClone(local.spec);
  spec.window.title = "Aurora";
  spec.window.width = 720;
  spec.window.height = 480;
  spec.window.palette.background = [17, 34, 51];
  const contract = { ...local.contract, ui: { instructions: "Aurora, 720 by 480, Color3.fromRGB(17,34,51), English tabs, Close and Minimize.", requiredText: [...local.contract.ui.requiredText, "Aurora"] } };
  const pack = gameAdapterFor(input.game)!;
  return { input, spec, contract, pack, script: renderHubComposition(spec, { gameplayFactory: pack.factory }) };
}

function actualLibraryReview(script: string, contract: GenerationContract) {
  const catalog = buildSourceCatalog(script);
  const ref = (kind: string, needle: string) => {
    const entry = catalog.find(entry => entry.kind === kind && entry.code.includes(needle));
    assert.ok(entry, `Missing actual ${kind} evidence: ${needle}`);
    return entry.id;
  };
  const gameplay: Record<string, [string, string]> = {
    "auto-farm": ["tool:Activate()", "own(item2_1Button.Activated"],
    "auto-boss": ["tool:Activate()", "own(item3_1Button.Activated"],
    "quest-farm": ['remote:InvokeServer("StartQuest"', "own(item4_1Button.Activated"],
    "auto-loot": ["tween:Play()", "own(item5_1Button.Activated"],
  };
  return {
    missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ref("effect", "panel.Size =")] },
    features: contract.features.map(feature => {
      const pair = gameplay[feature.id] || ["gui:Destroy()", "own(closeButton.Activated"];
      return { id: feature.id, status: "implemented", reason: "The requested control and original controller are present.", behaviorEvidence: ref("effect", pair[0]), controlEvidence: ref("control", pair[1]) };
    }),
  };
}

test("custom Aurora UI retains all four library actions and passes full planning/composition/review without an evidence retry", async () => {
  const { input, spec, contract } = customizedLibraryHub();
  const calls: string[] = [];
  const result = await generateCompleteScript(input, async (system, user) => {
    calls.push(system);
    let response: unknown;
    if (system === PLANNER_SYSTEM) response = contract;
    else if (system.startsWith(HUB_COMPOSER_SYSTEM)) response = spec;
    else {
      assert.equal(system, REVIEW_SYSTEM);
      const script = user.split("ACTUAL GENERATED SCRIPT:\n")[1].split("\n\nSOURCE_CATALOG")[0];
      response = actualLibraryReview(script, contract);
    }
    return { content: JSON.stringify(response), model: "mock-provider", incomplete: false };
  }, Date.now() + 285_000);
  assert.deepEqual(result.issues, []);
  assert.equal(result.reason, "");
  assert.deepEqual(calls, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, REVIEW_SYSTEM]);
  assert.equal(result.usage.modelCalls, 3);
  assert.equal(result.coverage?.features.length, 9);
  assert.ok(result.coverage?.features.every(feature => feature.status === "implemented"));
  assert.match(result.script, /title.Text = "Aurora"/);
  assert.match(result.script, /panel.Size = UDim2.fromOffset\(720, 480\)/);
  assert.match(result.script, /Color3.fromRGB\(17, 34, 51\)/);
  assert.doesNotMatch(result.script, /A7DEV|a7med_o6t/);
});

test("trusted library proofs require the exact renderer, controller, game and initially-off matching callbacks", () => {
  const { input, spec, contract, pack, script } = customizedLibraryHub();
  const proofs = libraryCompositionProofs(spec, script, contract, input.game);
  assert.deepEqual(proofs.map(proof => proof.featureId), ["auto-farm", "auto-boss", "quest-farm", "auto-loot"]);
  assert.deepEqual(libraryCompositionProofs(spec, script, contract, { placeId: "123" }), []);
  assert.deepEqual(libraryCompositionProofs(spec, script, contract, { ...input.game, universeId: "123" }), []);
  assert.deepEqual(libraryCompositionProofs(spec, script + "\n-- altered output", contract, input.game), []);
  assert.deepEqual(libraryCompositionProofs(spec, script.replace("tool:Activate()", 'print("No action")'), contract, input.game), []);
  assert.deepEqual(libraryCompositionProofs(spec, renderHubComposition(spec), contract, input.game), []);
  for (const mutation of ["wrong-key", "initially-on", "extra-behavior"]) {
    const altered = structuredClone(spec);
    const farm = altered.pages.flatMap(page => page.items).find(item => item.id === "auto-farm")!;
    if (farm.kind !== "toggle") throw new Error("Missing farm toggle");
    if (mutation === "wrong-key") farm.code = 'ctx.gameplay.setEnabled("quest", ctx.enabled)';
    if (mutation === "initially-on") farm.initial = true;
    if (mutation === "extra-behavior") farm.code += '\nprint("Additional arbitrary callback")';
    assert.deepEqual(libraryCompositionProofs(altered, renderHubComposition(altered, { gameplayFactory: pack.factory }), contract, input.game), [], mutation);
  }
});

test("trusted library wiring never overrides a semantic missing-feature finding", () => {
  const { input, spec, contract, pack, script } = customizedLibraryHub();
  const raw = actualLibraryReview(script, contract);
  const farm = raw.features.find(feature => feature.id === "auto-farm")!;
  farm.status = "missing";
  farm.reason = "The reviewer found requested target behavior missing.";
  const grounded = groundCompositionReview(JSON.stringify(raw), spec, script, contract, { gameplayFactory: pack.factory, game: input.game });
  const assessment = assessContract(contract, grounded, script, input.prompt, libraryCompositionProofs(spec, script, contract, input.game));
  assert.ok(assessment.issues.includes("Auto Farm: The reviewer found requested target behavior missing."));
  assert.equal(assessment.coverage.uiVerified, false);
  assert.equal(assessment.coverage.features.some(feature => feature.id === "auto-farm"), false);
  assert.deepEqual(assessment.evidenceIssues, []);
});
