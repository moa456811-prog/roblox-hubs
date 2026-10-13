import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildGenerationKnowledge, generationKnowledgeRole } from "../src/lib/generation-knowledge.ts";
import { CATALOG, RECIPES, KnowledgeIndex, createDeploymentIndex } from "../src/lib/knowledge-v2/index.ts";
import imports from "../knowledge-v2/imports.json" with { type: "json" };

const payload = (context: string) => JSON.parse(context.slice(context.indexOf("\n") + 1));

test("the unchanged catalogue and all 36 recipes remain available; executor is the default", () => {
  assert.equal(CATALOG.length, 78); assert.equal(RECIPES.length, 36);
  const result = buildGenerationKnowledge({ request: "Create a full hub with lifecycle cleanup and respawn recovery", index: new KnowledgeIndex() });
  assert.equal(result.role, "executor_client"); assert.equal(result.stats.indexedRecipes, 36);
  assert.equal(result.recipes.length, 0, "Project recipes are not promoted to executable executor-compatible material");
  assert.ok(result.conceptualRecipes.length > 0); assert.ok(result.examples.length > 0);
  assert.ok(result.refs.every(row => row.kind !== "code"));
  assert.deepEqual(payload(result.context).verification, { gameMechanics: "UNKNOWN", syntax: "not_checked", mocks: "not_run", inGame: "not_run" });
});

test("environment selection requires an explicit code role, never game metadata or ordinary server wording", () => {
  assert.equal(generationKnowledgeRole("Make a full hub on a public server"), "executor_client");
  assert.equal(generationKnowledgeRole("Write a LocalScript in StarterPlayerScripts"), "project_client");
  assert.equal(generationKnowledgeRole("Write a server script in ServerScriptService"), "project_server");
  assert.equal(generationKnowledgeRole("Write client-side code"), "project_client");
  assert.equal(generationKnowledgeRole("Write a script serveur"), "project_server");
  assert.equal(generationKnowledgeRole("ServerScriptService executor client tools"), "executor_client");
  assert.equal(generationKnowledgeRole("irrelevant", "project_server"), "project_server");
  assert.throws(() => generationKnowledgeRole("anything", "tool" as never), /INVALID_GENERATION_KNOWLEDGE_ROLE/);
  assert.equal(buildGenerationKnowledge({ request: "Cleanup", game: { description: "ServerScriptService datastore code" } }).role, "executor_client");
});

test("executor conceptual methods preserve original roles and exclude server persistence/authority", () => {
  const result = buildGenerationKnowledge({ request: "Full hub quest state machine cooldown respawn cleanup rate limit DataStore server freeze authority", index: new KnowledgeIndex() });
  assert.ok(result.conceptualRecipes.length > 0);
  for (const row of result.conceptualRecipes) {
    const original = RECIPES.find(recipe => recipe.id === row.id)!;
    assert.equal(row.conceptOnly, true); assert.deepEqual(row.originalRoles, original.roles); assert.deepEqual(row.roles, original.roles);
    assert.ok(row.originalRoles.includes("project_client")); assert.equal(row.gameSpecific, false);
    assert.ok(!/datastore|npc_freeze|transaction|physics_ownership/.test(row.id));
  }
  assert.ok(result.examples.every(example => example.roles.includes("executor_client")));
  assert.equal(result.licenseAttributions.length, 0, "Janitor project source is not executor-compatible");
  assert.ok(!result.refs.some(row => row.kind === "code"));
});

test("project server retrieval never imports client-only recipes or lifecycle examples", () => {
  const result = buildGenerationKnowledge({ request: "ServerScriptService datastore profile npc freeze respawn CharacterRebinder event cleanup", role: "project_server", index: new KnowledgeIndex() });
  assert.ok(result.recipes.length > 0); assert.ok(result.recipes.every(row => row.roles.includes("project_server")));
  assert.equal(result.conceptualRecipes.length, 0);
  assert.ok(!result.examples.some(example => example.title === "CharacterRebinder"));
  assert.ok(result.examples.every(example => example.roles.includes("project_server")));
});

test("original pack examples carry the exact bytes, archived hashes and illustrative status", () => {
  const result = buildGenerationKnowledge({ request: "cleanup disconnect listeners respawn character recovery cooldown gate pacing", index: new KnowledgeIndex() });
  assert.ok(result.examples.length > 0);
  for (const example of result.examples) {
    assert.equal(createHash("sha256").update(example.code).digest("hex"), example.sha256);
    assert.equal(example.archiveSha256, "d9d3653e0b22dab55e388709a528917a8e50ff531132f292bfd2668046f8b16a");
    assert.equal(example.gameMechanicsProven, false); assert.equal(example.status, "illustrative");
    const reference = result.refs.find(row => row.id === example.id)!;
    assert.equal(reference.sha256, example.sha256); assert.equal(reference.path, example.path);
  }
  const known = result.examples.find(example => example.title === "CharacterRebinder");
  if (known) assert.equal(known.sha256, "fa5fff0443444519ec4c88a77a605a53324b460d7a76c3a62ae3f02d7a9c5e61");
});

test("versioned local query cache never fetches or sends prompts to a model", () => {
  const previousFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("No external request allowed"); };
  try {
    const index = new KnowledgeIndex();
    const first = buildGenerationKnowledge({ request: "respawn cleanup", index, now: 100 });
    const second = buildGenerationKnowledge({ request: "respawn cleanup", index, now: 101 });
    assert.equal(first.cacheHit, false); assert.equal(second.cacheHit, true);
    assert.equal(first.version, index.version); assert.equal(first.contextSha256, second.contextSha256); assert.equal(first.context, second.context);
    assert.equal(calls, 0);
    second.examples[0].code = "tampered";
    assert.notEqual(buildGenerationKnowledge({ request: "respawn cleanup", index, now: 102 }).examples[0].code, "tampered");
  } finally { globalThis.fetch = previousFetch; }
});

test("admitted project excerpts preserve commit, licence, exact excerpt hash and game scopes", () => {
  const scoped = structuredClone(imports) as { schemaVersion: number; imports: Array<Record<string, unknown>> };
  scoped.imports[0].gamePlaceIds = ["123"];
  const index = createDeploymentIndex(scoped);
  const result = buildGenerationKnowledge({ request: "Janitor Cleanup Destroy Add Remove Get cleanup", role: "project_client", game: { placeId: "123" }, index });
  const data = payload(result.context);
  assert.ok(data.code.length > 0); assert.ok(result.licenseAttributions.length > 0);
  for (const row of data.code) {
    assert.equal(row.source.commitSha, "47acf39d7b265fad409e438e976affa9468ff0a2");
    assert.equal(createHash("sha256").update(row.excerpt).digest("hex"), row.excerptSha256);
    assert.equal(row.completeFile, false); assert.equal(row.gameMechanicsProven, false);
    assert.ok(result.refs.some(reference => reference.id === row.id && reference.commitSha === row.source.commitSha));
  }
  for (const licence of result.licenseAttributions) {
    assert.equal(createHash("sha256").update(licence.text).digest("hex"), licence.sha256);
    assert.ok(data.licenseAttributions.some((item: { text: string }) => item.text === licence.text));
  }
  const otherGame = buildGenerationKnowledge({ request: "Janitor Cleanup Destroy Add Remove Get cleanup", role: "project_client", game: { placeId: "456" }, index });
  assert.ok(!otherGame.refs.some(row => row.kind === "code")); assert.equal(otherGame.licenseAttributions.length, 0);
});

test("catalogue rows stay metadata-only with no inferred implementation or licence", () => {
  const result = buildGenerationKnowledge({ request: "executor decompile bytecode analysis", index: new KnowledgeIndex() });
  const data = payload(result.context);
  assert.ok(data.candidates.length > 0);
  for (const row of data.candidates) {
    assert.equal(row.status, "metadata-only"); assert.equal(row.codeIncluded, false); assert.equal(row.licenseState, "UNKNOWN");
  }
  assert.ok(data.boundaries.some((text: string) => /not imported implementations/.test(text)));
});

test("context bounds drop whole records and never truncate JSON, code or licence text", () => {
  const result = buildGenerationKnowledge({ request: "Full hub quest state machine respawn cooldown cleanup rate limit target proof Janitor", maxContextCharacters: 4000, role: "project_client" });
  assert.ok(result.context.length <= 4000); assert.doesNotThrow(() => payload(result.context));
  const data = payload(result.context);
  for (const example of data.examples) assert.equal(createHash("sha256").update(example.code).digest("hex"), example.sha256);
  assert.equal(result.stats.contextCharacters, result.context.length);
  assert.throws(() => buildGenerationKnowledge({ request: "" }), /INVALID_GENERATION_KNOWLEDGE_REQUEST/);
  assert.throws(() => buildGenerationKnowledge({ request: "a".repeat(30_001) }), /INVALID_GENERATION_KNOWLEDGE_REQUEST/);
  assert.throws(() => buildGenerationKnowledge({ request: "cleanup", maxContextCharacters: 3999 }), /INVALID_GENERATION_KNOWLEDGE_LIMIT/);
});
