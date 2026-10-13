import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const argument=process.argv[2] || path.resolve(here,"../../src/lib/game-adapters/blox-fruits-runtime.ts");
const candidate=path.resolve(argument);
const source=/\.[cm]?ts$/.test(candidate)?(await import(pathToFileURL(candidate).href)).BLOX_FRUITS_RUNTIME_FACTORY:await readFile(candidate,"utf8");
if(typeof source!=="string") throw new Error("Missing factory source");
const wrap=body=>`(function() local original=${source}\nreturn function(env) local api=original(env)\n${body}\nreturn api end end)()`;
// Mutation controls demonstrate that acceptance requires effects and genuine
// state transitions. They deliberately break the real baseline via its API;
// none introduces network access or an alternate engine implementation.
const cases=[
  {name:"valid-factory",source,accept:true},
  {name:"rejects-decoration-only-buttons",source:wrap("api.setEnabled=function() end"),failure:"farm dispatches an actual ordinary attack"},
  {name:"rejects-actions-before-click",source:wrap('api.setEnabled("farm",true)'),failure:"no game actions occur before explicit activation"},
  {name:"rejects-quest-noop",source:wrap('local set=api.setEnabled; api.setEnabled=function(id,on) if id~="quest" then return set(id,on) end end'),failure:"quest sends the real StartQuest command"},
  {name:"rejects-farm-as-boss",source:wrap('local set=api.setEnabled; api.setEnabled=function(id,on) return set(id=="boss" and "farm" or id,on) end'),failure:"boss takes priority over quest farm and loot"},
  {name:"rejects-shared-state-snapshots",source:wrap('local snapshot=api.getState(); api.getState=function() return snapshot end'),failure:"getState enabled flags are independent copies"},
  {name:"rejects-fabricated-damage",source:wrap('local get=api.getState; api.getState=function() local state=get(); state.progress.farmDamage=99; return state end'),failure:"attack alone is not counted as damage"},
  {name:"rejects-fabricated-loot",source:wrap('local get=api.getState; api.getState=function() local state=get(); state.progress.chestsCollected=99; state.progress.fruitsCollected=99; return state end'),failure:"moving to a chest does not claim collection"},
  {name:"rejects-nonboolean-toggle",source:wrap('local set=api.setEnabled; api.setEnabled=function(id,on) return set(id,on and true or false) end'),failure:"unknown ids and nonboolean activation do not enable actions"},
  {name:"rejects-dispose-noop",source:wrap('api.dispose=function() end'),failure:"dispose closes adapter state"},
  {name:"rejects-absent-boss-starving-farm",source:wrap('local set=api.setEnabled; api.setEnabled=function(id,on) if id=="farm" and on and api.getState().enabled.boss then return false end return set(id,on) end'),failure:"absent bosses do not starve an enabled farm"},
  {name:"rejects-absent-farm-starving-loot",source:wrap('local set=api.setEnabled; api.setEnabled=function(id,on) if id=="loot" and on and api.getState().enabled.farm then return false end return set(id,on) end'),failure:"no live farm enemy cannot starve available loot"},
  {name:"sandbox-rejects-arbitrary-require",source:'(function() require("fs"); return function() end end)()',failure:"candidate exports a callable factory"},
  {name:"sandbox-rejects-network",source:'(function() game:HttpGet("https://example.invalid"); return function() end end)()',failure:"candidate exports a callable factory"},
];
const hubArgument=process.argv[3];
if(hubArgument) {
  const hub=await readFile(path.resolve(hubArgument),"utf8");
  const replaceRequired=(from,to)=>{if(!hub.includes(from))throw new Error("Mutation anchor absent: "+from);return hub.replace(from,to);};
  cases.push(
    {name:"valid-generated-full-hub",source:hub,mode:"full-hub",accept:true},
    {name:"full-hub-rejects-private-gui-name",source:replaceRequired("gui.Name = guiName",'gui.Name = "A7DEV"'),mode:"full-hub",failure:"generated Blox hub contains no private branding or credits"},
    {name:"full-hub-rejects-hidden-automatic-title",source:replaceRequired("gui.Name = guiName",'gui.Name = guiName\nlocal badTitle=Instance.new("TextLabel",gui);badTitle.Name="Title";badTitle.Text="Universal Hub";badTitle.Visible=false'),mode:"full-hub",failure:"generated hub has no automatic Title object"},
    {name:"full-hub-rejects-farm-callback-noop",source:replaceRequired('ctx.gameplay.setEnabled("farm", ctx.enabled)','local unusedFarm = ctx.enabled'),mode:"full-hub",failure:"Auto Farm dispatches its actual game-specific operation"},
    {name:"full-hub-rejects-inert-movement",source:replaceRequired('humanoid.WalkSpeed = value','local unusedWalkSpeed = value'),mode:"full-hub",failure:"walk-speed Apply changes the current Humanoid"},
  );
}
const directory=path.resolve(here,"../../test-results/game-adapter-runtime/self-test");
await mkdir(directory,{recursive:true});
const results=[];
for(const test of cases) {
  const script=path.join(directory,test.name+".lua"); const output=path.join(directory,test.name+".json");
  await writeFile(script,test.source);
  const run=spawnSync(process.execPath,["--experimental-strip-types",path.join(here,"game-adapter-run.mjs"),script,test.mode || "factory",output],{encoding:"utf8",timeout:9_000,windowsHide:true});
  const report=JSON.parse(await readFile(output,"utf8"));
  const passed=test.accept?report.passed:!report.passed&&report.failures.some(item=>item.includes(test.failure));
  results.push({name:test.name,passed,expected:test.accept?"accept":test.failure,actual:report.passed?"accept":"reject",failures:passed?[]:report.failures,processExit:run.status});
}
const summary={passed:results.every(item=>item.passed),cases:results};
await writeFile(path.join(directory,"summary.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));process.exitCode=summary.passed?0:1;
