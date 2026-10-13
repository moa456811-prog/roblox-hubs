import "server-only";
import { randomUUID } from "node:crypto";
import { buildSourceKnowledge, exactGameSearchMatch, githubResearchQueries, normalizeGameName, SharedResearchCache, sourceHash, type PublicReference, type ResearchKnowledge } from "./source-knowledge.ts";
export type { PublicReference, ResearchKnowledge } from "./source-knowledge.ts";

export type FeatureSignal = { feature: string; confidence: "high" | "medium" | "low"; score: number; sources: string[] };
export type ResearchProfile = {
  query: string; name: string; placeId?: string; universeId?: string; description: string;
  creator?: unknown; created?: unknown; updated?: unknown; playing?: unknown; visits?: unknown; maxPlayers?: unknown; genre?: unknown;
  confidence: "high" | "medium" | "low"; featureSignals: FeatureSignal[]; publicScripts: PublicReference[];
  sourceCounts: { scriptBlox: number; github: number }; warnings: string[]; researchedAt: string;
  /** Server-only source excerpts: deliberately omitted by publicResearchView. */
  knowledgeContext: string; researchKnowledge: ResearchKnowledge;
};
export type ResearchOptions = { placeId?: string; signal?: AbortSignal };
const researchCache = new SharedResearchCache<ResearchProfile>(600_000, 40);
const validId = (value: unknown): string | undefined => {
  const text = String(value ?? "");
  return /^[1-9]\d{0,19}$/.test(text) ? text : undefined;
};
function extractPlaceId(value: string) { return validId(value.trim()) || validId(value.match(/roblox\.com\/games\/(\d+)/i)?.[1]); }
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

async function boundedText(response: Response, maximum: number): Promise<string> {
  if (!response.ok || Number(response.headers.get("content-length") || 0) > maximum || !response.body) throw new Error("RESEARCH_RESPONSE_REJECTED");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new Error("RESEARCH_RESPONSE_TOO_LARGE"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
async function textRequest(url: string | URL, signal: AbortSignal, maximum: number, headers?: HeadersInit): Promise<string> {
  return boundedText(await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), ...(headers ? { headers } : {}) }), maximum);
}
async function jsonRequest(url: string | URL, signal: AbortSignal, maximum = 300_000, headers?: HeadersInit): Promise<any> {
  return JSON.parse(await textRequest(url, signal, maximum, headers));
}
function collectSearchResults(value: unknown, out: Array<Record<string, unknown>>, depth = 0) {
  if (depth > 12 || out.length >= 100) return;
  if (Array.isArray(value)) { for (const item of value.slice(0, 100)) collectSearchResults(item, out, depth + 1); return; }
  const item = record(value);
  const name = typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : undefined;
  const universeId = validId(item.universeId ?? item.universeID ?? item.universe_id);
  const placeId = validId(item.placeId ?? item.rootPlaceId ?? item.placeID ?? item.place_id);
  if (name && (universeId || placeId)) out.push({ name, universeId, placeId });
  for (const child of Object.values(item)) if (child && typeof child === "object") collectSearchResults(child, out, depth + 1);
}
async function universeFromPlace(placeId: string, signal: AbortSignal) {
  try { return validId((await jsonRequest(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, signal)).universeId); }
  catch { return undefined; }
}
async function gameDetails(universeId: string, signal: AbortSignal) {
  try { return record((await jsonRequest(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`, signal)).data?.[0]); }
  catch { return null; }
}
async function resolveGame(query: string, options: ResearchOptions, signal: AbortSignal) {
  // An already selected place is authoritative; a second name search cannot
  // silently replace it with another similarly named game or a root place.
  let placeId = validId(options.placeId) || extractPlaceId(query), universeId: string | undefined, candidateName = "";
  if (placeId) universeId = await universeFromPlace(placeId, signal);
  else {
    try {
      const endpoint = new URL("https://apis.roblox.com/search-api/omni-search");
      endpoint.searchParams.set("searchQuery", query); endpoint.searchParams.set("sessionId", randomUUID()); endpoint.searchParams.set("pageType", "all");
      const matches: Array<Record<string, unknown>> = [];
      collectSearchResults(await jsonRequest(endpoint, signal, 1_000_000), matches);
      const first = exactGameSearchMatch(query, matches);
      if (first) { candidateName = String(first.name); placeId = validId(first.placeId); universeId = validId(first.universeId); }
    } catch { /* Unresolved identity remains explicit in the returned profile. */ }
  }
  if (!universeId && placeId) universeId = await universeFromPlace(placeId, signal);
  const details = universeId ? await gameDetails(universeId, signal) : null;
  if (!placeId) placeId = validId(details?.rootPlaceId);
  return { placeId, universeId, candidateName, details };
}

async function searchScriptBlox(gameName: string, placeId: string | undefined, signal: AbortSignal): Promise<PublicReference[]> {
  const results: PublicReference[] = [];
  try {
    const endpoint = new URL("https://scriptblox.com/api/script/search");
    for (const [key, value] of Object.entries({ q: gameName || placeId || "roblox", max: "10", mode: "free", verified: "1", patched: "0", sortBy: "updatedAt", order: "desc", strict: "false" })) endpoint.searchParams.set(key, value);
    if (placeId) endpoint.searchParams.set("placeId", placeId);
    const data = await jsonRequest(endpoint, signal, 2_000_000, { "User-Agent": "ScriptRush/0.6" });
    const scripts = Array.isArray(data?.result?.scripts) ? data.result.scripts.slice(0, 8) : [];
    for (const raw of scripts) {
      const script = record(raw), game = record(script.game), scriptGame = typeof game.name === "string" ? game.name : "";
      const source = typeof script.script === "string" ? script.script : "";
      if (source.length < 40 || source.length > 120_000) continue;
      const sourcePlace = validId(game.placeId ?? game.gameId), sourceUniverse = validId(game.universeId);
      const matchingPlace = Boolean(placeId && sourcePlace === placeId);
      if (!matchingPlace && (!scriptGame || normalizeGameName(scriptGame) !== normalizeGameName(gameName))) continue;
      const slug = typeof script.slug === "string" && /^[A-Za-z0-9_-]{1,240}$/.test(script.slug) ? script.slug : undefined;
      if (!slug) continue;
      results.push({ kind: "scriptblox", title: String(script.title || "Public script").slice(0, 180), url: `https://scriptblox.com/script/${slug}`, snippet: source, verified: script.verified === true, patched: script.isPatched === true, game: scriptGame, placeId: sourcePlace, universeId: sourceUniverse, contentHash: sourceHash(source) });
    }
  } catch { /* Independent sources may still yield usable knowledge. */ }
  return results;
}
const githubHeaders = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ScriptRush" };
const gameNameFromLabel = (label: string, target: string): string | undefined => {
  const candidate = label.replace(/\.(lua|luau)$/i, "").replace(/(?:[-_ ](?:roblox|scripts?|hubs?))+$/i, "");
  return normalizeGameName(candidate) === normalizeGameName(target) ? candidate : undefined;
};
async function searchGithub(gameName: string, placeId: string | undefined, signal: AbortSignal): Promise<PublicReference[]> {
  const queries = githubResearchQueries(gameName, placeId);
  const found = await Promise.all(queries.map(async query => {
    try {
      const endpoint = new URL("https://api.github.com/search/repositories");
      endpoint.searchParams.set("q", query); endpoint.searchParams.set("sort", "stars"); endpoint.searchParams.set("order", "desc"); endpoint.searchParams.set("per_page", "5");
      const data = await jsonRequest(endpoint, signal, 1_000_000, githubHeaders);
      return Array.isArray(data.items) ? data.items : [];
    } catch { return []; }
  }));
  const repos = [...new Map(found.flat().map(item => [String(item.full_name), item])).values()].filter(repo => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo.full_name))).slice(0, 3);
  const references = await Promise.all(repos.map(async repo => {
    try {
      const repoName = String(repo.full_name), branch = String(repo.default_branch || "main");
      const commit = await jsonRequest(`https://api.github.com/repos/${repoName}/commits/${encodeURIComponent(branch)}`, signal, 500_000, githubHeaders);
      const revision = String(commit.sha || ""), treeSha = String(commit.commit?.tree?.sha || "");
      if (!/^[a-f0-9]{40}$/i.test(revision) || !/^[a-f0-9]{40}$/i.test(treeSha)) return [];
      const tree = await jsonRequest(`https://api.github.com/repos/${repoName}/git/trees/${treeSha}?recursive=1`, signal, 2_000_000, githubHeaders);
      const files = (Array.isArray(tree.tree) ? tree.tree : []).filter((file: any) => file.type === "blob" && /\.(lua|luau)$/i.test(String(file.path)) && Number(file.size) > 0 && Number(file.size) <= 120_000 && !String(file.path).split(/[\\/]/).some((part: string) => part === ".." || part === "."))
        .sort((left: any, right: any) => {
          const score = (file: any) => (gameNameFromLabel(String(file.path).split("/").pop() || "", gameName) ? 4 : 0) + (/(hub|script|auto|farm|boss|quest|main)/i.test(String(file.path)) ? 1 : 0);
          return score(right) - score(left);
        }).slice(0, 2);
      return (await Promise.all(files.map(async (file: any): Promise<PublicReference | null> => {
        try {
          const rawPath = String(file.path).split("/").map(encodeURIComponent).join("/");
          const source = await textRequest(`https://raw.githubusercontent.com/${repoName}/${revision}/${rawPath}`, signal, 120_000);
          if (source.length < 40) return null;
          return { kind: "github", title: `${repoName}/${file.path}`.slice(0, 180), url: `https://github.com/${repoName}/blob/${revision}/${rawPath}`, snippet: source, revision, contentHash: sourceHash(source), game: gameNameFromLabel(String(file.path).split("/").pop() || "", gameName) || gameNameFromLabel(String(repo.name || repoName.split("/")[1]), gameName) };
        } catch { return null; }
      }))).filter((item): item is PublicReference => item !== null);
    } catch { return []; }
  }));
  return references.flat().slice(0, 6);
}

/** These scores remain discovery hints; they do not determine action support. */
function buildFeatureSignals(evidence: PublicReference[]): FeatureSignal[] {
  const rules = [
    { feature: "Auto Farm", pattern: /auto\s*farm|farm\s*(?:mob|npc|level)|bring\s*mob/i },
    { feature: "Auto Quest", pattern: /auto\s*quest|quest\s*(?:farm|giver|npc)|complete\s*quest/i },
    { feature: "Auto Boss", pattern: /auto\s*boss|boss\s*(?:farm|select|spawn|respawn)/i },
    { feature: "Auto Loot", pattern: /auto\s*loot|collect\s*(?:loot|drop)|pickup|chest\s*(?:farm|collect)/i },
    { feature: "Dungeon/Raid", pattern: /dungeon|raid\s*(?:farm|auto|start)/i },
    { feature: "Fishing", pattern: /auto\s*fish|fishing|fish\s*(?:farm|rod)/i },
    { feature: "Auto Sell", pattern: /auto\s*sell|sell\s*(?:item|all)/i },
    { feature: "Skills", pattern: /auto\s*skill|skill\s*(?:spam|farm|use)/i },
    { feature: "Teleport/Movement", pattern: /teleport|tween(?:service)?|moveto|cframe\s*=/i },
    { feature: "Anti AFK", pattern: /anti\s*afk|idled|virtualuser/i },
    { feature: "Player/PvP", pattern: /player\s*farm|auto\s*pvp|\bpvp\b/i },
    { feature: "Fruit/Item Farm", pattern: /fruit\s*(?:farm|spawn|collect)|item\s*(?:farm|collect)/i },
  ];
  return rules.flatMap(rule => {
    const references = evidence.filter(reference => rule.pattern.test(reference.title + "\n" + reference.snippet));
    if (!references.length) return [];
    const score = references.reduce((sum, reference) => sum + (reference.kind === "scriptblox" && reference.verified && !reference.patched ? 3 : 1), 0);
    return [{ feature: rule.feature, score, confidence: score >= 3 ? "high" as const : score >= 2 ? "medium" as const : "low" as const, sources: references.slice(0, 5).map(reference => `${reference.kind}:${reference.title}`) }];
  });
}

async function loadResearch(query: string, options: ResearchOptions): Promise<ResearchProfile> {
  // Shared jobs have their own bound. A cancelled caller never cancels another
  // caller's work, and all nested source requests observe this common deadline.
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const resolved = await resolveGame(query, options, controller.signal), details = resolved.details;
    const name = typeof details?.name === "string" ? details.name : resolved.candidateName || query;
    const [scriptBlox, github] = await Promise.all([searchScriptBlox(name, resolved.placeId, controller.signal), searchGithub(name, resolved.placeId, controller.signal)]);
    const publicScripts = [...scriptBlox, ...github], warnings: string[] = [];
    if (!scriptBlox.length) warnings.push("No usable ScriptBlox source matched this game.");
    if (!github.length) warnings.push("No usable GitHub source was found or public search was rate limited.");
    const researchedAt = new Date().toISOString();
    const knowledge = buildSourceKnowledge({ name, placeId: resolved.placeId, universeId: resolved.universeId }, publicScripts, researchedAt);
    return { query, name, placeId: resolved.placeId, universeId: resolved.universeId, description: typeof details?.description === "string" ? details.description : "", creator: details?.creator, created: details?.created, updated: details?.updated, playing: details?.playing, visits: details?.visits, maxPlayers: details?.maxPlayers, genre: details?.genre, confidence: resolved.universeId ? "high" : resolved.placeId ? "medium" : "low", featureSignals: buildFeatureSignals(publicScripts), publicScripts, sourceCounts: { scriptBlox: scriptBlox.length, github: github.length }, warnings, researchedAt, ...knowledge };
  } finally { clearTimeout(timer); }
}
export async function researchGame(query: string, options: ResearchOptions = {}): Promise<ResearchProfile> {
  const trimmed = query.trim().slice(0, 180), placeId = validId(options.placeId) || extractPlaceId(trimmed);
  const cacheKey = placeId ? `place:${placeId}` : `name:${normalizeGameName(trimmed)}`;
  return researchCache.get(cacheKey, () => loadResearch(trimmed, { placeId }), options.signal);
}
export function publicResearchView(profile: ResearchProfile) {
  return { gameKey: gameKeyFor(profile), query: profile.query, name: profile.name, placeId: profile.placeId, universeId: profile.universeId, description: profile.description, creator: profile.creator, created: profile.created, updated: profile.updated, playing: profile.playing, visits: profile.visits, maxPlayers: profile.maxPlayers, genre: profile.genre, confidence: profile.confidence, featureSignals: profile.featureSignals, sourceCounts: profile.sourceCounts, publicScripts: profile.publicScripts.map(({ kind, title, url, verified, patched, game, revision, contentHash }) => ({ kind, title: title.slice(0, 180), url, verified, patched, game, revision, contentHash })), researchKnowledge: profile.researchKnowledge, warnings: profile.warnings, researchedAt: profile.researchedAt };
}
export function gameKeyFor(profile: Pick<ResearchProfile, "name" | "placeId" | "universeId">) {
  if (profile.universeId) return `universe:${profile.universeId}`;
  if (profile.placeId) return `place:${profile.placeId}`;
  return `name:${normalizeGameName(profile.name || "unknown").slice(0, 120) || "unknown"}`;
}
