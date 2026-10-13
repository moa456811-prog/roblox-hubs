local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local guiName = "GeneratedHub_Quality Trial"
local previousGui = playerGui:FindFirstChild(guiName)
if previousGui then previousGui:Destroy() end
local gui = Instance.new("ScreenGui")
gui.Name = guiName
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
local connections, cleanupCallbacks, themeBindings, pages, navigationButtons, controls, initialCallbacks = {}, {}, {}, {}, {}, {}, {}
local closed, themeIndex = false, 1
local palettes = { { background = Color3.fromRGB(18, 24, 42), foreground = Color3.fromRGB(240, 245, 255), accent = Color3.fromRGB(85, 221, 255), control = Color3.fromRGB(30, 43, 68), muted = Color3.fromRGB(175, 191, 213) }, { background = Color3.fromRGB(42, 24, 18), foreground = Color3.fromRGB(255, 245, 240), accent = Color3.fromRGB(255, 136, 85), control = Color3.fromRGB(68, 43, 30), muted = Color3.fromRGB(213, 191, 175) } }
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
    corner.CornerRadius = UDim.new(0, 12)
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
    object.Font = Enum.Font.Gotham
    object.TextSize = 14
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
panel.Size = UDim2.fromOffset(480, 360)
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.BorderSizePixel = 0
paint(panel, "BackgroundColor3", "background")
round(panel)
local header = make("Frame", "Header", panel)
header.Size = UDim2.new(1, 0, 0, 48)
header.BackgroundTransparency = 1
local title = make("TextLabel", "Title", header)
title.Position = UDim2.fromOffset(16, 0)
title.Size = UDim2.new(1, -198, 0, 48)
title.Text = "Quality Trial"
title.TextWrapped = true
title.TextXAlignment = Enum.TextXAlignment.Left
title.BackgroundTransparency = 1
textStyle(title)
local restoreButton = button("RestoreButton", "Restore", gui)
restoreButton.Size = UDim2.fromOffset(120, 36)
restoreButton.Position = UDim2.fromOffset(16, 16)
restoreButton.Visible = false
local function minimizeHub()
    panel.Visible = false
    restoreButton.Visible = true
end
own(restoreButton.Activated, function()
    panel.Visible = true
    restoreButton.Visible = false
end)

local closeButton = button("CloseButton", "Close", header)
closeButton.Size = UDim2.fromOffset(68, 30)
closeButton.Position = UDim2.fromOffset(400, 9)
closeButton.TextWrapped = true
own(closeButton.Activated, function()
    closeHub()
end)

local minimizeButton = button("MinimizeButton", "Minimize", header)
minimizeButton.Size = UDim2.fromOffset(82, 30)
minimizeButton.Position = UDim2.fromOffset(310, 9)
minimizeButton.TextWrapped = true
own(minimizeButton.Activated, function()
    minimizeHub()
end)

header.Active = true
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
end)

local status = make("TextLabel", "Status", panel)
status.Position = UDim2.new(0, 16, 1, -30)
status.Size = UDim2.new(1, -32, 0, 24)
status.BackgroundTransparency = 1
status.Text = ""
status.TextWrapped = true
status.TextXAlignment = Enum.TextXAlignment.Left
textStyle(status)
paint(status, "TextColor3", "muted")
local function notify(message)
    if not closed then status.Text = tostring(message) end
end
local gameplayControlSetters = {}
local gameplay = nil
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
    object.Size = UDim2.new(1, 0, 0, 20)
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
end

local navigation = make("ScrollingFrame", "Navigation", panel)
navigation.Position = UDim2.fromOffset(16, 52)
navigation.Size = UDim2.new(1, -32, 0, 34)
navigation.BackgroundTransparency = 1
navigation.BorderSizePixel = 0
navigation.ScrollBarThickness = 2
navigation.ScrollingDirection = Enum.ScrollingDirection.X
navigation.AutomaticCanvasSize = Enum.AutomaticSize.X
navigation.CanvasSize = UDim2.fromOffset(0, 0)
local navigationLayout = make("UIListLayout", "Layout", navigation)
navigationLayout.FillDirection = Enum.FillDirection.Horizontal
navigationLayout.SortOrder = Enum.SortOrder.LayoutOrder
navigationLayout.Padding = UDim.new(0, 6)

local page1 = make("ScrollingFrame", "page_movement", panel)
page1.Position = UDim2.fromOffset(16, 92)
page1.Size = UDim2.new(1, -32, 1, -126)
page1.BackgroundTransparency = 1
page1.BorderSizePixel = 0
page1.ScrollBarThickness = 4
page1.AutomaticCanvasSize = Enum.AutomaticSize.Y
page1.CanvasSize = UDim2.fromOffset(0, 0)
page1.Visible = true
pages["movement"] = page1
local page1Layout = make("UIListLayout", "Layout", page1)
page1Layout.Padding = UDim.new(0, 10)
page1Layout.SortOrder = Enum.SortOrder.LayoutOrder

local nav1 = button("nav_movement", "Movement", navigation)
nav1.Size = UDim2.fromOffset(145, 30)
nav1.LayoutOrder = 1
navigationButtons["movement"] = nav1
own(nav1.Activated, function()
    selectPage("movement")
end)

local item1_1 = row(page1, "row_walk-speed-control", 84, 1)
label(item1_1, "Label", "Walk Speed", 0, 24)
local item1_1Description = label(item1_1, "Description", "Adjust the local character walk speed from 8 to 32.", 25, 20)
paint(item1_1Description, "TextColor3", "muted")
local item1_1InputRow = make("Frame", "InputRow", item1_1)
item1_1InputRow.Size = UDim2.new(1, 0, 0, 32)
item1_1InputRow.BackgroundTransparency = 1
item1_1InputRow.LayoutOrder = 46
local item1_1Input = make("TextBox", "input_walk-speed-control", item1_1InputRow)
item1_1Input.Size = UDim2.new(0.55, -4, 0, 32)
item1_1Input.Position = UDim2.fromOffset(0, 0)
item1_1Input.Text = "16"
item1_1Input.ClearTextOnFocus = false
item1_1Input.BorderSizePixel = 0
textStyle(item1_1Input)
paint(item1_1Input, "BackgroundColor3", "control")
round(item1_1Input)
local item1_1Button = button("apply_walk-speed-control", "Apply", item1_1InputRow)
item1_1Button.Size = UDim2.new(0.45, -4, 0, 32)
item1_1Button.Position = UDim2.new(0.55, 4, 0, 0)
controls["walk-speed-control"] = item1_1Button
local item1_1State = {}
own(item1_1Button.Activated, function()
    local value = tonumber(item1_1Input.Text)
    if not value or value ~= value or value < 8 or value > 32 then
        notify("Walk Speed: 8 – 32")
        return
    end
    local character = player.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if not humanoid then notify("Walk Speed: character unavailable"); return end
    humanoid.WalkSpeed = value
    notify("Walk Speed: " .. tostring(value))
end)

local item1_2 = row(page1, "row_jump-power-control", 84, 2)
label(item1_2, "Label", "Jump Power", 0, 24)
local item1_2Description = label(item1_2, "Description", "Adjust the local character jump power from 20 to 75.", 25, 20)
paint(item1_2Description, "TextColor3", "muted")
local item1_2InputRow = make("Frame", "InputRow", item1_2)
item1_2InputRow.Size = UDim2.new(1, 0, 0, 32)
item1_2InputRow.BackgroundTransparency = 1
item1_2InputRow.LayoutOrder = 46
local item1_2Input = make("TextBox", "input_jump-power-control", item1_2InputRow)
item1_2Input.Size = UDim2.new(0.55, -4, 0, 32)
item1_2Input.Position = UDim2.fromOffset(0, 0)
item1_2Input.Text = "50"
item1_2Input.ClearTextOnFocus = false
item1_2Input.BorderSizePixel = 0
textStyle(item1_2Input)
paint(item1_2Input, "BackgroundColor3", "control")
round(item1_2Input)
local item1_2Button = button("apply_jump-power-control", "Apply", item1_2InputRow)
item1_2Button.Size = UDim2.new(0.45, -4, 0, 32)
item1_2Button.Position = UDim2.new(0.55, 4, 0, 0)
controls["jump-power-control"] = item1_2Button
local item1_2State = {}
own(item1_2Button.Activated, function()
    local value = tonumber(item1_2Input.Text)
    if not value or value ~= value or value < 20 or value > 75 then
        notify("Jump Power: 20 – 75")
        return
    end
    local character = player.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if not humanoid then notify("Jump Power: character unavailable"); return end
    humanoid.UseJumpPower = true
    humanoid.JumpPower = value
    notify("Jump Power: " .. tostring(value))
end)

local page2 = make("ScrollingFrame", "page_session", panel)
page2.Position = UDim2.fromOffset(16, 92)
page2.Size = UDim2.new(1, -32, 1, -126)
page2.BackgroundTransparency = 1
page2.BorderSizePixel = 0
page2.ScrollBarThickness = 4
page2.AutomaticCanvasSize = Enum.AutomaticSize.Y
page2.CanvasSize = UDim2.fromOffset(0, 0)
page2.Visible = false
pages["session"] = page2
local page2Layout = make("UIListLayout", "Layout", page2)
page2Layout.Padding = UDim.new(0, 10)
page2Layout.SortOrder = Enum.SortOrder.LayoutOrder

local nav2 = button("nav_session", "Session", navigation)
nav2.Size = UDim2.fromOffset(145, 30)
nav2.LayoutOrder = 2
navigationButtons["session"] = nav2
own(nav2.Activated, function()
    selectPage("session")
end)

local item2_1 = row(page2, "row_rejoin-button", 100, 1)
label(item2_1, "Label", "Rejoin", 0, 24)
local item2_1Description = label(item2_1, "Description", "Reconnect to the current place using TeleportService.", 25, 36)
paint(item2_1Description, "TextColor3", "muted")
local item2_1Button = button("c_rejoin-button", "Rejoin", item2_1)
item2_1Button.Size = UDim2.new(1, 0, 0, 32)
item2_1Button.LayoutOrder = 62
controls["rejoin-button"] = item2_1Button
local item2_1State = {}
own(item2_1Button.Activated, function()
    local success = pcall(function()
        TeleportService:Teleport(game.PlaceId, player)
    end)
    if not success then notify("Rejoin: action failed") end
end)

local page3 = make("ScrollingFrame", "page_settings", panel)
page3.Position = UDim2.fromOffset(16, 92)
page3.Size = UDim2.new(1, -32, 1, -126)
page3.BackgroundTransparency = 1
page3.BorderSizePixel = 0
page3.ScrollBarThickness = 4
page3.AutomaticCanvasSize = Enum.AutomaticSize.Y
page3.CanvasSize = UDim2.fromOffset(0, 0)
page3.Visible = false
pages["settings"] = page3
local page3Layout = make("UIListLayout", "Layout", page3)
page3Layout.Padding = UDim.new(0, 10)
page3Layout.SortOrder = Enum.SortOrder.LayoutOrder

local nav3 = button("nav_settings", "Settings", navigation)
nav3.Size = UDim2.fromOffset(145, 30)
nav3.LayoutOrder = 3
navigationButtons["settings"] = nav3
own(nav3.Activated, function()
    selectPage("settings")
end)

local item3_1 = row(page3, "row_theme-toggle", 100, 1)
label(item3_1, "Label", "Switch Theme", 0, 24)
local item3_1Description = label(item3_1, "Description", "Toggle between the default and alternate UI color palette.", 25, 36)
paint(item3_1Description, "TextColor3", "muted")
local item3_1Enabled = false
local item3_1Button = button("c_theme-toggle", item3_1Enabled and "Alternate" or "Default", item3_1)
item3_1Button.Size = UDim2.new(1, 0, 0, 32)
item3_1Button.LayoutOrder = 62
controls["theme-toggle"] = item3_1Button
local item3_1State = {}
local function item3_1Apply()
    switchTheme()
end
own(item3_1Button.Activated, function()
    item3_1Enabled = not item3_1Enabled
    item3_1Button.Text = item3_1Enabled and "Alternate" or "Default"
    item3_1Apply()
end)

selectPage("movement")
gui.Parent = playerGui
for _, callback in ipairs(initialCallbacks) do callback() end