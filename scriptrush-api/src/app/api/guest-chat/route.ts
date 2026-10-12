import { NextResponse } from "next/server";
import { z } from "zod";
import { runOpenRouter } from "@/lib/openrouter";
import { extractCode, reviewScript as review, providerErrorCode } from "@/lib/script-output";
export const maxDuration = 300;

const sourceSchema = z.object({ name: z.string().min(1).max(200), content: z.string().max(80_000), size: z.number().nonnegative().max(750_000) });
const inputSchema = z.object({ clientId: z.string().uuid().optional(), game: z.string().trim().max(240).default(""), placeId: z.string().trim().max(40).default(""), mode: z.enum(["build", "fix", "improve", "ui"]).default("build"), prompt: z.string().trim().min(1).max(16_000), sources: z.array(sourceSchema).max(6).default([]), currentScript: z.string().max(160_000).optional(), runtimeDiagnostic: z.string().max(100_000).optional() });
type Profile = { gameKey?: string; name?: string; placeId?: string; universeId?: string; description?: string; confidence?: string; featureSignals?: Array<{ feature?: string; confidence?: string; score?: number }>; sourceCounts?: { scriptBlox?: number; github?: number }; publicScripts?: Array<{ kind?: string; title?: string; url?: string }>; [key: string]: unknown };
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
  try {
    const input = inputSchema.parse(await request.json()); const current = (input.currentScript || "").trim();
    const patch = Boolean(current && (input.mode === "fix" || errorLike(input.prompt) || /\b(fix|repair|corrige|répare|modifie|improve|améliore)\b/i.test(input.prompt)));
    const profile = await research(request, input.game); const key = gameKey(profile, input.game, input.placeId);
    const signals = profile?.featureSignals || []; const supported = signals.filter((x) => x.confidence === "high" || x.confidence === "medium").map((x) => x.feature).filter(Boolean).slice(0, 8);
    const plan = { mode: patch ? "patch-existing" : "single-pass-build", requested: input.prompt.slice(0, 2000), supportedFeatures: supported, sourceCounts: profile?.sourceCounts || { scriptBlox: 0, github: 0 } };
    const ledger = signals.slice(0, 12).map((x) => `${x.feature || "Unknown"}: ${x.confidence || "low"} (${x.score || 0})`).join("\n") || "No reliable game-specific feature signals found.";
    const sourceBlock = input.sources.map((x) => `--- ${x.name} ---\n${x.content}`).join("\n\n");
    const profileBlock = JSON.stringify({ name: profile?.name || input.game, placeId: profile?.placeId || input.placeId, universeId: profile?.universeId, description: profile?.description, confidence: profile?.confidence, sourceCounts: profile?.sourceCounts }, null, 2).slice(0, 10000);
    const system = patch ? "You are ScriptRush FIX MODE. Patch the exact existing Roblox Luau script. Preserve all unrelated working UI, settings and features. Make the smallest robust correction and return the FULL corrected script. Never replace it with a generic rewrite. Never invent remotes or payloads. Return exactly one fenced lua block and nothing else." : "You are ScriptRush, a senior Roblox Luau engineer. Return one self-contained executor-ready script. Add game-specific behavior only when explicitly requested AND supported by the evidence ledger or supplied runtime evidence. Evidence validates availability; it never expands the user's requested scope. A request for UI only must produce UI only: no farm, loot, combat, movement, teleportation or gameplay automation. Complete short UI scripts are valid. Without private files, use client-observable runtime discovery, bounded scans, events, respawn recovery and cleanup only where the requested behavior needs them. Never invent remotes or payloads. No placeholders, TODOs, external loaders, modules or split files. Generated UI must be compact black/white with English labels. Keep it concise enough to finish. Return exactly one fenced lua block and nothing else.";
    const user = patch ? `GAME:\n${profileBlock}\n\nFEATURES:\n${ledger}\n\nERROR/CHANGE:\n${input.prompt}\n\nDIAGNOSTIC:\n${(input.runtimeDiagnostic || "none")}\n\nFILES:\n${sourceBlock || "none"}\n\nCURRENT SCRIPT:\n\`\`\`lua\n${current}\n\`\`\`\nReturn the full corrected same script.` : `GAME:\n${profileBlock}\n\nFEATURES:\n${ledger}\n\nPLAN:\n${JSON.stringify(plan,null,2)}\n\nDIAGNOSTIC:\n${(input.runtimeDiagnostic || "none")}\n\nFILES:\n${sourceBlock || "none"}\n\nREQUEST:\n${input.prompt}\nReturn one complete Lua block only.`;
    let code = "", model = "", incomplete = false, providerError = "", repairError = "";
    try { const result = await runOpenRouter(system, user, patch ? 8500 : 6500); code = extractCode(result.content); model = result.model; incomplete = result.incomplete; }
    catch (error) { providerError = providerErrorCode(error); }
    let issues = review(code, current, patch);
    if ((incomplete || issues.length) && code) {
      try { const repaired = await runOpenRouter("You are ScriptRush final Luau repair. Return exactly one complete fenced lua block. Fix only the listed issues, preserve useful behavior, respect the user's exact requested scope, and add no placeholders or invented remotes. UI-only requests must remain UI only.", `ISSUES:\n${issues.join("\n") || "possibly truncated"}\n\nREQUEST:\n${input.prompt}\n\nSCRIPT:\n\`\`\`lua\n${code}\n\`\`\``, patch ? 7500 : 5200); const candidate = extractCode(repaired.content); const next = review(candidate, current, patch); if (candidate && next.length <= issues.length) { code = candidate; issues = next; model = repaired.model; incomplete = repaired.incomplete; } } catch (error) { repairError = providerErrorCode(error); }
    }
    if (incomplete) issues.push("provider response was incomplete");
    if (!code || issues.length) {
      const reason = providerError || (incomplete ? "INCOMPLETE_RESPONSE" : "INVALID_MODEL_OUTPUT");
      const error = patch && current
        ? "ScriptRush could not safely correct your script. Your current script was preserved. Retry the same request."
        : providerError === "RATE_LIMITED"
          ? "The free AI model is temporarily busy. Your request was preserved; try again."
          : providerError === "AI_TIMEOUT"
            ? "The AI model timed out. Your request was preserved; try again."
            : "The AI model did not return a complete valid script. Your request was preserved; try again.";
      return NextResponse.json({ error, code: patch && current ? "PATCH_PRESERVED" : "GENERATION_REJECTED", reason, model: model || null, patchMode: patch, review: { passed: false, issues, providerIncomplete: incomplete, providerError: providerError || null, repairError: repairError || null, strategy: "single-pass-static-review" } }, { status: 502 });
    }
    const reviewResult = { passed: true, issues, providerIncomplete: incomplete, providerError: null, repairError: repairError || null, strategy: "single-pass-static-review" };
    const version = input.clientId ? await save(request, { op: "version_add", clientId: input.clientId, gameKey: key, mode: patch ? "fix" : input.mode, request: input.prompt, script: code, plan, review: reviewResult }) : null;
    return NextResponse.json({ message: `\`\`\`lua\n${code}\n\`\`\``, status: "ok", model, research: profile ? { ...profile, gameKey: key } : { gameKey: key }, gameKey: key, plan, review: reviewResult, patchMode: patch, version, unlimitedTestMode: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "RATE_LIMITED" ? "The free AI route is temporarily busy. Try again." : message === "AI_TIMEOUT" ? "The AI provider stayed unavailable after the automatic retry. Try again." : message === "AI_NOT_CONFIGURED" ? "The AI provider is not configured." : "Generation failed. Try again." }, { status: 502 });
  }
}
