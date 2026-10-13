import { createHash } from "node:crypto";
import { verifiedMitText } from "./knowledge-v2/ingest.ts";

export type PublicSourceLicense = { spdx: "MIT"; revision: string; path: string; url: string; text: string; sha256: string; gitBlobSha: string };
export type SourceAnalysisNote = {
  id: string; basis: "source-observed"; summary: string; observations: string[];
  provenance: { url: string; revision: string; sha256: string };
  license: "MIT" | "UNKNOWN"; reusePolicy: "analysis-only"; runtimeVerified: false;
  gameProfile?: { universeId: string; rootPlaceId: string; combatPlaceId: string; genre: string; observedAt: string; identityEvidenceUrls: string[] };
};
export const publicSourceSha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const publicSourceGitBlobHash = (value: string) => { const bytes = Buffer.from(value); return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); };

/** Repo labels do not grant reuse rights. Verify the complete pinned license and
 * its blob, then bind it to the same public repository revision as the source. */
export function pinnedMitLicense(repository: string, revision: string, value: unknown): PublicSourceLicense | undefined {
  const row = value as Record<string, unknown> | null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(revision) || !row || (row.license as { spdx_id?: unknown })?.spdx_id !== "MIT" || row.type !== "file" || row.encoding !== "base64" || typeof row.path !== "string" || !/^licen[sc]e(?:\.(?:md|txt))?$/i.test(row.path) || typeof row.content !== "string" || row.content.length > 48_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(row.content) || typeof row.sha !== "string" || typeof row.size !== "number") return;
  const bytes = Buffer.from(row.content, "base64");
  if (bytes.length !== row.size || bytes.length > 32_000) return;
  let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return; }
  if (!verifiedMitText(text) || publicSourceGitBlobHash(text) !== row.sha) return;
  return { spdx: "MIT", revision, path: row.path, url: `https://github.com/${repository}/blob/${revision}/${row.path}`, text, sha256: publicSourceSha256(text), gitBlobSha: row.sha };
}
export function authorizedPublicSource(reference: { kind: string; url: string; revision?: string; snippet: string; license?: PublicSourceLicense }): boolean {
  const proof = reference.license, match = reference.url.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/blob\/([a-f0-9]{40})\//);
  if (reference.kind !== "github" || !match || !proof || proof.spdx !== "MIT" || reference.revision !== match[2] || proof.revision !== match[2] || proof.url !== `https://github.com/${match[1]}/blob/${match[2]}/${proof.path}` || !/^licen[sc]e(?:\.(?:md|txt))?$/i.test(proof.path) || Buffer.byteLength(proof.text) > 32_000 || !verifiedMitText(proof.text) || publicSourceSha256(proof.text) !== proof.sha256 || publicSourceGitBlobHash(proof.text) !== proof.gitBlobSha) return false;
  const fileLicense = reference.snippet.match(/SPDX-License-Identifier:\s*([^\r\n]+)/i)?.[1].trim();
  return !fileLicense || fileLicense === "MIT";
}

/** Reviewed locator only: no third-party source code is vendored here. Facts
 * describe an immutable historical reference, never current server behavior. */
export const ANIME_ZERO_PUBLIC_REFERENCE = Object.freeze({
  repository: "RealTTJY/Studio.Hub", revision: "62e5b01bc9665af2f2509d27e3a8dd51f5fff224", path: "ListFile/10512942223.lua",
  sha256: "1791a76eb75630c36075643b18235cb7525812b0a45f0ed0cb3c768409d2f96a",
  universeId: "10512942223", rootPlaceId: "114574503491412", combatPlaceId: "109151342576374",
  url: "https://github.com/RealTTJY/Studio.Hub/blob/62e5b01bc9665af2f2509d27e3a8dd51f5fff224/ListFile/10512942223.lua",
  rawUrl: "https://raw.githubusercontent.com/RealTTJY/Studio.Hub/62e5b01bc9665af2f2509d27e3a8dd51f5fff224/ListFile/10512942223.lua",
});
export function matchesAnimeZeroIdentity(identity: { universeId?: string; placeId?: string }): boolean {
  return identity.universeId === ANIME_ZERO_PUBLIC_REFERENCE.universeId;
}
export function reviewedGameProfile(reference: { url: string; revision?: string; sha256: string }, identity: { universeId?: string }): Pick<SourceAnalysisNote, "observations" | "gameProfile"> | undefined {
  const source = ANIME_ZERO_PUBLIC_REFERENCE;
  if (!matchesAnimeZeroIdentity(identity) || reference.url !== source.url || reference.revision !== source.revision || reference.sha256 !== source.sha256) return;
  return {
    observations: [
      "The reviewed historical reference separates lobby behavior from combat sessions; a root-place identifier alone does not identify an active combat context.",
      "Combat selection reads a workspace mode and uses local packet modules and a character controller. Exact dependencies and packet schemas remain unverified in the live game.",
      "The reference describes enemy targeting and combat, run progression and a lobby delivery flow. It does not establish four independent working farm, boss, quest and loot systems.",
      "Action RPG and dungeon-crawler metadata describes the game's genre; it does not prove a remote, reward flow or successful automation.",
    ],
    gameProfile: { universeId: source.universeId, rootPlaceId: source.rootPlaceId, combatPlaceId: source.combatPlaceId, genre: "Action RPG / dungeon crawler", observedAt: "2026-10-13", identityEvidenceUrls: [
      `https://apis.roblox.com/universes/v1/places/${source.rootPlaceId}/universe`,
      `https://apis.roblox.com/universes/v1/places/${source.combatPlaceId}/universe`,
      `https://games.roblox.com/v1/games?universeIds=${source.universeId}`,
    ] },
  };
}
