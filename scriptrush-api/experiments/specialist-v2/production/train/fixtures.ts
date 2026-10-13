/** Independent production-input teaching set, authored without importing the production test designs. */
import type { GenerationContract } from "../../../../src/lib/generation-contract.ts";
import type { HubComposition, HubItem } from "../../../../src/lib/hub-spec.ts";
import { gameAdapterFor } from "../../../../src/lib/game-adapters/catalog.ts";
import type { ProductionFixture } from "../fixtures.ts";

export type Split = "train" | "validation" | "dev";
export type TeachingFixture = ProductionFixture & { split: Split; designFamily: string; actionFamily: string };
type Layout = Array<[string, string[]]>;
const movement = ["walk-speed", "jump-power"], session = ["rejoin"], theme = ["theme"];
const layouts: Record<Split, Layout[]> = {
  train: [
    [["Hunting", ["auto-farm", "auto-boss"]], ["Objectives", ["quest-farm"]], ["Gathering", ["auto-loot"]], ["Travel", [...movement, ...session]], ["Preferences", theme]],
    [["Farm Tasks", ["auto-farm", "quest-farm"]], ["Boss Runs", ["auto-boss"]], ["Resources", ["auto-loot"]], ["Character", movement], ["Options", [...session, ...theme]]],
    [["Actions", ["auto-farm", "auto-boss", "quest-farm", "auto-loot"]], ["Controls", [...movement, ...session, ...theme]]],
    [["Hunting", ["auto-farm", "auto-boss"]], ["Progress", ["quest-farm", "auto-loot"]], ["Character", movement], ["Connection", session], ["Preferences", theme]],
    [["Routes", ["auto-farm"]], ["Encounters", ["auto-boss"]], ["Objectives", ["quest-farm"]], ["Collections", ["auto-loot"]], ["Character", movement], ["Application", [...session, ...theme]]],
    [["Mission", ["quest-farm", "auto-farm"]], ["Rewards", ["auto-loot", "auto-boss"]], ["Movement Tools", movement], ["Application", [...session, ...theme]]],
  ],
  validation: [
    [["Harvest", ["auto-farm", "auto-loot"]], ["Battles", ["auto-boss"]], ["Tasks", ["quest-farm"]], ["Personal", movement], ["Connection", session], ["Colors", theme]],
    [["Earn", ["auto-farm", "quest-farm", "auto-loot"]], ["Elite", ["auto-boss"]], ["Options", [...movement, ...session, ...theme]]],
    [["Farm", ["auto-farm"]], ["Bosses", ["auto-boss"]], ["Quests", ["quest-farm"]], ["Resources", ["auto-loot"]], ["Locomotion", movement], ["Preferences", [...session, ...theme]]],
    [["Play", ["auto-farm", "auto-boss", "quest-farm", "auto-loot", ...movement]], ["Misc", [...session, ...theme]]],
  ],
  dev: [
    [["Progression", ["auto-farm", "quest-farm", "auto-boss"]], ["Pickup", ["auto-loot"]], ["Movement", movement], ["Connection", session], ["Style", theme]],
    [["PVE", ["auto-farm", "auto-boss"]], ["Adventure", ["quest-farm", "auto-loot"]], ["Tools", movement], ["Config", [...session, ...theme]]],
    [["Task", ["auto-farm", "quest-farm"]], ["Loot", ["auto-loot"]], ["Targets", ["auto-boss"]], ["Preferences", [...movement, ...session, ...theme]]],
    [["Fieldwork", ["auto-farm", "auto-loot"]], ["Questing", ["quest-farm"]], ["Bosses", ["auto-boss"]], ["Player", movement], ["Options", [...session, ...theme]]],
  ],
};
export const COUNTS: Record<Split, number> = { train: 48, validation: 8, dev: 4 };
const splitSalt: Record<Split, number> = { train: 0, validation: 73, dev: 149 };
const prefix: Record<Split, string> = { train: "Cedar", validation: "Maple", dev: "Birch" };
const fonts: HubComposition["window"]["font"][] = ["SourceSans", "Gotham", "Arial", "Ubuntu", "Roboto", "Code"];
const hex = (rgb: number[]) => `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`;
const paletteText = (value: HubComposition["window"]["palette"]) => Object.entries(value).map(([key, rgb]) => `${key} ${hex(rgb)}`).join(", ");

export function buildTeachingFixtures(): Record<Split, TeachingFixture[]> {
  const rows: Record<Split, TeachingFixture[]> = { train: [], validation: [], dev: [] };
  for (const split of Object.keys(COUNTS) as Split[]) for (let index = 0; index < COUNTS[split]; index++) {
    const salt = splitSalt[split] + index, family = index % layouts[split].length;
    // Whole grouping families are disjoint across train/validation/development.
    const original = layouts[split][family];
    const offset = Math.floor(index / layouts[split].length) % original.length;
    const groups = [...original.slice(offset), ...original.slice(0, offset)];
    const game = { name: "Blox Fruits", placeId: ["2753915549", "4442272183", "7449423635"][salt % 3], universeId: "994732206", confidence: "exact-place-binding" };
    const pack = gameAdapterFor(game)!;
    const locale = index % 2 ? "en" as const : "fr" as const;
    const title = index % 4 === 0 || index % 4 === 3 ? "" : index % 4 === 1 ? `${prefix[split]} Relay ${index + 1}` : `${prefix[split]} «Élan ${index + 1}»`;
    const width = 610 + salt % 8 * 36 + (split === "validation" ? 4 : split === "dev" ? 8 : 0), height = 354 + salt % 6 * 28 + (split === "validation" ? 5 : split === "dev" ? 11 : 0);
    const radius = 2 + salt % 12 * 2, navigation = Math.floor(index / 2) % 2 ? "top" as const : "left" as const, font = fonts[salt % fonts.length], textSize = 12 + salt % 4;
    const palette: HubComposition["window"]["palette"] = { background: [19 + salt % 8, 29 + salt % 9, 38 + salt % 7], foreground: [247, 242 + salt % 8, 233 + salt % 12], accent: [104 + salt % 61, 178 + salt % 49, 90 + salt % 67], control: [38 + salt % 11, 48 + salt % 13, 59 + salt % 9], muted: [156 + salt % 17, 172 + salt % 13, 174 + salt % 19] };
    const alternate: HubComposition["window"]["palette"] = { background: [239 + salt % 9, 235 + salt % 13, 228 + salt % 17], foreground: [32 + salt % 11, 40 + salt % 7, 45 + salt % 9], accent: [85 + salt % 37, 109 + salt % 29, 164 + salt % 53], control: [214 + salt % 19, 220 + salt % 17, 223 + salt % 13], muted: [105 + salt % 23, 117 + salt % 19, 128 + salt % 17] };
    const speed = { min: 7 + salt % 4, max: 37 + salt % 7 * 2, initial: 17 + salt % 8 }, jump = { min: 21 + salt % 6, max: 83 + salt % 8 * 3, initial: 43 + salt % 15 };
    const number = (id: "walk-speed" | "jump-power", label: string, bounds: typeof speed): HubItem => ({ id, featureIds: [id], kind: "number", label, description: "Apply to the current character.", applyLabel: "Apply", ...bounds, action: id, code: "" });
    const items: HubItem[] = [...pack.actions.map(action => ({ id: action.id, featureIds: [action.id], kind: "toggle" as const, label: action.label, description: "Uses the admitted source-backed controller.", onLabel: "On", offLabel: "Off", initial: false, action: "custom" as const, code: `ctx.gameplay.setEnabled("${action.key}", ctx.enabled)` })), number("walk-speed", "Walk Speed", speed), number("jump-power", "Jump Power", jump),
      { id: "rejoin", kind: "button", featureIds: ["rejoin"], label: "Rejoin", description: "Reconnect when clicked.", action: "rejoin", code: "" },
      { id: "theme", kind: "toggle", featureIds: ["theme"], label: "Theme", description: "Apply the alternate colors.", onLabel: "Alternate", offLabel: "Primary", initial: false, action: "theme", code: "" }];
    const scope = "Catalog actions require live runtime confirmation.";
    const composition: HubComposition = { window: { title, width, height, radius, draggable: true, navigation, font, textSize, closeLabel: "Close", minimizeLabel: "Minimize", restoreLabel: "Restore", palette, alternatePalette: alternate, featureIds: ["ui-lifecycle"] }, pages: groups.map(([label, ids], at) => ({ id: `tab-${at + 1}`, label, featureIds: [], items: [...(at === 0 ? [{ id: "admission-status", kind: "text" as const, featureIds: [], text: scope }] : []), ...ids.map(id => structuredClone(items.find(item => item.id === id)!))] })) };
    const mapping = groups.map(([label, ids]) => `${JSON.stringify(label)}: ${ids.map(id => items.find(item => item.id === id)!).map(item => "label" in item ? item.label : "").join(" + ")}`).join("; ");
    const identity = title ? `preserve exactly ${JSON.stringify(title)} as my custom title` : "leave the title empty; no invented hub name, brand or author credit";
    const ui = `Use ${width} by ${height} pixels, ${radius}px corner radius, ${navigation} navigation, ${font} font at ${textSize}px. Draggable window, Close, Minimize and Restore. Palette: ${paletteText(palette)}. Alternate palette: ${paletteText(alternate)}. Ordered tabs and controls: ${mapping}. Put ${JSON.stringify(scope)} on the first tab. Walk Speed range ${speed.min}..${speed.max}, initial ${speed.initial}; Jump Power range ${jump.min}..${jump.max}, initial ${jump.initial}; both use Apply. Four game toggles start Off with On/Off states. Theme starts Primary with Alternate/Primary states. All functional UI stays English; ${identity}.`;
    const behavior = "Implement all four admitted game actions independently, including real farm targeting and damage-progress checks, spawned-boss targeting, quest selection/acceptance confirmation and verified chest/fruit collection. Use the provided exact game library, with no guessed remotes, empty callbacks, disabled substitutes or external loaders. Stop cancels each operation, character respawn recovers safely, and Close stops everything and disconnects owned connections. Movement applies to the current Humanoid. Rejoin acts only on click. Theme changes actual UI colors.";
    const request = locale === "fr" ? `Je veux un Full Hub complet Blox Fruits, avec tous les contrôles indiqués et ce design personnalisé. ${ui}\n${behavior}` : `Build a complete Full Hub for Blox Fruits with every listed control and this specific design. ${ui}\n${behavior}`;
    const feature = (id: string, label: string, behavior: string, evidence = "Standard audited client renderer action."): GenerationContract["features"][number] => ({ id, label, behavior, availability: "supported", evidence, interaction: true });
    const short: Record<string, string> = { "auto-farm": "Start/stop living non-boss farming using the admitted controller; confirm damage progress and recover after respawn.", "auto-boss": "Start/stop actual spawned-boss farming using its observed attributes and normal attack controller.", "quest-farm": "Select an admitted level-appropriate quest, confirm a live giver and acceptance, then farm its target; stop safely when unsupported.", "auto-loot": "Approach actual active chests and spawned fruit; confirm collection and stop on cancellation or repeated failure." };
    const contract: GenerationContract = { fullHub: true, features: [feature("ui-lifecycle", "Hub Interface", "Use the exact requested UI and ordered pages with dragging, minimize/restore, close and complete cleanup."), ...pack.actions.map(action => feature(action.id, action.label, short[action.id], `Admitted ${pack.id} ${pack.version}; source-backed, not live certified.`)), feature("walk-speed", "Walk Speed", `On Apply validate ${speed.min}..${speed.max} and set current Humanoid.WalkSpeed.`), feature("jump-power", "Jump Power", `On Apply validate ${jump.min}..${jump.max}, enable UseJumpPower and set current Humanoid.JumpPower.`), feature("rejoin", "Rejoin", "Rejoin the current place on click only."), feature("theme", "Theme", "Apply the requested primary/alternate palettes when toggled.")], ui: { instructions: ui, requiredText: [...(title ? [title] : []), ...groups.map(([label]) => label), "Close", "Minimize", "Restore", scope, ...items.map(item => "label" in item ? item.label : "")] } };
    rows[split].push({ id: `production-teach-${split}-${String(index + 1).padStart(3, "0")}`, benchmark: "production-composer-v1", split, locale, uiFamily: `production-teach-${split}-layout-${family + 1}`, designFamily: `production-teach-${split}-layout-${family + 1}`, actionFamily: `production-teach-${split}-grouping-${family + 1}`, game, request, context: { prompt: request, currentScript: "", patch: false, game, supportedFeatures: contract.features.map(feature => feature.id), ledger: "Exact PlaceId/universe match the admitted source-backed action catalog. Public source observations do not certify live server behavior.", researchContext: "Use the supplied server action library and standard client renderer only.", sources: "", diagnostic: "" }, expected: { composition, contract } });
  }
  return rows;
}
