/** Offline request-parameter receipt; never replaces frozen benchmark artifacts. */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionFixtures } from "./fixtures.ts";
import { captureComposerRequest, sourceSnapshot, sha256 } from "./prompts.ts";

const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function captureApiParameters(directory = fileURLToPath(new URL("artifacts/", import.meta.url))) {
  const manifestRaw = await readFile(path.join(directory, "manifest.json"));
  const manifest = JSON.parse(manifestRaw.toString("utf8"));
  const promptsRaw = await readFile(path.join(directory, "prompts.jsonl"));
  const sourceSha256 = await sourceSnapshot();
  if (manifest.benchmark !== "production-composer-v1" || manifest.cases !== 8
      || digest(promptsRaw) !== manifest.promptsSha256
      || digest(await readFile(path.join(directory, "cases.jsonl"))) !== manifest.caseSha256
      || JSON.stringify(sourceSha256) !== JSON.stringify(manifest.sourceSha256)) throw new Error("Frozen production source/artifact provenance changed");
  const prompts = promptsRaw.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
  const fixtures = buildProductionFixtures();
  if (prompts.length !== 8 || JSON.stringify(prompts.map(row => row.id)) !== JSON.stringify(manifest.caseIds)
      || JSON.stringify(fixtures.map(row => row.id)) !== JSON.stringify(manifest.caseIds)) throw new Error("Expected eight frozen production cases");
  const cases = [];
  for (const [index, fixture] of fixtures.entries()) {
    const capture = await captureComposerRequest(fixture);
    const promptSha256 = sha256(JSON.stringify(capture.messages));
    if (promptSha256 !== prompts[index].promptSha256 || JSON.stringify(capture.messages) !== JSON.stringify(prompts[index].messages)) throw new Error("Real writer messages changed");
    cases.push({ id: fixture.id, promptSha256, writerBudget: capture.writerBudget, providerParameters: capture.providerParameters });
  }
  return { schemaVersion: 1, benchmark: "production-composer-v1", capture: "generateCompleteScript callback budget + createProviderRunner inert body",
    networkCalls: 0, promptsSha256: digest(promptsRaw), productionManifestSha256: digest(manifestRaw), sourceSha256, cases };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = path.resolve(process.argv[2] ?? fileURLToPath(new URL("../../../test-results/specialist-v2/production-api-parameters.json", import.meta.url)));
  const receipt = await captureApiParameters();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ receipt: destination, cases: receipt.cases.length, networkCalls: 0 }));
}
