import { verifiedMitText } from "./knowledge-v2/ingest.ts";

export type GenerationReferenceAttribution = { sourceId: string; url: string; revision: string; licenseText: string };

/** Retain complete notices conservatively for every licensed excerpt sent to
 * the model. Comments cannot add runtime effects, even if notices contain Lua
 * delimiters. The reviewed/rendered code is left byte-for-byte unchanged. */
export function retainGenerationAttributions(script: string, references: GenerationReferenceAttribution[]): string {
  const notices: string[] = [], seen = new Set<string>();
  if (references.length > 12) throw new Error("GENERATION_ATTRIBUTION_LIMIT");
  for (const reference of references) {
    const url = new URL(reference.url);
    if (url.protocol !== "https:" || url.username || url.password || !/^[a-f0-9]{40}$/.test(reference.revision) || !/^[^\r\n\u0000-\u001f]{1,160}$/.test(reference.sourceId) || reference.licenseText.length > 32_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reference.licenseText) || !verifiedMitText(reference.licenseText)) throw new Error("INVALID_GENERATION_ATTRIBUTION");
    const key = reference.url + "@" + reference.revision;
    if (seen.has(key)) continue;
    seen.add(key);
    notices.push([`Reference licence notice (${reference.sourceId})`, `Source: ${url.href}`, `Revision: ${reference.revision}`, ...reference.licenseText.replace(/\r\n?/g, "\n").split("\n")].map(line => `-- ${line}`).join("\n"));
  }
  return notices.length ? script + "\n\n" + notices.join("\n\n") + "\n" : script;
}
