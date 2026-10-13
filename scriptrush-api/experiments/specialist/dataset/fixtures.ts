import type { GenerationContract } from "../../../src/lib/generation-contract.ts";
import type { HubComposition, HubItem } from "../../../src/lib/hub-spec.ts";

export type Split = "train" | "validation" | "test";
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

/** Intentionally small and identical for base/adapted-model evaluation. No test answers. */
export const SPECIALIST_SYSTEM = `Compose a complete Roblox client hub as JSON only, using the ScriptRush window/pages composition format. Root: {window,pages}. window fields: title,width,height,radius,draggable,navigation (top|left|none),font,textSize,closeLabel,minimizeLabel,restoreLabel,palette,alternatePalette,featureIds. Each palette is an object {background,foreground,accent,control,muted}; each color is [R,G,B]. Each page: {id,label,featureIds,items}. Every id is unique lowercase kebab-case. Items: text {id,featureIds,kind,text}; button {id,featureIds,kind,label,description,action,code}; number {id,featureIds,kind,label,description,applyLabel,min,max,initial,action,code}; toggle {id,featureIds,kind,label,description,onLabel,offLabel,initial,action,code}. Use every requirement exactly once on its real control, with only UI requirements on window.featureIds. Preserve exact requested dimensions, colors, font, radius, page order and custom title. No requested title means title="". Functional labels/descriptions/notifications are English even for a French request. Never invent branding, a page, a feature, a remote or external loader. Use standard actions walk-speed,jump-power,rejoin,theme with code=""; they are implemented by the verified renderer. Other effects use action="custom" and a complete Luau callback body. Context: ctx.player,ctx.services (Roblox services),ctx.gui,ctx.panel,ctx.controls,ctx.state (persistent per item),ctx.value (number),ctx.enabled (toggle),ctx.own(signal,callback),ctx.onCleanup(callback),ctx.notify(message). Custom code uses only supplied evidence and real local effects, bounded lookup and cleanup; never print-only, TODO or disabled controls for supported features. Do not create another window. Return actual values, never a schema or prose.`;

type ActionId = "walk-speed" | "jump-power" | "camera-fov" | "night-vision" | "world-marker" | "focus-landmark" | "read-coins" | "open-journal" | "hud-visible" | "rejoin" | "theme";
type Action = { id: ActionId; label: string; behavior: string; category: "Movement" | "World" | "Player" | "Session" | "Settings"; item: HubItem };

const designFamilies: Record<Split, Array<{ id: string; palette: HubComposition["window"]["palette"]; navigation: "top" | "left"; width: number; height: number; radius: number; font: HubComposition["window"]["font"] }>> = {
  train: [
    { id: "navy-cyan-top", palette: { background: [16,24,40], foreground: [240,247,255], accent: [55,205,235], control: [30,45,65], muted: [163,183,204] }, navigation: "top", width: 540, height: 430, radius: 12, font: "Gotham" },
    { id: "forest-lime-left", palette: { background: [18,36,25], foreground: [238,250,238], accent: [160,225,95], control: [34,58,41], muted: [170,200,175] }, navigation: "left", width: 640, height: 460, radius: 8, font: "Roboto" },
    { id: "slate-orange-top", palette: { background: [33,38,45], foreground: [250,245,238], accent: [245,165,70], control: [52,58,66], muted: [190,193,198] }, navigation: "top", width: 580, height: 450, radius: 16, font: "Ubuntu" },
    { id: "plum-pink-left", palette: { background: [40,21,43], foreground: [252,240,250], accent: [240,130,190], control: [65,35,65], muted: [200,169,197] }, navigation: "left", width: 680, height: 480, radius: 6, font: "SourceSans" },
  ],
  validation: [
    { id: "sand-indigo-left", palette: { background: [238,229,209], foreground: [36,33,52], accent: [102,91,205], control: [220,210,191], muted: [100,94,111] }, navigation: "left", width: 620, height: 440, radius: 10, font: "Arial" },
    { id: "charcoal-gold-top", palette: { background: [27,28,29], foreground: [248,242,222], accent: [225,195,90], control: [48,49,51], muted: [185,183,168] }, navigation: "top", width: 600, height: 470, radius: 14, font: "GothamMedium" },
  ],
  test: [
    { id: "ice-coral-left", palette: { background: [228,246,249], foreground: [30,52,64], accent: [230,103,93], control: [202,227,234], muted: [88,122,135] }, navigation: "left", width: 660, height: 490, radius: 18, font: "GothamBold" },
    { id: "aubergine-mint-top", palette: { background: [34,22,48], foreground: [238,250,245], accent: [123,225,184], control: [55,38,73], muted: [180,173,200] }, navigation: "top", width: 560, height: 440, radius: 4, font: "Code" },
    { id: "cream-blue-left", palette: { background: [247,242,230], foreground: [41,49,69], accent: [77,133,214], control: [226,220,204], muted: [116,118,128] }, navigation: "left", width: 700, height: 500, radius: 20, font: "ArialBold" },
  ],
};

/** Held-out combinations differ, while all individual operations occur in training. */
const actionFamilies: Record<Split, Array<{ id: string; actions: ActionId[] }>> = {
  train: [
    { id: "expedition", actions: ["walk-speed","jump-power","camera-fov","world-marker","rejoin","theme"] },
    { id: "explorer", actions: ["walk-speed","focus-landmark","read-coins","open-journal","rejoin","theme"] },
    { id: "camp", actions: ["jump-power","night-vision","hud-visible","read-coins","rejoin","theme"] },
    { id: "observer", actions: ["camera-fov","night-vision","world-marker","focus-landmark","hud-visible","theme"] },
  ],
  validation: [
    { id: "survey", actions: ["walk-speed","camera-fov","night-vision","world-marker","read-coins","open-journal","theme"] },
    { id: "traveller", actions: ["jump-power","focus-landmark","hud-visible","open-journal","read-coins","rejoin","theme"] },
  ],
  test: [
    { id: "cartographer", actions: ["walk-speed","jump-power","camera-fov","world-marker","focus-landmark","read-coins","open-journal","theme"] },
    { id: "night-expedition", actions: ["walk-speed","camera-fov","night-vision","world-marker","hud-visible","open-journal","rejoin","theme"] },
    { id: "complete-observer", actions: ["jump-power","camera-fov","night-vision","focus-landmark","read-coins","hud-visible","rejoin","theme"] },
  ],
};

const pageTranslations: Record<string,string> = { Movement: "Mouvement", World: "Monde", Player: "Joueur", Session: "Session", Settings: "Réglages" };
const rgb = (value: number[]) => `RGB(${value.join(", ")})`;

function actionsFor(index: number, objectNames: { landmark: string; hud: string; journal: string; coins: string }): Map<ActionId, Action> {
  const { landmark, hud, journal, coins } = objectNames;
  const make = (id: ActionId, label: string, behavior: string, category: Action["category"], item: Omit<HubItem, "id" | "featureIds">): Action => ({ id, label, behavior, category, item: { id, featureIds: [id], ...item } as HubItem });
  const number = (label: string, min: number, max: number, initial: number, action: "walk-speed" | "jump-power" | "custom", code = "") => ({ kind: "number" as const, label, description: `Apply the chosen ${label.toLowerCase()} value.`, applyLabel: "Apply", min, max, initial, action, code });
  const button = (label: string, description: string, action: "rejoin" | "custom", code = "") => ({ kind: "button" as const, label, description, action, code });
  const toggle = (label: string, description: string, action: "theme" | "custom", code = "", initial = false) => ({ kind: "toggle" as const, label, description, onLabel: "On", offLabel: "Off", initial, action, code });
  const speed = 26 + index % 7, jump = 60 + index % 10, fov = 80 + index % 6;
  const entries: Action[] = [
    make("walk-speed", "Walk Speed", `Provide an adjustable Walk Speed number from 8 to 48, initially ${speed}, applied to the current local humanoid only when Apply is clicked.`, "Movement", number("Walk Speed",8,48,speed,"walk-speed")),
    make("jump-power", "Jump Power", `Provide adjustable Jump Power from 25 to 100, initially ${jump}; enable UseJumpPower and apply the chosen value to the current local humanoid.`, "Movement", number("Jump Power",25,100,jump,"jump-power")),
    make("camera-fov", "Camera FOV", `Provide adjustable Camera FOV from 40 to 110, initially ${fov}; Apply sets workspace.CurrentCamera.FieldOfView to the chosen value.`, "World", number("Camera FOV",40,110,fov,"custom", `local camera = workspace.CurrentCamera\nif not camera then ctx.notify("Camera is unavailable."); return end\ncamera.FieldOfView = ctx.value`)),
    make("night-vision", "Night Vision", "Toggle local Lighting.Brightness between 3 and its original value; restore original brightness when the hub closes.", "World", toggle("Night Vision","Change local brightness and restore it when disabled.","custom", `local lighting = ctx.services.Lighting\nif ctx.state.originalBrightness == nil then\n    ctx.state.originalBrightness = lighting.Brightness\n    ctx.onCleanup(function() lighting.Brightness = ctx.state.originalBrightness end)\nend\nlighting.Brightness = ctx.enabled and 3 or ctx.state.originalBrightness`)),
    make("world-marker", "Landmark Marker", `Toggle a local Highlight on workspace.${landmark}, with cyan fill and white outline; remove the Highlight on disabling and closing.`, "World", toggle("Landmark Marker","Highlight the evidenced world landmark locally.","custom", `if ctx.state.highlight then ctx.state.highlight:Destroy(); ctx.state.highlight = nil end\nif not ctx.enabled then return end\nlocal target = workspace:FindFirstChild("${landmark}")\nif not target or not target:IsA("BasePart") then ctx.notify("Landmark is unavailable."); return end\nlocal highlight = Instance.new("Highlight")\nhighlight.Name = "LocalLandmarkMarker"\nhighlight.Adornee = target\nhighlight.FillColor = Color3.fromRGB(70, 210, 235)\nhighlight.OutlineColor = Color3.fromRGB(255, 255, 255)\nhighlight.Parent = ctx.gui\nctx.state.highlight = highlight\nif not ctx.state.cleanupRegistered then\n    ctx.state.cleanupRegistered = true\n    ctx.onCleanup(function() if ctx.state.highlight then ctx.state.highlight:Destroy(); ctx.state.highlight = nil end end)\nend`)),
    make("focus-landmark", "Focus Landmark", `On click aim the current camera at workspace.${landmark}.Position, keeping the camera's current position.`, "World", button("Focus Landmark","Aim the current camera at the evidenced landmark.","custom", `local target = workspace:FindFirstChild("${landmark}")\nlocal camera = workspace.CurrentCamera\nif not target or not target:IsA("BasePart") or not camera then ctx.notify("Landmark or camera is unavailable."); return end\ncamera.CFrame = CFrame.lookAt(camera.CFrame.Position, target.Position)`)),
    make("read-coins", "Read Coins", `On click read the current player's numeric ${coins} attribute and show its current value in a visible English Coins notification.`, "Player", button("Read Coins","Show the current evidenced player currency attribute.","custom", `local value = ctx.player:GetAttribute("${coins}")\nif typeof(value) ~= "number" then ctx.notify("Coins are unavailable."); return end\nctx.notify("Coins: " .. tostring(value))`)),
    make("open-journal", "Open Journal", `On click find PlayerGui.${journal}.JournalPanel and set that existing Frame.Visible to true; do not invent quest remotes.`, "Player", button("Open Journal","Open the game's existing local journal panel.","custom", `local playerGui = ctx.player:FindFirstChild("PlayerGui")\nlocal journal = playerGui and playerGui:FindFirstChild("${journal}")\nlocal panel = journal and journal:FindFirstChild("JournalPanel")\nif not panel or not panel:IsA("Frame") then ctx.notify("Journal is unavailable."); return end\npanel.Visible = true`)),
    make("hud-visible", "Game HUD", `Toggle the existing PlayerGui.${hud} ScreenGui.Enabled, initially true; preserve its original value and restore it when the hub closes.`, "Player", toggle("Game HUD","Show or hide the game's evidenced local HUD.","custom", `local playerGui = ctx.player:FindFirstChild("PlayerGui")\nlocal hud = playerGui and playerGui:FindFirstChild("${hud}")\nif not hud or not hud:IsA("ScreenGui") then ctx.notify("Game HUD is unavailable."); return end\nif ctx.state.originalEnabled == nil then\n    ctx.state.originalEnabled = hud.Enabled\n    ctx.onCleanup(function() hud.Enabled = ctx.state.originalEnabled end)\nend\nhud.Enabled = ctx.enabled`, true)),
    make("rejoin", "Rejoin", "On click use TeleportService:Teleport(game.PlaceId, player) to rejoin the current place, with the platform choosing the destination instance.", "Session", button("Rejoin","Rejoin the current place when clicked.","rejoin")),
    make("theme", "Theme", "Toggle the window's actually applied colors between the two exact requested palettes.", "Settings", toggle("Theme","Switch between the requested primary and alternate palettes.","theme")),
  ];
  return new Map(entries.map(action => [action.id, action]));
}

export function buildRows(): Record<Split, DatasetRow[]> {
  const counts: Record<Split,number> = { train:128, validation:16, test:24 };
  const result: Record<Split,DatasetRow[]> = { train:[], validation:[], test:[] };
  for (const split of ["train","validation","test"] as const) for (let index = 0; index < counts[split]; index++) {
    const design = designFamilies[split][Math.floor(index / actionFamilies[split].length) % designFamilies[split].length];
    const family = actionFamilies[split][index % actionFamilies[split].length];
    const id = `${split}-${String(index + 1).padStart(3,"0")}`;
    const token = `${split === "train" ? "Cedar" : split === "validation" ? "Quartz" : "Orbit"}${index + 1}`;
    const game = `${token} Expedition`;
    const objectNames = { landmark:`${token}Beacon`, hud:`${token}HUD`, journal:`${token}Journal`, coins:`${token}Coins` };
    const available = actionsFor(index, objectNames);
    const actions = family.actions.map(action => available.get(action)!);
    const categories = (["Movement","World","Player","Session","Settings"] as const).filter(category => actions.some(action => action.category === category));
    const french = index % 2 === 0;
    const title = index % 4 === 0 ? "" : index % 4 === 1 ? `${token} Control` : index % 4 === 2 ? `${token} "Prime"` : `${token} Station`;
    const width = design.width + (Math.floor(index / 12) % 3) * 12;
    const height = design.height + (index % 3) * 8;
    const textSize = 12 + (index % 3) * 2;
    const alternatePalette: HubComposition["window"]["palette"] = { background: [19,28,34], foreground: [244,250,247], accent: [130 + index % 20,215,175], control: [34,48,53], muted: [170,193,192] };
    const paletteText = (value: HubComposition["window"]["palette"]) => Object.entries(value).map(([key,value]) => `${key}=${rgb(value)}`).join("; ");
    const pageOrder = index % 3 === 0 ? [...categories].reverse() : [...categories];
    const request = (french ? `Crée un Full Hub complet pour mon jeu fictif ${game}. ` : `Create a complete Full Hub for my fictional owned game ${game}. `)
      + (title ? `Use the exact custom title ${JSON.stringify(title)}. ` : "No title, brand, author credit or visible hub name. ")
      + `Window ${width}x${height} pixels, radius ${design.radius}, ${design.font} font size ${textSize}, draggable header, ${design.navigation} navigation; Close, Minimize and Restore controls. `
      + `Primary palette: ${paletteText(design.palette)}. Alternate palette: ${paletteText(alternatePalette)}. `
      + `Exact pages in this order: ${pageOrder.map(page => french ? pageTranslations[page] : page).join(", ")}; all functional UI must be English. `
      + `Put each control on its matching category page. Implement every requirements behavior, with no disabled or decorative controls: ${actions.map(action => `[${action.category}] ${action.label}`).join("; ")}.`;
    const contract: GenerationContract = {
      fullHub: true,
      ui: { instructions: `Follow the exact title, dimensions, palettes, font and radius in the original request; create real ${design.navigation} navigation in order ${pageOrder.join(", ")}. Functional text is English.`, requiredText: [...(title ? [title] : []),...pageOrder,"Close","Minimize","Restore",...actions.map(action => action.label)] },
      features: [
        { id:"interface", label:"Complete UI", behavior:`Create a draggable ${width}x${height} UI window with the exact requested title, palettes and ${design.navigation} tab navigation; close cleanup and minimize/restore work.`, availability:"supported", evidence:"Verified ScriptRush window renderer implements these GUI operations.", interaction:true },
        ...actions.map(action => ({ id:action.id, label:action.label, behavior:action.behavior, availability:"supported" as const, evidence:action.item.kind !== "text" && "action" in action.item && action.item.action === "custom" ? "Owned fictional game fixture: exact local object paths and permitted properties supplied in gameEvidence." : "Verified standard client utility renderer.", interaction:true })),
      ],
    };
    const composition: HubComposition = {
      window: { title,width,height,radius:design.radius,draggable:true,navigation:design.navigation,font:design.font,textSize,closeLabel:"Close",minimizeLabel:"Minimize",restoreLabel:"Restore",palette:structuredClone(design.palette),alternatePalette,featureIds:["interface"] },
      pages: pageOrder.map(category => ({ id:`page-${category.toLowerCase()}`, label:category, featureIds:[], items:actions.filter(action => action.category === category).map(action => structuredClone(action.item)) })),
    };
    const gameEvidence = {
      game,
      scope:"Original owned-game fixture for offline training; not evidence from a live Roblox game.",
      objects:[
        { path:`workspace.${objectNames.landmark}`,className:"Part",properties:{Position:"Vector3",Anchored:true} },
        { path:`Players.LocalPlayer.PlayerGui.${objectNames.hud}`,className:"ScreenGui",properties:{Enabled:true} },
        { path:`Players.LocalPlayer.PlayerGui.${objectNames.journal}.JournalPanel`,className:"Frame",properties:{Visible:false} },
        { path:"workspace.CurrentCamera",className:"Camera",properties:{FieldOfView:70,CFrame:"CFrame"} },
        { path:"Lighting",className:"Lighting",properties:{Brightness:1.5} },
      ],
      attributes:[{path:"Players.LocalPlayer",name:objectNames.coins,type:"number"}],
      notes:["Local presentation and standard utility APIs only. No invented remote, automation, network request, external loader or server action.","Use bounded FindFirstChild lookups and English notifications if an object disappears."],
    };
    result[split].push({ id,split,designFamily:design.id,actionFamily:family.id,messages:[{role:"system",content:SPECIALIST_SYSTEM},{role:"user",content:JSON.stringify({request,requirements:contract,gameEvidence})},{role:"assistant",content:JSON.stringify(composition)}],expected:{composition,contract,featureIds:contract.features.map(feature => feature.id),ui:{title,width,height,palette:composition.window.palette,pageLabels:pageOrder,font:design.font,textSize,radius:design.radius,navigation:design.navigation,language:"en"}} });
  }
  return result;
}
