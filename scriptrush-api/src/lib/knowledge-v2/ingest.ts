import { createHash } from "node:crypto";
import type { KnowledgeDocument, KnowledgeRole } from "./types.ts";
import { KNOWLEDGE_ROLES } from "./types.ts";
import { publicJson, sha256, boundedInteger, deepFreeze } from "./util.ts";

/** Conservative actual-text verifier. Other SPDX IDs remain blocked for review. */
export const MIT_LICENSE_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim().replace(/\s+/g, " ");
export function verifiedMitText(value: string): boolean {
  const lines = value.replace(/\r\n/g, "\n").trim().split("\n");
  if (/^MIT(?: License)?$/i.test(lines[0]?.trim())) lines.shift();
  while (!lines[0]?.trim() && lines.length) lines.shift();
  let copyright = 0;
  while (/^Copyright\s+(?:\(c\)|©)?\s*\d{4}[^\r\n]{1,240}$/i.test(lines[0]?.trim() ?? "")) { copyright++; lines.shift(); while (!lines[0]?.trim() && lines.length) lines.shift(); }
  return copyright > 0 && normalize(lines.join("\n")) === normalize(MIT_LICENSE_BODY);
}
export type VerifiedImport = Readonly<{ version: 2; repo: string; commitSha: string; roles: KnowledgeRole[]; gamePlaceIds: string[]; license: { spdx: "MIT"; path: string; text: string; sha256: string; gitBlobSha: string; url: string }; files: Array<{ path: string; text: string; sha256: string; gitBlobSha: string }>; retrievedAt: string; apiResponseHashes: string[]; verification: { method: "public-github-api"; repositoryPublic: true; repositoryActive: true; resolvedCommitSha: string } }>;
const admitted = new WeakSet<object>();
const repoParts = (value: string) => { const match = value.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_-]{1,39})\/([A-Za-z0-9_.-]{1,100})\/?$/); if (!match || [".", ".."].includes(match[2])) throw new Error("INVALID_PUBLIC_GITHUB_REPOSITORY"); return `${match[1]}/${match[2]}`; };
const filePath = (value: string) => typeof value === "string" && value.length <= 180 && !/[\\\x00-\x20\x7f:#?%]/.test(value) && !value.startsWith("/") && value.split("/").every(segment => segment && ![".", ".."].includes(segment)) && /\.(?:lua|luau|md)$/i.test(value);
function blob(value: unknown, maximum: number): { text: string; bytes: Uint8Array; sha: string } {
  const row = value as Record<string, unknown>;
  if (!row || row.type !== "file" || row.encoding !== "base64" || typeof row.content !== "string" || typeof row.sha !== "string" || !/^[0-9a-f]{40}$/.test(row.sha) || typeof row.size !== "number" || !Number.isInteger(row.size) || row.size < 1 || row.size > maximum || row.content.length > maximum * 1.5 + 1000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(row.content)) throw new Error("INVALID_PINNED_GITHUB_FILE");
  const bytes = Buffer.from(row.content, "base64");
  if (bytes.length !== row.size || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== row.sha) throw new Error("GITHUB_BLOB_HASH_MISMATCH");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("BINARY_SOURCE_FORBIDDEN");
  return { text, bytes, sha: row.sha };
}
export async function importGitHubSource(input: { optIn: boolean; repository: string; commitSha: string; paths: string[]; roles: KnowledgeRole[]; gamePlaceIds?: string[] }, options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal; now?: () => number; maximumFiles?: number; timeoutMs?: number } = {}): Promise<VerifiedImport> {
  if (input.optIn !== true) throw new Error("SOURCE_INDEXING_OPT_IN_REQUIRED");
  const repo = repoParts(input.repository), maximum = boundedInteger(options.maximumFiles, 4, 1, 8);
  if (!/^[0-9a-f]{40}$/.test(input.commitSha) || !Array.isArray(input.paths) || !input.paths.length || input.paths.length > maximum || new Set(input.paths).size !== input.paths.length || input.paths.some(path => !filePath(path)) || !Array.isArray(input.roles) || !input.roles.length || input.roles.length > 5 || new Set(input.roles).size !== input.roles.length || input.roles.some(role => !KNOWLEDGE_ROLES.includes(role))) throw new Error("INVALID_BOUNDED_SOURCE_IMPORT");
  const gamePlaceIds = input.gamePlaceIds ?? [];
  if (!Array.isArray(gamePlaceIds) || gamePlaceIds.length > 16 || new Set(gamePlaceIds).size !== gamePlaceIds.length || gamePlaceIds.some(id => typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id))) throw new Error("INVALID_GAME_SCOPE");
  const timeoutMs = boundedInteger(options.timeoutMs, 4000, 100, 5000), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000), cancel = () => controller.abort(); options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const hashes: string[] = [];
  const get = async (suffix: string) => { const result = await publicJson(`https://api.github.com/repos/${repo}${suffix}`, { ...options, signal: controller.signal, timeoutMs, maximumBytes: 300_000 }); hashes.push(result.hash); return result.value as Record<string, unknown>; };
  try {
    const metadata = await get("");
    if (typeof metadata.full_name !== "string" || metadata.full_name.toLowerCase() !== repo.toLowerCase() || metadata.private !== false || metadata.archived !== false || metadata.disabled !== false) throw new Error("PUBLIC_ACTIVE_REPOSITORY_REQUIRED");
    const commit = await get(`/commits/${input.commitSha}`); if (commit.sha !== input.commitSha) throw new Error("EXACT_COMMIT_NOT_VERIFIED");
    const license = await get(`/license?ref=${input.commitSha}`), licenseId = (license.license as { spdx_id?: unknown })?.spdx_id;
    if (licenseId !== "MIT" || typeof license.path !== "string" || !/^licen[sc]e(?:\.(?:md|txt))?$/i.test(license.path)) throw new Error("LICENSE_TEXT_REVIEW_REQUIRED");
    const licenseBlob = blob(license, 32_000);
    if (!verifiedMitText(licenseBlob.text)) throw new Error("SPDX_AND_LICENSE_TEXT_MISMATCH");
    const files: VerifiedImport["files"] = []; let total = licenseBlob.bytes.length;
    for (const path of input.paths) {
      const row = await get(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${input.commitSha}`);
      if (row.path !== path) throw new Error("PINNED_SOURCE_PATH_MISMATCH");
      const source = blob(row, 160_000); total += source.bytes.length;
      if (total > 512_000) throw new Error("SOURCE_IMPORT_TOTAL_EXCEEDED");
      const declared = source.text.match(/SPDX-License-Identifier:\s*([^\r\n]+)/i)?.[1].trim();
      if (declared && declared !== "MIT") throw new Error("FILE_LICENSE_CONFLICT");
      files.push({ path, text: source.text, sha256: sha256(source.bytes), gitBlobSha: source.sha });
    }
    const result: VerifiedImport = deepFreeze({ version: 2, repo, commitSha: input.commitSha, roles: [...input.roles], gamePlaceIds: [...gamePlaceIds], license: { spdx: "MIT", path: license.path, text: licenseBlob.text, sha256: sha256(licenseBlob.bytes), gitBlobSha: licenseBlob.sha, url: `https://github.com/${repo}/blob/${input.commitSha}/${license.path}` }, files, retrievedAt: new Date((options.now ?? Date.now)()).toISOString(), apiResponseHashes: hashes, verification: { method: "public-github-api", repositoryPublic: true, repositoryActive: true, resolvedCommitSha: input.commitSha } });
    validateDeploymentImport(result);
    admitted.add(result); return result;
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}
const exactFields = (value: unknown, names: string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === names.sort().join("|"));
const gitHash = (text: string) => { const bytes = Buffer.from(text); return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); };
/** Revalidate deployment-owned persisted artifacts, never visitor 'verified' flags.
 * Authenticity originates in the reviewed CLI's successful fixed-origin HTTPS
 * fetch and the version-controlled deployment file, not a self-signed JSON claim.
 */
export function validateDeploymentImport(value: unknown): asserts value is VerifiedImport {
  const fail = () => { throw new Error("INVALID_DEPLOYMENT_IMPORT_PROOF"); };
  if (!exactFields(value, ["version", "repo", "commitSha", "roles", "gamePlaceIds", "license", "files", "retrievedAt", "apiResponseHashes", "verification"]) || value.version !== 2 || typeof value.repo !== "string" || repoParts(value.repo) !== value.repo || typeof value.commitSha !== "string" || !/^[0-9a-f]{40}$/.test(value.commitSha) || !Array.isArray(value.roles) || !value.roles.length || value.roles.length > 5 || new Set(value.roles).size !== value.roles.length || value.roles.some(role => !KNOWLEDGE_ROLES.includes(role as KnowledgeRole)) || !Array.isArray(value.gamePlaceIds) || value.gamePlaceIds.length > 16 || new Set(value.gamePlaceIds).size !== value.gamePlaceIds.length || value.gamePlaceIds.some(id => typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id)) || typeof value.retrievedAt !== "string" || !Number.isFinite(Date.parse(value.retrievedAt))) fail();
  const source = value as unknown as VerifiedImport;
  if (!exactFields(source.verification, ["method", "repositoryPublic", "repositoryActive", "resolvedCommitSha"]) || source.verification.method !== "public-github-api" || source.verification.repositoryPublic !== true || source.verification.repositoryActive !== true || source.verification.resolvedCommitSha !== source.commitSha) fail();
  const license = source.license;
  if (!exactFields(license, ["spdx", "path", "text", "sha256", "gitBlobSha", "url"]) || license.spdx !== "MIT" || typeof license.path !== "string" || !/^licen[sc]e(?:\.(?:md|txt))?$/i.test(license.path) || typeof license.text !== "string" || Buffer.byteLength(license.text) > 32_000 || !verifiedMitText(license.text) || sha256(license.text) !== license.sha256 || gitHash(license.text) !== license.gitBlobSha || license.url !== `https://github.com/${source.repo}/blob/${source.commitSha}/${license.path}`) fail();
  if (!Array.isArray(source.files) || !source.files.length || source.files.length > 8 || new Set(source.files.map(file => file.path)).size !== source.files.length || !Array.isArray(source.apiResponseHashes) || source.apiResponseHashes.length !== 3 + source.files.length || source.apiResponseHashes.some(hash => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))) fail();
  let total = Buffer.byteLength(license.text);
  for (const file of source.files) { if (!exactFields(file, ["path", "text", "sha256", "gitBlobSha"]) || !filePath(file.path) || typeof file.text !== "string" || file.text.includes("\0") || Buffer.byteLength(file.text) > 160_000 || sha256(file.text) !== file.sha256 || gitHash(file.text) !== file.gitBlobSha) fail(); const declared = file.text.match(/SPDX-License-Identifier:\s*([^\r\n]+)/i)?.[1].trim(); if (declared && declared !== "MIT") fail(); total += Buffer.byteLength(file.text); }
  if (total > 512_000) fail();
}
export function restoreDeploymentImport(value: unknown): VerifiedImport { validateDeploymentImport(value); const restored = deepFreeze(structuredClone(value)); admitted.add(restored); return restored; }
/** Import results cannot be forged by passing a JSON 'verified:true' flag. */
export function documentsFromImport(source: VerifiedImport): KnowledgeDocument[] {
  if (!admitted.has(source) || !verifiedMitText(source.license.text) || sha256(source.license.text) !== source.license.sha256) throw new Error("VERIFIED_IMPORT_RECEIPT_REQUIRED");
  validateDeploymentImport(source);
  return source.files.flatMap(file => {
    if (sha256(file.text) !== file.sha256) throw new Error("IMPORTED_FILE_CHANGED");
    const lines = file.text.split("\n"), documents: KnowledgeDocument[] = [];
    for (let start = 0; start < Math.min(lines.length, 1600); start += 80) {
      const text = lines.slice(start, start + 100).join("\n").slice(0, 16_000), hash = sha256(text);
      documents.push({ id: `code:${source.repo}:${source.commitSha}:${file.path}:${start}`, sourceId: `${source.repo}@${source.commitSha}`, kind: "code", title: `${source.repo}/${file.path}:${start + 1}`, text, roles: [...source.roles], sha256: hash, path: file.path, licenseState: "verified", instructionLike: /ignore.{0,40}(?:previous|system)|<\|im_start\|>|system prompt/i.test(text), gamePlaceIds: [...source.gamePlaceIds], sourceLink: { id: `source-${sha256(`${source.repo}@${source.commitSha}:${file.path}:${file.sha256}`).slice(0, 24)}`, title: `${source.repo}/${file.path}`, url: `https://github.com/${source.repo}/blob/${source.commitSha}/${file.path}`, kind: "github-code", status: "observed", sha256: file.sha256, commitSha: source.commitSha, licenseSpdx: source.license.spdx } });
    }
    return documents;
  });
}
