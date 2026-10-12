import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fullHub = await readFile(path.join(here,"fixture-full-hub.lua"),"utf8");
const frenchUI = await readFile(path.join(here,"fixture-french-ui.lua"),"utf8");
const englishUI = await readFile(path.join(here,"fixture-english-ui.lua"),"utf8");
// Independent positive control adapted from the small handwritten utility
// fixture. It does not import the product's local-preset builder/renderer.
const presetHub = fullHub
  .replace('local navy=Color3.fromRGB(18,24,42)', 'local navy=Color3.fromRGB(22,22,28)')
  .replace('local cyan=Color3.fromRGB(85,221,255)', 'local cyan=Color3.fromRGB(170,140,215)')
  .replace('UDim2.fromOffset(480,360)', 'UDim2.fromOffset(680,460)')
  .replace('Text="Aurora Hub"', 'Text="A7DEV"')
  .replace('{"Movement","Session","Settings"}', '{"Home","Farm","Boss","Quests","Loot","Movement","Session","Settings"}')
  .replace('Size=UDim2.new(1,-20,1,-96),Position=UDim2.fromOffset(10,86)', 'Size=UDim2.new(1,-182,1,-66),Position=UDim2.fromOffset(172,46)')
  .replace('10+(index-1)*150,46', '10,46+(index-1)*40')
  .replace('local row=make("Frame",pages[1]', 'local row=make("Frame",pages[6]')
  .replace('local rejoin=make("TextButton",pages[2]', 'local rejoin=make("TextButton",pages[7]')
  .replace('local theme=make("TextButton",pages[3]', 'local theme=make("TextButton",pages[8]')
  .replace('Color3.fromRGB(24,18,34)', 'Color3.fromRGB(18,24,42)')
  .replace('Color3.fromRGB(170,80,255)', 'Color3.fromRGB(85,221,255)')
  .replace('local function numeric', `
for _,feature in ipairs({
    {page=2,label="Auto Farm",reason="Needs game profile: target discovery, interaction and confirmation."},
    {page=3,label="Auto Boss",reason="Needs game profile: boss entry, objectives and phases."},
    {page=4,label="Quest Farm",reason="Needs game profile: quest acceptance, progress and rewards."},
    {page=5,label="Auto Loot",reason="Needs game profile: drop ownership, pickup flow and confirmation."},
}) do
    local row=make("Frame",pages[feature.page],{Name="UnavailableRow",Size=UDim2.new(1,0,0,90),BackgroundTransparency=1})
    make("TextButton",row,{Text=feature.label,Size=UDim2.fromOffset(180,32),Interactable=false,Active=false,BackgroundColor3=cyan})
    make("TextLabel",row,{Name="UnavailableReason",Text=feature.reason,Size=UDim2.new(1,0,0,45),Position=UDim2.fromOffset(0,38),BackgroundTransparency=1})
end
local function numeric`);
const outputDir=path.resolve(here,"../../test-results/runtime/self-test");
await mkdir(outputDir,{recursive:true});
const cases=[
  {name:"valid-full-hub",source:fullHub,scenario:"full-hub",passed:true},
  {name:"valid-preset-hub",source:presetHub,scenario:"preset-hub",passed:true},
  {name:"preset-rejects-old-three-tab-hub",source:fullHub,scenario:"preset-hub",failure:"requested exact window size"},
  {name:"preset-rejects-missing-farm-tab",source:presetHub.replace('"Home","Farm"','"Home",""'),scenario:"preset-hub",failure:"preset tab Farm exists"},
  {name:"preset-rejects-wrong-default-palette",source:presetHub.replace('local navy=Color3.fromRGB(22,22,28)','local navy=Color3.fromRGB(18,24,42)'),scenario:"preset-hub",failure:"preset charcoal is applied"},
  {name:"preset-rejects-enabled-unknown-actions",source:presetHub.replace('Interactable=false,Active=false','Interactable=true,Active=true'),scenario:"preset-hub",failure:"unverified Auto Farm control is disabled"},
  {name:"preset-rejects-wired-unknown-actions",source:presetHub.replace('make("TextButton",row,{Text=feature.label','local unavailableButton=make("TextButton",row,{Text=feature.label').replace('    make("TextLabel",row,{Name="UnavailableReason"','    own(unavailableButton.Activated,function() Teleport:Teleport(game.PlaceId,player) end)\n    make("TextLabel",row,{Name="UnavailableReason"'),scenario:"preset-hub",failure:"unverified Auto Farm has no wired action"},
  {name:"preset-rejects-generic-quest-reason",source:presetHub.replace('Needs game profile: quest acceptance, progress and rewards.','Needs game profile.'),scenario:"preset-hub",failure:"unverified Quest Farm shows its precise"},
  {name:"preset-rejects-hidden-reasons",source:presetHub.replace('Name="UnavailableReason",Text=','Name="UnavailableReason",Visible=false,Text='),scenario:"preset-hub",failure:"unverified Auto Farm shows its precise"},
  {name:"preset-rejects-wrong-alternate-theme",source:presetHub.replace('alternate and Color3.fromRGB(18,24,42)','alternate and Color3.fromRGB(24,18,34)'),scenario:"preset-hub",failure:"preset alternate theme visibly applies the navy"},
  {name:"valid-english-ui",source:englishUI,scenario:"english-ui",passed:true},
  {name:"translated-ui-preferences-content",source:englishUI,scenario:"translated-ui",passed:true},
  {name:"translated-ui-settings-content",source:englishUI.replace('Text="Preferences"','Text="Settings"'),scenario:"translated-ui",passed:true},
  {name:"translated-ui-rejects-french-labels",source:frenchUI,scenario:"translated-ui",failure:"both requested tab buttons exist"},
  {name:"translated-ui-rejects-tab-only-content",source:englishUI.replace('Text="Preferences"','Text=""'),scenario:"translated-ui",failure:"both requested page contents exist"},
  {name:"explicit-preferences-stays-strict",source:englishUI.replace('Text="Preferences"','Text="Settings"'),scenario:"english-ui",failure:"both requested page contents exist"},
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
