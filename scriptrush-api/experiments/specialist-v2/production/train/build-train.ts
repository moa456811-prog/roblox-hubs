import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHubComposition, validateCompositionCoverage } from "../../../../src/lib/hub-spec.ts";
import { gameAdapterFor, gameplayBindingIssues } from "../../../../src/lib/game-adapters/catalog.ts";
import { englishUiIssues } from "../../../../src/lib/ui-language.ts";
import { renderHubComposition } from "../../../../src/lib/hub-composer.ts";
import { reviewScript } from "../../../../src/lib/script-output.ts";
import { captureComposerMessages, sourceSnapshot, sha256 } from "../prompts.ts";
import { runProductionRuntime } from "../runtime/run.ts";
import { buildTeachingFixtures, COUNTS, type Split } from "./fixtures.ts";

const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry);
export async function buildTeachingRows(options: { runtime?: boolean; runtimeDirectory?: string } = {}) {
  const sourceSha256 = await sourceSnapshot(), fixtures = buildTeachingFixtures();
  const rows: Record<Split, Array<Record<string, unknown>>> = { train: [], validation: [], dev: [] };
  const promptHashes = new Set<string>(), answerHashes = new Set<string>();
  for (const split of Object.keys(fixtures) as Split[]) for (const fixture of fixtures[split]) {
    const composition = parseHubComposition(JSON.stringify(fixture.expected.composition)), pack = gameAdapterFor(fixture.game)!;
    const script = renderHubComposition(composition, { gameplayFactory: pack.factory });
    const issues = [...validateCompositionCoverage(composition, fixture.expected.contract), ...gameplayBindingIssues(composition, fixture.expected.contract, pack), ...englishUiIssues(composition), ...reviewScript(script)];
    if (issues.length) throw new Error(`Invalid teaching reference ${fixture.id}: ${issues.join("; ")}`);
    const messages = await captureComposerMessages(fixture), promptSha256 = sha256(canonical(messages)), answerSha256 = sha256(canonical(composition));
    if (promptHashes.has(promptSha256) || answerHashes.has(answerSha256)) throw new Error("Duplicate teaching prompt or answer across splits");
    promptHashes.add(promptSha256); answerHashes.add(answerSha256);
    const runtime = options.runtime === false ? null : runProductionRuntime(fixture, composition, { directory: options.runtimeDirectory, tag: fixture.id });
    if (runtime && !runtime.passed) throw new Error(`Teaching runtime failed ${fixture.id}: ${runtime.failures.join("; ")}`);
    rows[split].push({ ...fixture, messages: [...messages, { role: "assistant", content: JSON.stringify(composition) }], expected: { ...fixture.expected, featureIds: fixture.expected.contract.features.map(feature => feature.id), ui: { ...composition.window, pageLabels: composition.pages.map(page => page.label), language: "en" } }, provenance: { capture: "generateCompleteScript + createProviderRunner(inert fetch)", sourceSha256, promptSha256, answerSha256, networkCalls: 0, origin: "independently-authored-reference", runtimePassed: runtime?.passed ?? null, trainingUse: split === "train" ? "training" : split === "validation" ? "validation-only" : "development-only" } });
  }
  return rows;
}

export async function writeTeachingSet(directory: string, heldoutCasesPath: string, options: { runtime?: boolean } = {}) {
  const rows = await buildTeachingRows({ ...options, runtimeDirectory: path.join(directory, "runtime") });
  // Held-out records are read only AFTER all teaching references are authored.
  // Their content is used exclusively for a negative exact-overlap audit.
  const heldout = (await readFile(heldoutCasesPath, "utf8")).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const heldoutPrompts = new Set(heldout.map(row => sha256(canonical(row.messages)))), heldoutAnswers = new Set(heldout.map(row => sha256(canonical(row.expected.composition))));
  const overlaps = Object.values(rows).flat().filter(row => {
    const provenance = row.provenance as { promptSha256: string; answerSha256: string };
    return heldoutPrompts.has(provenance.promptSha256) || heldoutAnswers.has(provenance.answerSha256);
  }).map(row => row.id);
  if (overlaps.length) throw new Error(`Teaching set overlaps held-out production benchmark: ${overlaps.join(", ")}`);
  await mkdir(directory, { recursive: true });
  const files: Record<string, { rows: number; sha256: string }> = {};
  for (const split of Object.keys(rows) as Split[]) {
    const payload = rows[split].map(row => JSON.stringify(row)).join("\n") + "\n";
    await writeFile(path.join(directory, `${split}.jsonl`), payload); files[split] = { rows: rows[split].length, sha256: sha256(payload) };
  }
  const manifest = { schemaVersion: 1, stage: "production-composer-teaching-v1", counts: COUNTS, files, sourceSha256: (rows.train[0].provenance as { sourceSha256: Record<string, string> }).sourceSha256, heldoutAudit: { caseCount: heldout.length, overlaps, purpose: "negative exact prompt/answer overlap audit only; no teaching examples selected from heldout" }, runtime: options.runtime === false ? "not-run" : "all 60 authored references passed closed parameterized Blox Fruits runtime", networkCalls: 0, modelInferenceCalls: 0, limitations: ["Only the admitted source-backed Blox Fruits action catalog is taught here.", "Validation/development grouping families and visual designs are disjoint from training; all eight production test records remain excluded.", "These are authored references, not evidence that any model has learned their behavior."] };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { directory, ...manifest };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), positional = args.filter(arg => !arg.startsWith("--"));
  console.log(JSON.stringify(await writeTeachingSet(path.resolve(positional[0] ?? fileURLToPath(new URL("artifacts/", import.meta.url))), path.resolve(positional[1] ?? fileURLToPath(new URL("../artifacts/cases.jsonl", import.meta.url))), { runtime: !args.includes("--no-runtime") }), null, 2));
}
