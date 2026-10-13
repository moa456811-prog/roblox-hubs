import { ProviderUnavailableError } from "./provider-failover.ts";

type Completion = { content: string; model: string; incomplete: boolean };
type Chunk = { model?: string; error?: { code?: number | string }; choices?: Array<{ finish_reason?: string | null; message?: { content?: string }; delta?: { content?: string } }> };

function completionFailure(error?: Chunk["error"]): Error {
  const status = Number(error?.code);
  if (status === 429 || status === 402) return new ProviderUnavailableError("quota", { status });
  if (status >= 400 && status < 500) return new Error(`AI_ERROR_${status}`);
  if (status >= 500 && status <= 599) return new ProviderUnavailableError("upstream", { status });
  // Unknown/semantic errors (including refusals and invalid credentials) do
  // not authorize a second request merely because their status is missing.
  return new Error("AI_ERROR_502");
}

/** Consume OpenAI JSON or SSE, preserving split UTF-8 and rejecting cut streams. */
export async function readProviderCompletion(response: Response, defaultModel: string): Promise<Completion> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json() as Chunk;
    const choice = data.choices?.[0], content = choice?.message?.content?.trim() || "";
    if (data.error) throw completionFailure(data.error);
    if (choice?.finish_reason && !["stop", "length"].includes(choice.finish_reason)) throw new Error("AI_ERROR_502");
    if (!content && choice?.finish_reason !== "length") throw new Error("EMPTY_AI");
    return { content, model: data.model || defaultModel, incomplete: !choice?.finish_reason || choice.finish_reason === "length" };
  }
  if (!response.body) throw new Error("EMPTY_AI");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", content = "", model = defaultModel, finished = false, incomplete = false;
  const consume = (event: string) => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let chunk: Chunk;
    try { chunk = JSON.parse(data) as Chunk; } catch { throw new Error("AI_RETRYABLE_502"); }
    if (chunk.error) throw completionFailure(chunk.error);
    model = chunk.model || model;
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === "string") content += choice.delta.content;
    if (choice?.finish_reason) {
      if (!["stop", "length"].includes(choice.finish_reason)) throw new Error("AI_ERROR_502");
      finished = true; incomplete = choice.finish_reason === "length";
    }
  };
  try {
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      let boundary: RegExpMatchArray | null;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index! + boundary[0].length);
      }
      if (next.done) break;
    }
    if (buffer.trim()) consume(buffer);
  } catch (error) {
    // Stop consuming a rejected stream before another provider can be tried.
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  if (!content.trim() && finished && !incomplete) throw new Error("EMPTY_AI");
  return { content: content.trim(), model, incomplete: incomplete || !finished };
}
