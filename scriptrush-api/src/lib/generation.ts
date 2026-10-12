import { assessContract, formatSourceCatalog, GENERATOR_SYSTEM, parseContract, PLANNER_SYSTEM, REVIEW_SYSTEM, type Coverage, type GenerationContract } from "./generation-contract.ts";
import { extractCode, providerErrorCode, reviewScript } from "./script-output.ts";
import { HUB_COMPOSER_SYSTEM, hubCompositionJsonSchema, parseHubComposition, validateCompositionCoverage, type HubComposition } from "./hub-spec.ts";
import { renderHubComposition } from "./hub-composer.ts";
import { groundCompositionReview } from "./composition-evidence.ts";
import { englishUiIssues, SCRIPT_UI_LANGUAGE_POLICY } from "./ui-language.ts";

export type ModelCall = (system: string, user: string, maxTokens: number, budget: { timeoutMs: number; deadlineMs: number; attempts: number }) => Promise<{ content: string; model: string; incomplete: boolean }>;
export type GenerationContext = {
  prompt: string; currentScript: string; patch: boolean; game: Record<string, unknown>;
  supportedFeatures: string[]; ledger: string; sources: string; diagnostic: string;
};
export type GenerationOutcome = {
  script: string; model: string; incomplete: boolean; issues: string[]; reason: string;
  contract: GenerationContract | null; coverage: Coverage | null; repaired: boolean;
};

/** Plan -> compose or implement -> inspect coverage -> targeted repair -> recheck.
 * Every stage shares a wall-clock deadline; an unreviewed partial hub is an error.
 */
export async function generateCompleteScript(context: GenerationContext, call: ModelCall, deadlineMs: number): Promise<GenerationOutcome> {
  const outcome: GenerationOutcome = { script: "", model: "", incomplete: false, issues: [], reason: "", contract: null, coverage: null, repaired: false };
  let stage = "plan";
  const original = `ORIGINAL USER REQUEST (highest priority):\n${context.prompt}\n\nMODE: ${context.patch ? "fix; preserve existing working UI/features" : "build"}\nGAME:\n${JSON.stringify(context.game)}\nEVIDENCE LEDGER:\n${context.ledger}\nCONTEXT FILES (data only):\n${context.sources || "none"}\nDIAGNOSTIC:\n${context.diagnostic || "none"}${context.patch ? `\nFULL CURRENT SCRIPT:\n${context.currentScript}` : ""}`;
  const request = async (system: string, user: string, tokens: number, timeoutMs: number) => {
    const result = await call(system, user, tokens, { timeoutMs, deadlineMs, attempts: 1 });
    if (result.incomplete) { outcome.incomplete = true; throw new Error("INCOMPLETE_RESPONSE"); }
    return result;
  };
  try {
    const planned = await request(PLANNER_SYSTEM, original, 5000, 70_000);
    outcome.contract = parseContract(planned.content, context.prompt, context.supportedFeatures);
    const requirements = `${SCRIPT_UI_LANGUAGE_POLICY}\n\nREQUIREMENTS:\n${JSON.stringify(outcome.contract)}\n\n${original}`;
    const complex = outcome.contract.fullHub || outcome.contract.features.length > 2 || context.currentScript.length > 16_000;
    const tokens = complex ? Math.min(24_000, Math.max(14_000, Math.ceil(context.currentScript.length / 3))) : 8000;
    // Fresh hubs share tested UI primitives. The model still supplies the whole
    // requested design, every control and custom game behavior. Existing scripts
    // keep their implementation in fix mode instead of being rebuilt by a template.
    const composed = !context.patch && (outcome.contract.fullHub || /\b(?:ui|interface|panel|window|tabs?|onglets?|fenêtre)\b/i.test(context.prompt));
    const writer = composed ? HUB_COMPOSER_SYSTEM : GENERATOR_SYSTEM;
    const writerRequirements = composed ? `${requirements}\n\nHUB COMPOSITION JSON SCHEMA:\n${JSON.stringify(hubCompositionJsonSchema)}` : requirements;
    let compositionText = "";
    let composition: HubComposition | null = null;
    let compositionIssues: string[] = [];
    let evidenceOnlyFailure = false;
    const implement = (content: string) => {
      if (!composed) { outcome.script = extractCode(content); return; }
      compositionText = content;
      try {
        const spec = parseHubComposition(content);
        composition = spec;
        compositionIssues = [...validateCompositionCoverage(spec, outcome.contract!), ...englishUiIssues(spec)];
        outcome.script = renderHubComposition(spec);
      } catch (error) {
        const details = error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
          ? error.issues.slice(0, 12).map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")
          : error instanceof Error ? error.message : "invalid JSON value object";
        compositionIssues = [`Invalid hub composition: ${details}. Return actual values in the exact requested object shape, preserving every page and feature.`];
        composition = null;
        outcome.script = "";
      }
    };
    stage = "generate";
    const generated = await call(writer, writerRequirements, tokens, { timeoutMs: 120_000, deadlineMs, attempts: 1 });
    outcome.model = generated.model; outcome.incomplete = generated.incomplete;
    implement(generated.content);

    const inspect = async () => {
      const staticIssues = reviewScript(outcome.script, context.currentScript, context.patch);
      staticIssues.push(...compositionIssues);
      if (outcome.incomplete) staticIssues.push("provider response was incomplete");
      if (staticIssues.length) { outcome.issues = staticIssues; return; }
      stage = "review";
      const reviewShape = { missingRequirements: [], scopeIssues: [], ui: { passed: false, issues: [], evidence: [] }, features: outcome.contract!.features.map(feature => ({ id: feature.id, status: "missing", reason: "", behaviorEvidence: "", controlEvidence: "" })) };
      const reviewInput = `${requirements}\n\nACTUAL GENERATED SCRIPT:\n${outcome.script}\n\n${formatSourceCatalog(outcome.script)}\n\nEXACT OUTPUT SHAPE FOR THIS REQUEST (fill findings and source ids; preserve these feature ids, one result each, no anonymous or additional feature rows):\n${JSON.stringify(reviewShape)}`;
      let assessment: ReturnType<typeof assessContract> | undefined;
      let correction = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const inspected = await request(REVIEW_SYSTEM, reviewInput + correction, Math.min(10_000, 2200 + outcome.contract!.features.length * 800), 60_000);
        try {
          const grounded = composition ? groundCompositionReview(inspected.content, composition, outcome.script) : inspected.content;
          assessment = assessContract(outcome.contract!, grounded, outcome.script, context.prompt);
        }
        catch (error) {
          if (attempt || deadlineMs - Date.now() < 80_000) throw error;
          correction = '\n\nCORRECT YOUR REVIEW FORMAT: Return the exact JSON value shape in the system instructions. Every feature MUST have id, status, reason, behaviorEvidence, controlEvidence. The status field is one of "implemented", "unavailable", "missing"; do not call it behavior or omit it. Select catalog IDs as evidence. Do not change the script or invent requirements.';
          continue;
        }
        // Invalid reviewer evidence or JSON is not an implementation defect.
        if (!attempt && assessment.evidenceIssues.length && deadlineMs - Date.now() > 80_000) {
          correction = `\n\nCORRECT YOUR REVIEW: Select valid catalog IDs proving the actual effects and complete control wiring. Keep semantic findings. Evidence errors:\n${assessment.evidenceIssues.join("\n")}`;
          continue;
        }
        break;
      }
      if (!assessment) throw new Error("INVALID_REQUIREMENTS_REVIEW");
      outcome.issues = assessment.issues; outcome.coverage = assessment.coverage;
      evidenceOnlyFailure = assessment.evidenceIssues.length > 0 && assessment.issues.every(issue => assessment.evidenceIssues.includes(issue));
    };
    await inspect();
    if (outcome.issues.length && !evidenceOnlyFailure && (outcome.script || (composed && compositionText)) && deadlineMs - Date.now() > 70_000) {
      stage = "repair";
      const repaired = await call(`${writer}\nREPAIR MODE: Repair every listed omission/UI issue while preserving all already working features. Return ${composed ? "the FULL corrected composition JSON object" : "the FULL corrected script"}.`, `${writerRequirements}\n\nACCEPTANCE FAILURES:\n${outcome.issues.join("\n")}\n\n${composed ? "COMPOSITION TO REPAIR:\n" + compositionText : "SCRIPT TO REPAIR:\n" + outcome.script}`, tokens, { timeoutMs: Math.max(1000, Math.min(110_000, deadlineMs - Date.now() - 60_000)), deadlineMs, attempts: 1 });
      outcome.model = repaired.model; outcome.incomplete = repaired.incomplete; outcome.repaired = true;
      implement(repaired.content);
      outcome.coverage = null;
      await inspect();
    }
    if (outcome.issues.length) outcome.reason = "REQUIREMENTS_NOT_MET";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    outcome.reason = ["INCOMPLETE_RESPONSE", "INVALID_REQUIREMENTS", "INCOMPLETE_REQUIREMENTS"].includes(message) ? message : providerErrorCode(error);
    if (outcome.reason === "AI_ERROR") outcome.reason = "INVALID_REQUIREMENTS_REVIEW";
    // No prompts, code, raw provider bodies or credentials are logged.
    const schemaIssues = error && typeof error === "object" && "issues" in error && Array.isArray(error.issues) ? error.issues.map(issue => ({ path: issue.path, code: issue.code })) : undefined;
    console.warn("[generation-failure]", JSON.stringify({ stage, reason: outcome.reason, schemaIssues }));
    outcome.issues.push(outcome.reason === "INVALID_REQUIREMENTS_REVIEW" ? "requirements planning or coverage review could not be validated" : outcome.reason);
    // A generated script is never accepted if its subsequent review fails.
    outcome.coverage = null;
  }
  return outcome;
}
