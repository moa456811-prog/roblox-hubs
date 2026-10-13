import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionFixtures } from "./fixtures.ts";
import { runProductionRuntime } from "./runtime/run.ts";

const fixtures=buildProductionFixtures();
test("all eight exact production UI profiles execute generated controls and the complete audited controller suite",()=>{
  for(const row of fixtures){
    const result=runProductionRuntime(row,row.expected.composition,{tag:`reference-${row.id}`});
    assert.equal(result.passed,true,`${row.id}: ${JSON.stringify(result.failures)}`);
    assert.ok(result.factory.checks>=126);
    assert.ok(result.checks.length>250);
    assert.equal(result.profile.liveVerified,false);
  }
});
test("a decorative farm callback fails even though the audited controller is valid",()=>{
  const row=fixtures[0],candidate=structuredClone(row.expected.composition);
  const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("auto-farm"));
  assert.ok(item && "code" in item);item.code='ctx.notify("Auto Farm enabled")';
  const result=runProductionRuntime(row,candidate,{tag:"reject-farm-noop"});
  assert.equal(result.factory.passed,true);
  assert.equal(result.passed,false);
  assert.ok(result.failures.some(failure=>failure.includes("auto-farm dispatches ordinary attack input")));
});
test("text feature annotations preserve control mapping while two actual controls remain rejected",()=>{
  const row=fixtures[0],candidate=structuredClone(row.expected.composition);
  const scope=candidate.pages.flatMap(page=>page.items).find(item=>item.kind==="text");
  assert.ok(scope);scope.featureIds.push("auto-farm");
  const annotated=runProductionRuntime(row,candidate,{tag:"accept-scope-feature-annotation"});
  assert.equal(annotated.passed,true,JSON.stringify(annotated.failures));
  const farmPage=candidate.pages.find(page=>page.items.some(item=>item.kind==="toggle" && item.featureIds.includes("auto-farm")));
  assert.ok(farmPage);
  const farm=farmPage.items.find(item=>item.kind==="toggle" && item.featureIds.includes("auto-farm"));
  assert.ok(farm);farmPage.items.push({...structuredClone(farm),id:"duplicate-farm-control"});
  const duplicate=runProductionRuntime(row,candidate,{tag:"reject-two-actual-farm-controls"});
  assert.equal(duplicate.passed,false);
  assert.ok(duplicate.failures.includes("auto-farm has exactly one independent feature control"));
});
test("wrong dispatch and missing independent gameplay controls are rejected",()=>{
  for(const mutation of ["wrong-key","missing-boss"]){
    const row=fixtures[1],candidate=structuredClone(row.expected.composition);
    if(mutation==="wrong-key"){
      const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("auto-farm"));
      assert.ok(item && "code" in item);item.code='ctx.gameplay.setEnabled("boss",ctx.enabled)';
    }else for(const page of candidate.pages)page.items=page.items.filter(item=>!item.featureIds.includes("auto-boss"));
    const result=runProductionRuntime(row,candidate,{tag:`reject-${mutation}`});
    assert.equal(result.passed,false);
  }
});
test("custom UI mismatch and lexical harness access cannot pass",()=>{
  for(const mutation of ["ui","host"]){
    const row=fixtures[2],candidate=structuredClone(row.expected.composition);
    if(mutation==="ui")candidate.window.width+=25;
    else{
      const item=candidate.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("auto-farm"));
      assert.ok(item && "code" in item);item.code='table.clear(__checks)';
    }
    const result=runProductionRuntime(row,candidate,{tag:`reject-${mutation}`});
    assert.equal(result.passed,false);
    if(mutation==="ui")assert.ok(result.failures.includes("exact requested custom window dimensions"));
    else assert.ok(result.runtimeErrors.some(error=>error.includes("Global is unavailable") && error.includes("__checks")));
  }
});
