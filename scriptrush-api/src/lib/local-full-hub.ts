import type { GenerationContext } from "./generation.ts";
import type { Coverage, GenerationContract } from "./generation-contract.ts";
import { parseHubComposition, validateCompositionCoverage, type HubComposition } from "./hub-spec.ts";
import { renderHubComposition } from "./hub-composer.ts";
import { reviewScript } from "./script-output.ts";
import { englishUiIssues } from "./ui-language.ts";
import { A7DEV_GUIDE_SOURCE } from "./a7dev-generation-guide.ts";

// This is the shipped preset, not a fuzzy intent matcher. Any additional user
// requirements, edited preset, diagnostic or script correction stays on the AI
// path, so a local default never replaces a custom requested design.
export const LOCAL_FULL_HUB_PRESET = `[ScriptRush preset: Full Hub]
Create one complete, self-contained Luau Full Hub with a tabbed interface and separate controls for Auto Farm, Auto Boss, Quest Farm, Auto Loot, and Settings. Implement each requested feature completely when reliable game evidence or the supplied runtime profile supports its actual behavior. Do not reduce the hub to a single feature. Every implemented feature must have working controls and its real behavior, with start/stop, respawn recovery and cleanup where relevant; labels, empty callbacks and print statements are not implementations. Keep unavailable features visible but disabled with 'Needs game profile' and a precise reason. Never invent remotes or payloads, or silently claim unsupported features are complete. Preserve the user's specified UI colors, layout, size and other visual properties; use neutral defaults only where unspecified. Preserve custom hub titles, game names and other proper names exactly. Generate functional UI in English: navigation, section headings, control labels, help text, status messages and error messages must use English, even if the request is in French. French prose does not imply French UI. Existing user requirements take priority over preset defaults for feature scope and visual design. Return one complete Lua block.`;

export function isLocalFullHubPrompt(prompt: string): boolean {
  return prompt.replace(/\r\n/g, "\n").trim() === LOCAL_FULL_HUB_PRESET;
}

/** Observed counts/paths are not an executable adapter. Actual code, argument
 * schemas or recorded flows instead go through contextual AI analysis. A JSON
 * claim of support is never executed or used to enable a game action here. */
function observationOnlySources(sources: string): boolean {
  if (!sources.trim()) return true;
  const blocks = sources.split(/^--- [^\n]+ ---\r?\n/m).filter(block => block.trim());
  if (!blocks.length) return false;
  // Admit the shipped read-only scanner schema and its legacy count summaries.
  // Arbitrary JSON attachments may contain relevant code or requirements; their
  // unfamiliar fields must stay on the contextual path instead of being ignored.
  const observationFields = new Set(["version", "type", "game", "capabilities", "scan", "features", "generatedAt", "guided", "counts", "featureSignals", "npcs", "bosses", "remotes", "prompts", "tools", "gui"]);
  const hasAdapterData = (value: unknown, depth = 0): boolean => {
    if (depth > 16) return true;
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(item => hasAdapterData(item, depth + 1));
    return Object.entries(value).some(([key, item]) => {
      const populated = item != null && item !== "" && (!Array.isArray(item) || item.length > 0) && (typeof item !== "object" || Object.keys(item).length > 0);
      if (populated && /^(?:code|source|sourceCode|script|scripts|snippet|snippets|scriptSource|lua|luau|body|implementation|callback|callSite|payload|args|arguments|adapter|adapters|confirmedRemotes|confirmedPrompts|interactionFlow|records|recordings|guided)$/i.test(key)) return true;
      return hasAdapterData(item, depth + 1);
    });
  };
  return blocks.every(block => {
    try {
      const value: unknown = JSON.parse(block);
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const observed = value as Record<string, unknown>;
      return Boolean(observed.game && typeof observed.game === "object" && !Array.isArray(observed.game)
        && Object.keys(observed).every(key => observationFields.has(key)) && !hasAdapterData(observed));
    } catch { return false; }
  });
}

const unavailable = [
  { id: "auto-farm", label: "Auto Farm", reason: "Needs game profile: confirm this game's target container, movement route, interaction arguments and success state." },
  { id: "auto-boss", label: "Auto Boss", reason: "Needs game profile: confirm boss discovery, arena entry, attack flow, phases and success signals." },
  { id: "quest-farm", label: "Quest Farm", reason: "Needs game profile: confirm quest acceptance, objectives, progress updates and reward claiming." },
  { id: "auto-loot", label: "Auto Loot", reason: "Needs game profile: confirm drop ownership, pickup interaction, capacity limits and inventory confirmation." },
] as const;

export type LocalFullHub = { script: string; contract: GenerationContract; coverage: Coverage; profile: Record<string, unknown>; spec: HubComposition };

export function buildLocalFullHub(context: GenerationContext): LocalFullHub | null {
  if (context.patch || context.diagnostic.trim() || !isLocalFullHubPrompt(context.prompt) || !observationOnlySources(context.sources)) return null;
  const gameName = typeof context.game.name === "string" && context.game.name.trim() ? context.game.name.trim().slice(0, 240) : "Roblox Game";
  const identityText = (name: string) => `A7DEV\nCreated by a7med_o6t\nGame: ${name}\nCore version: 1.1`;
  const feature = (id: string, label: string, behavior: string): GenerationContract["features"][number] => ({ id, label, behavior, availability: "supported", evidence: "Audited standard Roblox client/UI implementation; no game-specific adapter required.", interaction: true });
  const contract: GenerationContract = {
    fullHub: true,
    features: [
      ...unavailable.map(item => ({ id: item.id, label: item.label, behavior: `Keep ${item.label} visible but disabled until its game adapter is confirmed.`, availability: "needs-runtime" as const, evidence: item.reason, interaction: true })),
      feature("walk-speed", "Walk Speed", "Validate 8 to 32 and apply WalkSpeed to the current local Humanoid."),
      feature("jump-power", "Jump Power", "Validate 20 to 75, enable UseJumpPower and apply JumpPower to the current local Humanoid."),
      feature("rejoin", "Rejoin", "Rejoin the current place only when its button is clicked."),
      feature("theme", "Theme", "Switch the actual panel and control colors between Purple and Cyan palettes."),
      feature("ui-lifecycle", "Hub Interface", "Rounded draggable tabbed UI, minimize and restore, close the complete ScreenGui and disconnect owned connections."),
    ],
    ui: { instructions: "A7DEV default charcoal/purple 680x460 rounded panel, English sidebar navigation and visible game/profile status. Every unavailable feature has its own explanation.", requiredText: ["A7DEV", "Home", "Farm", "Boss", "Quests", "Loot", "Movement", "Session", "Settings", "Close", "Minimize", "Restore"] },
  };
  const disabledPage = (index: number, id: string, label: string) => ({ id, label, featureIds: [], items: [{ ...unavailable[index], kind: "disabled" as const, featureIds: [unavailable[index].id] }] });
  const spec = parseHubComposition(JSON.stringify({
    window: {
      title: "A7DEV", width: 680, height: 460, radius: 12, draggable: true, navigation: "left", font: "Gotham", textSize: 14,
      closeLabel: "Close", minimizeLabel: "Minimize", restoreLabel: "Restore", featureIds: ["ui-lifecycle"],
      palette: { background: [22, 22, 28], foreground: [240, 238, 248], accent: [170, 140, 215], control: [34, 34, 44], muted: [165, 160, 180] },
      alternatePalette: { background: [18, 24, 42], foreground: [240, 245, 255], accent: [85, 221, 255], control: [30, 43, 68], muted: [175, 191, 213] },
    },
    pages: [
      { id: "home", label: "Home", featureIds: [], items: [
        { id: "identity", kind: "text", featureIds: [], text: identityText(gameName) },
        { id: "profile-status", kind: "text", featureIds: [], text: "Local controls are ready. Game automation is disabled until its adapter is verified. A list of NPCs or remotes alone does not prove the correct interaction." },
      ] },
      disabledPage(0, "farm", "Farm"), disabledPage(1, "boss", "Boss"), disabledPage(2, "quests", "Quests"), disabledPage(3, "loot", "Loot"),
      { id: "movement", label: "Movement", featureIds: [], items: [
        { id: "walk-speed", kind: "number", featureIds: ["walk-speed"], label: "Walk Speed", description: "Apply to the current character. Valid range: 8 to 32.", applyLabel: "Apply", min: 8, max: 32, initial: 16, action: "walk-speed", code: "" },
        { id: "jump-power", kind: "number", featureIds: ["jump-power"], label: "Jump Power", description: "Enable jump power on the current character. Valid range: 20 to 75.", applyLabel: "Apply", min: 20, max: 75, initial: 50, action: "jump-power", code: "" },
      ] },
      { id: "session", label: "Session", featureIds: [], items: [{ id: "rejoin", kind: "button", featureIds: ["rejoin"], label: "Rejoin", description: "Reconnect to this place when clicked.", action: "rejoin", code: "" }] },
      { id: "settings", label: "Settings", featureIds: [], items: [{ id: "theme", kind: "toggle", featureIds: ["theme"], label: "Theme", description: "Switch between Purple and Cyan.", onLabel: "Cyan", offLabel: "Purple", initial: false, action: "theme", code: "" }] },
    ],
  }));
  const script = "-- A7DEV Core V1.1\n-- Created by a7med_o6t\n-- Built by ScriptRush; game adapters require confirmed evidence.\n\n" + renderHubComposition(spec);
  // Only this known proper-name slot is exempt from functional language checks.
  // The displayed game name remains exact, including French words and Unicode.
  const languageSpec = { ...spec, pages: spec.pages.map(page => ({ ...page, items: page.items.map(item => item.id === "identity" && item.kind === "text" ? { ...item, text: identityText("Roblox Game") } : item) })) };
  const issues = [...validateCompositionCoverage(spec, contract), ...englishUiIssues(languageSpec), ...reviewScript(script, "", false)];
  if (issues.length) throw new Error("LOCAL_HUB_VALIDATION_FAILED: " + issues.join("; "));
  const coverage: Coverage = { uiVerified: true, features: contract.features.map(item => ({ id: item.id, label: item.label, status: item.availability === "needs-runtime" ? "unavailable" : "implemented", ...(item.availability === "needs-runtime" ? { reason: item.evidence } : {}) })) };
  return { script, spec, contract, coverage, profile: { game: { name: gameName, placeId: context.game.placeId ?? null, universeId: context.game.universeId ?? null }, method: A7DEV_GUIDE_SOURCE, gameAdapters: "unverified", unknowns: unavailable.map(item => ({ feature: item.id, reason: item.reason })) } };
}
