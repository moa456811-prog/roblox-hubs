import type { StorageLike } from "./storage.ts";

export const KNOWLEDGE_STORAGE = { optIn: "scriptrush_knowledge_engine_optin_v1", build: "scriptrush_knowledge_job_build_v1", fix: "scriptrush_knowledge_job_fix_v1" } as const;
export const KNOWLEDGE_STAGES = ["discovery", "retrieval", "planning", "generation", "validation", "ready"] as const;
export type KnowledgeRole = "executor_client" | "project_client" | "project_server";
export type KnowledgeFile = { path: string; content: string; sha256?: string };
export type KnowledgeJob = { id: string; revision: number; status: "queued" | "running" | "failed" | "ready"; stage: string; role?: KnowledgeRole; input?: { allowModelProcessing: boolean; request?: string; game?: string }; progress: Array<{ stage: string; status: string; attempts: number; errorCode?: string }>; discovery?: unknown; retrieval?: unknown; plan?: unknown; generationReport?: unknown; verification?: unknown; snapshots: Array<{ id: string; createdAt: string; manifestSha256: string; parentId?: string; reason?: string }>; currentSnapshotId?: string; feedback?: unknown };
export type KnowledgeSession = { version: 1; id: string; token: string; mode: "build" | "fix"; pending?: { revision: number; key: string; operation: "advance" | "resume" } };
export type KnowledgeFiles = { files: KnowledgeFile[]; snapshotId?: string; manifest?: unknown; diff?: unknown };
export type KnowledgeCreate = { request: string; game: { query?: string; placeId?: number; url?: string }; intent: "generate" | "patch"; role: KnowledgeRole; files: KnowledgeFile[]; allowModelProcessing: boolean };
export const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function knowledgeEnabled(value: string | undefined): boolean { return value === "1" || value === "true"; }
const identity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
function storage(provided?: StorageLike): StorageLike | undefined { if (provided) return provided; try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; } }

export function parseKnowledgeSession(value: unknown, mode: "build" | "fix"): KnowledgeSession {
  if (!record(value) || value.version !== 1 || !identity(value.id) || typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || value.mode !== mode) throw new Error("Invalid saved job. Your other scripts remain unchanged.");
  const result: KnowledgeSession = { version: 1, id: value.id, token: value.token, mode };
  if (record(value.pending) && Number.isInteger(value.pending.revision) && (value.pending.revision as number) >= 0 && typeof value.pending.key === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(value.pending.key) && (value.pending.operation === "advance" || value.pending.operation === "resume")) result.pending = { revision: value.pending.revision as number, key: value.pending.key, operation: value.pending.operation };
  return result;
}
export function loadKnowledgeSession(mode: "build" | "fix", provided?: StorageLike): KnowledgeSession | null { try { const raw = storage(provided)?.getItem(KNOWLEDGE_STORAGE[mode]); return raw ? parseKnowledgeSession(JSON.parse(raw), mode) : null; } catch { return null; } }
export function saveKnowledgeSession(session: KnowledgeSession, provided?: StorageLike): void { const target = storage(provided); if (!target) throw new Error("This browser could not save the resume key. Keep this page open until you download your files."); target.setItem(KNOWLEDGE_STORAGE[session.mode], JSON.stringify(parseKnowledgeSession(session, session.mode))); }
export function clearKnowledgeSession(mode: "build" | "fix", provided?: StorageLike): void { storage(provided)?.removeItem(KNOWLEDGE_STORAGE[mode]); }

export function parseKnowledgeJob(value: unknown): KnowledgeJob {
  if (!record(value) || !identity(value.id) || !Number.isInteger(value.revision) || (value.revision as number) < 0 || !["queued", "running", "failed", "ready"].includes(String(value.status)) || typeof value.stage !== "string" || !Array.isArray(value.progress) || !Array.isArray(value.snapshots)) throw new Error("The job service returned an invalid status. Your resume key was preserved.");
  const progress = value.progress.map(entry => {
    if (!record(entry) || typeof entry.stage !== "string" || !["pending", "running", "passed", "failed"].includes(String(entry.status)) || !Number.isInteger(entry.attempts) || (entry.attempts as number) < 0) throw new Error("The job progress could not be verified.");
    return { stage: entry.stage, status: String(entry.status), attempts: entry.attempts as number, ...(typeof entry.errorCode === "string" ? { errorCode: entry.errorCode } : {}) };
  });
  const snapshots = value.snapshots.map(entry => { if (!record(entry) || typeof entry.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id) || typeof entry.createdAt !== "string" || typeof entry.manifestSha256 !== "string") throw new Error("The snapshot list is invalid."); return { id: entry.id, createdAt: entry.createdAt, manifestSha256: entry.manifestSha256, ...(typeof entry.parentId === "string" ? { parentId: entry.parentId } : {}), ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}) }; });
  return { ...(record(value.input) ? { input: { allowModelProcessing: value.input.allowModelProcessing === true, ...(typeof value.input.request === "string" ? { request: value.input.request } : {}), ...(record(value.input.game) ? { game: String(value.input.game.url ?? value.input.game.placeId ?? value.input.game.query ?? "") } : {}) } } : {}), id: value.id, revision: value.revision as number, status: value.status as KnowledgeJob["status"], stage: value.stage, progress, snapshots, discovery: value.discovery, retrieval: value.retrieval, plan: value.plan, generationReport: value.generationReport, verification: value.verification, feedback: value.feedback, ...(["executor_client", "project_client", "project_server"].includes(String(value.role)) ? { role: value.role as KnowledgeRole } : {}), ...(typeof value.currentSnapshotId === "string" ? { currentSnapshotId: value.currentSnapshotId } : {}) };
}
export function parseKnowledgeFiles(value: unknown): KnowledgeFiles {
  if (!record(value) || !Array.isArray(value.files) || value.files.length > 16) throw new Error("No complete project files were returned.");
  const files = value.files.map(file => { if (!record(file) || typeof file.path !== "string" || file.path.length > 150 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:lua|luau|json|md)$/.test(file.path) || file.path.split("/").some(part => part.startsWith(".")) || typeof file.content !== "string" || file.content.includes("\0") || new TextEncoder().encode(file.content).length > 160_000) throw new Error("The project file list is invalid."); return { path: file.path, content: file.content, ...(typeof file.sha256 === "string" ? { sha256: file.sha256 } : {}) }; });
  if (new Set(files.map(file => file.path.toLowerCase())).size !== files.length) throw new Error("Duplicate project file paths were returned.");
  if (files.reduce((size, file) => size + new TextEncoder().encode(file.content).length, 0) > 600_000) throw new Error("The project files exceed the supported size.");
  return { files, ...(typeof value.snapshotId === "string" ? { snapshotId: value.snapshotId } : {}), manifest: value.manifest, diff: value.diff };
}

export function verificationLabel(value: unknown): string {
  const level = record(value) ? value.level ?? value.status : value;
  return ({ SYNTAX_PASSED: "Compilation passed", MOCK_PASSED: "Simulated tests passed", REPORTED_GAME_PASS: "In-game result reported", OBSERVED_GAME_PASS: "In-game result observed" } as Record<string, string>)[String(level)] ?? "Unverified";
}
export function createKnowledgeRequest(input: { game: string; request: string; mode: "build" | "fix"; role: KnowledgeRole; files: KnowledgeFile[]; consent: boolean }): KnowledgeCreate {
  if (!input.game.trim()) throw new Error("Enter the Roblox game URL or Place ID first.");
  if (!input.request.trim()) throw new Error(input.mode === "fix" ? "Paste the error or describe the targeted change." : "Describe the requested features and UI.");
  if (input.mode === "fix" && !input.files.some(file => file.content.trim())) throw new Error("Add the current files before requesting a targeted patch.");
  if (!["executor_client", "project_client", "project_server"].includes(input.role)) throw new Error("Select a supported execution role.");
  if (input.request.length > 12_000) throw new Error("Keep the request below 12,000 characters.");
  if (input.files.length > 16 || new Set(input.files.map(file => file.path.toLowerCase())).size !== input.files.length || input.files.some(file => file.path.length > 150 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:lua|luau|json|md)$/.test(file.path) || file.path.split("/").some(part => part.startsWith(".")) || !file.content.trim() || file.content.includes("\0") || new TextEncoder().encode(file.content).length > 160_000) || input.files.reduce((size, file) => size + new TextEncoder().encode(file.content).length, 0) > 600_000) throw new Error("Use up to 16 Lua, Luau, JSON or Markdown files, 160 KB each and 600 KB in total, with unique project paths.");
  const query = input.game.trim();
  const game = /^[1-9]\d*$/.test(query) && Number.isSafeInteger(Number(query)) ? { placeId: Number(query) } : /^https:\/\//i.test(query) ? { url: query } : { query };
  return { request: input.request, game, role: input.role, intent: input.mode === "fix" ? "patch" : "generate", files: input.files.map(file => ({ path: file.path, content: file.content })), allowModelProcessing: input.consent };
}

export type KnowledgeSourceView = { id: string; title: string; url?: string; roles: string[]; license: string; commit: string; sha256: string; status: string; warning?: string };
export function knowledgeSources(job: KnowledgeJob): KnowledgeSourceView[] {
  const retrieval = record(job.retrieval) ? job.retrieval : {};
  const entries = new Map<string, Record<string, unknown>>();
  for (const key of ["sourceLinks", "candidates", "hits"]) for (const item of Array.isArray(retrieval[key]) ? retrieval[key] : []) {
    if (!record(item)) continue;
    const link = record(item.sourceLink) ? item.sourceLink : {};
    const id = typeof link.id === "string" ? link.id : typeof item.sourceId === "string" ? item.sourceId : typeof item.id === "string" ? item.id : "";
    if (id) entries.set(id, { ...(entries.get(id) ?? {}), ...link, ...item, id });
  }
  return [...entries.values()].map(source => ({ id: String(source.id), title: String(source.title ?? source.name ?? source.id), ...(typeof source.url === "string" ? { url: source.url } : {}), roles: Array.isArray(source.roles) ? source.roles.filter((role): role is string => typeof role === "string") : ["reference"], license: source.licenseState === "verified" && typeof source.licenseSpdx === "string" ? source.licenseSpdx : "Unknown — code reuse not established", commit: typeof source.commitSha === "string" ? source.commitSha : "Not pinned", sha256: String(source.sha256 ?? source.contentHash ?? (record(source.provenance) ? source.provenance.rawFileSha256 : undefined) ?? "Unknown"), status: String(source.codeStatus ?? source.status ?? source.kind ?? "Reference only"), ...(typeof source.warning === "string" && source.warning ? { warning: source.warning } : {}) }));
}

async function call(path: string, method: string, body?: unknown, session?: KnowledgeSession, signal?: AbortSignal): Promise<unknown> {
  const abort = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(path.endsWith("/advance") || path.endsWith("/resume") ? 295_000 : 35_000)]);
  try {
    const response = await fetch("/api/v2/generations" + path, { method, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(session ? { authorization: "Bearer " + session.token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: abort, credentials: "omit", cache: "no-store" });
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error("The job response is too large.");
    const data: unknown = JSON.parse(text);
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "This browser no longer has access to the saved job." : response.status === 409 ? "Another step is still running. Refresh the saved job before resuming." : "The job step could not finish. Your resume key and previous files were preserved.");
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Paused. The saved job can be resumed.", "AbortError");
    if (error instanceof SyntaxError) throw new Error("The job service returned an incomplete response. Your saved job can be resumed.");
    throw error;
  }
}
export async function createKnowledge(body: KnowledgeCreate, mode: "build" | "fix"): Promise<{ session: KnowledgeSession; job: KnowledgeJob }> {
  const value = await call("", "POST", body);
  if (!record(value)) throw new Error("The job could not be saved.");
  const session = parseKnowledgeSession({ version: 1, id: value.jobId ?? value.id, token: value.capability ?? value.token, mode }, mode);
  const job = parseKnowledgeJob(value.job);
  if (job.id !== session.id) throw new Error("The saved job identity does not match.");
  return { session, job };
}
export async function getKnowledge(session: KnowledgeSession, signal?: AbortSignal): Promise<KnowledgeJob> { const value = await call("/" + session.id, "GET", undefined, session, signal); const job = parseKnowledgeJob(record(value) && value.job ? value.job : value); if (job.id !== session.id) throw new Error("The job identity changed."); return job; }
export async function getKnowledgeFiles(session: KnowledgeSession, options: { snapshotId?: string; compareTo?: string; signal?: AbortSignal } = {}): Promise<KnowledgeFiles> { const query = new URLSearchParams(); if (options.snapshotId) query.set("snapshotId", options.snapshotId); if (options.compareTo) query.set("compareTo", options.compareTo); return parseKnowledgeFiles(await call("/" + session.id + "/files" + (query.size ? "?" + query : ""), "GET", undefined, session, options.signal)); }
export async function rollbackKnowledge(session: KnowledgeSession, snapshotId: string, signal?: AbortSignal): Promise<KnowledgeJob> { const value = await call("/" + session.id + "/rollback", "POST", { snapshotId, idempotencyKey: crypto.randomUUID() }, session, signal); return parseKnowledgeJob(record(value) && value.job ? value.job : value); }
export async function feedbackKnowledge(session: KnowledgeSession, body: { kind: "worked" | "failed" | "issue"; message?: string; artifactSha256?: string }): Promise<void> { await call("/" + session.id + "/feedback", "POST", body, session); }

export async function runKnowledge(session: KnowledgeSession, options: { signal: AbortSignal; onJob: (job: KnowledgeJob) => void; onSession: (session: KnowledgeSession) => void; resumeFailed?: boolean; get?: typeof getKnowledge; advance?: (session: KnowledgeSession, operation: "advance" | "resume", key: string, signal: AbortSignal) => Promise<KnowledgeJob> }): Promise<KnowledgeJob> {
  let job = await (options.get ?? getKnowledge)(session, options.signal);
  options.onJob(job);
  for (let count = 0; job.status !== "ready" && count < 20; count++) {
    if (options.signal.aborted) throw new DOMException("Paused", "AbortError");
    if (job.stage === "generation" && job.input?.allowModelProcessing === false) return job;
    if (job.status === "failed" && !options.resumeFailed) return job;
    const pending = session.pending?.revision === job.revision ? session.pending : { revision: job.revision, key: crypto.randomUUID(), operation: job.status === "failed" ? "resume" as const : "advance" as const };
    session = { ...session, pending }; options.onSession(session);
    const next = await (options.advance ?? (async (current, operation, key, signal) => { const value = await call("/" + current.id + "/" + operation, "POST", { idempotencyKey: key }, current, signal); return parseKnowledgeJob(record(value) && value.job ? value.job : value); }))(session, pending.operation, pending.key, options.signal);
    if (next.id !== session.id) throw new Error("The job identity changed.");
    options.onJob(next);
    if (next.revision <= job.revision && next.stage === job.stage && next.status === job.status) throw new Error("The step has not advanced. Refresh the saved job before resuming.");
    job = next; session = { version: 1, id: session.id, token: session.token, mode: session.mode }; options.onSession(session);
    if (job.status === "failed") return job;
  }
  return job;
}

/** Exact line edit script, rather than an approximate count of positions. */
export function fileLineDiff(before: string, after: string): string {
  const left = before.split(/\r\n|\r|\n/), right = after.split(/\r\n|\r|\n/);
  let start = 0; while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let endLeft = left.length, endRight = right.length; while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) { endLeft--; endRight--; }
  if (start === left.length && start === right.length) return "No changes.";
  return `@@ -${start + 1},${endLeft - start} +${start + 1},${endRight - start} @@\n` + left.slice(start, endLeft).map(line => "-" + line).concat(right.slice(start, endRight).map(line => "+" + line)).join("\n");
}
