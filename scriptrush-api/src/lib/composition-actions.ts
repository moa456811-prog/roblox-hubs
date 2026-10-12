import type { GenerationContract } from "./generation-contract.ts";

type ContractFeature = GenerationContract["features"][number];

/** Recognize only explicit standard behaviors; unknown/custom semantics stay with review. */
export function requestedStandardActions(feature: ContractFeature): Set<string> {
  const text = `${feature.id} ${feature.label} ${feature.behavior}`.toLowerCase();
  const name = `${feature.id} ${feature.label}`.toLowerCase();
  const actions = new Set<string>();
  if (/walk[ -]?speed|\bwalkspeed\b|\bvitesse(?: de (?:marche|déplacement))?\b/.test(text)) actions.add("walk-speed");
  if (/jump[ -]?power|\bjumppower\b|puissance (?:de|du) saut/.test(text)) actions.add("jump-power");
  if (/\brejoin\b|\breconnect\b|\breconnexion\b|\brejoindre\b/.test(text)) actions.add("rejoin");
  if (/\btheme\b|\bthème\b/.test(name) || /(?:switch|toggle|change|alternat|bascul|changer).{0,60}(?:theme|thème|palette)|(?:theme|thème|palette).{0,60}(?:switch|toggle|change|alternat|bascul|changer)/.test(feature.behavior.toLowerCase())) actions.add("theme");
  if (/\bclose\b|\bclosing\b|\bfermer\b|\bfermeture\b/.test(text)) actions.add("close");
  if (/minimi[sz]|rédui|redui/.test(text)) actions.add("minimize");
  return actions;
}

export function standardActionAllowedForRequirement(action: string, feature: ContractFeature): boolean {
  if (feature.availability !== "supported" || !requestedStandardActions(feature).has(action)) return false;
  const text = `${feature.id} ${feature.label} ${feature.behavior}`;
  // The built-in rejoin chooses the place, not a particular server instance.
  if (action === "rejoin" && /same (?:server|instance)|current server|specific server|JobId|TeleportToPlaceInstance|serveur actuel|même serveur/i.test(text)) return false;
  return true;
}

/** One standard proof cannot stand in for a requirement with several independent effects. */
export function standardActionMatchesRequirement(action: string, feature: ContractFeature): boolean {
  return requestedStandardActions(feature).size === 1 && standardActionAllowedForRequirement(action, feature);
}
