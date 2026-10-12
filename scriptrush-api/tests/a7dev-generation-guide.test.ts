import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { a7devGenerationGuide, A7DEV_GUIDE_SOURCE, SCRIPT_IDENTITY_POLICY, type A7devGenerationStage } from "../src/lib/a7dev-generation-guide.ts";
import { PLANNER_SYSTEM, GENERATOR_SYSTEM, REVIEW_SYSTEM } from "../src/lib/generation-contract.ts";
import { HUB_COMPOSER_SYSTEM, parseHubComposition } from "../src/lib/hub-spec.ts";
import { generateCompleteScript } from "../src/lib/generation.ts";

test("A7DEV guidance stays within a fixed per-stage prompt budget", () => {
  const stages: A7devGenerationStage[] = ["planner", "composer", "generator", "reviewer"];
  for (const stage of stages) {
    const guide = a7devGenerationGuide(stage);
    assert.ok(Buffer.byteLength(guide, "utf8") <= 3000, `${stage} guide exceeds the 3 KB budget`);
  }
});

test("the curated method retains a verifiable reference without reading the user archive at runtime", () => {
  assert.equal(A7DEV_GUIDE_SOURCE.name, "A7DEV Roblox Universal");
  assert.match(A7DEV_GUIDE_SOURCE.skillSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(A7DEV_GUIDE_SOURCE));
});

test("all AI stages use the private reference as method only and distinguish unnamed defaults from explicit user identity", () => {
  for (const system of [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, GENERATOR_SYSTEM, REVIEW_SYSTEM]) {
    assert.ok(system.includes(SCRIPT_IDENTITY_POLICY));
    assert.doesNotMatch(system, /A7DEV|a7med_o6t|a7dev-roblox-universal|skillSha256/i);
    assert.match(system, /unnamed and unbranded/);
    assert.match(system, /empty window title when the user supplies none/);
    assert.match(system, /Preserve a title, name or credit exactly only when explicitly requested/);
  }
});

test("composition keeps the unnamed default and an explicitly requested custom title through generation and review", async () => {
  for (const title of ["", "Aurora Panel", "A7DEV Custom"]) {
    const spec = parseHubComposition(readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8"));
    spec.window.title = title;
    const features = ["walk-speed", "jump-power", "rejoin", "theme"].map(id => ({ id, label: id, behavior: id, availability: "supported", evidence: "Standard local utility", interaction: true }));
    const plan = { features, ui: { instructions: "Tabbed local utility interface with the requested identity policy", requiredText: title ? [title] : [] } };
    const prompt = `Create a full hub with Walk Speed, Jump Power, Rejoin and a theme switch.${title ? ` Use the exact title "${title}".` : " I have not supplied a script name."}`;
    const stages: string[] = [];
    const result = await generateCompleteScript({ prompt, currentScript: "", patch: false, game: { name: "Test Game" }, supportedFeatures: [], ledger: "Standard client APIs", sources: "", diagnostic: "" }, async (system, user) => {
      stages.push(system);
      assert.ok(system.includes(SCRIPT_IDENTITY_POLICY));
      assert.ok(user.includes(prompt));
      const content = system === PLANNER_SYSTEM ? plan : system === HUB_COMPOSER_SYSTEM ? spec : {
        missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: ["rendered UI"] },
        features: features.map(feature => ({ id: feature.id, status: "implemented", reason: "Matching built-in action", behaviorEvidence: "rendered action", controlEvidence: "rendered control" })),
      };
      return { content: JSON.stringify(content), model: "test-provider", incomplete: false };
    }, Date.now() + 285000);
    assert.equal(result.reason, "");
    assert.equal(result.coverage?.uiVerified, true);
    if (title) assert.ok(result.script.includes(`title.Text = ${JSON.stringify(title)}`));
    else {
      assert.doesNotMatch(result.script, /title\.Text\s*=|make\("TextLabel", "Title"/);
      assert.doesNotMatch(result.script, /A7DEV|a7med_o6t|ScriptRush/i);
    }
    assert.deepEqual(stages, [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, REVIEW_SYSTEM]);
  }
});
