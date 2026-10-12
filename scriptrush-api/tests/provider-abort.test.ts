import test from "node:test";
import assert from "node:assert/strict";
import { providerDelay, throwIfCallerAborted, withProviderAbort } from "../src/lib/provider-abort.ts";
import { readProviderCompletion } from "../src/lib/provider-response.ts";

const isCallerAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError" && error.message === "Generation stopped.";
const waitForAbort = (signal: AbortSignal): Promise<never> => new Promise((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("an already cancelled caller never starts a provider operation or delay", async () => {
  const caller = new AbortController();
  caller.abort(new Error("private caller reason"));
  let calls = 0;
  assert.throws(() => throwIfCallerAborted(caller.signal), isCallerAbort);
  await assert.rejects(withProviderAbort(1000, caller.signal, async () => { calls++; return "unused"; }), isCallerAbort);
  await assert.rejects(providerDelay(60_000, caller.signal), isCallerAbort);
  assert.equal(calls, 0);
});

test("caller cancellation reaches an in-flight provider operation and remains AbortError", async () => {
  const caller = new AbortController();
  const response = withProviderAbort(60_000, caller.signal, waitForAbort);
  caller.abort(new Error("private caller reason"));
  await assert.rejects(response, isCallerAbort);
});

test("provider timeout is AI_TIMEOUT and remains distinct from caller cancellation", async () => {
  const caller = new AbortController();
  await assert.rejects(withProviderAbort(5, caller.signal, waitForAbort), /^Error: AI_TIMEOUT$/);
  assert.equal(caller.signal.aborted, false);
});

test("caller cancellation also interrupts response consumption after headers", async () => {
  const caller = new AbortController();
  let headersReceived = false;
  const response = withProviderAbort(60_000, caller.signal, async signal => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial script"}}]}\n\n'));
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    headersReceived = true;
    return readProviderCompletion(new Response(stream, { headers: { "content-type": "text/event-stream" } }), "test-model");
  });
  assert.equal(headersReceived, true);
  caller.abort();
  await assert.rejects(response, isCallerAbort);
});

test("cancellation during capacity or transport backoff prevents the following attempt", async () => {
  for (const delay of [350, 1200, 60_000]) {
    const caller = new AbortController();
    let attempts = 1;
    const retry = (async () => { await providerDelay(delay, caller.signal); attempts++; })();
    caller.abort();
    await assert.rejects(retry, isCallerAbort);
    assert.equal(attempts, 1);
  }
});

test("completed operations clear provider timeout and preserve ordinary provider failures", async () => {
  let passedSignal: AbortSignal | undefined;
  assert.equal(await withProviderAbort(5, undefined, async signal => { passedSignal = signal; return "complete"; }), "complete");
  await providerDelay(10);
  assert.equal(passedSignal?.aborted, false, "the completed request's timeout must be cleared");
  const failure = new Error("AI_RETRYABLE_502");
  await assert.rejects(withProviderAbort(1000, undefined, async () => { throw failure; }), error => error === failure);
});

test("a provider operation cannot return a completed result after caller cancellation", async () => {
  const caller = new AbortController();
  await assert.rejects(withProviderAbort(1000, caller.signal, async () => { caller.abort(); return "stale completion"; }), isCallerAbort);
});
