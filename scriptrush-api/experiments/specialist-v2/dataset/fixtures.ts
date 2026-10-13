import type { GenerationContract } from "../../../src/lib/generation-contract.ts";
import type { HubComposition, HubItem } from "../../../src/lib/hub-spec.ts";

export type Split = "train" | "validation" | "dev" | "test";
export const SPLITS: readonly Split[] = ["train", "validation", "dev", "test"];
export type DatasetRow = {
  id: string;
  split: Split;
  designFamily: string;
  actionFamily: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  expected: {
    composition: HubComposition;
    contract: GenerationContract;
    featureIds: string[];
    ui: { title: string; width: number; height: number; palette: HubComposition["window"]["palette"]; pageLabels: string[]; font: string; textSize: number; radius: number; navigation: string; language: "en" };
  };
};

/* A fixed, genuinely populated demonstration, not a schema, fixture answer or held-out game. */
export const FORMAT_EXAMPLE: HubComposition = {
  window: { title: "", width: 520, height: 420, radius: 10, draggable: true, navigation: "top", font: "Gotham", textSize: 14, closeLabel: "Close", minimizeLabel: "Minimize", restoreLabel: "Restore", palette: { background: [22,28,38], foreground: [244,248,252], accent: [87,190,220], control: [38,48,62], muted: [170,183,198] }, alternatePalette: { background: [244,247,249], foreground: [27,38,48], accent: [32,126,158], control: [218,229,235], muted: [99,117,128] }, featureIds: ["interface"] },
  pages: [
    { id: "page-movement", label: "Movement", featureIds: [], items: [
      { id: "walk-speed", featureIds: ["walk-speed"], kind: "number", label: "Walk Speed", description: "Set local walking speed.", applyLabel: "Apply", min: 8, max: 48, initial: 28, action: "walk-speed", code: "" },
      { id: "jump-power", featureIds: ["jump-power"], kind: "number", label: "Jump Power", description: "Set local jumping power.", applyLabel: "Apply", min: 25, max: 100, initial: 65, action: "jump-power", code: "" },
    ] },
    { id: "page-world", label: "World", featureIds: [], items: [
      { id: "camera-fov", featureIds: ["camera-fov"], kind: "number", label: "Camera FOV", description: "Set the current camera field of view.", applyLabel: "Apply", min: 40, max: 110, initial: 85, action: "custom", code: 'local camera = workspace.CurrentCamera\nif not camera then ctx.notify("Camera is unavailable."); return end\ncamera.FieldOfView = ctx.value' },
      { id: "night-vision", featureIds: ["night-vision"], kind: "toggle", label: "Night Vision", description: "Adjust local lighting and restore it on cleanup.", onLabel: "On", offLabel: "Off", initial: false, action: "custom", code: 'local lighting = ctx.services.Lighting\nif ctx.state.originalBrightness == nil then\nctx.state.originalBrightness = lighting.Brightness\nctx.onCleanup(function() lighting.Brightness = ctx.state.originalBrightness end)\nend\nlighting.Brightness = ctx.enabled and 3 or ctx.state.originalBrightness' },
    ] },
    { id: "page-session", label: "Session", featureIds: [], items: [
      { id: "rejoin", featureIds: ["rejoin"], kind: "button", label: "Rejoin", description: "Rejoin the current place.", action: "rejoin", code: "" },
    ] },
    { id: "page-settings", label: "Settings", featureIds: [], items: [
      { id: "theme", featureIds: ["theme"], kind: "toggle", label: "Theme", description: "Apply the requested alternate palette.", onLabel: "On", offLabel: "Off", initial: false, action: "theme", code: "" },
    ] },
  ],
};

/** Identical for both variants. It contains no evaluation fixture, answer or test identifier. */
export const SPECIALIST_SYSTEM = `You are the ScriptRush composition specialist. Output ONE JSON object with exactly window and pages. Generate VALUES, not a JSON schema, and do not repeat the input request, requestedUi, requestedControls, requirements or gameEvidence. No markdown or explanation.
Read every requirement before responding. Build ALL requested pages and ALL independent working controls together; never return pages:[], empty pages, one representative feature, disabled controls for supported behavior, TODO or print-only actions.
Source of truth: requestedUi supplies exact window values and page order; requestedControls supplies exact visible control text, type, bounds and initial state; requirements supplies effects; gameEvidence supplies permitted paths and attributes. Translate French functional pages Mouvement/Monde/Joueur/Réglages to Movement/World/Player/Settings. Every functional label, description and notification is English. Preserve an exact custom title; title="" means no name, brand or author credit.
The root contains window and pages only. Window has title,width,height,radius,draggable,navigation(top|left),font,textSize,closeLabel,minimizeLabel,restoreLabel,palette,alternatePalette,featureIds. Each palette is an OBJECT with background,foreground,accent,control,muted, each an RGB triple. Copy all requested UI values, including both palettes. A page has id,label,featureIds,items. Keep featureIds=["interface"] on window, [] on pages, and [requirement id] on each corresponding control. Use unique lowercase kebab-case ids.
Number items have id,featureIds,kind,label,description,applyLabel,min,max,initial,action,code. Toggle items have id,featureIds,kind,label,description,onLabel,offLabel,initial,action,code. Button items have id,featureIds,kind,label,description,action,code. Standard actions walk-speed,jump-power,rejoin,theme are implemented by the verified renderer and MUST use code="". Other actions use action="custom" and a COMPLETE Luau callback body, JSON-escaped as a string. The renderer supplies ctx.player,ctx.services,ctx.gui,ctx.state,ctx.value,ctx.enabled,ctx.own,ctx.onCleanup,ctx.notify. Use bounded FindFirstChild, class/type guards and English unavailable notifications. Register persistent effect cleanup with ctx.onCleanup. Never invent a remote, path, external loader or another GUI.
This populated FORMAT EXAMPLE demonstrates syntax and real controls only. Replace its UI, pages, controls, paths and numbers with the actual input; it is never the answer to another request:
${JSON.stringify(FORMAT_EXAMPLE)}
Before emitting JSON: count every requested control; verify every featureId occurs exactly once; check page order, palettes, title and numeric bounds; ensure each custom callback has a real local effect. Return the complete requested composition.`;

export type ActionId = "walk-speed" | "jump-power" | "camera-fov" | "night-vision" | "world-marker" | "focus-landmark" | "read-coins" | "open-journal" | "hud-visible" | "rejoin" | "theme";
type Category = "Movement" | "World" | "Player" | "Session" | "Settings";
type Action = { id: ActionId; category: Category; behavior: string; evidence: string; item: HubItem };
type Design = { id: string; palette: HubComposition["window"]["palette"]; navigation: "top" | "left"; width: number; height: number; radius: number; font: HubComposition["window"]["font"] };
const palette = (background: [number,number,number], foreground: [number,number,number], accent: [number,number,number], control: [number,number,number], muted: [number,number,number]): HubComposition["window"]["palette"] => ({ background,foreground,accent,control,muted });

const DESIGNS: Record<Split, Design[]> = {
  train: [
    { id:"v2-ink-amber-top", palette:palette([15,20,32],[249,245,234],[235,180,75],[30,37,52],[163,174,193]),navigation:"top",width:552,height:432,radius:11,font:"Gotham" },
    { id:"v2-olive-ivory-left",palette:palette([35,43,28],[246,247,229],[193,211,112],[52,64,41],[179,192,154]),navigation:"left",width:672,height:472,radius:7,font:"Roboto" },
    { id:"v2-smoke-rose-top",palette:palette([39,43,50],[251,242,243],[226,145,162],[60,65,74],[193,187,196]),navigation:"top",width:584,height:456,radius:15,font:"Ubuntu" },
    { id:"v2-grape-lilac-left",palette:palette([37,25,57],[249,239,255],[192,152,240],[59,40,83],[190,174,211]),navigation:"left",width:696,height:488,radius:5,font:"SourceSans" },
    { id:"v2-chalk-teal-top",palette:palette([239,244,241],[28,49,46],[43,147,133],[215,229,221],[102,126,118]),navigation:"top",width:608,height:448,radius:13,font:"Arial" },
    { id:"v2-midnight-lime-left",palette:palette([14,27,43],[238,249,251],[168,224,91],[29,48,68],[156,185,201]),navigation:"left",width:648,height:480,radius:9,font:"GothamMedium" },
    { id:"v2-rust-silver-top",palette:palette([55,31,25],[249,242,233],[213,168,136],[81,48,37],[198,169,153]),navigation:"top",width:576,height:464,radius:17,font:"Code" },
    { id:"v2-polar-violet-left",palette:palette([228,238,249],[35,44,68],[124,105,201],[204,219,237],[107,124,149]),navigation:"left",width:720,height:496,radius:3,font:"GothamBold" },
  ],
  validation: [
    { id:"v2-val-pewter-orange",palette:palette([42,46,48],[247,245,239],[227,148,78],[62,67,71],[188,193,189]),navigation:"left",width:636,height:452,radius:12,font:"ArialBold" },
    { id:"v2-val-mauve-sage",palette:palette([57,35,54],[248,242,247],[157,209,178],[77,51,73],[197,171,192]),navigation:"top",width:568,height:444,radius:8,font:"SourceSansBold" },
    { id:"v2-val-paper-aqua",palette:palette([245,241,227],[41,48,57],[43,166,178],[225,219,202],[121,122,125]),navigation:"left",width:684,height:492,radius:16,font:"Roboto" },
  ],
  dev: [
    { id:"v2-dev-denim-apricot",palette:palette([24,39,67],[244,249,255],[244,170,121],[42,60,92],[170,190,220]),navigation:"top",width:596,height:476,radius:6,font:"Code" },
    { id:"v2-dev-moss-peach",palette:palette([28,47,37],[244,248,234],[228,169,135],[45,68,52],[174,195,171]),navigation:"left",width:704,height:484,radius:14,font:"Arial" },
    { id:"v2-dev-stone-blue",palette:palette([232,227,221],[46,45,55],[91,128,204],[212,204,196],[119,112,118]),navigation:"top",width:624,height:460,radius:2,font:"Ubuntu" },
  ],
  test: [
    { id:"v2-final-indigo-lemon",palette:palette([28,30,62],[244,246,253],[229,218,113],[47,50,89],[176,182,212]),navigation:"left",width:692,height:504,radius:19,font:"SourceSansBold" },
    { id:"v2-final-linen-berry",palette:palette([246,237,220],[62,45,49],[177,71,118],[226,212,190],[134,112,111]),navigation:"top",width:588,height:468,radius:1,font:"GothamMedium" },
    { id:"v2-final-graphite-jade",palette:palette([29,36,35],[238,250,244],[99,202,164],[47,58,55],[169,194,181]),navigation:"left",width:728,height:516,radius:21,font:"ArialBold" },
  ],
};

const ACTION_FAMILIES: Record<Split, Array<{ id: string; actions: ActionId[] }>> = {
  train: [
    { id:"v2-training-scout",actions:["walk-speed","camera-fov","world-marker","read-coins","rejoin","theme"] },
    { id:"v2-training-night-camp",actions:["jump-power","night-vision","focus-landmark","open-journal","hud-visible","theme"] },
    { id:"v2-training-trail",actions:["walk-speed","jump-power","camera-fov","read-coins","open-journal","rejoin","theme"] },
    { id:"v2-training-surveyor",actions:["camera-fov","night-vision","world-marker","focus-landmark","hud-visible","rejoin","theme"] },
    { id:"v2-training-light-travel",actions:["walk-speed","jump-power","camera-fov","world-marker","read-coins","hud-visible","rejoin","theme"] },
    { id:"v2-training-archive",actions:["jump-power","camera-fov","night-vision","focus-landmark","read-coins","open-journal","rejoin","theme"] },
    { id:"v2-training-complete-camp",actions:["walk-speed","jump-power","night-vision","world-marker","focus-landmark","read-coins","open-journal","hud-visible","theme"] },
    { id:"v2-training-all-systems",actions:["walk-speed","jump-power","camera-fov","night-vision","world-marker","focus-landmark","read-coins","open-journal","hud-visible","rejoin","theme"] },
  ],
  validation: [
    { id:"v2-validation-lantern",actions:["walk-speed","night-vision","world-marker","read-coins","hud-visible","rejoin","theme"] },
    { id:"v2-validation-atlas",actions:["walk-speed","jump-power","camera-fov","focus-landmark","read-coins","open-journal","hud-visible","theme"] },
    { id:"v2-validation-guide",actions:["jump-power","camera-fov","night-vision","world-marker","focus-landmark","open-journal","hud-visible","rejoin","theme"] },
  ],
  dev: [
    { id:"v2-dev-courier",actions:["walk-speed","jump-power","camera-fov","night-vision","read-coins","open-journal","rejoin","theme"] },
    { id:"v2-dev-tracker",actions:["walk-speed","camera-fov","night-vision","world-marker","focus-landmark","read-coins","hud-visible","rejoin","theme"] },
    { id:"v2-dev-archive-plus",actions:["walk-speed","jump-power","camera-fov","world-marker","focus-landmark","read-coins","open-journal","hud-visible","rejoin","theme"] },
  ],
  test: [
    { id:"v2-final-stargazer",actions:["jump-power","camera-fov","night-vision","world-marker","focus-landmark","read-coins","hud-visible","theme"] },
    { id:"v2-final-cartography",actions:["walk-speed","jump-power","camera-fov","night-vision","world-marker","read-coins","open-journal","rejoin","theme"] },
    { id:"v2-final-field-guide",actions:["walk-speed","jump-power","camera-fov","night-vision","world-marker","focus-landmark","read-coins","open-journal","hud-visible","theme"] },
  ],
};

const CATEGORY_ORDER: Category[] = ["Movement","World","Player","Session","Settings"];
const FRENCH_PAGES: Record<Category,string> = {Movement:"Mouvement",World:"Monde",Player:"Joueur",Session:"Session",Settings:"Réglages"};
export const SPLIT_COUNTS: Record<Split,number> = {train:256,validation:24,dev:24,test:24};
const PREFIX: Record<Split,string> = {train:"Mistral",validation:"Copper",dev:"Vesper",test:"Lumen"};

function actionsFor(index: number, names: { landmark: string; hud: string; journal: string; coins: string }): Map<ActionId,Action> {
  const make = (id: ActionId, category: Category, behavior: string, item: HubItem): Action => ({id,category,behavior,evidence: "action" in item && item.action === "custom" ? "Exact permitted local objects/properties in gameEvidence." : "Verified standard client renderer action.",item});
  const number = (id: ActionId,label:string,description:string,min:number,max:number,initial:number,action:"walk-speed"|"jump-power"|"custom",code=""): HubItem => ({id,featureIds:[id],kind:"number",label,description,applyLabel:"Apply",min,max,initial,action,code});
  const button = (id: ActionId,label:string,description:string,action:"rejoin"|"custom",code=""): HubItem => ({id,featureIds:[id],kind:"button",label,description,action,code});
  const toggle = (id: ActionId,label:string,description:string,action:"theme"|"custom",code="",initial=false): HubItem => ({id,featureIds:[id],kind:"toggle",label,description,onLabel:"On",offLabel:"Off",initial,action,code});
  const speedMin=8+index%3*2,speedMax=44+index%3*8,speed=24+index%13,jumpMin=25+index%2*5,jumpMax=100+index%2*10,jump=57+index%18,fovMin=40+index%2*5,fovMax=105+index%2*5,fov=76+index%15;
  const list: Action[] = [
    make("walk-speed","Movement","On Apply, set the current local Humanoid.WalkSpeed to the chosen number.",number("walk-speed","Walk Speed","Set local walking speed.",speedMin,speedMax,speed,"walk-speed")),
    make("jump-power","Movement","On Apply, enable the current local Humanoid.UseJumpPower and set JumpPower to the chosen number.",number("jump-power","Jump Power","Set local jumping power.",jumpMin,jumpMax,jump,"jump-power")),
    make("camera-fov","World","On Apply, set workspace.CurrentCamera.FieldOfView to the chosen number.",number("camera-fov","Camera FOV","Set the current camera field of view.",fovMin,fovMax,fov,"custom",'local camera = workspace.CurrentCamera\nif not camera then ctx.notify("Camera is unavailable."); return end\ncamera.FieldOfView = ctx.value')),
    make("night-vision","World","Toggle local Lighting.Brightness between 3 and the original value. Restore the original on close.",toggle("night-vision","Night Vision","Adjust local lighting and restore it on cleanup.","custom",'local lighting = ctx.services.Lighting\nif ctx.state.originalBrightness == nil then\nctx.state.originalBrightness = lighting.Brightness\nctx.onCleanup(function() lighting.Brightness = ctx.state.originalBrightness end)\nend\nlighting.Brightness = ctx.enabled and 3 or ctx.state.originalBrightness')),
    make("world-marker","World",`Toggle a local cyan-fill white-outline Highlight adorning workspace.${names.landmark}. Remove it on off and close.`,toggle("world-marker","Landmark Marker","Highlight the evidenced landmark locally.","custom",`if ctx.state.highlight then ctx.state.highlight:Destroy(); ctx.state.highlight = nil end\nif not ctx.enabled then return end\nlocal target = workspace:FindFirstChild("${names.landmark}")\nif not target or not target:IsA("BasePart") then ctx.notify("Landmark is unavailable."); return end\nlocal highlight = Instance.new("Highlight")\nhighlight.Name = "LocalLandmarkMarker"\nhighlight.Adornee = target\nhighlight.FillColor = Color3.fromRGB(70, 210, 235)\nhighlight.OutlineColor = Color3.fromRGB(255, 255, 255)\nhighlight.Parent = ctx.gui\nctx.state.highlight = highlight\nif not ctx.state.cleanupRegistered then\nctx.state.cleanupRegistered = true\nctx.onCleanup(function() if ctx.state.highlight then ctx.state.highlight:Destroy(); ctx.state.highlight = nil end end)\nend`)),
    make("focus-landmark","World",`On click aim the current camera at workspace.${names.landmark}.Position while retaining its current position.`,button("focus-landmark","Focus Landmark","Aim the camera at the evidenced landmark.","custom",`local target = workspace:FindFirstChild("${names.landmark}")\nlocal camera = workspace.CurrentCamera\nif not target or not target:IsA("BasePart") or not camera then ctx.notify("Landmark or camera is unavailable."); return end\ncamera.CFrame = CFrame.lookAt(camera.CFrame.Position, target.Position)`)),
    make("read-coins","Player",`On click read the current player's numeric ${names.coins} attribute and notify "Coins: " plus its value.`,button("read-coins","Read Coins","Show the evidenced currency attribute.","custom",`local value = ctx.player:GetAttribute("${names.coins}")\nif typeof(value) ~= "number" then ctx.notify("Coins are unavailable."); return end\nctx.notify("Coins: " .. tostring(value))`)),
    make("open-journal","Player",`On click set the existing PlayerGui.${names.journal}.JournalPanel Frame.Visible=true.`,button("open-journal","Open Journal","Open the existing local journal panel.","custom",`local playerGui = ctx.player:FindFirstChild("PlayerGui")\nlocal journal = playerGui and playerGui:FindFirstChild("${names.journal}")\nlocal panel = journal and journal:FindFirstChild("JournalPanel")\nif not panel or not panel:IsA("Frame") then ctx.notify("Journal is unavailable."); return end\npanel.Visible = true`)),
    make("hud-visible","Player",`Toggle the existing PlayerGui.${names.hud} ScreenGui.Enabled. Restore its original value on close.`,toggle("hud-visible","Game HUD","Show or hide the evidenced game HUD.","custom",`local playerGui = ctx.player:FindFirstChild("PlayerGui")\nlocal hud = playerGui and playerGui:FindFirstChild("${names.hud}")\nif not hud or not hud:IsA("ScreenGui") then ctx.notify("Game HUD is unavailable."); return end\nif ctx.state.originalEnabled == nil then\nctx.state.originalEnabled = hud.Enabled\nctx.onCleanup(function() hud.Enabled = ctx.state.originalEnabled end)\nend\nhud.Enabled = ctx.enabled`,true)),
    make("rejoin","Session","On click TeleportService:Teleport(game.PlaceId, player) rejoins the current place.",button("rejoin","Rejoin","Rejoin the current place.","rejoin")),
    make("theme","Settings","Toggle the window's applied colors between the requested primary and alternate palettes.",toggle("theme","Theme","Apply the requested alternate palette.","theme")),
  ];
  return new Map(list.map(action=>[action.id,action]));
}

export function buildRows(): Record<Split,DatasetRow[]> {
  const rows: Record<Split,DatasetRow[]>={train:[],validation:[],dev:[],test:[]};
  for (const split of SPLITS) for (let index=0;index<SPLIT_COUNTS[split];index++) {
    const local=index%ACTION_FAMILIES[split].length,cycle=Math.floor(index/ACTION_FAMILIES[split].length);
    const family=ACTION_FAMILIES[split][local];
    // Four title variants per design block; every action family sees French and English requests.
    const design=DESIGNS[split][(Math.floor(cycle/4)+local)%DESIGNS[split].length];
    const id=`v2-${split}-${String(index+1).padStart(3,"0")}`,token=`${PREFIX[split]}${index+101}`,game=`${token} Fieldwork`;
    const names={landmark:`${token}Obelisk`,hud:`${token}Dashboard`,journal:`${token}Logbook`,coins:`${token}Credits`};
    const available=actionsFor(index,names),actions=family.actions.map(id=>available.get(id)!);
    const present=CATEGORY_ORDER.filter(category=>actions.some(action=>action.category===category));
    const offset=Math.floor(index/4)%present.length;
    const rotated=[...present.slice(offset),...present.slice(0,offset)];
    const pageOrder=index%3===0?rotated.reverse():rotated;
    const french=(Math.floor(cycle/4)+Math.floor(local/2))%2===0,titleVariant=cycle%4;
    const title=titleVariant===0||titleVariant===2?"":titleVariant===1?`${token} Atlas`:`${token} "Prime"`;
    const width=design.width+Math.floor(index/16)%3*10,height=design.height+Math.floor(index/3)%3*6,textSize=12+Math.floor(index/5)%3*2;
    const alternatePalette=palette([244,247,240],[28,39,38],[65+index%23,151+index%17,139+index%13],[216,229,218],[103,124,113]);
    const composition: HubComposition={
      window:{title,width,height,radius:design.radius,draggable:true,navigation:design.navigation,font:design.font,textSize,closeLabel:"Close",minimizeLabel:"Minimize",restoreLabel:"Restore",palette:structuredClone(design.palette),alternatePalette,featureIds:["interface"]},
      pages:pageOrder.map(category=>({id:`page-${category.toLowerCase()}`,label:category,featureIds:[],items:actions.filter(action=>action.category===category).map(action=>structuredClone(action.item))})),
    };
    const contract: GenerationContract={fullHub:true,ui:{instructions:"Use requestedUi exactly, translate functional page names into English, and use requestedControls exactly on their stated pages. Close cleanup, minimize/restore and dragging must work.",requiredText:[...(title?[title]:[]),...pageOrder,"Close","Minimize","Restore",...actions.map(action=>"label" in action.item?action.item.label:"")]},features:[
      {id:"interface",label:"Complete UI",behavior:"Create the complete requested draggable UI window, all navigation pages, close cleanup and minimize/restore.",availability:"supported",evidence:"Verified window renderer.",interaction:true},
      ...actions.map(action=>({id:action.id,label:"label" in action.item?action.item.label:action.id,behavior:action.behavior,availability:"supported" as const,evidence:action.evidence,interaction:true})),
    ]};
    const objects: Array<{path:string;className:string;properties:Record<string,unknown>}>=[];
    if (family.actions.includes("world-marker")||family.actions.includes("focus-landmark")) objects.push({path:`workspace.${names.landmark}`,className:"Part",properties:{Position:"Vector3",Anchored:true}});
    if (family.actions.includes("hud-visible")) objects.push({path:`Players.LocalPlayer.PlayerGui.${names.hud}`,className:"ScreenGui",properties:{Enabled:true}});
    if (family.actions.includes("open-journal")) objects.push({path:`Players.LocalPlayer.PlayerGui.${names.journal}.JournalPanel`,className:"Frame",properties:{Visible:false}});
    if (family.actions.includes("camera-fov")||family.actions.includes("focus-landmark")) objects.push({path:"workspace.CurrentCamera",className:"Camera",properties:{FieldOfView:70,CFrame:"CFrame"}});
    if (family.actions.includes("night-vision")) objects.push({path:"Lighting",className:"Lighting",properties:{Brightness:1.5}});
    const gameEvidence={game,scope:"Original owned-game fixture for offline training; not evidence from a live Roblox game.",objects,attributes:family.actions.includes("read-coins")?[{path:"Players.LocalPlayer",name:names.coins,type:"number"}]:[],notes:["Only local presentation and verified standard utilities. No remotes, external loaders or server actions."]};
    const requestedUi={...composition.window,pageLabels:pageOrder.map(category=>french?FRENCH_PAGES[category]:category),language:"en"};
    // These are user-facing acceptance values, not action/code/answer labels.
    const requestedControls=actions.map(action=>{
      const {id,featureIds:_featureIds,action:_action,code:_code,...control}=action.item as Exclude<HubItem,{kind:"text"|"disabled"}>;
      return {featureId:id,page:action.category,...control};
    });
    const request=french?`Crée un Full Hub complet pour mon jeu fictif ${game}. Tous les contrôles demandés doivent fonctionner. UI en anglais, ${title?"conserve mon titre personnalisé":"aucun nom ni marque"}.`:`Create a complete Full Hub for my fictional owned game ${game}. Every requested control must work. Use English UI and ${title?"my exact custom title":"no hub name or branding"}.`;
    rows[split].push({id,split,designFamily:design.id,actionFamily:family.id,messages:[{role:"system",content:SPECIALIST_SYSTEM},{role:"user",content:JSON.stringify({request,requestedUi,requestedControls,requirements:contract,gameEvidence})},{role:"assistant",content:JSON.stringify(composition)}],expected:{composition,contract,featureIds:contract.features.map(feature=>feature.id),ui:{title,width,height,palette:composition.window.palette,pageLabels:pageOrder,font:design.font,textSize,radius:design.radius,navigation:design.navigation,language:"en"}}});
  }
  return rows;
}
