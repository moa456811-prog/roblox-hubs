import test from "node:test";
import assert from "node:assert/strict";
import { readProviderCompletion } from "../src/lib/provider-response.ts";

function stream(events: string) {
  const bytes = new TextEncoder().encode(events);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
}
const event = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;

test("streaming preserves complete code across UTF-8/event boundaries and omits reasoning", async () => {
  const response = stream(': keepalive\r\n\r\n' + event({ model: "free/test", choices: [{ delta: { reasoning_content: "private reasoning" } }] }) + event({ choices: [{ delta: { content: "Réglages\n" } }] }) + event({ choices: [{ delta: { content: "gui:Destroy()" }, finish_reason: "stop" }] }) + 'data: [DONE]\r\n\r\n');
  assert.deepEqual(await readProviderCompletion(response, "default"), { content: "Réglages\ngui:Destroy()", model: "free/test", incomplete: false });
});

test("a disconnected or token-limited stream cannot claim a complete script", async () => {
  for (const ending of ['', 'data: [DONE]\n\n', event({ choices: [{ delta: {}, finish_reason: "length" }] })]) {
    const result = await readProviderCompletion(stream(event({ choices: [{ delta: { content: 'local gui=Instance.new("ScreenGui")' } }] }) + ending), "free/test");
    assert.equal(result.incomplete, true);
  }
});

test("stream errors and malformed events reject plausible preceding code", async () => {
  for (const [ending, reason] of [[event({ error: { code: 429 } }), /RATE_LIMITED/], ['data: invalid\n\n', /AI_RETRYABLE_502/], [event({ choices: [{ finish_reason: "error" }] }), /AI_ERROR_502/]] as const) {
    await assert.rejects(readProviderCompletion(stream(event({ choices: [{ delta: { content: "local code=true" } }] }) + ending), "free/test"), reason);
  }
});

test("non-streaming provider JSON remains supported with truncation metadata", async () => {
  assert.deepEqual(await readProviderCompletion(Response.json({ model: "old/free", choices: [{ message: { content: " full output " }, finish_reason: "stop" }] }), "default"), { content: "full output", model: "old/free", incomplete: false });
  assert.equal((await readProviderCompletion(Response.json({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), "default")).incomplete, true);
});

test("a JSON provider error cannot accept a preceding plausible script", async () => {
  await assert.rejects(readProviderCompletion(Response.json({ choices: [{ message: { content: 'local ui=Instance.new("ScreenGui")' }, finish_reason: "error" }] }), "default"), /AI_ERROR_502/);
  await assert.rejects(readProviderCompletion(Response.json({ error: { code: 429 } }), "default"), /RATE_LIMITED/);
});

test("JSON without completion metadata cannot claim complete output", async () => {
  assert.equal((await readProviderCompletion(Response.json({ choices: [{ message: { content: 'local ui=Instance.new("ScreenGui")' } }] }), "default")).incomplete, true);
});
