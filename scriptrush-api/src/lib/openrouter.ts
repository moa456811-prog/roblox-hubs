import "server-only";

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
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "ScriptRush" },
      body: JSON.stringify({ model: MODEL, temperature: 0.06, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("RATE_LIMITED");
      if (response.status >= 500) throw new Error(`AI_RETRYABLE_${response.status}`);
      throw new Error(`AI_ERROR_${response.status}`);
    }
    const data = await response.json() as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) throw new Error("EMPTY_AI");
    return { content, model: data.model || MODEL, incomplete: choice?.finish_reason === "length" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function runOpenRouter(system: string, user: string, maxTokens = 8000): Promise<ProviderResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("AI_NOT_CONFIGURED");
  const compact = compactStage(system);
  const attempts = compact
    ? [{ timeout: 45_000, tokens: Math.min(maxTokens, 1800) }, { timeout: 35_000, tokens: Math.min(maxTokens, 1200) }]
    : [{ timeout: 130_000, tokens: Math.min(maxTokens, 7000) }, { timeout: 70_000, tokens: Math.min(maxTokens, 4800) }];
  let last: unknown = new Error("AI_ERROR");
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const extra = index === 0 ? "" : "\n\nFAST RETRY: Complete the requested output concisely. No introduction, no analysis, and no omitted sections.";
    try { return await requestOnce(key, system + extra, user, attempt.tokens, attempt.timeout); }
    catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : "AI_ERROR";
      const retryable = message === "AI_TIMEOUT" || message === "RATE_LIMITED" || message === "EMPTY_AI" || message.startsWith("AI_RETRYABLE_");
      if (!retryable || index === attempts.length - 1) break;
      await sleep(message === "RATE_LIMITED" ? 1200 : 350);
    }
  }
  throw last instanceof Error ? last : new Error("AI_ERROR");
}
