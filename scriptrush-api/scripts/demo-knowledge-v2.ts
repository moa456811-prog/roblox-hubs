/** Offline writer fixture + live public identity; never calls an AI provider. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { GenerationJobService } from "../src/lib/generation-jobs/service.ts";
import { FileGenerationStore } from "../src/lib/generation-jobs/store.ts";
import { createKnowledgeStageHandlers } from "../src/lib/generation-jobs/runtime.ts";
import { queryKnowledge } from "../src/lib/knowledge-v2/index.ts";
import type { ModelCall } from "../src/lib/generation.ts";
import type { PublicGenerationJob } from "../src/lib/generation-jobs/types.ts";

const output = resolve(process.argv[2] || "test-results/knowledge-v2/demo");
const privateStore = resolve(".scriptrush/demo-" + randomUUID());
const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/knowledge-project-demo.json", import.meta.url), "utf8"));
let fixtureCalls = 0;
const writer: ModelCall = async (_system, user) => {
  fixtureCalls++;
  const input = JSON.parse(user);
  return { content: JSON.stringify(input.mode === "fix" ? {
    edits: [{ path: "src/main.client.luau", oldText: "print('Character ready')", newText: "print('Character available')" }], features: [], unknowns: [],
  } : { files: fixture.files, features: input.evidencePlan.features.map((feature: { name: string }) => ({ name: feature.name, implementationStatus: "implemented", sourceIds: [] })), unknowns: [] }), model: "authored-offline-fixture-no-provider", incomplete: false, attempts: 1 };
};
const handlers = createKnowledgeStageHandlers(writer, { compilerPath: process.env.SCRIPTRUSH_LUAU_COMPILER, mockRunnerPath: resolve("scripts/knowledge-v2-mock-runner.mjs") });
const service = () => new GenerationJobService(new FileGenerationStore(privateStore), handlers);
const started = performance.now(), timings: Array<{ stage: string; milliseconds: number; status: string }> = [];
const created = await service().create({ request: "Cooldown; character lifecycle; cleanup", game: { url: "https://www.roblox.com/games/2753915549/" }, role: "project_client", intent: "generate", files: [], allowModelProcessing: true });
let job = await service().advance(created.jobId, created.capability, randomUUID());
timings.push({ stage: "public-discovery", milliseconds: performance.now() - started, status: String((job.discovery as { status?: string })?.status) });
// A real deadline failure, followed by a fresh service and persistent-store resume.
const timeoutService = new GenerationJobService(new FileGenerationStore(privateStore), { ...handlers, retrieve: async context => { await new Promise(done => setTimeout(done, 100)); context.signal.throwIfAborted(); return handlers.retrieve(context); } }, { stageTimeoutMs: 30 });
const failed = await timeoutService.advance(created.jobId, created.capability, randomUUID());
assert.equal(failed.progress.find(stage => stage.stage === "retrieval")?.errorCode, "STAGE_TIMEOUT");
assert.equal(fixtureCalls, 0);
while (job.status !== "ready") {
  const at = performance.now(), stage = job.stage;
  job = await service().advance(created.jobId, created.capability, randomUUID());
  timings.push({ stage, milliseconds: performance.now() - at, status: job.status });
  assert.notEqual(job.status, "failed", JSON.stringify(job.progress));
}
const generated = await service().files(created.jobId, created.capability);
const patch = await service().create({ request: "Change only the printed character status label", game: { placeId: 2753915549 }, role: "project_client", intent: "patch", files: generated.files, allowModelProcessing: true });
let patched = patch.job;
while (patched.status !== "ready") { patched = await service().advance(patch.jobId, patch.capability, randomUUID()); assert.notEqual(patched.status, "failed"); }
const changed = await service().files(patch.jobId, patch.capability, undefined, patch.job.snapshots[0].id);
assert.match(changed.diff ?? "", /Character available/);
const restored = await service().rollback(patch.jobId, patch.capability, patch.job.snapshots[0].id, randomUUID());
assert.equal(restored.verification.level, "DRAFT");
let rollback = restored;
while (rollback.status !== "ready") rollback = await service().advance(patch.jobId, patch.capability, randomUUID());
assert.deepEqual((await service().files(patch.jobId, patch.capability)).files, generated.files);
const ragTimes: number[] = [];
for (let i = 0; i < 100; i++) {
  const at = performance.now();
  queryKnowledge({ request: i === 0 ? "Janitor cleanup lifecycle" : "Janitor cleanup lifecycle", role: "project_client" });
  ragTimes.push(performance.now() - at);
}
const retrieval = queryKnowledge({ request: "Janitor cleanup lifecycle", role: "project_client" });
const quantile = (fraction: number) => [...ragTimes].sort((a, b) => a - b)[Math.ceil(ragTimes.length * fraction) - 1];
await mkdir(output, { recursive: true });
for (const file of generated.files) {
  const target = resolve(output, "project", file.path);
  assert.ok(!relative(resolve(output, "project"), target).startsWith(".."));
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, file.content);
}
const publicReport = (value: PublicGenerationJob) => ({ status: value.status, progress: value.progress, verification: value.verification, generationReport: value.generationReport, events: value.events });
const report = {
  formatVersion: 1, measuredAt: new Date().toISOString(), disclaimer: fixture.disclaimer,
  noGameFile: true, publicIdentity: job.discovery, knowledge: { version: retrieval.version, actualRetrievedCode: retrieval.hits.filter(hit => hit.kind === "code").map(hit => ({ path: hit.path, sha256: hit.sha256, source: hit.sourceLink })), licenseAttributions: retrieval.licenseAttributions },
  generation: publicReport(job), manifest: generated.manifest,
  timeoutRecovery: { failedStage: "retrieval", actualErrorCode: "STAGE_TIMEOUT", resumedWithFreshServiceInstance: true, attempts: job.progress.find(row => row.stage === "retrieval")?.attempts },
  patch: { ...publicReport(patched), diff: changed.diff }, rollback: publicReport(rollback),
  metrics: { providerHttpRequests: 0, authoredFixtureCalls: fixtureCalls, providerTokens: 0, monetaryCostOfModelRequests: 0, liveModelQualityMeasured: false, liveModelLatencyMs: null, timings, rag: { queries: 100, firstQueryMs: ragTimes[0], cachedP50Ms: quantile(.5), cachedP95Ms: quantile(.95) } },
  limits: ["Authored writer fixture; not an AI model comparison.", "Generic local lifecycle simulation only; no observed Roblox game test.", "Public game identity does not prove quest, economy or remote mechanisms.", "Production Supabase and Vercel runtime have not been qualified."],
};
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ reportPath: join(output, "report.json"), files: generated.files.length, publicIdentity: (job.discovery as { status?: string })?.status, verification: job.verification.level, resumed: true, rollback: true, providerHttpRequests: 0 }));
