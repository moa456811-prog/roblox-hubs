import { resolveGameIdentity, queryKnowledge, KNOWLEDGE_ROLES } from "../knowledge-v2/index.ts";
import type { KnowledgeRole } from "../knowledge-v2/index.ts";
import { generationJobService } from "./runtime.ts";
import { JobError } from "./service.ts";
import type { GenerationJobService } from "./service.ts";

const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new JobError("JSON_BODY_REQUIRED", 415);
  const declared = Number(request.headers.get("content-length") || 0); if (declared > 900000) throw new JobError("REQUEST_TOO_LARGE", 413);
  const reader = request.body?.getReader(); if (!reader) throw new JobError("INVALID_JSON");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 900000) { await reader.cancel(); throw new JobError("REQUEST_TOO_LARGE", 413); } chunks.push(item.value); } } finally { reader.releaseLock(); }
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new JobError("INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobError("INVALID_JSON"); return value as Record<string, unknown>;
}
function capability(request: Request): string { const value = request.headers.get("authorization") || ""; const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value); if (!match) throw new JobError("JOB_NOT_FOUND", 404); return match[1]; }
function string(value: unknown, error: string): string { if (typeof value !== "string") throw new JobError(error); return value; }
type Action = "create" | "status" | "advance" | "files" | "rollback" | "feedback" | "abort";
export function createGenerationHttpHandler(serviceFactory: () => GenerationJobService = generationJobService, env: Record<string, string | undefined> = process.env) {
  return async function handle(action: Action | "resolve" | "query", request: Request, id?: string): Promise<Response> {
    if (env.SCRIPTRUSH_KNOWLEDGE_V2_ENABLED !== "true") return response({ error: "KNOWLEDGE_V2_DISABLED" }, 404);
    try {
      if (action === "resolve") {
        const input = request.method === "GET" ? { placeIdOrUrl: new URL(request.url).searchParams.get("placeIdOrUrl") ?? new URL(request.url).searchParams.get("q") } : await body(request);
        const game = await resolveGameIdentity(string(input.placeIdOrUrl, "INVALID_PLACE_INPUT"), { signal: request.signal }); return response({ game, evidence_level: game.status, unknowns: game.unknowns });
      }
      if (action === "query") {
        const input = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await body(request);
        if (!KNOWLEDGE_ROLES.includes(input.role as KnowledgeRole)) throw new JobError("INVALID_KNOWLEDGE_ROLE");
        const result = queryKnowledge({ request: string(input.request, "INVALID_KNOWLEDGE_QUERY"), role: input.role as KnowledgeRole, limit: typeof input.limit === "number" ? input.limit : undefined }); return response(result);
      }
      if (action === "create") return response(await serviceFactory().create(await body(request)), 201);
      const owner = capability(request); if (!id) throw new JobError("JOB_NOT_FOUND", 404);
      const service = serviceFactory();
      if (action === "status") return response({ job: await service.status(id, owner) });
      if (action === "files") { const query = new URL(request.url).searchParams; return response(await service.files(id, owner, query.get("snapshotId") || undefined, query.get("compareTo") || undefined)); }
      if (action === "abort") return response({ job: await service.abort(id, owner) });
      const input = await body(request);
      if (action === "advance") return response({ job: await service.advance(id, owner, string(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY"), request.signal) });
      if (action === "rollback") return response({ job: await service.rollback(id, owner, string(input.snapshotId, "SNAPSHOT_NOT_FOUND"), string(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY")) });
      if (action === "feedback") return response(await service.feedback(id, owner, input));
      throw new JobError("UNKNOWN_ACTION", 404);
    } catch (error) {
      if (error instanceof JobError) return response({ error: error.code }, error.httpStatus);
      const code = error instanceof Error ? error.message : "GENERATION_API_FAILED";
      if (["DURABLE_GENERATION_STORE_REQUIRED", "GENERATION_STORE_UNAVAILABLE", "GENERATION_SUPABASE_KEY_REQUIRED"].includes(code)) return response({ error: code }, 503);
      if (/^INVALID_|^PROJECT_|^CURRENT_PROJECT_|^PATCH_/.test(code) && /^[A-Z0-9_]+$/.test(code)) return response({ error: code }, 400);
      return response({ error: "GENERATION_API_FAILED" }, 500);
    }
  };
}
export const handleGenerationHttp = createGenerationHttpHandler();
