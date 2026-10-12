export const SCRIPT_PRESETS = [
  { id: "auto-farm", label: "Auto Farm", instructions: "Create an Auto Farm using only evidenced game systems, with start/stop controls, respawn recovery and cleanup. Respect the user's existing UI and behavior requirements. If runtime evidence is missing, explain exactly what is unavailable instead of inventing remotes or a working implementation." },
  { id: "auto-boss", label: "Auto Boss", instructions: "Create an Auto Boss script using only bosses and interactions evidenced for this game, with start/stop controls and cleanup. Respect the user's existing UI and behavior requirements. If runtime evidence is missing, explain exactly what is unavailable instead of inventing remotes or a working implementation." },
  { id: "quest-farm", label: "Quest Farm", instructions: "Create a quest farming script using only quests and interactions evidenced for this game, with start/stop controls and cleanup. Respect the user's existing UI and behavior requirements. If runtime evidence is missing, explain exactly what is unavailable instead of inventing remotes or a working implementation." },
  { id: "full-hub", label: "Full Hub", instructions: "Create one complete, self-contained Luau Full Hub with a tabbed interface and separate controls for Auto Farm, Auto Boss, Quest Farm, Auto Loot, and Settings. Implement each requested feature completely when reliable game evidence or the supplied runtime profile supports its actual behavior. Do not reduce the hub to a single feature. Every implemented feature must have working controls and its real behavior, with start/stop, respawn recovery and cleanup where relevant; labels, empty callbacks and print statements are not implementations. Keep unavailable features visible but disabled with 'Needs game profile' and a precise reason. Never invent remotes or payloads, or silently claim unsupported features are complete. Preserve the user's specified UI colors, layout, size, text and language; use neutral defaults only where unspecified. Existing user requirements take priority over preset defaults. Return one complete Lua block." },
] as const;

export type ScriptPresetId = typeof SCRIPT_PRESETS[number]["id"];

/** Add a preset once while keeping every character of the user's existing draft. */
export function appendPreset(current: string, id: ScriptPresetId): string {
  const preset = SCRIPT_PRESETS.find((candidate) => candidate.id === id)!;
  const marker = `[ScriptRush preset: ${preset.label}]`;
  if (current.includes(marker)) return current;
  const block = `${marker}\n${preset.instructions}`;
  return current ? `${current}\n\n${block}` : block;
}
