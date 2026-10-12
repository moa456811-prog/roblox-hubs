import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { luaString, renderHubComposition } from "../src/lib/hub-composer.ts";
import { hubCompositionJsonSchema, parseHubComposition, validateCompositionCoverage } from "../src/lib/hub-spec.ts";
import type { GenerationContract } from "../src/lib/generation-contract.ts";

const fixture = readFileSync(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8");
const sample = () => parseHubComposition(fixture);
const contract = (): GenerationContract => ({
  fullHub: true, ui: { instructions: "480 by 360 navy/cyan rounded draggable Aurora Hub with real Movement/Session/Settings tabs.", requiredText: ["Aurora Hub", "Movement", "Session", "Settings"] },
  features: ["walk-speed", "jump-power", "rejoin", "theme"].map(id => ({ id, label: id, behavior: id, availability: "supported", evidence: "Standard Roblox client APIs.", interaction: true })),
});

test("every independent requirement must remain bound and supported utilities cannot become disabled", () => {
  const spec = sample();
  assert.deepEqual(validateCompositionCoverage(spec, contract()), []);
  spec.pages[1].items = [];
  assert.deepEqual(validateCompositionCoverage(spec, contract()), ["Missing requirement in composed hub: rejoin"]);
  spec.pages[1].items = [{ id: "rejoin", featureIds: ["rejoin"], kind: "disabled", label: "Rejoin", reason: "This is a fake unsupported utility." }];
  assert.deepEqual(validateCompositionCoverage(spec, contract()), ["Supported requirement was disabled: rejoin"]);
});

test("placing all behavior IDs on the window cannot masquerade as working feature controls", () => {
  const spec = sample();
  spec.window.featureIds = contract().features.map(feature => feature.id);
  for (const page of spec.pages) page.items = [];
  const issues = validateCompositionCoverage(spec, contract());
  assert.equal(issues.length, 4);
  assert.ok(issues.every(issue => issue.startsWith("Interactive requirement has no working control:")));
  const uiPlan = contract();
  uiPlan.features = [{ id: "interface", label: "Complete interface", behavior: "Create this draggable UI window with three tabs, title, close, minimize and restore.", availability: "supported", evidence: "Standard GUI APIs", interaction: true }];
  spec.window.featureIds = ["interface"];
  assert.deepEqual(validateCompositionCoverage(spec, uiPlan), []);
  spec.window.closeLabel = null;
  assert.deepEqual(validateCompositionCoverage(spec, uiPlan), ["Interactive requirement has no working control: interface"]);
});

test("unverified game systems stay visible with disabled controls and precise missing-evidence reasons", () => {
  const spec = sample(), plan = contract();
  plan.features.push({ id: "quest-farm", label: "Quest Farm", behavior: "Accept and complete the selected quest.", availability: "needs-runtime", evidence: "Quest remotes and payloads have not been observed.", interaction: true });
  spec.pages[2].items.push({ id: "quest-farm", featureIds: ["quest-farm"], kind: "disabled", label: "Quest Farm", reason: "Needs game profile: quest remotes and their payloads have not been observed." });
  assert.deepEqual(validateCompositionCoverage(spec, plan), []);
  const lua = renderHubComposition(spec);
  assert.ok(lua.includes('"Needs game profile: quest remotes and their payloads have not been observed."'));
  assert.match(lua, /item3_2Button\.Interactable = false/);
  assert.match(lua, /item3_2Button\.Active = false/);
  assert.doesNotMatch(lua, /FireServer|InvokeServer|HttpGet|loadstring/);
});

test("renderer uses exact visual values with navigation below the header and list-layout rows", () => {
  const lua = renderHubComposition(sample());
  assert.ok(lua.includes('title.Text = "Aurora Hub"'));
  assert.ok(lua.includes("panel.Size = UDim2.fromOffset(480, 360)"));
  assert.ok(lua.includes("Color3.fromRGB(18, 24, 42)"));
  assert.ok(lua.includes("Color3.fromRGB(85, 221, 255)"));
  assert.ok(lua.includes("navigation.Position = UDim2.fromOffset(16, 52)"));
  assert.ok(lua.includes("page1.Position = UDim2.fromOffset(16, 92)"));
  assert.ok(lua.includes('make("UIListLayout", "Layout", page1)'));
  assert.ok(lua.includes('make("UIListLayout", "ContentLayout", object)'));
  assert.ok(lua.includes("object.AutomaticSize = Enum.AutomaticSize.Y"));
  assert.ok(lua.includes("page.Visible = id == selected"));
  assert.ok(lua.includes('selectPage("settings")'));
});

test("numeric controls validate their own TextBox and update the current character only on Apply", () => {
  const lua = renderHubComposition(sample());
  assert.ok(lua.includes("local value = tonumber(item1_1Input.Text)"));
  assert.ok(lua.includes("value < 8 or value > 32"));
  assert.ok(lua.includes("value < 20 or value > 75"));
  assert.ok(lua.includes("humanoid.WalkSpeed = value"));
  assert.ok(lua.includes("humanoid.UseJumpPower = true\n    humanoid.JumpPower = value"));
  assert.ok(lua.indexOf("own(item1_1Button.Activated") < lua.indexOf("humanoid.WalkSpeed = value"));
  assert.ok(lua.indexOf("own(item2_1Button.Activated") < lua.indexOf("TeleportService:Teleport(game.PlaceId, player)"));
  assert.equal((lua.match(/TeleportService:Teleport\(/g) || []).length, 1);
});

test("close owns all connections and destroys the root including the separate restore button", () => {
  const lua = renderHubComposition(sample());
  assert.ok(lua.includes('button("RestoreButton", "Restore", gui)'));
  assert.ok(lua.includes("panel.Visible = false\n    restoreButton.Visible = true"));
  assert.ok(lua.includes("panel.Visible = true\n    restoreButton.Visible = false"));
  assert.ok(lua.includes("for _, connection in ipairs(connections) do connection:Disconnect() end"));
  assert.ok(lua.includes("local function closeHub()\n    cleanup()\n    gui:Destroy()"));
  assert.equal((lua.match(/:Connect\(/g) || []).length, 1, "All events pass through the ownership helper.");
  assert.ok(lua.includes("input.UserInputType == Enum.UserInputType.MouseMovement"));
  assert.ok(lua.includes("startPosition.X.Offset + delta.X"));
  assert.doesNotMatch(lua, /input ==|MouseMove\b|MouseUp\b/);
});

test("theme binds every actual instance property and navigation selection survives theme changes", () => {
  const lua = renderHubComposition(sample());
  assert.ok(lua.includes('paint(panel, "BackgroundColor3", "background")'));
  assert.ok(lua.includes('paint(object, "BackgroundColor3", "control")'));
  assert.ok(lua.includes("binding.object.BackgroundColor3 = palettes[themeIndex][binding.key]"));
  assert.ok(lua.includes("binding.object.TextColor3 = palettes[themeIndex][binding.key]"));
  assert.ok(lua.includes('binding.key = id == selected and "accent" or "control"'));
  assert.ok(lua.includes("themeIndex = themeIndex == 1 and 2 or 1\n    applyTheme()"));
  assert.ok(lua.includes("item3_1Enabled = not item3_1Enabled"));
  assert.ok(lua.includes("local function item3_1Apply()\n    switchTheme()"));
});

test("French UI-only windows keep requested texts and sidebar layout without gameplay callbacks", () => {
  const spec = sample();
  spec.window.title = "Aurora Panel"; spec.window.width = 420; spec.window.height = 280; spec.window.navigation = "left";
  spec.window.closeLabel = "Fermer"; spec.window.minimizeLabel = null; spec.window.featureIds = ["interface"];
  spec.pages = [
    { id: "accueil", label: "Accueil", featureIds: [], items: [{ id: "bienvenue", kind: "text", featureIds: [], text: "Bienvenue" }] },
    { id: "reglages", label: "Réglages", featureIds: [], items: [{ id: "parametres", kind: "text", featureIds: [], text: "Paramètres" }] },
  ];
  const lua = renderHubComposition(spec);
  for (const text of ["Aurora Panel", "Fermer", "Accueil", "Réglages", "Bienvenue", "Paramètres"]) assert.ok(lua.includes(luaString(text)));
  assert.ok(lua.includes("panel.Size = UDim2.fromOffset(420, 280)"));
  assert.ok(lua.includes("navigationLayout.FillDirection = Enum.FillDirection.Vertical"));
  assert.doesNotMatch(lua, /TeleportService:Teleport|humanoid\.WalkSpeed|humanoid\.JumpPower/);
});

test("custom callbacks get isolated context and initially enabled toggles wait until all controls exist", () => {
  const spec = sample();
  spec.pages[2].items = [{ id: "custom", featureIds: ["theme"], kind: "toggle", label: "Custom", description: "", onLabel: "On", offLabel: "Off", initial: true, action: "custom", code: 'ctx.player:SetAttribute("CustomEnabled", ctx.enabled)' }];
  const lua = renderHubComposition(spec);
  assert.ok(lua.includes("state = item3_1State"));
  assert.ok(lua.includes("enabled = item3_1Enabled"));
  assert.ok(lua.includes('ctx.player:SetAttribute("CustomEnabled", ctx.enabled)'));
  assert.ok(lua.includes("table.insert(initialCallbacks, item3_1Apply)"));
  assert.ok(lua.indexOf("gui.Parent = playerGui") < lua.indexOf("for _, callback in ipairs(initialCallbacks) do callback() end"));
});

test("large-font narrow windows stack header controls and size rows without clipping fixed text heights", () => {
  const spec = sample(); spec.window.width = 240; spec.window.height = 480; spec.window.textSize = 32;
  const lua = renderHubComposition(spec);
  assert.ok(lua.includes("closeButton.Size = UDim2.fromOffset(208, 46)"));
  assert.ok(lua.includes("minimizeButton.Size = UDim2.fromOffset(208, 46)"));
  assert.ok(lua.includes("title.TextWrapped = true"));
  assert.ok(lua.includes("item1_1InputRow.Size = UDim2.new(1, 0, 0, 46)"));
  assert.ok(lua.includes("object.Size = UDim2.new(1, 0, 0, 38)"));
  spec.window.height = 180;
  assert.throws(() => renderHubComposition(spec), /HUB_WINDOW_TOO_SHORT_FOR_REQUESTED_HEADER/);
});

test("composition rejects duplicate IDs, unreachable pages, invalid ranges and hidden custom code", () => {
  const duplicate = sample(); duplicate.pages[1].id = duplicate.pages[0].id;
  assert.throws(() => parseHubComposition(JSON.stringify(duplicate)), /DUPLICATE_HUB_IDS/);
  const unreachable = sample(); unreachable.window.navigation = "none";
  assert.throws(() => parseHubComposition(JSON.stringify(unreachable)), /UNREACHABLE_HUB_PAGES/);
  const invalid = sample(); const number = invalid.pages[0].items[0]; assert.equal(number.kind, "number"); if (number.kind === "number") number.initial = 200;
  assert.throws(() => parseHubComposition(JSON.stringify(invalid)), /INVALID_HUB_NUMBER_RANGE/);
  const hidden = sample(); const item = hidden.pages[1].items[0]; if (item.kind === "button") item.code = "game:Shutdown()";
  assert.throws(() => parseHubComposition(JSON.stringify(hidden)), /UNEXPECTED_HUB_BEHAVIOR/);
  assert.ok(hubCompositionJsonSchema.properties);
});

test("Lua literals preserve quotation, Unicode and control characters without code injection", () => {
  assert.equal(luaString('Réglages "x"\\\n\0'), '"Réglages \\"x\\"\\\\\\010\\000"');
  const spec = sample(); spec.window.title = '\"); error("injected") --';
  assert.ok(renderHubComposition(spec).includes('title.Text = "\\"); error(\\"injected\\") --"'));
});
