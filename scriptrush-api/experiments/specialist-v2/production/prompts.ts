/** Capture the real writer stage locally. No copied prompt format, credentials or network requests. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateCompleteScript } from "../../../src/lib/generation.ts";
import { PLANNER_SYSTEM } from "../../../src/lib/generation-contract.ts";
import { HUB_COMPOSER_SYSTEM } from "../../../src/lib/hub-spec.ts";
import { createProviderRunner } from "../../../src/lib/provider-client.ts";
import { buildProductionFixtures, type ProductionFixture, type ProductionCase, type ProductionMessage } from "./fixtures.ts";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const SOURCE_FILES = ["generation.ts", "generation-contract.ts", "hub-spec.ts", "hub-composer.ts", "provider-client.ts", "provider-config.ts", "ui-language.ts", "a7dev-generation-guide.ts", "game-actions.ts", "game-adapters/catalog.ts", "game-adapters/blox-fruits-runtime.ts", "game-adapters/blox-fruits-quest-data.ts"];

export async function sourceSnapshot(): Promise<Record<string, string>> {
  const entries = await Promise.all(SOURCE_FILES.map(async name => [name, sha256(await readFile(new URL(`../../../src/lib/${name}`, import.meta.url), "utf8"))] as const));
  return Object.fromEntries(entries);
}

export type ComposerRequestCapture = {
  messages: ProductionMessage[];
  writerBudget: { maxTokens: number; timeoutMs: number; attempts: number };
  providerParameters: { temperature: number; max_tokens: number; stream: boolean; thinking: { type: string }; response_format: { type: string } };
};

export async function captureComposerRequest(fixture: ProductionFixture): Promise<ComposerRequestCapture> {
  let captured: ProductionMessage[] | undefined;
  let writerBudget: ComposerRequestCapture["writerBudget"] | undefined;
  let calls = 0;
  const controller = new AbortController();
  try {
    await generateCompleteScript({ ...fixture.context, signal: controller.signal }, async (system, user, maxTokens, budget) => {
      calls++;
      if (calls === 1 && system === PLANNER_SYSTEM) return { content: JSON.stringify(fixture.expected.contract), model: "local-reference-planner", incomplete: false };
      if (calls !== 2 || system !== HUB_COMPOSER_SYSTEM) throw new Error("Unexpected production stage during prompt capture");
      captured = [{ role: "system", content: system }, { role: "user", content: user }];
      writerBudget = { maxTokens, timeoutMs: budget.timeoutMs, attempts: budget.attempts };
      controller.abort(new DOMException("Writer capture complete; inference intentionally omitted", "AbortError"));
      controller.signal.throwIfAborted();
      throw new Error("Unreachable capture state");
    }, Date.now() + 300_000);
  } catch (error) {
    if (!controller.signal.aborted || !captured || !(error instanceof Error) || error.name !== "AbortError") throw error;
  }
  if (!captured || !writerBudget || calls !== 2) throw new Error("Request bypassed the production composer; it cannot serve as a writer benchmark");
  // The actual provider adds its JSON-value reminder. Capture that transformation
  // through its injected inert transport instead of reimplementing it here.
  let wireMessages: ProductionMessage[] | undefined;
  let providerParameters: ComposerRequestCapture["providerParameters"] | undefined;
  let inertCalls = 0;
  const runModel = createProviderRunner({ providers: () => [{ name: "apinex", endpoint: "https://benchmark.invalid/no-network", model: "local-prompt-capture", key: "inert-fixture-only" }], fetch: async (_input, init) => {
    inertCalls++;
    const body = JSON.parse(String(init?.body));
    wireMessages = body.messages;
    providerParameters = { temperature: body.temperature, max_tokens: body.max_tokens, stream: body.stream, thinking: body.thinking, response_format: body.response_format };
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], model: "local-prompt-capture" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  await runModel(captured[0].content, captured[1].content, writerBudget.maxTokens, { attempts: writerBudget.attempts, timeoutMs: writerBudget.timeoutMs, deadlineMs: Date.now() + writerBudget.timeoutMs + 1000 });
  if (inertCalls !== 1 || !wireMessages || wireMessages.length !== 2 || !providerParameters) throw new Error("Inert production transport did not capture one writer message pair");
  return { messages: wireMessages, writerBudget, providerParameters };
}

export async function captureComposerMessages(fixture: ProductionFixture): Promise<ProductionMessage[]> {
  return (await captureComposerRequest(fixture)).messages;
}

export async function buildProductionCases(): Promise<ProductionCase[]> {
  const sourceSha256 = await sourceSnapshot();
  const cases: ProductionCase[] = [];
  // Sequential capture keeps each AbortController and stage history isolated.
  for (const fixture of buildProductionFixtures()) {
    const messages = await captureComposerMessages(fixture);
    cases.push({ ...fixture, messages, provenance: { capture: "generateCompleteScript + createProviderRunner(inert fetch)", promptSha256: sha256(JSON.stringify(messages)), sourceSha256, planner: "reference contract supplied locally; planner not evaluated", networkCalls: 0, trainingUse: "excluded" } });
  }
  return cases;
}

export const productionSourceRoot = fileURLToPath(new URL("../../../src/lib/", import.meta.url));
