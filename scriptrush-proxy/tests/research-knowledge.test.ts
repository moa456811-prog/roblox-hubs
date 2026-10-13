import test from "node:test";
import assert from "node:assert/strict";
import { parseResearchKnowledge, researchBasisLabel } from "../lib/research-knowledge.ts";

const source = { id: "source-1", title: "Game quest implementation", url: "https://github.com/example/game/blob/main/quests.lua", kind: "github" };
const feature = { id: "quests", label: "Quest Farm", basis: "source-backed", summary: "Quest acceptance and progress are described by the inspected code.", sourceIds: [source.id], missing: ["Confirm current quest completion in the live game"] };
const knowledge = { summary: "One game-specific reference inspected.", sources: [source], features: [feature], researchedAt: "2026-10-13T01:00:00+02:00" };
const revision = "a".repeat(40);
const note = { id: "ANALYSIS_fixture", basis: "source-observed", summary: "Descriptive source observations; no gameplay test was observed.", observations: ["A historical source distinguishes lobby and combat contexts."], provenance: { url: `https://github.com/example/game/blob/${revision}/main.luau`, revision, sha256: "b".repeat(64) }, license: "UNKNOWN", reusePolicy: "analysis-only", runtimeVerified: false };

test("research knowledge normalizes only public summaries and references without retaining raw code", () => {
  const input = { ...knowledge, summary: " Public research ", rawCode: "private raw source", sources: [{ ...source, snippet: "untrusted code", verified: true }], features: [{ ...feature, evidenceCode: "raw implementation" }] };
  const result = parseResearchKnowledge(input);
  assert.deepEqual(result, { ...knowledge, summary: "Public research", researchedAt: "2026-10-12T23:00:00.000Z" });
  assert.notEqual(result?.sources, input.sources);
  assert.notEqual(result?.features[0].sourceIds, input.features[0].sourceIds);
  assert.equal(JSON.stringify(result).includes("raw implementation"), false);
  assert.equal(JSON.stringify(result).includes("untrusted code"), false);
});

test("source-backed evidence remains distinct from explicitly supplied in-game verification", () => {
  assert.equal(parseResearchKnowledge({ ...knowledge, sources: [{ ...source, verified: true }], features: [{ ...feature, confidence: "high", verified: true }] })?.features[0].basis, "source-backed");
  assert.equal(researchBasisLabel("source-backed"), "Source-backed");
  assert.equal(researchBasisLabel("runtime-verified"), "In-game verified");
  assert.equal(researchBasisLabel("unknown"), "Needs evidence");
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, basis: "runtime-verified" }] })?.features[0].basis, "runtime-verified");
  for (const basis of ["confirmed", "high", "verified", "SOURCE-BACKED", undefined, true]) assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, basis }] }), null);
});

test("research links require absolute HTTPS without credentials, controls or ambiguous separators", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://github.com/example", "/relative", "//github.com/example", "https://user:secret@github.com/example", "https://github.com/has a space", "https:\\github.com\\example", "https://github.com/\u202eexample", "not-a-url"]) {
    assert.equal(parseResearchKnowledge({ ...knowledge, sources: [{ ...source, url }] }), null);
  }
  assert.equal(parseResearchKnowledge({ ...knowledge, sources: [{ ...source, url: "https://github.com/example?q=quest#L4" }] })?.sources[0].url, "https://github.com/example?q=quest#L4");
});

test("research references reject duplicates, unknown source IDs and source-backed claims without sources", () => {
  assert.equal(parseResearchKnowledge({ ...knowledge, sources: [source, { ...source, id: " source-1 " }] }), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [feature, { ...feature, id: " quests " }] }), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, sourceIds: ["missing-source"] }] }), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, sourceIds: [source.id, source.id] }] }), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, sourceIds: [] }] }), null);
  assert.ok(parseResearchKnowledge({ summary: "No usable code reference found.", sources: [], features: [{ ...feature, basis: "unknown", sourceIds: [] }] }));
});

test("optional malformed research does not produce a partial or unbounded evidence panel", () => {
  for (const value of [null, undefined, [], {}, { ...knowledge, summary: " " }, { ...knowledge, summary: "s".repeat(1001) }, { ...knowledge, sources: {} }, { ...knowledge, features: {} }, { ...knowledge, sources: [{ ...source, title: "t".repeat(181) }] }, { ...knowledge, features: [{ ...feature, summary: "s".repeat(801) }] }, { ...knowledge, features: [{ ...feature, missing: [" "] }] }, { ...knowledge, features: [{ ...feature, missing: Array(9).fill("Unknown") }] }, { ...knowledge, researchedAt: "invalid-date" }]) assert.equal(parseResearchKnowledge(value), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, sources: Array.from({ length: 25 }, (_, index) => ({ ...source, id: `source-${index}` })) }), null);
  assert.equal(parseResearchKnowledge({ ...knowledge, features: Array.from({ length: 33 }, (_, index) => ({ ...feature, id: `feature-${index}` })) }), null);
});

test("markup-like summaries stay plain strings and cannot supply HTML properties", () => {
  const summary = '<img src=x onerror="alert(1)">';
  const result = parseResearchKnowledge({ ...knowledge, summary, __html: "<script>unsafe</script>" });
  assert.equal(result?.summary, summary);
  assert.equal(Object.hasOwn(result!, "__html"), false);
});

test("source observations keep immutable provenance and unknown licence without promoting gameplay", () => {
  const input = { ...knowledge, sources: [], features: [{ ...feature, basis: "unknown", sourceIds: [] }], sourceAnalysis: [{ ...note, summary: ` ${note.summary} `, observations: [` ${note.observations[0]} `], rawCode: "PRIVATE_SOURCE_DO_NOT_COPY", verified: true, provenance: { ...note.provenance, code: "PRIVATE_IMPLEMENTATION" } }] };
  const result = parseResearchKnowledge(input)!;
  assert.ok(result); assert.deepEqual(result.sourceAnalysis, [note]);
  assert.equal(result.features[0].basis, "unknown"); assert.deepEqual(result.sources, []);
  assert.equal(result.sourceAnalysis![0].runtimeVerified, false); assert.equal(result.sourceAnalysis![0].license, "UNKNOWN");
  assert.equal(result.sourceAnalysis![0].reusePolicy, "analysis-only");
  assert.notEqual(result.sourceAnalysis, input.sourceAnalysis); assert.notEqual(result.sourceAnalysis![0].observations, input.sourceAnalysis[0].observations);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SOURCE|PRIVATE_IMPLEMENTATION|"verified":true/);
  assert.equal(parseResearchKnowledge({ ...knowledge, sourceAnalysis: [{ ...note, license: "MIT" }] })?.sourceAnalysis?.[0].license, "MIT");
  assert.equal(parseResearchKnowledge({ ...knowledge, features: [{ ...feature, basis: "source-observed" }] }), null, "Descriptive observations are not a feature evidence basis");
});

test("source observations require matching pinned URL, exact SHA lengths and analysis-only verification", () => {
  const invalid = [
    { ...note, basis: "source-backed" }, { ...note, basis: "runtime-verified" }, { ...note, runtimeVerified: true },
    { ...note, reusePolicy: "copy-allowed" }, { ...note, license: "GPL-3.0" },
    { ...note, provenance: { ...note.provenance, revision: "main" } },
    { ...note, provenance: { ...note.provenance, revision: "a".repeat(39) } },
    { ...note, provenance: { ...note.provenance, sha256: "b".repeat(63) } },
    { ...note, provenance: { ...note.provenance, sha256: "z".repeat(64) } },
    { ...note, provenance: { ...note.provenance, url: note.provenance.url.replace(revision, "c".repeat(40)) } },
    { ...note, provenance: { ...note.provenance, url: note.provenance.url.replace(revision, "main") } },
    { ...note, provenance: { ...note.provenance, url: note.provenance.url.replace("github.com", "attacker.invalid") } },
    { ...note, provenance: { ...note.provenance, url: note.provenance.url + "?revision=main" } },
    { ...note, provenance: { ...note.provenance, url: note.provenance.url.replace("https://", "https://user:secret@") } },
  ];
  for (const invalidNote of invalid) assert.equal(parseResearchKnowledge({ ...knowledge, sourceAnalysis: [invalidNote] }), null);
});

test("source observation parser bounds records, text, identifiers and original observation lists", () => {
  for (const sourceAnalysis of [null, {}, Array(5).fill(note), [note, { ...note, id: ` ${note.id} ` }], [{ ...note, id: "i".repeat(129) }], [{ ...note, summary: "s".repeat(1001) }], [{ ...note, observations: [] }], [{ ...note, observations: Array(9).fill("Observation") }], [{ ...note, observations: ["s".repeat(801)] }], [{ ...note, observations: [" "] }], [{ ...note, observations: ["Observation", " Observation "] }], [{ ...note, observations: ["Safe\u202eunsafe"] }]]) {
    assert.equal(parseResearchKnowledge({ ...knowledge, sourceAnalysis }), null);
  }
  const boundary = { ...note, id: "i".repeat(128), summary: "s".repeat(1000), observations: Array.from({ length: 8 }, (_, index) => `${index}` + "s".repeat(799)) };
  assert.equal(parseResearchKnowledge({ ...knowledge, sourceAnalysis: [boundary] })?.sourceAnalysis?.[0].observations.length, 8);
  assert.deepEqual(parseResearchKnowledge({ ...knowledge, sourceAnalysis: [] })?.sourceAnalysis, []);
});

test("optional reviewed game identity remains descriptive bounded metadata and discards raw source fields", () => {
  const gameProfile = { universeId: "10512942223", rootPlaceId: "114574503491412", combatPlaceId: "109151342576374", genre: "Action RPG / dungeon crawler", observedAt: "2026-10-13", identityEvidenceUrls: ["https://apis.roblox.com/universes/v1/places/114574503491412/universe"] };
  const result = parseResearchKnowledge({ ...knowledge, sourceAnalysis: [{ ...note, gameProfile: { ...gameProfile, rawCode: "PRIVATE_GAME_CODE", supported: true } }] });
  assert.deepEqual(result?.sourceAnalysis?.[0].gameProfile, gameProfile);
  assert.equal(result?.sourceAnalysis?.[0].runtimeVerified, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_GAME_CODE|"supported"/);
  for (const profile of [{ ...gameProfile, universeId: "0" }, { ...gameProfile, combatPlaceId: "script" }, { ...gameProfile, observedAt: "invalid" }, { ...gameProfile, genre: "g".repeat(181) }, { ...gameProfile, identityEvidenceUrls: ["javascript:alert(1)"] }, { ...gameProfile, identityEvidenceUrls: Array(5).fill(gameProfile.identityEvidenceUrls[0]) }]) {
    assert.equal(parseResearchKnowledge({ ...knowledge, sourceAnalysis: [{ ...note, gameProfile: profile }] }), null);
  }
});
