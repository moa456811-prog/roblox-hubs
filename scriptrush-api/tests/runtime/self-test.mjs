import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fullHub = await readFile(path.join(here,"fixture-full-hub.lua"),"utf8");
const frenchUI = await readFile(path.join(here,"fixture-french-ui.lua"),"utf8");
const englishUI = await readFile(path.join(here,"fixture-english-ui.lua"),"utf8");
const outputDir=path.resolve(here,"../../test-results/runtime/self-test");
await mkdir(outputDir,{recursive:true});
const cases=[
  {name:"valid-full-hub",source:fullHub,scenario:"full-hub",passed:true},
  {name:"valid-english-ui",source:englishUI,scenario:"english-ui",passed:true},
  {name:"valid-french-ui",source:frenchUI,scenario:"french-ui",passed:true},
  {name:"french-labels-rejected-for-english-request",source:frenchUI,scenario:"english-ui",failure:"both requested tab buttons exist"},
  {name:"wrong-window-size",source:fullHub.replace("UDim2.fromOffset(480,360)","UDim2.fromOffset(460,360)"),scenario:"full-hub",failure:"requested exact window size"},
  {name:"overlapping-tabs",source:fullHub.replace("10+(index-1)*150,46","10,46"),scenario:"full-hub",failure:"tab buttons do not overlap"},
  {name:"tabs-in-header",source:fullHub.replace("10+(index-1)*150,46","10+(index-1)*150,0"),scenario:"full-hub",failure:"tabs are laid out below the header"},
  {name:"speed-decoration-only",source:fullHub.replace("humanoid.WalkSpeed=value","local unused=value"),scenario:"full-hub",failure:"speed Apply immediately changes"},
  {name:"jump-power-mode-missing",source:fullHub.replace("humanoid.UseJumpPower=true;", ""),scenario:"full-hub",failure:"jump Apply enables power"},
  {name:"unsafe-speed-range",source:fullHub.replace("parsed<min or parsed>max", "false"),scenario:"full-hub",failure:"speed rejects invalid value"},
  {name:"rejoin-unused",source:fullHub.replace("Teleport:Teleport(game.PlaceId,player)", "local unused=game.PlaceId"),scenario:"full-hub",failure:"Rejoin calls Teleport exactly once"},
  {name:"theme-colors-unused",source:fullHub.replace("panel.BackgroundColor3=alternate and Color3.fromRGB(24,18,34) or navy", "local unused=alternate and Color3.fromRGB(24,18,34) or navy"),scenario:"full-hub",failure:"Theme visibly changes panel and control colors"},
  {name:"restore-not-shown",source:fullHub.replace("panel.Visible=false;restore.Visible=true", "panel.Visible=false;restore.Visible=false"),scenario:"full-hub",failure:"minimized UI exposes a visible Restore control"},
  {name:"close-panel-only",source:fullHub.replace("gui:Destroy()", "panel:Destroy()"),scenario:"full-hub",failure:"Close destroys the complete ScreenGui"},
  {name:"global-connections-leak",source:fullHub.replace("for _,connection in ipairs(connections) do connection:Disconnect() end;", ""),scenario:"full-hub",failure:"Close disconnects all owned connections"},
  {name:"tab-stale-pages",source:frenchUI.replace("homePage.Visible=false;settingsPage.Visible=true", "homePage.Visible=true;settingsPage.Visible=true"),scenario:"french-ui",failure:"hides the other content"},
  {name:"sandbox-no-io",source:fullHub+"\nrequire('fs')",scenario:"full-hub",failure:"script initializes without runtime errors"},
  {name:"bounded-infinite-loop",source:"while true do end",scenario:"full-hub",failure:"6-second execution limit"},
];
const results=[];
for(const test of cases){
  const candidate=path.join(outputDir,test.name+".lua");
  const output=path.join(outputDir,test.name+".json");
  await writeFile(candidate,test.source);
  const run=spawnSync(process.execPath,[path.join(here,"run-runtime.mjs"),candidate,test.scenario,output],{encoding:"utf8",timeout:9_000,windowsHide:true});
  const report=JSON.parse(await readFile(output,"utf8"));
  const met=test.passed===true?report.passed:!report.passed&&report.failures.some(failure=>failure.includes(test.failure));
  results.push({name:test.name,passed:met,expected:test.passed===true?"accept":`reject: ${test.failure}`,actual:report.passed?"accepted":"rejected",failures:met?[]:report.failures,processExit:run.status});
}
const summary={passed:results.every(result=>result.passed),cases:results};
await writeFile(path.join(outputDir,"summary.json"),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
process.exitCode=summary.passed?0:1;
