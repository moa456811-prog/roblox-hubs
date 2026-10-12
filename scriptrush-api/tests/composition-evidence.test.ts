import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { groundCompositionReview } from "../src/lib/composition-evidence.ts";
import { assessContract, buildSourceCatalog, parseModelJson, reviewSchema, type GenerationContract } from "../src/lib/generation-contract.ts";
import { renderHubComposition } from "../src/lib/hub-composer.ts";
import { parseHubComposition } from "../src/lib/hub-spec.ts";

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
  const grounded = groundCompositionReview(raw(ids), spec, script);
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
  assert.deepEqual(assessContract(plan(["interface"]), groundCompositionReview(raw(["interface"]), spec, script), script, "Create requested interface").issues, []);
  spec.window.navigation = "none"; spec.pages = spec.pages.slice(0, 1);
  const onePage = renderHubComposition(spec);
  assert.deepEqual(assessContract(plan(["interface"]), groundCompositionReview(raw(["interface"]), spec, onePage), onePage, "Create requested interface").issues, []);
});

test("grounding never erases missing requirements, semantic UI failure, scope issues or feature statuses", () => {
  const spec = sample(), script = renderHubComposition(spec), review = JSON.parse(raw(["walk-speed", "rejoin"]));
  review.missingRequirements = ["Requested feature is absent"];
  review.scopeIssues = ["Unwanted action exists"];
  review.ui.passed = false; review.ui.issues = ["Wrong title"];
  review.features[1].status = "missing";
  const grounded = groundCompositionReview(JSON.stringify(review), spec, script), parsed = JSON.parse(grounded);
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
    assert.equal(groundCompositionReview(review, spec, changed), review);
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
  const grounded = JSON.parse(groundCompositionReview(JSON.stringify(review), spec, renderHubComposition(spec)));
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
  const grounded = groundCompositionReview(JSON.stringify(review), spec, script);
  assert.deepEqual(JSON.parse(grounded).features, review.features);
  assert.ok(assessContract(plan(["custom"]), grounded, script, "Perform real custom behavior").issues.some(issue => issue.includes("control-to-behavior")));
});

test("invalid reviewer shapes still throw instead of being normalized into accepted coverage", () => {
  const spec = sample(), review = JSON.parse(raw(["walk-speed"]));
  review.features[0].behavior = review.features[0].status; delete review.features[0].status;
  assert.throws(() => groundCompositionReview(JSON.stringify(review), spec, renderHubComposition(spec)));
});
