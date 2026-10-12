import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groundCompositionReview } from "../src/lib/composition-evidence.ts";
import { assessContract, buildSourceCatalog, parseModelJson, PLANNER_SYSTEM, REVIEW_SYSTEM, reviewSchema, type GenerationContract } from "../src/lib/generation-contract.ts";
import { generateCompleteScript } from "../src/lib/generation.ts";
import { renderHubComposition } from "../src/lib/hub-composer.ts";
import { parseHubComposition, validateCompositionCoverage } from "../src/lib/hub-spec.ts";

const fixture = readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8");
const sample = () => parseHubComposition(fixture);
const plan = (ids: string[]): GenerationContract => ({
  fullHub: ids.length > 1, ui: { instructions: "requested screen", requiredText: [] },
  features: ids.map(id => ({ id, label: id, behavior: id, availability: "supported", evidence: "Standard client APIs", interaction: true })),
});
const raw = (ids: string[]) => JSON.stringify({
  missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: ["wrong UI excerpt"] },
  features: ids.map(id => ({ id, status: "implemented", reason: "Semantic behavior verified", behaviorEvidence: "wrong effect", controlEvidence: "wrong control" })),
});

test("known composed utilities receive source IDs for their own controls and real effects", () => {
  const spec = sample(), script = renderHubComposition(spec), ids = ["walk-speed", "jump-power", "rejoin", "theme"];
  const grounded = groundCompositionReview(raw(ids), spec, script, plan(ids));
  const result = assessContract(plan(ids), grounded, script, "Create the requested utilities");
  assert.deepEqual(result.issues, []);
  assert.equal(result.reviewEvidenceInvalid, false);
  const review = reviewSchema.parse(parseModelJson(grounded));
  const entries = new Map(buildSourceCatalog(script).map(entry => [entry.id, entry.code]));
  assert.ok(entries.get(review.features.find(feature => feature.id === "walk-speed")!.controlEvidence)?.includes("own(item1_1Button.Activated"));
  assert.ok(entries.get(review.features.find(feature => feature.id === "rejoin")!.behaviorEvidence)?.includes("TeleportService:Teleport(game.PlaceId, player)"));
});

test("a whole UI requirement gets a matched navigation control and page visibility effect", () => {
  const spec = sample();
  spec.window.featureIds = ["interface"];
  for (const page of spec.pages) page.items = [];
  const script = renderHubComposition(spec);
  assert.deepEqual(assessContract(plan(["interface"]), groundCompositionReview(raw(["interface"]), spec, script, plan(["interface"])), script, "Create requested interface").issues, []);
  spec.window.navigation = "none"; spec.pages = spec.pages.slice(0, 1);
  const onePage = renderHubComposition(spec);
  assert.deepEqual(assessContract(plan(["interface"]), groundCompositionReview(raw(["interface"]), spec, onePage, plan(["interface"])), onePage, "Create requested interface").issues, []);
});

test("grounding never erases missing requirements, semantic UI failure, scope issues or feature statuses", () => {
  const spec = sample(), script = renderHubComposition(spec), review = JSON.parse(raw(["walk-speed", "rejoin"]));
  review.missingRequirements = ["Requested feature is absent"];
  review.scopeIssues = ["Unwanted action exists"];
  review.ui.passed = false; review.ui.issues = ["Wrong title"];
  review.features[1].status = "missing";
  const grounded = groundCompositionReview(JSON.stringify(review), spec, script, plan(["walk-speed", "rejoin"])), parsed = JSON.parse(grounded);
  assert.deepEqual(parsed.missingRequirements, review.missingRequirements);
  assert.deepEqual(parsed.scopeIssues, review.scopeIssues);
  assert.deepEqual(parsed.ui.issues, review.ui.issues);
  assert.equal(parsed.ui.passed, false);
  assert.deepEqual(parsed.features[1], review.features[1]);
  const result = assessContract(plan(["walk-speed", "rejoin"]), grounded, script, "Create requested interface");
  assert.ok(result.issues.includes("Requested feature is absent"));
  assert.ok(result.issues.includes("Wrong title"));
  assert.ok(result.issues.some(issue => issue.startsWith("rejoin:")));
});

test("modified arbitrary code cannot borrow trusted renderer evidence", () => {
  const spec = sample(), canonical = renderHubComposition(spec), review = raw(["walk-speed"]);
  for (const changed of [canonical.replace("humanoid.WalkSpeed = value", 'print("fake speed")'), canonical + "\n-- changed"]) {
    assert.equal(groundCompositionReview(review, spec, changed, plan(["walk-speed"])), review);
    assert.ok(assessContract(plan(["walk-speed"]), review, changed, "Change speed").issues.length);
  }
});

test("custom and disabled behavior evidence and unknown IDs remain untouched", () => {
  const spec = sample();
  spec.pages[0].items = [{ id: "custom", featureIds: ["custom"], kind: "button", label: "Custom", description: "", action: "custom", code: 'ctx.player:SetAttribute("Example", true)' }, { id: "blocked", featureIds: ["blocked"], kind: "disabled", label: "Blocked", reason: "Needs game profile: remote payloads are absent" }];
  spec.window.featureIds = ["custom", "blocked"];
  spec.pages[0].featureIds = ["custom", "blocked"];
  const review = JSON.parse(raw(["custom", "blocked", "unknown"]));
  review.features[1].status = "unavailable";
  const grounded = JSON.parse(groundCompositionReview(JSON.stringify(review), spec, renderHubComposition(spec), plan(["custom", "blocked", "unknown"])));
  assert.deepEqual(grounded.features, review.features);
});

test("print-only custom actions cannot borrow navigation effects through window/page bindings", () => {
  const spec = sample();
  spec.pages[0].items = [{ id: "custom", featureIds: ["custom"], kind: "button", label: "Custom", description: "", action: "custom", code: 'print("fake behavior")' }];
  spec.window.featureIds = ["custom"]; spec.pages[0].featureIds = ["custom"];
  const script = renderHubComposition(spec), catalog = buildSourceCatalog(script);
  const control = catalog.find(entry => entry.kind === "control" && entry.code.includes("own(item1_1Button.Activated"))!;
  const review = JSON.parse(raw(["custom"]));
  review.features[0].behaviorEvidence = control.id;
  review.features[0].controlEvidence = control.id;
  const grounded = groundCompositionReview(JSON.stringify(review), spec, script, plan(["custom"]));
  assert.deepEqual(JSON.parse(grounded).features, review.features);
  assert.ok(assessContract(plan(["custom"]), grounded, script, "Perform real custom behavior").issues.some(issue => issue.includes("control-to-behavior")));
});

test("invalid reviewer shapes still throw instead of being normalized into accepted coverage", () => {
  const spec = sample(), review = JSON.parse(raw(["walk-speed"]));
  review.features[0].behavior = review.features[0].status; delete review.features[0].status;
  assert.throws(() => groundCompositionReview(JSON.stringify(review), spec, renderHubComposition(spec), plan(["walk-speed"])));
});

test("one WalkSpeed action cannot certify an independent missing JumpPower requirement", () => {
  const spec = sample(), speed = spec.pages[0].items[0];
  speed.featureIds = ["walk-speed", "jump-power"];
  for (const page of spec.pages) page.items = [];
  spec.pages[0].items = [speed];
  const contract = plan(["walk-speed", "jump-power"]), script = renderHubComposition(spec);
  assert.ok(validateCompositionCoverage(spec, contract).some(issue => issue.includes("jump-power")), "known standard semantics must reject the mislabeled action before review");
  assert.equal(script.includes("humanoid.JumpPower"), false);
  const grounded = groundCompositionReview(raw(["walk-speed", "jump-power"]), spec, script, contract);
  const review = JSON.parse(grounded);
  assert.match(review.features[0].behaviorEvidence, /^SRC_/);
  assert.equal(review.features[1].behaviorEvidence, "wrong effect");
  assert.ok(assessContract(contract, grounded, script, "Implement WalkSpeed and JumpPower").issues.some(issue => issue.startsWith("jump-power:")));
  const validWrongProof = JSON.parse(grounded);
  validWrongProof.features[1].behaviorEvidence = validWrongProof.features[0].behaviorEvidence;
  validWrongProof.features[1].controlEvidence = validWrongProof.features[0].controlEvidence;
  assert.deepEqual(assessContract(contract, JSON.stringify(validWrongProof), script, "Implement WalkSpeed and JumpPower").issues, [], "source reachability alone does not imply correct requirement semantics");
  assert.ok(validateCompositionCoverage(spec, contract).some(issue => issue.includes("Standard action walk-speed does not implement requirement: jump-power")), "production composition validation blocks even a plausible but semantically wrong review");
});

test("generation rejects wrong-action composition before a permissive reviewer and attempts full composition repair", async () => {
  const spec = sample(), speed = spec.pages[0].items[0];
  speed.featureIds = ["walk-speed", "jump-power"];
  for (const page of spec.pages) page.items = [];
  spec.pages[0].items = [speed];
  const contract = plan(["walk-speed", "jump-power"]), script = renderHubComposition(spec);
  const permissive = JSON.parse(groundCompositionReview(raw(["walk-speed", "jump-power"]), spec, script, contract));
  permissive.features[1].behaviorEvidence = permissive.features[0].behaviorEvidence;
  permissive.features[1].controlEvidence = permissive.features[0].controlEvidence;
  let reviews = 0, writes = 0;
  const result = await generateCompleteScript({ prompt: "Create a full hub with WalkSpeed and JumpPower controls", currentScript: "", patch: false, game: {}, supportedFeatures: ["walk-speed", "jump-power"], ledger: "Standard client APIs", sources: "", diagnostic: "" }, async system => {
    const content = system.startsWith(PLANNER_SYSTEM) ? JSON.stringify(contract) : system.startsWith(REVIEW_SYSTEM) ? (reviews++, JSON.stringify(permissive)) : (writes++, JSON.stringify(spec));
    return { content, model: "test-provider", incomplete: false };
  }, Date.now() + 300_000);
  assert.equal(reviews, 0, "mismatched standard actions must fail before reviewer evidence can disguise them");
  assert.equal(writes, 2, "the generated composition receives one full repair attempt");
  assert.equal(result.repaired, true);
  assert.equal(result.reason, "REQUIREMENTS_NOT_MET");
  assert.ok(result.issues.some(issue => issue.includes("jump-power")));
});

test("shell bindings cannot certify noninteractive gameplay or a known standard action", () => {
  const spec = sample();
  for (const page of spec.pages) page.items = [];
  spec.window.featureIds = ["esp", "walk-speed"];
  spec.pages[0].featureIds = ["esp", "walk-speed"];
  const contract = plan(["esp", "walk-speed"]);
  contract.features[0].interaction = false;
  contract.features[0].behavior = "Display live enemy positions in the panel";
  const script = renderHubComposition(spec), grounded = groundCompositionReview(raw(["esp", "walk-speed"]), spec, script, contract);
  assert.ok(JSON.parse(grounded).features.every((feature: { behaviorEvidence: string }) => feature.behaviorEvidence === "wrong effect"));
  assert.ok(assessContract(contract, grounded, script, "Enemy ESP and WalkSpeed").issues.length);
});

test("contract descriptions recognize standard actions with arbitrary IDs and preserve static themed UI shells", () => {
  const spec = sample(), speed = spec.pages[0].items[0];
  speed.featureIds = ["custom-id"];
  const contract = plan(["custom-id"]);
  contract.features[0].label = "Movement speed";
  contract.features[0].behavior = "Apply WalkSpeed between 8 and 32 to the current humanoid";
  const script = renderHubComposition(spec);
  assert.deepEqual(assessContract(contract, groundCompositionReview(raw(["custom-id"]), spec, script, contract), script, "Apply movement speed").issues, []);
  const uiContract = plan(["interface"]);
  uiContract.features[0].behavior = "Create a navy themed UI panel with Home and Settings tabs and a Close button";
  spec.window.featureIds = ["interface"];
  const uiScript = renderHubComposition(spec);
  assert.deepEqual(assessContract(uiContract, groundCompositionReview(raw(["interface"]), spec, uiScript, uiContract), uiScript, "Create interface").issues, []);
});

test("shell proofs require requested close, minimize, drag and navigation even for noninteractive planner claims", () => {
  for (const missing of ["close", "minimize", "drag", "tabs"]) for (const interaction of [true, false]) {
    const spec = sample(); spec.window.featureIds = ["interface"];
    const contract = plan(["interface"]);
    contract.features[0].interaction = interaction;
    contract.features[0].behavior = "Create a draggable UI window with tabs, Close, Minimize and Restore";
    if (missing === "close") spec.window.closeLabel = null;
    if (missing === "minimize") spec.window.minimizeLabel = null;
    if (missing === "drag") spec.window.draggable = false;
    if (missing === "tabs") { spec.window.navigation = "none"; spec.pages = spec.pages.slice(0, 1); }
    const script = renderHubComposition(spec), grounded = groundCompositionReview(raw(["interface"]), spec, script, contract);
    assert.equal(JSON.parse(grounded).features[0].behaviorEvidence, "wrong effect", `${missing}, interaction=${interaction}`);
    assert.ok(assessContract(contract, grounded, script, "Create all requested UI controls").issues.length);
  }
});
