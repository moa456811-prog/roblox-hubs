import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildGenerationQualityInventory, assessGenerationQuality, formatGenerationQualityInventory, GENERATION_QUALITY_GUIDE } from "../src/lib/generation-quality.ts";
import type { GenerationContract } from "../src/lib/generation-contract.ts";
import { parseHubComposition } from "../src/lib/hub-spec.ts";
import { applyEnglishUiLabels } from "../src/lib/ui-language.ts";

const fixture = () => parseHubComposition(readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8"));
const request = 'Full hub titled "Aurora Hub", size 480 by 360, radius 12, navigation at the top, font Gotham, text size 14. Background RGB(18,24,42), foreground #eef5ff, accent Color3.fromHex("55ddff"), controls RGB(30,43,68), muted #afbf d5. Tabs Movement, Session and Settings. Walk Speed, Jump Power, Rejoin and toggle theme.';

test("explicit feature and applied UI inventory remains deterministic and never mutates caller input", () => {
  const first = buildGenerationQualityInventory(request), second = buildGenerationQualityInventory(request);
  assert.deepEqual(first, second);
  assert.deepEqual(first.features.map(item => item.label), ["Walk Speed", "Jump Power", "Rejoin", "Theme"]);
  assert.deepEqual(first.pages.map(page => page.label), ["Movement", "Session", "Settings"]);
  assert.equal(first.ui.find(item => item.field === "title")?.value, "Aurora Hub");
  assert.equal(first.ui.find(item => item.field === "width")?.value, 480);
  assert.equal(first.ui.find(item => item.field === "height")?.value, 360);
  assert.equal(first.colors.length, 4, "Malformed/ambiguous colors are not guessed");
  const spec = fixture(), before = structuredClone(spec);
  const result = assessGenerationQuality(first, spec);
  assert.deepEqual(result.issues, []);
  assert.equal(result.verification, "composition-structure-only");
  assert.ok(result.checks.length > 12); assert.ok(result.checks.every(check => check.passed));
  assert.deepEqual(spec, before);
});

test("the actual title, dimensions, radius, font and navigation cannot be replaced by model claims", () => {
  const inventory = buildGenerationQualityInventory(request), spec = fixture();
  spec.window.title = "Unrequested Brand"; spec.window.width = 500; spec.window.height = 500;
  spec.window.radius = 1; spec.window.font = "Arial"; spec.window.textSize = 20; spec.window.navigation = "left";
  spec.pages[0].items.push({ id: "fake-values", kind: "text", featureIds: [], text: 'Aurora Hub 480 360 12 Gotham 14 top #eef5ff' });
  const result = assessGenerationQuality(inventory, spec);
  for (const field of ["title", "width", "height", "radius", "font", "textSize", "navigation"]) assert.ok(result.issues.some(issue => issue.includes(`window.${field}`)), field);
});

test("RGB and hex must occupy their requested applied palette role, not appear in text or another slot", () => {
  const inventory = buildGenerationQualityInventory("UI background #12182a and accent RGB(85,221,255)."), spec = fixture();
  assert.deepEqual(inventory.colors.map(item => item.role), ["background", "accent"]);
  const accent = spec.window.palette.accent; spec.window.palette.accent = [9,9,9]; spec.window.palette.muted = accent;
  spec.pages[0].items.push({ id: "unused-color", kind: "text", featureIds: [], text: "RGB(85,221,255)" });
  assert.ok(assessGenerationQuality(inventory, spec).issues.some(issue => issue.includes("accent color")));
  assert.deepEqual(assessGenerationQuality(buildGenerationQualityInventory("UI in Color3.fromRGB(18,24,42) and #55ddff."), fixture()).issues, []);
});

test("primary and alternate palette constraints are checked against their own actual applied values", () => {
  const inventory = buildGenerationQualityInventory("Primary palette background #12182a, accent #55ddff. Alternate palette background #181226, accent #b578ff."), spec = fixture();
  assert.deepEqual(inventory.colors.map(color => color.palette), ["primary", "primary", "alternate", "alternate"]);
  assert.deepEqual(assessGenerationQuality(inventory, spec).issues, []);
  spec.window.alternatePalette = null;
  assert.equal(assessGenerationQuality(inventory, spec).checks.filter(check => !check.passed).length, 2);
});

test("unrelated numbers and named colors do not become invented window or palette constraints", () => {
  const inventory = buildGenerationQualityInventory("Use a purple full hub for Place ID 123456789 with 500 gold and 200 damage. Auto Farm.");
  assert.deepEqual(inventory.ui, []); assert.deepEqual(inventory.colors, []); assert.deepEqual(inventory.pages, []);
  assert.equal(inventory.features.length, 1); assert.equal(inventory.features[0].label, "Auto Farm");
  assert.ok(inventory.limitations.some(item => item.includes("Named colors")));
});

test("French functional pages become English while the exact custom title remains French", () => {
  const inventory = buildGenerationQualityInventory('Crée une interface 420 par 280, titre exact "Bienvenue chez Aurora", onglets "Accueil" et "Réglages", contenus "Bienvenue" et "Paramètres".');
  const spec = fixture(); spec.window.title = "Bienvenue chez Aurora"; spec.window.width = 420; spec.window.height = 280;
  spec.pages = [{ id: "home", label: "Accueil", featureIds: [], items: [] }, { id: "settings", label: "Réglages", featureIds: [], items: [] }];
  assert.deepEqual(inventory.pages.map(page => page.label), ["Home", "Settings"]);
  assert.equal(inventory.ui.find(item => item.field === "title")?.value, "Bienvenue chez Aurora");
  assert.deepEqual(assessGenerationQuality(inventory, applyEnglishUiLabels(spec)).issues, []);
  assert.ok(assessGenerationQuality(inventory, spec).issues.some(issue => issue.includes("must be in English")));
});

test("quoted proper tab names and custom title are not translated or treated as gameplay", () => {
  const inventory = buildGenerationQualityInventory('UI-only, title "Auto Farm", tabs "Quest Farm" and "Étoile Royale".');
  assert.deepEqual(inventory.features, []);
  assert.deepEqual(inventory.pages.map(page => page.label), ["Quest Farm", "Étoile Royale"]);
  assert.equal(inventory.ui[0].value, "Auto Farm");
});

test("collapsed, duplicated, reordered or unreachable tabs fail actual page checks", () => {
  const inventory = buildGenerationQualityInventory('Tabs Movement, Session and Settings.');
  for (const mutate of [
    (spec: ReturnType<typeof fixture>) => { spec.pages = [spec.pages[0]]; },
    (spec: ReturnType<typeof fixture>) => { spec.pages[1].label = "Movement"; },
    (spec: ReturnType<typeof fixture>) => { spec.pages.reverse(); },
    (spec: ReturnType<typeof fixture>) => { spec.window.navigation = "none"; },
  ]) { const spec = fixture(); mutate(spec); assert.ok(assessGenerationQuality(inventory, spec).issues.length); }
  const exact = buildGenerationQualityInventory("Exactly tabs Movement, Session and Settings.");
  const extra = fixture(); extra.pages.push({ id: "extra", label: "Extra", featureIds: [], items: [] });
  assert.equal(exact.exhaustivePages, true);
  assert.ok(assessGenerationQuality(exact, extra).issues.some(issue => issue.includes("exact page list")));
  assert.deepEqual(assessGenerationQuality(inventory, extra).issues, [], "An inclusive page list does not invent a prohibition on additional pages");
});

test("a full hub cannot satisfy independent requested features with decorative labels or one unrelated control", () => {
  const inventory = buildGenerationQualityInventory("Full hub with Walk Speed, Jump Power, Rejoin and toggle theme."), spec = fixture();
  spec.pages[0].items = [{ id: "fake-speed", kind: "text", featureIds: ["request-walk-speed"], text: "Walk Speed and Jump Power" }];
  const rejoin = spec.pages[1].items[0]; assert.equal(rejoin.kind, "button"); if (rejoin.kind === "button") rejoin.action = "close";
  const result = assessGenerationQuality(inventory, spec);
  assert.deepEqual(result.features.map(feature => feature.status), ["missing", "missing", "control-present", "control-present"]);
  assert.ok(result.issues.some(issue => issue.includes("Walk Speed")));
  assert.ok(result.issues.some(issue => issue.includes("Jump Power")));
  assert.ok(result.issues.some(issue => issue.includes("unrelated action instead of rejoin")));
});

test("planner omission cannot hide explicit original feature requirements", () => {
  const contract: GenerationContract = { fullHub: true, ui: { instructions: "Use requested UI", requiredText: [] }, features: [{ id: "walk-speed", label: "Walk Speed", behavior: "Apply speed to current humanoid", availability: "supported", evidence: "Standard client API", interaction: true }] };
  const before = structuredClone(contract);
  const inventory = buildGenerationQualityInventory("Walk Speed, Jump Power and Rejoin.", contract);
  assert.deepEqual(inventory.features.map(feature => feature.id), ["walk-speed", "request-jump-power", "request-rejoin"]);
  assert.deepEqual(inventory.features.map(feature => feature.origin), ["user", "user", "user"]);
  const spec = fixture(); spec.pages[1].items = [];
  assert.ok(assessGenerationQuality(inventory, spec).issues.some(issue => issue.includes("Rejoin")));
  assert.deepEqual(contract, before);
});

test("a genuine whole-interface requirement can bind the verified window shell without a fake feature button", () => {
  const spec = fixture(); spec.window.featureIds = ["interface"];
  const contract: GenerationContract = { fullHub: true, ui: { instructions: "", requiredText: [] }, features: [{ id: "interface", label: "Interface", behavior: "Create a draggable UI window with real tabs, close and minimize", availability: "supported", evidence: "Standard Roblox UI", interaction: true }] };
  const inventory = buildGenerationQualityInventory("Build the requested interface.", contract);
  assert.deepEqual(assessGenerationQuality(inventory, spec).issues, []);
  spec.window.draggable = false;
  assert.ok(assessGenerationQuality(inventory, spec).issues.length);
  const fake = { ...contract, features: [{ ...contract.features[0], id: "auto-farm", label: "Auto Farm", behavior: "Automate farming" }] };
  spec.window.featureIds = ["auto-farm"];
  assert.ok(assessGenerationQuality(buildGenerationQualityInventory("Full hub Auto Farm.", fake), spec).issues.length, "Game behavior cannot hide in a window-shell binding");
});

test("disabled evidence-dependent controls stay honestly distinct from an implemented control", () => {
  const spec = fixture();
  spec.pages[0].items.push({ id: "auto-farm", kind: "disabled", featureIds: ["auto-farm"], label: "Auto Farm", reason: "Missing verified quest/attack flow for the selected game." });
  const feature = { id: "auto-farm", label: "Auto Farm", behavior: "Automate farming", availability: "needs-runtime" as const, evidence: "No matching flow", interaction: true };
  const contract: GenerationContract = { fullHub: true, features: [feature], ui: { instructions: "", requiredText: [] } };
  const result = assessGenerationQuality(buildGenerationQualityInventory("Full hub Auto Farm.", contract), spec);
  assert.equal(result.features[0].status, "disabled"); assert.deepEqual(result.issues, []);
  const unsupported = assessGenerationQuality(buildGenerationQualityInventory("Full hub Auto Farm."), spec);
  assert.equal(unsupported.features[0].status, "disabled"); assert.ok(unsupported.issues.some(issue => issue.includes("only a disabled control")));
  const supported = assessGenerationQuality(buildGenerationQualityInventory("Full hub Auto Farm.", { ...contract, features: [{ ...feature, availability: "supported" }] }), spec);
  assert.ok(supported.issues.length);
});

test("custom control presence cannot claim its game behavior was verified", () => {
  const spec = fixture(); spec.pages[0].items.push({ id: "farm", kind: "toggle", featureIds: [], label: "Auto Farm", description: "", onLabel: "On", offLabel: "Off", initial: false, action: "custom", code: "ctx.notify('An effect is still subject to semantic review')" });
  const inventory = buildGenerationQualityInventory("Full hub Auto Farm.");
  const result = assessGenerationQuality(inventory, spec);
  assert.equal(result.features[0].status, "control-present");
  assert.equal(result.verification, "composition-structure-only");
  assert.ok(result.limitations.some(item => item.includes("not proof")));
  const item = spec.pages[0].items.at(-1)!; if (item.kind === "toggle") item.code = "";
  assert.ok(assessGenerationQuality(inventory, spec).issues.length, "Empty callbacks are not even structurally complete");
});

test("negated and text-only gameplay names never expand scope", () => {
  assert.deepEqual(buildGenerationQualityInventory("No Auto Farm, no Auto Boss, without Auto Loot, sans Quest Farm.").features, []);
  assert.deepEqual(buildGenerationQualityInventory("Without Auto Farm and Auto Boss.").features, []);
  assert.deepEqual(buildGenerationQualityInventory("Sans Auto Farm et Auto Loot.").features, []);
  assert.deepEqual(buildGenerationQualityInventory("No Auto Farm, but Auto Boss.").features.map(feature => feature.label), ["Auto Boss"]);
  assert.deepEqual(buildGenerationQualityInventory('Text-only UI display the text "Auto Farm".').features, []);
  assert.deepEqual(buildGenerationQualityInventory("Full hub for Anime Zero.").features, [], "A game name or broad hub request does not invent gameplay mechanics");
});

test("French and English exclusion commands never create requested interactive features", () => {
  for (const prompt of [
    "Aucun Rejoin.", "Aucune Auto Farm.", "Pas Rejoin.", "Pas de Rejoin.", "Je ne veux pas de Rejoin.",
    "Ne génère pas Rejoin.", "N'ajoute pas de Rejoin.", "Ne mets pas Rejoin.", "Ne pas inclure Rejoin.", "Je ne veux pas que tu ajoutes Rejoin.",
    "Do not add Rejoin.", "Do not include any Rejoin.", "Don't add Rejoin.", "Exclude Rejoin.",
    "Sans Auto Farm ni Auto Boss.", "Sans AutoFarm, AutoBoss ni AutoLoot.", "Without Auto Farm, Auto Boss and Auto Loot.",
    "Neither Auto Farm nor Auto Boss.", "Rejoin should not be added.", "Rejoin est exclu.",
  ]) assert.deepEqual(buildGenerationQualityInventory(prompt).features, [], prompt);
});

test("feature-list exclusions stop at contrast clauses, separators and explicit positive commands", () => {
  for (const prompt of [
    "Sans Auto Farm ni Auto Boss; mais Rejoin.", "Aucun Auto Farm ni Auto Boss, mais Rejoin.",
    "No Auto Farm or Auto Boss; Rejoin.", "Without Auto Farm and Auto Boss, but Rejoin.",
    "Do not add Auto Farm and Auto Boss, add Rejoin.", "Sans Auto Farm ni Auto Boss, ajoute Rejoin.",
    "Without game files, add Rejoin.", "Ne désactive pas Rejoin.", "Ne supprime pas Rejoin.",
  ]) assert.deepEqual(buildGenerationQualityInventory(prompt).features.map(feature => feature.label), ["Rejoin"], prompt);
});

test("explicit no title, fixed window and separate width/height constraints are preserved", () => {
  const inventory = buildGenerationQualityInventory("Sans nom, fenêtre fixe, largeur 480 pixels, hauteur 360 pixels, sans onglets."), spec = fixture();
  spec.window.title = ""; spec.window.draggable = false; spec.window.navigation = "none"; spec.pages = [spec.pages[0]];
  assert.deepEqual(assessGenerationQuality(inventory, spec).issues, []);
  assert.equal(inventory.ui.find(item => item.field === "draggable")?.value, false);
  assert.equal(inventory.ui.find(item => item.field === "title")?.value, "");
});

test("compact specialization method preserves scope, language and uncertainty without a brand default", () => {
  const formatted = formatGenerationQualityInventory(buildGenerationQualityInventory(request));
  assert.ok(formatted.includes("EXPLICIT REQUEST INVENTORY")); assert.ok(formatted.includes('"label":"Walk Speed"'));
  assert.ok(GENERATION_QUALITY_GUIDE.includes("ORIGINAL USER REQUEST"));
  assert.ok(GENERATION_QUALITY_GUIDE.includes("Functional UI stays English"));
  assert.ok(GENERATION_QUALITY_GUIDE.includes("do not invent remotes"));
  assert.ok(GENERATION_QUALITY_GUIDE.includes("does not prove live gameplay"));
  assert.ok(!/A7DEV|Aurora|ScriptRush/.test(GENERATION_QUALITY_GUIDE));
});


test("generic request for tabs, Close and Minimize is not an explicit page-label list", () => {
  const inventory = buildGenerationQualityInventory("Full hub with Walk Speed, tabs, Close and Minimize.");
  assert.deepEqual(inventory.pages, []);
});


test("named tabs do not invent a window title", () => {
  const inventory = buildGenerationQualityInventory('Build a full hub with tabs named "Movement", "Session", "Settings".');
  assert.equal(inventory.ui.some(item => item.field === "title"), false);
  assert.deepEqual(inventory.pages.map(page => page.label), ["Movement", "Session", "Settings"]);
  assert.equal(buildGenerationQualityInventory('A hub named "My Custom Hub".').ui.find(item => item.field === "title")?.value, "My Custom Hub");
});

test("no title please is a single empty-title requirement and never hides later requested controls", () => {
  const inventory = buildGenerationQualityInventory("Full hub with no title please, Walk Speed and Rejoin.");
  assert.deepEqual(inventory.ui.filter(item => item.field === "title").map(item => item.value), [""]);
  assert.deepEqual(inventory.features.map(feature => feature.label), ["Walk Speed", "Rejoin"]);
  const spec = fixture(); spec.window.title = "";
  assert.deepEqual(assessGenerationQuality(inventory, spec).issues, []);
});

test("preserving the existing title and colors never invents a title called and colors", () => {
  const inventory = buildGenerationQualityInventory("Full hub, keep the title and colors; add Rejoin.");
  assert.deepEqual(inventory.ui.filter(item => item.field === "title"), []);
  assert.deepEqual(inventory.features.map(feature => feature.label), ["Rejoin"]);
  assert.deepEqual(assessGenerationQuality(inventory, fixture()).issues, []);
  assert.deepEqual(buildGenerationQualityInventory("No title changes; add Rejoin.").ui.filter(item => item.field === "title"), []);
});

test("an unchanged-title instruction does not swallow the requested correction", () => {
  const inventory = buildGenerationQualityInventory("Keep the title unchanged and fix Auto Farm.");
  assert.deepEqual(inventory.ui.filter(item => item.field === "title"), []);
  assert.deepEqual(inventory.features.map(feature => feature.label), ["Auto Farm"]);
  for (const instruction of ["Préserver le titre et les couleurs; corrige Auto Farm.", "Conserver mon titre actuel; corrige Auto Boss."]) {
    const translated = buildGenerationQualityInventory(instruction);
    assert.deepEqual(translated.ui.filter(item => item.field === "title"), []);
    assert.equal(translated.features.length, 1);
  }
});

test("explicit quoted titles remain exact even when their proper name resembles a no-title instruction", () => {
  for (const title of ["Untitled", "No Title", "Unnamed", "Sans nom"]) {
    const inventory = buildGenerationQualityInventory(`Build a hub titled "${title}", with Walk Speed.`);
    assert.deepEqual(inventory.ui.filter(item => item.field === "title").map(item => item.value), [title]);
    assert.equal(inventory.features[0].label, "Walk Speed");
  }
  const explicit = buildGenerationQualityInventory('Preserve the title "Bienvenue", add Rejoin.');
  assert.equal(explicit.ui.find(item => item.field === "title")?.value, "Bienvenue");
});
