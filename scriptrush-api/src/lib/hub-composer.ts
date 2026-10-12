import type { HubComposition, HubItem } from "./hub-spec.ts";

/** Lua short strings have different control-character escapes than JSON. */
export function luaString(value: string): string {
  return '"' + value.replace(/[\\"\x00-\x1f\x7f]/g, char => char === "\\" ? "\\\\" : char === '"' ? '\\"' : `\\${char.charCodeAt(0).toString().padStart(3, "0")}`) + '"';
}
const luaBool = (value: boolean) => value ? "true" : "false";
const palette = (value: HubComposition["window"]["palette"]) => `{ ${Object.entries(value).map(([key, rgb]) => `${key} = Color3.fromRGB(${rgb.join(", ")})`).join(", ")} }`;
const indented = (text: string, spaces: number) => text.split("\n").map(line => " ".repeat(spaces) + line).join("\n");

/** Compose real feature handlers around a fixed, verified ownership and layout implementation.
 * All visual values and requested controls come from the validated composition.
 */
export function renderHubComposition(spec: HubComposition): string {
  const w = spec.window;
  const controlLabels = [w.minimizeLabel, w.closeLabel].filter((label): label is string => Boolean(label));
  const headerButtonWidths = controlLabels.map(label => Math.max(68, Math.ceil(label.length * w.textSize * .55 + 20)));
  const controlsWidth = headerButtonWidths.reduce((sum, width) => sum + width + 8, 0);
  const stackedHeader = controlsWidth + Math.min(w.width - 32, Math.max(100, w.title.length * w.textSize * .55)) > w.width - 32;
  const titleHeight = stackedHeader ? Math.max(36, Math.ceil(w.title.length * w.textSize * .6 / (w.width - 32)) * (w.textSize + 6)) : Math.max(48, w.textSize + 30);
  const headerButtonHeight = Math.max(30, w.textSize + 14);
  const stackedButtonHeights = controlLabels.map(label => Math.max(headerButtonHeight, Math.ceil(label.length * w.textSize * .6 / (w.width - 32)) * (w.textSize + 6) + 8));
  const headerHeight = stackedHeader ? titleHeight + stackedButtonHeights.reduce((sum, height) => sum + height + 4, 0) + 8 : titleHeight;
  const navigationY = headerHeight + 4;
  const statusHeight = Math.max(24, w.textSize + 8), bottomHeight = statusHeight + 10;
  const left = w.navigation === "left" ? Math.min(160, Math.max(100, Math.floor(w.width * .28))) : 0;
  const contentTop = w.navigation === "top" ? navigationY + 40 : headerHeight + 8;
  if (contentTop + 44 >= w.height) throw new Error("HUB_WINDOW_TOO_SHORT_FOR_REQUESTED_HEADER");
  const headerControls = new Map(controlLabels.map((label, index) => [index === controlLabels.length - 1 && w.closeLabel ? "close" : "minimize", {
    width: stackedHeader ? w.width - 32 : headerButtonWidths[index],
    height: stackedHeader ? stackedButtonHeights[index] : headerButtonHeight,
    x: stackedHeader ? 16 : w.width - 12 - headerButtonWidths.slice(index).reduce((sum, width) => sum + width, 0) - 8 * (headerButtonWidths.length - index - 1),
    y: stackedHeader ? titleHeight + stackedButtonHeights.slice(0, index).reduce((sum, height) => sum + height + 4, 0) : Math.floor((headerHeight - headerButtonHeight) / 2),
  }]));
  const code: string[] = [`local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local guiName = ${luaString(w.title ? "GeneratedHub_" + w.title : "GeneratedHub")}
local previousGui = playerGui:FindFirstChild(guiName)
if previousGui then previousGui:Destroy() end
local gui = Instance.new("ScreenGui")
gui.Name = guiName
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
local connections, cleanupCallbacks, themeBindings, pages, navigationButtons, controls, initialCallbacks = {}, {}, {}, {}, {}, {}, {}
local closed, themeIndex = false, 1
local palettes = { ${palette(w.palette)}${w.alternatePalette ? ", " + palette(w.alternatePalette) : ""} }
local function own(signal, callback)
    local connection = signal:Connect(callback)
    table.insert(connections, connection)
    return connection
end
local function onCleanup(callback)
    table.insert(cleanupCallbacks, callback)
end
local function cleanup()
    if closed then return end
    closed = true
    for _, connection in ipairs(connections) do connection:Disconnect() end
    table.clear(connections)
    for index = #cleanupCallbacks, 1, -1 do pcall(cleanupCallbacks[index]) end
    table.clear(cleanupCallbacks)
end
own(gui.Destroying, cleanup)
local function closeHub()
    cleanup()
    gui:Destroy()
end
local function make(className, name, parent)
    local object = Instance.new(className)
    object.Name = name
    object.Parent = parent
    return object
end
local function round(object)
    local corner = make("UICorner", "Corner", object)
    corner.CornerRadius = UDim.new(0, ${w.radius})
end
local function paint(object, property, key)
    table.insert(themeBindings, { object = object, property = property, key = key })
    if property == "BackgroundColor3" then
        object.BackgroundColor3 = palettes[themeIndex][key]
    elseif property == "TextColor3" then
        object.TextColor3 = palettes[themeIndex][key]
    end
end
local function applyTheme()
    for _, binding in ipairs(themeBindings) do
        if binding.property == "BackgroundColor3" then
            binding.object.BackgroundColor3 = palettes[themeIndex][binding.key]
        elseif binding.property == "TextColor3" then
            binding.object.TextColor3 = palettes[themeIndex][binding.key]
        end
    end
end
local function switchTheme()
    themeIndex = themeIndex == 1 and 2 or 1
    applyTheme()
end
local function textStyle(object)
    object.Font = Enum.Font.${w.font}
    object.TextSize = ${w.textSize}
    paint(object, "TextColor3", "foreground")
end
local function button(name, text, parent)
    local object = make("TextButton", name, parent)
    object.Text = text
    object.AutoButtonColor = true
    object.BorderSizePixel = 0
    textStyle(object)
    paint(object, "BackgroundColor3", "control")
    round(object)
    return object
end
local panel = make("Frame", "Panel", gui)
panel.Size = UDim2.fromOffset(${w.width}, ${w.height})
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.BorderSizePixel = 0
paint(panel, "BackgroundColor3", "background")
round(panel)
local header = make("Frame", "Header", panel)
header.Size = UDim2.new(1, 0, 0, ${headerHeight})
header.BackgroundTransparency = 1
${w.title ? `local title = make("TextLabel", "Title", header)
title.Position = UDim2.fromOffset(16, 0)
title.Size = UDim2.new(1, -${stackedHeader ? 32 : 32 + controlsWidth}, 0, ${titleHeight})
title.Text = ${luaString(w.title)}
title.TextWrapped = true
title.TextXAlignment = Enum.TextXAlignment.Left
title.BackgroundTransparency = 1
textStyle(title)` : ""}
local restoreButton = button("RestoreButton", ${luaString(w.restoreLabel)}, gui)
restoreButton.Size = UDim2.fromOffset(${Math.min(w.width - 24, Math.max(120, w.restoreLabel.length * 8 + 28))}, 36)
restoreButton.Position = UDim2.fromOffset(16, 16)
restoreButton.Visible = false
local function minimizeHub()
    panel.Visible = false
    restoreButton.Visible = true
end
own(restoreButton.Activated, function()
    panel.Visible = true
    restoreButton.Visible = false
end)`];
  if (w.closeLabel) {
    const layout = headerControls.get("close")!;
    code.push(`local closeButton = button("CloseButton", ${luaString(w.closeLabel)}, header)
closeButton.Size = UDim2.fromOffset(${layout.width}, ${layout.height})
closeButton.Position = UDim2.fromOffset(${layout.x}, ${layout.y})
closeButton.TextWrapped = true
own(closeButton.Activated, function()
    closeHub()
end)`);
  }
  if (w.minimizeLabel) {
    const layout = headerControls.get("minimize")!;
    code.push(`local minimizeButton = button("MinimizeButton", ${luaString(w.minimizeLabel)}, header)
minimizeButton.Size = UDim2.fromOffset(${layout.width}, ${layout.height})
minimizeButton.Position = UDim2.fromOffset(${layout.x}, ${layout.y})
minimizeButton.TextWrapped = true
own(minimizeButton.Activated, function()
    minimizeHub()
end)`);
  }
  if (w.draggable) code.push(`header.Active = true
local dragging, startPointer, startPosition
own(header.InputBegan, function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        startPointer = input.Position
        startPosition = panel.Position
    end
end)
own(UserInputService.InputChanged, function(input)
    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - startPointer
        panel.Position = UDim2.new(startPosition.X.Scale, startPosition.X.Offset + delta.X, startPosition.Y.Scale, startPosition.Y.Offset + delta.Y)
    end
end)
own(UserInputService.InputEnded, function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
end)`);
  code.push(`local status = make("TextLabel", "Status", panel)
status.Position = UDim2.new(0, ${16 + left}, 1, -${statusHeight + 6})
status.Size = UDim2.new(1, -${32 + left}, 0, ${statusHeight})
status.BackgroundTransparency = 1
status.Text = ""
status.TextWrapped = true
status.TextXAlignment = Enum.TextXAlignment.Left
textStyle(status)
paint(status, "TextColor3", "muted")
local function notify(message)
    if not closed then status.Text = tostring(message) end
end
local function row(parent, name, height, order)
    local object = make("Frame", name, parent)
    object.Size = UDim2.new(1, -8, 0, 0)
    object.AutomaticSize = Enum.AutomaticSize.Y
    object.BackgroundTransparency = 1
    object.LayoutOrder = order
    local layout = make("UIListLayout", "ContentLayout", object)
    layout.FillDirection = Enum.FillDirection.Vertical
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Padding = UDim.new(0, 4)
    return object
end
local function label(parent, name, text, y, height)
    local object = make("TextLabel", name, parent)
    object.Size = UDim2.new(1, 0, 0, ${w.textSize + 6})
    object.AutomaticSize = Enum.AutomaticSize.Y
    object.LayoutOrder = y
    object.BackgroundTransparency = 1
    object.Text = text
    object.TextWrapped = true
    object.TextXAlignment = Enum.TextXAlignment.Left
    object.TextYAlignment = Enum.TextYAlignment.Top
    textStyle(object)
    return object
end
local function selectPage(selected)
    for id, page in pairs(pages) do page.Visible = id == selected end
    for id, navButton in pairs(navigationButtons) do
        for _, binding in ipairs(themeBindings) do
            if binding.object == navButton and binding.property == "BackgroundColor3" then
                binding.key = id == selected and "accent" or "control"
            end
            if binding.object == navButton and binding.property == "TextColor3" then
                binding.key = id == selected and "background" or "foreground"
            end
        end
    end
    applyTheme()
end`);
  if (w.navigation !== "none") {
    const top = w.navigation === "top";
    code.push(`local navigation = make("ScrollingFrame", "Navigation", panel)
navigation.Position = UDim2.fromOffset(16, ${navigationY})
navigation.Size = ${top ? "UDim2.new(1, -32, 0, 34)" : `UDim2.new(0, ${left - 12}, 1, -${navigationY + bottomHeight + 8})`}
navigation.BackgroundTransparency = 1
navigation.BorderSizePixel = 0
navigation.ScrollBarThickness = 2
navigation.ScrollingDirection = Enum.ScrollingDirection.${top ? "X" : "Y"}
navigation.AutomaticCanvasSize = Enum.AutomaticSize.${top ? "X" : "Y"}
navigation.CanvasSize = UDim2.fromOffset(0, 0)
local navigationLayout = make("UIListLayout", "Layout", navigation)
navigationLayout.FillDirection = Enum.FillDirection.${top ? "Horizontal" : "Vertical"}
navigationLayout.SortOrder = Enum.SortOrder.LayoutOrder
navigationLayout.Padding = UDim.new(0, 6)`);
  }
  spec.pages.forEach((page, pageIndex) => {
    const p = `page${pageIndex + 1}`;
    code.push(`local ${p} = make("ScrollingFrame", ${luaString("page_" + page.id)}, panel)
${p}.Position = UDim2.fromOffset(${16 + left}, ${contentTop})
${p}.Size = UDim2.new(1, -${32 + left}, 1, -${contentTop + bottomHeight})
${p}.BackgroundTransparency = 1
${p}.BorderSizePixel = 0
${p}.ScrollBarThickness = 4
${p}.AutomaticCanvasSize = Enum.AutomaticSize.Y
${p}.CanvasSize = UDim2.fromOffset(0, 0)
${p}.Visible = ${luaBool(pageIndex === 0)}
pages[${luaString(page.id)}] = ${p}
local ${p}Layout = make("UIListLayout", "Layout", ${p})
${p}Layout.Padding = UDim.new(0, 10)
${p}Layout.SortOrder = Enum.SortOrder.LayoutOrder`);
    if (w.navigation !== "none") code.push(`local nav${pageIndex + 1} = button(${luaString("nav_" + page.id)}, ${luaString(page.label)}, navigation)
nav${pageIndex + 1}.Size = UDim2.fromOffset(${w.navigation === "top" ? Math.max(80, Math.floor((w.width - 32 - 6 * (spec.pages.length - 1)) / spec.pages.length)) : left - 16}, 30)
nav${pageIndex + 1}.LayoutOrder = ${pageIndex + 1}
navigationButtons[${luaString(page.id)}] = nav${pageIndex + 1}
own(nav${pageIndex + 1}.Activated, function()
    selectPage(${luaString(page.id)})
end)`);
    page.items.forEach((item, index) => code.push(renderItem(item, p, index + 1, pageIndex, w.textSize)));
  });
  code.push(`selectPage(${luaString(spec.pages[0].id)})
gui.Parent = playerGui
for _, callback in ipairs(initialCallbacks) do callback() end`);
  return code.join("\n\n");
}

function renderItem(item: HubItem, page: string, order: number, pageIndex: number, textSize: number): string {
  const name = `item${pageIndex + 1}_${order}`, qid = luaString(item.id);
  const controlHeight = Math.max(32, textSize + 14);
  if (item.kind === "text") return `local ${name} = row(${page}, ${luaString("row_" + item.id)}, ${Math.max(38, Math.min(400, 22 * (Math.ceil(item.text.length / 48) + item.text.split("\n").length - 1)))}, ${order})
local ${name}Text = label(${name}, ${luaString("text_" + item.id)}, ${luaString(item.text)}, 0, ${name}.Size.Y.Offset)
controls[${qid}] = ${name}Text`;
  if (item.kind === "disabled") return `local ${name} = row(${page}, ${luaString("row_" + item.id)}, ${76 + Math.min(180, Math.ceil(item.reason.length / 50) * 16)}, ${order})
local ${name}Button = button(${luaString("c_" + item.id)}, ${luaString(item.label)}, ${name})
${name}Button.Size = UDim2.new(1, 0, 0, ${controlHeight})
${name}Button.LayoutOrder = 0
${name}Button.Interactable = false
${name}Button.Active = false
${name}Button.AutoButtonColor = false
local ${name}Reason = label(${name}, "UnavailableReason", ${luaString(item.reason)}, 38, ${name}.Size.Y.Offset - 38)
paint(${name}Reason, "TextColor3", "muted")
controls[${qid}] = ${name}Button`;
  const descHeight = item.description ? Math.max(20, Math.min(72, Math.ceil(item.description.length / 52) * 18)) : 0;
  const y = 26 + descHeight, height = y + 38;
  const lines = [`local ${name} = row(${page}, ${luaString("row_" + item.id)}, ${height}, ${order})
label(${name}, "Label", ${luaString(item.label)}, 0, 24)`];
  if (item.description) lines.push(`local ${name}Description = label(${name}, "Description", ${luaString(item.description)}, 25, ${descHeight})
paint(${name}Description, "TextColor3", "muted")`);
  if (item.kind === "number") {
    lines.push(`local ${name}InputRow = make("Frame", "InputRow", ${name})
${name}InputRow.Size = UDim2.new(1, 0, 0, ${controlHeight})
${name}InputRow.BackgroundTransparency = 1
${name}InputRow.LayoutOrder = ${y}
local ${name}Input = make("TextBox", ${luaString("input_" + item.id)}, ${name}InputRow)
${name}Input.Size = UDim2.new(0.55, -4, 0, ${controlHeight})
${name}Input.Position = UDim2.fromOffset(0, 0)
${name}Input.Text = ${luaString(String(item.initial))}
${name}Input.ClearTextOnFocus = false
${name}Input.BorderSizePixel = 0
textStyle(${name}Input)
paint(${name}Input, "BackgroundColor3", "control")
round(${name}Input)
local ${name}Button = button(${luaString("apply_" + item.id)}, ${luaString(item.applyLabel)}, ${name}InputRow)
${name}Button.Size = UDim2.new(0.45, -4, 0, ${controlHeight})
${name}Button.Position = UDim2.new(0.55, 4, 0, 0)
controls[${qid}] = ${name}Button
local ${name}State = {}
own(${name}Button.Activated, function()
    local value = tonumber(${name}Input.Text)
    if not value or value ~= value or value < ${item.min} or value > ${item.max} then
        notify(${luaString(`${item.label}: ${item.min} – ${item.max}`)})
        return
    end
${indented(behavior(item, name), 4)}
end)`);
  } else if (item.kind === "toggle") {
    lines.push(`local ${name}Enabled = ${luaBool(item.initial)}
local ${name}Button = button(${luaString("c_" + item.id)}, ${name}Enabled and ${luaString(item.onLabel)} or ${luaString(item.offLabel)}, ${name})
${name}Button.Size = UDim2.new(1, 0, 0, ${controlHeight})
${name}Button.LayoutOrder = ${y}
controls[${qid}] = ${name}Button
local ${name}State = {}
local function ${name}Apply()
${indented(behavior(item, name), 4)}
end
own(${name}Button.Activated, function()
    ${name}Enabled = not ${name}Enabled
    ${name}Button.Text = ${name}Enabled and ${luaString(item.onLabel)} or ${luaString(item.offLabel)}
    ${name}Apply()
end)`);
    if (item.initial) lines.push(`table.insert(initialCallbacks, ${name}Apply)`);
  } else {
    lines.push(`local ${name}Button = button(${luaString("c_" + item.id)}, ${luaString(item.label)}, ${name})
${name}Button.Size = UDim2.new(1, 0, 0, ${controlHeight})
${name}Button.LayoutOrder = ${y}
controls[${qid}] = ${name}Button
local ${name}State = {}
own(${name}Button.Activated, function()
${indented(behavior(item, name), 4)}
end)`);
  }
  return lines.join("\n");
}

function behavior(item: Exclude<HubItem, { kind: "text" | "disabled" }>, name: string): string {
  if (item.action === "rejoin") return `local success = pcall(function()
    TeleportService:Teleport(game.PlaceId, player)
end)
if not success then notify(${luaString(item.label + ": action failed")}) end`;
  if (item.action === "theme") return "switchTheme()";
  if (item.action === "close") return "closeHub()";
  if (item.action === "minimize") return "minimizeHub()";
  if (item.action === "walk-speed" || item.action === "jump-power") return `local character = player.Character
local humanoid = character and character:FindFirstChildOfClass("Humanoid")
if not humanoid then notify(${luaString(item.label + ": character unavailable")}); return end
${item.action === "walk-speed" ? "humanoid.WalkSpeed = value" : "humanoid.UseJumpPower = true\nhumanoid.JumpPower = value"}
notify(${luaString(item.label + ": ")} .. tostring(value))`;
  return `local ctx = {
    player = player, services = setmetatable({ Players = Players, UserInputService = UserInputService, TeleportService = TeleportService }, { __index = function(_, service) return game:GetService(service) end }),
    gui = gui, panel = panel, controls = controls, state = ${name}State,
    own = own, onCleanup = onCleanup, notify = notify, control = ${name}Button,
    value = ${item.kind === "number" ? "value" : "nil"}, input = ${item.kind === "number" ? name + "Input" : "nil"}, enabled = ${item.kind === "toggle" ? name + "Enabled" : "nil"},
}
${item.code}`;
}
