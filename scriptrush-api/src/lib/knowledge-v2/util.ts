import { createHash } from "node:crypto";
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const stableJson = (value: unknown): string => JSON.stringify(value, (_key, current) => current && typeof current === "object" && !Array.isArray(current) ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : current);
export const clone = <T>(value: T): T => structuredClone(value);
export function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const item of Object.values(value)) deepFreeze(item); Object.freeze(value); } return value; }
export function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error("INVALID_KNOWLEDGE_BOUND");
  return value;
}
export class BoundedCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  readonly maximum: number;
  constructor(maximum = 128) { if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1024) throw new Error("INVALID_CACHE_BOUND"); this.maximum = maximum; }
  get(key: string, now: number): T | undefined { const row = this.entries.get(key); if (!row) return; if (row.expires <= now) { this.entries.delete(key); return; } this.entries.delete(key); this.entries.set(key, row); return clone(row.value); }
  set(key: string, value: T, expires: number): void { this.entries.delete(key); this.entries.set(key, { value: clone(value), expires }); while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value!); }
  get size(): number { return this.entries.size; }
}
/** Fixed public origins only; bounded bytes, time, redirects and no credentials. */
export async function publicJson(url: string, options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal; timeoutMs?: number; maximumBytes?: number } = {}): Promise<{ value: unknown; hash: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["apis.roblox.com", "games.roblox.com", "api.github.com"].includes(parsed.hostname)) throw new Error("PUBLIC_ORIGIN_FORBIDDEN");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  const cancel = () => controller.abort(); options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, { redirect: "error", credentials: "omit", signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "ScriptRushKnowledge/2.0" } });
    if (!response.ok) throw new Error("PUBLIC_METADATA_UNAVAILABLE");
    const maximum = options.maximumBytes ?? 512_000;
    if (Number(response.headers.get("content-length")) > maximum) throw new Error("PUBLIC_RESPONSE_TOO_LARGE");
    if (!response.body) throw new Error("PUBLIC_RESPONSE_EMPTY");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > maximum) throw new Error("PUBLIC_RESPONSE_TOO_LARGE"); chunks.push(next.value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
    const raw = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)), hash: sha256(raw) };
  } finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", cancel); }
}
