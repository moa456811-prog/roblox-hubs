import { BLOX_FRUITS_RUNTIME_FACTORY } from "./blox-fruits-runtime.ts";
import type { HubComposition } from "../hub-spec.ts";
import type { GenerationContract } from "../generation-contract.ts";
import { gameplayToggleKey, referencesGameplay } from "../game-actions.ts";

export type ResearchKnowledgeView = {
  summary: string;
  sources: Array<{ id: string; title: string; url: string; kind: string }>;
  features: Array<{ id: string; label: string; basis: "source-backed" | "runtime-verified" | "unknown"; summary: string; sourceIds: string[]; missing?: string[] }>;
  researchedAt?: string;
};
export type GameAction = { id: string; key: string; label: string; behavior: string; description: string; sourceIds: string[] };
export type GameAdapterPack = { id: string; name: string; version: string; placeIds: readonly string[]; universeId: string; factory: string; actions: readonly GameAction[]; knowledge: ResearchKnowledgeView };

// These are factual paths/schema observations, not copied third-party functions.
// The runtime is an original implementation. Source-backed never means live-tested.
const source = {
  module: { id: "bf-structure-2026", kind: "github", title: "Blox Fruits: enemy, boss and chest structure (2026 source)", url: "https://github.com/tlredz/Scripts/blob/0dd52884428af35419477d391442051f7057414f/Utils/BloxFruits/Module.luau" },
  quest: { id: "bf-quest-flow-2026", kind: "github", title: "Blox Fruits: quest command and quest UI (2026 source)", url: "https://gist.github.com/nguyennhlat2004/534da6d9966efbb437dd1c6aa3c7e61b/011de5b645c5d19aaba328927c0294c97701c6e1" },
  schema: { id: "bf-quest-schema", kind: "github", title: "Blox Fruits: dynamic quest module schema (historical, runtime checked)", url: "https://gist.github.com/robloxscriptings/102258023d59f5636bf44be10d34130b/5c2304102cae57a2affc7296604d74d07fd5947a" },
  input: { id: "bf-normal-input", kind: "github", title: "Blox Fruits: ordinary input route (historical source)", url: "https://github.com/CQWEO/BloxFruits/blob/4f7c1f87b32282f88f2ea6db84ea8107c20f824a/BloxFruits.lua" },
  loot: { id: "bf-physical-loot", kind: "github", title: "Blox Fruits: physical chest and fruit approach (historical source)", url: "https://gist.github.com/Defy-cloud/e36f9f14afa7d4062e462de1560821fc/342e86e1f3231f8a3d4681ba7fa214c450d31243" },
};
const actions: readonly GameAction[] = [
  { id: "auto-farm", key: "farm", label: "Auto Farm", behavior: "Find a living non-boss in Workspace.Enemies, equip a local tool, approach and use ordinary attack input. Confirm health progress; stop on repeated failure, recover after respawn and cancel on Stop/Close.", description: "Farm nearby enemies with an equipped tool. Stops if damage cannot be confirmed. Source-backed; live compatibility is not confirmed.", sourceIds: [source.module.id, source.input.id] },
  { id: "auto-boss", key: "boss", label: "Auto Boss", behavior: "Find live enemies with IsBoss/RaidBoss attributes, approach and attack through the same cancellable normal-input controller. Reacquire after death and confirm health changes.", description: "Farm spawned bosses detected by their actual attributes. No boss spawning, token interception or hitbox changes.", sourceIds: [source.module.id, source.input.id] },
  { id: "quest-farm", key: "quest", label: "Quest Farm", behavior: "Prefer actual ReplicatedStorage.Quests and GuideModule ModuleScripts and validate their schema. First-sea fallback contains 26 source-observed quest records and requires a matching live giver; other seas require live modules. Select a level-appropriate quest, approach its giver, invoke CommF_ StartQuest with its quest ID/stage, confirm quest UI and farm its actual target. Refuse fake module data, uncorroborated positions and conflicting active quests.", description: "Use live quest modules or the 26 first-sea source records with live NPC confirmation. Start near the giver, confirm quest acceptance and farm its target.", sourceIds: [source.quest.id, source.schema.id, source.module.id] },
  { id: "auto-loot", key: "loot", label: "Auto Loot", behavior: "Approach active _ChestTagged chests and spawned fruit tools with Handle. Confirm a chest is removed/disabled or fruit is reparented to inventory before reporting collection; bounded retries and cancelable movement. Do not invent a pickup remote or buy/store/sell items.", description: "Collect available chests and spawned fruits through physical movement, with state confirmation and bounded retries.", sourceIds: [source.module.id, source.loot.id] },
];
const bloxKnowledge: ResearchKnowledgeView = {
  summary: "Four original gameplay actions reuse inspected Blox Fruits paths and interaction schemas. Their controls are active; runtime checks dependencies and progress. Public code evidence is not a live-game certification.",
  sources: Object.values(source),
  features: actions.map(action => ({ id: action.id, label: action.label, basis: "source-backed", summary: action.behavior, sourceIds: action.sourceIds })),
  researchedAt: "2026-10-12T23:38:37Z",
};
const blox: GameAdapterPack = {
  id: "blox-fruits", name: "Blox Fruits", version: "1.0.0", universeId: "994732206",
  placeIds: ["2753915549", "4442272183", "7449423635"], factory: BLOX_FRUITS_RUNTIME_FACTORY, actions, knowledge: bloxKnowledge,
};

export function gameAdapterFor(game: Record<string, unknown>): GameAdapterPack | null {
  const placeId = String(game.placeId ?? "");
  const universeId = String(game.universeId ?? "");
  if (blox.placeIds.includes(placeId) && (!universeId || universeId === blox.universeId)) return blox;
  return null;
}

/** Small concrete examples let the model wire existing implementations instead
 * of rewriting their controller, discovery, retry and lifecycle code. */
export function adapterGenerationContext(pack: GameAdapterPack): string {
  return `SERVER GAME ACTION LIBRARY (${pack.id} ${pack.version}; exact PlaceId binding; source-backed, not live verified):\n`
    + pack.actions.map(action => `${action.id} / ${action.label}: ${action.behavior}\nComplete toggle callback: ctx.gameplay.setEnabled(${JSON.stringify(action.key)}, ctx.enabled)\nSources: ${action.sourceIds.join(", ")}`).join("\n\n")
    + "\nThe server embeds the complete original gameplay controller when these callbacks are used. Use action custom with the exact complete callback shown above, initial false, On/Off labels, and bind its actual requirement ID. Keep the user's title, English UI and requested layout. Do not include another controller, external loader, copied branding, invented remote or duplicate loop. No library action performs economy purchases or PvP. Do not describe public source inspection as live-game verification.";
}

export function gameplayBindingIssues(spec: HubComposition, contract: GenerationContract, pack: GameAdapterPack | null): string[] {
  const issues: string[] = [];
  for (const page of spec.pages) for (const item of page.items) {
    if (!("code" in item) || !referencesGameplay(item.code)) continue;
    if (!pack) { issues.push(`No source-backed game action library matches this game: ${item.id}`); continue; }
    const key = gameplayToggleKey(item.code);
    if (!key || item.kind !== "toggle" || item.initial) { issues.push(`Game action must use one initially-off toggle and its complete library callback: ${item.id}`); continue; }
    for (const id of item.featureIds) {
      const feature = contract.features.find(feature => feature.id === id);
      if (!feature) continue;
      const identity = `${feature.id} ${feature.label}`.toLowerCase();
      const expected = /boss/.test(identity) ? "boss" : /quest|quête/.test(identity) ? "quest" : /loot|collect|fruit|chest/.test(identity) ? "loot" : /farm/.test(identity) ? "farm" : null;
      if (expected !== key) issues.push(`Game action ${key} does not implement requirement: ${id}`);
    }
  }
  return issues;
}

/** Additional researched examples are compact factual schemas, not executable
 * third-party downloads. A different PlaceId cannot inherit Blox Fruits actions. */
export function curatedGameKnowledge(game: Record<string, unknown>): { knowledgeContext: string; researchKnowledge: ResearchKnowledgeView } | null {
  const pack = gameAdapterFor(game);
  if (pack) return { knowledgeContext: adapterGenerationContext(pack), researchKnowledge: pack.knowledge };
  if (String(game.placeId ?? "") === "10260193230") {
    const references = [
      { id: "meme-place-binding", kind: "github", title: "Meme Sea: exact place binding", url: "https://github.com/tlredz/Scripts/blob/0dd52884428af35419477d391442051f7057414f/main.luau" },
      { id: "meme-game-schema", kind: "github", title: "Meme Sea: enemy, level and normal-tool interaction schema", url: "https://github.com/tlredz/Scripts/blob/0dd52884428af35419477d391442051f7057414f/Utils/MemeSea/Module.luau" },
    ];
    return {
      knowledgeContext: `MEME SEA FACT LIBRARY: exact PlaceId 10260193230, not a Blox Fruits game. Source-observed paths: Workspace.Monster (living targets with Humanoid and HumanoidRootPart), ReplicatedStorage.MonsterSpawn, player.PlayerData.Level, ReplicatedStorage.ModuleScript.Quest_Settings, Workspace.Location.Enemy_Location and QuestLocaion (intentional source spelling). Quest settings keyed by NPC expose Target, LevelNeed, Special_Quest and Raid_Boss; Raid_Enemy is an enemy attribute. Equipped Tool:Activate is an observed normal combat route. No verified quest-start command was found: do not invent one.\nORIGINAL REUSABLE TARGET/ATTACK EXAMPLE (reference code, integrate with cancellation and current character):\nlocal folder = workspace:FindFirstChild("Monster")\nlocal character = ctx.player.Character\nlocal humanoid = character and character:FindFirstChildOfClass("Humanoid")\nlocal root = character and character:FindFirstChild("HumanoidRootPart")\nlocal tool = character and character:FindFirstChildOfClass("Tool")\nif folder and humanoid and root and tool then\n    local children = folder:GetChildren()\n    for index = 1, math.min(#children, 200) do\n        local enemy = children[index]\n        local health = enemy:FindFirstChildOfClass("Humanoid")\n        local target = enemy:FindFirstChild("HumanoidRootPart")\n        if health and health.Health > 0 and target then\n            humanoid:MoveTo(target.Position)\n            if (root.Position - target.Position).Magnitude <= 6 then tool:Activate() end\n            break\n        end\n    end\nend\nThis example is one finite step, not a completed automation loop. Use the shared lifecycle method: initially-off toggle, one cancellable controller, throttled steps, observed damage/progress, reacquire after respawn, Stop/Close cleanup. Public sources do not certify current live behavior. Sources: ${references.map(reference => reference.url).join(" ")}`,
      researchKnowledge: { summary: "Inspected Meme Sea paths and an original normal-tool interaction example reduce rediscovery. Quest-start arguments remain unknown; Blox Fruits commands are never reused for this game.", sources: references, features: [
        { id: "auto-farm", label: "Auto Farm", basis: "source-backed", summary: "Workspace.Monster, live Humanoid/RootPart, current PlayerData.Level and equipped Tool activation establish a concrete target/attack integration example.", sourceIds: ["meme-game-schema"] },
        { id: "quest-farm", label: "Quest Farm", basis: "unknown", summary: "Quest_Settings provides target/level metadata, but no quest-start schema was established.", sourceIds: ["meme-game-schema"], missing: ["Confirm the actual quest acceptance call and success state before implementing automatic quest start."] },
      ] },
    };
  }
  if (String(game.universeId ?? "") === "2440500124") {
    const doorsSource = { id: "doors-room-schema", kind: "github", title: "DOORS room/object tracking (MIT source, historical)", url: "https://github.com/PixelMeta/mshub-v2/blob/f577388638ab05c01481347244da66bc21f60b8f/places/2440500124.lua" };
    return {
      knowledgeContext: "DOORS GameId/universeId 2440500124 (NOT a PlaceId). Inspected schema: Workspace.CurrentRooms; ReplicatedStorage.GameData.LatestRoom/Floor; player attribute CurrentRoom; room.Door with Opened/RequiresKey; gold objects attribute GoldValue. Original example: inspect current rooms and display actual keys/gold/door state with owned cleanup. Only interact with an existing ProximityPrompt while within its MaxActivationDistance; no invented unlock or pickup remote. Historical source, validate actual runtime instances. Source: " + doorsSource.url,
      researchKnowledge: { summary: "Reusable DOORS room, door, key and gold discovery schema from an inspected source. Runtime paths must still be checked.", sources: [doorsSource], features: [{ id: "room-tracking", label: "Room and object tracking", basis: "source-backed", summary: "CurrentRooms and GameData identify actual rooms; Door and GoldValue describe visible state. No forced unlock or invented pickup command.", sourceIds: [doorsSource.id] }] },
    };
  }
  return null;
}

export function mergeResearchKnowledge(primary: ResearchKnowledgeView | undefined, additional: ResearchKnowledgeView | undefined): ResearchKnowledgeView | undefined {
  if (!primary) return additional;
  if (!additional) return primary;
  const sources = [...primary.sources, ...additional.sources.filter(item => !primary.sources.some(existing => existing.id === item.id))].slice(0, 24);
  const sourceIds = new Set(sources.map(item => item.id));
  const features = [...primary.features, ...additional.features.filter(item => !primary.features.some(existing => existing.id === item.id))]
    .slice(0, 32).map(item => ({ ...item, sourceIds: item.sourceIds.filter(id => sourceIds.has(id)) }));
  return { summary: (primary.summary + " " + additional.summary).slice(0, 1000), sources, features, researchedAt: additional.researchedAt || primary.researchedAt };
}
