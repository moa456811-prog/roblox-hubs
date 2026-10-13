import test from "node:test";
import assert from "node:assert/strict";
import { parseHubComposition, validateCompositionCoverage } from "../../../../src/lib/hub-spec.ts";
import { gameAdapterFor, gameplayBindingIssues } from "../../../../src/lib/game-adapters/catalog.ts";
import { gameplayToggleKey } from "../../../../src/lib/game-actions.ts";
import { englishUiIssues } from "../../../../src/lib/ui-language.ts";
import { buildTeachingFixtures, COUNTS, type Split } from "./fixtures.ts";
import { buildTeachingRows } from "./build-train.ts";
import { buildProductionCases, sha256 } from "../prompts.ts";

test("teaching corpus has 48/8/4 independent records and split-disjoint grouping families", () => {
  const corpus = buildTeachingFixtures();
  assert.deepEqual(Object.fromEntries(Object.entries(corpus).map(([split, rows]) => [split, rows.length])), COUNTS);
  const all = Object.values(corpus).flat();
  assert.equal(new Set(all.map(row => row.id)).size, 60);
  const families = Object.fromEntries(Object.entries(corpus).map(([split, rows]) => [split, new Set(rows.map(row => row.designFamily))])) as Record<Split, Set<string>>;
  for (const split of ["validation", "dev"] as Split[]) for (const family of families[split]) assert.equal(families.train.has(family), false);
  const groups = (split: Split) => new Set(corpus[split].map(row => JSON.stringify(row.expected.composition.pages.map(page => ({ label: page.label, features: page.items.flatMap(item => item.featureIds) })).sort((a, b) => a.label.localeCompare(b.label)))));
  for (const grouping of groups("validation")) assert.equal(groups("train").has(grouping), false);
  for (const grouping of groups("dev")) { assert.equal(groups("train").has(grouping), false); assert.equal(groups("validation").has(grouping), false); }
});

test("every teaching answer preserves complete admitted gameplay, English UI and supported utility coverage", () => {
  for (const row of Object.values(buildTeachingFixtures()).flat()) {
    const spec = parseHubComposition(JSON.stringify(row.expected.composition)), pack = gameAdapterFor(row.game)!;
    assert.deepEqual(validateCompositionCoverage(spec, row.expected.contract), []);
    assert.deepEqual(gameplayBindingIssues(spec, row.expected.contract, pack), []);
    assert.deepEqual(englishUiIssues(spec), []);
    assert.equal(row.expected.contract.features.length, 9);
    const controls = spec.pages.flatMap(page => page.items);
    for (const action of pack.actions) {
      const bound = controls.filter(item => item.featureIds.includes(action.id));
      assert.equal(bound.length, 1); assert.ok(bound[0].kind === "toggle"); assert.equal(bound[0].initial, false); assert.equal(gameplayToggleKey(bound[0].code), action.key);
    }
    assert.equal(controls.some(item => item.kind === "disabled"), false);
  }
});

test("real production training messages stay disjoint from all eight frozen test messages and answers", async () => {
  const teaching = await buildTeachingRows({ runtime: false }), heldout = await buildProductionCases();
  const prompts = new Set(heldout.map(row => sha256(JSON.stringify(row.messages)))), answers = new Set(heldout.map(row => sha256(JSON.stringify(row.expected.composition))));
  for (const row of Object.values(teaching).flat()) {
    const messages = row.messages as Array<{ role: string; content: string }>;
    assert.deepEqual(messages.map(message => message.role), ["system", "user", "assistant"]);
    assert.equal(prompts.has(sha256(JSON.stringify(messages.slice(0, 2)))), false);
    assert.equal(answers.has(sha256(messages[2].content)), false);
    assert.ok(messages[1].content.includes("SERVER GAME ACTION LIBRARY (blox-fruits 1.0.0"));
    assert.equal(messages[1].content === messages[2].content, false);
    assert.equal((row.provenance as { networkCalls: number }).networkCalls, 0);
  }
});
