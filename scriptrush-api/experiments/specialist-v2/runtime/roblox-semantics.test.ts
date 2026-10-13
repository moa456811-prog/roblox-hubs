import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows } from "../dataset/fixtures.ts";
import { runRuntime } from "./run.ts";

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../test-results/specialist-v2/runtime-semantics-selftest");
const row=buildRows().dev[11];
const evidence=JSON.parse(row.messages.find(message=>message.role==="user")!.content).gameEvidence;
const landmark=evidence.objects.find((object:{className:string})=>object.className==="Part").path.split(".")[1] as string;
const credits=evidence.attributes[0].name as string;

function withCode(feature:string,code:string,tag:string) {
  const candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes(feature));
  assert.ok(item && "code" in item && "action" in item);
  item.action="custom";item.code=code;
  return runRuntime(row,candidate,{directory,tag});
}

test("game service child aliases read current evidenced player attributes on each click",()=>{
  const result=withCode("read-coins",`local player=game.Players.LocalPlayer; ctx.notify("Coins: "..tostring(player:GetAttribute("${credits}")))`,"game-players-attribute");
  assert.equal(result.passed,true,JSON.stringify(result.failures));
  assert.equal(result.runtimeErrors.length,0);
  assert.ok(result.checks.some(check=>check.name==="read-coins reads live value on each click" && check.passed));
});

test("workspace dot or string child indexing and CFrame.new position,target track a moving landmark",()=>{
  for (const [tag,target] of [["workspace-dot",`workspace.${landmark}`],["workspace-index",`workspace["${landmark}"]`],["game-workspace-dot",`game.Workspace.${landmark}`]]) {
    const result=withCode("focus-landmark",`local camera=workspace.CurrentCamera; local target=${target}; camera.CFrame=CFrame.new(camera.CFrame.Position,target.Position)`,tag);
    assert.equal(result.passed,true,JSON.stringify(result.failures));
    assert.equal(result.runtimeErrors.length,0);
    assert.ok(result.checks.some(check=>check.name==="focus-landmark uses current moved landmark and camera origin" && check.passed));
  }
});

test("translation-only CFrame constructors preserve position and default negative-Z orientation",()=>{
  const result=withCode("camera-fov",`local translated=CFrame.new(9,13,-7); assert((translated.Position-Vector3.new(9,13,-7)).Magnitude<0.0001); assert((translated.LookVector-Vector3.new(0,0,-1)).Magnitude<0.0001); local vectorForm=CFrame.new(Vector3.new(-2,4,6)); assert((vectorForm.Position-Vector3.new(-2,4,6)).Magnitude<0.0001); assert((vectorForm.LookVector-Vector3.new(0,0,-1)).Magnitude<0.0001); assert(CFrame.new().Position.Magnitude<0.0001); workspace.CurrentCamera.FieldOfView=ctx.value`,"cframe-translation");
  assert.equal(result.passed,true,JSON.stringify(result.failures));
});

test("missing child remains an error and wrong target still fails the observed camera effect",()=>{
  const missing=withCode("focus-landmark",'local target=workspace.NoSuchLandmark; workspace.CurrentCamera.CFrame=CFrame.new(workspace.CurrentCamera.CFrame.Position,target.Position)',"missing-landmark-index");
  assert.equal(missing.passed,false);
  assert.ok(missing.runtimeErrors.some(error=>error.includes("NoSuchLandmark is not a valid member")));
  const wrong=withCode("focus-landmark",'local camera=workspace.CurrentCamera; camera.CFrame=CFrame.new(camera.CFrame.Position,Vector3.new(1,2,3))',"wrong-target-overload");
  assert.equal(wrong.passed,false);
  assert.ok(wrong.failures.includes("focus-landmark preserves camera position and aims at evidence"));
  assert.ok(wrong.failures.includes("focus-landmark uses current moved landmark and camera origin"));
});

test("service aliases never fabricate attribute Value children or inaccessible services",()=>{
  const wrongCurrency=withCode("read-coins",`ctx.notify("Coins: "..tostring(game.Players.LocalPlayer.${credits}.Value))`,"attribute-is-not-value-child");
  assert.equal(wrongCurrency.passed,false);
  assert.ok(wrongCurrency.runtimeErrors.some(error=>error.includes(`${credits} is not a valid member of Player`)));
  const unknownService=withCode("read-coins",'ctx.notify(tostring(game.NonexistentService))',"missing-service-alias");
  assert.equal(unknownService.passed,false);
  assert.ok(unknownService.runtimeErrors.some(error=>error.includes("Service is outside the permitted isolated UI QA API set")));
});

test("workspace child indexing retains missing-private-field and raw-iteration restrictions",()=>{
  const result=withCode("focus-landmark",'ctx.notify(tostring(workspace.__bindings))',"private-workspace-index");
  assert.equal(result.passed,false);
  assert.ok(result.runtimeErrors.some(error=>error.includes("Private mock fields are unavailable")));
  for (const code of ['for key,value in pairs(workspace) do ctx.notify(key) end','local clone=table.clone(workspace)']) {
    const iteration=withCode("focus-landmark",code,`workspace-private-iteration-${code.length}`);
    assert.equal(iteration.passed,false);
    assert.ok(iteration.runtimeErrors.some(error=>error.includes("Raw iteration/mutation of mock Instances is unavailable")));
  }
});
