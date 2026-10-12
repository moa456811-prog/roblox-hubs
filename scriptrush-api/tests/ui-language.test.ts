import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEnglishUiLabels, englishUiIssues, SCRIPT_UI_LANGUAGE_POLICY, translateFunctionalUiText } from "../src/lib/ui-language.ts";
import { parseHubComposition, HUB_COMPOSER_SYSTEM } from "../src/lib/hub-spec.ts";
import { GENERATOR_SYSTEM, PLANNER_SYSTEM, REVIEW_SYSTEM } from "../src/lib/generation-contract.ts";

const fixture = () => parseHubComposition(readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8"));

test("every generation stage applies English functional UI even to French requests", () => {
  for (const system of [PLANNER_SYSTEM, HUB_COMPOSER_SYSTEM, GENERATOR_SYSTEM, REVIEW_SYSTEM]) assert.ok(system.includes(SCRIPT_UI_LANGUAGE_POLICY));
});

test("common French controls are rejected while custom titles are preserved", () => {
  const spec = fixture();
  spec.window.title = "Bienvenue chez Aurora";
  assert.deepEqual(englishUiIssues(spec), []);
  spec.window.closeLabel = "Fermer";
  assert.equal(englishUiIssues(spec).length, 1);
  spec.window.closeLabel = "Close";
  spec.pages[0].label = "Réglages";
  assert.equal(englishUiIssues(spec).length, 1);
  spec.pages[0].label = "Settings";
  assert.deepEqual(englishUiIssues(spec), []);
});

test("known quoted French pages and content become English without changing the custom title", () => {
  const spec = fixture();
  spec.window.title = "Bienvenue chez Aurora";
  spec.window.width = 420; spec.window.height = 280;
  spec.window.closeLabel = "Fermer"; spec.window.minimizeLabel = "Réduire"; spec.window.restoreLabel = "Restaurer";
  spec.pages = [
    { id: "accueil", label: "Accueil", featureIds: ["home"], items: [{ id: "bienvenue", kind: "text", featureIds: ["welcome"], text: "Bienvenue" }] },
    { id: "reglages", label: "Réglages", featureIds: ["settings"], items: [{ id: "parametres", kind: "text", featureIds: ["preferences"], text: "Paramètres" }] },
  ];
  const original = structuredClone(spec), translated = applyEnglishUiLabels(spec);
  assert.equal(translated.window.title, "Bienvenue chez Aurora");
  assert.equal(translated.window.closeLabel, "Close");
  assert.equal(translated.window.minimizeLabel, "Minimize");
  assert.equal(translated.window.restoreLabel, "Restore");
  assert.deepEqual(translated.pages.map(page => page.label), ["Home", "Settings"]);
  assert.deepEqual(translated.pages.map(page => page.items[0].kind === "text" ? page.items[0].text : ""), ["Welcome", "Preferences"]);
  assert.deepEqual(englishUiIssues(translated), []);
  assert.deepEqual(spec, original, "The input composition must remain untouched.");
  const unchanged = { ...translated, window: { ...translated.window, closeLabel: spec.window.closeLabel, minimizeLabel: spec.window.minimizeLabel, restoreLabel: spec.window.restoreLabel }, pages: translated.pages.map((page, index) => ({ ...page, label: spec.pages[index].label, items: spec.pages[index].items })) };
  assert.deepEqual(unchanged, spec, "Only functional strings may change; dimensions, colors, IDs and feature bindings remain exact.");
});

test("numeric, toggle, disabled and custom controls retain every behavior while translating known labels", () => {
  const spec = fixture();
  const speed = spec.pages[0].items[0]; assert.equal(speed.kind, "number");
  if (speed.kind === "number") { speed.label = "Vitesse de marche"; speed.applyLabel = "Appliquer"; speed.description = "Cliquez pour appliquer"; }
  const theme = spec.pages[2].items[0]; assert.equal(theme.kind, "toggle");
  if (theme.kind === "toggle") { theme.label = "Thème"; theme.onLabel = "Activé"; theme.offLabel = "Désactivé"; }
  spec.pages[2].items.push({ id: "unsupported", featureIds: ["quest-farm"], kind: "disabled", label: "Quest Farm", reason: "Profil du jeu manquant" });
  spec.pages[1].items.push({ id: "custom", featureIds: ["custom"], kind: "button", label: "Appliquer", description: "Blox Fruits", action: "custom", code: 'ctx.player:SetAttribute("Bienvenue", "Étoile Royale")' });
  const translated = applyEnglishUiLabels(spec), numeric = translated.pages[0].items[0], toggle = translated.pages[2].items[0], disabled = translated.pages[2].items[1], custom = translated.pages[1].items[1];
  assert.deepEqual(numeric, { ...speed, label: "Walk Speed", applyLabel: "Apply", description: "Click to apply" });
  assert.deepEqual(toggle, { ...theme, label: "Theme", onLabel: "On", offLabel: "Off" });
  assert.equal(disabled.kind, "disabled"); if (disabled.kind === "disabled") assert.equal(disabled.reason, "Missing game profile");
  assert.equal(custom.kind, "button"); if (custom.kind === "button") {
    assert.equal(custom.label, "Apply"); assert.equal(custom.description, "Blox Fruits");
    assert.equal(custom.code, 'ctx.player:SetAttribute("Bienvenue", "Étoile Royale")');
  }
  assert.deepEqual(englishUiIssues(translated), []);
  assert.deepEqual(applyEnglishUiLabels(translated), translated, "English normalization is idempotent.");
});

test("unrecognized French prose is preserved for review and still fails the untranslated-control guard", () => {
  const spec = fixture();
  spec.pages[0].items.push({ id: "instruction", featureIds: [], kind: "text", text: "Cliquez sur le bouton violet pour continuer." });
  const translated = applyEnglishUiLabels(spec), item = translated.pages[0].items[2];
  assert.equal(item.kind, "text"); if (item.kind === "text") assert.equal(item.text, "Cliquez sur le bouton violet pour continuer.");
  assert.equal(englishUiIssues(translated).length, 1);
  assert.equal(translateFunctionalUiText("Bienvenue chez Aurora"), "Bienvenue chez Aurora");
  assert.equal(translateFunctionalUiText("Active"), "Active", "Ambiguous English words are not translated as French.");
  assert.equal(translateFunctionalUiText("Paramètres"), "Settings");
  assert.equal(translateFunctionalUiText("Paramètres", "content"), "Preferences");
  assert.equal(translateFunctionalUiText(" Re\u0301glages "), "Settings");
});
