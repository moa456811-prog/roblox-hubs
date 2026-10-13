import test from "node:test";
import assert from "node:assert/strict";
import { buildTeachingRows } from "./production/train/build-train.ts";
import { evaluateDevelopment, loadDevelopmentCandidates, loadDevelopmentCases } from "./evaluate_production_dev.ts";
import type { Candidate } from "./production/evaluate.ts";

const teaching = await buildTeachingRows({ runtime: false });
const text = teaching.dev.map(row => JSON.stringify(row)).join("\n");
const cases = await loadDevelopmentCases(text);
const training = Array.from({ length: 144 }, (_entry, index) => ({ messages: [{ role: "user", content: `Independent test harness training input ${index}` }] }));
const references: Candidate[] = cases.map(row => ({ id: row.id, variant: "specialist", output: JSON.stringify(row.expected.composition), stoppedWithEos: true, model: "authored-dev-reference-only", origin: "reference-self-test" }));

test("development bridge executes a complete reference hub yet remains categorically ineligible", async () => {
  const report = await evaluateDevelopment(cases, references, training);
  assert.equal(report.development.cases, 4); assert.equal(report.development.finalTestCasesUsed, 0);
  assert.equal(report.variants.specialist.accepted, 4);
  assert.equal(report.results.find(row => row.id === cases[0].id && row.variant === "specialist")?.runtime?.passed, true);
  assert.equal(report.productionGate.passed, false); assert.equal(report.promotion.eligible, false);
  assert.ok(report.promotion.reasons.some(reason => reason.includes("Development cases")));
  assert.equal(report.development.originalTeachingProvenance[0].provenance.trainingUse, "development-only");
  assert.deepEqual(cases[0].messages.map(message => message.role), ["system", "user"]);
});

test("complete-looking development hub with a no-op farm callback fails functionality", async () => {
  const spec = structuredClone(cases[0].expected.composition), farm = spec.pages.flatMap(page => page.items).find(item => item.featureIds.includes("auto-farm"))!;
  assert.ok(farm.kind === "toggle"); farm.code = "local ignored = ctx.enabled";
  const outputs = references.map((row, index) => index ? row : { ...row, output: JSON.stringify(spec) });
  const report = await evaluateDevelopment(cases, outputs, training);
  const first = report.results.find(row => row.id === cases[0].id && row.variant === "specialist")!;
  assert.equal(first.passed, false); assert.equal(first.functionalPassed, false);
  assert.ok(first.checks.some(check => check.id === "four-gameplay-actions" && !check.passed));
  assert.equal(report.variants.specialist.accepted, 3); assert.equal(report.promotion.eligible, false);
});

test("bridge refuses non-dev rows, incomplete sets, stale original hashes and wrong training count", async () => {
  await assert.rejects(loadDevelopmentCases(teaching.validation.slice(0, 4).map(row => JSON.stringify(row)).join("\n")));
  await assert.rejects(loadDevelopmentCases(teaching.dev.slice(0, 3).map(row => JSON.stringify(row)).join("\n")), /exactly four/);
  const wrong = structuredClone(teaching.dev); ((wrong[0].messages as Array<{ content: string }>)[1]).content += " changed";
  await assert.rejects(loadDevelopmentCases(wrong.map(row => JSON.stringify(row)).join("\n")), /prompt hash mismatch/);
  await assert.rejects(evaluateDevelopment(cases, references, training.slice(1)), /Expected 144/);
});

test("raw Kaggle model and revision metadata survives candidate conversion", () => {
  const rows = loadDevelopmentCandidates(JSON.stringify({ ...references[0], model: "Qwen/Qwen2.5-Coder-7B-Instruct", revision: "pinned-revision", origin: "model-inference" }));
  assert.equal(rows[0].model, "Qwen/Qwen2.5-Coder-7B-Instruct@pinned-revision");
  assert.equal(rows[0].origin, "model-inference");
});
