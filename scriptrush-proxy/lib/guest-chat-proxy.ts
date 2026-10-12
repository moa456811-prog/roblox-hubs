const GENERATION_URL = "https://scriptrush-api.vercel.app/api/guest-chat";
export const GENERATION_PROXY_TIMEOUT_MS = 290_000;

/** A Node function avoids the external-rewrite 120s ceiling for reviewed hubs. */
export async function proxyGeneration(request: Request, transport: typeof fetch = fetch, timeoutMs = GENERATION_PROXY_TIMEOUT_MS): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 3_000_000) return Response.json({ error: "The generation request is too large." }, { status: 413, headers });
    const response = await transport(GENERATION_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 3_000_000 || !response.headers.get("content-type")?.includes("application/json")) throw new Error("INVALID_RESPONSE");
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("INVALID_RESPONSE");
    return Response.json(data, { status: response.status, headers });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timedOut ? "Generation timed out. Your request has been kept; try again." : "The generation service is unavailable. Your request has been kept; try again." }, { status: timedOut ? 504 : 502, headers });
  }
}
