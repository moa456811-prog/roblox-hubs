import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationHttpHandler } from "../src/lib/generation-jobs/http.ts";
import { GenerationJobService } from "../src/lib/generation-jobs/service.ts";
import { MemoryGenerationStore } from "../src/lib/generation-jobs/store.ts";
import type { GenerationStageHandlers } from "../src/lib/generation-jobs/types.ts";

const input = { request: "Build a complete local UI", role: "project_client", allowModelProcessing: true };
const handlers: GenerationStageHandlers = {
  async discover() { return { status: "UNKNOWN", unknowns: ["No game observed"] }; }, async retrieve() { return { hits: [] }; }, async plan() { return { unknowns: ["Mechanics UNKNOWN"] }; },
  async generate() { return { files: [{ path: "src/main.client.luau", content: "print('English UI')" }, { path: "src/Module.luau", content: "return {}" }] }; },
  async validate() { return { compilation: { status: "not_checked", executed: false }, mockTests: { status: "not_run", executed: false }, inGameTests: { status: "not_run", executed: false }, runtimeCompatibility: "unknown", issues: [] }; },
};
function setup() { const service = new GenerationJobService(new MemoryGenerationStore(), handlers); return createGenerationHttpHandler(() => service, { SCRIPTRUSH_KNOWLEDGE_V2_ENABLED: "true" }); }
function post(body: unknown, cap?: string) { return new Request("https://scriptrush.example/api/v2/generations", { method: "POST", headers: { "content-type": "application/json", ...(cap ? { authorization: `Bearer ${cap}` } : {}) }, body: JSON.stringify(body) }); }
function get(cap?: string, suffix = "") { return new Request("https://scriptrush.example/api/v2/generations/id/status" + suffix, { headers: cap ? { authorization: `Bearer ${cap}` } : {} }); }

test("V2 feature flag fails closed before storage/model access", async () => {
  let touched = false; const handle = createGenerationHttpHandler(() => { touched = true; throw new Error("private credential"); }, {});
  assert.equal((await handle("create", post(input))).status, 404); assert.equal(touched, false);
});
test("HTTP errors never expose credentials or internal stack, missing bearer rejected before store", async () => {
  let touched = false; const handle = createGenerationHttpHandler(() => { touched = true; throw new Error("private credential"); }, { SCRIPTRUSH_KNOWLEDGE_V2_ENABLED: "true" });
  const noAuth = await handle("status", get(), "id"); assert.equal(noAuth.status, 404); assert.equal(touched, false);
  const internal = await handle("create", post(input)); assert.equal(internal.status, 500); assert.deepEqual(await internal.json(), { error: "GENERATION_API_FAILED" });
});
test("durable storage missing returns explicit 503 and never silently runs in memory", async () => {
  const handle = createGenerationHttpHandler(() => { throw new Error("DURABLE_GENERATION_STORE_REQUIRED"); }, { SCRIPTRUSH_KNOWLEDGE_V2_ENABLED: "true" });
  const result = await handle("create", post(input)); assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "DURABLE_GENERATION_STORE_REQUIRED" });
});
test("HTTP full lifecycle creation/status/progress/private files/rollback/feedback", async () => {
  const handle = setup(), creation = await handle("create", post(input)); assert.equal(creation.status, 201);
  const { jobId, capability, job } = await creation.json(); assert.equal(job.progress[0].status, "pending"); assert.match(capability, /^[\w-]{43}$/);
  const other = await (await handle("create", post(input))).json(); assert.equal((await handle("status", get(other.capability), jobId)).status, 404);
  for (let i = 0; i < 6; i++) { const advanced = await handle("advance", post({ idempotencyKey: `operation-${i}` }, capability), jobId); assert.equal(advanced.status, 200); }
  const status = await (await handle("status", get(capability), jobId)).json(); assert.equal(status.job.status, "ready"); assert.equal(status.job.verification.level, "DRAFT"); assert.ok(!("capabilityHash" in status.job));
  const artifactResponse = await handle("files", get(capability), jobId), artifact = await artifactResponse.json(); assert.equal(artifact.files.length, 2); assert.match(artifact.manifest.sha256, /^[0-9a-f]{64}$/); assert.equal(artifactResponse.headers.get("cache-control"), "private, no-store");
  const feedback = await (await handle("feedback", post({ kind: "worked", message: "I tested this session", artifactSha256: artifact.manifest.sha256 }, capability), jobId)).json(); assert.equal(feedback.feedback.independentlyObserved, false); assert.equal(feedback.job.verification.level, "REPORTED_GAME_PASS"); assert.equal(feedback.job.verification.inGameTests.status, "not_run");
  const rolled = await (await handle("rollback", post({ snapshotId: artifact.snapshotId, idempotencyKey: "rollback-key" }, capability), jobId)).json(); assert.equal(rolled.job.stage, "validation"); assert.equal(rolled.job.verification.inGameTests.executed, false);
});
test("body parsing bounds and content type are enforced before job creation", async () => {
  const handle = setup();
  assert.equal((await handle("create", new Request("https://example.test", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await handle("create", post({ ...input, request: "x".repeat(900001) }))).status, 413);
  assert.equal((await handle("create", new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{broken" }))).status, 400);
});
test("knowledge API preserves role isolation, licence unknowns and cached query without model", async () => {
  const handle = setup();
  const first = await handle("query", post({ request: "server datastore", role: "project_server" })); assert.equal(first.status, 200); const result = await first.json(); assert.match(result.version, /^knowledge-v2-/); assert.ok(result.hits.every((hit: { roles: string[] }) => hit.roles.includes("project_server"))); assert.ok(result.unknowns.length);
  const second = await (await handle("query", post({ request: "server datastore", role: "project_server" }))).json(); assert.equal(second.cacheHit, true);
  assert.equal((await handle("query", post({ request: "datastore", role: "unknown" }))).status, 400);
  assert.equal((await handle("resolve", post({ placeIdOrUrl: "https://evil.test/games/1" }))).status, 400);
});
