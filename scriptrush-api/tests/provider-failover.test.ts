import assert from "node:assert/strict";
import test from "node:test";
import { executeProviderChain, MAX_PROVIDER_HOPS, ProviderCooldowns, ProviderUnavailableError } from "../src/lib/provider-failover.ts";

const providers = [{ id: "primary", key: "private-primary" }, { id: "secondary", key: "private-secondary" }];
const quota = () => new ProviderUnavailableError("quota", { status: 429 });
const callerAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError" && error.message === "Generation stopped.";

test("quota fallback sends the same complete stage once to each provider and returns only the successful output", async () => {
  const prompt = "Full requirements and existing script remain intact.";
  const observed: Array<{ id: string; prompt: string; deadline: number; remaining: number; attempt: number }> = [];
  const accounting: string[] = [];
  const deadlineMs = Date.now() + 10_000;
  const result = await executeProviderChain(providers, {
    deadlineMs,
    onAttempt: (id, attempt) => accounting.push(`${attempt}:${id}`),
    operation: async (provider, budget) => {
      observed.push({ id: provider.id, prompt, deadline: budget.deadlineMs, remaining: budget.remainingMs, attempt: budget.attempt });
      if (provider.id === "primary") throw quota();
      return { content: "complete output", model: "secondary-model" };
    },
  });
  assert.deepEqual(result, { value: { content: "complete output", model: "secondary-model" }, providerId: "secondary", attempts: ["primary", "secondary"] });
  assert.deepEqual(accounting, ["1:primary", "2:secondary"]);
  assert.equal(observed.length, 2);
  assert.ok(observed.every(value => value.prompt === prompt && value.deadline === deadlineMs && value.remaining <= 10_000 && value.remaining > 0));
  assert.deepEqual(observed.map(value => value.attempt), [1, 2]);
  assert.doesNotMatch(JSON.stringify(result), /private-/);
});

test("explicit quota, capacity, timeout, upstream and network failures can switch", async () => {
  const errors = [quota(), new ProviderUnavailableError("quota", { status: 402 }), new ProviderUnavailableError("capacity", { status: 429 }), new ProviderUnavailableError("capacity", { status: 503 }), new ProviderUnavailableError("timeout"), new ProviderUnavailableError("upstream", { status: 502 }), new ProviderUnavailableError("network")];
  for (const error of errors) {
    let calls = 0;
    const result = await executeProviderChain(providers, { deadlineMs: Date.now() + 10_000, operation: async () => { calls++; if (calls === 1) throw error; return "complete"; } });
    assert.equal(result.value, "complete");
    assert.equal(calls, 2);
  }
});

test("malformed output, arbitrary error text and nonretryable status never trigger a fallback", async () => {
  const errors = [new SyntaxError("Malformed provider output"), new Error("RATE_LIMITED"), new TypeError("fetch failed"), new ProviderUnavailableError("quota", { status: 401 }), new ProviderUnavailableError("capacity", { status: 403 }), new ProviderUnavailableError("upstream", { status: 400 }), new ProviderUnavailableError("upstream")];
  for (const error of errors) {
    let calls = 0;
    await assert.rejects(executeProviderChain(providers, { deadlineMs: Date.now() + 10_000, operation: async () => { calls++; throw error; } }), value => value === error);
    assert.equal(calls, 1);
  }
});

test("a successful but incomplete completion remains an implementation concern, never a hidden second charge", async () => {
  let calls = 0;
  const result = await executeProviderChain(providers, { deadlineMs: Date.now() + 10_000, operation: async () => { calls++; return { content: "partial", incomplete: true }; } });
  assert.deepEqual(result.value, { content: "partial", incomplete: true });
  assert.equal(calls, 1);
});

test("all unavailable providers are tried once and the last classified failure is preserved", async () => {
  const first = quota(), last = new ProviderUnavailableError("upstream", { status: 503 });
  const calls: string[] = [];
  await assert.rejects(executeProviderChain(providers, { deadlineMs: Date.now() + 10_000, operation: async provider => { calls.push(provider.id); throw provider.id === "primary" ? first : last; } }), error => error === last);
  assert.deepEqual(calls, ["primary", "secondary"]);
});

test("provider IDs are deduplicated and the hop count is bounded", async () => {
  const chain = [providers[0], providers[0], ...Array.from({ length: 12 }, (_, index) => ({ id: `route${index}`, key: "private" }))];
  const calls: string[] = [];
  await assert.rejects(executeProviderChain(chain, { deadlineMs: Date.now() + 10_000, operation: async provider => { calls.push(provider.id); throw quota(); } }), /RATE_LIMITED/);
  assert.equal(calls.length, MAX_PROVIDER_HOPS);
  assert.equal(new Set(calls).size, MAX_PROVIDER_HOPS);
});

test("invalid or empty configuration is rejected without sending a request", async () => {
  let calls = 0;
  for (const chain of [[], [{ id: "https://private-credential.example" }]]) {
    await assert.rejects(executeProviderChain(chain, { deadlineMs: Date.now() + 10_000, operation: async () => { calls++; return "unused"; } }), /AI_NOT_CONFIGURED|INVALID_PROVIDER_CONFIGURATION/);
  }
  assert.equal(calls, 0);
});

test("the original deadline is preserved, and exhausted time prevents the next provider", async () => {
  let nowMs = 1000;
  const calls: string[] = [];
  await assert.rejects(executeProviderChain(providers, { deadlineMs: 5000, now: () => nowMs, operation: async provider => { calls.push(provider.id); nowMs = 4500; throw quota(); } }), /^Error: AI_TIMEOUT$/);
  assert.deepEqual(calls, ["primary"]);
  for (const deadlineMs of [NaN, Infinity, 999, 1000]) {
    await assert.rejects(executeProviderChain(providers, { deadlineMs, now: () => 1000, operation: async () => { throw new Error("must not run"); } }), /^Error: AI_TIMEOUT$/);
  }
});

test("caller cancellation before a request and between providers prevents further calls", async () => {
  for (const initiallyAborted of [true, false]) {
    const caller = new AbortController();
    if (initiallyAborted) caller.abort(new Error("private reason"));
    let calls = 0;
    await assert.rejects(executeProviderChain(providers, { signal: caller.signal, deadlineMs: Date.now() + 10_000, operation: async () => { calls++; caller.abort(new Error("private reason")); throw quota(); } }), callerAbort);
    assert.equal(calls, initiallyAborted ? 0 : 1);
  }
});

test("caller cancellation reaches in-flight response consumption and cannot become fallback or success", async () => {
  const caller = new AbortController();
  let calls = 0;
  const pending = executeProviderChain(providers, { signal: caller.signal, deadlineMs: Date.now() + 10_000, operation: async (_provider, { signal }) => {
    calls++;
    return new Promise<string>((_resolve, reject) => signal.addEventListener("abort", () => reject(new ProviderUnavailableError("network")), { once: true }));
  } });
  caller.abort();
  await assert.rejects(pending, callerAbort);
  assert.equal(calls, 1);
  const staleCaller = new AbortController();
  await assert.rejects(executeProviderChain(providers, { signal: staleCaller.signal, deadlineMs: Date.now() + 10_000, operation: async () => { staleCaller.abort(); return "stale output"; } }), callerAbort);
});

test("quota cooldown skips repeated probes in one process and retries the primary after reset", async () => {
  const cooldowns = new ProviderCooldowns();
  let nowMs = 1000;
  const observed: string[] = [];
  const run = () => executeProviderChain(providers, { cooldowns, now: () => nowMs, deadlineMs: nowMs + 10_000, operation: async provider => {
    observed.push(provider.id);
    if (provider.id === "primary" && nowMs < 6000) throw new ProviderUnavailableError("quota", { status: 429, resetAtMs: 6000 });
    return provider.id;
  } });
  assert.equal((await run()).value, "secondary");
  assert.equal((await run()).value, "secondary");
  nowMs = 6000;
  assert.equal((await run()).value, "primary");
  assert.deepEqual(observed, ["primary", "secondary", "secondary", "primary"]);
  assert.equal(cooldowns.size, 0);
});

test("Retry-After seconds and dates affect cooldown without sleeping away the fallback budget", async () => {
  const nowMs = Date.parse("2026-10-13T12:00:00Z");
  for (const retryAfter of ["30", "Tue, 13 Oct 2026 12:00:30 GMT"]) {
    const cooldowns = new ProviderCooldowns();
    const result = await executeProviderChain(providers, { cooldowns, now: () => nowMs, deadlineMs: nowMs + 10_000, operation: async provider => {
      if (provider.id === "primary") throw new ProviderUnavailableError("capacity", { status: 429, retryAfter });
      return "complete";
    } });
    assert.equal(result.providerId, "secondary");
    assert.equal(cooldowns.availableAt("primary", nowMs), nowMs + 30_000);
  }
});

test("all providers cooling down fail without calls and report the earliest known reset", async () => {
  const cooldowns = new ProviderCooldowns();
  cooldowns.set("primary", 6000, 1000); cooldowns.set("secondary", 9000, 1000);
  let calls = 0;
  await assert.rejects(executeProviderChain(providers, { cooldowns, now: () => 1000, deadlineMs: 10_000, operation: async () => { calls++; return "unused"; } }), error => error instanceof ProviderUnavailableError && error.reason === "capacity" && error.resetAtMs === 6000);
  assert.equal(calls, 0);
});

test("cooldowns expire, reject malformed resets, and bound memory and maximum suppression", () => {
  const cooldowns = new ProviderCooldowns(2);
  cooldowns.set("invalid", Infinity, 1000); cooldowns.set("past", 900, 1000);
  assert.equal(cooldowns.size, 0);
  cooldowns.set("first", 2000, 1000); cooldowns.set("second", 3000, 1000); cooldowns.set("third", 4000, 1000);
  assert.equal(cooldowns.size, 2);
  assert.equal(cooldowns.availableAt("first", 1000), null);
  assert.equal(cooldowns.availableAt("second", 3000), null);
  cooldowns.set("long", 1000 + 100 * 24 * 60 * 60 * 1000, 1000);
  assert.equal(cooldowns.availableAt("long", 1000), 1000 + 24 * 60 * 60 * 1000);
  cooldowns.clear("long");
  assert.equal(cooldowns.availableAt("long", 1000), null);
});
