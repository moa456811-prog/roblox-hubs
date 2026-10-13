import type { GenerationContract } from "./generation-contract.ts";
import type { HubComposition, HubItem } from "./hub-spec.ts";
import { shellFeaturePresent } from "./hub-spec.ts";
import { requestedStandardActions } from "./composition-actions.ts";
import { englishUiIssues, translateFunctionalUiText } from "./ui-language.ts";

type PaletteRole = keyof HubComposition["window"]["palette"];
type Rgb = [number, number, number];
export type ExplicitUiRequirement = {
  field: "title" | "width" | "height" | "radius" | "navigation" | "draggable" | "font" | "textSize";
  value: string | number | boolean;
  evidence: string;
};
export type ExplicitColorRequirement = { role: PaletteRole | null; palette: "primary" | "alternate"; rgb: Rgb; evidence: string };
export type QualityFeatureRequirement = {
  id: string;
  label: string;
  origin: "user" | "planner";
  evidence: string;
  behavior: string;
  interaction: boolean;
  availability: "supported" | "needs-runtime" | "unspecified";
  actions: string[];
  aliases: string[];
};
export type GenerationQualityInventory = {
  version: "explicit-request-v1";
  features: QualityFeatureRequirement[];
  ui: ExplicitUiRequirement[];
  colors: ExplicitColorRequirement[];
  pages: { label: string; originalLabel: string; evidence: string }[];
  exhaustivePages: boolean;
  limitations: string[];
};
export type GenerationQualityAssessment = {
  issues: string[];
  checks: { requirement: string; passed: boolean; expected: unknown; actual: unknown }[];
  features: { id: string; status: "control-present" | "disabled" | "missing"; itemIds: string[] }[];
  verification: "composition-structure-only";
  limitations: string[];
};

const normal = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const unique = <T>(values: T[]) => [...new Set(values)];
const supportedFonts = ["GothamMedium", "GothamBold", "Gotham", "ArialBold", "Arial", "SourceSansBold", "SourceSans", "Code", "Roboto", "Ubuntu"];
const quoted = /["“«]([^"”»\r\n]{1,240})["”»]|'([^'\r\n]{1,240})'/gu;
const featurePatterns: { id: string; label: string; pattern: RegExp; actions: string[]; aliases: string[]; gameplay?: boolean }[] = [
  { id: "walk-speed", label: "Walk Speed", pattern: /\bwalk[ -]?speed\b|\bvitesse de (?:marche|d[eé]placement)\b/giu, actions: ["walk-speed"], aliases: ["Walk Speed", "WalkSpeed", "Vitesse de marche"] },
  { id: "jump-power", label: "Jump Power", pattern: /\bjump[ -]?power\b|\bpuissance (?:du|de) saut\b/giu, actions: ["jump-power"], aliases: ["Jump Power", "JumpPower", "Puissance de saut"] },
  { id: "rejoin", label: "Rejoin", pattern: /\brejoin\b|\breconnect\b|\breconnexion\b|\brejoindre\b/giu, actions: ["rejoin"], aliases: ["Rejoin", "Reconnect", "Rejoindre"] },
  { id: "theme", label: "Theme", pattern: /\b(?:switch|toggle|change|alternate)\s+(?:the\s+)?theme\b|\btheme\s+(?:switch|toggle)\b|\b(?:changer|basculer|alterner)\s+(?:le\s+)?th[eè]me\b/giu, actions: ["theme"], aliases: ["Theme", "Theme Switch", "Thème"] },
  { id: "auto-farm", label: "Auto Farm", pattern: /\bauto[ -]?farm\b|\bautomatic farming\b/giu, actions: [], aliases: ["Auto Farm", "AutoFarm", "Automatic Farming"], gameplay: true },
  { id: "auto-boss", label: "Auto Boss", pattern: /\bauto[ -]?boss\b|\bboss farming\b/giu, actions: [], aliases: ["Auto Boss", "AutoBoss", "Boss Farm", "Boss Farming"], gameplay: true },
  { id: "quest-farm", label: "Quest Farm", pattern: /\bquest[ -]?farm\b|\bauto[ -]?quest\b/giu, actions: [], aliases: ["Quest Farm", "QuestFarm", "Auto Quest"], gameplay: true },
  { id: "auto-loot", label: "Auto Loot", pattern: /\bauto[ -]?loot\b|\bautomatic loot\b/giu, actions: [], aliases: ["Auto Loot", "AutoLoot", "Automatic Loot"], gameplay: true },
  { id: "auto-fish", label: "Auto Fish", pattern: /\bauto[ -]?fish(?:ing)?\b|\bautomatic fishing\b/giu, actions: [], aliases: ["Auto Fish", "Auto Fishing", "AutoFish"], gameplay: true },
  { id: "auto-sell", label: "Auto Sell", pattern: /\bauto[ -]?sell\b|\bautomatic selling\b/giu, actions: [], aliases: ["Auto Sell", "AutoSell", "Automatic Selling"], gameplay: true },
];
const limits = [
  "Only explicit, recognized request forms are extracted; the independent semantic review must cover other wording and custom behavior.",
  "A matching composition control is not proof that its custom Luau behavior works, compiles, or succeeds in the live game.",
  "Named colors, arbitrary prose translation and screenshot similarity require semantic or visual review; no RGB value is guessed.",
];

/** An exclusion lasts over a feature list, not across sentence/contrast clauses
 * or a later positive command. Keep non-feature words so "without game files,
 * add Rejoin" cannot turn into an exclusion of Rejoin. */
function featureExcluded(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).split(/[.;!?\n]|\b(?:but|mais|however|instead|cependant)\b/iu).at(-1)!;
  const exclusions = [...before.matchAll(/\b(?:do\s+not(?:\s+(?:add|include|create|implement|generate|use))?|don['’]t(?:\s+(?:add|include|create|implement|generate|use))?|neither|without|excluding|exclude|no|not|sans|aucun(?:e)?s?|pas(?:\s+(?:de|inclure|ajouter|mettre|int[eé]grer|g[eé]n[eé]rer|cr[eé]er|utiliser|pr[eé]voir)|\s+que\s+(?:tu|vous)\s+(?:ajoutes?|ajoutiez|inclues?|incluiez|cr[eé]es?|cr[eé]iez))?)(?![\p{L}\p{N}_])/giu)];
  for (const exclusion of exclusions.reverse()) {
    // "Ne désactive pas Rejoin" requests retaining the control, not omitting it.
    if (/^pas\b/iu.test(exclusion[0]) && /\b(?:d[eé]sactiv(?:e|er|ez)|supprim(?:e|er|ez)|retir(?:e|er|ez)|masqu(?:e|er|ez))\s*$/iu.test(before.slice(0, exclusion.index))) continue;
    let tail = normal(before.slice(exclusion.index + exclusion[0].length));
    for (const candidate of featurePatterns) for (const alias of candidate.aliases) {
      const phrase = normal(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      tail = tail.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${phrase}(?![\\p{L}\\p{N}_])`, "gu"), " ");
    }
    // Determiners and list conjunctions add no new command. Words such as
    // "add/include/ajoute" deliberately remain to start a positive request.
    tail = tail.replace(/\b(?:and|or|nor|et|ou|ni|any|a|an|the|de|des|du|d|le|la|les|un|une|feature|features|control|controls|button|buttons|toggle|toggles|fonctionnalite|fonctionnalites|bouton|boutons|option|options|please|svp)\b/gu, " ").trim();
    if (!tail) return true;
  }
  // Handle an explicit negative that follows the named feature as well.
  return /^\s*(?:(?:is|must|should)\s+)?(?:not\s+(?:wanted|requested|allowed|included|added)|must\s+not\s+be\s+(?:included|added)|should\s+not\s+be\s+(?:included|added)|(?:est\s+)?(?:exclu|exclue|interdit|interdite)|ne\s+doit\s+pas\s+[eê]tre\s+(?:ajout[eé]|inclus))/iu.test(text.slice(end).split(/[.;!?\n]/)[0]);
}

/** Original user text is the authority. No game mechanics or visual values are inferred from references. */
export function buildGenerationQualityInventory(prompt: string, contract?: GenerationContract): GenerationQualityInventory {
  const ui: ExplicitUiRequirement[] = [], colors: ExplicitColorRequirement[] = [];
  const add = (field: ExplicitUiRequirement["field"], value: ExplicitUiRequirement["value"], evidence: string) => {
    if (!ui.some(item => item.field === field && item.value === value)) ui.push({ field, value, evidence });
  };
  // "No title please" is an absence requirement, not the custom name "please".
  // Quoted proper titles such as "Untitled" stay exact and are not absence commands.
  const quotedSpans = [...prompt.matchAll(quoted)].map(match => ({ start: match.index, end: match.index + match[0].length }));
  const noTitle = [...prompt.matchAll(/\b(?:no title(?!\s+changes?\b)|untitled|unnamed|without (?:a )?(?:name|title)|sans (?:nom|titre))\b/giu)]
    .find(match => !quotedSpans.some(span => match.index >= span.start && match.index < span.end));
  if (noTitle) add("title", "", noTitle[0]);
  else {
    const titlePattern = /\b(?:titled|title|titre|(?:hub|window|interface|panel|fen[eê]tre|panneau)\s+(?:named|nomm[eé]e?))\b(?:\s+(?:exact|exactement|personnalis[eé]|custom))?\s*(?::|=|is|est|de)?\s*(?:["“«]([^"”»\r\n]{0,240})["”»]|'([^'\r\n]{0,240})'|([^,;\n.]{1,240}))/giu;
    for (const title of prompt.matchAll(titlePattern)) {
      const value = (title[1] ?? title[2] ?? title[3] ?? "").trim();
      if (title[3] !== undefined) {
        const before = prompt.slice(Math.max(0, title.index - 55), title.index);
        const preserve = /\b(?:keep|preserve|retain|leave|conserve|conserver|garde|garder|maintenir|pr[eé]server|laisser)\s+(?:(?:the|its|my|current|existing|original|custom|exact|le|mon|ce|son|actuel|original|personnalis[eé])\s+){0,4}$/iu.test(before);
        const refersToExisting = /^(?:unchanged|unmodified|existing|original|the same|as is|and|or|please|inchang[eé]|identique|existant|actuel|et|ou)\b/iu.test(value);
        const noChanges = /\bno\s*$/iu.test(before) && /^changes?\b/iu.test(value);
        if (!value || preserve || refersToExisting || noChanges) continue;
      }
      add("title", value, title[0]);
      break;
    }
  }

  const dimensions = /\b(?:size|dimensions?|taille|window|fen[eê]tre|panel|panneau|interface|ui)\s*(?:(?:of|de|is|est|:|=)\s*)?(\d{3,4})\s*(?:px\s*)?(?:x|×|by|par)\s*(\d{3,4})\s*(?:px)?\b/giu;
  for (const match of prompt.matchAll(dimensions)) {
    add("width", Number(match[1]), match[0]); add("height", Number(match[2]), match[0]);
  }
  for (const [field, pattern] of [
    ["width", /\b(?:width|largeur)\s*(?:(?:of|de|is|est|:|=)\s*)?(\d{3,4})\s*(?:px|pixels)?\b/giu],
    ["height", /\b(?:height|hauteur)\s*(?:(?:of|de|is|est|:|=)\s*)?(\d{3,4})\s*(?:px|pixels)?\b/giu],
    ["radius", /\b(?:radius|corner radius|rayon|rayon des coins|arrondi)\s*(?:(?:of|de|is|est|:|=)\s*)?(\d{1,3})\s*(?:px|pixels)?\b/giu],
    ["textSize", /\b(?:text size|font size|taille du texte|taille de police)\s*(?:(?:of|de|is|est|:|=)\s*)?(\d{1,2})\s*(?:px|pixels)?\b/giu],
  ] as const) for (const match of prompt.matchAll(pattern)) add(field, Number(match[1]), match[0]);

  for (const [value, pattern] of [
    ["left", /\b(?:left (?:navigation|tabs|sidebar)|(?:navigation|tabs?|sidebar|onglets?)\s+(?:on the left|[aà] gauche))\b/giu],
    ["top", /\b(?:top (?:navigation|tabs)|(?:navigation|tabs?|onglets?)\s+(?:at the top|on top|en haut))\b/giu],
    ["none", /\b(?:no (?:navigation|tabs)|without tabs|sans (?:navigation|onglets))\b/giu],
  ] as const) for (const match of prompt.matchAll(pattern)) add("navigation", value, match[0]);
  const notDraggable = /\b(?:not draggable|non[ -]draggable|sans d[eé]placement|fixed window|fen[eê]tre fixe)\b/iu.exec(prompt);
  const draggable = /\b(?:draggable|d[eé]pla[çc]able)\b/iu.exec(prompt);
  if (notDraggable) add("draggable", false, notDraggable[0]);
  else if (draggable) add("draggable", true, draggable[0]);
  const font = /\b(?:font|police)\s*(?:(?:of|de|is|est|:|=)\s*)?(GothamMedium|GothamBold|Gotham|ArialBold|Arial|SourceSansBold|SourceSans|Code|Roboto|Ubuntu)\b/iu.exec(prompt);
  if (font) add("font", supportedFonts.find(value => value.toLowerCase() === font[1].toLowerCase())!, font[0]);

  const colorPattern = /(?:Color3\.fromRGB|RGB)\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)|(?:Color3\.fromHex\s*\(\s*["']#?([\da-f]{6})["']\s*\))|#([\da-f]{6})(?![\da-f])/giu;
  const roles: { role: PaletteRole; pattern: RegExp }[] = [
    { role: "background", pattern: /\b(?:background|fond|arri[eè]re[ -]plan)\b/giu },
    { role: "foreground", pattern: /\b(?:foreground|text color|texte|text)\b/giu },
    { role: "accent", pattern: /\b(?:accent|highlight|surbrillance)\b/giu },
    { role: "control", pattern: /\b(?:control|controls|button|buttons|contr[oô]les?|boutons?)\b/giu },
    { role: "muted", pattern: /\b(?:muted|secondary text|texte secondaire)\b/giu },
  ];
  for (const match of prompt.matchAll(colorPattern)) {
    const rgb: Rgb = match[4] || match[5] ? [0, 2, 4].map(index => parseInt((match[4] || match[5]).slice(index, index + 2), 16)) as Rgb : [Number(match[1]), Number(match[2]), Number(match[3])];
    if (rgb.some(value => value > 255)) continue;
    const before = prompt.slice(Math.max(0, match.index - 45), match.index).split(/[;\n.]/).at(-1)!;
    const after = prompt.slice(match.index + match[0].length, match.index + match[0].length + 24).split(/[,;\n.]/)[0];
    const candidates = roles.flatMap(({ role, pattern }) => [...before.matchAll(pattern)].map(found => ({ role, distance: before.length - found.index - found[0].length })));
    candidates.sort((a, b) => a.distance - b.distance);
    const trailing = /^(?:\s+(?:as|for|pour|en))?\s+(background|foreground|accent|control|muted)\b/iu.exec(after);
    const role = trailing ? trailing[1].toLowerCase() as PaletteRole : candidates[0]?.distance <= 18 ? candidates[0].role : null;
    const themeHeading = [...prompt.slice(0, match.index).matchAll(/\b(alternate palette|alternative palette|alternate theme|second theme|palette alternative|second th[eè]me|primary palette|primary theme|initial palette|initial theme|palette principale|th[eè]me principal)\b/giu)].at(-1)?.[1];
    const palette = themeHeading && /alternate|alternative|second/iu.test(themeHeading) ? "alternate" : "primary";
    if (!colors.some(item => item.role === role && item.palette === palette && item.rgb.every((value, index) => value === rgb[index]))) colors.push({ role, palette, rgb, evidence: `${role ? before : ""}${match[0]}${trailing?.[0] ?? ""}`.trim() });
  }

  const pages: GenerationQualityInventory["pages"] = [];
  let exhaustivePages = false;
  const pagesPattern = /\b(?:tabs|pages|onglets)\s*(?:(?:named|called|nomm[eé]s|appel[eé]s|are|:|=)\s*)?([^;\n.]{1,500})/giu;
  for (const match of prompt.matchAll(pagesPattern)) {
    if (/^\s*[,;]|^\s*(?:and|et)\b/iu.test(match[1])) continue;
    const list = match[1].split(/\b(?:with|avec|containing|contenant|contents?|contenus?|buttons?|boutons?|size|taille|width|height|title|titre|and a|et un|et une)\b/iu)[0].replace(/[,\s]+$/, "");
    const quotedLabels = [...list.matchAll(quoted)].map(item => item[1] ?? item[2]);
    const labels = quotedLabels.length ? quotedLabels : list.split(/\s*,\s*|\s+(?:and|et)\s+/iu).map(item => item.trim()).filter(item => /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,70}$/u.test(item));
    if (!quotedLabels.length && (labels.length < 2 || labels.some(label => /\b(?:top|left|right|en haut|[aà] gauche|navigation|must|should|doit|doivent|working|fonctionnels?)\b/iu.test(label)))) continue;
    for (const label of labels) {
      const translated = translateFunctionalUiText(label);
      if (!pages.some(page => page.label === translated)) pages.push({ label: translated, originalLabel: label, evidence: match[0] });
    }
    exhaustivePages ||= /\b(?:only|exactly|uniquement|exactement|juste)\b/iu.test(prompt.slice(Math.max(0, match.index - 35), match.index));
  }

  const features: QualityFeatureRequirement[] = (contract?.features ?? []).map(feature => ({ id: feature.id, label: feature.label, origin: "planner", evidence: feature.behavior, behavior: feature.behavior, interaction: feature.interaction, availability: feature.availability, actions: [...requestedStandardActions(feature)], aliases: [feature.label] }));
  const protectedText = [...ui.filter(item => item.field === "title").map(item => item.evidence), ...pages.map(page => page.evidence)];
  let featureText = prompt;
  for (const text of protectedText) featureText = featureText.replace(text, " ".repeat(text.length));
  const textOnly = /\b(?:ui[ -]only|interface uniquement|text[ -]only|texte uniquement|informational text only|display (?:only )?(?:the )?text|affich(?:er|e) (?:seulement |uniquement )?(?:le )?texte)\b/iu.test(prompt);
  for (const candidate of featurePatterns) {
    if (candidate.gameplay && textOnly) continue;
    const found = [...featureText.matchAll(candidate.pattern)].find(match => !featureExcluded(featureText, match.index, match.index + match[0].length));
    if (!found) continue;
    const aliases = candidate.aliases.map(normal);
    const existing = features.find(feature => aliases.includes(normal(feature.label)) || (candidate.actions.length > 0 && candidate.actions.every(action => feature.actions.includes(action))));
    if (existing) { existing.origin = "user"; existing.evidence = found[0]; existing.aliases = unique([...existing.aliases, ...candidate.aliases]); }
    else features.push({ id: `request-${candidate.id}`, label: candidate.label, origin: "user", evidence: found[0], behavior: found[0], interaction: true, availability: "unspecified", actions: [...candidate.actions], aliases: [...candidate.aliases] });
  }
  return { version: "explicit-request-v1", features, ui, colors, pages, exhaustivePages, limitations: [...limits] };
}

/** Call with the normalized composition passed unchanged to the trusted renderer, never a model's claimed review. */
export function assessGenerationQuality(inventory: GenerationQualityInventory, spec: HubComposition): GenerationQualityAssessment {
  const issues = [...englishUiIssues(spec)], checks: GenerationQualityAssessment["checks"] = [], features: GenerationQualityAssessment["features"] = [];
  const check = (requirement: string, expected: unknown, actual: unknown, passed: boolean, message: string) => {
    checks.push({ requirement, expected, actual, passed }); if (!passed) issues.push(message);
  };
  for (const requirement of inventory.ui) {
    const actual = spec.window[requirement.field];
    check(`window.${requirement.field}`, requirement.value, actual, actual === requirement.value, `Requested window.${requirement.field} is ${JSON.stringify(requirement.value)}, but the rendered value is ${JSON.stringify(actual)}.`);
  }
  for (const color of inventory.colors) {
    const palette = color.palette === "alternate" ? spec.window.alternatePalette : spec.window.palette;
    const actual = palette ? color.role ? [palette[color.role]] : Object.values(palette) : [];
    const matches = actual.some(rgb => rgb.every((value, index) => value === color.rgb[index]));
    check(`${color.palette}Palette.${color.role ?? "applied-color"}`, color.rgb, actual, matches, `Requested ${color.role ?? "UI"} color RGB(${color.rgb.join(",")}) is not applied to the requested rendered ${color.palette} palette${color.role ? " role" : ""}.`);
  }
  for (const page of inventory.pages) {
    const matches = spec.pages.filter(candidate => candidate.label === page.label);
    check(`page.${page.label}`, page.label, spec.pages.map(candidate => candidate.label), matches.length === 1, `Requested page ${JSON.stringify(page.label)} must be a distinct rendered page.`);
  }
  if (inventory.pages.length > 1) check("pages.reachable", true, spec.window.navigation !== "none", spec.window.navigation !== "none", "Requested multiple pages need working navigation.");
  if (inventory.exhaustivePages) {
    const expected = inventory.pages.map(page => page.label), actual = spec.pages.map(page => page.label);
    check("pages.exact-list", expected, actual, actual.length === expected.length && actual.every(page => expected.includes(page)), "The original request specifies an exact page list; unrequested or missing pages change its UI scope.");
  }
  if (inventory.pages.length > 1) {
    const expected = inventory.pages.map(page => page.label), actual = spec.pages.map(page => page.label).filter(label => expected.includes(label));
    check("pages.order", expected, actual, actual.every((page, index) => page === expected[index]) && actual.length === expected.length, "Requested pages are missing or rendered in a different order.");
  }
  const allItems = spec.pages.flatMap(page => page.items);
  for (const feature of inventory.features) {
    if (!feature.interaction) continue;
    const aliases = feature.aliases.map(normal);
    const bound = allItems.filter(item => item.featureIds.includes(feature.id) || ("label" in item && aliases.includes(normal(item.label))) || ("action" in item && feature.actions.length === 1 && item.action === feature.actions[0]));
    const isControl = (item: HubItem) => item.kind === "button" || item.kind === "number" || item.kind === "toggle";
    // Window lifecycle controls are created by the trusted renderer, not decorative feature bindings.
    const shellBinding = spec.window.featureIds.includes(feature.id) || spec.pages.some(page => page.featureIds.includes(feature.id));
    const shell = shellBinding ? shellFeaturePresent(spec, { ...feature, availability: feature.availability === "unspecified" ? "supported" : feature.availability })
      : feature.actions.length > 0 && feature.actions.every(action => action === "close" ? Boolean(spec.window.closeLabel) : action === "minimize" ? Boolean(spec.window.minimizeLabel) : false);
    const active = bound.filter(isControl).filter(item => "action" in item && (item.action !== "custom" || Boolean(item.code.trim())));
    const disabled = bound.filter(item => item.kind === "disabled");
    const status = shell || active.length ? "control-present" : disabled.length ? "disabled" : "missing";
    features.push({ id: feature.id, status, itemIds: bound.map(item => item.id) });
    check(`feature.${feature.id}`, "distinct real control", status, status === "control-present" || (status === "disabled" && feature.availability === "needs-runtime"), `Requested feature ${feature.label} has ${status === "disabled" ? "only a disabled control" : "no distinct functional control"}; preserve the requirement and provide a real implementation or report its exact missing runtime evidence.`);
    if (active.length && feature.actions.length) {
      for (const action of feature.actions) {
        if (action === "close" && spec.window.closeLabel || action === "minimize" && spec.window.minimizeLabel) continue;
        check(`feature.${feature.id}.action.${action}`, action, active.map(item => "action" in item ? item.action : null), active.some(item => "action" in item && (item.action === action || item.action === "custom")), `Requested feature ${feature.label} is bound to an unrelated action instead of ${action}.`);
      }
    }
  }
  return { issues: unique(issues), checks, features, verification: "composition-structure-only", limitations: [...inventory.limitations] };
}

export { GENERATION_QUALITY_GUIDE } from "./generation-quality-guide.ts";

export function formatGenerationQualityInventory(inventory: GenerationQualityInventory): string {
  return `EXPLICIT REQUEST INVENTORY (user values override model defaults; structural checks are not live-game verification):\n${JSON.stringify(inventory)}`;
}
