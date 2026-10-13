import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows } from "../../specialist/dataset/fixtures.ts";
import { buildRows as buildV2Rows } from "../dataset/fixtures.ts";
import { runRuntime } from "./run.ts";

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../test-results/specialist-v2/runtime-selftest");
const rows=buildRows().test;
test("original reference compositions execute every fixture action across all held-out families",()=>{
  for (const [index,row] of rows.slice(0,6).entries()) {
    const result=runRuntime(row,row.expected.composition,{directory,tag:`reference-${index}`});
    assert.equal(result.passed,true,JSON.stringify(result.failures));
    assert.ok(result.checks.length>75);
  }
});
test("compact v2 evidence and complete 6-to-11-control references execute on new fictional objects",()=>{
  const v2=buildV2Rows();
  for (const split of ["train","validation","dev","test"] as const) for (const [index,row] of v2[split].slice(0,6).entries()) {
    const result=runRuntime(row,row.expected.composition,{directory,tag:`v2-${split}-${index}`});
    assert.equal(result.passed,true,`${row.id}: ${JSON.stringify(result.failures)}`);
  }
});
test("a no-op custom callback cannot pass merely by declaring the correct feature ID",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
  assert.ok(item && "code" in item);
  item.code='ctx.notify("Done")';
  const result=runRuntime(row,candidate,{directory,tag:"noop-camera"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.some(failure=>failure.includes("camera-fov changes current target property")));
});
test("behaviorally equivalent callback syntax passes without comparing source text",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
  assert.ok(item && "code" in item);
  item.code='local view = workspace.CurrentCamera; if view then view.FieldOfView=ctx.value else ctx.notify("Camera is unavailable.") end';
  const result=runRuntime(row,candidate,{directory,tag:"equivalent-camera"});
  assert.equal(result.passed,true,JSON.stringify(result.failures));
});
test("empty pages fail functional coverage even though the composition schema accepts them",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  for (const page of candidate.pages) page.items=[];
  const result=runRuntime(row,candidate,{directory,tag:"empty-pages"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.some(failure=>failure.includes("exactly one independent control")));
});
test("wrong window dimensions and colors fail actual rendered UI checks",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  candidate.window.width+=30;
  candidate.window.palette.background=[0,0,0];
  const result=runRuntime(row,candidate,{directory,tag:"wrong-ui"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("requested exact window dimensions"));
  assert.ok(result.failures.includes("requested exact background"));
});
test("candidate filesystem and networking APIs are absent from the closed sandbox",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
  assert.ok(item && "code" in item);
  item.code='require("fs")';
  const result=runRuntime(row,candidate,{directory,tag:"no-host-api"});
  assert.equal(result.passed,false);
  assert.ok(result.runtimeErrors.some(error=>error.includes("Global is unavailable") && error.includes("require")));
});
test("candidate cannot obtain private mock tables by iterating or cloning instances",()=>{
  for (const code of ['local copy=table.clone(ctx.player)','for key,value in pairs(ctx.player) do ctx.notify(key) end','for key,value in ctx.player do ctx.notify(key) end']) {
    const row=rows[0], candidate=structuredClone(row.expected.composition);
    const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
    assert.ok(item && "code" in item);item.code=code;
    const result=runRuntime(row,candidate,{directory,tag:`no-private-tables-${code.length}`});
    assert.equal(result.passed,false);
    assert.ok(result.runtimeErrors.some(error=>error.includes("Raw iteration/mutation")));
  }
});
test("a camera callback using stale landmark coordinates fails after the landmark moves",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("focus-landmark"));
  assert.ok(item && "code" in item);
  item.code='local camera=workspace.CurrentCamera; camera.CFrame=CFrame.lookAt(camera.CFrame.Position,Vector3.new(31,8,-19))';
  const result=runRuntime(row,candidate,{directory,tag:"stale-landmark"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("focus-landmark uses current moved landmark and camera origin"));
});
test("restoring a fixed training brightness fails against changed current fixture state",()=>{
  const row=rows[1], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("night-vision"));
  assert.ok(item && "code" in item);
  item.code='local lighting=ctx.services.Lighting; if not ctx.state.cleanup then ctx.state.cleanup=true; ctx.onCleanup(function() lighting.Brightness=1.5 end) end; lighting.Brightness=ctx.enabled and 3 or 1.5';
  const result=runRuntime(row,candidate,{directory,tag:"stale-brightness"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("night-vision restores actual varied original brightness when off"));
  assert.ok(result.failures.includes("close restores actual varied original brightness"));
});
test("a callback caching the first Humanoid fails after character replacement",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("walk-speed"));
  assert.ok(item && "action" in item && "code" in item);
  item.action="custom";
  item.code='ctx.state.humanoid=ctx.state.humanoid or ctx.player.Character:FindFirstChildOfClass("Humanoid"); ctx.state.humanoid.WalkSpeed=ctx.value';
  const result=runRuntime(row,candidate,{directory,tag:"stale-humanoid"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("walk-speed updates the current respawned Humanoid"));
  assert.ok(result.runtimeErrors.some(error=>error.includes("destroyed instance")));
});
test("a currency callback caching the first value fails the subsequent current-value check",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("read-coins"));
  assert.ok(item && "code" in item);
  item.code='ctx.notify("Coins: 137")';
  const result=runRuntime(row,candidate,{directory,tag:"stale-coins"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("read-coins reads live value on each click"));
});
test("separately compiled candidates cannot read or modify host expected answers and assertions",()=>{
  for (const [name,code] of [
    ["expected",'ctx.notify(tostring(__expected.window.width))'],
    ["bindings",'__bindings["camera-fov"]=nil'],
    ["checks",'table.clear(__checks)'],
    ["instances",'table.clear(__allInstances)'],
    ["compiler",'loadstring("return 1")()'],
  ]) {
    const row=rows[0], candidate=structuredClone(row.expected.composition);
    const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
    assert.ok(item && "code" in item);item.code=code;
    const result=runRuntime(row,candidate,{directory,tag:`closed-host-${name}`});
    assert.equal(result.passed,false);
    assert.ok(result.runtimeErrors.some(error=>error.includes("Global is unavailable") && error.includes(name === "compiler" ? "loadstring" : `__${name === "expected" ? "expected" : name === "bindings" ? "bindings" : name === "checks" ? "checks" : "allInstances"}`)),JSON.stringify(result.runtimeErrors));
  }
});
test("callback syntax cannot escape a lexical wrapper into the host harness",()=>{
  const row=rows[0], candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
  assert.ok(item && "code" in item);
  // This attempts to close the rendered handler and an outer candidate
  // function, change the host expected answer, then absorb the remaining body.
  // There is no outer candidate function in the independently compiled chunk.
  item.code='end)\nend\n__expected.window.width=1\nlocal function __escaped_candidate()\npcall(function()';
  const result=runRuntime(row,candidate,{directory,tag:"reject-wrapper-escape"});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("Candidate source failed to compile in isolated chunk"));
});
