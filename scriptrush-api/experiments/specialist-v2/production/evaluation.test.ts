import test from "node:test";
import assert from "node:assert/strict";
import { HUB_COMPOSER_SYSTEM, hubCompositionJsonSchema, parseHubComposition } from "../../../src/lib/hub-spec.ts";
import { gameAdapterFor } from "../../../src/lib/game-adapters/catalog.ts";
import { buildProductionFixtures } from "./fixtures.ts";
import { buildProductionCases, captureComposerMessages, sha256, sourceSnapshot } from "./prompts.ts";
import { evaluate, evaluateCandidate, parseCases, staticChecks, leakageAudit, type Candidate } from "./evaluate.ts";

const cases = await buildProductionCases();
const sources = await sourceSnapshot();
const candidate = (index = 0): Candidate => ({ id: cases[index].id, variant: "specialist", output: JSON.stringify(cases[index].expected.composition), stoppedWithEos: true, model: "reference-fixture-only", origin: "reference-self-test" });
const options = { runtime: "disabled" as const, sourceSha256: sources };
const failed = (result: ReturnType<typeof evaluateCandidate>, id: string) => result.checks.some(check => check.id === id && !check.passed);

test("eight genuinely separate custom-UI production fixtures contain all four admitted game actions", () => {
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map(row => row.id)).size, 8);
  assert.equal(new Set(cases.map(row => row.provenance.promptSha256)).size, 8);
  assert.deepEqual(new Set(cases.map(row => row.locale)), new Set(["fr", "en"]));
  assert.equal(cases.filter(row => !row.expected.composition.window.title).length, 4);
  assert.deepEqual(new Set(cases.map(row => row.expected.composition.pages.length)), new Set([4, 7, 8]));
  assert.deepEqual(new Set(cases.map(row => row.game.placeId)), new Set(["2753915549", "4442272183", "7449423635"]));
  for (const row of cases) {
    const pack = gameAdapterFor(row.game)!;
    assert.equal(pack.actions.length, 4);
    const assessment = staticChecks(row, row.expected.composition);
    assert.deepEqual(assessment.checks.filter(check => !check.passed), []);
    assert.ok(assessment.script.includes(pack.factory));
  }
});

test("messages come from the actual production writer and provider formatter; no assistant answers enter inference", async () => {
  for (const row of cases) {
    assert.deepEqual(row.messages.map(message => message.role), ["system", "user"]);
    assert.ok(row.messages[0].content.startsWith(HUB_COMPOSER_SYSTEM));
    assert.ok(row.messages[0].content.endsWith("Never return a JSON schema or wrap the values in properties/type/required."));
    assert.ok(row.messages[1].content.includes(`ORIGINAL USER REQUEST (highest priority):\n${row.request}`));
    assert.ok(row.messages[1].content.endsWith(`HUB COMPOSITION JSON SCHEMA:\n${JSON.stringify(hubCompositionJsonSchema)}`));
    assert.ok(row.messages[1].content.includes("SERVER GAME ACTION LIBRARY (blox-fruits 1.0.0"));
    for (const key of ["farm", "boss", "quest", "loot"]) assert.ok(row.messages[1].content.includes(`ctx.gameplay.setEnabled("${key}", ctx.enabled)`));
    assert.equal(row.messages.some(message => message.content === JSON.stringify(row.expected.composition)), false);
    assert.equal(row.provenance.promptSha256, sha256(JSON.stringify(row.messages)));
    assert.equal(row.provenance.networkCalls, 0);
    assert.equal(row.provenance.trainingUse, "excluded");
  }
  assert.deepEqual(await captureComposerMessages(buildProductionFixtures()[0]), cases[0].messages);
});

test("case parser rejects changed messages with stale SHA and invalid reference UI", () => {
  assert.equal(parseCases(cases.map(row => JSON.stringify(row)).join("\n")).length, 8);
  const wrongPrompt = structuredClone(cases[0]); wrongPrompt.messages[1].content += " altered";
  assert.throws(() => parseCases(JSON.stringify(wrongPrompt)), /provenance mismatch/);
  const wrongAnswer = structuredClone(cases[0]); wrongAnswer.expected.composition.pages = [];
  assert.throws(() => parseCases(JSON.stringify(wrongAnswer)));
});

test("invalid JSON, schema-shaped JSON and empty output fail without a runtime success", () => {
  for (const output of ["", "{bad", JSON.stringify(hubCompositionJsonSchema)]) {
    const result = evaluateCandidate(cases[0], { ...candidate(), output }, "specialist", options);
    assert.equal(result.passed, false); assert.equal(result.functionalPassed, false); assert.equal(result.runtime, null);
    assert.ok(failed(result, "schema"));
  }
});

test("wrong custom title, dimensions, colors, font or navigation cannot pass exact UI", () => {
  for (const change of [
    (spec: typeof cases[0]["expected"]["composition"]) => { spec.window.title = "A7DEV"; },
    (spec: typeof cases[0]["expected"]["composition"]) => { spec.window.width++; },
    (spec: typeof cases[0]["expected"]["composition"]) => { spec.window.palette.accent[0]++; },
    (spec: typeof cases[0]["expected"]["composition"]) => { spec.window.font = "Arial"; },
    (spec: typeof cases[0]["expected"]["composition"]) => { spec.window.navigation = "top"; },
  ]) {
    const spec = structuredClone(cases[0].expected.composition); change(spec);
    const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", options);
    assert.ok(failed(result, "ui")); assert.equal(result.functionalPassed, false);
  }
  const named = structuredClone(cases[2].expected.composition); named.window.title = "L'Eclat - Mer II";
  assert.ok(failed(evaluateCandidate(cases[2], { ...candidate(2), output: JSON.stringify(named) }, "specialist", options), "ui"));
});

test("French labels and changed control ranges, initial states, labels or required text fail", () => {
  const original = cases[0].expected.composition;
  const fr = structuredClone(original); fr.pages.at(-1)!.label = "Paramètres";
  const frResult = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(fr) }, "specialist", options);
  assert.ok(failed(frResult, "english")); assert.ok(failed(frResult, "ui"));
  for (const field of ["max", "initial", "label", "applyLabel"]) {
    const spec = structuredClone(original), number = spec.pages.flatMap(page => page.items).find(item => item.kind === "number");
    assert.ok(number && number.kind === "number");
    if (field === "max") number.max++; else if (field === "initial") number.initial++; else if (field === "label") number.label = "Speed"; else number.applyLabel = "Set";
    assert.ok(failed(evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", options), "ui"));
  }
  const noText = structuredClone(original); noText.pages[0].items = [];
  assert.ok(failed(evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(noText) }, "specialist", options), "required-text"));
});

test("utility-only hubs and disabled replacements do not satisfy four real gameplay actions", () => {
  const utilities = structuredClone(cases[0].expected.composition);
  utilities.pages = utilities.pages.map(page => ({ ...page, items: page.items.filter(item => !item.featureIds.some(id => ["auto-farm", "auto-boss", "quest-farm", "auto-loot"].includes(id))) }));
  const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(utilities) }, "specialist", options);
  assert.ok(failed(result, "coverage")); assert.ok(failed(result, "four-gameplay-actions"));
  const disabled = structuredClone(cases[0].expected.composition);
  for (const page of disabled.pages) page.items = page.items.map(item => item.id === "auto-farm" ? { id: item.id, featureIds: item.featureIds, kind: "disabled", label: "Auto Farm", reason: "Needs game profile: this placeholder does not perform the requested action." } : item);
  const disabledResult = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(disabled) }, "specialist", options);
  assert.ok(failed(disabledResult, "coverage")); assert.ok(failed(disabledResult, "four-gameplay-actions"));
});

test("no-op and cross-wired game callbacks fail even when schema and labels are complete", () => {
  for (const code of ['local ignored = ctx.enabled', 'ctx.gameplay.setEnabled("boss", ctx.enabled)']) {
    const spec = structuredClone(cases[0].expected.composition), control = spec.pages.flatMap(page => page.items).find(item => item.id === "auto-farm")!;
    assert.ok(control.kind === "toggle"); control.code = code;
    const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", options);
    assert.equal(result.checks.find(check => check.id === "schema")?.passed, true);
    assert.ok(failed(result, "four-gameplay-actions")); assert.equal(result.functionalPassed, false);
  }
});

test("unknown game cannot inherit Blox Fruits factory actions", () => {
  const row = structuredClone(cases[0]); row.game.placeId = "1234567890";
  const result = evaluateCandidate(row, candidate(), "specialist", options);
  assert.ok(failed(result, "gameplay-bindings")); assert.ok(failed(result, "four-gameplay-actions"));
});

test("custom loader/network capability is rejected before runtime", () => {
  const spec = structuredClone(cases[0].expected.composition), rejoin = spec.pages.flatMap(page => page.items).find(item => item.id === "rejoin")!;
  assert.ok(rejoin.kind === "button"); rejoin.action = "custom"; rejoin.code = 'local data = game:HttpGet("https://example.invalid")';
  const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", { sourceSha256: sources });
  assert.ok(failed(result, "safety-static")); assert.equal(result.runtime, null);
});

test("reference static success requires independent runtime; exhausted EOS is reported separately", () => {
  const result = evaluateCandidate(cases[0], candidate(), "specialist", options);
  assert.deepEqual(result.checks.filter(check => !check.passed).map(check => check.id), ["runtime"]);
  assert.equal(result.passed, false); assert.equal(result.functionalPassed, false);
  const exhausted = evaluateCandidate(cases[0], { ...candidate(), stoppedWithEos: false }, "specialist", options);
  assert.equal(exhausted.completion, "budget-exhausted"); assert.ok(failed(exhausted, "completion-budget"));
  const stale = evaluateCandidate(cases[0], candidate(), "specialist", { ...options, sourceSha256: {} });
  assert.ok(failed(stale, "source-provenance"));
});

test("missing specialist/API outputs remain failures in the full denominator; duplicate candidates fail", async () => {
  const report = await evaluate(cases, [candidate()], undefined, { ...options, includeApi: true });
  assert.equal(report.variants.base.cases, 8); assert.equal(report.variants.base.missingOutputs, 8);
  assert.equal(report.variants.specialist.cases, 8); assert.equal(report.variants.specialist.missingOutputs, 7);
  assert.equal(report.variants.api.cases, 8); assert.equal(report.variants.api.missingOutputs, 8);
  assert.equal(report.productionGate.passed, false); assert.equal(report.promotion.eligible, false);
  await assert.rejects(evaluate(cases, [candidate(), candidate()], undefined, options), /Duplicate/);
});

test("training overlap and reference selftests cannot qualify a model", async () => {
  const train = [{ messages: cases[0].messages, expected: { composition: cases[0].expected.composition } }];
  assert.equal(leakageAudit(cases, train).status, "detected");
  assert.deepEqual(leakageAudit(cases, train).promptOverlaps, [cases[0].id]);
  assert.deepEqual(leakageAudit(cases, train).answerOverlaps, [cases[0].id]);
  const outputs = cases.flatMap((_row, index) => ["base", "specialist", "api"].map(variant => ({ ...candidate(index), variant: variant as "base" | "specialist" | "api" })));
  const report = await evaluate(cases, outputs, [{ messages: [{ role: "user", content: "Independent training input" }] }], { ...options, purpose: "reference-self-test" });
  assert.ok(report.productionGate.reasons.some(reason => reason.includes("Reference fixtures")));
  assert.equal(report.productionGate.passed, false); assert.equal(report.promotion.eligible, false);
});

test("alternate equivalent descriptions and implementation IDs are not mistaken for user UI requirements", () => {
  const spec = parseHubComposition(JSON.stringify(cases[0].expected.composition));
  for (const page of spec.pages) { page.id = `other-${page.id}`; for (const item of page.items) { item.id = `other-${item.id}`; if ("description" in item) item.description = "Works through the supplied admitted controller or client action."; } }
  const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", options);
  assert.equal(result.checks.find(check => check.id === "ui")?.passed, true);
  assert.equal(result.checks.find(check => check.id === "four-gameplay-actions")?.passed, true);
});

test("internal lifecycle binding placement is validated by coverage rather than exact UI equality", () => {
  const spec = structuredClone(cases[0].expected.composition);
  spec.window.featureIds = []; spec.pages[0].featureIds = ["ui-lifecycle"];
  const result = evaluateCandidate(cases[0], { ...candidate(), output: JSON.stringify(spec) }, "specialist", options);
  assert.equal(result.checks.find(check => check.id === "coverage")?.passed, true);
  assert.equal(result.checks.find(check => check.id === "ui")?.passed, true);
});
