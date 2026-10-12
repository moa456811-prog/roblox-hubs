import "server-only";
import { randomUUID } from "crypto";

export type PublicReference = {
  kind: "scriptblox" | "github";
  title: string;
  url: string;
  snippet: string;
  verified?: boolean;
  patched?: boolean;
  game?: string;
};

export type FeatureSignal = {
  feature: string;
  confidence: "high" | "medium" | "low";
  score: number;
  sources: string[];
};

export type ResearchProfile = {
  query: string;
  name: string;
  placeId?: string;
  universeId?: string;
  description: string;
  creator?: unknown;
  created?: unknown;
  updated?: unknown;
  playing?: unknown;
  visits?: unknown;
  maxPlayers?: unknown;
  genre?: unknown;
  confidence: "high" | "medium" | "low";
  featureSignals: FeatureSignal[];
  publicScripts: PublicReference[];
  sourceCounts: { scriptBlox: number; github: number };
  warnings: string[];
  researchedAt: string;
};

function extractPlaceId(value: string) {
  const query = value.trim();
  if (/^\d+$/.test(query)) return query;
  return query.match(/roblox\.com\/games\/(\d+)/i)?.[1] || null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function collectSearchResults(value: unknown, out: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const item of value) collectSearchResults(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;

  const item = value as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : undefined;
  const universeId = item.universeId ?? item.universeID ?? item.universe_id;
  const placeId = item.placeId ?? item.rootPlaceId ?? item.placeID ?? item.place_id;

  if (name && (universeId || placeId)) out.push({ name, universeId, placeId });
  for (const child of Object.values(item)) {
    if (child && typeof child === "object") collectSearchResults(child, out);
  }
}

async function universeFromPlace(placeId: string) {
  try {
    const response = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { universeId?: number };
    return data.universeId ? String(data.universeId) : null;
  } catch {
    return null;
  }
}

async function gameDetails(universeId: string) {
  try {
    const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
    return data.data?.[0] || null;
  } catch {
    return null;
  }
}

async function resolveGame(query: string) {
  let placeId = extractPlaceId(query);
  let universeId: string | null = null;
  let candidateName = "";

  if (placeId) {
    universeId = await universeFromPlace(placeId);
  } else {
    try {
      const endpoint = new URL("https://apis.roblox.com/search-api/omni-search");
      endpoint.searchParams.set("searchQuery", query);
      endpoint.searchParams.set("sessionId", randomUUID());
      endpoint.searchParams.set("pageType", "all");
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.ok) {
        const raw: Array<Record<string, unknown>> = [];
        collectSearchResults(await response.json(), raw);
        const first = raw[0];
        if (first) {
          candidateName = String(first.name || "");
          if (first.placeId) placeId = String(first.placeId);
          if (first.universeId) universeId = String(first.universeId);
        }
      }
    } catch {}
  }

  if (!universeId && placeId) universeId = await universeFromPlace(placeId);
  const details = universeId ? await gameDetails(universeId) : null;
  if (!placeId && details?.rootPlaceId) placeId = String(details.rootPlaceId);

  return {
    placeId: placeId || undefined,
    universeId: universeId || undefined,
    candidateName,
    details,
  };
}

async function searchScriptBlox(gameName: string, placeId?: string) {
  const results: PublicReference[] = [];
  try {
    const endpoint = new URL("https://scriptblox.com/api/script/search");
    endpoint.searchParams.set("q", gameName || placeId || "roblox");
    endpoint.searchParams.set("max", "10");
    endpoint.searchParams.set("mode", "free");
    endpoint.searchParams.set("verified", "1");
    endpoint.searchParams.set("patched", "0");
    endpoint.searchParams.set("sortBy", "updatedAt");
    endpoint.searchParams.set("order", "desc");
    endpoint.searchParams.set("strict", "false");
    if (placeId) endpoint.searchParams.set("placeId", placeId);

    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { "User-Agent": "ScriptRush/0.5.1" },
    });
    if (!response.ok) return results;

    const data = (await response.json()) as any;
    const scripts = Array.isArray(data?.result?.scripts) ? data.result.scripts : [];
    const target = normalize(gameName);

    for (const script of scripts.slice(0, 8)) {
      const scriptGame = String(script?.game?.name || "");
      if (!placeId && target && scriptGame) {
        const candidate = normalize(scriptGame);
        if (!(candidate.includes(target) || target.includes(candidate))) continue;
      }

      const source = typeof script?.script === "string" ? script.script : "";
      if (source.length < 80) continue;

      results.push({
        kind: "scriptblox",
        title: String(script?.title || "ScriptBlox public script"),
        url: script?.slug ? `https://scriptblox.com/script/${script.slug}` : "https://scriptblox.com",
        snippet: source.slice(0, 9000),
        verified: Boolean(script?.verified),
        patched: Boolean(script?.isPatched),
        game: scriptGame,
      });
    }
  } catch {}
  return results;
}

async function searchGithub(gameName: string, placeId?: string) {
  const results: PublicReference[] = [];
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ScriptRush",
  };

  try {
    const queries = [`${gameName} roblox script lua`, placeId ? `${placeId} roblox script` : ""].filter(Boolean);
    const repos: any[] = [];

    for (const query of queries) {
      const endpoint = new URL("https://api.github.com/search/repositories");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("sort", "updated");
      endpoint.searchParams.set("order", "desc");
      endpoint.searchParams.set("per_page", "5");
      const response = await fetch(endpoint, { headers, cache: "no-store" });
      if (!response.ok) continue;
      const data = (await response.json()) as any;
      for (const repo of data.items || []) {
        if (!repos.some((item) => item.full_name === repo.full_name)) repos.push(repo);
      }
    }

    for (const repo of repos.slice(0, 3)) {
      const branch = String(repo.default_branch || "main");
      const treeResponse = await fetch(
        `https://api.github.com/repos/${repo.full_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        { headers, cache: "no-store" },
      );
      if (!treeResponse.ok) continue;
      const tree = (await treeResponse.json()) as any;

      const files = (tree.tree || [])
        .filter((file: any) => file.type === "blob" && /\.(lua|luau)$/i.test(String(file.path || "")) && Number(file.size || 0) < 160000)
        .sort((a: any, b: any) => {
          const score = (file: any) => (/(hub|script|auto|farm|boss|quest|main)/i.test(String(file.path || "")) ? 1 : 0);
          return score(b) - score(a);
        })
        .slice(0, 3);

      for (const file of files) {
        const rawPath = String(file.path).split("/").map(encodeURIComponent).join("/");
        const rawUrl = `https://raw.githubusercontent.com/${repo.full_name}/${encodeURIComponent(branch)}/${rawPath}`;
        const rawResponse = await fetch(rawUrl, { cache: "no-store" });
        if (!rawResponse.ok) continue;
        const source = (await rawResponse.text()).slice(0, 7000);
        if (source.length < 120) continue;

        results.push({
          kind: "github",
          title: `${repo.full_name}/${file.path}`,
          url: `${String(repo.html_url || "https://github.com")}/blob/${branch}/${file.path}`,
          snippet: source,
        });
        if (results.length >= 6) return results;
      }
    }
  } catch {}

  return results;
}

const featureRules: Array<{ feature: string; pattern: RegExp }> = [
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

function buildFeatureSignals(evidence: PublicReference[]) {
  const map = new Map<string, { score: number; sources: Set<string>; strong: boolean }>();

  for (const reference of evidence) {
    const text = `${reference.title}\n${reference.snippet}`;
    for (const rule of featureRules) {
      if (!rule.pattern.test(text)) continue;
      const current = map.get(rule.feature) || { score: 0, sources: new Set<string>(), strong: false };
      const weight = reference.kind === "scriptblox" && reference.verified && !reference.patched ? 3 : 1;
      current.score += weight;
      current.sources.add(`${reference.kind}:${reference.title}`);
      if (weight >= 3) current.strong = true;
      map.set(rule.feature, current);
    }
  }

  return [...map.entries()]
    .map(([feature, value]): FeatureSignal => ({
      feature,
      score: value.score,
      sources: [...value.sources].slice(0, 5),
      confidence: value.strong || value.score >= 4 ? "high" : value.score >= 2 ? "medium" : "low",
    }))
    .sort((a, b) => b.score - a.score);
}

export async function researchGame(query: string): Promise<ResearchProfile> {
  const trimmed = query.trim().slice(0, 180);
  const warnings: string[] = [];
  const resolved = await resolveGame(trimmed);
  const details = resolved.details;
  const name = typeof details?.name === "string" ? details.name : resolved.candidateName || trimmed;

  const [scriptBlox, github] = await Promise.all([
    searchScriptBlox(name, resolved.placeId),
    searchGithub(name, resolved.placeId),
  ]);
  const publicScripts = [...scriptBlox, ...github];

  if (!scriptBlox.length) warnings.push("No verified ScriptBlox reference matched this game.");
  if (!github.length) warnings.push("No usable GitHub script reference was found or GitHub rate-limited the search.");

  return {
    query: trimmed,
    name,
    placeId: resolved.placeId,
    universeId: resolved.universeId,
    description: typeof details?.description === "string" ? details.description : "",
    creator: details?.creator,
    created: details?.created,
    updated: details?.updated,
    playing: details?.playing,
    visits: details?.visits,
    maxPlayers: details?.maxPlayers,
    genre: details?.genre,
    confidence: resolved.universeId ? "high" : resolved.placeId ? "medium" : "low",
    featureSignals: buildFeatureSignals(publicScripts),
    publicScripts,
    sourceCounts: { scriptBlox: scriptBlox.length, github: github.length },
    warnings,
    researchedAt: new Date().toISOString(),
  };
}

export function publicResearchView(profile: ResearchProfile) {
  return {
    gameKey: gameKeyFor(profile),
    query: profile.query,
    name: profile.name,
    placeId: profile.placeId,
    universeId: profile.universeId,
    description: profile.description,
    creator: profile.creator,
    created: profile.created,
    updated: profile.updated,
    playing: profile.playing,
    visits: profile.visits,
    maxPlayers: profile.maxPlayers,
    genre: profile.genre,
    confidence: profile.confidence,
    featureSignals: profile.featureSignals,
    sourceCounts: profile.sourceCounts,
    publicScripts: profile.publicScripts.map((item) => ({
      kind: item.kind,
      title: item.title,
      url: item.url,
      verified: item.verified,
      patched: item.patched,
      game: item.game,
    })),
    warnings: profile.warnings,
    researchedAt: profile.researchedAt,
  };
}


export function gameKeyFor(profile: Pick<ResearchProfile, "name" | "placeId" | "universeId">) {
  if (profile.universeId) return `universe:${profile.universeId}`;
  if (profile.placeId) return `place:${profile.placeId}`;
  const slug = normalize(profile.name || "unknown").replace(/\s+/g, "-").slice(0, 120) || "unknown";
  return `name:${slug}`;
}
