export type ResearchBasis = "source-backed" | "runtime-verified" | "unknown";

export interface ResearchSourceAnalysis {
  id: string;
  basis: "source-observed";
  summary: string;
  observations: string[];
  provenance: { url: string; revision: string; sha256: string };
  license: "MIT" | "UNKNOWN";
  reusePolicy: "analysis-only";
  runtimeVerified: false;
  gameProfile?: { universeId: string; rootPlaceId: string; combatPlaceId: string; genre: string; observedAt: string; identityEvidenceUrls: string[] };
}

export interface ResearchKnowledge {
  summary: string;
  sources: { id: string; title: string; url: string; kind: string }[];
  features: { id: string; label: string; basis: ResearchBasis; summary: string; sourceIds: string[]; missing?: string[] }[];
  sourceAnalysis?: ResearchSourceAnalysis[];
  researchedAt?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) return null;
  return value.trim() || null;
}

function sourceUrl(value: unknown): string | null {
  const raw = text(value, 2_048);
  if (!raw || /\s|\\/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Descriptive observations have their own channel; they never establish a
 * supported feature, reuse permission for code, or a successful live-game test. */
function sourceAnalysis(value: unknown): ResearchSourceAnalysis[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const notes: ResearchSourceAnalysis[] = [], ids = new Set<string>();
  for (const note of value) {
    if (!isRecord(note) || note.basis !== "source-observed" || note.reusePolicy !== "analysis-only" || note.runtimeVerified !== false || (note.license !== "MIT" && note.license !== "UNKNOWN") || !isRecord(note.provenance)) return null;
    const id = text(note.id, 128), summary = text(note.summary, 1_000);
    const revision = text(note.provenance.revision, 40), sha256 = text(note.provenance.sha256, 64), url = sourceUrl(note.provenance.url);
    if (!id || !summary || ids.has(id) || !revision || !/^[a-f0-9]{40}$/.test(revision) || !sha256 || !/^[a-f0-9]{64}$/.test(sha256) || !url) return null;
    const provenance = new URL(url), pinned = provenance.pathname.match(/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/([a-f0-9]{40})\/[^?#]+$/);
    if (provenance.hostname !== "github.com" || provenance.port || provenance.search || provenance.hash || pinned?.[1] !== revision) return null;
    if (!Array.isArray(note.observations) || !note.observations.length || note.observations.length > 8) return null;
    const observations: string[] = [];
    for (const observation of note.observations) {
      const detail = text(observation, 800);
      if (!detail || observations.includes(detail)) return null;
      observations.push(detail);
    }
    let gameProfile: ResearchSourceAnalysis["gameProfile"];
    if (note.gameProfile !== undefined) {
      const profile = note.gameProfile;
      if (!isRecord(profile)) return null;
      const identifier = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) ? value : null;
      const universeId = identifier(profile.universeId), rootPlaceId = identifier(profile.rootPlaceId), combatPlaceId = identifier(profile.combatPlaceId);
      const genre = text(profile.genre, 180), observedAt = text(profile.observedAt, 80);
      if (!universeId || !rootPlaceId || !combatPlaceId || !genre || !observedAt || !Number.isFinite(Date.parse(observedAt)) || !Array.isArray(profile.identityEvidenceUrls) || !profile.identityEvidenceUrls.length || profile.identityEvidenceUrls.length > 4) return null;
      const identityEvidenceUrls: string[] = [];
      for (const reference of profile.identityEvidenceUrls) {
        const safe = sourceUrl(reference); if (!safe || identityEvidenceUrls.includes(safe)) return null;
        identityEvidenceUrls.push(safe);
      }
      gameProfile = { universeId, rootPlaceId, combatPlaceId, genre, observedAt, identityEvidenceUrls };
    }
    ids.add(id);
    notes.push({ id, basis: "source-observed", summary, observations, provenance: { url, revision, sha256 }, license: note.license, reusePolicy: "analysis-only", runtimeVerified: false, ...(gameProfile ? { gameProfile } : {}) });
  }
  return notes;
}

/** Only public summaries and source links cross this display boundary. Source
 * ratings, verified flags and raw code never promote a feature's evidence basis. */
export function parseResearchKnowledge(value: unknown): ResearchKnowledge | null {
  if (!isRecord(value) || !Array.isArray(value.sources) || value.sources.length > 24 || !Array.isArray(value.features) || value.features.length > 32) return null;
  const summary = text(value.summary, 1_000);
  if (!summary) return null;
  const sources: ResearchKnowledge["sources"] = [];
  const sourceIds = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source)) return null;
    const id = text(source.id, 128), title = text(source.title, 180), kind = text(source.kind, 64), url = sourceUrl(source.url);
    if (!id || !title || !kind || !url || sourceIds.has(id)) return null;
    sourceIds.add(id);
    sources.push({ id, title, url, kind });
  }
  const features: ResearchKnowledge["features"] = [];
  const featureIds = new Set<string>();
  for (const feature of value.features) {
    if (!isRecord(feature)) return null;
    const id = text(feature.id, 128), label = text(feature.label, 180), description = text(feature.summary, 800);
    const basis = feature.basis;
    if (!id || !label || !description || featureIds.has(id) || (basis !== "source-backed" && basis !== "runtime-verified" && basis !== "unknown") || !Array.isArray(feature.sourceIds) || feature.sourceIds.length > 12) return null;
    const references: string[] = [];
    for (const reference of feature.sourceIds) {
      const sourceId = text(reference, 128);
      if (!sourceId || !sourceIds.has(sourceId) || references.includes(sourceId)) return null;
      references.push(sourceId);
    }
    if (basis === "source-backed" && references.length === 0) return null;
    const missing: string[] = [];
    if (feature.missing !== undefined) {
      if (!Array.isArray(feature.missing) || feature.missing.length > 8) return null;
      for (const item of feature.missing) {
        const detail = text(item, 240);
        if (!detail) return null;
        missing.push(detail);
      }
    }
    featureIds.add(id);
    features.push({ id, label, basis, summary: description, sourceIds: references, ...(feature.missing !== undefined ? { missing } : {}) });
  }
  let researchedAt: string | undefined;
  if (value.researchedAt !== undefined) {
    const date = text(value.researchedAt, 80);
    if (!date || !Number.isFinite(Date.parse(date))) return null;
    researchedAt = new Date(date).toISOString();
  }
  const analysis = value.sourceAnalysis === undefined ? undefined : sourceAnalysis(value.sourceAnalysis);
  if (analysis === null) return null;
  return { summary, sources, features, ...(analysis !== undefined ? { sourceAnalysis: analysis } : {}), ...(researchedAt ? { researchedAt } : {}) };
}

export function researchBasisLabel(basis: ResearchBasis): string {
  return basis === "source-backed" ? "Source-backed" : basis === "runtime-verified" ? "In-game verified" : "Needs evidence";
}
