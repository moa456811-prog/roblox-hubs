/** Local transport recovery, never a model call or a completion of missing data. */
export const COMPOSITION_JSON_LIMITS = Object.freeze({
  maxCharacters: 300_000,
  maxTokens: 50_000,
  maxDepth: 64,
  maxCommaEdits: 8,
});

type Token = { kind: "string" | "number" | "literal" | "punctuation"; text: string; start: number; end: number };
type Edit = { start: number; end: number; value: "," | "" };
function failure(reason: string): never { throw new SyntaxError(`INVALID_COMPOSITION_JSON: ${reason}`); }
const whitespace = (character: string) => /[\u0020\t\r\n]/.test(character);

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < raw.length) {
    if (whitespace(raw[position])) { position++; continue; }
    const start = position;
    let kind: Token["kind"];
    if (raw[position] === '"') {
      kind = "string";
      position++;
      let closed = false;
      while (position < raw.length) {
        const character = raw[position++];
        if (character === "\\") {
          if (position >= raw.length) failure("unterminated string");
          position++;
        } else if (character === '"') { closed = true; break; }
      }
      if (!closed) failure("unterminated string");
      // JSON.parse validates escapes/control characters without rewriting them.
      try { JSON.parse(raw.slice(start, position)); } catch { failure("invalid string"); }
    } else if ("{}[],:".includes(raw[position])) {
      kind = "punctuation";
      position++;
    } else {
      const value = raw.slice(position).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/)?.[0];
      if (!value) failure("invalid token");
      kind = /^(?:true|false|null)$/.test(value) ? "literal" : "number";
      position += value.length;
    }
    tokens.push({ kind, text: raw.slice(start, position), start, end: position });
    if (tokens.length > COMPOSITION_JSON_LIMITS.maxTokens) failure("token limit");
  }
  return tokens;
}

/** Read the grammar and preserve every token. Only comma positions can change. */
function commaEdits(raw: string, tokens: Token[], recover: boolean): Edit[] {
  const edits: Edit[] = [];
  let position = 0;
  const current = () => tokens[position];
  const is = (text: string) => current()?.text === text;
  const edit = (value: Edit) => {
    if (!recover) failure("unexpected separator");
    if (edits.length >= COMPOSITION_JSON_LIMITS.maxCommaEdits) failure("comma edit limit");
    edits.push(value);
  };
  const startsValue = (token?: Token) => Boolean(token && (token.kind !== "punctuation" || token.text === "[" || token.text === "{"));
  const insertComma = () => {
    const previous = tokens[position - 1], next = current();
    if (!previous || !next) failure("missing value");
    // Adjacent primitive lexemes could instead be a damaged number/string.
    // Container boundaries such as }{ and ][ are unambiguous token boundaries.
    if (previous.end === next.start && previous.text !== "]" && previous.text !== "}") failure("ambiguous separator");
    edit({ start: next.start, end: next.start, value: "," });
  };
  const value = (depth: number): void => {
    if (depth > COMPOSITION_JSON_LIMITS.maxDepth) failure("depth limit");
    const token = current();
    if (!token) failure("truncated value");
    if (token.kind !== "punctuation") { position++; return; }
    if (is("{")) {
      position++;
      const keys = new Set<string>();
      if (is("}")) { position++; return; }
      while (true) {
        const key = current();
        if (!key || key.kind !== "string") failure("object key required");
        const decoded = JSON.parse(key.text) as string;
        if (keys.has(decoded)) failure("duplicate object key");
        keys.add(decoded);
        position++;
        if (!is(":")) failure("object colon required");
        position++;
        value(depth + 1);
        if (is("}")) { position++; return; }
        if (is(",")) {
          const comma = current()!;
          position++;
          if (is("}")) { edit({ start: comma.start, end: comma.end, value: "" }); position++; return; }
        } else if (current()?.kind === "string" && tokens[position + 1]?.text === ":") insertComma();
        else failure("object separator required");
      }
    }
    if (is("[")) {
      position++;
      if (is("]")) { position++; return; }
      while (true) {
        value(depth + 1);
        if (is("]")) { position++; return; }
        if (is(",")) {
          const comma = current()!;
          position++;
          if (is("]")) { edit({ start: comma.start, end: comma.end, value: "" }); position++; return; }
        } else if (startsValue(current())) insertComma();
        else failure("array separator required");
      }
    }
    failure("unexpected punctuation");
  };
  value(0);
  if (position !== tokens.length) failure("multiple root values");
  return edits;
}

/** Strict JSON wins. Recovery cannot add keys, values, quotes or closing brackets.
 * Duplicate decoded keys are refused on both paths to avoid silent overwrites.
 */
export function parseCompositionJson(content: string): unknown {
  if (content.length > COMPOSITION_JSON_LIMITS.maxCharacters) failure("character limit");
  const raw = content.trim().replace(/^```json\s*\n/i, "").replace(/\n```\s*$/, "");
  let strict: unknown;
  let valid = false;
  try { strict = JSON.parse(raw); valid = true; } catch { /* Only local comma recovery follows. */ }
  const tokens = tokenize(raw);
  const edits = commaEdits(raw, tokens, !valid);
  if (valid) return strict;
  if (!edits.length) failure("invalid JSON");
  let repaired = "", previous = 0;
  for (const change of edits) {
    repaired += raw.slice(previous, change.start) + change.value;
    previous = change.end;
  }
  repaired += raw.slice(previous);
  try { return JSON.parse(repaired); } catch { return failure("invalid JSON after comma recovery"); }
}
