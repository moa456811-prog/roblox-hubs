import assert from "node:assert/strict";
import test from "node:test";
import { assessContract, generationResponseFormat, GENERATOR_SYSTEM, PLANNER_SYSTEM, REVIEW_SYSTEM, requestedColorIssues, withoutComments, type GenerationContract } from "../src/lib/generation-contract.ts";

const contract: GenerationContract = {
  features: [{ id: "speed", label: "Walk Speed", behavior: "Apply the requested WalkSpeed on click", availability: "supported", evidence: "standard client API", interaction: true }],
  ui: { instructions: "local screen UI", requiredText: [] }, fullHub: false,
};
const ui = 'local gui=Instance.new("ScreenGui")';

test("JSON schemas constrain planning and review without forcing code generation into JSON", () => {
  assert.equal(generationResponseFormat(GENERATOR_SYSTEM), null);
  assert.equal(generationResponseFormat(`${GENERATOR_SYSTEM}\nREPAIR MODE`), null);
  const plan = generationResponseFormat(PLANNER_SYSTEM)!;
  const review = generationResponseFormat(REVIEW_SYSTEM)!;
  assert.equal(plan.type, "json_schema");
  assert.equal(review.json_schema.strict, true);
  assert.deepEqual(review.json_schema.schema.required, ["missingRequirements", "scopeIssues", "ui", "features"]);
  assert.ok(JSON.stringify(review).includes('"controlEvidence":{"type":"string","maxLength":1800}'));
});
function assess(script: string, behavior: string, control: string, change: GenerationContract = contract) {
  return assessContract(change, JSON.stringify({ missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ui] }, features: [{ id: "speed", status: "implemented", reason: "", behaviorEvidence: behavior, controlEvidence: control }] }), script, "Apply requested behavior");
}

test("print-only wrappers and unused function declarations cannot implement an interactive feature", () => {
  const print = 'button.Activated:Connect(function() print("clicked") end)';
  assert.ok(assess(`${ui}\n${print}`, print, print).issues.some(issue => issue.includes("control-to-behavior")));
  const unused = "local function changeSpeed() humanoid.WalkSpeed=25 end";
  assert.ok(assess(`${ui}\n${unused}`, unused, unused).issues.some(issue => issue.includes("control-to-behavior")));
});

test("inline callbacks with real effects satisfy the wiring proof", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  assert.deepEqual(assess(`${ui}\n${control}`, effect, control).issues, []);
});

test("named and shared handlers must be called by the wired callback", () => {
  const effect = "humanoid.WalkSpeed=25";
  const handler = `local function changeSpeed() ${effect} end`;
  const shared = "local function dispatch() changeSpeed() end";
  const control = "button.Activated:Connect(dispatch)";
  assert.deepEqual(assess(`${ui}\n${handler}\n${shared}\n${control}`, effect, control).issues, []);
  const unrelated = 'button.Activated:Connect(function() print("clicked") end)';
  assert.ok(assess(`${ui}\n${handler}\n${unrelated}`, effect, unrelated).issues.length);
});

test("local factories work only when their callback parameter is actually wired", () => {
  const effect = "humanoid.WalkSpeed=25";
  const factory = 'local function makeButton(label, callback) local b=Instance.new("TextButton"); b.Text=label; b.Activated:Connect(callback) end';
  const control = `makeButton("Apply", function() ${effect} end)`;
  assert.deepEqual(assess(`${ui}\n${factory}\n${control}`, effect, control).issues, []);
  const unused = 'local function makeButton(label, callback) local b=Instance.new("TextButton"); b.Text=label end';
  assert.ok(assess(`${ui}\n${unused}\n${control}`, effect, control).issues.length);
});

test("factory callback wrappers must invoke the supplied callback from the event handler", () => {
  const effect = "humanoid.WalkSpeed=25";
  const factory = 'local function makeButton(label, callback) local b=Instance.new("TextButton"); b.Text=label; b.Activated:Connect(function() if b.Interactable then callback() end end) end';
  const control = `makeButton("Apply", function() ${effect} end)`;
  assert.deepEqual(assess(`${ui}\n${factory}\n${control}`, effect, control).issues, []);
  for (const ignored of ['local function unused() callback() end', 'print(callback)']) {
    const unwired = factory.replace("if b.Interactable then callback() end", ignored);
    assert.ok(assess(`${ui}\n${unwired}\n${control}`, effect, control).issues.some(issue => issue.includes("control-to-behavior")));
  }
});

test("Luau type annotations preserve factory callback parameter positions", () => {
  const effect = "humanoid.WalkSpeed=25";
  const factory = 'local function makeButton(label: string, callback: (number, string) -> (), options: {[string]: number}) local b=Instance.new("TextButton"); b.Text=label; b.Activated:Connect(callback) end';
  const control = `makeButton("Apply", function() ${effect} end, {})`;
  assert.deepEqual(assess(`${ui}\n${factory}\n${control}`, effect, control).issues, []);
  assert.ok(assess(`${ui}\n${factory.replace(":Connect(callback)", ':Connect(function() print("ignored") end)')}\n${control}`, effect, control).issues.length);
});

test("nested unused functions and unrelated initial effects cannot supply callback evidence", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() local function unused() ${effect} end; print("clicked") end)`;
  assert.ok(assess(`${ui}\n${control}`, effect, control).issues.length);
  const print = 'button.Activated:Connect(function() print("clicked") end)';
  assert.ok(assess(`${ui}\n${effect}\n${print}`, effect, print).issues.length);
});

test("event factories using object[event] preserve a real callback-to-effect proof", () => {
  const effect = "humanoid.WalkSpeed=25";
  const factory = 'local function connect(object,event,callback) local connection=object[event]:Connect(callback) return connection end';
  const control = `connect(button,"Activated",function() ${effect} end)`;
  assert.deepEqual(assess(`${ui}\n${factory}\n${control}`, effect, control).issues, []);
  assert.ok(assess(`${ui}\n${factory.replace(":Connect(callback)", ":Connect(function() print(\"ignored\") end)")}\n${control}`, effect, control).issues.length);
});

test("event registration inside an unused setup function must not claim a working control", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  const script = `${ui}\nlocal function setup() ${control} end`;
  assert.ok(assess(script, effect, control).issues.length);
  assert.deepEqual(assess(`${script}\nsetup()`, effect, control).issues, []);
});

test("comment-only and string-contained fake source proof is rejected", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = 'button.Activated:Connect(function() print("clicked") end)';
  const script = `${ui}\nlocal fake=[[${effect}]]\n${control}`;
  assert.ok(assess(script, effect, control).issues.some(issue => issue.includes("evidence missing")));
  assert.ok(assess(script, `-- fabricated ${effect}`, control).issues.some(issue => issue.includes("evidence missing")));
});

test("long Lua strings retain comment markers while actual comments are removed", () => {
  const script = 'local a=[=[-- literal comment marker]=]\n-- actual comment\nlocal b="-- also literal"';
  const cleaned = withoutComments(script);
  assert.ok(cleaned.includes("[=[-- literal comment marker]=]"));
  assert.ok(cleaned.includes('"-- also literal"'));
  assert.ok(!cleaned.includes("actual comment"));
});

test("static UI requirements may use applied UI proof without callbacks", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }], ui: { instructions: "create screen", requiredText: [] } };
  assert.deepEqual(assess(ui, ui, "", staticContract).issues, []);
});

test("observed wrong-case UI properties reject an otherwise accepted model review", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  const wrong = `${ui}\nlocal closeButton=Instance.new("TextButton")\ncloseButton.backgroundColor3=Color3.fromRGB(85,221,255)\ncloseButton.Parent=gui`;
  assert.ok(assess(wrong, ui, "", staticContract).issues.some(issue => issue.includes("backgroundColor3 must be BackgroundColor3")));
  assert.deepEqual(assess(wrong.replace(".backgroundColor3", ".BackgroundColor3"), ui, "", staticContract).issues, []);
});

test("UI casing guard ignores comments, strings and ordinary state-table fields", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  const script = `${ui}\nlocal state={backgroundColor3="navy"}\nstate.backgroundColor3="cyan"\nlocal example="gui.backgroundColor3=wrong"\n-- gui.backgroundColor3=wrong`;
  assert.deepEqual(assess(script, ui, "", staticContract).issues, []);
});

test("Frame click handlers and Button.Enabled cannot pass a model's claimed UI review", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  for (const wrong of ['local toggle=Instance.new("Frame")\ntoggle.MouseButton1Click:Connect(function() gui:Destroy() end)', 'local button=Instance.new("TextButton")\nbutton.Enabled=false']) assert.ok(assess(`${ui}\n${wrong}`, ui, "", staticContract).issues.some(issue => issue.includes("Roblox API:")));
});

test("Destroy is a method while Destroying is the instance lifecycle event", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  assert.ok(assess(`${ui}\ngui.Destroy:Connect(function() print("closed") end)`, ui, "", staticContract).issues.some(issue => issue.includes("Instance.Destroy is a method")));
  assert.deepEqual(assess(`${ui}\ngui.Destroying:Connect(function() print("closed") end)`, ui, "", staticContract).issues, []);
});

test("immediate module calls cannot use a later unhoisted local function declaration", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  const declaration = "local function makeDraggable(panel,header) panel.Active=true end";
  const call = "makeDraggable(panel,header)";
  assert.ok(assess(`${ui}\n${call}\n${declaration}`, ui, "", staticContract).issues.some(issue => issue.includes("called before its local function declaration")));
  assert.deepEqual(assess(`${ui}\n${declaration}\n${call}`, ui, "", staticContract).issues, []);
  const deferred = `${ui}\nlocal makeDraggable\nlocal function setup() ${call} end\nmakeDraggable=function(panel,header) panel.Active=true end\nsetup()`;
  assert.deepEqual(assess(deferred, ui, "", staticContract).issues, []);
  const callback = `${ui}\nlocal makeDraggable\nbutton.Activated:Connect(function() ${call} end)\nmakeDraggable=function(panel,header) panel.Active=true end`;
  assert.deepEqual(assess(callback, ui, "", staticContract).issues, []);
});

test("mouse drag cannot compare movement against only the initial MouseButton1 input", () => {
  const staticContract: GenerationContract = { ...contract, features: [{ ...contract.features[0], interaction: false }] };
  const drag = `local UIS=game:GetService("UserInputService")
local dragInput, dragging
local function update(input) panel.Position=UDim2.fromOffset(input.Position.X,input.Position.Y) end
header.InputBegan:Connect(function(input) if input.UserInputType==Enum.UserInputType.MouseButton1 then dragging=true; dragInput=input end end)
local movement=UIS.InputChanged:Connect(function(input) if input==dragInput and dragging then update(input) end end)`;
  assert.ok(assess(`${ui}\n${drag}`, ui, "", staticContract).issues.some(issue => issue.includes("dragging: MouseButton1")));
  const trackedMovement = `${drag}\nheader.InputChanged:Connect(function(input) if input.UserInputType==Enum.UserInputType.MouseMovement then dragInput=input end end)`;
  assert.deepEqual(assess(`${ui}\n${trackedMovement}`, ui, "", staticContract).issues, []);
  const typeCheckedMovement = drag.replace("input==dragInput and dragging", "dragging and input.UserInputType==Enum.UserInputType.MouseMovement");
  assert.deepEqual(assess(`${ui}\n${typeCheckedMovement}`, ui, "", staticContract).issues, []);
});

test("cleanup rejects bare global input subscriptions while preserving captured connection forms", () => {
  const staticContract: GenerationContract = { ...contract, fullHub: true, features: [{ ...contract.features[0], interaction: false }] };
  const service = 'local UIS=game:GetService("UserInputService")';
  const subscription = "UIS.InputChanged:Connect(function(input) panel.Position=UDim2.fromOffset(input.Position.X,input.Position.Y) end)";
  assert.ok(assess(`${ui}\n${service}\n${subscription}`, ui, "", staticContract).issues.some(issue => issue.includes("not retained for disconnection")));
  for (const captured of [`local connection=${subscription}`, `connections[#connections+1]=${subscription}`, `table.insert(connections,${subscription})`, `track(${subscription})`]) assert.deepEqual(assess(`${ui}\n${service}\n${captured}`, ui, "", staticContract).issues, []);
  assert.deepEqual(assess(`${ui}\nlocal text=${JSON.stringify(subscription)}`, ui, "", staticContract).issues, []);
});

test("required UI text in a comment is not evidence and avoided colors are not requirements", () => {
  const required = { ...contract, features: [{ ...contract.features[0], interaction: false }], ui: { instructions: "screen", requiredText: ["Exact Title"] } };
  assert.ok(assess(`${ui}\n-- Exact Title`, ui, "", required).issues.some(issue => issue.includes("required UI text")));
  assert.deepEqual(requestedColorIssues("Avoid #000000; use Color3.fromRGB(18,24,42)", "local color=Color3.fromRGB(18,24,42)"), []);
});

test("unavailable controls must show disabled state and a visible missing-evidence explanation", () => {
  const needed = { ...contract, features: [{ ...contract.features[0], availability: "needs-runtime" as const }] };
  const evaluate = (script: string, control: string) => assessContract(needed, JSON.stringify({ missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ui] }, features: [{ id: "speed", status: "unavailable", reason: "Missing runtime evidence", behaviorEvidence: "", controlEvidence: control }] }), script, "Create feature");
  assert.ok(evaluate(ui, ui).issues.length);
  const disabled = 'button.Interactable=false; button.Text="Needs game profile"';
  assert.deepEqual(evaluate(`${ui}\n${disabled}`, disabled).issues, []);
});

test("French unavailable controls preserve the requested UI language", () => {
  const needed = { ...contract, features: [{ ...contract.features[0], availability: "needs-runtime" as const }] };
  const evaluate = (control: string) => assessContract(needed, JSON.stringify({ missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ui] }, features: [{ id: "speed", status: "unavailable", reason: "Profil du jeu manquant", behaviorEvidence: "", controlEvidence: control }] }), `${ui}\n${control}`, "Interface en français");
  for (const text of ["Profil du jeu requis", "Indisponible : preuves d'exécution manquantes", "Nécessite un profil du jeu", "Fonction non prise en charge"]) {
    const control = `button.Interactable=false; button.Text=${JSON.stringify(text)}`;
    assert.deepEqual(evaluate(control).issues, []);
  }
  assert.ok(evaluate('button.Interactable=false; button.Text="Prêt"').issues.length);
  assert.ok(evaluate('button.Interactable=true; button.Text="Profil du jeu requis"').issues.length);
});
