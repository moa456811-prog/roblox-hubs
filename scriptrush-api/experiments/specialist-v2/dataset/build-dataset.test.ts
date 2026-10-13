import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRows as buildV1Rows } from "../../specialist/dataset/fixtures.ts";
import { buildDataset, validateRows } from "./build-dataset.ts";
import { buildRows, FORMAT_EXAMPLE, SPECIALIST_SYSTEM, SPLITS } from "./fixtures.ts";

test("all v2 targets pass actual schema, coverage, English UI, renderer and safety review",()=>{
  const report=validateRows(buildRows());
  assert.deepEqual(report.sizes,{train:256,validation:24,dev:24,test:24});
  assert.equal(report.uniquePrompts,328);
  assert.equal(report.uniqueAnswers,328);
  assert.equal(report.smallestControls,6);
  assert.ok(report.largestCharacters<18500);
});

test("system shows populated output values and never a held-out fixture answer",()=>{
  assert.equal(FORMAT_EXAMPLE.pages.flatMap(page=>page.items).length,6);
  assert.ok(FORMAT_EXAMPLE.pages.every(page=>page.items.length>0));
  assert.ok(SPECIALIST_SYSTEM.includes(JSON.stringify(FORMAT_EXAMPLE)));
  for (const split of SPLITS) for (const row of buildRows()[split]) {
    const prompt=JSON.parse(row.messages[1].content);
    assert.ok(!SPECIALIST_SYSTEM.includes(prompt.gameEvidence.game));
    assert.ok(!SPECIALIST_SYSTEM.includes(row.messages[2].content));
    assert.ok(prompt.requestedControls.every((control:Record<string,unknown>)=>!Object.hasOwn(control,"action")&&!Object.hasOwn(control,"code")));
  }
});

test("each action family includes both languages, unnamed and custom hubs; none is fixed to one request variant",()=>{
  for (const split of SPLITS) {
    const families=new Map<string,Set<string>>();
    for (const row of buildRows()[split]) {
      const prompt=JSON.parse(row.messages[1].content),language=prompt.request.startsWith("Crée")?"fr":"en",naming=row.expected.ui.title?"named":"unnamed";
      const variants=families.get(row.actionFamily)??new Set<string>();
      variants.add(`${language}:${naming}`);families.set(row.actionFamily,variants);
    }
    for (const variants of families.values()) assert.equal(variants.size,4);
  }
});

test("v2 final tests use fresh game object names, designs and combinations relative to v1",()=>{
  const previous=buildV1Rows(),current=buildRows();
  const previousRows=Object.values(previous).flat(),oldDesigns=new Set(previousRows.map(row=>row.designFamily));
  const oldTokens=new Set(previousRows.flatMap(row=>{
    const evidence=JSON.parse(row.messages[1].content).gameEvidence;
    return [...evidence.objects.map((object:{path:string})=>object.path),...evidence.attributes.map((attribute:{name:string})=>attribute.name)];
  }).filter(value=>value!=="workspace.CurrentCamera"&&value!=="Lighting"));
  const previousTests=new Set(previous.test.map(row=>row.expected.composition.pages.flatMap(page=>page.items).flatMap(item=>item.featureIds).sort().join(",")));
  for (const row of current.test) {
    assert.ok(!oldDesigns.has(row.designFamily));
    const evidence=JSON.parse(row.messages[1].content).gameEvidence;
    for (const object of evidence.objects) if (!["workspace.CurrentCamera","Lighting"].includes(object.path)) assert.ok(!oldTokens.has(object.path));
    for (const attribute of evidence.attributes) assert.ok(!oldTokens.has(attribute.name));
    assert.ok(!previousTests.has(row.expected.composition.pages.flatMap(page=>page.items).flatMap(item=>item.featureIds).sort().join(",")));
  }
});

test("guard rejects design leakage, missing functionality, unsupported paths and hidden control-value differences",()=>{
  const leakage=buildRows();leakage.test[0].designFamily=leakage.train[0].designFamily;
  assert.throws(()=>validateRows(leakage),/Design leakage/);
  const missing=buildRows(),row=missing.dev[0];
  row.expected.composition.pages[0].items=[];row.messages[2].content=JSON.stringify(row.expected.composition);
  assert.throws(()=>validateRows(missing),/Coverage failed/);
  const paths=buildRows(),pathRow=paths.test[0],item=pathRow.expected.composition.pages.flatMap(page=>page.items).find(item=>"action" in item&&item.action==="custom"&&item.code.includes("FindFirstChild"));
  assert.ok(item&&"code" in item);
  item.code=item.code.replace(/FindFirstChild\("[^"]+"\)/,'FindFirstChild("InventedObject")');pathRow.messages[2].content=JSON.stringify(pathRow.expected.composition);
  assert.throws(()=>validateRows(paths),/Unevidenced path/);
  const values=buildRows(),valuesRow=values.test[0],prompt=JSON.parse(valuesRow.messages[1].content);
  prompt.requestedControls[0].initial=999;valuesRow.messages[1].content=JSON.stringify(prompt);
  assert.throws(()=>validateRows(values),/Requested control values differ/);
});

test("manifest records separate development and final-test policies and reproducible files",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"scriptrush-specialist-v2-dataset-"));
  const receipt=await buildDataset(directory),manifest=JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8"));
  assert.equal(manifest.formatVersion,2);
  assert.match(manifest.splitPolicy.dev,/Never train/);
  assert.match(manifest.splitPolicy.test,/Never upload answers/);
  assert.deepEqual(manifest.trainingColumns,["messages"]);
  assert.deepEqual(manifest.evaluationOnlyColumns,["expected"]);
  assert.equal(receipt.manifestSha256.length,64);
  for (const split of SPLITS) {
    const contents=await readFile(path.join(directory,`${split}.jsonl`),"utf8");
    assert.equal(contents.trim().split("\n").length,manifest.files[split].rows);
    assert.equal(manifest.files[split].sha256.length,64);
  }
});
