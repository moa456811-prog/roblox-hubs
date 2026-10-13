import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionCases, sha256 } from "./prompts.ts";

export async function writeBenchmark(directory: string) {
  const cases = await buildProductionCases();
  await mkdir(directory, { recursive: true });
  const payload = cases.map(row => JSON.stringify(row)).join("\n") + "\n";
  const prompts = cases.map(row => JSON.stringify({ id: row.id, benchmark: row.benchmark, messages: row.messages, promptSha256: row.provenance.promptSha256 })).join("\n") + "\n";
  await writeFile(path.join(directory, "cases.jsonl"), payload);
  // This is the ONLY file an inference caller should read. It has no expected answers.
  await writeFile(path.join(directory, "prompts.jsonl"), prompts);
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ schemaVersion: 1, benchmark: "production-composer-v1", cases: cases.length, caseIds: cases.map(row => row.id), caseSha256: sha256(payload), promptsSha256: sha256(prompts), sourceSha256: cases[0]?.provenance.sourceSha256, trainingUse: "excluded; new separate production benchmark", inferenceCalls: 0, networkCalls: 0, limitations: ["Blox Fruits admitted controller only; not live-game verified.", "Reference planner inventory is fixed; actual production writer message formatting is captured."] }, null, 2) + "\n");
  return { directory, cases: cases.length, caseIds: cases.map(row => row.id), networkCalls: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL("artifacts/", import.meta.url)));
  console.log(JSON.stringify(await writeBenchmark(directory), null, 2));
}
