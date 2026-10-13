import assert from "node:assert/strict";
import test from "node:test";
import { buildRows } from "./fixtures.ts";
import { validateRows } from "../build-dataset.ts";

test("all original full-hub labels pass the existing schema, coverage and renderer; splits are disjoint", () => {
  const report = validateRows(buildRows());
  assert.deepEqual(report.sizes,{train:128,validation:16,test:24});
  assert.equal(report.uniquePrompts,168);
  assert.equal(report.uniqueAnswers,168);
  assert.equal(report.smallestControls,6);
});

test("the dataset guard rejects held-out design leakage and missing behavior", () => {
  const leaking = buildRows();
  leaking.test[0].designFamily = leaking.train[0].designFamily;
  assert.throws(() => validateRows(leaking),/Design leakage/);
  const missing = buildRows();
  const row = missing.test[0];
  row.expected.composition.pages[0].items = [];
  row.messages[2].content = JSON.stringify(row.expected.composition);
  assert.throws(() => validateRows(missing),/Coverage failed/);
});
