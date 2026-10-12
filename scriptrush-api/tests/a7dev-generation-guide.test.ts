import assert from "node:assert/strict";
import test from "node:test";
import { a7devGenerationGuide, A7DEV_GUIDE_SOURCE, type A7devGenerationStage } from "../src/lib/a7dev-generation-guide.ts";

test("A7DEV guidance stays within a fixed per-stage prompt budget", () => {
  const stages: A7devGenerationStage[] = ["planner", "composer", "generator", "reviewer"];
  for (const stage of stages) {
    const guide = a7devGenerationGuide(stage);
    assert.ok(Buffer.byteLength(guide, "utf8") <= 3000, `${stage} guide exceeds the 3 KB budget`);
  }
});

test("the curated method retains a verifiable reference without reading the user archive at runtime", () => {
  assert.equal(A7DEV_GUIDE_SOURCE.name, "A7DEV Roblox Universal");
  assert.match(A7DEV_GUIDE_SOURCE.skillSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(A7DEV_GUIDE_SOURCE));
});
