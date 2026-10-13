/** Local opt-in authoring command. Never exposed as a visitor request handler. */
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importGitHubSource, documentsFromImport, validateDeploymentImport, type VerifiedImport } from "./ingest.ts";
import { sha256 } from "./util.ts";
import type { KnowledgeRole } from "./types.ts";

export function parseImportArguments(argv: string[]) {
  const input = { optIn: false, repository: "", commitSha: "", paths: [] as string[], roles: [] as KnowledgeRole[], gamePlaceIds: [] as string[] };
  for (let at = 0; at < argv.length; at++) {
    const key = argv[at]; if (key === "--opt-in") { input.optIn = true; continue; }
    if (!["--repository", "--commit", "--file", "--role", "--place-id"].includes(key) || !argv[at + 1] || argv[at + 1].startsWith("--")) throw new Error("INVALID_IMPORT_CLI_ARGUMENT");
    const value = argv[++at];
    if (key === "--repository") { if (input.repository) throw new Error("DUPLICATE_IMPORT_ARGUMENT"); input.repository = value; }
    else if (key === "--commit") { if (input.commitSha) throw new Error("DUPLICATE_IMPORT_ARGUMENT"); input.commitSha = value; }
    else if (key === "--file") input.paths.push(value);
    else if (key === "--role") input.roles.push(value as KnowledgeRole);
    else input.gamePlaceIds.push(value);
  }
  return input;
}
export async function persistVerifiedImport(destination: string, source: VerifiedImport): Promise<{ records: number; sha256: string }> {
  // The live importer must have admitted this exact immutable object; persisted
  // JSON is accepted only on the deployment-owned read path after validation.
  documentsFromImport(source);
  const raw = await readFile(destination); if (raw.byteLength > 4_500_000) throw new Error("PERSISTED_KNOWLEDGE_TOO_LARGE");
  const current = JSON.parse(raw.toString("utf-8"));
  if (!current || Object.keys(current).sort().join("|") !== "imports|schemaVersion" || current.schemaVersion !== 2 || !Array.isArray(current.imports) || current.imports.length > 8) throw new Error("INVALID_PERSISTED_IMPORTS");
  for (const row of current.imports) validateDeploymentImport(row);
  const records = [...current.imports.filter((row: VerifiedImport) => !(row.repo === source.repo && row.commitSha === source.commitSha)), source];
  if (records.length > 8) throw new Error("PERSISTED_SOURCE_COUNT_EXCEEDED");
  const body = Buffer.from(JSON.stringify({ schemaVersion: 2, imports: records }, null, 2) + "\n"); if (body.byteLength > 4_500_000) throw new Error("PERSISTED_KNOWLEDGE_TOO_LARGE");
  const temporary = destination + "." + randomUUID() + ".tmp";
  try { await writeFile(temporary, body, { flag: "wx", mode: 0o600 }); await rename(temporary, destination); }
  finally { await unlink(temporary).catch(() => {}); }
  return { records: records.length, sha256: sha256(body) };
}
export async function runImportCli(argv: string[], options: { fetch?: typeof globalThis.fetch; destination?: string } = {}) {
  const input = parseImportArguments(argv);
  const source = await importGitHubSource(input, { fetch: options.fetch });
  const destination = options.destination ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../knowledge-v2/imports.json");
  const result = await persistVerifiedImport(destination, source);
  return { imported: true, repo: source.repo, commitSha: source.commitSha, files: source.files.map(file => ({ path: file.path, sha256: file.sha256 })), licenseSpdx: source.license.spdx, licenseSha256: source.license.sha256, gamePlaceIds: source.gamePlaceIds, records: result.records, manifestSha256: result.sha256, codeExecuted: false, gameFunctionalityVerified: false, requiresApplicationRebuildForDeployment: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runImportCli(process.argv.slice(2)), null, 2)); }
  catch (error) { const code = error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message) ? error.message : "KNOWLEDGE_IMPORT_FAILED"; console.error(JSON.stringify({ error: code, imported: false, codeExecuted: false })); process.exitCode = 1; }
}
