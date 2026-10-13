import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { GenerationJobService, JobError } from "../src/lib/generation-jobs/service.ts";
import { FileGenerationStore, MemoryGenerationStore, configuredGenerationStore } from "../src/lib/generation-jobs/store.ts";
import { createKnowledgeStageHandlers } from "../src/lib/generation-jobs/runtime.ts";
import type { GenerationStageHandlers, VerificationReport } from "../src/lib/generation-jobs/types.ts";

const verification = (): VerificationReport => ({ compilation: { status: "not_checked", executed: false }, mockTests: { status: "not_run", executed: false }, inGameTests: { status: "not_run", executed: false }, runtimeCompatibility: "unknown", issues: ["No configured compiler or live game runner."] });
const files = [{ path: "src/main.client.luau", content: "local utility = require(script.Parent.Utility)\nprint(utility.value)\n" }, { path: "src/Utility.luau", content: "return { value = 1 }\n" }];
const input = { request: "Create a utility with English UI", role: "project_client", intent: "generate", allowModelProcessing: true };
function handlers(overrides: Partial<GenerationStageHandlers> = {}): GenerationStageHandlers { return { async discover() { return { status: "UNKNOWN" }; }, async retrieve() { return { hits: [] }; }, async plan() { return { unknowns: ["No game mechanics proved"] }; }, async generate() { return { files, model: "offline-test" }; }, async validate() { return verification(); }, ...overrides }; }
async function until(service: GenerationJobService, id: string, cap: string, stage: string) { let job = await service.status(id, cap); for (let n = 0; n < 6 && job.stage !== stage; n++) job = await service.advance(id, cap, `advance-${n}`); assert.equal(job.stage, stage); return job; }
async function ready(service: GenerationJobService, id: string, cap: string) { await until(service, id, cap, "ready"); return service.advance(id, cap, "advance-ready"); }
const error = (code: string) => (value: unknown) => value instanceof JobError && value.code === code;
async function removePrivateTestDirectory(directory: string) { const target = resolve(directory); assert.equal(dirname(target), resolve(tmpdir())); assert.match(basename(target), /^scriptrush-(?:store|cas)-test-/); await rm(target, { recursive: true, force: true }); }

test("private per-job 256-bit capability is returned once; cross-job access and status leakage are blocked", async () => {
  const store = new MemoryGenerationStore(), service = new GenerationJobService(store, handlers()), a = await service.create(input), b = await service.create(input);
  assert.equal(Buffer.from(a.capability, "base64url").byteLength, 32);
  assert.notEqual((await store.get(a.jobId))!.capabilityHash, a.capability);
  assert.match((await store.get(a.jobId))!.capabilityHash, /^[0-9a-f]{64}$/);
  await assert.rejects(service.status(a.jobId, b.capability), error("JOB_NOT_FOUND"));
  await assert.rejects(service.files(a.jobId, b.capability), error("JOB_NOT_FOUND"));
  await assert.rejects(service.advance(a.jobId, b.capability, "attack-key"), error("JOB_NOT_FOUND"));
  for (const name of ["capabilityHash", "blobs", "lease", "operations"]) assert.ok(!(name in a.job));
  assert.equal(a.job.verification.level, "DRAFT"); assert.equal(a.job.input.fileCount, 0); assert.ok(!("files" in a.job.input));
});

test("input accepts Roblox URL without rbxl and rejects invalid role, intent, forged host and escaping paths", async () => {
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers());
  const job = await service.create({ ...input, game: { url: "https://www.roblox.com/games/2753915549/Blox-Fruits" } }); assert.equal(job.job.input.fileCount, 0);
  await assert.rejects(service.create({ ...input, role: "admin" }), error("INVALID_GENERATION_ROLE"));
  await assert.rejects(service.create({ ...input, intent: "overwrite" }), error("INVALID_GENERATION_INTENT"));
  await assert.rejects(service.create({ ...input, game: { url: "https://www.roblox.com.evil.test/games/1" } }), /INVALID_PLACE_INPUT/);
  await assert.rejects(service.create({ ...input, files: [{ path: "../private.luau", content: "print(1)" }] }), /INVALID_PROJECT_PATH/);
  await assert.rejects(service.create({ ...input, intent: "patch" }), error("CURRENT_PROJECT_REQUIRED"));
});

test("filesystem survives independent service/store restart and stores no plaintext capability", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scriptrush-store-test-"));
  try {
    const service = new GenerationJobService(new FileGenerationStore(directory), handlers()), created = await service.create(input);
    await service.advance(created.jobId, created.capability, "discover-job");
    const restarted = new GenerationJobService(new FileGenerationStore(directory), handlers());
    assert.equal((await restarted.status(created.jobId, created.capability)).stage, "retrieval");
    const job = await ready(restarted, created.jobId, created.capability); assert.equal(job.status, "ready");
    const artifacts = await restarted.files(created.jobId, created.capability); assert.equal(artifacts.files.length, 2); assert.match(artifacts.manifest.sha256, /^[0-9a-f]{64}$/);
    const names = await readdir(join(directory, created.jobId));
    for (const name of names) assert.ok(!(await readFile(join(directory, created.jobId, name), "utf8")).includes(created.capability));
  } finally { await removePrivateTestDirectory(directory); }
});

test("exclusive filesystem revision commit allows exactly one concurrent CAS writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scriptrush-cas-test-"));
  try {
    const storeA = new FileGenerationStore(directory), storeB = new FileGenerationStore(directory), service = new GenerationJobService(storeA, handlers()), created = await service.create(input), job = (await storeA.get(created.jobId))!;
    const a = structuredClone(job), b = structuredClone(job); a.revision++; b.revision++; a.model = "A"; b.model = "B";
    const outcomes = await Promise.all([storeA.compareAndSwap(job.id, 0, a), storeB.compareAndSwap(job.id, 0, b)]); assert.equal(outcomes.filter(Boolean).length, 1); assert.equal((await storeA.get(job.id))!.revision, 1);
    assert.equal(await storeB.compareAndSwap(job.id, 0, b), false);
  } finally { await removePrivateTestDirectory(directory); }
});

test("actual stages only advance when operation completes; completed idempotency key never repeats it", async () => {
  let resolve!: () => void, calls = 0; const blocked = new Promise<void>(done => { resolve = done; });
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async discover() { calls++; await blocked; return { status: "UNKNOWN" }; } })), created = await service.create(input);
  const pending = service.advance(created.jobId, created.capability, "once-discovery");
  await new Promise(done => setTimeout(done, 5)); const running = await service.status(created.jobId, created.capability); assert.equal(running.stage, "discovery"); assert.equal(running.progress[0].status, "running"); assert.equal(running.progress[1].status, "pending");
  await assert.rejects(service.advance(created.jobId, created.capability, "another-discovery"), error("JOB_BUSY"));
  resolve(); await pending; await service.advance(created.jobId, created.capability, "once-discovery"); assert.equal(calls, 1);
});

test("stage error is retained across restart; resume needs a new key and retries are bounded", async () => {
  const store = new MemoryGenerationStore(), service = new GenerationJobService(store, handlers({ async discover() { throw new Error("PUBLIC_LOOKUP_TIMEOUT"); } })), created = await service.create(input);
  let job = await service.advance(created.jobId, created.capability, "attempt-one"); assert.equal(job.status, "failed"); assert.equal(job.progress[0].errorCode, "PUBLIC_LOOKUP_TIMEOUT"); assert.equal(job.progress[1].status, "pending");
  await assert.rejects(service.advance(created.jobId, created.capability, "attempt-one"), error("OPERATION_ALREADY_ATTEMPTED_USE_NEW_KEY"));
  const restarted = new GenerationJobService(store, handlers({ async discover() { throw new Error("PUBLIC_LOOKUP_TIMEOUT"); } }));
  await restarted.advance(created.jobId, created.capability, "attempt-two"); job = await restarted.advance(created.jobId, created.capability, "attempt-three"); assert.equal(job.progress[0].attempts, 3);
  await assert.rejects(restarted.advance(created.jobId, created.capability, "attempt-four"), error("STAGE_ATTEMPTS_EXHAUSTED"));
});

test("model consent is enforced before generation and model attempts remain bounded after timeout/retry", async () => {
  let calls = 0; const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async generate() { calls++; throw new Error("AI_TIMEOUT"); } })), created = await service.create(input);
  await until(service, created.jobId, created.capability, "generation");
  await service.advance(created.jobId, created.capability, "model-one"); await service.advance(created.jobId, created.capability, "model-two");
  await assert.rejects(service.advance(created.jobId, created.capability, "model-three"), error("MODEL_ATTEMPTS_EXHAUSTED")); assert.equal(calls, 2);
  const privateJob = await service.create({ ...input, allowModelProcessing: false, files }); await until(service, privateJob.jobId, privateJob.capability, "generation");
  await assert.rejects(service.advance(privateJob.jobId, privateJob.capability, "no-consent"), error("MODEL_PROCESSING_CONSENT_REQUIRED")); assert.equal(calls, 2);
});

test("timeout reports failure without pretending the stage completed", async () => {
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async discover() { await new Promise(done => setTimeout(done, 50)); return {}; } }), { stageTimeoutMs: 10 }), created = await service.create(input);
  const job = await service.advance(created.jobId, created.capability, "timeout-once"); assert.equal(job.status, "failed"); assert.equal(job.progress[0].errorCode, "STAGE_TIMEOUT"); assert.equal(job.progress[1].status, "pending");
});

test("abort fences an in-flight worker and cannot commit late artifacts", async () => {
  let release!: () => void; const blocked = new Promise<void>(done => { release = done; }); const store = new MemoryGenerationStore();
  const service = new GenerationJobService(store, handlers({ async generate() { await blocked; return { files }; } })), created = await service.create(input); await until(service, created.jobId, created.capability, "generation");
  const pending = service.advance(created.jobId, created.capability, "blocked-model"); await new Promise(done => setTimeout(done, 5));
  const aborted = await service.abort(created.jobId, created.capability); assert.equal(aborted.progress[3].errorCode, "JOB_ABORTED"); release(); await assert.rejects(pending, error("JOB_LEASE_LOST"));
  assert.equal((await service.status(created.jobId, created.capability)).currentSnapshotId, null);
});

test("expired durable lease resumes from same stage after process restart and fences previous owner", async () => {
  let now = Date.now(), release!: () => void; const blocked = new Promise<void>(done => { release = done; }), store = new MemoryGenerationStore();
  const first = new GenerationJobService(store, handlers({ async discover() { await blocked; return { stale: true }; } }), { now: () => now, stageTimeoutMs: 1000 }), created = await first.create(input), pending = first.advance(created.jobId, created.capability, "old-process"); await new Promise(done => setTimeout(done, 5));
  now += 10000; const restarted = new GenerationJobService(store, handlers({ async discover() { return { fresh: true }; } }), { now: () => now }); const result = await restarted.advance(created.jobId, created.capability, "new-process"); assert.deepEqual(result.discovery, { fresh: true }); assert.equal(result.progress[0].attempts, 2);
  release(); await assert.rejects(pending, error("JOB_LEASE_LOST")); assert.deepEqual((await restarted.status(created.jobId, created.capability)).discovery, { fresh: true });
});

test("patch snapshots preserve originals, expose a diff and roll back exactly with verification reset", async () => {
  const patched = files.map(file => ({ ...file, content: file.content.replace("value = 1", "value = 2") }));
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async generate(context) { assert.equal(context.input.intent, "patch"); assert.deepEqual(context.currentFiles, files); return { files: patched }; } })), created = await service.create({ ...input, intent: "patch", files });
  const original = created.job.currentSnapshotId!; const generated = await ready(service, created.jobId, created.capability); const changed = generated.currentSnapshotId!; assert.notEqual(changed, original); assert.equal(generated.snapshots[1].parentId, original);
  const diff = await service.files(created.jobId, created.capability, changed, original); assert.match(diff.diff!, /\-return \{ value = 1 \}/); assert.match(diff.diff!, /\+return \{ value = 2 \}/);
  const rollback = await service.rollback(created.jobId, created.capability, original, "rollback-one"); assert.equal(rollback.currentSnapshotId, original); assert.equal(rollback.verification.level, "DRAFT"); assert.equal(rollback.stage, "validation"); assert.deepEqual((await service.files(created.jobId, created.capability)).files, files);
  const replay = await service.rollback(created.jobId, created.capability, original, "rollback-one"); assert.equal(replay.revision, rollback.revision);
});

test("verification cannot mark unexecuted checks or unobserved live tests passed", async () => {
  for (const fraudulent of [{ ...verification(), compilation: { status: "passed" as const, executed: false, evidence: ["model says OK"] } }, { ...verification(), inGameTests: { status: "observed_passed" as const, executed: true, evidence: ["model says in-game OK"] } }]) {
    const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async validate() { return fraudulent; } })), created = await service.create(input); await until(service, created.jobId, created.capability, "validation"); const job = await service.advance(created.jobId, created.capability, "verify-one"); assert.equal(job.status, "failed"); assert.equal(job.verification.level, "DRAFT"); assert.equal(job.verification.inGameTests.executed, false);
  }
});

test("feedback remains self-reported and is bound to exact private artifact version", async () => {
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers()), created = await service.create(input); await ready(service, created.jobId, created.capability);
  const artifacts = await service.files(created.jobId, created.capability), before = Date.now();
  const { feedback, job } = await service.feedback(created.jobId, created.capability, { kind: "worked", message: "Scenario completed once", artifactSha256: artifacts.manifest.sha256, independentlyObserved: true, level: "OBSERVED_GAME_PASS" });
  assert.equal(feedback.independentlyObserved, false); assert.equal(feedback.artifactSha256, artifacts.manifest.sha256); assert.equal(feedback.snapshotId, artifacts.snapshotId); assert.equal(job.verification.level, "REPORTED_GAME_PASS"); assert.equal(job.verification.inGameTests.status, "not_run"); assert.equal(job.verification.inGameTests.executed, false);
  assert.ok(Date.parse(feedback.submittedAt) >= before && Date.parse(feedback.submittedAt) <= Date.now()); assert.ok(Date.parse(feedback.submittedAt) <= Date.parse(job.updatedAt));
});

test("feedback requires the exact current artifact hash; stale snapshot reports never rebind", async () => {
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async generate() { return { files: files.map(file => ({ ...file, content: file.content.replace("value = 1", "value = 2") })) }; } })), created = await service.create({ ...input, intent: "patch", files });
  const original = await service.files(created.jobId, created.capability); await ready(service, created.jobId, created.capability); const generated = await service.files(created.jobId, created.capability); assert.notEqual(generated.manifest.sha256, original.manifest.sha256);
  await assert.rejects(service.feedback(created.jobId, created.capability, { kind: "worked" }), error("INVALID_FEEDBACK_ARTIFACT"));
  await assert.rejects(service.feedback(created.jobId, created.capability, { kind: "worked", artifactSha256: original.manifest.sha256 }), error("FEEDBACK_ARTIFACT_MISMATCH"));
  assert.equal((await service.status(created.jobId, created.capability)).feedback.length, 0);
  await service.rollback(created.jobId, created.capability, original.snapshotId, "rollback-for-feedback");
  await assert.rejects(service.feedback(created.jobId, created.capability, { kind: "worked", artifactSha256: generated.manifest.sha256 }), error("FEEDBACK_ARTIFACT_MISMATCH"));
  const accepted = await service.feedback(created.jobId, created.capability, { kind: "failed", artifactSha256: original.manifest.sha256 }); assert.equal(accepted.feedback.snapshotId, original.snapshotId); assert.equal(accepted.feedback.level, "REPORTED_GAME_FAILURE"); assert.equal(accepted.feedback.independentlyObserved, false);
});

test("feedback during an active lease returns JOB_BUSY without discarding generation", async () => {
  let release!: () => void; const blocked = new Promise<void>(done => { release = done; });
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers({ async generate() { await blocked; return { files }; } })), created = await service.create({ ...input, files });
  const artifact = await service.files(created.jobId, created.capability); await until(service, created.jobId, created.capability, "generation");
  const pending = service.advance(created.jobId, created.capability, "generation-feedback-race"); await new Promise(done => setTimeout(done, 5));
  const before = await service.status(created.jobId, created.capability);
  await assert.rejects(service.feedback(created.jobId, created.capability, { kind: "worked", artifactSha256: artifact.manifest.sha256 }), error("JOB_BUSY"));
  const after = await service.status(created.jobId, created.capability); assert.equal(after.revision, before.revision); assert.equal(after.feedback.length, 0); release();
  const completed = await pending; assert.equal(completed.stage, "validation"); assert.equal(completed.progress[3].status, "passed"); assert.equal(completed.modelAttempts, 1);
});

test("artifact corruption is rejected for both manifest and blob before read or rollback", async () => {
  for (const corrupt of ["manifest", "blob"]) {
    const store = new MemoryGenerationStore(), service = new GenerationJobService(store, handlers()), created = await service.create({ ...input, files }), before = (await store.get(created.jobId))!, changed = structuredClone(before);
    if (corrupt === "manifest") changed.snapshots[0].manifest.files[0].path = "changed.luau";
    else changed.blobs[changed.snapshots[0].manifest.files[0].sha256].content += "tampered";
    changed.revision++; await store.compareAndSwap(created.jobId, before.revision, changed);
    await assert.rejects(service.files(created.jobId, created.capability), error("ARTIFACT_HASH_MISMATCH"));
    await assert.rejects(service.rollback(created.jobId, created.capability, changed.currentSnapshotId!, "rollback-corrupt"), error("ARTIFACT_HASH_MISMATCH"));
  }
});

test("cross-job tokens cannot abort, roll back or submit feedback", async () => {
  const service = new GenerationJobService(new MemoryGenerationStore(), handlers()), a = await service.create({ ...input, files }), b = await service.create(input);
  await assert.rejects(service.abort(a.jobId, b.capability), error("JOB_NOT_FOUND"));
  await assert.rejects(service.rollback(a.jobId, b.capability, a.job.currentSnapshotId!, "rollback-other"), error("JOB_NOT_FOUND"));
  await assert.rejects(service.feedback(a.jobId, b.capability, { kind: "worked" }), error("JOB_NOT_FOUND"));
  assert.equal((await service.status(a.jobId, a.capability)).feedback.length, 0);
});

test("no store auto-fallback in production; Vercel ephemeral filesystem is rejected", () => {
  assert.throws(() => configuredGenerationStore({ NODE_ENV: "production" }), /DURABLE_GENERATION_STORE_REQUIRED/);
  assert.throws(() => configuredGenerationStore({ SCRIPTRUSH_GENERATION_STORE: "filesystem", SCRIPTRUSH_GENERATION_DIRECTORY: "/tmp/jobs", VERCEL: "1" }), /DURABLE_GENERATION_STORE_REQUIRED/);
  assert.throws(() => configuredGenerationStore({ SCRIPTRUSH_GENERATION_STORE: "supabase" }), /DURABLE_GENERATION_STORE_REQUIRED/);
});

test("real resolver → retrieval → plan works without a game file or model call", async () => {
  let modelCalls = 0, requests = 0;
  const fetcher: typeof fetch = async url => { requests++; return Response.json(String(url).includes("/universe") ? { universeId: 994732206 } : { data: [{ id: 994732206, name: "Blox Fruits", description: "Public identity only", updated: "2026-10-13T00:00:00Z" }] }); };
  const service = new GenerationJobService(new MemoryGenerationStore(), createKnowledgeStageHandlers(async () => { modelCalls++; throw new Error("MODEL_NOT_EXPECTED"); }, { fetch: fetcher })), created = await service.create({ ...input, request: "quest state machine with clean stop", game: { placeId: 2753915549 }, allowModelProcessing: false });
  const job = await until(service, created.jobId, created.capability, "generation"); const plan = job.plan as Record<string, unknown>;
  assert.equal(requests, 2); assert.equal(modelCalls, 0); assert.equal(plan.claim100PercentFunctionality, false); assert.ok(Array.isArray(plan.unknowns) && plan.unknowns.length > 0); assert.ok(Array.isArray(plan.references)); assert.equal(job.input.fileCount, 0);
});
