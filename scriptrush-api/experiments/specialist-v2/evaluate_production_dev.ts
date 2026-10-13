/** Development-only bridge from production TeachingRows to the strict production runtime evaluator. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { evaluate, jsonl, parseCandidates, parseCases, type Candidate } from "./production/evaluate.ts";
import { captureComposerMessages, sourceSnapshot, sha256 } from "./production/prompts.ts";
import type { ProductionCase } from "./production/fixtures.ts";

const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
type TeachingProvenance = {
  capture: "generateCompleteScript + createProviderRunner(inert fetch)";
  sourceSha256: Record<string, string>; promptSha256: string; answerSha256: string;
  networkCalls: 0; origin: "independently-authored-reference"; runtimePassed: boolean | null; trainingUse: "development-only";
};
export type DevelopmentCase = ProductionCase & { split: "dev"; designFamily: string; actionFamily: string; teachingProvenance: TeachingProvenance; teachingRowSha256: string };
type TrainingRecord = { messages?: Array<{ role: string; content: string }>; expected?: { composition?: unknown } };
export type DevelopmentOptions = { runtime?: "run" | "disabled"; runtimeDirectory?: string; expectedTrainingRows?: number };

/** Original reference provenance is retained; frozen final-case provenance is never imitated. */
export async function loadDevelopmentCases(text: string): Promise<DevelopmentCase[]> {
  const raw = jsonl(text);
  if (raw.length !== 4) throw new Error("Production development evaluation requires exactly four development rows");
  const metadata = z.object({ id: z.string().startsWith("production-teach-dev-"), split: z.literal("dev"), designFamily: z.string().min(1), actionFamily: z.string().min(1),
    messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })).length(3),
    provenance: z.object({ capture: z.literal("generateCompleteScript + createProviderRunner(inert fetch)"), sourceSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), promptSha256: z.string().regex(/^[a-f0-9]{64}$/), answerSha256: z.string().regex(/^[a-f0-9]{64}$/), networkCalls: z.literal(0), origin: z.literal("independently-authored-reference"), runtimePassed: z.boolean().nullable(), trainingUse: z.literal("development-only") }) });
  const sources = await sourceSnapshot(), converted: DevelopmentCase[] = [];
  for (const entry of raw) {
    const meta = metadata.parse(entry), record = entry as Record<string, unknown>;
    if (!sameSources(meta.provenance.sourceSha256, sources)) throw new Error(`Development row source hashes are stale: ${meta.id}`);
    if (meta.messages.map(message => message.role).join(",") !== "system,user,assistant") throw new Error(`Development messages must retain one system, user and reference assistant: ${meta.id}`);
    const messages = meta.messages.slice(0, 2) as ProductionCase["messages"];
    if (meta.provenance.promptSha256 !== sha256(canonical(messages))) throw new Error(`Original teaching prompt hash mismatch: ${meta.id}`);
    let assistant: unknown;
    try { assistant = JSON.parse(meta.messages[2].content); } catch { throw new Error(`Malformed teaching reference answer: ${meta.id}`); }
    if (meta.provenance.answerSha256 !== sha256(canonical(assistant))) throw new Error(`Original teaching answer hash mismatch: ${meta.id}`);
    const rows = parseCases(JSON.stringify({ ...record, messages, provenance: {
      capture: meta.provenance.capture, sourceSha256: meta.provenance.sourceSha256,
      promptSha256: sha256(JSON.stringify(messages)), planner: "reference contract supplied locally; planner not evaluated", networkCalls: 0, trainingUse: "excluded",
    } }));
    const row = rows[0];
    if (canonical(row.expected.composition) !== canonical(assistant)) throw new Error(`Reference assistant and expected composition differ: ${meta.id}`);
    // Local stage capture proves the bridge retained real production input rather
    // than synthesizing a compact v2 prompt or trusting a self-reported hash.
    const actualMessages = await captureComposerMessages(row);
    if (JSON.stringify(actualMessages) !== JSON.stringify(messages)) throw new Error(`Development messages differ from the actual current composer capture: ${meta.id}`);
    converted.push({ ...row, split: "dev", designFamily: meta.designFamily, actionFamily: meta.actionFamily, teachingProvenance: meta.provenance, teachingRowSha256: sha256(canonical(entry)) });
  }
  if (new Set(converted.map(row => row.id)).size !== 4) throw new Error("Development case IDs must be unique");
  return converted;
}

function sameSources(left: Record<string, string>, right: Record<string, string>) { return canonical(left) === canonical(right); }

export function loadDevelopmentCandidates(text: string): Candidate[] {
  const records = jsonl(text) as Array<Record<string, unknown>>;
  // Preserve exact pinned revisions in the evaluator's existing model field.
  const normalized = records.map(record => ({ ...record, ...(typeof record.model === "string" && typeof record.revision === "string" ? { model: `${record.model}@${record.revision}` } : {}) }));
  return parseCandidates(normalized.map(record => JSON.stringify(record)).join("\n"));
}

export async function evaluateDevelopment(cases: DevelopmentCase[], candidates: Candidate[], training: TrainingRecord[], options: DevelopmentOptions = {}) {
  if (cases.length !== 4 || cases.some(row => row.split !== "dev" || !row.id.startsWith("production-teach-dev-"))) throw new Error("Only the four independent production development rows are accepted");
  const expectedTrainingRows = options.expectedTrainingRows ?? 144;
  if (training.length !== expectedTrainingRows) throw new Error(`Expected ${expectedTrainingRows} actual training rows, received ${training.length}`);
  const report = await evaluate(cases, candidates, training, { runtime: options.runtime ?? "run", runtimeDirectory: options.runtimeDirectory });
  const developmentReason = "Development cases are for debugging only and cannot qualify or promote a production model, regardless of acceptance rate";
  return { ...report, benchmark: "production-composer-development-v1", development: {
    split: "dev", cases: 4, actualTrainingRows: training.length, finalTestCasesUsed: 0,
    assistantReferencesRemovedFromInference: true,
    allSpecialistFunctional: report.variants.specialist.functionalPasses === 4,
    allSpecialistAccepted: report.variants.specialist.accepted === 4,
    originalTeachingProvenance: cases.map(row => ({ id: row.id, split: row.split, designFamily: row.designFamily, actionFamily: row.actionFamily, teachingRowSha256: row.teachingRowSha256, provenance: row.teachingProvenance, evaluationPromptSha256: row.provenance.promptSha256 })),
  }, productionGate: { ...report.productionGate, passed: false, reasons: [developmentReason, ...report.productionGate.reasons] },
    promotion: { eligible: false, reasons: [developmentReason, ...report.promotion.reasons] },
    limitations: [developmentReason, ...report.limitations] };
}

async function main() {
  const args = process.argv.slice(2), positional = args.filter(arg => !arg.startsWith("--"));
  const [devPath, outputsPath, trainingPath, reportPath] = positional;
  if (!devPath || !outputsPath || !trainingPath || !reportPath) throw new Error("Usage: node --experimental-strip-types experiments/specialist-v2/evaluate_production_dev.ts <production-dataset/dev.jsonl> <predictions.jsonl> <actual-train-144.jsonl> <dev-report.json> [--no-runtime]");
  const report = await evaluateDevelopment(await loadDevelopmentCases(readFileSync(devPath, "utf8")), loadDevelopmentCandidates(readFileSync(outputsPath, "utf8")), jsonl(readFileSync(trainingPath, "utf8")) as TrainingRecord[], { runtime: args.includes("--no-runtime") ? "disabled" : "run", runtimeDirectory: path.join(path.dirname(path.resolve(reportPath)), "production-dev-runtime") });
  const inputFiles = Object.fromEntries([devPath, outputsPath, trainingPath].map(file => [path.resolve(file), sha256(readFileSync(file, "utf8"))]));
  mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true }); writeFileSync(reportPath, JSON.stringify({ ...report, inputFiles }, null, 2) + "\n");
  console.log(JSON.stringify({ report: path.resolve(reportPath), benchmark: report.benchmark, development: { ...report.development, originalTeachingProvenance: undefined }, variants: report.variants, productionGate: report.productionGate, promotion: report.promotion }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
