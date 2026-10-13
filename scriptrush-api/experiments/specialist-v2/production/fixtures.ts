/** New production-composer acceptance fixtures. Never imported by the training dataset. */
import type { GenerationContext } from "../../../src/lib/generation.ts";
import type { GenerationContract } from "../../../src/lib/generation-contract.ts";
import type { HubComposition, HubItem } from "../../../src/lib/hub-spec.ts";
import { gameAdapterFor } from "../../../src/lib/game-adapters/catalog.ts";

export type ProductionMessage = { role: "system" | "user"; content: string };
export type ProductionFixture = {
  id: string; benchmark: "production-composer-v1"; locale: "fr" | "en"; uiFamily: string;
  game: Record<string, unknown>; request: string; context: GenerationContext;
  expected: { contract: GenerationContract; composition: HubComposition };
};
export type ProductionCase = ProductionFixture & {
  messages: ProductionMessage[];
  provenance: {
    capture: "generateCompleteScript + createProviderRunner(inert fetch)";
    promptSha256: string; sourceSha256: Record<string, string>;
    planner: "reference contract supplied locally; planner not evaluated";
    networkCalls: 0; trainingUse: "excluded";
  };
};

type Palette = HubComposition["window"]["palette"];
type Design = {
  id: string; locale: "fr" | "en"; title: string; placeId: string;
  width: number; height: number; radius: number; navigation: "left" | "top";
  font: HubComposition["window"]["font"]; textSize: number; palette: Palette; alternate: Palette;
  groups: Array<[string, string[]]>; speed: [number, number, number]; jump: [number, number, number];
};
const palette = (background: number[], foreground: number[], accent: number[], control: number[], muted: number[]): Palette =>
  ({ background, foreground, accent, control, muted } as Palette);
const ink = palette([15, 23, 42], [241, 245, 249], [56, 189, 248], [30, 41, 59], [148, 163, 184]);
const paper = palette([250, 247, 240], [32, 35, 42], [150, 90, 42], [235, 226, 211], [108, 101, 92]);
const orchid = palette([30, 19, 48], [250, 241, 255], [216, 140, 255], [53, 34, 76], [188, 165, 201]);
const mint = palette([12, 34, 30], [230, 255, 246], [91, 225, 174], [23, 56, 47], [139, 187, 168]);
const rust = palette([47, 26, 22], [255, 242, 229], [255, 145, 90], [72, 42, 35], [202, 165, 143]);
const frost = palette([229, 241, 250], [23, 43, 65], [43, 108, 179], [209, 227, 241], [87, 115, 142]);
const navy = palette([9, 18, 36], [233, 240, 255], [142, 170, 255], [23, 37, 65], [147, 163, 195]);
const coal = palette([28, 28, 29], [249, 249, 246], [225, 212, 100], [47, 47, 43], [178, 178, 164]);
const split: Design["groups"] = [["Home", []], ["Farm", ["auto-farm"]], ["Boss", ["auto-boss"]], ["Quests", ["quest-farm"]], ["Loot", ["auto-loot"]], ["Movement", ["walk-speed", "jump-power"]], ["Session", ["rejoin"]], ["Settings", ["theme"]]];
const grouped: Design["groups"] = [["Operations", ["auto-farm", "auto-boss", "quest-farm", "auto-loot"]], ["Movement", ["walk-speed", "jump-power"]], ["Session", ["rejoin"]], ["Settings", ["theme"]]];
const combat: Design["groups"] = [["Home", []], ["Combat", ["auto-farm", "auto-boss"]], ["Quests", ["quest-farm"]], ["Loot", ["auto-loot"]], ["Movement", ["walk-speed", "jump-power"]], ["Session", ["rejoin"]], ["Settings", ["theme"]]];

const designs: Design[] = [
  { id: "anonymous-cyan-sidebar", locale: "fr", title: "", placeId: "2753915549", width: 724, height: 508, radius: 18, navigation: "left", font: "GothamMedium", textSize: 15, palette: ink, alternate: paper, groups: split, speed: [10, 46, 20], jump: [24, 92, 48] },
  { id: "lotus-top", locale: "en", title: "Lotus Console", placeId: "4442272183", width: 858, height: 476, radius: 8, navigation: "top", font: "Roboto", textSize: 14, palette: orchid, alternate: frost, groups: grouped, speed: [8, 42, 18], jump: [26, 98, 52] },
  { id: "unicode-custom-sidebar", locale: "fr", title: "L'Éclat — Mer II", placeId: "7449423635", width: 776, height: 542, radius: 22, navigation: "left", font: "Ubuntu", textSize: 16, palette: mint, alternate: paper, groups: combat, speed: [12, 48, 22], jump: [30, 104, 58] },
  { id: "anonymous-paper-top", locale: "en", title: "", placeId: "2753915549", width: 932, height: 526, radius: 0, navigation: "top", font: "Arial", textSize: 13, palette: paper, alternate: rust, groups: split, speed: [9, 39, 17], jump: [22, 86, 46] },
  { id: "quoted-custom-top", locale: "fr", title: "Harbor \"Prime\"", placeId: "4442272183", width: 824, height: 492, radius: 14, navigation: "top", font: "Code", textSize: 14, palette: rust, alternate: frost, groups: combat, speed: [11, 51, 23], jump: [28, 108, 56] },
  { id: "anonymous-frost-sidebar", locale: "en", title: "", placeId: "7449423635", width: 698, height: 554, radius: 10, navigation: "left", font: "SourceSansBold", textSize: 17, palette: frost, alternate: navy, groups: grouped, speed: [8, 36, 16], jump: [20, 80, 44] },
  { id: "tide-sidebar", locale: "en", title: "Tide / 03", placeId: "2753915549", width: 748, height: 518, radius: 26, navigation: "left", font: "GothamBold", textSize: 15, palette: navy, alternate: mint, groups: combat, speed: [10, 44, 24], jump: [25, 95, 55] },
  { id: "anonymous-gold-top", locale: "fr", title: "", placeId: "7449423635", width: 904, height: 566, radius: 6, navigation: "top", font: "ArialBold", textSize: 12, palette: coal, alternate: orchid, groups: split, speed: [13, 49, 21], jump: [32, 112, 60] },
];

const frenchPages: Record<string, string> = { Home: "Accueil", Operations: "Opérations", Farm: "Farm", Boss: "Boss", Combat: "Combat", Quests: "Quêtes", Loot: "Butin", Movement: "Mouvement", Session: "Session", Settings: "Réglages" };
const paletteDescription = (value: Palette) => Object.entries(value).map(([key, rgb]) => `${key}=RGB(${rgb.join(",")})`).join("; ");
const scopeText = "Source-backed actions; live compatibility is not certified.";

/** All answers are newly authored compositions of the admitted server library and standard actions. */
export function buildProductionFixtures(): ProductionFixture[] {
  return designs.map(design => {
    const game = { name: "Blox Fruits", placeId: design.placeId, universeId: "994732206", confidence: "exact-place-binding", sourceCounts: { admittedLibrary: 1 } };
    const pack = gameAdapterFor(game);
    if (!pack) throw new Error("Production benchmark requires the admitted Blox Fruits action library");
    const gameItems: HubItem[] = pack.actions.map(action => ({ id: action.id, featureIds: [action.id], kind: "toggle", label: action.label, description: action.description, onLabel: "On", offLabel: "Off", initial: false, action: "custom", code: `ctx.gameplay.setEnabled("${action.key}", ctx.enabled)` }));
    const number = (id: "walk-speed" | "jump-power", label: string, range: [number, number, number]): HubItem => ({ id, featureIds: [id], kind: "number", label, description: `Apply the selected value to the current character. Range: ${range[0]} to ${range[1]}.`, applyLabel: "Apply", min: range[0], max: range[1], initial: range[2], action: id, code: "" });
    const items: HubItem[] = [...gameItems, number("walk-speed", "Walk Speed", design.speed), number("jump-power", "Jump Power", design.jump),
      { id: "rejoin", featureIds: ["rejoin"], kind: "button", label: "Rejoin", description: "Reconnect to this place when clicked.", action: "rejoin", code: "" },
      { id: "theme", featureIds: ["theme"], kind: "toggle", label: "Theme", description: "Switch the applied primary and alternate palettes.", onLabel: "Alternate", offLabel: "Primary", initial: false, action: "theme", code: "" }];
    const composition: HubComposition = {
      window: { title: design.title, width: design.width, height: design.height, radius: design.radius, draggable: true, navigation: design.navigation, font: design.font, textSize: design.textSize, closeLabel: "Close", minimizeLabel: "Minimize", restoreLabel: "Restore", palette: structuredClone(design.palette), alternatePalette: structuredClone(design.alternate), featureIds: ["ui-lifecycle"] },
      pages: design.groups.map(([label, ids], index) => ({ id: `section-${label.toLowerCase()}`, label, featureIds: [], items: [...(index === 0 ? [{ id: "library-scope", kind: "text" as const, featureIds: [], text: scopeText }] : []), ...ids.map(id => structuredClone(items.find(item => item.id === id)!))] })),
    };
    const controls = design.groups.map(([page, ids]) => `${design.locale === "fr" ? frenchPages[page] : page}: ${ids.map(id => {
      const item = items.find(candidate => candidate.id === id)!;
      return item.kind === "number" ? `${item.label} (${item.min}..${item.max}, initial ${item.initial}, Apply)` : item.kind === "toggle" ? `${item.label} (initial Off; ${item.onLabel}/${item.offLabel})` : item.kind === "button" ? item.label : "";
    }).join(", ") || "overview"}`).join(" | ");
    const identity = design.title ? `exact custom title ${JSON.stringify(design.title)}` : "an empty title, no hub name, no creator credits and no branding";
    const shared = `UI: ${design.width}x${design.height}px; radius ${design.radius}px; draggable; navigation ${design.navigation}; font ${design.font}; text size ${design.textSize}. Primary palette: ${paletteDescription(design.palette)}. Alternate palette: ${paletteDescription(design.alternate)}. Page order and controls: ${controls}. Use Close, Minimize and Restore controls. On the first page display exactly ${JSON.stringify(scopeText)}. English functional UI; preserve any custom title verbatim. All controls must function, and closing must stop activity and clean up listeners.`;
    const behavior = "Auto Farm must approach and attack living non-boss enemies with health-progress confirmation. Auto Boss must target actual spawned bosses. Quest Farm must use admitted live quest data or the source-backed first-sea fallback, confirm a matching live giver and quest acceptance, and farm the quest target. Auto Loot must approach actual chests and spawned fruit, confirm collection and cancel on stop. Use the supplied audited server action library, never guessed remotes or placeholders. Preserve independent start/stop controls, recovery after respawn and cleanup. Movement controls must use the current character; Rejoin must reconnect only on click; Theme must actually apply both palettes.";
    const request = design.locale === "fr"
      ? `Crée un Full Hub complet pour Blox Fruits avec ${identity}. Je veux les quatre vraies fonctions Auto Farm, Auto Boss, Quest Farm et Auto Loot, ainsi que Walk Speed, Jump Power, Rejoin et Theme. Respecte exactement les onglets, couleurs et dimensions indiqués. ${shared}\n${behavior}`
      : `Create a complete Full Hub for Blox Fruits with ${identity}. Include all four real Auto Farm, Auto Boss, Quest Farm and Auto Loot functions plus Walk Speed, Jump Power, Rejoin and Theme. Follow every requested tab, color and dimension exactly. ${shared}\n${behavior}`;
    const feature = (id: string, label: string, behavior: string, evidence = "Audited standard renderer action; no game remote needed."): GenerationContract["features"][number] => ({ id, label, behavior, availability: "supported", evidence, interaction: true });
    const contract: GenerationContract = { fullHub: true, features: [
      feature("ui-lifecycle", "Hub Interface", "Create the exact requested window and ordered pages; implement dragging, minimize/restore, close and owned cleanup."),
      ...pack.actions.map(action => feature(action.id, action.label, action.behavior, `Admitted ${pack.id} ${pack.version}; sources ${action.sourceIds.join(", ")}; source-backed only, not live certified.`)),
      feature("walk-speed", "Walk Speed", `On Apply validate ${design.speed[0]} to ${design.speed[1]} and set the current local Humanoid.WalkSpeed.`),
      feature("jump-power", "Jump Power", `On Apply validate ${design.jump[0]} to ${design.jump[1]}, enable UseJumpPower and set the current local Humanoid.JumpPower.`),
      feature("rejoin", "Rejoin", "Rejoin the current place only when its button is clicked."),
      feature("theme", "Theme", "Switch the actual panel and control colors between the exact requested primary and alternate palettes."),
    ], ui: { instructions: `${shared} Title requirement: ${identity}.`, requiredText: [...(design.title ? [design.title] : []), ...design.groups.map(([label]) => label), "Close", "Minimize", "Restore", scopeText, ...items.map(item => "label" in item ? item.label : "")] } };
    const context: GenerationContext = { prompt: request, currentScript: "", patch: false, game, supportedFeatures: contract.features.map(feature => feature.id),
      ledger: "Public code evidence is source-backed and does not establish current live compatibility. Exact PlaceId and universeId match the admitted four-action Blox Fruits library. Standard renderer utilities are independently usable.",
      researchContext: "Use only the server action library inserted below and standard client renderer actions. No additional gameplay capability is asserted.", sources: "", diagnostic: "" };
    return { id: `production-${design.id}`, benchmark: "production-composer-v1", locale: design.locale, uiFamily: design.id, game, request, context, expected: { contract, composition } };
  });
}
