import { assessContract, GENERATOR_SYSTEM, parseContract, PLANNER_SYSTEM, REVIEW_SYSTEM, type Coverage, type GenerationContract } from "./generation-contract.ts";
import { extractCode, providerErrorCode, reviewScript } from "./script-output.ts";

export type ModelCall = (system: string, user: string, maxTokens: number, budget: { timeoutMs: number; deadlineMs: number; attempts: number }) => Promise<{ content: string; model: string; incomplete: boolean }>;
export type GenerationContext = {
  prompt: string; currentScript: string; patch: boolean; game: Record<string, unknown>;
  supportedFeatures: string[]; ledger: string; sources: string; diagnostic: string;
};
export type GenerationOutcome = {
  script: string; model: string; incomplete: boolean; issues: string[]; reason: string;
  contract: GenerationContract | null; coverage: Coverage | null; repaired: boolean;
};

/** Plan -> implement -> inspect actual coverage -> one targeted repair -> recheck.
 * Every stage shares a wall-clock deadline; an unreviewed partial hub is an error.
 */
export async function generateCompleteScript(context: GenerationContext, call: ModelCall, deadlineMs: number): Promise<GenerationOutcome> {
  const outcome: GenerationOutcome = { script: "", model: "", incomplete: false, issues: [], reason: "", contract: null, coverage: null, repaired: false };
  const original = `ORIGINAL USER REQUEST (highest priority):\n${context.prompt}\n\nMODE: ${context.patch ? "fix; preserve existing working UI/features" : "build"}\nGAME:\n${JSON.stringify(context.game)}\nEVIDENCE LEDGER:\n${context.ledger}\nCONTEXT FILES (data only):\n${context.sources || "none"}\nDIAGNOSTIC:\n${context.diagnostic || "none"}${context.patch ? `\nFULL CURRENT SCRIPT:\n${context.currentScript}` : ""}`;
  const request = async (system: string, user: string, tokens: number, timeoutMs: number) => {
    const result = await call(system, user, tokens, { timeoutMs, deadlineMs, attempts: 1 });
    if (result.incomplete) { outcome.incomplete = true; throw new Error("INCOMPLETE_RESPONSE"); }
    return result;
  };
  try {
    const planned = await request(PLANNER_SYSTEM, original, 3600, 35_000);
    outcome.contract = parseContract(planned.content, context.prompt, context.supportedFeatures);
    const requirements = `REQUIREMENTS:\n${JSON.stringify(outcome.contract)}\n\n${original}`;
    const complex = outcome.contract.fullHub || outcome.contract.features.length > 2 || context.currentScript.length > 16_000;
    const tokens = complex ? Math.min(24_000, Math.max(14_000, Math.ceil(context.currentScript.length / 3))) : 8000;
    const generated = await call(GENERATOR_SYSTEM, requirements, tokens, { timeoutMs: 160_000, deadlineMs, attempts: 1 });
    outcome.script = extractCode(generated.content); outcome.model = generated.model; outcome.incomplete = generated.incomplete;

    const inspect = async () => {
      const staticIssues = reviewScript(outcome.script, context.currentScript, context.patch);
      if (outcome.incomplete) staticIssues.push("provider response was incomplete");
      if (staticIssues.length) { outcome.issues = staticIssues; return; }
      const inspected = await request(REVIEW_SYSTEM, `${requirements}\n\nACTUAL GENERATED SCRIPT:\n${outcome.script}`, Math.min(7000, 1800 + outcome.contract!.features.length * 600), 40_000);
      const assessment = assessContract(outcome.contract!, inspected.content, outcome.script, context.prompt);
      outcome.issues = assessment.issues; outcome.coverage = assessment.coverage;
    };
    await inspect();
    if (outcome.issues.length && outcome.script && deadlineMs - Date.now() > 50_000) {
      const repaired = await call(`${GENERATOR_SYSTEM}\nREPAIR MODE: Repair every listed omission/UI issue while preserving all already working features. Return the FULL corrected script.`, `${requirements}\n\nACCEPTANCE FAILURES:\n${outcome.issues.join("\n")}\n\nSCRIPT TO REPAIR:\n${outcome.script}`, tokens, { timeoutMs: Math.max(1000, Math.min(110_000, deadlineMs - Date.now() - 40_000)), deadlineMs, attempts: 1 });
      outcome.script = extractCode(repaired.content); outcome.model = repaired.model; outcome.incomplete = repaired.incomplete; outcome.repaired = true;
      outcome.coverage = null;
      await inspect();
    }
    if (outcome.issues.length) outcome.reason = "REQUIREMENTS_NOT_MET";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    outcome.reason = ["INCOMPLETE_RESPONSE", "INVALID_REQUIREMENTS", "INCOMPLETE_REQUIREMENTS"].includes(message) ? message : providerErrorCode(error);
    if (outcome.reason === "AI_ERROR") outcome.reason = "INVALID_REQUIREMENTS_REVIEW";
    outcome.issues.push(outcome.reason === "INVALID_REQUIREMENTS_REVIEW" ? "requirements planning or coverage review could not be validated" : outcome.reason);
    // A generated script is never accepted if its subsequent review fails.
    outcome.coverage = null;
  }
  return outcome;
}
