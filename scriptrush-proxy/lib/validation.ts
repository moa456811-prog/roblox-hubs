import type { HistoryEntry, RuntimeProfile, Source } from "./types.ts";

export const MAX_SCRIPT_LENGTH = 2_000_000;
export const MAX_PROFILE_LENGTH = 2_000_000;
export const MAX_HISTORY_IMPORT_LENGTH = 30_000_000;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function lineCount(script: string): number {
  return script.length ? script.split(/\r\n|\r|\n/).length : 0;
}

function safeJson(raw: string): unknown {
  return JSON.parse(raw, (key, value: unknown) => {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new ValidationError("The imported data contains an unsupported property.");
    }
    return value;
  });
}

function validId(value: unknown): value is string | number {
  return (typeof value === "string" && /^[1-9]\d*$/.test(value)) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

export function parseRuntimeProfile(input: string): RuntimeProfile {
  if (typeof input !== "string" || !input.trim()) throw new ValidationError("Paste a scanner report first.");
  if (input.length > MAX_PROFILE_LENGTH) throw new ValidationError("This scanner report is too large. Export a smaller scan and try again.");
  let raw = input.trim().replace(/^\uFEFF/, "");
  const marker = "[SCRIPTRUSH_RUNTIME_PROFILE]";
  if (raw.startsWith(marker)) raw = raw.slice(marker.length).trim();
  try {
    const profile = safeJson(raw);
    if (!isRecord(profile) || !isRecord(profile.game)) throw new Error("game");
    if (!validId(profile.game.placeId) && !validId(profile.game.universeId)) throw new Error("id");
    if (profile.game.placeId !== undefined && !validId(profile.game.placeId)) throw new Error("placeId");
    if (profile.game.universeId !== undefined && !validId(profile.game.universeId)) throw new Error("universeId");
    if (profile.game.name !== undefined && typeof profile.game.name !== "string") throw new Error("name");
    return profile as RuntimeProfile;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("Invalid scanner report. Paste the complete JSON report with a valid Place ID or Universe ID.");
  }
}

export function createProfileSource(profile: RuntimeProfile): Source {
  const content = JSON.stringify(profile);
  parseRuntimeProfile(content);
  return { name: "scriptrush-runtime-profile.json", content, size: new TextEncoder().encode(content).length };
}

// A small lexical check catches unfinished strings, delimiters and blocks. It does
// not execute Luau or claim to replace a Luau parser or a test inside the game.
function checkLexicalCompleteness(script: string): void {
  const brackets: string[] = [];
  const blocks: string[] = [];
  let awaitingLoopDo = 0;
  let previous = "";
  let last = "";
  let i = 0;
  const expressionStarts = new Set(["=", "return", "(", "[", ",", "+", "-", "*", "/", "and", "or"]);
  while (i < script.length) {
    const char = script[i];
    if (/\s/.test(char)) { i++; continue; }
    const comment = script.startsWith("--", i);
    const longStart = script.slice(i + (comment ? 2 : 0)).match(/^\[(=*)\[/);
    if (longStart) {
      const start = i + (comment ? 2 : 0) + longStart[0].length;
      const end = script.indexOf("]" + longStart[1] + "]", start);
      if (end < 0) throw new ValidationError("The script appears incomplete: an unfinished long string or comment was returned.");
      i = end + longStart[1].length + 2;
      if (!comment) { previous = "string"; last = "string"; }
      continue;
    }
    if (comment) { const end = script.indexOf("\n", i); i = end < 0 ? script.length : end + 1; continue; }
    if (char === "\"" || char === "'" || char === "`") {
      const quote = char;
      i++;
      let closed = false;
      while (i < script.length) {
        if (script[i] === "\\") { i += 2; continue; }
        if (script[i] === quote) { i++; closed = true; break; }
        i++;
      }
      if (!closed) throw new ValidationError("The script appears incomplete: an unfinished string was returned.");
      previous = "string"; last = "string"; continue;
    }
    if ("({[".includes(char)) brackets.push(char);
    else if (")}]".includes(char)) {
      const open = brackets.pop();
      if (!open || "({[".indexOf(open) !== ")}]".indexOf(char)) throw new ValidationError("The script appears incomplete: its brackets do not match.");
    }
    const word = script.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/)?.[0];
    if (word) {
      if (word === "function" || word === "repeat") blocks.push(word);
      else if (word === "if" && !expressionStarts.has(previous)) blocks.push(word);
      else if (word === "for" || word === "while") { blocks.push(word); awaitingLoopDo++; }
      else if (word === "do") { if (awaitingLoopDo) awaitingLoopDo--; else blocks.push(word); }
      else if (word === "end") {
        if (!blocks.length || blocks.pop() === "repeat") throw new ValidationError("The script contains an unmatched end statement.");
      } else if (word === "until") {
        if (blocks.pop() !== "repeat") throw new ValidationError("The script contains an unmatched until statement.");
      }
      previous = word; last = word; i += word.length; continue;
    }
    previous = char; last = char; i++;
  }
  if (brackets.length || blocks.length) throw new ValidationError("The script appears incomplete: a code block or bracket was left open.");
  if (["=", "+", "-", "*", "/", ".", ",", ":", "then", "do", "function", "local", "and", "or"].includes(last)) {
    throw new ValidationError("The script appears incomplete: the final statement is unfinished.");
  }
}

export function validateScript(script: string): string {
  if (typeof script !== "string" || !script.trim()) throw new ValidationError("No complete script returned. Your previous script was preserved.");
  if (script.length > MAX_SCRIPT_LENGTH) throw new ValidationError("The returned script is too large to display safely.");
  const code = script.trim();
  if (/\b(?:YOUR_REMOTE\w*|INSERT_REMOTE\w*|REPLACE_WITH\w*|TODO)\b/i.test(code)) throw new ValidationError("The script contains unresolved placeholders. Your previous script was preserved.");
  if (/(?:^|\n)\s*(?:\.\.\.|…)[ \t]*(?:\n|$)/.test(code) || /--[^\n]*(?:rest of (?:the )?code|code (?:omitted|continues)|omitted for brevity|continue (?:the )?(?:script|code)|remaining code here)/i.test(code)) {
    throw new ValidationError("The script appears truncated. Your previous script was preserved.");
  }
  checkLexicalCompleteness(code);
  return code;
}

export function parseScriptResponse(raw: string, metadata: Record<string, unknown> = {}): string {
  const review = isRecord(metadata.review) ? metadata.review : null;
  if (metadata.model === "scriptrush-resilient-fallback" || review?.strategy === "deterministic-fallback" ||
    (typeof raw === "string" && /--\s*ScriptRush resilient fallback\b/i.test(raw))) {
    throw new ValidationError("The model provider is unavailable and returned a generic fallback that does not match your request. Your request and previous script were preserved. Please try again.");
  }
  if (review?.passed === false) {
    throw new ValidationError("The returned script still has unresolved review issues. Your request and previous script were preserved. Please try again.");
  }
  if (metadata.finish_reason === "length" || metadata.finishReason === "length" || metadata.truncated === true) {
    throw new ValidationError("The model returned an incomplete response. Your previous script was preserved.");
  }
  if (typeof raw !== "string" || !raw.trim()) throw new ValidationError("No complete script returned. Your previous script was preserved.");
  const fences = [...raw.matchAll(/^\s*```([^\r\n`]*)\r?\n?/gm)];
  if (fences.length !== 2 || !/^\s*(?:lua|luau)\s*$/i.test(fences[0][1]) || fences[1][1].trim() !== "") {
    throw new ValidationError("The response must contain one complete Lua or Luau code block. Your previous script was preserved.");
  }
  const start = (fences[0].index ?? 0) + fences[0][0].length;
  return validateScript(raw.slice(start, fences[1].index));
}

export function normalizeHistoryEntry(value: unknown): HistoryEntry {
  if (!isRecord(value)) throw new ValidationError("Invalid history entry.");
  const strings = ["id", "createdAt", "gameName", "placeId", "prompt", "script"] as const;
  for (const key of strings) if (typeof value[key] !== "string") throw new ValidationError("History contains an invalid " + key + ".");
  if (!value.id || (value.id as string).length > 200 || !Number.isFinite(Date.parse(value.createdAt as string))) throw new ValidationError("History contains an invalid ID or date.");
  if (value.type !== "generated" && value.type !== "fixed") throw new ValidationError("History contains an unsupported version type.");
  if (!(value.script as string).trim() || (value.script as string).length > MAX_SCRIPT_LENGTH) throw new ValidationError("History contains an empty or oversized script.");
  if ((value.placeId as string) && !validId(value.placeId)) throw new ValidationError("History contains an invalid Place ID.");
  if (value.sourceVersionId != null && typeof value.sourceVersionId !== "string") throw new ValidationError("History contains an invalid source version.");
  if (typeof value.runtimeProfileUsed !== "boolean") throw new ValidationError("History contains an invalid profile flag.");
  return {
    id: value.id as string, createdAt: value.createdAt as string,
    type: value.type, gameName: value.gameName as string, placeId: value.placeId as string,
    prompt: value.prompt as string, script: value.script as string,
    sourceVersionId: (value.sourceVersionId as string | null | undefined) ?? null,
    runtimeProfileUsed: value.runtimeProfileUsed,
    lineCount: lineCount(value.script as string), characterCount: (value.script as string).length,
  };
}

export function parseHistoryImport(raw: string): HistoryEntry[] {
  if (typeof raw !== "string" || raw.length > MAX_HISTORY_IMPORT_LENGTH) throw new ValidationError("This history file is too large.");
  let parsed: unknown;
  try { parsed = safeJson(raw); } catch { throw new ValidationError("Invalid history JSON. Nothing was imported."); }
  if (isRecord(parsed) && parsed.version !== 2 && parsed.schemaVersion !== 2) throw new ValidationError("This history version is not supported.");
  const entries = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.entries : null;
  if (!Array.isArray(entries) || entries.length > 500) throw new ValidationError("Invalid history file. Nothing was imported.");
  return entries.map(normalizeHistoryEntry);
}
