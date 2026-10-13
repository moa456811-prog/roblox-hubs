/** Offline production-shaped writer gate. This module never contacts a model or activates an endpoint. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { contractSchema } from "../../../src/lib/generation-contract.ts";
import { parseHubComposition, validateCompositionCoverage, type HubComposition, type HubItem } from "../../../src/lib/hub-spec.ts";
import { renderHubComposition } from "../../../src/lib/hub-composer.ts";
import { gameAdapterFor, gameplayBindingIssues } from "../../../src/lib/game-adapters/catalog.ts";
import { compositionUsesGameplay, gameplayToggleKey } from "../../../src/lib/game-actions.ts";
import { englishUiIssues } from "../../../src/lib/ui-language.ts";
import { reviewScript } from "../../../src/lib/script-output.ts";
import { sourceSnapshot, sha256 } from "./prompts.ts";
import type { ProductionCase } from "./fixtures.ts";
import { runProductionRuntime, type RuntimeReport } from "./runtime/run.ts";

export type Variant = "base" | "specialist" | "api";
export type Candidate = { id: string; variant: Variant; output: string; error?: string; stoppedWithEos?: boolean; durationMs?: number; inputTokens?: number; outputTokens?: number; model?: string; origin?: "model-inference" | "reference-self-test" };
export type Check = { id: string; passed: boolean; issues: string[] };
export type CaseResult = { id: string; variant: Variant; passed: boolean; functionalPassed: boolean; completion: "finished" | "budget-exhausted" | "unknown"; missingOutput: boolean; checks: Check[]; runtime: RuntimeReport | null; outputSha256: string; scriptSha256: string | null; model: string | null; origin: string; durationMs: number | null; inputTokens: number | null; outputTokens: number | null };
export type Options = { runtime?: "run" | "disabled"; runtimeDirectory?: string; includeApi?: boolean; purpose?: "model-comparison" | "reference-self-test"; sourceSha256?: Record<string, string> };
const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const itemList = (spec: HubComposition) => spec.pages.flatMap(page => page.items.map(item => ({ page: page.label, item })));
const interactive = (item: HubItem) => item.kind === "button" || item.kind === "number" || item.kind === "toggle";
const numeric = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function parseCandidates(text: string): Candidate[] {
  return jsonl(text).map(raw => z.object({ id: z.string().min(1), variant: z.enum(["base", "specialist", "api"]), output: z.string(), error: z.string().optional(), stoppedWithEos: z.boolean().optional(), durationMs: z.number().nonnegative().optional(), inputTokens: z.number().nonnegative().optional(), outputTokens: z.number().nonnegative().optional(), model: z.string().optional(), origin: z.enum(["model-inference", "reference-self-test"]).optional() }).parse(raw));
}
export const jsonl = (text: string): unknown[] => text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));

export function parseCases(text: string): ProductionCase[] {
  const schema = z.object({ id: z.string().startsWith("production-"), benchmark: z.literal("production-composer-v1"), locale: z.enum(["fr", "en"]), uiFamily: z.string().min(1), game: z.record(z.string(), z.unknown()), request: z.string().min(1),
    context: z.object({ prompt: z.string(), currentScript: z.string(), patch: z.boolean(), game: z.record(z.string(), z.unknown()), supportedFeatures: z.array(z.string()), ledger: z.string(), sources: z.string(), diagnostic: z.string(), researchContext: z.string().optional() }),
    messages: z.array(z.object({ role: z.enum(["system", "user"]), content: z.string().min(1) })).length(2),
    expected: z.object({ contract: contractSchema.extend({ fullHub: z.literal(true) }), composition: z.unknown() }),
    provenance: z.object({ capture: z.literal("generateCompleteScript + createProviderRunner(inert fetch)"), promptSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), planner: z.literal("reference contract supplied locally; planner not evaluated"), networkCalls: z.literal(0), trainingUse: z.literal("excluded") }) });
  const rows = jsonl(text).map(raw => {
    const row = schema.parse(raw);
    const composition = parseHubComposition(JSON.stringify(row.expected.composition));
    if (row.messages[0].role !== "system" || row.messages[1].role !== "user" || row.provenance.promptSha256 !== sha256(JSON.stringify(row.messages))) throw new Error(`Message provenance mismatch: ${row.id}`);
    if (row.request !== row.context.prompt || !same(row.game, row.context.game)) throw new Error(`Production context mismatch: ${row.id}`);
    const reference = { ...row, expected: { ...row.expected, composition } } satisfies ProductionCase;
    const checks = staticChecks(reference, composition).checks;
    if (checks.some(check => !check.passed)) throw new Error(`Invalid production reference ${row.id}: ${checks.filter(check => !check.passed).flatMap(check => check.issues).join("; ")}`);
    return reference;
  });
  unique(rows.map(row => row.id), "case id");
  return rows;
}

function unique(keys: string[], label: string) { if (new Set(keys).size !== keys.length) throw new Error(`Duplicate ${label}`); }

/** IDs and unrequested descriptions are implementation details. Exact requested UI and control values are mandatory. */
export function uiIssues(row: ProductionCase, actual: HubComposition): string[] {
  const expected = row.expected.composition, issues: string[] = [];
  const { featureIds: _wantedWindowBindings, ...wantedWindow } = expected.window;
  const { featureIds: _gotWindowBindings, ...gotWindow } = actual.window;
  if (!same(wantedWindow, gotWindow)) issues.push("Requested window title, size, radius, navigation, typography, lifecycle controls or palettes differ");
  if (!same(expected.pages.map(page => page.label), actual.pages.map(page => page.label))) issues.push("Requested page labels, count or order differ");
  for (let index = 0; index < Math.max(expected.pages.length, actual.pages.length); index++) {
    const wanted = expected.pages[index], found = actual.pages[index];
    if (!wanted || !found) continue;
    if (wanted.items.length !== found.items.length) issues.push(`Requested content/control count differs: ${wanted.label}`);
    for (let at = 0; at < Math.max(wanted.items.length, found.items.length); at++) {
      const a = wanted.items[at], b = found.items[at];
      if (!a || !b) continue;
      const acceptedFields = (item: HubItem) => {
        const fields = { ...item } as Record<string, unknown>;
        delete fields.id; delete fields.description; delete fields.code; delete fields.action; delete fields.featureIds;
        return fields;
      };
      if (!same(acceptedFields(a), acceptedFields(b))) issues.push(`Requested control/text kind, label, range, initial state or position differs: ${wanted.label} item ${at + 1}`);
    }
  }
  return issues;
}

export function staticChecks(row: ProductionCase, spec: HubComposition): { checks: Check[]; script: string } {
  const checks: Check[] = [], check = (id: string, issues: string[]) => checks.push({ id, passed: !issues.length, issues });
  const pack = gameAdapterFor(row.game);
  check("coverage", validateCompositionCoverage(spec, row.expected.contract));
  check("gameplay-bindings", gameplayBindingIssues(spec, row.expected.contract, pack));
  const admittedIssues: string[] = [];
  if (!pack) admittedIssues.push("An exact admitted game action library is required by this benchmark");
  // Merely omitting ctx.gameplay evades the production binding check. This separate
  // gate requires all four concrete server actions rather than utility-only hubs.
  for (const action of pack?.actions ?? []) {
    const controls = itemList(spec).filter(({ item }) => item.featureIds.includes(action.id) && interactive(item));
    if (controls.length !== 1 || controls[0].item.kind !== "toggle" || controls[0].item.action !== "custom" || controls[0].item.initial || gameplayToggleKey(controls[0].item.code) !== action.key) admittedIssues.push(`Missing complete initially-off admitted action control: ${action.id}`);
  }
  check("four-gameplay-actions", admittedIssues);
  check("ui", uiIssues(row, spec));
  check("english", englishUiIssues(spec));
  const visible = [spec.window.title, ...spec.pages.flatMap(page => [page.label, ...page.items.flatMap(item => item.kind === "text" ? [item.text] : item.kind === "disabled" ? [item.label, item.reason] : [item.label, item.description])])];
  const exactTitle = row.expected.composition.window.title;
  check("identity", visible.some(text => /\b(?:a7dev|a7med_o6t|powered by|created by|scriptrush)\b/i.test(text) && text !== exactTitle) ? ["Unrequested branding or creator identity"] : []);
  const allTexts = [spec.window.title, spec.window.closeLabel, spec.window.minimizeLabel, spec.window.restoreLabel, ...spec.pages.flatMap(page => [page.label, ...page.items.flatMap(item => item.kind === "text" ? [item.text] : item.kind === "disabled" ? [item.label, item.reason] : [item.label, item.description, ...(item.kind === "number" ? [item.applyLabel] : item.kind === "toggle" ? [item.onLabel, item.offLabel] : [])])])];
  check("required-text", row.expected.contract.ui.requiredText.filter(text => !allTexts.includes(text)).map(text => `Missing requested text: ${text}`));
  let script = "";
  try { script = renderHubComposition(spec, compositionUsesGameplay(spec) && pack ? { gameplayFactory: pack.factory } : {}); check("render-with-audited-factory", []); }
  catch (error) { check("render-with-audited-factory", [error instanceof Error ? error.message : "Renderer failed"]); }
  const custom = itemList(spec).flatMap(({ item }) => "code" in item && item.action === "custom" ? [item.code] : []).join("\n");
  const blocked = /\b(?:require|loadstring|loadfile|dofile|HttpGet|HttpPost|request|http_request|readfile|writefile|appendfile|setfenv|getfenv)\s*\(|\b(?:syn|http|debug|io|os)\s*[.:]|\bgame\s*:\s*(?:HttpGet|HttpPost)/i;
  check("safety-static", [...(script ? reviewScript(script) : ["No rendered script"]), ...(blocked.test(custom) ? ["Generated custom callbacks request an external or sandbox capability"] : []), ...(/:\s*Connect\s*\(/.test(custom) ? ["Generated connections must use ctx.own"] : []), ...(/\b(?:task\.(?:spawn|defer|delay)|while\s+true|repeat\b)/.test(custom) && !/ctx\.onCleanup\s*\(/.test(custom) ? ["Asynchronous generated work lacks cleanup"] : [])]);
  return { checks, script };
}

export function evaluateCandidate(row: ProductionCase, candidate: Candidate | undefined, variant: Variant, options: Options = {}): CaseResult {
  const output = candidate?.output ?? "", checks: Check[] = [];
  const check = (id: string, issues: string[]) => checks.push({ id, passed: !issues.length, issues });
  const completion = candidate?.stoppedWithEos === true ? "finished" : candidate?.stoppedWithEos === false ? "budget-exhausted" : "unknown";
  const result: CaseResult = { id: row.id, variant, passed: false, functionalPassed: false, completion, missingOutput: !candidate, checks, runtime: null, outputSha256: sha256(output), scriptSha256: null, model: candidate?.model ?? null, origin: candidate?.origin ?? "unspecified", durationMs: numeric(candidate?.durationMs), inputTokens: numeric(candidate?.inputTokens), outputTokens: numeric(candidate?.outputTokens) };
  check("inference", !candidate ? ["Missing candidate output"] : candidate.error ? [`Candidate inference failed: ${candidate.error}`] : !output.trim() ? ["Empty candidate output"] : []);
  check("completion-budget", completion === "finished" ? [] : [completion === "budget-exhausted" ? "Generation exhausted its decode budget" : "Confirmed completion was not supplied"]);
  check("source-provenance", options.sourceSha256 && same(row.provenance.sourceSha256, options.sourceSha256) && row.provenance.promptSha256 === sha256(JSON.stringify(row.messages)) ? [] : ["Current production source and prompt provenance were not verified"]);
  let spec: HubComposition;
  try { spec = parseHubComposition(output); check("schema", []); }
  catch { check("schema", ["Invalid composition JSON/schema"]); return result; }
  const assessment = staticChecks(row, spec);
  checks.push(...assessment.checks); result.scriptSha256 = sha256(assessment.script);
  if (options.runtime === "disabled") check("runtime", ["Closed runtime was disabled; static checks cannot establish functionality"]);
  else if (checks.some(entry => !entry.passed && ["inference", "safety-static", "four-gameplay-actions", "gameplay-bindings"].includes(entry.id))) check("runtime", ["Runtime refused because candidate inference or admitted-action safety failed"]);
  else {
    try {
      const runtime = runProductionRuntime(row, spec, { directory: options.runtimeDirectory, tag: `${variant}-${row.id}` });
      result.runtime = runtime;
      check("runtime", runtime.sourceSha256 !== result.scriptSha256 ? ["Runtime source SHA differs from the evaluated candidate"] : runtime.passed && runtime.checks.length > 0 && runtime.checks.every(entry => entry.passed) && !runtime.runtimeErrors.length ? [] : [...runtime.failures, ...runtime.runtimeErrors, "Parameterized closed Blox Fruits runtime failed"]);
    } catch (error) { check("runtime", [error instanceof Error ? error.message : "Closed runtime failed"]); }
  }
  result.functionalPassed = checks.filter(entry => entry.id !== "completion-budget").every(entry => entry.passed);
  result.passed = checks.every(entry => entry.passed);
  return result;
}

type TrainingRecord = { messages?: Array<{ role: string; content: string }>; expected?: { composition?: unknown } };
export function leakageAudit(cases: ProductionCase[], training?: TrainingRecord[]) {
  if (!training) return { status: "not-audited", promptOverlaps: [] as string[], answerOverlaps: [] as string[], trainingRows: 0 };
  const prompts = new Set(training.map(row => sha256(canonical((row.messages ?? []).filter(message => message.role !== "assistant")))));
  const answers = new Set(training.map(row => row.expected?.composition ?? (() => { try { return JSON.parse(row.messages?.findLast(message => message.role === "assistant")?.content ?? "null"); } catch { return null; } })()).filter(Boolean).map(value => sha256(canonical(value))));
  const promptOverlaps = cases.filter(row => prompts.has(sha256(canonical(row.messages)))).map(row => row.id);
  const answerOverlaps = cases.filter(row => answers.has(sha256(canonical(row.expected.composition)))).map(row => row.id);
  return { status: promptOverlaps.length || answerOverlaps.length ? "detected" : "clean", promptOverlaps, answerOverlaps, trainingRows: training.length };
}

function summarize(rows: CaseResult[]) {
  const checkIds = [...new Set(rows.flatMap(row => row.checks.map(check => check.id)))];
  return { cases: rows.length, accepted: rows.filter(row => row.passed).length, acceptedRate: rows.length ? rows.filter(row => row.passed).length / rows.length : null, functionalPasses: rows.filter(row => row.functionalPassed).length, missingOutputs: rows.filter(row => row.missingOutput).length,
    inferenceErrors: rows.filter(row => row.checks.some(check => check.id === "inference" && !check.passed) && !row.missingOutput).length,
    completion: { finished: rows.filter(row => row.completion === "finished").length, budgetExhausted: rows.filter(row => row.completion === "budget-exhausted").length, unknown: rows.filter(row => row.completion === "unknown").length },
    checks: Object.fromEntries(checkIds.map(id => { const evaluated = rows.flatMap(row => row.checks.filter(check => check.id === id)); return [id, { required: rows.length, evaluated: evaluated.length, passes: evaluated.filter(check => check.passed).length, failures: evaluated.filter(check => !check.passed).length, notEvaluated: rows.length - evaluated.length }]; })) };
}

export async function evaluate(cases: ProductionCase[], candidates: Candidate[], training?: TrainingRecord[], options: Options = {}) {
  unique(cases.map(row => row.id), "case id"); unique(candidates.map(row => `${row.variant}:${row.id}`), "candidate id/variant");
  const known = new Set(cases.map(row => row.id));
  if (candidates.some(row => !known.has(row.id))) throw new Error("Candidate refers to an unknown production case");
  const sourceSha256 = options.sourceSha256 ?? await sourceSnapshot();
  const includeApi = options.includeApi || candidates.some(candidate => candidate.variant === "api");
  const variants: Variant[] = includeApi ? ["base", "specialist", "api"] : ["base", "specialist"];
  const results = cases.flatMap(row => variants.map(variant => evaluateCandidate(row, candidates.find(candidate => candidate.id === row.id && candidate.variant === variant), variant, { ...options, sourceSha256 })));
  const summary = Object.fromEntries(variants.map(variant => [variant, summarize(results.filter(row => row.variant === variant))])) as Record<Variant, ReturnType<typeof summarize>>;
  const leakage = leakageAudit(cases, training);
  const apiDelta = summary.api && summary.api.acceptedRate !== null && summary.specialist.acceptedRate !== null ? summary.specialist.acceptedRate - summary.api.acceptedRate : null;
  const reasons = [
    ...(cases.length < 6 ? ["At least six independent new production-shaped cases are required"] : []),
    ...(new Set(cases.map(row => row.provenance.promptSha256)).size !== cases.length ? ["Production writer prompts must be distinct"] : []),
    ...(cases.some(row => row.benchmark !== "production-composer-v1") ? ["The separate production benchmark is required"] : []),
    ...(leakage.status !== "clean" || !leakage.trainingRows ? ["Nonempty actual training inputs must be audited as disjoint"] : []),
    ...(options.purpose === "reference-self-test" || candidates.some(row => row.origin !== "model-inference" || !row.model) ? ["Reference fixtures or outputs without model-inference provenance cannot qualify a model"] : []),
    ...(summary.specialist.accepted !== cases.length ? ["Every specialist hub must pass exact UI, four gameplay actions, safety and runtime"] : []),
    ...(summary.base.missingOutputs || summary.base.inferenceErrors ? ["Base-model comparison is incomplete or failed inference"] : []),
    ...(!summary.api ? ["Current production API comparison is missing"] : summary.api.missingOutputs || summary.api.inferenceErrors ? ["Production API comparison is incomplete or failed inference"] : []),
    ...(apiDelta === null || apiDelta <= 0 ? ["Specialist has not beaten current API acceptance on the same production messages"] : []),
  ];
  return { schemaVersion: 1, benchmark: "production-composer-v1", purpose: options.purpose ?? "model-comparison", cases: cases.length, variants: summary, leakage, sourceSha256, comparison: { apiAcceptedRateDelta: apiDelta, conclusion: reasons.length ? "production-qualification-not-established" : "sample-production-composer-qualification-passed" },
    productionGate: { passed: !reasons.length, reasons, scope: "Writer stage only: eight new custom-UI Blox Fruits fixture requests using the admitted server controller." },
    promotion: { eligible: false, reasons: ["This separate writer gate never activates or promotes a model. The untouched v2 final gate, a current API comparison, prompt-aligned endpoint integration and authorized deployable hosting remain required."] },
    limitations: ["Planner is supplied an independently authored reference inventory; planner and semantic reviewer quality are not evaluated.", "Messages are captured through the actual production generator and provider formatter with an inert injected transport; no model or network is used by this evaluator.", "Gameplay effects are validated only in closed deterministic mocks of admitted Blox Fruits source observations; this is not live-game certification.", "All cases use the only admitted full four-action library. This benchmark establishes no functional farm/quest support for other Roblox games.", "English checks detect known French controls; exact requested labels and English text complement that finite check.", "The exact preset button bypasses the writer; these freeform custom-UI cases deliberately test the composition path.", "Reference selftests validate the benchmark harness and never count as evidence of trained-model superiority."], results };
}

async function main() {
  const args = process.argv.slice(2), positional = args.filter(arg => !arg.startsWith("--"));
  const [casesPath, outputsPath, reportPath, trainingPath] = positional;
  if (!casesPath || !outputsPath || !reportPath) throw new Error("Usage: node --experimental-strip-types experiments/specialist-v2/production/evaluate.ts <cases.jsonl> <outputs.jsonl> <report.json> [actual-train.jsonl] [--include-api] [--no-runtime] [--reference-self-test]");
  const report = await evaluate(parseCases(readFileSync(casesPath, "utf8")), parseCandidates(readFileSync(outputsPath, "utf8")), trainingPath ? jsonl(readFileSync(trainingPath, "utf8")) as TrainingRecord[] : undefined, { includeApi: args.includes("--include-api"), runtime: args.includes("--no-runtime") ? "disabled" : "run", purpose: args.includes("--reference-self-test") ? "reference-self-test" : "model-comparison" });
  mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true }); writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.resolve(reportPath), cases: report.cases, variants: report.variants, productionGate: report.productionGate, promotion: report.promotion }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
