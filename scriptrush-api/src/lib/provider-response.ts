type Completion = { content: string; model: string; incomplete: boolean };
type Chunk = { model?: string; error?: { code?: number }; choices?: Array<{ finish_reason?: string | null; message?: { content?: string }; delta?: { content?: string } }> };

/** Consume OpenAI JSON or SSE, preserving split UTF-8 and rejecting cut streams. */
export async function readProviderCompletion(response: Response, defaultModel: string): Promise<Completion> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json() as Chunk;
    const choice = data.choices?.[0], content = choice?.message?.content?.trim() || "";
    if (data.error || (choice?.finish_reason && !["stop", "length"].includes(choice.finish_reason))) throw new Error(data.error?.code === 429 ? "RATE_LIMITED" : "AI_RETRYABLE_502");
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
    if (chunk.error) throw new Error(chunk.error.code === 429 ? "RATE_LIMITED" : "AI_RETRYABLE_502");
    model = chunk.model || model;
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === "string") content += choice.delta.content;
    if (choice?.finish_reason) {
      if (!["stop", "length"].includes(choice.finish_reason)) throw new Error("AI_RETRYABLE_502");
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
  } finally { reader.releaseLock(); }
  if (!content.trim() && finished && !incomplete) throw new Error("EMPTY_AI");
  return { content: content.trim(), model, incomplete: incomplete || !finished };
}
