/** Offline, paired evaluation. Model text is parsed as data and is never executed. */
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

type Variant = "base" | "specialist";
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
  id: string; variant: Variant; passed: boolean; softScore: number; checks: Check[];
  features: { id: string; passed: boolean; assessed: boolean }[]; outputSha256: string; outputCharacters: number;
  durationMs: number | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null;
  missingOutput: boolean; stoppedWithEos: boolean | null; completionStatus: "finished" | "budget-exhausted" | "unknown";
};

const CHECK_IDS = ["inference", "completion-budget", "schema", "coverage", "ui", "language", "identity", "controls", "required-text", "render", "safety-static", "lifecycle-static"] as const;

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
      id: z.string().min(1), split: z.enum(["train", "validation", "val", "test"]),
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
    id: z.string().min(1), variant: z.enum(["base", "specialist"]), output: z.string(),
    durationMs: z.number().finite().nonnegative().optional(), error: z.string().optional(),
    inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().finite().nonnegative().optional(), stoppedWithEos: z.boolean().optional(),
  }).parse(raw));
  assertUnique(candidates.map(row => `${row.variant}:${row.id}`), "candidate id/variant");
  return candidates;
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

function controlsForFeature(actual: HubComposition, expected: HubComposition, id: string): string[] {
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
    expectedValues.featureIds = [...wanted.item.featureIds].sort(); actualValues.featureIds = [...found.item.featureIds].sort();
    if (typeof expectedValues.code === "string") expectedValues.code = normalizeCode(expectedValues.code);
    if (typeof actualValues.code === "string") actualValues.code = normalizeCode(actualValues.code);
    if (found.page !== wanted.page) issues.push(`Feature is on the wrong requested page: ${id}`);
    if (!same(actualValues, expectedValues)) issues.push(`Control labels, range, state, action or audited callback differ: ${id}`);
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

export function evaluateCandidate(record: EvaluationCase, candidate: Candidate | undefined, variant: Variant): CaseResult {
  const checks: Check[] = [];
  const check = (id: string, issues: string[]) => checks.push({ id, passed: issues.length === 0, issues });
  const output = candidate?.output ?? "";
  const result: CaseResult = {
    id: record.id, variant, passed: false, softScore: 0, checks, features: record.expected.featureIds.map(id => ({ id, passed: false, assessed: false })),
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
  const controlIssues = record.expected.featureIds.flatMap(id => controlsForFeature(spec, record.expected.composition, id));
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
  result.features = record.expected.featureIds.map(id => ({ id, assessed: true, passed: !coverage.some(issue => issue.endsWith(`: ${id}`)) && controlsForFeature(spec, record.expected.composition, id).length === 0 }));
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

export function evaluate(cases: EvaluationCase[], candidates: Candidate[], training?: EvaluationCase[]) {
  assertUnique(cases.map(row => row.id), "case id"); assertUnique(candidates.map(row => `${row.variant}:${row.id}`), "candidate id/variant");
  const known = new Set(cases.map(record => record.id));
  if (candidates.some(candidate => !known.has(candidate.id))) throw new Error("Candidate refers to an unknown evaluation case");
  const results = cases.flatMap(record => (["base", "specialist"] as const).map(variant => evaluateCandidate(record, candidates.find(candidate => candidate.id === record.id && candidate.variant === variant), variant)));
  const variants = { base: summarize(results.filter(row => row.variant === "base")), specialist: summarize(results.filter(row => row.variant === "specialist")) };
  let specialistWins = 0, baseWins = 0, ties = 0;
  for (const record of cases) {
    const base = results.find(row => row.id === record.id && row.variant === "base")!, specialist = results.find(row => row.id === record.id && row.variant === "specialist")!;
    if (base.passed === specialist.passed) ties++; else if (specialist.passed) specialistWins++; else baseWins++;
  }
  const leakage = leakageAudit(cases, training);
  const limitations = [
    "Static parsing, exact requested UI/control values and a trusted renderer; generated code is never executed by this evaluator.",
    "Audited custom callback equality is conservative: equivalent implementations with different bytes can be rejected.",
    "English detection rejects known untranslated labels; it is not a complete language classifier.",
    "Synthetic owned-game fixtures do not establish live Roblox compatibility, remote behavior or visual rendering correctness.",
    "This run compares only the notebook's local base model and its LoRA specialist; it does not compare APInex or OpenRouter.",
    "A generation without EOS under a token/time budget is reported separately; truncated output does not isolate training or model quality.",
    "Descriptive paired rates do not establish general model superiority; repeated real inference and independent runtime evaluation are required.",
  ];
  const cautions = [...(!cases.length ? ["No evaluation cases"] : []), ...(cases.length < 20 ? ["Small evaluation set"] : []), ...(results.some(row => row.missingOutput) ? ["Incomplete paired inference outputs"] : []), ...(results.some(row => row.completionStatus === "budget-exhausted") ? ["Generation budget exhausted; incomplete decoding failures do not isolate training quality"] : []), ...(results.some(row => row.completionStatus === "unknown") ? ["EOS completion status was not supplied for every result"] : []), ...(leakage.status !== "clean" ? [`Training leakage ${leakage.status}`] : [])];
  return {
    schemaVersion: 1, evaluation: "offline-composition-static-v1", cases: cases.length, variants, leakage,
    comparison: { pairedCases: cases.length, specialistWins, baseWins, ties, strictPassRateDelta: variants.base.strictPassRate === null || variants.specialist.strictPassRate === null ? null : variants.specialist.strictPassRate - variants.base.strictPassRate, conclusion: "superiority-not-established", cautions },
    limitations, results,
  };
}

function main() {
  const [casesPath, candidatesPath, reportPath, trainingPath] = process.argv.slice(2);
  if (!casesPath || !candidatesPath || !reportPath) throw new Error("Usage: node --experimental-strip-types experiments/specialist/evaluate.ts <test.jsonl> <outputs.jsonl> <report.json> [train.jsonl]");
  const cases = parseCases(readFileSync(casesPath, "utf8"));
  const report = evaluate(cases, parseCandidates(readFileSync(candidatesPath, "utf8")), trainingPath ? parseCases(readFileSync(trainingPath, "utf8")) : undefined);
  mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.resolve(reportPath), cases: report.cases, variants: report.variants, leakage: report.leakage.status, comparison: report.comparison }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
