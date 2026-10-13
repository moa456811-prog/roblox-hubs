import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { validateProjectFiles } from "../knowledge-project.ts";
import { parsePlaceInput } from "../knowledge-v2/index.ts";
import { GENERATION_STAGES } from "./types.ts";
import type { Feedback, GenerationInput, GenerationJob, GenerationJobStore, GenerationStageContext, GenerationStageHandlers, Json, ProjectFile, PublicGenerationJob, Snapshot, VerificationReport } from "./types.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
const MAX_STAGE_ATTEMPTS = 3, MAX_MODEL_ATTEMPTS = 2, MAX_OPERATIONS = 64, MAX_SNAPSHOTS = 12;
export class JobError extends Error { code: string; httpStatus: number; constructor(code: string, httpStatus = 400) { super(code); this.code = code; this.httpStatus = httpStatus; } }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function json(value: unknown): Json { const serialized = JSON.stringify(value); if (!serialized || Buffer.byteLength(serialized) > 500000) throw new JobError("STAGE_RESULT_TOO_LARGE"); return JSON.parse(serialized) as Json; }
function blankVerification(): VerificationReport { return { compilation: { status: "not_checked", executed: false }, mockTests: { status: "not_run", executed: false }, inGameTests: { status: "not_run", executed: false }, runtimeCompatibility: "unknown", issues: [] }; }
function key(value: string) { if (!/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new JobError("INVALID_IDEMPOTENCY_KEY"); return value; }

export function normalizeGenerationInput(value: unknown): GenerationInput {
  const raw = object(value); if (typeof raw.request !== "string" || !raw.request.trim() || raw.request.length > 12000) throw new JobError("INVALID_GENERATION_REQUEST");
  if (!["project_client", "project_server", "executor_client"].includes(String(raw.role))) throw new JobError("INVALID_GENERATION_ROLE");
  const intent = raw.intent ?? "generate"; if (!["generate", "patch"].includes(String(intent))) throw new JobError("INVALID_GENERATION_INTENT");
  const rawGame = object(raw.game), query = rawGame.url ?? rawGame.placeId ?? rawGame.query;
  if (query !== undefined && query !== "") { if (typeof query !== "string" && typeof query !== "number") throw new JobError("INVALID_PLACE_INPUT"); parsePlaceInput(String(query)); }
  const files = Array.isArray(raw.files) && raw.files.length === 0 ? [] : raw.files === undefined ? [] : validateProjectFiles(raw.files);
  if (intent === "patch" && !files.length) throw new JobError("CURRENT_PROJECT_REQUIRED");
  return { request: raw.request.trim(), role: raw.role as GenerationInput["role"], intent: intent as GenerationInput["intent"], files, allowModelProcessing: raw.allowModelProcessing === true, ...(query === undefined || query === "" ? {} : { game: typeof query === "number" ? { placeId: query } : { query: String(query) } }) };
}

export function projectFiles(job: GenerationJob, snapshotId = job.currentSnapshotId) {
  const snapshot = job.snapshots.find(snapshot => snapshot.id === snapshotId); if (!snapshot) throw new JobError("SNAPSHOT_NOT_FOUND", 404);
  if (snapshot.manifest.formatVersion !== 1 || hash(JSON.stringify(snapshot.manifest.files)) !== snapshot.manifest.sha256) throw new JobError("ARTIFACT_HASH_MISMATCH", 500);
  const files = snapshot.manifest.files.map(file => { const blob = job.blobs[file.sha256]; if (!blob || hash(blob.content) !== file.sha256 || Buffer.byteLength(blob.content) !== file.bytes || blob.bytes !== file.bytes) throw new JobError("ARTIFACT_HASH_MISMATCH", 500); return { path: file.path, content: blob.content }; });
  validateProjectFiles(files);
  return { snapshotId: snapshot.id, manifest: snapshot.manifest, files };
}
function snapshot(job: GenerationJob, input: ProjectFile[], reason: Snapshot["reason"], at: string) {
  if (job.snapshots.length >= MAX_SNAPSHOTS) throw new JobError("SNAPSHOT_LIMIT_REACHED");
  const files = validateProjectFiles(input).sort((a, b) => a.path.localeCompare(b.path));
  const manifestFiles = files.map(file => { const sha256 = hash(file.content), bytes = Buffer.byteLength(file.content); job.blobs[sha256] = { content: file.content, bytes }; return { path: file.path, sha256, bytes }; });
  const manifest = { formatVersion: 1 as const, files: manifestFiles, sha256: hash(JSON.stringify(manifestFiles)) };
  const next: Snapshot = { id: randomUUID(), parentId: job.currentSnapshotId, createdAt: at, reason, manifest }; job.snapshots.push(next); job.currentSnapshotId = next.id; return next;
}
function checkedVerification(report: VerificationReport): VerificationReport {
  if (!report || !Array.isArray(report.issues)) throw new JobError("INVALID_VERIFICATION_REPORT");
  for (const check of [report.compilation, report.mockTests, report.inGameTests]) {
    if (!check || typeof check.executed !== "boolean" || !["not_checked", "not_run", "passed", "failed", "observed_passed"].includes(check.status)) throw new JobError("INVALID_VERIFICATION_REPORT");
    if (["passed", "observed_passed"].includes(check.status) && (!check.executed || !check.evidence?.length)) throw new JobError("UNEXECUTED_VERIFICATION_CLAIM");
  }
  // This service has no instrumented Roblox runner. A model or user feedback cannot certify it.
  if (report.inGameTests.status !== "not_run" || report.inGameTests.executed || report.runtimeCompatibility !== "unknown") throw new JobError("UNOBSERVED_GAME_CLAIM");
  return JSON.parse(JSON.stringify(report)) as VerificationReport;
}
export function publicGenerationJob(job: GenerationJob): PublicGenerationJob {
  const { capabilityHash: _secret, blobs: _blobs, lease: _lease, operations: _operations, input, snapshots, verification, ...safe } = job;
  const { files, ...safeInput } = input;
  const report = verification || blankVerification();
  const lastFeedback = job.feedback.at(-1);
  const level = lastFeedback?.kind === "worked" && lastFeedback.snapshotId === job.currentSnapshotId ? "REPORTED_GAME_PASS" : report.mockTests.status === "passed" ? "MOCK_PASSED" : report.compilation.status === "passed" ? "SYNTAX_PASSED" : "DRAFT";
  return { ...safe, role: input.role, input: { ...safeInput, fileCount: files.length }, verification: { ...report, level }, snapshots: snapshots.map(({ manifest, ...item }) => ({ ...item, manifestSha256: manifest.sha256, files: manifest.files })) };
}
export function projectDiff(before: ProjectFile[], after: ProjectFile[]): string {
  const paths = [...new Set([...before, ...after].map(file => file.path))].sort();
  return paths.flatMap(path => { const old = before.find(file => file.path === path)?.content || "", next = after.find(file => file.path === path)?.content || ""; if (old === next) return [];
    const a = old.split("\n"), b = next.split("\n"); let start = 0, endA = a.length, endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    return [`--- a/${path}\n+++ b/${path}\n@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@\n${a.slice(start, endA).map(line => `-${line}`).join("\n")}\n${b.slice(start, endB).map(line => `+${line}`).join("\n")}`]; }).join("\n\n");
}

export class GenerationJobService {
  private controllers = new Map<string, { owner: string; controller: AbortController }>();
  private store: GenerationJobStore;
  private handlers: GenerationStageHandlers;
  private options: { now?: () => number; stageTimeoutMs?: number };
  constructor(store: GenerationJobStore, handlers: GenerationStageHandlers, options: { now?: () => number; stageTimeoutMs?: number } = {}) { this.store = store; this.handlers = handlers; this.options = options; }
  private now() { return this.options.now?.() ?? Date.now(); }
  private stamp() { return new Date(this.now()).toISOString(); }
  async create(value: unknown) {
    const input = normalizeGenerationInput(value), capability = randomBytes(32).toString("base64url"), at = this.stamp();
    const job: GenerationJob = { formatVersion: 1, id: randomUUID(), revision: 0, capabilityHash: hash(capability), input, createdAt: at, updatedAt: at, status: "queued", stage: "discovery", progress: GENERATION_STAGES.map(stage => ({ stage, status: "pending", attempts: 0 })), discovery: null, retrieval: null, plan: null, generationReport: null, model: null, modelAttempts: 0, verification: blankVerification(), snapshots: [], currentSnapshotId: null, blobs: {}, feedback: [], lease: null, operations: {}, events: [{ at, action: "created", stage: "discovery" }] };
    if (input.files.length) snapshot(job, input.files, "uploaded", at);
    if (!await this.store.create(job)) throw new JobError("JOB_CREATE_CONFLICT", 409);
    return { jobId: job.id, capability, job: publicGenerationJob(job) };
  }
  private async authorized(id: string, capability: string): Promise<GenerationJob> {
    const valid = CAPABILITY.test(capability), job = await this.store.get(id).catch(error => { if (error instanceof Error && error.message === "JOB_NOT_FOUND") return null; throw error; });
    const supplied = Buffer.from(hash(valid ? capability : "invalid"), "hex"), expected = Buffer.from(job?.capabilityHash || "0".repeat(64), "hex");
    if (!job || !valid || !timingSafeEqual(supplied, expected)) throw new JobError("JOB_NOT_FOUND", 404); return job;
  }
  async status(id: string, capability: string) { return publicGenerationJob(await this.authorized(id, capability)); }
  async files(id: string, capability: string, snapshotId?: string, compareTo?: string) {
    const job = await this.authorized(id, capability), result = projectFiles(job, snapshotId || job.currentSnapshotId);
    return { ...result, ...(compareTo ? { diff: projectDiff(projectFiles(job, compareTo).files, result.files), compareTo } : {}) };
  }
  private async save(previous: GenerationJob, next: GenerationJob) { next.revision = previous.revision + 1; next.updatedAt = this.stamp(); if (!await this.store.compareAndSwap(previous.id, previous.revision, next)) throw new JobError("JOB_REVISION_CONFLICT", 409); }
  async advance(id: string, capability: string, idempotencyKey: string, requestSignal?: AbortSignal) {
    key(idempotencyKey); const previous = await this.authorized(id, capability), existing = previous.operations[idempotencyKey];
    if (existing) { if (existing.action !== "advance") throw new JobError("IDEMPOTENCY_KEY_REUSED", 409); if (existing.status === "completed") return publicGenerationJob(previous); if (existing.status === "running" && previous.lease && previous.lease.expiresAtMs > this.now()) throw new JobError("JOB_BUSY", 409); throw new JobError("OPERATION_ALREADY_ATTEMPTED_USE_NEW_KEY", 409); }
    if (previous.status === "ready") return publicGenerationJob(previous);
    if (previous.lease && previous.lease.expiresAtMs > this.now()) throw new JobError("JOB_BUSY", 409);
    if (Object.keys(previous.operations).length >= MAX_OPERATIONS) throw new JobError("JOB_OPERATION_LIMIT", 409);
    const progress = previous.progress.find(item => item.stage === previous.stage)!;
    if (progress.attempts >= MAX_STAGE_ATTEMPTS) throw new JobError("STAGE_ATTEMPTS_EXHAUSTED", 409);
    if (previous.stage === "generation" && previous.modelAttempts >= MAX_MODEL_ATTEMPTS) throw new JobError("MODEL_ATTEMPTS_EXHAUSTED", 409);
    if (previous.stage === "generation" && !previous.input.allowModelProcessing) throw new JobError("MODEL_PROCESSING_CONSENT_REQUIRED", 403);
    const claimed = structuredClone(previous), owner = randomUUID(), at = this.stamp(), timeout = Math.min(Math.max(this.options.stageTimeoutMs || 125000, 10), 150000), deadline = this.now() + timeout;
    if (claimed.lease) claimed.operations[claimed.lease.idempotencyKey].status = "failed";
    claimed.lease = { owner, expiresAtMs: deadline + 5000, idempotencyKey }; claimed.status = "running";
    const current = claimed.progress.find(item => item.stage === claimed.stage)!; current.status = "running"; current.attempts++; current.startedAt = at; delete current.errorCode; delete current.finishedAt;
    if (claimed.stage === "generation") claimed.modelAttempts++;
    claimed.operations[idempotencyKey] = { action: "advance", stage: claimed.stage, status: "running" }; claimed.events.push({ at, action: "stage_started", stage: claimed.stage });
    await this.save(previous, claimed);
    const controller = new AbortController(), timeoutSignal = AbortSignal.timeout(timeout), signal = requestSignal ? AbortSignal.any([controller.signal, timeoutSignal, requestSignal]) : AbortSignal.any([controller.signal, timeoutSignal]); this.controllers.set(id, { owner, controller });
    const context: GenerationStageContext = { input: claimed.input, discovery: claimed.discovery, retrieval: claimed.retrieval, plan: claimed.plan, currentFiles: claimed.currentSnapshotId ? projectFiles(claimed).files : [], signal, deadlineMs: Date.now() + timeout, modelBudget: { attempts: 1, timeoutMs: Math.min(timeout, 120000), remainingAttempts: MAX_MODEL_ATTEMPTS - claimed.modelAttempts + 1 }, jobId: id, stageAttempt: current.attempts };
    try {
      const stage = claimed.stage;
      const execution = (async () => {
        switch (stage) {
          case "discovery": return { data: await this.handlers.discover(context) };
          case "retrieval": return { data: await this.handlers.retrieve(context) };
          case "planning": return { data: await this.handlers.plan(context) };
          case "generation": return { generation: await this.handlers.generate(context) };
          case "validation": return { verification: await this.handlers.validate(context) };
          case "ready": return {};
        }
      })();
      const result = await new Promise<Awaited<typeof execution>>((resolve, reject) => { const abort = () => reject(new JobError(timeoutSignal.aborted ? "STAGE_TIMEOUT" : "JOB_ABORTED", 408)); signal.addEventListener("abort", abort, { once: true }); execution.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); }); if (signal.aborted) abort(); });
      signal.throwIfAborted();
      const latest = await this.authorized(id, capability); if (latest.lease?.owner !== owner || latest.revision !== claimed.revision) throw new JobError("JOB_LEASE_LOST", 409);
      const done = structuredClone(latest);
      if (stage === "discovery") done.discovery = json(result.data);
      if (stage === "retrieval") done.retrieval = json(result.data);
      if (stage === "planning") done.plan = json(result.data);
      if (result.generation) { snapshot(done, result.generation.files, done.input.intent === "patch" ? "patched" : "generated", this.stamp()); done.generationReport = json(result.generation.report ?? {}); done.model = result.generation.model || null; done.verification = blankVerification(); }
      if (result.verification) done.verification = checkedVerification(result.verification);
      const finished = done.progress.find(item => item.stage === stage)!; finished.status = "passed"; finished.finishedAt = this.stamp();
      const next = GENERATION_STAGES[GENERATION_STAGES.indexOf(stage) + 1]; done.stage = next || "ready"; done.status = next ? "queued" : "ready"; done.lease = null; done.operations[idempotencyKey].status = "completed"; done.operations[idempotencyKey].snapshotId = done.currentSnapshotId || undefined; done.events.push({ at: this.stamp(), action: "stage_completed", stage });
      await this.save(latest, done); return publicGenerationJob(done);
    } catch (error) {
      const latest = await this.authorized(id, capability); if (latest.lease?.owner !== owner) throw new JobError("JOB_LEASE_LOST", 409);
      const failed = structuredClone(latest), code = error instanceof JobError ? error.code : error instanceof Error && /^[A-Z][A-Z0-9_]{2,100}$/.test(error.message) ? error.message : "STAGE_FAILED";
      const item = failed.progress.find(item => item.stage === failed.stage)!; item.status = "failed"; item.errorCode = code; item.finishedAt = this.stamp(); failed.status = "failed"; failed.lease = null; failed.operations[idempotencyKey].status = "failed"; failed.events.push({ at: this.stamp(), action: "stage_failed", stage: failed.stage, errorCode: code });
      await this.save(latest, failed); return publicGenerationJob(failed);
    } finally { if (this.controllers.get(id)?.owner === owner) this.controllers.delete(id); }
  }
  async abort(id: string, capability: string) {
    const previous = await this.authorized(id, capability); if (!previous.lease) return publicGenerationJob(previous);
    const next = structuredClone(previous), item = next.progress.find(item => item.stage === next.stage)!; item.status = "failed"; item.errorCode = "JOB_ABORTED"; item.finishedAt = this.stamp(); next.operations[next.lease!.idempotencyKey].status = "failed"; next.lease = null; next.status = "failed"; next.events.push({ at: this.stamp(), action: "aborted", stage: next.stage }); await this.save(previous, next); const active = this.controllers.get(id); if (active?.owner === previous.lease.owner) active.controller.abort(); return publicGenerationJob(next);
  }
  async rollback(id: string, capability: string, snapshotId: string, idempotencyKey: string) {
    key(idempotencyKey); const previous = await this.authorized(id, capability), existing = previous.operations[idempotencyKey];
    if (existing) { if (existing.action === "rollback" && existing.snapshotId === snapshotId && existing.status === "completed") return publicGenerationJob(previous); throw new JobError("IDEMPOTENCY_KEY_REUSED", 409); }
    if (previous.lease && previous.lease.expiresAtMs > this.now()) throw new JobError("JOB_BUSY", 409);
    projectFiles(previous, snapshotId); if (Object.keys(previous.operations).length >= MAX_OPERATIONS) throw new JobError("JOB_OPERATION_LIMIT");
    const next = structuredClone(previous); next.currentSnapshotId = snapshotId; next.verification = blankVerification(); next.generationReport = null; next.status = "queued"; next.stage = "validation"; next.lease = null;
    for (const stage of ["validation", "ready"] as const) { const item = next.progress.find(item => item.stage === stage)!; item.status = "pending"; item.attempts = 0; delete item.errorCode; delete item.startedAt; delete item.finishedAt; }
    next.operations[idempotencyKey] = { action: "rollback", stage: "validation", status: "completed", snapshotId }; next.events.push({ at: this.stamp(), action: "rollback", stage: "validation" }); await this.save(previous, next); return publicGenerationJob(next);
  }
  async feedback(id: string, capability: string, value: unknown) {
    const previous = await this.authorized(id, capability), raw = object(value);
    if (previous.lease && previous.lease.expiresAtMs > this.now()) throw new JobError("JOB_BUSY", 409);
    if (!["worked", "failed", "issue"].includes(String(raw.kind))) throw new JobError("INVALID_FEEDBACK");
    if ((raw.message !== undefined && (typeof raw.message !== "string" || raw.message.length > 8000)) || (raw.featureId !== undefined && (typeof raw.featureId !== "string" || raw.featureId.length > 120))) throw new JobError("INVALID_FEEDBACK");
    if (typeof raw.artifactSha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.artifactSha256)) throw new JobError("INVALID_FEEDBACK_ARTIFACT");
    if (previous.feedback.length >= 24) throw new JobError("FEEDBACK_LIMIT_REACHED");
    const artifact = projectFiles(previous);
    if (raw.artifactSha256 !== artifact.manifest.sha256) throw new JobError("FEEDBACK_ARTIFACT_MISMATCH", 409);
    const next = structuredClone(previous), feedback: Feedback = { id: randomUUID(), kind: raw.kind as Feedback["kind"], ...(raw.message ? { message: raw.message as string } : {}), ...(raw.featureId ? { featureId: raw.featureId as string } : {}), submittedAt: this.stamp(), snapshotId: artifact.snapshotId, artifactSha256: artifact.manifest.sha256, level: raw.kind === "worked" ? "REPORTED_GAME_PASS" : "REPORTED_GAME_FAILURE", independentlyObserved: false }; next.feedback.push(feedback); await this.save(previous, next); return { feedback, job: publicGenerationJob(next) };
  }
}
