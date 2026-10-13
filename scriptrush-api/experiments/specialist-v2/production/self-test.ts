/** Exercise all acceptance gates with authored references; this is never model inference. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionCases } from "./prompts.ts";
import { evaluate, type Candidate } from "./evaluate.ts";

export async function selfTest(directory: string) {
  const cases = await buildProductionCases();
  const candidates: Candidate[] = cases.map(row => ({ id: row.id, variant: "specialist", output: JSON.stringify(row.expected.composition), stoppedWithEos: true, model: "authored-reference-fixture-only", origin: "reference-self-test" }));
  const report = await evaluate(cases, candidates, undefined, { purpose: "reference-self-test", runtimeDirectory: path.join(directory, "runtime") });
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, "reference-self-test.json");
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  if (report.variants.specialist.accepted !== cases.length || report.productionGate.passed || report.promotion.eligible) throw new Error("Reference selftest failed or was incorrectly treated as model qualification");
  return { report: output, referencesPassed: report.variants.specialist.accepted, cases: cases.length, modelInferenceCalls: 0, networkCalls: 0, modelQualified: false, productionActivated: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await selfTest(path.resolve(process.argv[2] ?? fileURLToPath(new URL("artifacts/", import.meta.url)))), null, 2));
}
