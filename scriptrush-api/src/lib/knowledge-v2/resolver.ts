import type { GameIdentity, SourceLink } from "./types.ts";
import { BoundedCache, boundedInteger, publicJson, clone } from "./util.ts";
export class GameIdentityCache extends BoundedCache<GameIdentity> {}
const defaultCache = new GameIdentityCache();
export type ResolveOptions = { fetch?: typeof globalThis.fetch; signal?: AbortSignal; now?: () => number; cache?: GameIdentityCache; ttlMs?: number; timeoutMs?: number };
const safeId = (value: unknown): string | null => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) ? value : typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
export function parsePlaceInput(input: string): string {
  if (typeof input !== "string" || input.length > 1024) throw new Error("INVALID_PLACE_INPUT");
  const value = input.trim(); if (/^[1-9]\d{0,18}$/.test(value)) return value;
  let url: URL; try { url = new URL(value); } catch { throw new Error("INVALID_PLACE_INPUT"); }
  const path = url.pathname.match(/^\/games\/([1-9]\d{0,18})(?:\/[A-Za-z0-9%._~-]*)?\/?$/);
  if (!/^https:\/\/(?:www\.|web\.)?roblox\.com\//i.test(value) || /[\x00-\x20\x7f]/.test(value) || url.protocol !== "https:" || !["roblox.com", "www.roblox.com", "web.roblox.com"].includes(url.hostname) || url.username || url.password || url.port || /%2f|%5c|\\/i.test(value) || !path) throw new Error("INVALID_PLACE_INPUT");
  return path[1];
}
/** Metadata proves public identity only, never remotes, functionality or support. */
export async function resolveGameIdentity(input: string, options: ResolveOptions = {}): Promise<GameIdentity> {
  const placeId = parsePlaceInput(input), now = (options.now ?? Date.now)();
  if (!Number.isFinite(now)) throw new Error("INVALID_RESOLVER_CLOCK");
  const ttl = boundedInteger(options.ttlMs, 300_000, 1000, 1_800_000), timeoutMs = boundedInteger(options.timeoutMs, 5000, 100, 10_000);
  const cache = options.cache ?? (options.fetch ? new GameIdentityCache() : defaultCache), key = "identity-v2:" + placeId;
  const cached = cache.get(key, now); if (cached) return cached;
  const result: GameIdentity = { status: "UNKNOWN", placeId, universeId: null, name: null, description: "", publicUpdatedAt: null, provenance: [], unknowns: ["Game-specific remotes, arguments, mechanics and live functionality are UNKNOWN."], retrievedAt: null, expiresAt: null };
  const provenance = (url: string, hash: string, title: string): SourceLink => ({ id: "public-" + hash.slice(0, 16), title, url, kind: "public-metadata", status: "observed", sha256: hash });
  try {
    const universeUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universe = await publicJson(universeUrl, { ...options, timeoutMs });
    const universeId = safeId((universe.value as { universeId?: unknown })?.universeId); if (!universeId) throw new Error("UNIVERSE_ID_UNKNOWN");
    result.universeId = universeId; result.provenance.push(provenance(universeUrl, universe.hash, "Public place to universe mapping"));
    const gamesUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
    const games = await publicJson(gamesUrl, { ...options, timeoutMs });
    const items = (games.value as { data?: unknown })?.data;
    if (!Array.isArray(items)) throw new Error("PUBLIC_GAME_UNKNOWN");
    const matching = items.filter(item => item && typeof item === "object" && safeId(item.id) === universeId);
    if (matching.length !== 1 || typeof matching[0].name !== "string" || !matching[0].name.trim()) throw new Error("PUBLIC_GAME_UNKNOWN");
    const game = matching[0]; result.status = "observed"; result.name = game.name.slice(0, 180);
    result.description = typeof game.description === "string" ? game.description.slice(0, 2500) : "";
    result.publicUpdatedAt = typeof game.updated === "string" && Number.isFinite(Date.parse(game.updated)) ? new Date(game.updated).toISOString() : null;
    result.provenance.push(provenance(gamesUrl, games.hash, "Public universe metadata"));
    result.retrievedAt = new Date(now).toISOString(); result.expiresAt = new Date(now + ttl).toISOString();
  } catch { result.unknowns.push("Public metadata unavailable or inconsistent; no game name or mechanics were inferred."); }
  cache.set(key, result, now + (result.status === "observed" ? ttl : Math.min(ttl, 10_000)));
  return clone(result);
}
