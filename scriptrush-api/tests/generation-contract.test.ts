import assert from "node:assert/strict";
import test from "node:test";
import { assessContract, buildSourceCatalog, formatSourceCatalog, generationResponseFormat, GENERATOR_SYSTEM, parseContract, PLANNER_SYSTEM, REVIEW_SYSTEM, requestedColorIssues, withoutComments, type GenerationContract } from "../src/lib/generation-contract.ts";

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

test("planner-shaped feature objects cannot masquerade as independently accepted reviews", () => {
  const control = "button.Activated:Connect(function() humanoid.WalkSpeed=25 end)";
  const raw = JSON.stringify({ missingRequirements: [], scopeIssues: [], ui: { passed: true, issues: [], evidence: [ui] }, features: [{ id: "speed", behavior: "implemented", reason: "", behaviorEvidence: "humanoid.WalkSpeed=25", controlEvidence: control }] });
  assert.throws(() => assessContract(contract, raw, `${ui}\n${control}`, "Apply requested behavior"));
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

function referencedReview(script: string, behavior: string, control: string) {
  const catalog = buildSourceCatalog(script);
  const ref = (code: string, kind?: string) => {
    const entry = catalog.find(item => item.code.includes(code) && (!kind || item.kind === kind)) || catalog.find(item => item.code.includes(code));
    assert.ok(entry, `source catalog contains ${kind || "source"} ${code}`);
    return entry.id;
  };
  return {
    missingRequirements: [] as string[], scopeIssues: [] as string[],
    ui: { passed: true, issues: [] as string[], evidence: [ref(ui)] },
    features: [{ id: "speed", status: "implemented", reason: "", behaviorEvidence: ref(behavior, "effect"), controlEvidence: ref(control, "control") }],
  };
}

test("source catalog ids deterministically resolve complete control registrations and real effects", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  const script = `${ui}\n${control}`;
  const first = buildSourceCatalog(script);
  assert.deepEqual(first, buildSourceCatalog(script));
  assert.ok(first.every(entry => script.includes(entry.code) && /^SRC_[a-f0-9]{8}_\d{3}$/.test(entry.id)));
  assert.ok(first.some(entry => entry.kind === "control" && entry.code === control));
  assert.ok(formatSourceCatalog(script).includes(first[0].id));
  const result = assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Apply requested behavior");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.evidenceIssues, []);
  assert.equal(result.reviewEvidenceInvalid, false);
});

test("catalog references preserve complete long callbacks without copied-source output limits", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function()\n${"  local state = 1\n".repeat(130)}  ${effect}\nend)`;
  const script = `${ui}\n${control}`;
  assert.ok(control.length > 1800);
  const result = assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Apply requested behavior");
  assert.deepEqual(result.issues, []);
});

test("catalog wiring proof follows an owned signal factory and named theme handler", () => {
  const effect = "panel.BackgroundColor3=Color3.fromRGB(18,24,42)";
  const control = "own(button.Activated, applyTheme)";
  const script = `${ui}\nlocal function own(signal, handler) local connection=signal:Connect(handler); connections[#connections+1]=connection end\nlocal function applyTheme()\n  ${effect}\nend\n${control}`;
  assert.ok(!buildSourceCatalog(script).some(entry => entry.kind === "control" && entry.code === "signal:Connect(handler)"));
  const result = assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Apply requested behavior");
  assert.deepEqual(result.issues, []);
});

test("protected and scheduled callback bodies count only for known unshadowed executing builtins", () => {
  const effect = "TeleportService:Teleport(game.PlaceId, player)";
  for (const builtin of ["pcall", "xpcall", "task.spawn", "task.defer"]) {
    const control = `button.Activated:Connect(function() ${builtin}(function() ${effect} end) end)`;
    const script = `${ui}\n${control}`;
    assert.deepEqual(assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Rejoin on click").issues, []);
  }
  for (const setup of ["local pcall = print", "pcall = print", "local function pcall(callback) print(callback) end", "local task = {}", "task.spawn = print", "function task.spawn(callback) print(callback) end"] ) {
    const builtin = setup.includes("task") ? "task.spawn" : "pcall";
    const control = `button.Activated:Connect(function() ${builtin}(function() ${effect} end) end)`;
    const script = `${ui}\n${setup}\n${control}`;
    assert.ok(assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Rejoin on click").issues.some(issue => issue.includes("control-to-behavior")));
  }
  const control = `button.Activated:Connect(function() ignore(function() ${effect} end) end)`;
  const script = `${ui}\nlocal function ignore(callback) print(callback) end\n${control}`;
  assert.ok(assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Rejoin on click").issues.some(issue => issue.includes("control-to-behavior")));
});

test("unknown, combined and stale source references invalidate review without inventing script defects", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  const script = `${ui}\n${control}`;
  const valid = referencedReview(script, effect, control);
  for (const id of ["SRC_00000000_999", `${valid.features[0].controlEvidence}, ${valid.features[0].behaviorEvidence}`]) {
    const review = structuredClone(valid);
    review.features[0].controlEvidence = id;
    const result = assessContract(contract, JSON.stringify(review), script, "Apply requested behavior");
    assert.equal(result.reviewEvidenceInvalid, true);
    assert.ok(result.evidenceIssues.some(issue => issue.includes("unknown source evidence reference")));
    assert.ok(result.issues.length);
  }
  const changed = `${script}\n-- a different generated version`;
  const stale = assessContract(contract, JSON.stringify(valid), changed, "Apply requested behavior");
  assert.ok(stale.evidenceIssues.some(issue => issue.includes("unknown source evidence reference")));
});

test("catalog membership never certifies unused effects or disconnected controls", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = 'button.Activated:Connect(function() print("clicked") end)';
  const script = `${ui}\nlocal function unused()\n  ${effect}\nend\n${control}`;
  const result = assessContract(contract, JSON.stringify(referencedReview(script, effect, control)), script, "Apply requested behavior");
  assert.ok(result.issues.some(issue => issue.includes("control-to-behavior")));
  assert.equal(result.reviewEvidenceInvalid, true);
});

test("semantic UI rejection stays distinct from invalid evidence references", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  const script = `${ui}\n${control}`;
  const review = referencedReview(script, effect, control);
  review.ui.passed = false;
  review.ui.issues = ["Requested tabs are absent"];
  const result = assessContract(contract, JSON.stringify(review), script, "Apply requested behavior");
  assert.equal(result.reviewEvidenceInvalid, false);
  assert.deepEqual(result.evidenceIssues, []);
  assert.ok(result.issues.includes("Requested tabs are absent"));
  assert.ok(result.issues.includes("requested UI design was not satisfied"));
});

test("missing review coverage is invalid evidence while missing implementation is a semantic rejection", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() ${effect} end)`;
  const script = `${ui}\n${control}`;
  const omitted = referencedReview(script, effect, control);
  omitted.features = [];
  assert.equal(assessContract(contract, JSON.stringify(omitted), script, "Apply requested behavior").reviewEvidenceInvalid, true);
  const missing = referencedReview(script, effect, control);
  missing.features[0].status = "missing";
  missing.features[0].reason = "Apply does not set WalkSpeed";
  const rejected = assessContract(contract, JSON.stringify(missing), script, "Apply requested behavior");
  assert.equal(rejected.reviewEvidenceInvalid, false);
  assert.ok(rejected.issues.some(issue => issue.includes("does not set WalkSpeed")));
});

test("honest unsupported systems count toward a full hub contract without being fabricated as supported", () => {
  const features = ["Auto Farm", "Quest Farm"].map((label, index) => ({ ...contract.features[0], id: `feature-${index}`, label, availability: "needs-runtime", evidence: "Runtime paths and remote payloads are absent" }));
  const parsed = parseContract(JSON.stringify({ features, ui: contract.ui }), "Generate a full hub", ["auto-farm", "quest-farm"]);
  assert.equal(parsed.features.length, 2);
  assert.ok(parsed.features.every(feature => feature.availability === "needs-runtime"));
  assert.throws(() => parseContract(JSON.stringify({ features: features.slice(0, 1), ui: contract.ui }), "Generate a full hub", ["auto-farm", "quest-farm"]), /INCOMPLETE_REQUIREMENTS/);
});
