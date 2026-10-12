import test from "node:test";
import assert from "node:assert/strict";
import { appendPreset, SCRIPT_PRESETS } from "../lib/presets.ts";

test("selecting Full Hub retains the exact French draft, custom names and visual requirements while requesting English UI", () => {
  const draft = '\n  Interface cyan et violette, titre exact "Mon Hub", jeu "Étoile Royale".\r\nAjoute un bouton Rejoin dans un panneau 420x280 avec des onglets à gauche.  \n';
  const result = appendPreset(draft, "full-hub");
  assert.equal(result.slice(0, draft.length), draft);
  assert.ok(result.includes("Existing user requirements take priority"));
  assert.ok(result.includes("Preserve custom hub titles, game names and other proper names exactly"));
  assert.ok(result.includes("Generate functional UI in English"));
  assert.ok(result.includes("even if the request is in French"));
  assert.ok(result.includes("French prose does not imply French UI"));
  assert.ok(result.includes("UI colors, layout, size and other visual properties"));
  assert.doesNotMatch(result.slice(draft.length), /preserve[^.]*language/i);
  assert.equal(appendPreset(result, "full-hub"), result);
});

test("Full Hub asks for every listed feature, tabbed controls and honest unavailable states", () => {
  const result = appendPreset("", "full-hub");
  for (const feature of ["Auto Farm", "Auto Boss", "Quest Farm", "Auto Loot", "Settings"]) assert.ok(result.includes(feature));
  for (const requirement of ["tabbed interface", "each requested feature completely", "working controls", "visible but disabled", "Needs game profile", "precise reason", "Never invent remotes"]) assert.ok(result.includes(requirement));
  assert.doesNotMatch(result, /black.and.white/i);
  for (const labelType of ["navigation", "section headings", "control labels", "help text", "status messages", "error messages"]) assert.ok(result.includes(labelType));
});

test("adding different presets preserves prior requirements without duplicate appends", () => {
  const draft = "Only use the features I request. Keep a draggable 420x280 blue panel.";
  let result = draft;
  for (const preset of SCRIPT_PRESETS) {
    const before = result;
    result = appendPreset(result, preset.id);
    assert.ok(result.startsWith(before));
    assert.equal(appendPreset(result, preset.id), result);
  }
  assert.equal(result.match(/\[ScriptRush preset:/g)?.length, SCRIPT_PRESETS.length);
  assert.ok(result.startsWith(draft));
});

test("edited preset blocks are not duplicated on a later click", () => {
  const edited = appendPreset("Custom purple theme.", "full-hub").replace("Auto Loot", "Manual Loot");
  assert.equal(appendPreset(edited, "full-hub"), edited);
});
