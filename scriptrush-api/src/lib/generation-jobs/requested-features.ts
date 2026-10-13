/** Conservative inventory, not an inference of game capabilities or mechanics. */
export function requestedFeatures(request: string): string[] {
  const features: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const name = value.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "").trim().slice(0, 240);
    const key = name.normalize("NFKC").toLowerCase();
    if (name && !seen.has(key) && features.length < 32) { seen.add(key); features.push(name); }
  };
  // Explicit lists preserve the user's UI and naming constraints verbatim.
  const parts = request.split(/\r?\n|;/).map(value => value.trim()).filter(Boolean);
  parts.forEach(add);
  // Known phrases only identify what was asked; they never authorize a remote.
  const phrases = /\b(?:auto[ -]?(?:farm|quest|boss|loot|fish|sell)|walk[ -]?speed|jump[ -]?power|rejoin|teleport|téléportation|cooldown|cleanup|nettoyage|respawn|character lifecycle|cycle de vie|(?:english|anglais) UI|UI (?:english|en anglais)|(?:custom|personnalisé) title)\b/giu;
  for (const match of request.matchAll(phrases)) add(match[0]);
  // Comma lists without a recognized phrase still remain explicit requirements.
  if (parts.length === 1 && request.includes(",")) request.split(",").forEach(add);
  if (!features.length) add(request);
  return features;
}
