import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contractSchema } from "../../src/lib/generation-contract.ts";
import { renderHubComposition } from "../../src/lib/hub-composer.ts";
import { parseHubComposition, validateCompositionCoverage } from "../../src/lib/hub-spec.ts";
import { buildRows, type DatasetRow, type Split } from "./dataset/fixtures.ts";

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

/** Fail closed before publishing any example or split. */
export function validateRows(rows: Record<Split,DatasetRow[]>) {
  const seenIds = new Set<string>(), seenPrompts = new Set<string>(), seenAnswers = new Set<string>();
  const designs = new Set<string>(), combinations = new Set<string>();
  const sizes: Record<string,number> = {};
  let largestCharacters = 0, smallestControls = Infinity;
  for (const split of ["train","validation","test"] as const) {
    const splitDesigns = new Set<string>(), splitCombinations = new Set<string>();
    assert.ok(rows[split].length > 0, `Empty ${split} split`);
    for (const row of rows[split]) {
      assert.equal(row.split,split);
      assert.ok(!seenIds.has(row.id), `Duplicate id ${row.id}`); seenIds.add(row.id);
      assert.deepEqual(row.messages.map(message => message.role),["system","user","assistant"]);
      const request = JSON.parse(row.messages[1].content);
      assert.ok(request.request.includes("Full Hub"));
      assert.equal(request.gameEvidence.scope,"Original owned-game fixture for offline training; not evidence from a live Roblox game.");
      const promptHash = sha256(row.messages[1].content), answerHash = sha256(row.messages[2].content);
      assert.ok(!seenPrompts.has(promptHash),"Duplicate prompt across splits"); seenPrompts.add(promptHash);
      assert.ok(!seenAnswers.has(answerHash),"Duplicate answer across splits"); seenAnswers.add(answerHash);
      const composition = parseHubComposition(row.messages[2].content);
      const contract = { ...contractSchema.parse(row.expected.contract),fullHub:true };
      assert.deepEqual(composition,row.expected.composition);
      assert.deepEqual(validateCompositionCoverage(composition,contract),[], `Coverage failed for ${row.id}`);
      const controls = composition.pages.flatMap(page => page.items);
      assert.ok(controls.length >= 6 && composition.pages.length >= 3,`Not a Full Hub: ${row.id}`);
      assert.ok(controls.every(item => item.kind !== "disabled" && item.kind !== "text"));
      assert.ok(controls.every(item => !row.expected.contract.features.some(feature => feature.id === item.id && feature.availability !== "supported")));
      const source = renderHubComposition(composition);
      assert.ok(source.includes(`panel.Size = UDim2.fromOffset(${composition.window.width}, ${composition.window.height})`));
      assert.doesNotMatch(source,/A7DEV|a7med_o6t|ScriptRush|TODO|loadstring|HttpGet|FireServer|InvokeServer/);
      assert.equal(source.includes('make("TextLabel", "Title", header)'), Boolean(composition.window.title));
      for (const item of controls) if ("action" in item && item.action === "custom") {
        assert.ok(item.code.trim().length > 60);
        assert.doesNotMatch(item.code,/\bprint\s*\(|TODO|while\s+true|WaitForChild/);
        assert.match(item.code,/FieldOfView =|Brightness =|highlight.Parent =|camera.CFrame =|GetAttribute\(|panel.Visible =|hud.Enabled =/);
      }
      splitDesigns.add(row.designFamily);
      splitCombinations.add(row.actionFamily);
      largestCharacters = Math.max(largestCharacters,row.messages.reduce((sum,message) => sum + message.content.length,0));
      smallestControls = Math.min(smallestControls,controls.length);
    }
    for (const family of splitDesigns) { assert.ok(!designs.has(family),`Design leakage: ${family}`); designs.add(family); }
    for (const family of splitCombinations) { assert.ok(!combinations.has(family),`Action-family leakage: ${family}`); combinations.add(family); }
    sizes[split] = rows[split].length;
  }
  return { sizes,largestCharacters,smallestControls,uniquePrompts:seenPrompts.size,uniqueAnswers:seenAnswers.size };
}

export async function buildDataset(outputDirectory?: string) {
  const rows = buildRows();
  const validation = validateRows(rows);
  const defaultOutput = fileURLToPath(new URL("../../test-results/specialist/dataset/", import.meta.url));
  const output = path.resolve(outputDirectory || defaultOutput);
  await mkdir(output,{recursive:true});
  const files: Record<string,unknown> = {};
  for (const split of ["train","validation","test"] as const) {
    const content = rows[split].map(row => JSON.stringify(row)).join("\n") + "\n";
    await writeFile(path.join(output,`${split}.jsonl`),content,"utf8");
    files[split] = {file:`${split}.jsonl`,sha256:sha256(content),rows:rows[split].length,ids:rows[split].map(row => row.id),designFamilies:[...new Set(rows[split].map(row => row.designFamily))],actionFamilies:[...new Set(rows[split].map(row => row.actionFamily))]};
  }
  const manifest = {
    formatVersion:1,
    purpose:"Offline ScriptRush composition LoRA experiment, original synthetic fixtures only",
    provenance:"Deterministically authored from the project's existing composition schema/verified renderer; no scraped script, conversation, credential or third-party code.",
    trainingColumns:["messages"],
    evaluationOnlyColumns:["expected"],
    splitPolicy:"Distinct prompt/answer SHA256, design families and action-combination families; individual primitives overlap intentionally. Upload train and validation only for training. Never train on test, expected labels, or inference outputs.",
    limitations:["Synthetic local client effects in fictional owned games, not real-game server behavior.","Composition and coverage validation do not prove actual Roblox runtime execution.","A win on this narrow synthetic benchmark does not establish improvement for arbitrary full hubs or unseen game profiles."],
    ...validation,
    files,
  };
  await writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  return { output,...validation,manifestSha256:sha256(JSON.stringify(manifest,null,2)+"\n") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await buildDataset(process.argv[2]),null,2));
}
