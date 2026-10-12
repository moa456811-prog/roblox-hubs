import type { GenerationUsage } from "./types.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function parseGenerationUsage(value: unknown): GenerationUsage | undefined {
  if (!isRecord(value)) return;
  const { modelCalls, inputCharacters, outputCharacters } = value;
  if (![modelCalls, inputCharacters, outputCharacters].every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) return;
  return { modelCalls: modelCalls as number, inputCharacters: inputCharacters as number, outputCharacters: outputCharacters as number };
}

// Review diagnostics are plain text only. Provider error bodies and arbitrary
// top-level "issues" are never displayed to the browser user.
export function parseReviewIssues(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.issues)) return [];
  const issues: string[] = [];
  for (const issue of value.issues.slice(0, 30)) {
    if (typeof issue !== "string" || issue.length > 4_000) continue;
    const safe = issue
      .replace(/<[^>]*>/g, " ")
      .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")
      .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[link removed]")
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!safe) continue;
    const bounded = safe.length > 240 ? safe.slice(0, 239).trimEnd() + "…" : safe;
    if (!issues.includes(bounded)) issues.push(bounded);
    if (issues.length === 4) break;
  }
  return issues;
}

export function requirementsFailureMessage(issues: string[], usage?: GenerationUsage): string {
  const checks = issues.length ? ` Failed checks: ${issues.join("; ")}.` : " The service could not confirm all requested features and UI details.";
  const calls = usage ? ` AI calls: ${usage.modelCalls}.` : "";
  return "Script validation stopped. Your input and previous script were preserved." + checks + calls + " Review these checks before starting another generation.";
}
