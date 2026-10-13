import { a7devGenerationGuide } from "./a7dev-generation-guide.ts";
import { z } from "zod/v4";
import type { GenerationContract } from "./generation-contract.ts";
import { SCRIPT_UI_LANGUAGE_POLICY } from "./ui-language.ts";
import { requestedStandardActions, standardActionAllowedForRequirement } from "./composition-actions.ts";
import { parseCompositionJson } from "./composition-json.ts";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const featureIds = z.array(id).max(32);
const color = z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]);
export const hubPaletteSchema = z.object({ background: color, foreground: color, accent: color, control: color, muted: color });
const common = { id, featureIds };
const action = z.enum(["rejoin", "theme", "close", "minimize", "custom"]);
export const hubItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("text"), text: z.string().max(4000) }),
  z.object({ ...common, kind: z.literal("button"), label: z.string().min(1).max(120), description: z.string().max(800), action, code: z.string().max(24000) }),
  z.object({ ...common, kind: z.literal("number"), label: z.string().min(1).max(120), description: z.string().max(800), applyLabel: z.string().min(1).max(120), min: z.number().finite(), max: z.number().finite(), initial: z.number().finite(), action: z.enum(["walk-speed", "jump-power", "custom"]), code: z.string().max(24000) }),
  z.object({ ...common, kind: z.literal("toggle"), label: z.string().min(1).max(120), description: z.string().max(800), onLabel: z.string().min(1).max(120), offLabel: z.string().min(1).max(120), initial: z.boolean(), action: z.enum(["theme", "custom"]), code: z.string().max(24000) }),
  z.object({ ...common, kind: z.literal("disabled"), label: z.string().min(1).max(120), reason: z.string().min(12).max(1500) }),
]);

export const hubCompositionSchema = z.object({
  window: z.object({
    title: z.string().max(240), width: z.number().int().min(240).max(2000), height: z.number().int().min(180).max(1600),
    radius: z.number().int().min(0).max(100), draggable: z.boolean(), navigation: z.enum(["top", "left", "none"]),
    font: z.enum(["Gotham", "GothamMedium", "GothamBold", "Arial", "ArialBold", "SourceSans", "SourceSansBold", "Code", "Roboto", "Ubuntu"]),
    textSize: z.number().int().min(10).max(32), closeLabel: z.string().min(1).max(40).nullable(), minimizeLabel: z.string().min(1).max(40).nullable(), restoreLabel: z.string().min(1).max(120),
    palette: hubPaletteSchema, alternatePalette: hubPaletteSchema.nullable(), featureIds,
  }),
  pages: z.array(z.object({ id, label: z.string().min(1).max(120), featureIds, items: z.array(hubItemSchema).max(64) })).min(1).max(12),
});
export type HubComposition = z.infer<typeof hubCompositionSchema>;
export type HubItem = z.infer<typeof hubItemSchema>;
export const hubCompositionJsonSchema = z.toJSONSchema(hubCompositionSchema, { target: "draft-7" });

export function parseHubComposition(content: string): HubComposition {
  const spec = hubCompositionSchema.parse(parseCompositionJson(content));
  const ids = [...spec.pages.map(page => page.id), ...spec.pages.flatMap(page => page.items.map(item => item.id))];
  if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_HUB_IDS");
  if (spec.window.navigation === "none" && spec.pages.length !== 1) throw new Error("UNREACHABLE_HUB_PAGES");
  for (const item of spec.pages.flatMap(page => page.items)) {
    if (item.kind === "number" && (item.min > item.max || item.initial < item.min || item.initial > item.max)) throw new Error("INVALID_HUB_NUMBER_RANGE");
    if ("action" in item && item.action === "custom" && !item.code.trim()) throw new Error("EMPTY_HUB_BEHAVIOR");
    if ("action" in item && item.action !== "custom" && item.code.trim()) throw new Error("UNEXPECTED_HUB_BEHAVIOR");
    if ("action" in item && item.action === "theme" && !spec.window.alternatePalette) throw new Error("MISSING_HUB_ALTERNATE_THEME");
  }
  return spec;
}

/** Coverage is tied to the original planner IDs; composition cannot silently drop a feature. */
export function validateCompositionCoverage(spec: HubComposition, contract: GenerationContract): string[] {
  const bindings = [
    ...spec.window.featureIds.map(id => ({ id, disabled: false, interactive: false, shell: true, action: null as string | null })),
    ...spec.pages.flatMap(page => [...page.featureIds.map(id => ({ id, disabled: false, interactive: false, shell: true, action: null as string | null })), ...page.items.flatMap(item => item.featureIds.map(id => ({ id, disabled: item.kind === "disabled", interactive: item.kind === "button" || item.kind === "number" || item.kind === "toggle", shell: false, action: "action" in item ? item.action : null })))]),
  ];
  const known = new Set(contract.features.map(feature => feature.id));
  const issues = [...new Set(bindings.filter(binding => !known.has(binding.id)).map(binding => `Unknown requirement binding: ${binding.id}`))];
  for (const feature of contract.features) {
    const attached = bindings.filter(binding => binding.id === feature.id);
    const priorIssues = issues.length;
    if (!attached.length) issues.push(`Missing requirement in composed hub: ${feature.id}`);
    else if (feature.availability === "supported" && attached.every(binding => binding.disabled)) issues.push(`Supported requirement was disabled: ${feature.id}`);
    else if (feature.availability === "needs-runtime" && attached.some(binding => !binding.disabled)) issues.push(`Unverified game requirement must have a disabled control: ${feature.id}`);
    else if (feature.availability === "supported" && feature.interaction && !attached.some(binding => binding.interactive) && !(attached.some(binding => binding.shell) && shellFeaturePresent(spec, feature))) issues.push(`Interactive requirement has no working control: ${feature.id}`);
    if (feature.availability === "supported" && issues.length === priorIssues) {
      const expected = requestedStandardActions(feature);
      const standard = attached.filter(binding => binding.action && binding.action !== "custom");
      if (expected.size) for (const binding of standard) if (!standardActionAllowedForRequirement(binding.action!, feature)) issues.push(`Standard action ${binding.action} does not implement requirement: ${feature.id}`);
      const hasCustom = attached.some(binding => binding.action === "custom");
      for (const action of expected) if (["walk-speed", "jump-power", "rejoin", "theme"].includes(action) && !hasCustom && !standard.some(binding => binding.action === action && standardActionAllowedForRequirement(action, feature))) issues.push(`Missing matching ${action} control for requirement: ${feature.id}`);
      if (attached.length && attached.every(binding => binding.shell) && !shellFeaturePresent(spec, feature) && !issues.some(issue => issue.endsWith(`: ${feature.id}`))) issues.push(`Requirement has no matching feature control: ${feature.id}`);
    }
  }
  return issues;
}

/** Window/page bindings are for the interface itself, never a substitute for a feature control.
 * This structural check supplements the independent semantic review of the original request.
 */
export function shellFeaturePresent(spec: HubComposition, feature: GenerationContract["features"][number]): boolean {
  const name = `${feature.id} ${feature.label}`.toLowerCase();
  if (/walk[ -]?speed|jump[ -]?power|rejoin|teleport|theme|thème|farm|combat|quest|loot|boss|inventory|inventaire|currency|\besp\b|noclip|flight|\bfly\b|server-hop|vitesse|saut/.test(name)) return false;
  const behavior = `${name} ${feature.behavior}`.toLowerCase();
  if (!/\bui\b|screen[ -]?gui|interface|window|panel|panneau|fen[êe]tre|title|titre|tabs?\b|onglets?\b|navigation|pages?\b|clos(e|ing)|fermer|fermeture|cleanup|clean-up|minimi[sz]|rédui|restor|rétabli|drag|dépla|depla/.test(behavior)) return false;
  if (/clos(e|ing)|fermer|fermeture/.test(behavior) && !spec.window.closeLabel) return false;
  if (/minimi[sz]|rédui|restor|rétabli/.test(behavior) && !spec.window.minimizeLabel) return false;
  if (/drag|dépla|depla/.test(behavior) && !spec.window.draggable) return false;
  if (/tabs?\b|onglets?\b|navigation/.test(behavior) && (spec.window.navigation === "none" || spec.pages.length < 2)) return false;
  return true;
}

export const HUB_COMPOSER_SYSTEM = `You are a Luau hub composition engineer. ${a7devGenerationGuide("composer")} ${SCRIPT_UI_LANGUAGE_POLICY} Return JSON ONLY containing actual VALUES matching the supplied HUB COMPOSITION JSON SCHEMA. Never return a JSON schema, Lua block or prose.
The root object MUST have exactly window and pages. Here is a VALUES shape (replace every example according to the user's design and features): {"window":{"title":"","width":480,"height":360,"radius":12,"draggable":true,"navigation":"top","font":"Gotham","textSize":14,"closeLabel":"Close","minimizeLabel":"Minimize","restoreLabel":"Restore","palette":{"background":[18,24,42],"foreground":[240,245,255],"accent":[85,221,255],"control":[30,43,68],"muted":[175,191,213]},"alternatePalette":null,"featureIds":[]},"pages":[{"id":"page-id","label":"User's exact tab label","featureIds":[],"items":[]}]}. palette and alternatePalette MUST be OBJECTS with these FIVE NAMED properties (background,foreground,accent,control,muted), NEVER arrays of colors. A color itself is a three-number RGB array. Use null for an unwanted alternate palette.
Read the ENTIRE original user request and requirements. Design ALL pages, visible texts and independent controls together. Bind EVERY requirement ID using featureIds on its relevant item, page or window. A whole-interface/UI-only requirement can bind window.featureIds; title/navigation/close/minimize requirements can bind window.featureIds too. A behavioral feature belongs on its real control. Never choose one representative feature or invent new gameplay. Explicit requested title, dimensions, radius, colors and navigation win over defaults; translate French functional labels and page content into English. For unspecified design only, choose readable coherent values. Window palette RGB arrays are actual applied values. Use alternatePalette only when a theme switch is requested. Set navigation top or left as requested; none requires one page. Text items display real requested page content. FeatureIds must use the supplied requirement IDs exactly; all id strings are lowercase kebab-case and unique across pages/items.
EVERY distinct requested tab must have its OWN page object with its requested English label and relevant content (translate French functional labels into English). If the user requests tabs Movement, Session, Settings, pages MUST contain three distinct objects labeled Movement, Session, Settings, with movement controls, session actions and settings on their appropriate pages. Never put all controls in one page labeled with the window title. If a French request mentions Accueil and Réglages, create distinct Home and Settings pages with the corresponding English page content. Do not invent extra pages or replace requested page labels.
The verified renderer creates the ScreenGui, correctly separated header/navigation/content, scrolling vertically laid-out control rows, tabs, rounded corners, drag, owned event connections, close cleanup and minimize/restore. Set window.title to an empty string when no title was requested: the renderer omits the title label. Use the user's exact title when supplied. Never invent a brand, creator credit or reference-skill identity. Preserve every requested UI detail in the spec. closeLabel and minimizeLabel may be null only if those controls are unwanted; restoreLabel is user-facing text. Width/height are exact pixels. Use requested font when supported; default Gotham, 14. Do not put window boilerplate in custom code.
Item shapes:
text: {id,featureIds,kind:"text",text}
button: {id,featureIds,kind:"button",label,description,action:"rejoin|theme|close|minimize|custom",code}
number: {id,featureIds,kind:"number",label,description,applyLabel,min,max,initial,action:"walk-speed|jump-power|custom",code}
toggle: {id,featureIds,kind:"toggle",label,description,onLabel,offLabel,initial,action:"theme|custom",code}
disabled: {id,featureIds,kind:"disabled",label,reason}
Standard rejoin teleports to game.PlaceId only on click. Standard walk-speed and jump-power validate the chosen numeric range and update the CURRENT local humanoid on Apply; jump-power enables UseJumpPower. Standard theme switches and APPLIES both supplied palettes. Use these actions when they exactly implement the requested behavior; code MUST be empty for standard actions. Custom action code is a COMPLETE Luau callback BODY implementing the exact requested effect. It receives ctx.player, ctx.services, ctx.gui, ctx.panel, ctx.controls (by item id), ctx.state (persistent per item), ctx.own(signal,handler), ctx.onCleanup(fn), ctx.notify(message), ctx.value (number control), ctx.input (its TextBox), ctx.enabled (toggle state), ctx.control (clicked button). These names are defined before every callback. Custom code must use ctx for shared objects; do not refer to undeclared renderer locals, create another ScreenGui or add unrelated UI. Store any custom connections through ctx.own and stop custom tasks via ctx.onCleanup. A toggle callback runs on interaction with ctx.enabled; if an initially enabled custom toggle is requested, renderer invokes its callback once after creation. Implement actual behavior, never TODO/print-only/no-op callbacks.
Game-specific actions/remotes require actual evidence. Keep EVERY needs-runtime requirement as its own disabled item with a visible precise missing-evidence reason. Never invent remotes or present a fake supported action. Standard Roblox client UI/utility APIs do not need a game profile. UI-only means text/pages/window only, no new gameplay. In fix mode existing script cannot be replaced by a simplified composition. The full schema follows in the user message.`;
