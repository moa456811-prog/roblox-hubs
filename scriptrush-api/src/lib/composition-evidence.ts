import { buildSourceCatalog, parseModelJson, reviewSchema, type GenerationContract, type SourceCatalogEntry, type TrustedControlEffect } from "./generation-contract.ts";
import { renderHubComposition } from "./hub-composer.ts";
import { shellFeaturePresent, type HubComposition, type HubItem } from "./hub-spec.ts";
import { requestedStandardActions, standardActionMatchesRequirement } from "./composition-actions.ts";
import { gameAdapterFor, gameplayBindingIssues } from "./game-adapters/catalog.ts";
import { gameplayToggleKey } from "./game-actions.ts";

type EvidencePair = { behavior: string; control: string };
type ContractFeature = GenerationContract["features"][number];

/** A reviewed library schedules effects through its owned Heartbeat controller.
 * Generic source reachability cannot follow that state machine. Admit only the
 * exact server renderer and exact game-bound library, never model-supplied code.
 * This proves the UI/library binding; semantic review still decides acceptance. */
export function libraryCompositionProofs(spec: HubComposition, script: string, contract: GenerationContract, game: Record<string, unknown>): TrustedControlEffect[] {
  const pack = gameAdapterFor(game);
  if (!pack || gameplayBindingIssues(spec, contract, pack).length || renderHubComposition(spec, { gameplayFactory: pack.factory }) !== script) return [];
  const catalog = buildSourceCatalog(script);
  const proofs: TrustedControlEffect[] = [];
  for (const [pageIndex, page] of spec.pages.entries()) for (const [itemIndex, item] of page.items.entries()) {
    if (item.kind !== "toggle" || item.action !== "custom" || item.initial || !gameplayToggleKey(item.code)) continue;
    const name = `item${pageIndex + 1}_${itemIndex + 1}`;
    const control = catalog.find(entry => entry.kind === "control" && entry.code.startsWith(`own(${name}Button.Activated, function()`));
    // Large controllers may fill the bounded source catalog before helper
    // functions are listed. The exact rendered callback is still valid legacy
    // contiguous evidence; its bytes and action identity were checked above.
    if (!control) continue;
    for (const featureId of item.featureIds) {
      if (contract.features.some(feature => feature.id === featureId && feature.availability === "supported")) proofs.push({ featureId, control: control.code, behavior: item.code });
    }
  }
  return proofs;
}

function shellMatchesRequirement(spec: HubComposition, feature: ContractFeature): boolean {
  if (feature.availability !== "supported") return false;
  if ([...requestedStandardActions(feature)].some(action => ["walk-speed", "jump-power", "rejoin", "theme"].includes(action))) return false;
  return shellFeaturePresent(spec, feature);
}

/**
 * Repair evidence selection for the exact trusted renderer output only. Semantic
 * findings, feature identities/statuses and UI acceptance remain the reviewer's.
 * The ordinary contract assessor must still verify each control-to-effect link.
 */
export function groundCompositionReview(rawReview: string, spec: HubComposition, script: string, contract: GenerationContract, options: { gameplayFactory?: string; game?: Record<string, unknown> } = {}): string {
  const review = reviewSchema.parse(parseModelJson(rawReview));
  if (renderHubComposition(spec, options) !== script) return rawReview;
  const catalog = buildSourceCatalog(script);
  const requirements = new Map(contract.features.map(feature => [feature.id, feature]));
  // A custom/unsupported requirement may also bind its containing page/window.
  // It must never borrow shell navigation evidence through that second binding.
  const excluded = new Set(spec.pages.flatMap(page => page.items.flatMap(item =>
    item.kind === "disabled" || ("action" in item && item.action === "custom") ? item.featureIds : [])));
  const reference = (needle: string, kind?: SourceCatalogEntry["kind"]): string | undefined => {
    const matches = catalog.filter(entry => entry.code.includes(needle) && (!kind || entry.kind === kind));
    return matches.sort((left, right) => left.code.length - right.code.length)[0]?.id;
  };
  const pair = (controlNeedle: string, behaviorNeedle: string): EvidencePair | undefined => {
    const control = reference(controlNeedle, "control"), behavior = reference(behaviorNeedle, "effect");
    return control && behavior ? { control, behavior } : undefined;
  };
  const actionPair = (item: HubItem, name: string): EvidencePair | undefined => {
    if (!("action" in item) || item.action === "custom") return undefined;
    const effects: Record<string, string> = {
      "walk-speed": "humanoid.WalkSpeed = value",
      "jump-power": "humanoid.JumpPower = value",
      rejoin: "TeleportService:Teleport(game.PlaceId, player)",
      theme: "binding.object.BackgroundColor3 = palettes[themeIndex][binding.key]",
      close: "gui:Destroy()",
      minimize: "panel.Visible = false",
    };
    return pair(`own(${name}Button.Activated, function()`, effects[item.action]);
  };
  const mappings = new Map<string, EvidencePair>();
  for (const proof of options.game ? libraryCompositionProofs(spec, script, contract, options.game) : []) {
    const control = catalog.find(entry => entry.code === proof.control)?.id;
    const behavior = catalog.find(entry => entry.code === proof.behavior)?.id || proof.behavior;
    if (control) mappings.set(proof.featureId, { control, behavior });
  }
  for (const [pageIndex, page] of spec.pages.entries()) {
    for (const [itemIndex, item] of page.items.entries()) {
      const evidence = actionPair(item, `item${pageIndex + 1}_${itemIndex + 1}`);
      if (evidence && "action" in item) for (const id of item.featureIds) {
        const feature = requirements.get(id);
        if (feature && standardActionMatchesRequirement(item.action, feature) && !excluded.has(id) && !mappings.has(id)) mappings.set(id, evidence);
      }
    }
    const pageEvidence = spec.window.navigation === "none"
      ? pair("own(closeButton.Activated, function()", "gui:Destroy()")
      : pair(`own(nav${pageIndex + 1}.Activated, function()`, "page.Visible = id == selected");
    if (pageEvidence) for (const id of page.featureIds) {
      const feature = requirements.get(id);
      if (feature && shellMatchesRequirement(spec, feature) && !excluded.has(id) && !mappings.has(id)) mappings.set(id, pageEvidence);
    }
  }
  const shellEvidence = spec.window.navigation === "none"
    ? pair("own(closeButton.Activated, function()", "gui:Destroy()")
    : pair("own(nav1.Activated, function()", "page.Visible = id == selected");
  if (shellEvidence) for (const id of spec.window.featureIds) {
    const feature = requirements.get(id);
    if (feature && shellMatchesRequirement(spec, feature) && !excluded.has(id) && !mappings.has(id)) mappings.set(id, shellEvidence);
  }
  for (const feature of review.features) {
    const evidence = mappings.get(feature.id);
    if (feature.status === "implemented" && evidence) {
      feature.behaviorEvidence = evidence.behavior;
      feature.controlEvidence = evidence.control;
    }
  }
  const ui = reference(`panel.Size = UDim2.fromOffset(${spec.window.width}, ${spec.window.height})`, "effect");
  if (ui) review.ui.evidence = [ui];
  return JSON.stringify(review);
}
