local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local guiName = "GeneratedHub_Aurora Panel"
local previousGui = playerGui:FindFirstChild(guiName)
if previousGui then previousGui:Destroy() end
local gui = Instance.new("ScreenGui")
gui.Name = guiName
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
local connections, cleanupCallbacks, themeBindings, pages, navigationButtons, controls, initialCallbacks = {}, {}, {}, {}, {}, {}, {}
local closed, themeIndex = false, 1
local palettes = { { background = Color3.fromRGB(18, 24, 42), foreground = Color3.fromRGB(240, 245, 255), accent = Color3.fromRGB(85, 221, 255), control = Color3.fromRGB(30, 43, 68), muted = Color3.fromRGB(175, 191, 213) } }
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
panel.Size = UDim2.fromOffset(420, 280)
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
title.Size = UDim2.new(1, -108, 0, 48)
title.Text = "Aurora Panel"
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
closeButton.Position = UDim2.fromOffset(340, 9)
closeButton.TextWrapped = true
own(closeButton.Activated, function()
    closeHub()
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

local page1 = make("ScrollingFrame", "page_home", panel)
page1.Position = UDim2.fromOffset(16, 92)
page1.Size = UDim2.new(1, -32, 1, -126)
page1.BackgroundTransparency = 1
page1.BorderSizePixel = 0
page1.ScrollBarThickness = 4
page1.AutomaticCanvasSize = Enum.AutomaticSize.Y
page1.CanvasSize = UDim2.fromOffset(0, 0)
page1.Visible = true
pages["home"] = page1
local page1Layout = make("UIListLayout", "Layout", page1)
page1Layout.Padding = UDim.new(0, 10)
page1Layout.SortOrder = Enum.SortOrder.LayoutOrder

local nav1 = button("nav_home", "Home", navigation)
nav1.Size = UDim2.fromOffset(191, 30)
nav1.LayoutOrder = 1
navigationButtons["home"] = nav1
own(nav1.Activated, function()
    selectPage("home")
end)

local item1_1 = row(page1, "row_welcome-text", 38, 1)
local item1_1Text = label(item1_1, "text_welcome-text", "Welcome", 0, item1_1.Size.Y.Offset)
controls["welcome-text"] = item1_1Text

local page2 = make("ScrollingFrame", "page_settings", panel)
page2.Position = UDim2.fromOffset(16, 92)
page2.Size = UDim2.new(1, -32, 1, -126)
page2.BackgroundTransparency = 1
page2.BorderSizePixel = 0
page2.ScrollBarThickness = 4
page2.AutomaticCanvasSize = Enum.AutomaticSize.Y
page2.CanvasSize = UDim2.fromOffset(0, 0)
page2.Visible = false
pages["settings"] = page2
local page2Layout = make("UIListLayout", "Layout", page2)
page2Layout.Padding = UDim.new(0, 10)
page2Layout.SortOrder = Enum.SortOrder.LayoutOrder

local nav2 = button("nav_settings", "Settings", navigation)
nav2.Size = UDim2.fromOffset(191, 30)
nav2.LayoutOrder = 2
navigationButtons["settings"] = nav2
own(nav2.Activated, function()
    selectPage("settings")
end)

local item2_1 = row(page2, "row_preferences-text", 38, 1)
local item2_1Text = label(item2_1, "text_preferences-text", "Preferences", 0, item2_1.Size.Y.Offset)
controls["preferences-text"] = item2_1Text

selectPage("home")
gui.Parent = playerGui
for _, callback in ipairs(initialCallbacks) do callback() end