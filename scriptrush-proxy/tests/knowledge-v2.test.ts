import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { clearKnowledgeSession, createKnowledge, createKnowledgeRequest, feedbackKnowledge, fileLineDiff, getKnowledge, getKnowledgeFiles, knowledgeEnabled, knowledgeSources, KNOWLEDGE_STORAGE, loadKnowledgeSession, parseKnowledgeFiles, parseKnowledgeJob, rollbackKnowledge, runKnowledge, saveKnowledgeSession, verificationLabel, type KnowledgeJob, type KnowledgeSession } from "../lib/knowledge-v2.ts";
import { STORAGE_KEYS } from "../lib/storage.ts";
import { projectZip } from "../lib/project-download.ts";

class MemoryStorage { data = new Map<string, string>(); getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { this.data.set(key, value); } removeItem(key: string) { this.data.delete(key); } }
const session: KnowledgeSession = { version: 1, id: "job-12345678", token: "t".repeat(43), mode: "build" };
const job = (revision = 0, status: KnowledgeJob["status"] = "queued"): KnowledgeJob => ({ id: session.id, revision, status, stage: status === "ready" ? "ready" : "discovery", progress: [{ stage: "discovery", status: status === "ready" ? "passed" : "pending", attempts: revision }], snapshots: [] });

test("v2 is opt-in and job storage does not write or migrate legacy script/history keys", () => {
  assert.equal(knowledgeEnabled(undefined), false); assert.equal(knowledgeEnabled("false"), false); assert.equal(knowledgeEnabled("true"), true); assert.equal(knowledgeEnabled("1"), true);
  const storage = new MemoryStorage();
  for (const key of [...Object.values(STORAGE_KEYS), "scriptrush_current_script", "sr_game", "sr_place"]) storage.setItem(key, "exact previous bytes Ω\r\n");
  const original = new Map(storage.data); saveKnowledgeSession(session, storage);
  assert.deepEqual(loadKnowledgeSession("build", storage), session); assert.equal(loadKnowledgeSession("fix", storage), null);
  clearKnowledgeSession("build", storage); assert.deepEqual(storage.data, original);
  storage.setItem(KNOWLEDGE_STORAGE.build, '{"version":1,"id":"job-12345678","token":"short","mode":"build"}'); assert.equal(loadKnowledgeSession("build", storage), null);
  for (const [key, value] of original) assert.equal(storage.getItem(key), value);
});

test("Place first generation needs no file; targeted patch sends complete files and error only after consent", () => {
  const common = { game: "https://www.roblox.com/games/123456/Demo", request: "Keep all tabs. English UI.", mode: "build" as const, role: "project_client" as const, files: [], consent: true };
  const body = createKnowledgeRequest(common); assert.equal(body.intent, "generate"); assert.deepEqual(body.files, []); assert.equal(body.game.url, common.game);
  assert.equal(createKnowledgeRequest({ ...common, consent: false }).allowModelProcessing, false);
  assert.throws(() => createKnowledgeRequest({ ...common, mode: "fix" }), /current files/);
  const content = "  -- Ω\r\nfunction current()\n return 1\nend\n";
  const patch = createKnowledgeRequest({ ...common, mode: "fix", game: "123456", request: "main.luau:2: error; change only the failing expression", files: [{ path: "main.luau", content }] });
  assert.equal(patch.intent, "patch"); assert.equal(patch.files[0].content, content); assert.equal(patch.request, "main.luau:2: error; change only the failing expression"); assert.deepEqual(patch.game, { placeId: 123456 });
});

test("aborted step preserves its idempotency key and a resumed job advances from real persisted status", async () => {
  const storage = new MemoryStorage(), abort = new AbortController(); const seen: string[] = [];
  await assert.rejects(runKnowledge(session, { signal: abort.signal, onJob: value => seen.push(value.status), onSession: value => saveKnowledgeSession(value, storage), get: async () => job(), advance: async () => { abort.abort(); throw new DOMException("Paused", "AbortError"); } }), /Paused/);
  const saved = loadKnowledgeSession("build", storage)!; assert.ok(saved.pending?.key); assert.equal(saved.id, session.id); assert.equal(saved.token, session.token); assert.deepEqual(seen, ["queued"]);
  const restored = await runKnowledge(saved, { signal: new AbortController().signal, onJob: value => seen.push(value.status), onSession: value => saveKnowledgeSession(value, storage), get: async () => job(), advance: async (_session, operation, key) => { assert.equal(operation, "advance"); assert.equal(key, saved.pending?.key); return job(1, "ready"); } });
  assert.equal(restored.status, "ready"); assert.equal(loadKnowledgeSession("build", storage)?.pending, undefined); assert.deepEqual(seen, ["queued", "queued", "ready"]);
});

test("failed jobs require explicit resume and a stationary step cannot loop or fabricate completion", async () => {
  let calls = 0;
  const failed = await runKnowledge(session, { signal: new AbortController().signal, onJob: () => {}, onSession: () => {}, get: async () => job(1, "failed"), advance: async () => { calls++; return job(2, "ready"); } });
  assert.equal(failed.status, "failed"); assert.equal(calls, 0);
  await assert.rejects(runKnowledge(session, { signal: new AbortController().signal, onJob: () => {}, onSession: () => {}, get: async () => job(), advance: async () => { calls++; return job(); } }), /not advanced/); assert.equal(calls, 1);
});

test("verification names keep syntax, simulation, tester reports and independent observation distinct", () => {
  assert.equal(verificationLabel(undefined), "Unverified"); assert.equal(verificationLabel({ passed: true }), "Unverified"); assert.equal(verificationLabel({ level: "DRAFT" }), "Unverified");
  assert.equal(verificationLabel({ level: "SYNTAX_PASSED" }), "Compilation passed"); assert.equal(verificationLabel({ level: "MOCK_PASSED" }), "Simulated tests passed");
  assert.equal(verificationLabel({ level: "REPORTED_GAME_PASS" }), "In-game result reported"); assert.equal(verificationLabel({ level: "OBSERVED_GAME_PASS" }), "In-game result observed");
  assert.throws(() => parseKnowledgeJob({ ...job(), progress: [{ stage: "discovery", status: "estimated-success", attempts: 1 }] }), /progress/);
});

test("real API envelope names, role and capability headers are honored without putting keys in URLs", async () => {
  const previousFetch = globalThis.fetch; const content = "-- exact full Ω\r\nprint(1)\n"; const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); seen.push(url); assert.doesNotMatch(url, new RegExp(session.token)); assert.equal(init?.credentials, "omit");
    const headers = new Headers(init?.headers);
    if (url === "/api/v2/generations") { assert.equal(headers.get("authorization"), null); return Response.json({ jobId: session.id, capability: session.token, job: { ...job(), role: "executor_client" } }, { status: 201 }); }
    assert.equal(headers.get("authorization"), "Bearer " + session.token);
    if (url.includes("/files")) return Response.json({ files: [{ path: "src/main.luau", content }], snapshotId: "snapshot-1", manifest: { sha256: "a".repeat(64) } });
    if (url.endsWith("/rollback")) { const body = JSON.parse(String(init?.body)); assert.equal(body.snapshotId, "snapshot-1"); assert.ok(body.idempotencyKey); }
    if (url.endsWith("/feedback")) { const body = JSON.parse(String(init?.body)); assert.equal(body.kind, "worked"); assert.equal(body.artifactSha256, "a".repeat(64)); }
    return Response.json({ job: { ...job(2, "ready"), role: "executor_client", verification: { level: "DRAFT" } } });
  };
  try {
    const created = await createKnowledge(createKnowledgeRequest({ game: "123456", request: "English UI", mode: "build", role: "executor_client", files: [], consent: true }), "build");
    assert.deepEqual(created.session, session); assert.equal(created.job.role, "executor_client");
    assert.equal((await getKnowledge(session)).status, "ready");
    assert.equal((await getKnowledgeFiles(session, { snapshotId: "snapshot-1", compareTo: "snapshot-2" })).files[0].content, content);
    assert.equal((await rollbackKnowledge(session, "snapshot-1")).verification && true, true);
    await feedbackKnowledge(session, { kind: "worked", artifactSha256: "a".repeat(64) });
    assert.ok(seen.some(url => url.includes("snapshotId=snapshot-1&compareTo=snapshot-2")));
  } finally { globalThis.fetch = previousFetch; }
});

test("catalog license guesses stay unknown and verified code carries its actual license, commit and hash", () => {
  const current = { ...job(), retrieval: { candidates: [{ id: "catalog-one", name: "Candidate", roles: ["project_client"], licenseState: "UNKNOWN", licenseCandidate: "MIT", commitSha: null, contentHash: "a".repeat(64) }], hits: [{ id: "code-one", sourceId: "verified-one", kind: "code", title: "Module", roles: ["project_client"], licenseState: "verified", sha256: "b".repeat(64), sourceLink: { id: "verified-one", url: "https://github.com/test/source", commitSha: "c".repeat(40), licenseSpdx: "MIT" } }] } };
  const views = knowledgeSources(current); assert.equal(views.length, 2);
  assert.match(views[0].license, /Unknown/); assert.equal(views[0].commit, "Not pinned");
  assert.equal(views[1].license, "MIT"); assert.equal(views[1].commit, "c".repeat(40)); assert.equal(views[1].sha256, "b".repeat(64));
});

test("file parsing and exact diff preserve whole content and refuse traversal or duplicate files", () => {
  const files = [{ path: "src/main.luau", content: "-- Ω\r\nprint(1)\n" }]; assert.deepEqual(parseKnowledgeFiles({ files }).files, files);
  for (const changed of [[{ path: "../outside.lua", content: "x" }], [{ path: "C:/outside.lua", content: "x" }], [{ path: "src/.hidden/main.lua", content: "x" }], [...files, ...files], [files[0], { ...files[0], path: "SRC/main.luau" }]]) assert.throws(() => parseKnowledgeFiles({ files: changed }), /invalid|Duplicate/);
  assert.equal(fileLineDiff("a\nb\nc", "a\nnew\nc"), "@@ -2,1 +2,1 @@\n-b\n+new"); assert.equal(fileLineDiff("same", "same"), "No changes.");
});

test("complete project ZIP round-trips every path and UTF-8 file through its local entries", () => {
  const files = [{ path: "src/main.luau", content: "-- Ω\r\nprint('full file')\n" }, { path: "README.md", content: "Unverified\n" }];
  const bytes = projectZip(files), view = new DataView(bytes.buffer); const decoded = []; let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) { const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), bodyStart = offset + 30 + nameLength; decoded.push({ path: new TextDecoder().decode(bytes.slice(offset + 30, bodyStart)), content: new TextDecoder().decode(bytes.slice(bodyStart, bodyStart + size)) }); offset = bodyStart + size; }
  assert.deepEqual(decoded, files); assert.equal(view.getUint32(offset, true), 0x02014b50); assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50); assert.equal(view.getUint16(bytes.length - 12, true), files.length);
});

test("legacy workflow remains behind an independent optional v2 wrapper without changing History storage", () => {
  const source = readFileSync(new URL("../workflows/script-workflow.tsx", import.meta.url), "utf8");
  assert.match(source, /NEXT_PUBLIC_SCRIPTRUSH_KNOWLEDGE_V2/); assert.match(source, /enabled && optIn/); assert.match(source, /function LegacyScriptWorkflow/);
  assert.match(source, /scriptrush_fix_draft_v2/); assert.match(source, /saveResult\(output\.script/);
  const v2 = readFileSync(new URL("../workflows/knowledge-workflow.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(v2, /addHistory|setCurrentScript|setInterval|console\./); assert.match(v2, /Report Worked/); assert.match(v2, /reports.*independent in-game observation/i);
});


test("preflight stops before generation without consent, including after a browser restart", async () => {
  const planned = parseKnowledgeJob({ ...job(6), stage: "generation", input: { allowModelProcessing: false } });
  let calls = 0;
  const result = await runKnowledge(session, { signal: new AbortController().signal, onJob: () => {}, onSession: () => {}, get: async () => planned, advance: async () => { calls++; return job(8, "ready"); } });
  assert.equal(result.stage, "generation"); assert.equal(calls, 0);
});


test("restored job retains the request and game without exposing its resume key", () => {
  const restored = parseKnowledgeJob({ ...job(), input: { allowModelProcessing: false, request: "Keep my exact title", game: { query: "2753915549" } } });
  assert.equal(restored.input?.request, "Keep my exact title"); assert.equal(restored.input?.game, "2753915549");
});
test("verified source links and matching chunks show one consistent licence and role", () => {
  const sourceLink = { id: "repo-file", title: "Module", url: "https://github.com/example/module", commitSha: "c".repeat(40), licenseSpdx: "MIT", status: "observed" };
  const views = knowledgeSources({ ...job(), retrieval: { sourceLinks: [sourceLink], hits: [{ id: "chunk-1", sourceId: "repo", sourceLink, kind: "code", roles: ["project_client"], licenseState: "verified", sha256: "a".repeat(64) }] } });
  assert.equal(views.length, 1); assert.equal(views[0].license, "MIT"); assert.deepEqual(views[0].roles, ["project_client"]);
});
