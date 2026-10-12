/** Accept the one complete Lua/Luau fence promised by the generation contract. */
export function extractCode(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const fences = normalized.match(/^[\t ]*```/gm);
  if (fences?.length !== 2) return "";
  const block = normalized.match(/(?:^|\n)[\t ]*```(?:luau|lua)[\t ]*\n([\s\S]*?)\n[\t ]*```[\t ]*(?=\n|$)/i);
  return block?.[1]?.trim() || "";
}

/** Static checks are useful rejection signals, not a Roblox execution test. */
export function reviewScript(code: string, current = "", patch = false): string[] {
  const issues: string[] = [];
  if (!code.trim()) issues.push("no complete Lua or Luau code block returned");
  if (/YOUR_REMOTE|INSERT_REMOTE|REPLACE_WITH|TODO\s*:|implement here|adapter\.[A-Za-z_]+\s*\(/i.test(code)) issues.push("unresolved placeholder or abstract adapter");
  if (/loadstring\s*\(\s*game:HttpGet/i.test(code)) issues.push("external loader instead of self-contained code");
  if (!/game:GetService|Players\s*=|Instance\.new/.test(code)) issues.push("not a complete Roblox script");
  if (patch && current.length > 2000 && code.length < Math.min(1500, current.length * .38)) issues.push("patch replaced too much of the current script");
  return issues;
}

/** Return only known diagnostic codes; provider bodies and credentials stay private. */
export function providerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^(?:AI_TIMEOUT|AI_NOT_CONFIGURED|AI_ERROR_\d{3}|AI_RETRYABLE_\d{3}|RATE_LIMITED|EMPTY_AI)$/.test(message)
    ? message
    : "AI_ERROR";
}
