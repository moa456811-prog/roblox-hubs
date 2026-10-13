import assert from "node:assert/strict";
import test from "node:test";
import { captureApiParameters } from "./capture-api-parameters.ts";

test("all eight frozen writer prompts capture real production API parameters without changing inputs", async () => {
  const receipt = await captureApiParameters();
  assert.equal(receipt.networkCalls, 0);
  assert.equal(receipt.cases.length, 8);
  for (const row of receipt.cases) {
    assert.deepEqual(row.writerBudget, { maxTokens: 14_000, timeoutMs: 120_000, attempts: 1 });
    assert.deepEqual(row.providerParameters, { temperature: 0.1, max_tokens: 14_000, stream: true, thinking: { type: "disabled" }, response_format: { type: "json_object" } });
  }
});
