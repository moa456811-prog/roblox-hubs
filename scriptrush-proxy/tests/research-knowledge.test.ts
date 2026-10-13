import test from "node:test";
import assert from "node:assert/strict";
import { parseResearchKnowledge, researchBasisLabel } from "../lib/research-knowledge.ts";

const source = { id: "source-1", title: "Game quest implementation", url: "https://github.com/example/game/blob/main/quests.lua", kind: "github" };
const feature = { id: "quests", label: "Quest Farm", basis: "source-backed", summary: "Quest acceptance and progress are described by the inspected code.", sourceIds: [source.id], missing: ["Confirm current quest completion in the live game"] };
const knowledge = { summary: "One game-specific reference inspected.", sources: [source], features: [feature], researchedAt: "2026-10-13T01:00:00+02:00" };

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
