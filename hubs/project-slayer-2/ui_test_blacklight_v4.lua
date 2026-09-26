-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V4
-- Fix pass: English-only, responsive columns, no text overflow, native toggle visuals,
-- and input layering cleanup. Test branch only.

local V3_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v3.lua"

local okHttp, source = pcall(game.HttpGet, game, V3_URL)
if not okHttp then
    warn("[A7DEV UI TEST V4] V3 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI TEST V4] V3 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI TEST V4] V3 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_V4_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_V4_STOP)
end

local alive = true
local connections = {}
local styledToggleRows = setmetatable({}, {__mode = "k"})
local textGuards = setmetatable({}, {__mode = "k"})

local function on(c)
    if c then connections[#connections + 1] = c end
    return c
end

local function stop()
    if not alive then return end
    alive = false
    for _, c in ipairs(connections) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(connections)
    ENV.A7DEV_PS2_BLACKLIGHT_V4_STOP = nil
end
ENV.A7DEV_PS2_BLACKLIGHT_V4_STOP = stop

local C = {
    bg = Color3.fromRGB(5, 5, 7),
    panel = Color3.fromRGB(14, 14, 17),
    control = Color3.fromRGB(20, 20, 24),
    active = Color3.fromRGB(35, 35, 40),
    border = Color3.fromRGB(38, 38, 44),
    border2 = Color3.fromRGB(31, 31, 36),
    text = Color3.fromRGB(240, 240, 245),
    muted = Color3.fromRGB(137, 140, 148),
    dim = Color3.fromRGB(84, 87, 95),
    white = Color3.fromRGB(235, 236, 241),
}

local ENGLISH = {
    ["Paramètres"] = "Settings",
    ["Parametres"] = "Settings",
    ["Réglages"] = "Settings",
    ["Reglages"] = "Settings",
    ["Pêche"] = "Fishing",
    ["Peche"] = "Fishing",
    ["Défense"] = "Defence",
    ["Defense"] = "Defence",
    ["Visuels"] = "Visuals",
    ["Mouvement"] = "Movement",
    ["Voyage"] = "Travel",
    ["Serveur"] = "Server",
    ["Joueur"] = "Player",
    ["Divers"] = "Misc",
    ["Quêtes"] = "Quests",
    ["Quetes"] = "Quests",
    ["Butin"] = "Loot",
    ["Progression"] = "Progression",
}

local function make(className, parent, properties)
    local o = Instance.new(className)
    for k, v in pairs(properties or {}) do o[k] = v end
    o.Parent = parent
    return o
end

local function corner(parent, radius)
    local c = parent:FindFirstChildOfClass("UICorner")
    if not c then c = make("UICorner", parent, {}) end
    c.CornerRadius = UDim.new(0, radius or 8)
    return c
end

local function stroke(parent, transparency)
    local s = parent:FindFirstChildOfClass("UIStroke")
    if not s then s = make("UIStroke", parent, {}) end
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Color = C.border
    s.Thickness = 1
    s.Transparency = transparency or .1
    return s
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and (main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V3")
    or main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V2"))

if not gui or not main or not root then
    warn("[A7DEV UI TEST V4] BlackLight root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V4"

-- Sibling stacking is much safer for reparented native controls.
pcall(function()
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
end)

root.Active = false

local function englishText(object)
    if not object or not object.Parent then return end
    if not (object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox")) then return end

    pcall(function() object.AutoLocalize = false end)

    local current = tostring(object.Text or "")
    local translated = ENGLISH[current]
    if translated then
        object.Text = translated
    end
end

local function guardEnglish(object)
    if textGuards[object] then return end
    textGuards[object] = true
    englishText(object)
    if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
        on(object:GetPropertyChangedSignal("Text"):Connect(function()
            if alive and object.Parent then englishText(object) end
        end))
    end
end

local function constrainText(object)
    if not object or not object.Parent then return end

    if object:IsA("TextButton") then
        if object.Text ~= "" then
            object.TextWrapped = false
            object.TextTruncate = Enum.TextTruncate.AtEnd
            object.TextXAlignment = Enum.TextXAlignment.Center
        end
    elseif object:IsA("TextLabel") then
        local text = tostring(object.Text or "")
        local height = object.AbsoluteSize.Y > 0 and object.AbsoluteSize.Y or object.Size.Y.Offset

        if #text >= 54 and height >= 28 then
            object.TextWrapped = true
            object.TextTruncate = Enum.TextTruncate.None
            object.TextYAlignment = Enum.TextYAlignment.Top
        else
            object.TextWrapped = false
            object.TextTruncate = Enum.TextTruncate.AtEnd
        end
    elseif object:IsA("TextBox") then
        object.TextWrapped = false
    end
end

local function findOldToggleBox(row)
    local candidate
    for _, child in ipairs(row:GetChildren()) do
        if child:IsA("Frame") and not string.find(child.Name, "A7DEV_V4_", 1, true) then
            local w = child.AbsoluteSize.X > 0 and child.AbsoluteSize.X or child.Size.X.Offset
            local h = child.AbsoluteSize.Y > 0 and child.AbsoluteSize.Y or child.Size.Y.Offset
            if w >= 12 and w <= 25 and h >= 12 and h <= 25 then
                candidate = child
                break
            end
        end
    end
    return candidate
end

local function styleNativeToggleRow(row)
    if styledToggleRows[row] or not row:IsA("TextButton") or row.Text ~= "" then return end

    local label = row:FindFirstChildWhichIsA("TextLabel")
    local oldBox = findOldToggleBox(row)
    if not label or not oldBox then return end

    local fill = oldBox:FindFirstChildWhichIsA("Frame")
    if not fill then
        for _, d in ipairs(oldBox:GetDescendants()) do
            if d:IsA("Frame") then
                fill = d
                break
            end
        end
    end

    styledToggleRows[row] = true
    row.BackgroundTransparency = 1
    row.BorderSizePixel = 0
    row.AutoButtonColor = false

    label.TextColor3 = C.text
    label.Font = Enum.Font.Gotham
    label.TextSize = math.clamp(label.TextSize, 9, 11)
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.TextTruncate = Enum.TextTruncate.AtEnd
    label.TextWrapped = false
    label.Position = UDim2.fromOffset(0, 0)
    label.Size = UDim2.new(1, -54, 1, 0)

    oldBox.Visible = false

    local track = make("Frame", row, {
        Name = "A7DEV_V4_SWITCH",
        Position = UDim2.new(1, -38, .5, -9),
        Size = UDim2.fromOffset(36, 18),
        BackgroundColor3 = C.control,
        BorderSizePixel = 0,
        ZIndex = row.ZIndex + 1,
        Active = false,
    })
    corner(track, 10)
    stroke(track, .08)

    local knob = make("Frame", track, {
        Name = "A7DEV_V4_KNOB",
        Position = UDim2.fromOffset(2, 2),
        Size = UDim2.fromOffset(14, 14),
        BackgroundColor3 = C.white,
        BorderSizePixel = 0,
        ZIndex = track.ZIndex + 1,
        Active = false,
    })
    corner(knob, 8)

    local function state()
        if fill then
            if fill.Visible then return true end
            if fill.BackgroundTransparency < .9 and fill.AbsoluteSize.X > 0 and fill.AbsoluteSize.Y > 0 then
                return true
            end
        end
        return false
    end

    local function sync()
        if not alive or not row.Parent then return end
        knob.Position = UDim2.fromOffset(state() and 20 or 2, 2)
    end

    sync()

    if fill then
        on(fill:GetPropertyChangedSignal("Visible"):Connect(sync))
        on(fill:GetPropertyChangedSignal("BackgroundTransparency"):Connect(sync))
    end

    -- Re-sync after the native callback runs.
    on(row.Activated:Connect(function()
        task.defer(sync)
    end))
end

local function normalizeControl(object)
    if not object or not object.Parent then return end

    guardEnglish(object)
    constrainText(object)

    if object:IsA("TextButton") then
        if object.Text == "" then
            styleNativeToggleRow(object)
        else
            object.Active = true
            object.Selectable = true
            object.AutoButtonColor = false
            object.BorderSizePixel = 0
            object.BackgroundColor3 = C.control
            object.TextColor3 = C.text
            object.Font = Enum.Font.GothamMedium
            object.TextSize = math.clamp(object.TextSize, 9, 11)
            corner(object, 7)
            stroke(object, .14)
        end
    elseif object:IsA("TextBox") then
        object.Active = true
        object.Selectable = true
        object.BorderSizePixel = 0
        object.BackgroundColor3 = C.control
        object.TextColor3 = C.text
        object.PlaceholderColor3 = C.muted
        object.Font = Enum.Font.Gotham
        object.TextSize = math.clamp(object.TextSize, 9, 11)
        corner(object, 7)
        stroke(object, .14)
    elseif object:IsA("TextLabel") then
        if object.TextColor3.R < .82 or object.TextColor3.G < .82 or object.TextColor3.B < .82 then
            object.TextColor3 = C.muted
        end
    end
end

local function getPages()
    local result = {}
    for _, d in ipairs(root:GetDescendants()) do
        if d:IsA("ScrollingFrame") and string.find(d.Name, "BlackLightPage_", 1, true) == 1 then
            result[#result + 1] = d
        end
    end
    return result
end

local function getColumns(page)
    local cols = {}
    for _, child in ipairs(page:GetChildren()) do
        if child:IsA("Frame") then
            local list = child:FindFirstChildOfClass("UIListLayout")
            if list then cols[#cols + 1] = child end
        end
    end
    table.sort(cols, function(a, b)
        return a.Position.X.Scale < b.Position.X.Scale
            or (a.Position.X.Scale == b.Position.X.Scale and a.Position.X.Offset < b.Position.X.Offset)
    end)
    return cols
end

local function responsivePage(page)
    page.BackgroundTransparency = 1
    page.BorderSizePixel = 0
    page.ClipsDescendants = true
    page.ScrollBarThickness = 2
    page.ScrollBarImageColor3 = C.dim

    local cols = getColumns(page)
    if #cols < 3 then return end

    -- Exact 3-column grid with 20 px margins and 16 px gaps.
    local positions = {
        UDim2.new(0, 20, 0, 18),
        UDim2.new(1/3, 12, 0, 18),
        UDim2.new(2/3, 4, 0, 18),
    }

    for i = 1, 3 do
        local col = cols[i]
        col.Position = positions[i]
        col.Size = UDim2.new(1/3, -24, 0, 0)
        col.AutomaticSize = Enum.AutomaticSize.Y
        col.BackgroundTransparency = 1
        col.BorderSizePixel = 0
        col.ClipsDescendants = false

        local layout = col:FindFirstChildOfClass("UIListLayout")
        if layout then
            layout.Padding = UDim.new(0, 14)
        end

        for _, card in ipairs(col:GetChildren()) do
            if card:IsA("Frame") and not card:IsA("UIListLayout") then
                card.Size = UDim2.new(1, 0, card.Size.Y.Scale, card.Size.Y.Offset)
                card.Position = UDim2.new()
                card.BorderSizePixel = 0
                if card.BackgroundTransparency < .95 then
                    card.BackgroundColor3 = C.panel
                    corner(card, 13)
                    stroke(card, .08)
                end

                for _, object in ipairs(card:GetDescendants()) do
                    normalizeControl(object)
                end
            end
        end
    end
end

local function hideBrokenSearchGlyph()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextLabel") then
            local text = tostring(object.Text or "")
            if text == "⌕" or text == "□" then
                local parent = object.Parent
                if parent and parent:IsA("Frame") and object.Position.X.Scale > .5 then
                    object.Visible = false
                end
            end
        end
    end

    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextBox") and object.PlaceholderText == "Search settings..." then
            local padding = object:FindFirstChildOfClass("UIPadding")
            if padding then padding.PaddingLeft = UDim.new(0, 13) end
            object.PlaceholderText = "Search settings..."
            break
        end
    end
end

local function forceEnglishTabs()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextButton") or object:IsA("TextLabel") then
            guardEnglish(object)
        end
    end
end

local function fixKnownStatusLines()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextLabel") then
            local t = tostring(object.Text or "")
            if string.find(t, "Session:", 1, true) == 1
                or string.find(t, "Progress:", 1, true) == 1
                or string.find(t, "Fishing:", 1, true) == 1
                or string.find(t, "Crafting:", 1, true) == 1
                or string.find(t, "God Mode:", 1, true) == 1 then
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
                object.TextXAlignment = Enum.TextXAlignment.Left
                object.Size = UDim2.new(1, -24, object.Size.Y.Scale, math.max(16, object.Size.Y.Offset))
            end
        elseif object:IsA("TextButton") then
            if #tostring(object.Text or "") > 34 then
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
            end
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end

    forceEnglishTabs()
    hideBrokenSearchGlyph()

    for _, page in ipairs(getPages()) do
        responsivePage(page)
    end

    for _, object in ipairs(root:GetDescendants()) do
        normalizeControl(object)
    end

    fixKnownStatusLines()
end

fullPass()

local queued = false
local function queuePass()
    if queued then return end
    queued = true
    task.defer(function()
        queued = false
        if alive then fullPass() end
    end)
end

on(root.DescendantAdded:Connect(function(object)
    if not alive then return end
    if string.find(object.Name or "", "A7DEV_V4_", 1, true) then return end
    queuePass()
end))

-- Native content changes dynamically when toggles/dropdowns update.
for _, object in ipairs(root:GetDescendants()) do
    if object:IsA("TextButton") then
        on(object.Activated:Connect(function()
            task.delay(.03, queuePass)
        end))
    end
end

on(main:GetPropertyChangedSignal("Size"):Connect(queuePass))
on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then queuePass() end
end))

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))

task.delay(.35, function()
    if alive then fullPass() end
end)
task.delay(1.2, function()
    if alive then fullPass() end
end)
