import test from "node:test";
import assert from "node:assert/strict";
import { parseGenerationUsage, parseReviewIssues, requirementsFailureMessage } from "../lib/generation-diagnostics.ts";

test("usage accepts zero AI calls and rejects invented, incomplete or negative counts", () => {
  assert.deepEqual(parseGenerationUsage({ modelCalls: 0, inputCharacters: 0, outputCharacters: 0 }), { modelCalls: 0, inputCharacters: 0, outputCharacters: 0 });
  for (const value of [null, [], { modelCalls: 0 }, { modelCalls: "3", inputCharacters: 100, outputCharacters: 20 }, { modelCalls: -1, inputCharacters: 100, outputCharacters: 20 }, { modelCalls: 1.5, inputCharacters: 100, outputCharacters: 20 }, { modelCalls: 1, inputCharacters: Infinity, outputCharacters: 20 }]) {
    assert.equal(parseGenerationUsage(value), undefined);
  }
});

test("review checks are bounded plain text with duplicate and unsupported values removed", () => {
  const result = parseReviewIssues({ issues: [null, { html: "unsafe" }, "Missing Rejoin", "Missing Rejoin", "UI " + "x".repeat(300), "Missing tabs", "Missing theme", "Missing Close"] });
  assert.equal(result.length, 4);
  assert.deepEqual([result[0], result[2], result[3]], ["Missing Rejoin", "Missing tabs", "Missing theme"]);
  assert.equal(result[1].length, 240);
  assert.ok(result[1].endsWith("…"));
  assert.deepEqual(parseReviewIssues({ issues: ["x".repeat(4_001)] }), []);
});

test("review diagnostics remove markup, URL credentials, secrets and direction controls", () => {
  const result = parseReviewIssues({ issues: ["<b>Close missing</b>\u202e\n sk-apx0123456789 Bearer super-secret https://example.test/?key=private"] });
  assert.deepEqual(result, ["Close missing [redacted] Bearer [redacted] [link removed]"]);
});

test("requirements guidance retains saved inputs and does not encourage blind repetition", () => {
  const message = requirementsFailureMessage(["Jump Power control missing"], { modelCalls: 0, inputCharacters: 0, outputCharacters: 0 });
  assert.ok(message.includes("Your input and previous script were preserved"));
  assert.ok(message.includes("Jump Power control missing"));
  assert.ok(message.includes("AI calls: 0."));
  assert.ok(!/try again|clearer requirements/i.test(message));
});
