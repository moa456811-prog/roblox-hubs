import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contractSchema } from "../../../src/lib/generation-contract.ts";
import { renderHubComposition } from "../../../src/lib/hub-composer.ts";
import { parseHubComposition, validateCompositionCoverage } from "../../../src/lib/hub-spec.ts";
import { reviewScript } from "../../../src/lib/script-output.ts";
import { englishUiIssues } from "../../../src/lib/ui-language.ts";
import { buildRows, FORMAT_EXAMPLE, SPECIALIST_SYSTEM, SPLITS, SPLIT_COUNTS, type DatasetRow, type Split } from "./fixtures.ts";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const percentile = (values: number[],p:number) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(p*(values.length-1)))];

/** Reject malformed targets, leakage and missing functional controls before any training upload. */
export function validateRows(rows: Record<Split,DatasetRow[]>) {
  const seenIds=new Set<string>(),seenPrompts=new Set<string>(),seenAnswers=new Set<string>();
  const seenDesigns=new Set<string>(),seenFamilies=new Set<string>(),seenCombinations=new Set<string>();
  const summary: Record<string,unknown>={};
  let smallestControls=Infinity,largestCharacters=0;
  assert.deepEqual(parseHubComposition(JSON.stringify(FORMAT_EXAMPLE)),FORMAT_EXAMPLE);
  assert.ok(FORMAT_EXAMPLE.pages.every(page=>page.items.length>0));
  assert.ok(FORMAT_EXAMPLE.pages.flatMap(page=>page.items).length>=6);
  for (const split of SPLITS) {
    assert.equal(rows[split].length,SPLIT_COUNTS[split],`Unexpected ${split} count`);
    const designs=new Set<string>(),families=new Set<string>(),combinations=new Set<string>();
    const language={fr:0,en:0},names={unnamed:0,custom:0};
    const sizes: Array<{user:number;assistant:number;total:number}>=[];
    const perFamily=new Map<string,{fr:number;en:number;unnamed:number;custom:number}>();
    for (const row of rows[split]) {
      assert.equal(row.split,split);
      assert.ok(!seenIds.has(row.id),`Duplicate id ${row.id}`);seenIds.add(row.id);
      assert.deepEqual(row.messages.map(message=>message.role),["system","user","assistant"]);
      assert.equal(row.messages[0].content,SPECIALIST_SYSTEM);
      const prompt=JSON.parse(row.messages[1].content);
      assert.ok(prompt.request.includes("Full Hub"));
      assert.equal(prompt.gameEvidence.scope,"Original owned-game fixture for offline training; not evidence from a live Roblox game.");
      assert.ok(!Object.hasOwn(prompt,"expected"));
      assert.ok(!Object.hasOwn(prompt,"window")&&!Object.hasOwn(prompt,"pages"));
      assert.ok(!Object.hasOwn(prompt.requestedUi,"items"));
      assert.ok(prompt.requestedControls.every((control:Record<string,unknown>)=>!Object.hasOwn(control,"code")&&!Object.hasOwn(control,"action")));
      assert.ok(!row.messages[0].content.includes(prompt.gameEvidence.game));
      const promptHash=sha256(row.messages[1].content),answerHash=sha256(row.messages[2].content);
      assert.ok(!seenPrompts.has(promptHash),"Duplicate prompt across splits");seenPrompts.add(promptHash);
      assert.ok(!seenAnswers.has(answerHash),"Duplicate answer across splits");seenAnswers.add(answerHash);
      const composition=parseHubComposition(row.messages[2].content);
      const contract={...contractSchema.parse(row.expected.contract),fullHub:true};
      assert.deepEqual(composition,row.expected.composition);
      assert.deepEqual(validateCompositionCoverage(composition,contract),[],`Coverage failed for ${row.id}`);
      assert.deepEqual(englishUiIssues(composition),[],`English UI failed for ${row.id}`);
      const controls=composition.pages.flatMap(page=>page.items);
      assert.ok(controls.length>=6&&controls.length<=11&&composition.pages.length>=3,`Not a Full Hub: ${row.id}`);
      assert.ok(composition.pages.every(page=>page.items.length>0),`Empty page: ${row.id}`);
      assert.ok(controls.every(item=>item.kind!=="disabled"&&item.kind!=="text"));
      assert.equal(prompt.requestedControls.length,controls.length);
      for (const page of composition.pages) for (const item of page.items) {
        assert.ok(item.kind!=="text"&&item.kind!=="disabled");
        const {id,featureIds:_featureIds,action:_action,code:_code,...control}=item;
        assert.deepEqual(prompt.requestedControls.find((entry:{featureId:string})=>entry.featureId===id),{featureId:id,page:page.label,...control},`Requested control values differ: ${row.id}/${id}`);
      }
      assert.equal(controls.flatMap(item=>item.featureIds).length,new Set(controls.flatMap(item=>item.featureIds)).size);
      assert.deepEqual(prompt.requestedUi.palette,composition.window.palette);
      assert.deepEqual(prompt.requestedUi.alternatePalette,composition.window.alternatePalette);
      assert.equal(prompt.requestedUi.title,composition.window.title);
      const source=renderHubComposition(composition);
      assert.deepEqual(reviewScript(source),[],`Static safety review failed for ${row.id}`);
      assert.ok(source.includes(`panel.Size = UDim2.fromOffset(${composition.window.width}, ${composition.window.height})`));
      assert.doesNotMatch(source,/A7DEV|a7med_o6t|ScriptRush|TODO|loadstring|HttpGet|FireServer|InvokeServer/);
      assert.equal(source.includes('make("TextLabel", "Title", header)'),Boolean(composition.window.title));
      for (const item of controls) if ("action" in item&&item.action==="custom") {
        assert.ok(item.code.trim().length>60);
        assert.doesNotMatch(item.code,/\bprint\s*\(|TODO|while\s+true|WaitForChild/);
        assert.match(item.code,/FieldOfView =|Brightness =|highlight.Parent =|camera.CFrame =|GetAttribute\(|panel.Visible =|hud.Enabled =/);
        for (const [,literal] of item.code.matchAll(/(?:FindFirstChild|GetAttribute)\("([^"]+)"\)/g)) {
          assert.ok(literal==="PlayerGui"||literal==="JournalPanel"||prompt.gameEvidence.objects.some((object:{path:string})=>object.path.split(".").includes(literal))||prompt.gameEvidence.attributes.some((attribute:{name:string})=>attribute.name===literal),`Unevidenced path ${literal}: ${row.id}`);
        }
      }
      const fr=prompt.request.startsWith("Crée"),lang=fr?"fr":"en",name=composition.window.title?"custom":"unnamed";
      language[lang]++;names[name]++;
      const balance=perFamily.get(row.actionFamily)??{fr:0,en:0,unnamed:0,custom:0};balance[lang]++;balance[name]++;perFamily.set(row.actionFamily,balance);
      designs.add(row.designFamily);families.add(row.actionFamily);
      combinations.add(controls.map(item=>item.featureIds[0]).sort().join(","));
      const user=row.messages[1].content.length,assistant=row.messages[2].content.length,total=row.messages.reduce((sum,message)=>sum+message.content.length,0);
      sizes.push({user,assistant,total});largestCharacters=Math.max(largestCharacters,total);smallestControls=Math.min(smallestControls,controls.length);
    }
    assert.equal(language.fr,language.en,`Unbalanced request languages in ${split}`);
    assert.equal(names.unnamed,names.custom,`Unbalanced naming in ${split}`);
    for (const [family,balance] of perFamily) assert.ok(Object.values(balance).every(count=>count>0),`A language/name variant never occurs in ${family}`);
    for (const family of designs) {assert.ok(!seenDesigns.has(family),`Design leakage: ${family}`);seenDesigns.add(family);}
    for (const family of families) {assert.ok(!seenFamilies.has(family),`Action-family leakage: ${family}`);seenFamilies.add(family);}
    for (const combination of combinations) {assert.ok(!seenCombinations.has(combination),`Action-combination leakage: ${combination}`);seenCombinations.add(combination);}
    summary[split]={rows:rows[split].length,language,names,designFamilies:designs.size,actionFamilies:families.size,characters:{userMedian:percentile(sizes.map(size=>size.user),.5),assistantMedian:percentile(sizes.map(size=>size.assistant),.5),totalMedian:percentile(sizes.map(size=>size.total),.5),totalP95:percentile(sizes.map(size=>size.total),.95),totalMax:Math.max(...sizes.map(size=>size.total))},tokenEstimate:{method:"Characters divided by 4, rounded up; not a tokenizer measurement. Actual chat-template tokens must be measured before training.",totalMedian:Math.ceil(percentile(sizes.map(size=>size.total),.5)/4),totalMax:Math.ceil(Math.max(...sizes.map(size=>size.total))/4)}};
  }
  return {sizes:Object.fromEntries(SPLITS.map(split=>[split,rows[split].length])),uniquePrompts:seenPrompts.size,uniqueAnswers:seenAnswers.size,smallestControls,largestCharacters,summary};
}

export async function buildDataset(outputDirectory?:string) {
  const rows=buildRows(),validation=validateRows(rows);
  const output=path.resolve(outputDirectory||fileURLToPath(new URL("../../../test-results/specialist-v2/dataset/",import.meta.url)));
  await mkdir(output,{recursive:true});
  const files: Record<string,unknown>={};
  for (const split of SPLITS) {
    const content=rows[split].map(row=>JSON.stringify(row)).join("\n")+"\n";
    await writeFile(path.join(output,`${split}.jsonl`),content,"utf8");
    files[split]={file:`${split}.jsonl`,sha256:sha256(content),rows:rows[split].length,ids:rows[split].map(row=>row.id),designFamilies:[...new Set(rows[split].map(row=>row.designFamily))],actionFamilies:[...new Set(rows[split].map(row=>row.actionFamily))]};
  }
  const manifest={formatVersion:2,purpose:"Offline ScriptRush composition specialist v2 experiment",provenance:"Original deterministic fictional owned-game fixtures from the existing composition schema and verified renderer; no scraped script, conversation, credential, model-generated answer or third-party code.",trainingColumns:["messages"],evaluationOnlyColumns:["expected"],splitPolicy:{train:"Fit model weights only with these assistant targets.",validation:"Loss diagnostics and checkpoint selection. Never include in optimizer batches.",dev:"Development generation cases for debugging and selecting experiments. Never train on these targets.",test:"Final blind acceptance set, separate games, designs and action combinations. Never upload answers or use results to tune the same final benchmark."},inputPolicy:"requestedUi and requestedControls are explicit user acceptance values. Actions and executable callbacks are absent from requestedControls; infer them from requirements and permitted gameEvidence. SYSTEM contains one fixed out-of-fixture populated format demonstration, shared by every variant.",leakagePolicy:"Distinct full prompt/answer hashes, design families, action families, actual action combinations and fixture object/attribute names across all splits. Primitives intentionally overlap; all 11 operations appear in training. No evaluation identifier, game-specific path or complete evaluation answer appears in SYSTEM.",limitations:["Synthetic client-local effects in fictional owned games, not arbitrary live-game/server automation.","Schema, coverage and source safety validation do not prove real Roblox runtime behavior; the separate runtime harness must execute generated controls.","Character-based token estimates are rough planning values; measure the selected model's tokenizer and never silently truncate an example."],...validation,files};
  const content=JSON.stringify(manifest,null,2)+"\n";
  await writeFile(path.join(output,"manifest.json"),content,"utf8");
  return {output,...validation,manifestSha256:sha256(content)};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await buildDataset(process.argv[2]),null,2));
