import assert from "node:assert/strict";
import test from "node:test";
import { PLANNER_SYSTEM } from "../src/lib/generation-contract.ts";
import { createProviderRunner, providerAttemptCount } from "../src/lib/provider-client.ts";
import type { ProviderConfig } from "../src/lib/provider-config.ts";
import { selectProviders } from "../src/lib/provider-config.ts";
import { ProviderCooldowns } from "../src/lib/provider-failover.ts";

const routes: ProviderConfig[] = [
  { name: "apinex", endpoint: "https://api.apinex.bond/v1/chat/completions", model: "free/test-primary", key: "dummy-primary-key" },
  { name: "openrouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "test/secondary:free", key: "dummy-secondary-key" },
];
type SentRequest = { url: string; init: RequestInit; body: Record<string, unknown> };

function mockTransport(handler: (request: SentRequest, index: number) => Response | Promise<Response>) {
  const requests: SentRequest[] = [];
  const fetcher: typeof globalThis.fetch = async (input, init = {}) => {
    const request = { url: input instanceof Request ? input.url : String(input), init, body: JSON.parse(String(init.body || "{}")) as Record<string, unknown> };
    requests.push(request);
    return handler(request, requests.length);
  };
  return { fetcher, requests };
}

function complete(content = "complete output", model = "mock-model", finishReason = "stop") {
  return Response.json({ model, choices: [{ message: { content }, finish_reason: finishReason }] });
}
function sse(data: string) { return new Response(data, { headers: { "content-type": "text/event-stream" } }); }
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try { await promise; } catch (error) { return error; }
  throw new Error("Expected provider rejection");
}

test("HTTP quota fallback preserves full requirements and output budget, binds each key to its own origin, and counts actual calls", async () => {
  for (const status of [429, 402]) {
    const transport = mockTransport((_request, index) => index === 1
      ? Response.json({ error: { message: "quota exhausted" } }, { status, headers: { "retry-after": "30" } })
      : complete("full secondary output", "secondary-returned-model"));
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const prompt = "Original complete request\nAll features, requested UI and prior working script must survive.";
    const result = await run(PLANNER_SYSTEM, prompt, 14_000, { timeoutMs: 10_000, attempts: 1 });
    assert.equal(result.content, "full secondary output");
    assert.equal(result.model, "secondary-returned-model");
    assert.equal(result.provider, "openrouter");
    assert.equal(result.attempts, 2);
    assert.equal(transport.requests.length, 2);
    for (const [index, request] of transport.requests.entries()) {
      assert.equal(request.url, routes[index].endpoint);
      assert.equal(new Headers(request.init.headers).get("authorization"), `Bearer ${routes[index].key}`);
      assert.equal(request.body.max_tokens, 14_000);
      const messages = request.body.messages as Array<{ role: string; content: string }>;
      assert.equal(messages[1].content, prompt);
      assert.ok(messages[0].content.startsWith(PLANNER_SYSTEM));
    }
    assert.deepEqual(transport.requests[0].body.response_format, { type: "json_object" });
    assert.equal(transport.requests[0].body.stream, true);
    assert.deepEqual(transport.requests[0].body.thinking, { type: "disabled" });
    assert.equal(transport.requests[1].body.stream, undefined);
    assert.equal(transport.requests[1].body.thinking, undefined);
    assert.doesNotMatch(JSON.stringify(result), /dummy-primary-key|dummy-secondary-key/);
  }
});

test("successful primary request uses one HTTP call and returns provider identity", async () => {
  const transport = mockTransport(() => complete());
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const result = await run("Write one complete script", "preserve all instructions", 8000, { timeoutMs: 10_000 });
  assert.equal(result.provider, "apinex");
  assert.equal(result.attempts, 1);
  assert.equal(result.incomplete, false);
  assert.equal(transport.requests.length, 1);
});

test("bad requests and authorization failures never send the prompt to a fallback", async () => {
  for (const status of [400, 401, 403, 404]) {
    const transport = mockTransport(() => Response.json({ error: { message: "private provider detail" } }, { status }));
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000 }));
    assert.equal(providerAttemptCount(error), 1);
    assert.equal(transport.requests.length, 1);
    assert.doesNotMatch(String(error), /private provider detail|dummy-/);
  }
});

test("malformed JSON and empty model output are rejected without a hidden additional charge", async () => {
  for (const response of [new Response("not valid JSON", { headers: { "content-type": "application/json" } }), complete(" ")]) {
    const transport = mockTransport(() => response);
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000 }));
    assert.equal(providerAttemptCount(error), 1);
    assert.equal(transport.requests.length, 1);
  }
});

test("incomplete output remains marked incomplete and never triggers automatic provider replacement", async () => {
  for (const response of [complete("partial output", "partial-model", "length"), Response.json({ choices: [{ message: { content: "partial without completion metadata" } }] })]) {
    const transport = mockTransport(() => response);
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const result = await run("Write script", "complete prompt", 14_000, { timeoutMs: 10_000 });
    assert.equal(result.incomplete, true);
    assert.equal(result.attempts, 1);
    assert.equal(transport.requests.length, 1);
  }
});

test("primary cooldown prevents repeated quota probes and counts only the secondary request", async () => {
  const transport = mockTransport(request => request.url === routes[0].endpoint
    ? Response.json({ error: { message: "quota exhausted" } }, { status: 429, headers: { "retry-after": "60" } })
    : complete());
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher, cooldowns: new ProviderCooldowns() });
  assert.equal((await run("Write script", "first request", 8000, { timeoutMs: 10_000 })).attempts, 2);
  const next = await run("Write script", "second request", 8000, { timeoutMs: 10_000 });
  assert.equal(next.provider, "openrouter");
  assert.equal(next.attempts, 1);
  assert.deepEqual(transport.requests.map(request => request.url), [routes[0].endpoint, routes[1].endpoint, routes[1].endpoint]);
});

test("all-provider failures report actual attempts, then a fully cooling chain reports zero requests", async () => {
  const transport = mockTransport(() => Response.json({ error: { message: "daily quota exhausted" } }, { status: 429, headers: { "retry-after": "60" } }));
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher, cooldowns: new ProviderCooldowns() });
  const first = await rejected(run("Write script", "first request", 8000, { timeoutMs: 10_000 }));
  assert.equal(providerAttemptCount(first), 2);
  assert.equal(transport.requests.length, 2);
  const next = await rejected(run("Write script", "second request", 8000, { timeoutMs: 10_000 }));
  assert.equal(providerAttemptCount(next), 0);
  assert.equal(transport.requests.length, 2);
});

test("only the supplied provider is ever called; no alternate is implicitly activated", async () => {
  const transport = mockTransport(() => Response.json({ error: { message: "quota exhausted" } }, { status: 429 }));
  const run = createProviderRunner({ providers: () => [routes[0]], fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000, attempts: 8 }));
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].url, routes[0].endpoint);
});

test("network failure and HTTP upstream failure can use one configured fallback", async () => {
  for (const failure of ["network", "upstream"]) {
    const transport = mockTransport((_request, index) => {
      if (index === 1) {
        if (failure === "network") throw new TypeError("fetch failed");
        return Response.json({ error: { message: "temporary outage" } }, { status: 503 });
      }
      return complete("secondary output");
    });
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const result = await run("Write script", "complete prompt", 8000, { timeoutMs: 10_000 });
    assert.equal(result.content, "secondary output");
    assert.equal(result.attempts, 2);
    assert.equal(transport.requests.length, 2);
  }
});

test("SSE quota error discards preceding partial output and retries the same complete stage on the secondary", async () => {
  const transport = mockTransport((_request, index) => index === 1
    ? sse(event({ choices: [{ delta: { content: "discard this partial prefix" } }] }) + event({ error: { code: 429, message: "quota exhausted" } }))
    : complete("entire secondary output"));
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const result = await run("Write script", "full original user prompt", 14_000, { timeoutMs: 10_000 });
  assert.equal(result.content, "entire secondary output");
  assert.doesNotMatch(result.content, /discard/);
  assert.equal(result.attempts, 2);
  assert.equal(transport.requests.length, 2);
});

test("malformed SSE is a protocol failure and never requests a second paid completion", async () => {
  const transport = mockTransport(() => sse(event({ choices: [{ delta: { content: "plausible partial script" } }] }) + "data: invalid JSON\n\n"));
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000 }));
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
});

test("caller cancellation before a request reports zero actual attempts", async () => {
  const transport = mockTransport(() => complete());
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const caller = new AbortController(); caller.abort(new Error("private cancellation reason"));
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000, signal: caller.signal }));
  assert.equal((error as Error).name, "AbortError");
  assert.equal(providerAttemptCount(error), 0);
  assert.equal(transport.requests.length, 0);
  assert.doesNotMatch(String(error), /private cancellation reason/);
});

test("caller cancellation during fetch aborts transport and never switches providers", async () => {
  let started!: () => void;
  const fetchStarted = new Promise<void>(resolve => { started = resolve; });
  const transport = mockTransport(request => new Promise<Response>((_resolve, reject) => {
    const signal = request.init.signal!;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    started();
  }));
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const caller = new AbortController();
  const pending = run("Write script", "complete prompt", 8000, { timeoutMs: 10_000, signal: caller.signal });
  await fetchStarted; caller.abort(new Error("private cancellation reason"));
  const error = await rejected(pending);
  assert.equal((error as Error).name, "AbortError");
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].init.signal!.aborted, true);
});

test("caller cancellation during SSE consumption rejects partial output without fallback", async () => {
  let started!: () => void;
  const streamStarted = new Promise<void>(resolve => { started = resolve; });
  const transport = mockTransport(request => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(event({ choices: [{ delta: { content: "partial output" } }] })));
    request.init.signal!.addEventListener("abort", () => controller.error(request.init.signal!.reason), { once: true });
    started();
  } }), { headers: { "content-type": "text/event-stream" } }));
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const caller = new AbortController();
  const pending = run("Write script", "complete prompt", 8000, { timeoutMs: 10_000, signal: caller.signal });
  await streamStarted; caller.abort();
  const error = await rejected(pending);
  assert.equal((error as Error).name, "AbortError");
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
});

test("an exhausted original deadline sends no provider request", async () => {
  const transport = mockTransport(() => complete());
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000, deadlineMs: Date.now() - 1 }));
  assert.equal(providerAttemptCount(error), 0);
  assert.equal(transport.requests.length, 0);
  assert.match(String(error), /AI_TIMEOUT/);
});

test("a primary timeout leaves enough of the same stage deadline for the configured secondary", { timeout: 7000 }, async () => {
  const transport = mockTransport((request, index) => {
    if (index > 1) return complete("complete after primary timeout");
    return new Promise<Response>((_resolve, reject) => request.init.signal!.addEventListener("abort", () => reject(request.init.signal!.reason), { once: true }));
  });
  const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
  const result = await run("Write script", "full original prompt", 14_000, { timeoutMs: 4000, deadlineMs: Date.now() + 4000 });
  assert.equal(result.provider, "openrouter");
  assert.equal(result.content, "complete after primary timeout");
  assert.equal(result.attempts, 2);
  assert.equal(transport.requests.length, 2);
  assert.equal(transport.requests[0].init.signal!.aborted, true);
  assert.equal(transport.requests[1].body.max_tokens, 14_000);
});

test("unknown errors have no fabricated provider attempt metadata", () => {
  assert.equal(providerAttemptCount(new Error("ordinary error")), undefined);
  assert.equal(providerAttemptCount(null), undefined);
});

test("semantic finish reasons and unclassified credential errors never trigger another provider", async () => {
  for (const response of [
    complete("filtered output", "mock", "content_filter"),
    complete("unexpected tool result", "mock", "tool_calls"),
    Response.json({ error: { code: "invalid_api_key" } }),
    Response.json({ error: { message: "unknown provider failure" } }),
    sse(event({ choices: [{ delta: { content: "discard" }, finish_reason: "content_filter" }] })),
    sse(event({ error: { code: "invalid_api_key" } })),
  ]) {
    const transport = mockTransport(() => response);
    const run = createProviderRunner({ providers: () => routes, fetch: transport.fetcher });
    const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 10_000 }));
    assert.equal(providerAttemptCount(error), 1);
    assert.equal(transport.requests.length, 1);
    assert.match(String(error), /AI_ERROR_502/);
  }
});

test("a single provider preserves one bounded explicit minute-reset retry with accurate accounting", async () => {
  const transport = mockTransport((_request, index) => index === 1
    ? Response.json({ error: { message: "per-minute limit reached" } }, { status: 429, headers: { "retry-after": "0" } })
    : complete("complete same-stage output"));
  const run = createProviderRunner({ providers: () => [routes[0]], fetch: transport.fetcher });
  const result = await run("Write script", "complete unchanged prompt", 14_000, { timeoutMs: 4000 });
  assert.equal(result.attempts, 2);
  assert.equal(transport.requests.length, 2);
  assert.deepEqual(transport.requests[0].body, transport.requests[1].body);
  assert.equal(result.content, "complete same-stage output");
});

test("daily and monthly quota limits never wait or retry even with a short reset header", async () => {
  for (const message of ["daily quota exhausted", "monthly quota exhausted"]) {
    const transport = mockTransport(() => Response.json({ error: { message } }, { status: 429, headers: { "retry-after": "0" } }));
    const run = createProviderRunner({ providers: () => [routes[0]], fetch: transport.fetcher });
    const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 4000 }));
    assert.equal(providerAttemptCount(error), 1);
    assert.equal(transport.requests.length, 1);
  }
});

test("single-provider minute recovery cannot loop after its one allowed retry", async () => {
  const transport = mockTransport(() => Response.json({ error: { message: "per-minute limit" } }, { status: 429, headers: { "retry-after": "0" } }));
  const run = createProviderRunner({ providers: () => [routes[0]], fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 4000 }));
  assert.equal(providerAttemptCount(error), 2);
  assert.equal(transport.requests.length, 2);
});

test("caller cancellation during minute-reset wait prevents its second request", async () => {
  const caller = new AbortController();
  const transport = mockTransport(() => {
    setTimeout(() => caller.abort(), 20);
    return Response.json({ error: { message: "per-minute limit" } }, { status: 429, headers: { "retry-after": "0" } });
  });
  const run = createProviderRunner({ providers: () => [routes[0]], fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 4000, signal: caller.signal }));
  assert.equal((error as Error).name, "AbortError");
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
});

test("the actual configured chain enables the free Novita route only after an APInex limit", async () => {
  const configured = selectProviders({ APINEX_API_KEY: "dummy-primary-key", OPENROUTER_API_KEY: "dummy-secondary-key" });
  const transport = mockTransport((_request, index) => index === 1 ? Response.json({ error: { message: "daily quota exhausted" } }, { status: 429 }) : complete());
  const run = createProviderRunner({ providers: () => configured, fetch: transport.fetcher });
  const result = await run(PLANNER_SYSTEM, "all requested UI and features", 14_000, { timeoutMs: 10_000 });
  assert.equal(result.provider, "openrouter");
  assert.equal(result.attempts, 2);
  assert.equal(transport.requests[1].body.model, "apodex/apodex-1.1-mini:free");
  assert.deepEqual(transport.requests[1].body.provider, { only: ["novita"], require_parameters: true, allow_fallbacks: false, max_price: { prompt: 0, completion: 0 } });
  assert.deepEqual(transport.requests[1].body.response_format, { type: "json_object" });
  assert.match((transport.requests[1].body.messages as Array<{ content: string }>)[0].content, /Return the actual value object/);
  assert.equal(transport.requests[1].body.models, undefined);
  assert.equal(transport.requests[1].body.plugins, undefined);
});

test("request-format diagnostics contain fixed flags and never upstream text or credentials", async context => {
  const diagnostic = context.mock.method(console, "warn", () => {});
  const transport = mockTransport(() => Response.json({ error: {
    message: "Model does not support json_schema private-user-prompt dummy-secondary-key",
    metadata: { raw: "private-provider-response dummy-primary-key" },
  } }, { status: 400 }));
  const run = createProviderRunner({ providers: () => [routes[1]], fetch: transport.fetcher });
  const error = await rejected(run(PLANNER_SYSTEM, "private-user-prompt", 8000, { timeoutMs: 4000 }));
  assert.equal(providerAttemptCount(error), 1);
  assert.equal(transport.requests.length, 1);
  assert.equal(diagnostic.mock.callCount(), 1);
  const [label, flags] = diagnostic.mock.calls[0].arguments;
  assert.equal(label, "[provider-request-format]");
  assert.deepEqual(JSON.parse(String(flags)), {
    provider: "openrouter", status: 400, reasoning: false, schema: true, routing: true,
    parameters: false, model: true, price: false, unsupported: true,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic.mock.calls[0].arguments), /private-|dummy-/);
});

test("a paid OpenRouter model is refused before making an HTTP request", async () => {
  const transport = mockTransport(() => complete());
  const run = createProviderRunner({ providers: () => [{ ...routes[1], model: "apodex/apodex-1.1-mini" }], fetch: transport.fetcher });
  const error = await rejected(run("Write script", "complete prompt", 8000, { timeoutMs: 4000 }));
  assert.match(String(error), /INVALID_PROVIDER_CONFIGURATION/);
  assert.equal(providerAttemptCount(error), 0);
  assert.equal(transport.requests.length, 0);
});

test("the platform reset header suppresses further exhausted-provider probes until its known reset", async () => {
  const cooldowns = new ProviderCooldowns();
  const resetAtMs = Math.floor(Date.now() / 1000) * 1000 + 120_000;
  const transport = mockTransport(() => Response.json({ error: { message: "daily request limit" } }, { status: 429, headers: { "x-ratelimit-reset": String(resetAtMs) } }));
  const run = createProviderRunner({ providers: () => [routes[1]], fetch: transport.fetcher, cooldowns });
  await rejected(run("Write script", "first prompt", 8000, { timeoutMs: 4000 }));
  assert.equal(cooldowns.availableAt("openrouter", Date.now()), resetAtMs);
  const error = await rejected(run("Write script", "second prompt", 8000, { timeoutMs: 4000 }));
  assert.equal(providerAttemptCount(error), 0);
  assert.equal(transport.requests.length, 1);
});
