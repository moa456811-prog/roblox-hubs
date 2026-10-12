import type { GenerationRequest, GenerationResult, ResearchResult } from "./types.ts";
import { isRecord, parseScriptResponse, ValidationError } from "./validation.ts";

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(message: string, code = "request_failed", status?: number) {
    super(message);
    this.name = code === "cancelled" ? "AbortError" : "ApiError";
    this.code = code;
    this.status = status;
  }
}

type Operation = "research" | "generate" | "scanner";

function failure(operation: Operation, status?: number): ApiError {
  if (status === 408 || status === 504) return new ApiError("The service timed out. Your input was preserved; please try again.", "timeout", status);
  if (status === 429) return new ApiError("The model is busy or temporarily rate limited. Wait a moment and try again.", "rate_limited", status);
  const message = operation === "research" ? "Game research is unavailable. Check the game name or Roblox link and try again."
    : operation === "scanner" ? "The live scanner is unavailable. Please try again shortly."
      : "Script generation failed. Your request and previous script were preserved. Please try again.";
  return new ApiError(message, operation + "_unavailable", status);
}

async function request(url: string, operation: Operation, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, operation === "generate" ? 240_000 : 45_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch {
      if (!response.ok) throw failure(operation, response.status);
      throw new ApiError(operation === "scanner" ? "The scanner service returned an invalid response." : "The service returned an incomplete response. Your input was preserved.", "invalid_response", response.status);
    }
    if (!response.ok || (isRecord(data) && data.error)) {
      const errorText = isRecord(data) && typeof data.error === "string" ? data.error : "";
      if (/timeout|timed out/i.test(errorText)) throw failure(operation, 504);
      if (/incomplete|truncat|no complete script/i.test(errorText)) throw new ApiError("The model returned an incomplete response. Your previous script was preserved.", "incomplete_response", response.status);
      throw failure(operation, response.status);
    }
    return data;
  } catch (error) {
    if (timedOut) throw failure(operation, 504);
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new ApiError("Generation stopped. Your input and previous script were preserved.", "cancelled");
    if (error instanceof ApiError || error instanceof ValidationError) throw error;
    throw failure(operation);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function researchGame(query: string, signal?: AbortSignal): Promise<ResearchResult> {
  const clean = query.trim();
  if (!clean) throw new ValidationError("Enter a Roblox game name, URL, or Place ID first.");
  const data = await request("/api/research-game?q=" + encodeURIComponent(clean), "research", { method: "GET" }, signal);
  if (!isRecord(data)) throw failure("research");
  const candidate = data.profile ?? data.research ?? data.result ?? data;
  if (!isRecord(candidate)) throw failure("research");
  const profile = isRecord(candidate.game) ? { ...candidate, ...candidate.game } : candidate;
  const name = typeof profile.name === "string" ? profile.name : typeof profile.gameName === "string" ? profile.gameName : clean;
  const placeId = typeof profile.placeId === "string" || typeof profile.placeId === "number" ? String(profile.placeId) : "";
  if (!/^[1-9]\d*$/.test(placeId)) throw new ApiError("No game was identified. Try its Roblox game link or Place ID.", "game_not_found");
  const universeId = typeof profile.universeId === "string" || typeof profile.universeId === "number" ? String(profile.universeId) : undefined;
  return { game: name, name, placeId, ...(universeId ? { universeId } : {}), profile: candidate };
}

export async function generateScript(body: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
  if (!body.game.trim()) throw new ValidationError("Select a Roblox game first.");
  if (!body.prompt.trim()) throw new ValidationError(body.mode === "fix" ? "Paste an error or describe the requested change." : "Describe what the script should do.");
  if (body.mode !== "build" && body.mode !== "fix") throw new ValidationError("Invalid script action.");
  if (body.mode === "fix" && !body.currentScript?.trim()) throw new ValidationError("Paste the complete current script first.");
  if (!Array.isArray(body.sources) || body.sources.length > 6 || body.sources.some((source) => typeof source.name !== "string" || typeof source.content !== "string" || !Number.isFinite(source.size) || source.size < 0)) {
    throw new ValidationError("The attached sources are invalid. Use up to five files and one runtime profile.");
  }
  const data = await request("/api/guest-chat", "generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, signal);
  if (!isRecord(data) || typeof data.message !== "string") throw new ApiError("No complete script returned. Your previous script was preserved.", "incomplete_response");
  const metadata = isRecord(data.metadata) ? { ...data, ...data.metadata } : data;
  const script = parseScriptResponse(data.message, metadata);
  return { script, message: data.message, metadata };
}

export async function fetchScanner(signal?: AbortSignal): Promise<string> {
  const data = await request("/api/scanner", "scanner", { method: "GET" }, signal);
  if (!isRecord(data) || typeof data.script !== "string" || !data.script.trim()) throw failure("scanner");
  return data.script;
}
