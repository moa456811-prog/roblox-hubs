import { buildSourceCatalog, parseModelJson, reviewSchema, type SourceCatalogEntry } from "./generation-contract.ts";
import { renderHubComposition } from "./hub-composer.ts";
import type { HubComposition, HubItem } from "./hub-spec.ts";

type EvidencePair = { behavior: string; control: string };

/**
 * Repair evidence selection for the exact trusted renderer output only. Semantic
 * findings, feature identities/statuses and UI acceptance remain the reviewer's.
 * The ordinary contract assessor must still verify each control-to-effect link.
 */
export function groundCompositionReview(rawReview: string, spec: HubComposition, script: string): string {
  const review = reviewSchema.parse(parseModelJson(rawReview));
  if (renderHubComposition(spec) !== script) return rawReview;
  const catalog = buildSourceCatalog(script);
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
  for (const [pageIndex, page] of spec.pages.entries()) {
    for (const [itemIndex, item] of page.items.entries()) {
      const evidence = actionPair(item, `item${pageIndex + 1}_${itemIndex + 1}`);
      if (evidence) for (const id of item.featureIds) if (!excluded.has(id) && !mappings.has(id)) mappings.set(id, evidence);
    }
    const pageEvidence = spec.window.navigation === "none"
      ? pair("own(closeButton.Activated, function()", "gui:Destroy()")
      : pair(`own(nav${pageIndex + 1}.Activated, function()`, "page.Visible = id == selected");
    if (pageEvidence) for (const id of page.featureIds) if (!excluded.has(id) && !mappings.has(id)) mappings.set(id, pageEvidence);
  }
  const shellEvidence = spec.window.navigation === "none"
    ? pair("own(closeButton.Activated, function()", "gui:Destroy()")
    : pair("own(nav1.Activated, function()", "page.Visible = id == selected");
  if (shellEvidence) for (const id of spec.window.featureIds) if (!excluded.has(id) && !mappings.has(id)) mappings.set(id, shellEvidence);
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
