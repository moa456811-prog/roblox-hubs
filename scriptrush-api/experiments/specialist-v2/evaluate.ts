/** Offline paired evaluation with separately reported static reference equality and closed Luau execution. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { contractSchema, type GenerationContract } from "../../src/lib/generation-contract.ts";
import { parseHubComposition, validateCompositionCoverage, type HubComposition, type HubItem } from "../../src/lib/hub-spec.ts";
import { renderHubComposition } from "../../src/lib/hub-composer.ts";
import { englishUiIssues } from "../../src/lib/ui-language.ts";
import { reviewScript } from "../../src/lib/script-output.ts";
import { evaluateCandidate as evaluateReference } from "../specialist/evaluate.ts";
import { runRuntime, type RuntimeReport } from "./runtime/run.ts";

export type Variant = "base" | "specialist" | "api";
type Message = { role: string; content: string };
export type EvaluationCase = {
  id: string; split: string; designFamily: string; actionFamily: string; messages: Message[];
  expected: { composition: HubComposition; contract: GenerationContract; featureIds: string[]; ui: Record<string, unknown> };
};
export type Candidate = {
  id: string; variant: Variant; output: string; durationMs?: number; error?: string;
  inputTokens?: number; outputTokens?: number; costUsd?: number; stoppedWithEos?: boolean;
};
export type Check = { id: string; passed: boolean; issues: string[] };
export type CaseResult = {
  id: string; variant: Variant; passed: boolean; functionalPassed: boolean; softScore: number; checks: Check[];
  referenceStrictPassed: boolean; referenceChecks: Check[]; runtime: RuntimeReport | null;
  features: { id: string; passed: boolean; assessed: boolean }[]; outputSha256: string; outputCharacters: number;
  durationMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null;
  missingOutput: boolean; stoppedWithEos: boolean | null; completionStatus: "finished" | "budget-exhausted" | "unknown";
};

const CHECK_IDS = ["inference", "completion-budget", "schema", "coverage", "ui", "language", "identity", "controls", "required-text", "render", "safety-static", "lifecycle-static", "runtime"] as const;
export type RuntimeObservation = RuntimeReport & {variant:Variant};
export type EvaluationOptions = {runtime?: "run" | "disabled" | RuntimeObservation[]; runtimeDirectory?: string; includeApi?: boolean};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const normalizeCode = (code: string) => code.replace(/\r\n/g, "\n").trim();
const measured = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
const itemList = (spec: HubComposition) => spec.pages.flatMap(page => page.items.map(item => ({ page: page.label, item })));
const interactive = (item: HubItem) => item.kind === "button" || item.kind === "number" || item.kind === "toggle";

/** Preserve identical inference inputs: expected answers must never enter a model prompt. */
export function inferenceMessages(record: EvaluationCase): Message[] {
  return record.messages.filter(message => message.role !== "assistant").map(message => ({ ...message }));
}

export function parseCases(text: string): EvaluationCase[] {
  const records = parseJsonl(text).map((raw, index) => {
    const row = z.object({
      id: z.string().min(1), split: z.enum(["train", "validation", "val", "dev", "test"]),
      designFamily: z.string().min(1), actionFamily: z.string().min(1),
      messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })).min(2),
      expected: z.object({ composition: z.unknown(), contract: contractSchema.extend({ fullHub: z.boolean() }), featureIds: z.array(z.string()).min(1), ui: z.record(z.string(), z.unknown()) }),
    }).parse(raw);
    const composition = parseHubComposition(JSON.stringify(row.expected.composition));
    if (!row.messages.some(message => message.role === "user")) throw new Error(`Case ${index + 1} has no user message`);
    if (!same([...row.expected.featureIds].sort(), row.expected.contract.features.map(feature => feature.id).sort())) throw new Error(`Case ${row.id} has inconsistent expected feature IDs`);
    const referenceIssues = [...validateCompositionCoverage(composition, row.expected.contract), ...englishUiIssues(composition), ...reviewScript(renderHubComposition(composition))];
    if (referenceIssues.length) throw new Error(`Case ${row.id} has an invalid reference: ${referenceIssues.join("; ")}`);
    return { ...row, expected: { ...row.expected, composition } } satisfies EvaluationCase;
  });
  assertUnique(records.map(row => row.id), "case id");
  return records;
}

export function parseCandidates(text: string): Candidate[] {
  const candidates = parseJsonl(text).map(raw => z.object({
    id: z.string().min(1), variant: z.enum(["base", "specialist", "api"]), output: z.string(),
    durationMs: z.number().finite().nonnegative().optional(), error: z.string().optional(),
    inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().finite().nonnegative().optional(), stoppedWithEos: z.boolean().optional(),
  }).parse(raw));
  assertUnique(candidates.map(row => `${row.variant}:${row.id}`), "candidate id/variant");
  return candidates;
}

export function parseRuntimeObservations(text: string): RuntimeObservation[] {
  const raw = JSON.parse(text);
  const records = z.array(z.object({
    id:z.string().min(1), variant:z.enum(["base","specialist","api"]), passed:z.boolean(),
    checks:z.array(z.object({name:z.string(),passed:z.boolean(),detail:z.string().default("")})),
    failures:z.array(z.string()).default([]), runtimeErrors:z.array(z.string()).default([]),
    durationMs:z.number().finite().nonnegative().default(0), interpreter:z.string().default(""), execution:z.string().default(""),
    limitations:z.array(z.string()).default([]), sourceSha256:z.string().default(""), sourceFile:z.string().default(""),
    observations:z.record(z.string(),z.unknown()).optional(),
  })).parse(Array.isArray(raw) ? raw : raw.reports);
  assertUnique(records.map(row=>`${row.variant}:${row.id}`),"runtime id/variant");
  return records;
}

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

function parseJsonl(text: string): unknown[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL at nonempty record ${index + 1}`); }
  });
}

function visibleTexts(spec: HubComposition): string[] {
  return [spec.window.title, spec.window.closeLabel ?? "", spec.window.minimizeLabel ?? "", spec.window.restoreLabel,
    ...spec.pages.flatMap(page => [page.label, ...page.items.flatMap(item => item.kind === "text" ? [item.text]
      : item.kind === "disabled" ? [item.label, item.reason]
        : [item.label, item.description, ...(item.kind === "number" ? [item.applyLabel] : item.kind === "toggle" ? [item.onLabel, item.offLabel] : [])])])];
}

function uiIssues(actual: HubComposition, expected: HubComposition): string[] {
  const issues: string[] = [];
  const keys = ["title", "width", "height", "radius", "draggable", "navigation", "font", "textSize", "closeLabel", "minimizeLabel", "restoreLabel", "palette", "alternatePalette"] as const;
  for (const key of keys) if (!same(actual.window[key], expected.window[key])) issues.push(`Window ${key} differs from the requested reference`);
  if (!same(actual.pages.map(page => page.label), expected.pages.map(page => page.label))) issues.push("Requested page labels, order or count differ");
  for (const page of expected.pages) {
    const found = actual.pages.find(candidate => candidate.label === page.label);
    if (found && !same(found.items.filter(item => item.kind === "text").map(item => item.text), page.items.filter(item => item.kind === "text").map(item => item.text))) issues.push(`Requested page text differs: ${page.label}`);
  }
  return issues;
}

function controlsForFeature(actual: HubComposition, record: EvaluationCase, id: string): string[] {
  const expected = record.expected.composition;
  const expectedItems = itemList(expected).filter(({ item }) => item.featureIds.includes(id));
  const actualItems = itemList(actual).filter(({ item }) => item.featureIds.includes(id));
  const issues: string[] = [];
  if (actualItems.length !== expectedItems.length) issues.push(`Independent control count differs: ${id}`);
  for (const [index, wanted] of expectedItems.entries()) {
    // Item IDs are implementation details; match feature bindings and occurrence order.
    const found = actualItems[index];
    if (!found) continue;
    const expectedValues = { ...wanted.item } as Record<string, unknown>;
    const actualValues = { ...found.item } as Record<string, unknown>;
    delete expectedValues.id; delete actualValues.id;
    // Effect equality belongs to the independent runtime gate, rather than byte equality.
    // Explicitly supplied source or descriptions remain acceptance requirements.
    let requested: Record<string, unknown> | undefined;
    try {
      const user = record.messages.findLast(message => message.role === "user");
      const controls = user && JSON.parse(user.content).requestedControls;
      if (Array.isArray(controls)) requested = controls.find(control => control.featureId === id);
    } catch { /* Fixtures without a structured request still retain labels/ranges/states. */ }
    for (const key of ["description", "code", "action"]) {
      if (!requested || !Object.hasOwn(requested, key)) { delete expectedValues[key]; delete actualValues[key]; }
      else expectedValues[key] = requested[key];
    }
    expectedValues.featureIds = [...wanted.item.featureIds].sort(); actualValues.featureIds = [...found.item.featureIds].sort();
    if (typeof expectedValues.code === "string") expectedValues.code = normalizeCode(expectedValues.code);
    if (typeof actualValues.code === "string") actualValues.code = normalizeCode(actualValues.code);
    if (found.page !== wanted.page) issues.push(`Feature is on the wrong requested page: ${id}`);
    if (!same(actualValues, expectedValues)) issues.push(`Requested control labels, type, range, state or explicit text/source differ: ${id}`);
  }
  return issues;
}

function lifecycleIssues(script: string, spec: HubComposition): string[] {
  const issues: string[] = [];
  for (const marker of ["own(gui.Destroying, cleanup)", "for _, connection in ipairs(connections) do connection:Disconnect() end", "table.clear(cleanupCallbacks)"])
    if (!script.includes(marker)) issues.push("Owned renderer cleanup is missing");
  if (spec.window.closeLabel && !script.includes("cleanup()\n    gui:Destroy()")) issues.push("Close does not dispose the owned interface");
  for (const { item } of itemList(spec)) {
    if (!("code" in item) || item.action !== "custom") continue;
    if (/:\s*Connect\s*\(/.test(item.code)) issues.push(`Custom connection bypasses ctx.own: ${item.id}`);
    if (/\b(?:task\.(?:spawn|defer|delay)|while\s+true|repeat\b)/.test(item.code) && !/ctx\.onCleanup\s*\(/.test(item.code)) issues.push(`Asynchronous custom work has no cleanup registration: ${item.id}`);
  }
  return [...new Set(issues)];
}

function runtimeForFeature(runtime: RuntimeReport | null, id: string): boolean {
  if (!runtime || runtime.runtimeErrors.length) return false;
  const names = ["walk-speed", "jump-power", "camera-fov", "night-vision", "world-marker", "focus-landmark", "read-coins", "open-journal", "hud-visible", "rejoin", "theme"];
  const related = runtime.checks.filter(check => id === "interface" ? !names.some(name => check.name.startsWith(name + " "))
    : check.name.startsWith(id + " ") || id === "night-vision" && check.name === "close restores original brightness"
      || id === "hud-visible" && check.name === "close restores original HUD state"
      || id === "world-marker" && check.name === "close destroys active landmark markers");
  return related.length > 0 && related.every(check => check.passed);
}

export function evaluateCandidate(record: EvaluationCase, candidate: Candidate | undefined, variant: Variant, options: EvaluationOptions = {}): CaseResult {
  const checks: Check[] = [];
  const check = (id: string, issues: string[]) => checks.push({ id, passed: issues.length === 0, issues });
  const output = candidate?.output ?? "";
  const reference = evaluateReference(record, candidate ? {...candidate, variant:"base"} : undefined, "base");
  const result: CaseResult = {
    id: record.id, variant, passed: false, functionalPassed: false, softScore: 0, checks, runtime: null,
    referenceStrictPassed: reference.passed, referenceChecks: reference.checks,
    features: record.expected.featureIds.map(id => ({ id, passed: false, assessed: false })),
    outputSha256: hash(output), outputCharacters: output.length, missingOutput: !candidate,
    durationMs: measured(candidate?.durationMs), inputTokens: measured(candidate?.inputTokens), outputTokens: measured(candidate?.outputTokens), costUsd: measured(candidate?.costUsd),
    stoppedWithEos: candidate?.stoppedWithEos ?? null,
    completionStatus: candidate?.stoppedWithEos === true ? "finished" : candidate?.stoppedWithEos === false ? "budget-exhausted" : "unknown",
  };
  check("inference", !candidate ? ["No result supplied; counted as a failed case"] : candidate.error ? ["Inference reported an error"] : []);
  check("completion-budget", candidate?.stoppedWithEos === false ? ["Generation stopped without EOS under the bounded decoding budget; incomplete decoding is a separate failure and does not isolate training quality"] : []);
  let spec: HubComposition;
  try { spec = parseHubComposition(output); } catch { check("schema", ["Output is not a valid complete hub composition"]); return result; }
  check("schema", []);
  const coverage = validateCompositionCoverage(spec, record.expected.contract);
  check("coverage", coverage);
  check("ui", uiIssues(spec, record.expected.composition));
  check("language", englishUiIssues(spec));
  const wantedTexts = visibleTexts(record.expected.composition).join("\n");
  const unexpectedBrand = /\b(?:a7dev|a7med_o6t|created by|powered by|scriptrush)\b/i;
  check("identity", visibleTexts(spec).some(text => unexpectedBrand.test(text) && !wantedTexts.includes(text)) ? ["Unrequested product, reference-skill identity or creator credit"] : []);
  const controlIssues = record.expected.featureIds.flatMap(id => controlsForFeature(spec, record, id));
  const actualInteractive = itemList(spec).filter(({ item }) => interactive(item)).length;
  const wantedInteractive = itemList(record.expected.composition).filter(({ item }) => interactive(item)).length;
  if (actualInteractive !== wantedInteractive) controlIssues.push("Extra or missing interactive controls change the requested scope");
  check("controls", [...new Set(controlIssues)]);
  const texts = visibleTexts(spec);
  check("required-text", record.expected.contract.ui.requiredText.filter(text => !texts.some(value => value.includes(text))).map(text => `Required visible text is missing: ${text}`));
  let script = "";
  try { script = renderHubComposition(spec); check("render", []); } catch { check("render", ["Trusted renderer rejected this layout"]); }
  check("safety-static", script ? [...reviewScript(script), ...(/\b(?:require|loadstring|HttpGet|HttpPost|request)\s*\(/.test(itemList(spec).map(({ item }) => "code" in item ? item.code : "").join("\n")) ? ["Custom code requests an external loader or network capability"] : [])] : ["No rendered script"]);
  check("lifecycle-static", script ? lifecycleIssues(script, spec) : ["No rendered script"]);
  const mode = options.runtime ?? "run";
  if (!checks.find(entry => entry.id === "inference")?.passed || !checks.find(entry => entry.id === "safety-static")?.passed) {
    check("runtime", ["Runtime was not executed because inference or static safety failed"]);
  } else if (mode === "disabled") {
    check("runtime", ["No independent runtime evidence supplied; this case cannot pass the functional gate"]);
  } else {
    try {
      const runtime = mode === "run" ? runRuntime(record, spec, {directory:options.runtimeDirectory, tag:`${variant}-${record.id}`})
        : mode.find(entry => entry.id === record.id && entry.variant === variant);
      if (!runtime) throw new Error("No matching runtime result supplied");
      if (runtime.sourceSha256 !== hash(script)) throw new Error("Runtime source hash differs from this rendered candidate");
      result.runtime = runtime;
      check("runtime", runtime.passed && runtime.checks.length > 0 && runtime.checks.every(entry => entry.passed) && !runtime.runtimeErrors.length
        ? [] : [...runtime.failures, ...runtime.runtimeErrors, "Closed fixture runtime gate failed"]);
    } catch (error) { check("runtime", [error instanceof Error ? error.message : "Runtime evaluation failed"]); }
  }
  result.features = record.expected.featureIds.map(id => ({ id, assessed: result.runtime !== null,
    passed: !coverage.some(issue => issue.endsWith(`: ${id}`)) && controlsForFeature(spec, record, id).length === 0 && runtimeForFeature(result.runtime, id) }));
  result.functionalPassed = checks.filter(entry => entry.id !== "completion-budget").every(entry => entry.passed);
  result.passed = checks.every(entry => entry.passed);
  result.softScore = checks.filter(entry => entry.passed).length / checks.length;
  return result;
}

const promptFingerprint = (record: EvaluationCase) => hash(canonical(inferenceMessages(record)));
const answerFingerprint = (record: EvaluationCase) => hash(canonical(record.expected.composition));

export function leakageAudit(cases: EvaluationCase[], training?: EvaluationCase[]) {
  const overlaps = (kind: "prompt" | "answer" | "designFamily" | "actionFamily") => {
    const key = (record: EvaluationCase) => kind === "prompt" ? promptFingerprint(record) : kind === "answer" ? answerFingerprint(record) : record[kind];
    const seen = new Set(training?.map(key));
    return cases.filter(record => seen.has(key(record))).map(record => record.id);
  };
  const evidence = { trainSplitCases: cases.filter(record => record.split === "train").map(record => record.id), prompt: overlaps("prompt"), answer: overlaps("answer"), designFamily: overlaps("designFamily"), actionFamily: overlaps("actionFamily") };
  return { status: evidence.trainSplitCases.length || Object.values(evidence).some(ids => ids.length) ? "detected" : training ? "clean" : "not-audited", evidence };
}

function summarize(rows: CaseResult[]) {
  const observations = (key: "durationMs" | "inputTokens" | "outputTokens" | "costUsd") => rows.flatMap(row => row[key] === null ? [] : [row[key]!]);
  const values = observations("durationMs").sort((a, b) => a - b);
  const tokens = observations("inputTokens"), outputs = observations("outputTokens"), costs = observations("costUsd");
  const featureRows = rows.flatMap(row => row.features);
  const featureCounts = (features: CaseResult["features"]) => ({
    required: features.length, assessed: features.filter(feature => feature.assessed).length,
    passes: features.filter(feature => feature.passed).length,
    failures: features.filter(feature => feature.assessed && !feature.passed).length,
    notAssessed: features.filter(feature => !feature.assessed).length,
    passRateOnRequired: features.length ? features.filter(feature => feature.passed).length / features.length : null,
  });
  return {
    cases: rows.length, strictPasses: rows.filter(row => row.passed).length,
    strictPassRate: rows.length ? rows.filter(row => row.passed).length / rows.length : null,
    functionalPasses: rows.filter(row=>row.functionalPassed).length,
    functionalPassRate: rows.length ? rows.filter(row=>row.functionalPassed).length/rows.length : null,
    referenceStrictPasses: rows.filter(row=>row.referenceStrictPassed).length,
    referenceStrictPassRate: rows.length ? rows.filter(row=>row.referenceStrictPassed).length/rows.length : null,
    inferenceErrors: rows.filter(row=>row.checks.some(check=>check.id==="inference" && !check.passed) && !row.missingOutput).length,
    meanSoftScore: rows.length ? rows.reduce((sum, row) => sum + row.softScore, 0) / rows.length : null,
    missingOutputs: rows.filter(row => row.missingOutput).length,
    completion: { finished: rows.filter(row => row.completionStatus === "finished").length, budgetExhausted: rows.filter(row => row.completionStatus === "budget-exhausted").length, unknown: rows.filter(row => row.completionStatus === "unknown").length },
    checks: Object.fromEntries(CHECK_IDS.map(id => {
      const evaluated = rows.flatMap(row => row.checks.filter(check => check.id === id));
      return [id, { cases: rows.length, evaluated: evaluated.length, passes: evaluated.filter(check => check.passed).length, failures: evaluated.filter(check => !check.passed).length, notEvaluated: rows.length - evaluated.length, passRateOnAllCases: rows.length ? evaluated.filter(check => check.passed).length / rows.length : null }];
    })),
    features: {
      ...featureCounts(featureRows), completeCases: rows.filter(row => row.features.every(feature => feature.assessed && feature.passed)).length,
      completeCaseRate: rows.length ? rows.filter(row => row.features.every(feature => feature.assessed && feature.passed)).length / rows.length : null,
      byId: Object.fromEntries([...new Set(featureRows.map(feature => feature.id))].sort().map(id => [id, featureCounts(featureRows.filter(feature => feature.id === id))])),
    },
    latency: { observations: values.length, medianMs: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2 : null, p95Ms: values.length ? values[Math.ceil(values.length * .95) - 1] : null },
    usage: { inputTokenObservations: tokens.length, inputTokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null, outputTokenObservations: outputs.length, outputTokens: outputs.length ? outputs.reduce((a, b) => a + b, 0) : null, costObservations: costs.length, costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null },
  };
}

export function evaluate(cases: EvaluationCase[], candidates: Candidate[], training?: EvaluationCase[], options: EvaluationOptions = {}) {
  assertUnique(cases.map(row => row.id), "case id"); assertUnique(candidates.map(row => `${row.variant}:${row.id}`), "candidate id/variant");
  const known = new Set(cases.map(record => record.id));
  if (candidates.some(candidate => !known.has(candidate.id))) throw new Error("Candidate refers to an unknown evaluation case");
  if (Array.isArray(options.runtime)) {
    assertUnique(options.runtime.map(row=>`${row.variant}:${row.id}`),"runtime id/variant");
    if (options.runtime.some(row=>!known.has(row.id))) throw new Error("Runtime result refers to an unknown evaluation case");
  }
  const includeApi = options.includeApi || candidates.some(row=>row.variant==="api");
  const variantNames:Variant[] = includeApi ? ["base","specialist","api"] : ["base","specialist"];
  const results = cases.flatMap(record => variantNames.map(variant => evaluateCandidate(record, candidates.find(candidate => candidate.id === record.id && candidate.variant === variant), variant, options)));
  const variants = { base: summarize(results.filter(row => row.variant === "base")), specialist: summarize(results.filter(row => row.variant === "specialist")), ...(includeApi ? {api:summarize(results.filter(row=>row.variant==="api"))} : {}) };
  let specialistWins = 0, baseWins = 0, ties = 0;
  for (const record of cases) {
    const base = results.find(row => row.id === record.id && row.variant === "base")!, specialist = results.find(row => row.id === record.id && row.variant === "specialist")!;
    if (base.passed === specialist.passed) ties++; else if (specialist.passed) specialistWins++; else baseWins++;
  }
  const leakage = leakageAudit(cases, training);
  const limitations = [
    "Exact requested UI, labels, ranges, initial states and explicitly supplied descriptions/source remain mandatory.",
    "Functional acceptance additionally requires actual rendered callback execution in a closed fictional Roblox mock, not a live game.",
    "The v1 byte-exact reference result is diagnostic only; different callback implementations can pass only when their assessed effects pass runtime checks.",
    "English detection rejects known untranslated labels; it is not a complete language classifier.",
    "Synthetic owned-game fixtures do not establish live Roblox compatibility, remote behavior or visual rendering correctness.",
    includeApi ? "API comparison measures only the supplied API outputs on these identical fixtures; provider identity/configuration must be recorded by the caller."
      : "This run does not compare APInex or OpenRouter because no API candidate set was supplied.",
    "A generation without EOS under a token/time budget is reported separately; truncated output does not isolate training or model quality.",
    "Development cases are for iteration and cannot authorize promotion. A small final synthetic set does not establish general model superiority.",
  ];
  const cautions = [...(!cases.length ? ["No evaluation cases"] : []), ...(cases.length < 20 ? ["Small evaluation set"] : []), ...(results.some(row => row.missingOutput) ? ["Incomplete paired inference outputs"] : []), ...(results.some(row => row.completionStatus === "budget-exhausted") ? ["Generation budget exhausted; incomplete decoding failures do not isolate training quality"] : []), ...(results.some(row => row.completionStatus === "unknown") ? ["EOS completion status was not supplied for every result"] : []), ...(leakage.status !== "clean" ? [`Training leakage ${leakage.status}`] : [])];
  if (cases.some(row=>row.split!=="test")) cautions.push("Contains non-final cases; ineligible for production promotion");
  if (!includeApi) cautions.push("No current production API comparison");
  const apiComparison = variants.api ? {
    pairedCases:cases.length,
    specialistWins:cases.filter(record=>results.find(row=>row.id===record.id && row.variant==="specialist")!.passed && !results.find(row=>row.id===record.id && row.variant==="api")!.passed).length,
    apiWins:cases.filter(record=>!results.find(row=>row.id===record.id && row.variant==="specialist")!.passed && results.find(row=>row.id===record.id && row.variant==="api")!.passed).length,
    acceptedRateDelta:variants.api.strictPassRate===null || variants.specialist.strictPassRate===null ? null : variants.specialist.strictPassRate-variants.api.strictPassRate,
  } : null;
  const gateReasons = [
    ...(cases.length<12 ? ["At least twelve untouched final cases are required"] : []),
    ...(new Set(cases.map(promptFingerprint)).size!==cases.length ? ["Final inference prompts must be distinct"] : []),
    ...(new Set(cases.map(answerFingerprint)).size!==cases.length ? ["Final expected hub compositions must be distinct"] : []),
    ...(cases.some(row=>row.split!=="test") ? ["Only untouched test-split cases can pass promotion"] : []),
    ...(leakage.status!=="clean" ? ["Clean audited training separation is required"] : []),
    ...(variants.specialist.strictPassRate!==1 ? ["Every final specialist hub must pass the functional gate"] : []),
    ...(variants.specialist.completion.finished!==cases.length ? ["Every specialist output must have confirmed completion"] : []),
    ...(variants.base.missingOutputs || variants.base.inferenceErrors ? ["Base comparison contains missing outputs or inference errors"] : []),
    ...(!variants.api ? ["Current production API comparison is missing"] : variants.api.missingOutputs || variants.api.inferenceErrors ? ["API comparison contains missing outputs or provider errors"] : []),
    ...(!apiComparison || apiComparison.acceptedRateDelta===null || apiComparison.acceptedRateDelta<=0 ? ["Specialist has not beaten the measured production API acceptance rate"] : []),
  ];
  return {
    schemaVersion: 2, evaluation: "offline-composition-functional-v2", cases: cases.length, variants, leakage,
    comparison: { pairedCases: cases.length, specialistWins, baseWins, ties, strictPassRateDelta: variants.base.strictPassRate === null || variants.specialist.strictPassRate === null ? null : variants.specialist.strictPassRate - variants.base.strictPassRate, api:apiComparison, conclusion: "superiority-not-established", cautions },
    promotion: {eligible:gateReasons.length===0,reasons:gateReasons,scope:"Eligibility on this final synthetic sample only; a deployable, authorized inference endpoint is also required. This evaluator never deploys a model."},
    limitations, results,
  };
}

function main() {
  const args=process.argv.slice(2), positional=args.filter(arg=>!arg.startsWith("--"));
  const [casesPath, candidatesPath, reportPath, trainingPath, runtimePath] = positional;
  if (!casesPath || !candidatesPath || !reportPath) throw new Error("Usage: node --experimental-strip-types experiments/specialist-v2/evaluate.ts <cases.jsonl> <outputs.jsonl> <report.json> [train.jsonl] [runtime.json] [--include-api] [--no-runtime]");
  const cases = parseCases(readFileSync(casesPath, "utf8"));
  const report = evaluate(cases, parseCandidates(readFileSync(candidatesPath, "utf8")), trainingPath ? parseCases(readFileSync(trainingPath, "utf8")) : undefined,
    {includeApi:args.includes("--include-api"),runtime:args.includes("--no-runtime") ? "disabled" : runtimePath ? parseRuntimeObservations(readFileSync(runtimePath,"utf8")) : "run"});
  mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.resolve(reportPath), cases: report.cases, variants: report.variants, leakage: report.leakage.status, comparison: report.comparison }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
