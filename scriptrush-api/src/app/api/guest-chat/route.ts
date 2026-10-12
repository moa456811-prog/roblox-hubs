import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/model-provider";
import { generateCompleteScript } from "@/lib/generation";
export const maxDuration = 300;

const sourceSchema = z.object({ name: z.string().min(1).max(200), content: z.string().max(80_000), size: z.number().nonnegative().max(750_000) });
const inputSchema = z.object({ clientId: z.string().uuid().optional(), game: z.string().trim().max(240).default(""), placeId: z.string().trim().max(40).default(""), mode: z.enum(["build", "fix", "improve", "ui"]).default("build"), prompt: z.string().trim().min(1).max(30_000), sources: z.array(sourceSchema).max(6).default([]), currentScript: z.string().max(160_000).optional(), runtimeDiagnostic: z.string().max(100_000).optional() });
type Profile = { gameKey?: string; name?: string; placeId?: string; universeId?: string; description?: string; confidence?: string; featureSignals?: Array<{ feature?: string; confidence?: string; score?: number }>; sourceCounts?: { scriptBlox?: number; github?: number }; [key: string]: unknown };
const errorLike = (text: string) => /stack\s+begin|stack\s+end|attempt to|traceback|syntax\s*error|expected|line\s+\d+|:\d+:|nil value|malformed string|unfinished comment|unable to assign/i.test(text);

function gameKey(profile: Profile | null, game: string, placeId: string) {
  if (profile?.gameKey) return profile.gameKey;
  if (profile?.universeId) return `universe:${profile.universeId}`;
  if (profile?.placeId || placeId) return `place:${profile?.placeId || placeId}`;
  const name = (profile?.name || game || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140);
  return `name:${name || "unknown"}`;
}
async function research(request: Request, game: string) {
  if (!game) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
  try { const url = new URL("/api/research-game", request.url); url.searchParams.set("q", game); const response = await fetch(url, { cache: "no-store", signal: controller.signal }); if (!response.ok) return null; return ((await response.json()).profile || null) as Profile | null; }
  catch { return null; } finally { clearTimeout(timer); }
}
async function save(request: Request, body: Record<string, unknown>) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try { const response = await fetch(new URL("/api/memory", request.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }); if (!response.ok) return null; return (await response.json()).version || null; }
  catch { return null; } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const input = inputSchema.parse(await request.json());
    const current = (input.currentScript || "").trim();
    const patch = Boolean(current && (input.mode === "fix" || input.mode === "improve" || errorLike(input.prompt) || /\b(fix|repair|corrige|répare|modifie|improve|améliore)\b/i.test(input.prompt)));
    const profile = await research(request, input.game);
    const key = gameKey(profile, input.game, input.placeId);
    const signals = profile?.featureSignals || [];
    const supported = signals.filter(signal => signal.confidence === "high" || signal.confidence === "medium").map(signal => signal.feature).filter((feature): feature is string => Boolean(feature));
    const ledger = signals.map(signal => `${signal.feature || "Unknown"}: ${signal.confidence || "low"} (${signal.score || 0})`).join("\n") || "No reliable game-specific feature signals found. Standard client UI APIs remain usable.";
    const result = await generateCompleteScript({
      prompt: input.prompt, currentScript: current, patch,
      game: { name: profile?.name || input.game, placeId: profile?.placeId || input.placeId, universeId: profile?.universeId, description: profile?.description, confidence: profile?.confidence, sourceCounts: profile?.sourceCounts },
      supportedFeatures: supported, ledger,
      sources: input.sources.map(source => `--- ${source.name} ---\n${source.content}`).join("\n\n"), diagnostic: input.runtimeDiagnostic || "",
    }, runModel, startedAt + 285_000);
    const review = { passed: !result.issues.length && Boolean(result.script && result.coverage), issues: result.issues, providerIncomplete: result.incomplete, strategy: "requirements-coverage-review", repaired: result.repaired };
    if (!review.passed) {
      const missing = result.reason === "REQUIREMENTS_NOT_MET" || result.reason === "INCOMPLETE_REQUIREMENTS";
      const error = missing
        ? "ScriptRush could not satisfy every requested feature or UI requirement. Your request and previous script were preserved."
        : result.reason === "RATE_LIMITED"
          ? "The free AI model is temporarily busy. Your request and previous script were preserved; try again."
          : result.reason === "AI_TIMEOUT"
            ? "The AI model timed out. Your request and previous script were preserved; try again."
            : "ScriptRush could not validate a complete script against your requirements. Your request and previous script were preserved.";
      return NextResponse.json({ error, code: missing ? "REQUIREMENTS_NOT_MET" : patch ? "PATCH_PRESERVED" : "GENERATION_REJECTED", reason: result.reason, model: result.model || null, patchMode: patch, review }, { status: 502 });
    }
    const plan = { mode: patch ? "patch-existing" : "requirements-build", requested: input.prompt, supportedFeatures: supported, requirements: result.contract, sourceCounts: profile?.sourceCounts || { scriptBlox: 0, github: 0 } };
    const version = input.clientId ? await save(request, { op: "version_add", clientId: input.clientId, gameKey: key, mode: patch ? "fix" : input.mode, request: input.prompt, script: result.script, plan, review }) : null;
    return NextResponse.json({ message: `\`\`\`lua\n${result.script}\n\`\`\``, status: "ok", model: result.model, research: profile ? { ...profile, gameKey: key } : { gameKey: key }, gameKey: key, plan, review, coverage: result.coverage, patchMode: patch, version, unlimitedTestMode: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid request." : "Generation failed. Your previous script was preserved." }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
