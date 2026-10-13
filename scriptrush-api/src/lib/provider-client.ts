import { generationResponseFormat } from "./generation-contract.ts";
import { HUB_COMPOSER_SYSTEM } from "./hub-spec.ts";
import { type ProviderConfig } from "./provider-config.ts";
import { readProviderCompletion } from "./provider-response.ts";
import { providerDelay, throwIfCallerAborted, withProviderAbort } from "./provider-abort.ts";
import { capacityRetryDelay, parseProviderResetAt } from "./provider-capacity.ts";
import { executeProviderChain, MAX_PROVIDER_HOPS, ProviderCooldowns, ProviderUnavailableError } from "./provider-failover.ts";

export type ProviderResult = { content: string; model: string; incomplete: boolean; provider: string; attempts: number };
export type RequestBudget = { timeoutMs?: number; deadlineMs?: number; attempts?: number; signal?: AbortSignal };
const attemptCounts = new WeakMap<object, number>();

/** Transport attempts, including zero when every route is cooling down; never a token/billing estimate. */
export function providerAttemptCount(error: unknown): number | undefined {
  return error !== null && (typeof error === "object" || typeof error === "function") ? attemptCounts.get(error) : undefined;
}

function compactStage(system: string) {
  const value = system.toLowerCase();
  return /\b(plan|planner|review|reviewer|critic|audit|json only|analyse|analyze)\b/.test(value)
    && !/fenced lua|executor-ready|full corrected script|one self-contained|luau script/.test(value);
}

async function requestOnce(fetcher: typeof globalThis.fetch, provider: ProviderConfig, system: string, user: string, maxTokens: number, timeoutMs: number, callerSignal: AbortSignal) {
  let rejectedStatus: number | undefined;
  try {
    return await withProviderAbort(timeoutMs, callerSignal, async signal => {
      // Both routes support JSON mode. Novita rejects parts of the full Zod
      // schemas in strict mode; keep their authoritative validation locally.
      const responseFormat = system.startsWith(HUB_COMPOSER_SYSTEM) || generationResponseFormat(system) || compactStage(system)
        ? { type: "json_object" } : null;
      const instructions = system + (responseFormat ? "\nReturn the actual value object in the exact shape shown above. Never return a JSON schema or wrap the values in properties/type/required." : "");
      let response: Response;
      try {
        response = await fetcher(provider.endpoint, {
          method: "POST", signal, redirect: "error",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}`, ...(provider.name === "openrouter" ? { "X-OpenRouter-Title": "ScriptRush", "HTTP-Referer": "https://scriptrush.vercel.app" } : {}) },
          body: JSON.stringify({
            model: provider.model, temperature: responseFormat ? 0.1 : 0.25, max_tokens: maxTokens,
            ...(provider.name === "apinex"
              ? { stream: true, thinking: { type: "disabled" } }
              : { reasoning: { enabled: false }, provider: { only: ["novita"], require_parameters: true, allow_fallbacks: false, max_price: { prompt: 0, completion: 0 } } }),
            ...(responseFormat ? { response_format: responseFormat } : {}),
            messages: [{ role: "system", content: instructions }, { role: "user", content: user }],
          }),
        });
      } catch (error) {
        // Only transport failures from fetch are classified as network failures.
        // Malformed output/JSON is never a reason for a hidden second request.
        if (signal.aborted) throw error;
        if (error instanceof TypeError) throw new ProviderUnavailableError("network", { cause: error });
        throw error;
      }
      if (!response.ok) {
        // Once a terminal status is known, a stalled diagnostic/error body
        // must not turn it into a timeout that sends a fallback request.
        if (response.status < 500 && response.status !== 402 && response.status !== 429) rejectedStatus = response.status;
        if (response.status === 429) {
          const data = await response.json().catch(() => null) as { error?: { message?: string; metadata?: { raw?: string } } } | null;
          const description = `${data?.error?.message || ""} ${data?.error?.metadata?.raw || ""}`;
          const quota = /per.day|daily|day limit|monthly|month limit/i.test(description);
          const resetAtMs = parseProviderResetAt(response.headers.get("x-ratelimit-reset"), Date.now());
          throw new ProviderUnavailableError(quota ? "quota" : "capacity", { status: 429, retryAfter: response.headers.get("retry-after"), resetAtMs });
        }
        if (response.status === 400 || response.status === 422) {
          const data = await response.json().catch(() => null) as { error?: { message?: string; metadata?: { raw?: string } } } | null;
          const description = `${data?.error?.message || ""} ${data?.error?.metadata?.raw || ""}`;
          // Record only fixed diagnostic flags, never provider text, credentials,
          // headers or request content. Format failures must still stop here.
          console.warn("[provider-request-format]", JSON.stringify({
            provider: provider.name, status: response.status,
            reasoning: /reasoning|thinking/i.test(description), schema: /schema|json/i.test(description),
            routing: /provider|routing|endpoint/i.test(description), parameters: /param|argument|field/i.test(description),
            model: /model/i.test(description), price: /price|credit|payment/i.test(description),
            unsupported: /support|invalid|not.allowed|not.available/i.test(description),
          }));
          throw new Error(`AI_ERROR_${response.status}`);
        }
        await response.body?.cancel().catch(() => {});
        if (response.status === 402) {
          throw new ProviderUnavailableError("quota", { status: response.status, retryAfter: response.headers.get("retry-after") });
        }
        if (response.status >= 500) throw new ProviderUnavailableError("upstream", { status: response.status, retryAfter: response.headers.get("retry-after") });
        throw new Error(`AI_ERROR_${response.status}`);
      }
      return await readProviderCompletion(response, provider.model);
    });
  } catch (error) {
    // A per-provider timeout leaves the remaining stage deadline to its successor.
    throwIfCallerAborted(callerSignal);
    if (rejectedStatus !== undefined) throw new Error(`AI_ERROR_${rejectedStatus}`);
    if (error instanceof Error && error.message === "AI_TIMEOUT") throw new ProviderUnavailableError("timeout", { cause: error });
    throw error;
  }
}

/** Providers are explicitly supplied by server configuration, never by a visitor or an error payload. */
export function createProviderRunner(options: {
  providers: () => readonly ProviderConfig[];
  fetch?: typeof globalThis.fetch;
  cooldowns?: ProviderCooldowns;
}) {
  const cooldowns = options.cooldowns ?? new ProviderCooldowns();
  return async function runModel(system: string, user: string, maxTokens = 8000, budget: RequestBudget = {}): Promise<ProviderResult> {
    let attempts = 0;
    try {
      throwIfCallerAborted(budget.signal);
      const providers = options.providers();
      if (providers.some(provider => provider.name === "openrouter" && !provider.model.endsWith(":free"))) throw new Error("INVALID_PROVIDER_CONFIGURATION");
      const now = Date.now();
      const timeoutMs = budget.timeoutMs ?? (compactStage(system) ? 40_000 : 170_000);
      const stageDeadline = Math.min(budget.deadlineMs ?? Infinity, now + timeoutMs);
      const chain = providers.map(provider => ({ ...provider, id: provider.name }));
      const eligibleCount = Math.min(MAX_PROVIDER_HOPS, new Set(chain.filter(provider => !cooldowns.availableAt(provider.id, now)).map(provider => provider.id)).size);
      const execute = () => executeProviderChain(chain, {
        signal: budget.signal, deadlineMs: stageDeadline, cooldowns,
        onAttempt: () => { attempts++; },
        operation: async (provider, operationBudget) => {
          const remainingProviders = Math.max(1, eligibleCount - operationBudget.attempt + 1);
          const timeout = Math.floor(operationBudget.remainingMs / remainingProviders);
          return requestOnce(options.fetch ?? globalThis.fetch, provider, system, user, Math.min(maxTokens, 24_000), timeout, operationBudget.signal);
        },
      });
      let result;
      try { result = await execute(); }
      catch (error) {
        // Preserve the existing single-provider minute-limit recovery. A
        // configured alternative is tried immediately by the chain instead.
        const delay = chain.length === 1 && error instanceof ProviderUnavailableError && error.reason === "capacity" && error.status === 429
          ? capacityRetryDelay(error.retryAfter ?? null, Date.now(), stageDeadline, false) : null;
        if (delay === null) throw error;
        await providerDelay(delay, budget.signal);
        cooldowns.clear(chain[0].id);
        result = await execute();
      }
      return { ...result.value, provider: result.providerId, attempts };
    } catch (error) {
      if (error !== null && (typeof error === "object" || typeof error === "function")) attemptCounts.set(error, attempts);
      throw error;
    }
  };
}
