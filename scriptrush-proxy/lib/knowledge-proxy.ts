const DEFAULT_ORIGIN = "https://scriptrush-api.vercel.app";
export const KNOWLEDGE_PROXY_TIMEOUT_MS = 290_000;
const HEADERS = { "cache-control": "no-store" };

export function knowledgeOrigin(environment: Record<string, string | undefined> = process.env): string {
  const candidate = environment.SCRIPTRUSH_KNOWLEDGE_API_ORIGIN ?? DEFAULT_ORIGIN;
  const url = new URL(candidate);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("INVALID_KNOWLEDGE_ORIGIN");
  if (url.origin === DEFAULT_ORIGIN) return url.origin;
  if (environment.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return url.origin;
  throw new Error("INVALID_KNOWLEDGE_ORIGIN");
}

export function knowledgeRoute(path: string[], method: string): { path: string; capability: boolean } | null {
  if (path.length === 1 && path[0] === "generations" && method === "POST") return { path: "generations", capability: false };
  if (path[0] !== "generations" || !/^[A-Za-z0-9_-]{8,128}$/.test(path[1] ?? "")) return null;
  if (path.length === 2 && method === "GET") return { path: path.join("/"), capability: true };
  if (path.length === 3 && ((method === "GET" && path[2] === "files") || (method === "POST" && ["advance", "resume", "rollback", "feedback"].includes(path[2])))) return { path: path.join("/"), capability: true };
  return null;
}

async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const stop = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", stop, { once: true });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("BODY_LIMIT"); }
      parts.push(chunk.value);
    }
  } finally { signal.removeEventListener("abort", stop); reader.releaseLock(); }
  return Buffer.concat(parts).toString("utf8");
}

/** Only the job capability crosses this boundary. Browser cookies never do. */
export async function proxyKnowledge(request: Request, path: string[], transport: typeof fetch = fetch, options: { timeoutMs?: number; environment?: Record<string, string | undefined> } = {}): Promise<Response> {
  const route = knowledgeRoute(path, request.method);
  if (!route) return Response.json({ error: "Unknown Knowledge Engine operation." }, { status: 404, headers: HEADERS });
  const search = new URL(request.url).searchParams;
  if ([...search].some(([key, value]) => path[2] !== "files" || !["snapshotId", "compareTo"].includes(key) || !/^[A-Za-z0-9_-]{1,128}$/.test(value) || search.getAll(key).length !== 1)) return Response.json({ error: "Invalid snapshot selection." }, { status: 400, headers: HEADERS });
  const authorization = request.headers.get("authorization");
  if (route.capability && (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))) return Response.json({ error: "A valid job resume key is required." }, { status: 401, headers: HEADERS });
  const headers: Record<string, string> = { accept: "application/json" };
  if (route.capability) headers.authorization = authorization!;
  const abort = AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? (path[2] === "advance" || path[2] === "resume" ? KNOWLEDGE_PROXY_TIMEOUT_MS : 30_000))]);
  try {
    const origin = knowledgeOrigin(options.environment);
    let body: string | undefined;
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length")) > 2_000_000) return Response.json({ error: "The project is too large." }, { status: 413, headers: HEADERS });
      try { body = await boundedText(request.body, 2_000_000, abort); } catch (error) { if (abort.aborted) throw error; return Response.json({ error: "The project is too large." }, { status: 413, headers: HEADERS }); }
      headers["content-type"] = "application/json";
    }
    const upstream = await transport(origin + "/api/v2/" + route.path + (search.size ? "?" + search.toString() : ""), { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: abort });
    if (!upstream.headers.get("content-type")?.includes("application/json")) throw new Error("INVALID_UPSTREAM");
    const data: unknown = JSON.parse(await boundedText(upstream.body, 4_000_000, abort));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("INVALID_UPSTREAM");
    return Response.json(data, { status: upstream.status, headers: HEADERS });
  } catch {
    return Response.json({ error: abort.aborted && !request.signal.aborted ? "This step timed out. Your saved job can be resumed." : "The job service is unavailable. Your saved job can be resumed." }, { status: abort.aborted && !request.signal.aborted ? 504 : 502, headers: HEADERS });
  }
}
