import type { GenerationRequest, GenerationResult, GenerationUsage, ResearchResult } from "./types.ts";
import type { GenerationCoverage } from "./coverage.ts";
import { isRecord, parseScriptResponse, ValidationError } from "./validation.ts";
import { parseGenerationUsage, parseReviewIssues, requirementsFailureMessage } from "./generation-diagnostics.ts";
import { parseResearchKnowledge } from "./research-knowledge.ts";

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly issues: string[];
  readonly usage?: GenerationUsage;
  readonly generationProfile?: Record<string, unknown>;
  constructor(message: string, code = "request_failed", status?: number, diagnostics: { issues?: string[]; usage?: GenerationUsage; generationProfile?: Record<string, unknown> } = {}) {
    super(message);
    this.name = code === "cancelled" ? "AbortError" : "ApiError";
    this.code = code;
    this.status = status;
    this.issues = diagnostics.issues ?? [];
    this.usage = diagnostics.usage;
    this.generationProfile = diagnostics.generationProfile;
  }
}

type Operation = "research" | "generate" | "scanner";

export function generationNotice(coverage: GenerationCoverage | null, hasCoverage: boolean, saved: boolean): string {
  const unavailable = coverage?.features.filter((feature) => feature.status === "unavailable").length ?? 0;
  const implemented = coverage?.features.filter((feature) => feature.status === "implemented").length ?? 0;
  const summary = unavailable > 0
    ? `Script ready. ${implemented} requested features implemented; ${unavailable} need more game evidence. See the feature checklist below.`
    : coverage && !coverage.uiVerified
      ? "Script ready. The requested UI needs verification; review the coverage below."
      : hasCoverage && !coverage
        ? "Script ready, but its feature coverage could not be verified."
        : "Complete script ready.";
  const uiNotice = unavailable > 0 && coverage && !coverage.uiVerified ? " The requested UI needs verification." : "";
  const storageNotice = saved ? " Saved as a new version." : " It could not be saved to History. Copy or download it to keep a backup.";
  return summary + uiNotice + storageNotice + " Test it in the target game to confirm behavior.";
}

function failure(operation: Operation, status?: number): ApiError {
  if (status === 408 || status === 504) return new ApiError("The service timed out. Your input was preserved. Check service availability before starting another request.", "timeout", status);
  if (status === 429) return new ApiError("The model is busy or temporarily rate limited. Your input was preserved. Wait before starting another generation.", "rate_limited", status);
  const message = operation === "research" ? "Game research is unavailable. Check the game name or Roblox link and try again."
    : operation === "scanner" ? "The live scanner is unavailable. Please try again shortly."
      : "Script generation stopped before validation completed. Your request and previous script were preserved.";
  return new ApiError(message, operation + "_unavailable", status);
}

function withUsage(error: ApiError, value: unknown, profile?: unknown): ApiError {
  const usage = parseGenerationUsage(value);
  const generationProfile = isRecord(profile) ? profile : undefined;
  return usage || generationProfile ? new ApiError(error.message + (usage ? ` AI calls: ${usage.modelCalls}.` : ""), error.code, error.status, { issues: error.issues, usage, generationProfile }) : error;
}

async function request(url: string, operation: Operation, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, operation === "generate" ? 305_000 : 45_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch {
      if (!response.ok) throw failure(operation, response.status);
      throw new ApiError(operation === "scanner" ? "The scanner service returned an invalid response." : "The service returned an incomplete response. Your input was preserved.", "invalid_response", response.status);
    }
    if (operation === "generate" && isRecord(data) && data.code === "MODEL_OUTPUT_INVALID") {
      throw withUsage(new ApiError("The AI response could not be validated as a complete hub. Your request and previous script were preserved.", "model_output_invalid", response.status), data.usage, data.generationProfile);
    }
    if (isRecord(data) && data.code === "REQUIREMENTS_NOT_MET") {
      const issues = parseReviewIssues(data.review);
      const usage = parseGenerationUsage(data.usage);
      throw new ApiError(requirementsFailureMessage(issues, usage), "requirements_not_met", response.status, { issues, usage, ...(isRecord(data.generationProfile) ? { generationProfile: data.generationProfile } : {}) });
    }
    if (!response.ok || (isRecord(data) && data.error)) {
      const errorText = isRecord(data) && typeof data.error === "string" ? data.error : "";
      const reason = isRecord(data) && typeof data.reason === "string" ? data.reason : "";
      const usage = isRecord(data) ? data.usage : undefined;
      const generationProfile = isRecord(data) ? data.generationProfile : undefined;
      if (reason === "RATE_LIMITED") throw withUsage(failure(operation, 429), usage, generationProfile);
      if (reason === "AI_TIMEOUT" || /timeout|timed out/i.test(errorText)) throw withUsage(failure(operation, 504), usage, generationProfile);
      if (reason === "INCOMPLETE_RESPONSE" || /incomplete|truncat|no complete script/i.test(errorText)) throw withUsage(new ApiError("The model returned an incomplete response. Your previous script was preserved.", "incomplete_response", response.status), usage, generationProfile);
      throw withUsage(failure(operation, response.status), usage, generationProfile);
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
  const researchKnowledge = parseResearchKnowledge(profile.researchKnowledge);
  return { game: name, name, placeId, ...(universeId ? { universeId } : {}), profile: candidate, ...(researchKnowledge ? { researchKnowledge } : {}) };
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
  if (body.mode === "fix" && script.trim() === body.currentScript?.trim()) {
    throw new ApiError("No corrected changes were returned. Your current script was preserved.", "no_changes");
  }
  const researchKnowledge = parseResearchKnowledge(metadata.researchKnowledge);
  return { script, message: data.message, metadata, ...(researchKnowledge ? { researchKnowledge } : {}) };
}

export async function fetchScanner(signal?: AbortSignal): Promise<string> {
  const data = await request("/api/scanner", "scanner", { method: "GET" }, signal);
  if (!isRecord(data) || typeof data.script !== "string" || !data.script.trim()) throw failure("scanner");
  return data.script;
}
