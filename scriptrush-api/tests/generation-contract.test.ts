import assert from "node:assert/strict";
import test from "node:test";
import { assessContract, requestedColorIssues, withoutComments, type GenerationContract } from "../src/lib/generation-contract.ts";

const contract: GenerationContract = {
  features: [{ id: "speed", label: "Walk Speed", behavior: "Apply the requested WalkSpeed on click", availability: "supported", evidence: "standard client API", interaction: true }],
  ui: { instructions: "local screen UI", requiredText: [] }, fullHub: false,
};
const ui = 'local gui=Instance.new("ScreenGui")';
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

test("nested unused functions and unrelated initial effects cannot supply callback evidence", () => {
  const effect = "humanoid.WalkSpeed=25";
  const control = `button.Activated:Connect(function() local function unused() ${effect} end; print("clicked") end)`;
  assert.ok(assess(`${ui}\n${control}`, effect, control).issues.length);
  const print = 'button.Activated:Connect(function() print("clicked") end)';
  assert.ok(assess(`${ui}\n${effect}\n${print}`, effect, print).issues.length);
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
