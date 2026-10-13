import type { ModelCall } from "../generation.ts";
import { createProjectStageHandlers } from "../knowledge-project.ts";
import { buildEvidencePlan, queryKnowledge, resolveGameIdentity } from "../knowledge-v2/index.ts";
import type { GameIdentity, KnowledgeQueryResult } from "../knowledge-v2/index.ts";
import { GenerationJobService } from "./service.ts";
import { configuredGenerationStore } from "./store.ts";
import { requestedFeatures } from "./requested-features.ts";
import type { GenerationStageHandlers } from "./types.ts";

export function createKnowledgeStageHandlers(modelCall: ModelCall, options: { compilerPath?: string; mockRunnerPath?: string; fetch?: typeof fetch } = {}): GenerationStageHandlers {
  const project = createProjectStageHandlers(modelCall, options);
  return {
    async discover(context) {
      context.signal.throwIfAborted(); const input = context.input.game?.url ?? context.input.game?.placeId ?? context.input.game?.query;
      if (!input) return { status: "UNKNOWN", placeId: null, universeId: null, name: null, description: "", publicUpdatedAt: null, provenance: [], unknowns: ["No game identity provided; game-specific mechanics are UNKNOWN."], retrievedAt: null, expiresAt: null } satisfies GameIdentity;
      return resolveGameIdentity(String(input), { signal: context.signal, fetch: options.fetch });
    },
    async retrieve(context) { context.signal.throwIfAborted(); return queryKnowledge({ request: context.input.request, game: context.discovery as GameIdentity, role: context.input.role, limit: 10 }); },
    async plan(context) { context.signal.throwIfAborted(); return buildEvidencePlan({ request: context.input.request, requestedFeatures: requestedFeatures(context.input.request), game: context.discovery as GameIdentity, role: context.input.role, retrieval: context.retrieval as unknown as KnowledgeQueryResult }); },
    generate: project.generate,
    validate: project.validate,
  };
}
let service: GenerationJobService | undefined;
/** Lazy provider import keeps discovery/retrieval/planning independent of model access. */
export function generationJobService() {
  if (!service) {
    const call: ModelCall = async (...args) => (await import("../model-provider.ts")).runModel(...args);
    service = new GenerationJobService(configuredGenerationStore(), createKnowledgeStageHandlers(call, { compilerPath: process.env.SCRIPTRUSH_LUAU_COMPILER, mockRunnerPath: process.env.SCRIPTRUSH_PROJECT_MOCK_RUNNER }));
  }
  return service;
}
