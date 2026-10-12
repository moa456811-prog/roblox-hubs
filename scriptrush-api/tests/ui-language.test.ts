import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { englishUiIssues, SCRIPT_UI_LANGUAGE_POLICY } from "../src/lib/ui-language.ts";
import { parseHubComposition, HUB_COMPOSER_SYSTEM } from "../src/lib/hub-spec.ts";
import { GENERATOR_SYSTEM, PLANNER_SYSTEM, REVIEW_SYSTEM } from "../src/lib/generation-contract.ts";

const fixture = () => parseHubComposition(readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8"));

test("every generation stage applies English functional UI even to French requests", () => {
  for (const system of [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, GENERATOR_SYSTEM, REVIEW_SYSTEM]) assert.ok(system.includes(SCRIPT_UI_LANGUAGE_POLICY));
});

test("common French controls are rejected while custom titles are preserved", () => {
  const spec = fixture();
  spec.window.title = "Bienvenue chez Aurora";
  assert.deepEqual(englishUiIssues(spec), []);
  spec.window.closeLabel = "Fermer";
  assert.equal(englishUiIssues(spec).length, 1);
  spec.window.closeLabel = "Close";
  spec.pages[0].label = "Réglages";
  assert.equal(englishUiIssues(spec).length, 1);
  spec.pages[0].label = "Settings";
  assert.deepEqual(englishUiIssues(spec), []);
});
