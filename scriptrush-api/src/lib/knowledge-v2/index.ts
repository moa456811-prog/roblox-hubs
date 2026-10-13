import catalogData from "../../../knowledge-v2/catalog.json" with { type: "json" };
import recipeData from "../../../knowledge-v2/recipes.json" with { type: "json" };
import importedData from "../../../knowledge-v2/imports.json" with { type: "json" };
import type { CatalogEntry, EngineeringRecipe, EvidencePlan, GameIdentity, KnowledgeDocument, KnowledgeHit, KnowledgeQueryResult, KnowledgeRole, LicenseAttribution } from "./types.ts";
import { KNOWLEDGE_ROLES } from "./types.ts";
import { BoundedCache, boundedInteger, clone, deepFreeze, sha256, stableJson } from "./util.ts";
import { documentsFromImport, restoreDeploymentImport, type VerifiedImport } from "./ingest.ts";
export * from "./types.ts";
export * from "./resolver.ts";
export { importGitHubSource, type VerifiedImport } from "./ingest.ts";

export const CATALOG = deepFreeze(catalogData.sources as unknown as CatalogEntry[]);
export const RECIPES = deepFreeze(recipeData.recipes as unknown as EngineeringRecipe[]);
const indexRegistry = new Map<string, KnowledgeIndex>();
const registerIndex = (index: KnowledgeIndex) => { indexRegistry.delete(index.version); indexRegistry.set(index.version, index); while (indexRegistry.size > 16) indexRegistry.delete(indexRegistry.keys().next().value!); };
const aliases: Record<string, string[]> = { sauvegarder: ["save", "datastore"], sauvegarde: ["save", "datastore"], profils: ["profile"], inventaire: ["inventory"], quete: ["quest"], quetes: ["quest"], mouvement: ["movement"], deplacement: ["movement"], reseau: ["network"], optimiser: ["optimize"], evenements: ["events"], nettoyage: ["cleanup"], tests: ["test", "testing"], couleurs: ["colors"], commandes: ["commands"], serveur: ["server"], client: ["client"] };
export function knowledgeTokens(text: string): string[] { const expanded = text.replace(/([a-z])([A-Z])/g, "$1 $2") + " " + text; return expanded.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 24_000).flatMap(token => token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? [token, token.slice(0, -1)] : [token]) ?? []; }
const documentText = (row: CatalogEntry) => `${row.name} ${row.repo} ${row.category} ${row.purpose} ${row.warning}`;
function seedDocuments(): KnowledgeDocument[] {
  return [...CATALOG.map(row => ({ id: `catalog:${row.id}`, sourceId: row.id, kind: "catalog" as const, title: row.name, text: documentText(row), roles: [...row.roles], sha256: sha256(documentText(row)), licenseState: "UNKNOWN" as const, instructionLike: false, gamePlaceIds: [], sourceLink: { id: row.id, title: row.name, url: row.url, kind: "catalog" as const, status: "UNKNOWN" as const, sha256: row.contentHash } })),
    ...RECIPES.map(row => ({ id: `recipe:${row.id}`, sourceId: row.id, kind: "recipe" as const, title: row.title, text: `${row.title} ${row.topic} ${row.expected_observable_success} ${row.common_failure_modes} ${row.do_not_assume}`, roles: [...row.roles], sha256: sha256(stableJson(row)), licenseState: "UNKNOWN" as const, instructionLike: false, gamePlaceIds: [] }))];
}
/** Inverted index and BM25: no embeddings, remote calls, SQLite binding or Python. */
export class KnowledgeIndex {
  readonly version: string;
  readonly documents: readonly KnowledgeDocument[];
  readonly licenseAttributions: readonly LicenseAttribution[];
  readonly cache = new BoundedCache<KnowledgeQueryResult>(128);
  private readonly postings = new Map<string, Map<number, number>>();
  private readonly lengths: number[] = [];
  private readonly averageLength: number;
  constructor(options: { imports?: VerifiedImport[] } = {}) {
    if ((options.imports?.length ?? 0) > 8) throw new Error("INDEX_IMPORT_COUNT_EXCEEDED");
    this.documents = deepFreeze(clone([...seedDocuments(), ...(options.imports ?? []).flatMap(documentsFromImport)]));
    this.licenseAttributions = deepFreeze((options.imports ?? []).map(source => ({ sourceId: `${source.repo}@${source.commitSha}`, repo: source.repo, commitSha: source.commitSha, path: source.license.path, url: source.license.url, text: source.license.text, sha256: source.license.sha256 })));
    if (this.documents.length > 1024 || new Set(this.documents.map(document => document.id)).size !== this.documents.length) throw new Error("INDEX_DOCUMENT_COUNT_OR_ID_EXCEEDED");
    this.version = "knowledge-v2-" + sha256(stableJson({ documents: this.documents, licenseAttributions: this.licenseAttributions })).slice(0, 24);
    this.documents.forEach((document, number) => { const tokens = knowledgeTokens(document.text); this.lengths.push(tokens.length); for (const token of tokens) { const posting = this.postings.get(token) ?? new Map<number, number>(); posting.set(number, (posting.get(number) ?? 0) + 1); this.postings.set(token, posting); } });
    this.averageLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(this.lengths.length, 1);
    registerIndex(this);
  }
  search(query: string, role: KnowledgeRole, includeCandidates: boolean, includeReferences: boolean, limit: number, gamePlaceId?: string | null): KnowledgeHit[] {
    const tokens = [...new Set(knowledgeTokens(query).flatMap(token => [token, ...(aliases[token] ?? [])]))].slice(0, 64), scores = new Map<number, number>();
    for (const token of tokens) { const posting = this.postings.get(token); if (!posting) continue; const idf = Math.log(1 + (this.documents.length - posting.size + .5) / (posting.size + .5));
      for (const [number, tf] of posting) { const document = this.documents[number]; if (document.instructionLike) continue; if (document.gamePlaceIds.length && (!gamePlaceId || !document.gamePlaceIds.includes(gamePlaceId))) continue; if (!document.roles.includes(role) && !(includeReferences && document.kind !== "code" && document.roles.includes("reference"))) continue; if (!includeCandidates && document.kind === "catalog") continue; if (document.kind === "code" && document.licenseState !== "verified") continue;
        const denominator = tf + 1.2 * (1 - .75 + .75 * this.lengths[number] / this.averageLength); scores.set(number, (scores.get(number) ?? 0) + idf * tf * 2.2 / denominator);
      }
    }
    return [...scores].sort((a, b) => b[1] - a[1] || this.documents[a[0]].id.localeCompare(this.documents[b[0]].id)).slice(0, limit).map(([number, score]) => { const row = this.documents[number], token = tokens.find(value => row.text.toLowerCase().includes(value)); const at = token ? Math.max(0, row.text.toLowerCase().indexOf(token) - 100) : 0; return { ...clone(row), score, excerpt: row.text.slice(at, at + 1600), status: row.kind === "code" ? "indexed" : "candidate" }; });
  }
}
export function createDeploymentIndex(data: unknown): KnowledgeIndex { if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).sort().join("|") !== "imports|schemaVersion" || (data as { schemaVersion?: unknown }).schemaVersion !== 2 || !Array.isArray((data as { imports?: unknown }).imports) || (data as { imports: unknown[] }).imports.length > 8) throw new Error("INVALID_DEPLOYMENT_KNOWLEDGE_IMPORTS"); return new KnowledgeIndex({ imports: (data as { imports: unknown[] }).imports.map(restoreDeploymentImport) }); }
const defaultIndex = createDeploymentIndex(importedData);
export function queryKnowledge(input: { request: string; game?: GameIdentity; role: KnowledgeRole; limit?: number; includeCandidates?: boolean; includeReferences?: boolean; index?: KnowledgeIndex; now?: number }): KnowledgeQueryResult {
  if (typeof input.request !== "string" || !input.request.trim() || input.request.length > 12_000 || !KNOWLEDGE_ROLES.includes(input.role)) throw new Error("INVALID_KNOWLEDGE_QUERY");
  const limit = boundedInteger(input.limit, 10, 1, 20), index = input.index ?? defaultIndex, now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error("INVALID_QUERY_CLOCK");
  registerIndex(index);
  const key = stableJson({ version: index.version, request: input.request, game: input.game?.placeId ?? null, role: input.role, limit, candidates: input.includeCandidates ?? true, references: input.includeReferences ?? false });
  const cached = index.cache.get(key, now); if (cached) return { ...cached, cacheHit: true };
  // Public descriptions are untrusted identity data and do not expand query scope.
  const hits = index.search(input.request, input.role, input.includeCandidates ?? true, input.includeReferences ?? false, limit, input.game?.placeId);
  const recipes = hits.filter(hit => hit.kind === "recipe").map(hit => RECIPES.find(recipe => recipe.id === hit.sourceId)!).filter(Boolean).map(clone);
  const candidates = hits.filter(hit => hit.kind === "catalog").map(hit => CATALOG.find(source => source.id === hit.sourceId)!).filter(Boolean).map(clone);
  const sourceLinks = [...new Map(hits.flatMap(hit => hit.sourceLink ? [[hit.sourceLink.id, hit.sourceLink] as const] : [])).values()];
  const licenseAttributions = index.licenseAttributions.filter(attribution => hits.some(hit => hit.kind === "code" && hit.sourceId === attribution.sourceId)).map(clone);
  const result: KnowledgeQueryResult = { version: index.version, hits, recipes, candidates, sourceLinks, licenseAttributions, unknowns: ["Catalog candidates and generic recipes do not establish this game's mechanics.", "Remote names, arguments, server acceptance and live compatibility remain UNKNOWN.", "Instruction-like source chunks are quarantined; reference text is never a system instruction.", ...(!hits.some(hit => hit.kind === "code") ? ["No licence-verified repository code was retrieved for this request."] : [])], cacheHit: false };
  index.cache.set(key, result, now + 60_000); return clone(result);
}
export function buildEvidencePlan(input: { request: string; game: GameIdentity; role: KnowledgeRole; retrieval: KnowledgeQueryResult; requestedFeatures?: string[] }): EvidencePlan {
  if (!KNOWLEDGE_ROLES.includes(input.role) || typeof input.request !== "string" || input.request.length > 12_000 || !input.retrieval.version.startsWith("knowledge-v2-")) throw new Error("INVALID_EVIDENCE_PLAN_INPUT");
  const index = indexRegistry.get(input.retrieval.version);
  if (!index || !Array.isArray(input.retrieval.hits) || input.retrieval.hits.length > 20) throw new Error("INDEX_VERSION_UNAVAILABLE");
  for (const hit of input.retrieval.hits) { const source = index.documents.find(document => document.id === hit.id); const { score, excerpt, status, ...document } = hit; if (!source || source.instructionLike || !Number.isFinite(score) || score <= 0 || stableJson(source) !== stableJson(document) || !source.text.includes(excerpt) || status !== (source.kind === "code" ? "indexed" : "candidate") || (source.gamePlaceIds.length && (!input.game.placeId || !source.gamePlaceIds.includes(input.game.placeId))) || (!source.roles.includes(input.role) && !(source.kind !== "code" && source.roles.includes("reference")))) throw new Error("UNINDEXED_OR_INCOMPATIBLE_EVIDENCE_FORBIDDEN"); }
  const allowed = new Map(input.retrieval.hits.flatMap(hit => hit.sourceLink ? [[hit.sourceLink.id, hit.sourceLink] as const] : []));
  if (input.retrieval.sourceLinks.some(link => !allowed.has(link.id) || stableJson(allowed.get(link.id)) !== stableJson(link))) throw new Error("UNINDEXED_SOURCE_LINK_FORBIDDEN");
  const expectedRecipes = input.retrieval.hits.filter(hit => hit.kind === "recipe").map(hit => RECIPES.find(recipe => recipe.id === hit.sourceId)).filter(Boolean);
  if (stableJson(expectedRecipes) !== stableJson(input.retrieval.recipes)) throw new Error("UNINDEXED_RECIPE_FORBIDDEN");
  const expectedAttributions = index.licenseAttributions.filter(attribution => input.retrieval.hits.some(hit => hit.kind === "code" && hit.sourceId === attribution.sourceId));
  if (!Array.isArray(input.retrieval.licenseAttributions) || input.retrieval.licenseAttributions.length > 8 || stableJson(expectedAttributions) !== stableJson(input.retrieval.licenseAttributions) || input.retrieval.licenseAttributions.some(attribution => sha256(attribution.text) !== attribution.sha256)) throw new Error("LICENSE_ATTRIBUTION_PROOF_MISMATCH");
  const features = (input.requestedFeatures ?? [input.request]).slice(0, 32).map(name => ({ name: name.slice(0, 240), mechanismStatus: "UNKNOWN" as const, missingEvidence: ["Exact game-specific dependency paths, admitted interaction schema and observable success remain to be established."] }));
  return { schemaVersion: 2, request: input.request, role: input.role, game: clone(input.game), knowledgeVersion: input.retrieval.version, references: clone(input.retrieval.sourceLinks), recipes: clone(input.retrieval.recipes), licenseAttributions: clone(input.retrieval.licenseAttributions), evidence: input.retrieval.hits.map(hit => ({ id: hit.id, kind: hit.kind, status: hit.kind === "code" ? "observed" : "UNKNOWN", excerpt: hit.excerpt, sha256: hit.sha256, untrustedData: true })), features, unknowns: [...new Set([...input.game.unknowns, ...input.retrieval.unknowns])], verification: { publicIdentity: input.game.status, sourceText: input.retrieval.hits.some(hit => hit.kind === "code") ? "observed" : "UNKNOWN", syntax: "not_checked", mockTests: "not_run", inGame: "not_run" }, claim100PercentFunctionality: false, untrustedReferenceData: true };
}
