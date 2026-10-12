import "server-only";
import { generationResponseFormat } from "./generation-contract.ts";

type ProviderResult = { content: string; model: string; incomplete: boolean };
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Explicit free model: avoid random provider/model changes between retries.
const MODEL = "dots-studio/dots-3-note-preview:free";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function compactStage(system: string) {
  const value = system.toLowerCase();
  return /\b(plan|planner|review|reviewer|critic|audit|json only|analyse|analyze)\b/.test(value)
    && !/fenced lua|executor-ready|full corrected script|one self-contained|luau script/.test(value);
}

async function requestOnce(key: string, system: string, user: string, maxTokens: number, timeoutMs: number): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const responseFormat = generationResponseFormat(system) || (compactStage(system) ? { type: "json_object" } : null);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "ScriptRush" },
      // The free model supports disabling reasoning. Reserve the output budget
      // for the requested code/JSON instead of an invisible reasoning-only result.
      body: JSON.stringify({ model: MODEL, temperature: 0.06, max_tokens: maxTokens, reasoning: { enabled: false }, ...(responseFormat ? { response_format: responseFormat } : {}), messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("RATE_LIMITED");
      if (response.status >= 500) throw new Error(`AI_RETRYABLE_${response.status}`);
      throw new Error(`AI_ERROR_${response.status}`);
    }
    const data = await response.json() as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content && choice?.finish_reason === "length") return { content: "", model: data.model || MODEL, incomplete: true };
    if (!content) throw new Error("EMPTY_AI");
    return { content, model: data.model || MODEL, incomplete: choice?.finish_reason === "length" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

type RequestBudget = { timeoutMs?: number; deadlineMs?: number; attempts?: number };

export async function runOpenRouter(system: string, user: string, maxTokens = 8000, budget: RequestBudget = {}): Promise<ProviderResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  const compact = compactStage(system);
  // A retry gets the same complete-output budget. Never shrink a full hub to fit a
  // 4,800-token retry or silently cap every script at 7,000 tokens.
  const tokens = Math.min(maxTokens, 24_000);
  const attempts = compact
    ? [{ timeout: 40_000, tokens }, { timeout: 30_000, tokens }]
    : [{ timeout: 170_000, tokens }, { timeout: 90_000, tokens }];
  let last: unknown = new Error("AI_ERROR");
  const count = Math.min(budget.attempts ?? attempts.length, attempts.length);
  for (let index = 0; index < count; index += 1) {
    const attempt = attempts[index];
    const extra = index === 0 ? "" : "\n\nRETRY: Return the entire requested output. Preserve every required feature and UI instruction; no omitted sections.";
    const remaining = budget.deadlineMs ? budget.deadlineMs - Date.now() : Infinity;
    if (remaining < 1000) throw new Error("AI_TIMEOUT");
    const timeout = Math.min(budget.timeoutMs ?? attempt.timeout, remaining);
    try { return await requestOnce(key, system + extra, user, attempt.tokens, timeout); }
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
