import "server-only";
import { generationResponseFormat } from "./generation-contract.ts";
import { HUB_COMPOSER_SYSTEM, hubCompositionJsonSchema } from "./hub-spec.ts";
import { selectProvider, type ProviderConfig } from "./provider-config.ts";
import { readProviderCompletion } from "./provider-response.ts";
import { capacityRetryDelay } from "./provider-capacity.ts";

type ProviderResult = { content: string; model: string; incomplete: boolean };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
class CapacityError extends Error {
  constructor(readonly retryAfter: string | null, readonly dailyLimit: boolean) { super("RATE_LIMITED"); }
}

function compactStage(system: string) {
  const value = system.toLowerCase();
  return /\b(plan|planner|review|reviewer|critic|audit|json only|analyse|analyze)\b/.test(value)
    && !/fenced lua|executor-ready|full corrected script|one self-contained|luau script/.test(value);
}

async function requestOnce(provider: ProviderConfig, system: string, user: string, maxTokens: number, timeoutMs: number): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const schemaFormat = system.startsWith(HUB_COMPOSER_SYSTEM)
      ? { type: "json_schema", json_schema: { name: "hub_composition", strict: true, schema: hubCompositionJsonSchema } }
      : generationResponseFormat(system);
    // APInex forwards portable JSON mode reliably; its schema passthrough may
    // echo a schema wrapper instead of the values. Validate values locally.
    const responseFormat = schemaFormat && provider.name === "apinex" ? { type: "json_object" } : schemaFormat || (compactStage(system) ? { type: "json_object" } : null);
    const instructions = system + (responseFormat && provider.name === "apinex" ? "\nReturn the actual value object in the exact shape shown above. Never return a JSON schema or wrap the values in properties/type/required." : "");
    const response = await fetch(provider.endpoint, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}`, ...(provider.name === "openrouter" ? { "X-Title": "ScriptRush" } : {}) },
      // Use streaming to keep APInex's upstream proxy active on large scripts.
      body: JSON.stringify({ model: provider.model, temperature: responseFormat ? 0.1 : 0.25, max_tokens: maxTokens, ...(provider.name === "apinex" ? { stream: true, thinking: { type: "disabled" } } : { reasoning: { enabled: false } }), ...(responseFormat ? { response_format: responseFormat } : {}), messages: [{ role: "system", content: instructions }, { role: "user", content: user }] }),
    });
    if (!response.ok) {
      if (response.status === 429) {
        const data = await response.json().catch(() => ({})) as { error?: { message?: string; metadata?: { raw?: string } } };
        const description = `${data.error?.message || ""} ${data.error?.metadata?.raw || ""}`;
        console.warn("[provider-capacity]", JSON.stringify({ dailyLimit: /per.day|daily|day limit/i.test(description), minuteLimit: /per.minute|minute limit/i.test(description), providerCapacity: /capacity|overload|temporar|rate.limit/i.test(description), retryAfter: response.headers.get("retry-after") }));
        throw new CapacityError(response.headers.get("retry-after"), /per.day|daily|day limit/i.test(description));
      }
      if (response.status >= 500) throw new Error(`AI_RETRYABLE_${response.status}`);
      throw new Error(`AI_ERROR_${response.status}`);
    }
    return await readProviderCompletion(response, provider.model);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

type RequestBudget = { timeoutMs?: number; deadlineMs?: number; attempts?: number };

export async function runModel(system: string, user: string, maxTokens = 8000, budget: RequestBudget = {}): Promise<ProviderResult> {
  const provider = selectProvider({ APINEX_API_KEY: process.env.APINEX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY });
  const compact = compactStage(system);
  // A retry gets the same complete-output budget. Never shrink a full hub to fit a
  // 4,800-token retry or silently cap every script at 7,000 tokens.
  const tokens = Math.min(maxTokens, 24_000);
  const attempts = compact
    ? [{ timeout: 40_000, tokens }, { timeout: 30_000, tokens }]
    : [{ timeout: 170_000, tokens }, { timeout: 90_000, tokens }];
  let last: unknown = new Error("AI_ERROR");
  const count = Math.min(budget.attempts ?? attempts.length, attempts.length);
  const stageDeadline = Math.min(budget.deadlineMs ?? Infinity, Date.now() + (budget.timeoutMs ?? attempts[0].timeout));
  for (let index = 0; index < count; index += 1) {
    const attempt = attempts[index];
    const extra = index === 0 ? "" : "\n\nRETRY: Return the entire requested output. Preserve every required feature and UI instruction; no omitted sections.";
    const remaining = stageDeadline - Date.now();
    if (remaining < 1000) throw new Error("AI_TIMEOUT");
    const timeout = Math.min(budget.timeoutMs ?? attempt.timeout, remaining);
    try {
      try { return await requestOnce(provider, system + extra, user, attempt.tokens, timeout); }
      catch (error) {
        // A 429 produced no model output. Wait once for the provider's stated
        // minute reset without discarding a completed plan or implementation.
        const delay = error instanceof CapacityError ? capacityRetryDelay(error.retryAfter, Date.now(), stageDeadline, error.dailyLimit) : null;
        if (delay === null) throw error;
        await sleep(delay);
        return await requestOnce(provider, system + extra, user, attempt.tokens, Math.max(1000, stageDeadline - Date.now()));
      }
    }
    catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : "AI_ERROR";
      const retryable = message === "AI_TIMEOUT" || message === "RATE_LIMITED" || message === "EMPTY_AI" || message.startsWith("AI_RETRYABLE_");
      if (!retryable || index === count - 1) break;
      await sleep(message === "RATE_LIMITED" ? 1200 : 350);
    }
  }
  throw last instanceof Error ? last : new Error("AI_ERROR");
}
