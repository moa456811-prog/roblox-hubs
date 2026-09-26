-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V3
-- Loads V2, then applies a strict visual polish pass.
-- Test branch only. Production loader/main.lua stay untouched.

local V2_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v2.lua"

local okHttp, source = pcall(game.HttpGet, game, V2_URL)
if not okHttp then
    warn("[A7DEV UI TEST V3] V2 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI TEST V3] V2 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI TEST V3] V2 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_POLISH_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_POLISH_STOP)
end

local alive = true
local connections = {}
local styled = setmetatable({}, {__mode = "k"})
local updating = setmetatable({}, {__mode = "k"})

local function on(c)
    if c then connections[#connections + 1] = c end
    return c
end

local function stopPolish()
    if not alive then return end
    alive = false
    for _, c in ipairs(connections) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(connections)
    ENV.A7DEV_PS2_BLACKLIGHT_POLISH_STOP = nil
end
ENV.A7DEV_PS2_BLACKLIGHT_POLISH_STOP = stopPolish

local C = {
    bg = Color3.fromRGB(5, 5, 7),
    panel = Color3.fromRGB(14, 14, 17),
    control = Color3.fromRGB(20, 20, 24),
    hover = Color3.fromRGB(25, 25, 30),
    active = Color3.fromRGB(35, 35, 40),
    border = Color3.fromRGB(38, 38, 44),
    border2 = Color3.fromRGB(31, 31, 36),
    text = Color3.fromRGB(240, 240, 245),
    muted = Color3.fromRGB(137, 140, 148),
    dim = Color3.fromRGB(84, 87, 95),
    white = Color3.fromRGB(235, 236, 241),
}

local function redLike(color)
    return typeof(color) == "Color3"
        and color.R > .24
        and color.R > color.G * 1.35
        and color.R > color.B * 1.18
end

local function mk(className, parent, props)
    local o = Instance.new(className)
    for k, v in pairs(props or {}) do o[k] = v end
    o.Parent = parent
    return o
end

local function corner(parent, radius)
    local c = parent:FindFirstChildOfClass("UICorner")
    if not c then c = mk("UICorner", parent, {}) end
    c.CornerRadius = UDim.new(0, radius or 8)
    return c
end

local function stroke(parent, transparency)
    local s = parent:FindFirstChildOfClass("UIStroke")
    if not s then s = mk("UIStroke", parent, {}) end
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Color = C.border
    s.Thickness = 1
    s.Transparency = transparency or .1
    return s
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
if not gui then
    warn("[A7DEV UI TEST V3] GUI not found.")
    stopPolish()
    return
end

local main = gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V2")
if not main or not root then
    warn("[A7DEV UI TEST V3] V2 root not found.")
    stopPolish()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V3"
root.BackgroundColor3 = C.bg
main.BackgroundColor3 = C.bg
main.BorderSizePixel = 0
corner(main, 9)
stroke(main, .04)

-- Find important V2 containers without depending on child creation order.
local searchBox
local secondaryBar
local contentHost
local footer
local topBar

for _, d in ipairs(root:GetDescendants()) do
    if d:IsA("TextBox") and d.PlaceholderText == "Search settings..." then
        searchBox = d
        topBar = d.Parent
        break
    end
end

for _, child in ipairs(root:GetChildren()) do
    if child:IsA("Frame") then
        if child.Position.Y.Scale == 0 and child.Position.Y.Offset == 53 and child.Size.Y.Offset == 40 then
            secondaryBar = child
        elseif child.Position.Y.Scale == 1 and child.Position.Y.Offset == -24 and child.Size.Y.Offset == 24 then
            footer = child
        else
            for _, nested in ipairs(child:GetChildren()) do
                if nested:IsA("ScrollingFrame") and string.find(nested.Name, "BlackLightPage_", 1, true) == 1 then
                    contentHost = child
                    break
                end
            end
        end
    end
end

-- Main window fidelity.
main.Size = UDim2.fromOffset(956, 565)
main.AnchorPoint = Vector2.new(.5, .5)
root.ClipsDescendants = true

if topBar then
    topBar.BackgroundColor3 = C.bg
    topBar.BorderSizePixel = 0
end
if secondaryBar then
    secondaryBar.BackgroundColor3 = C.bg
    secondaryBar.BorderSizePixel = 0
end
if contentHost then
    contentHost.BackgroundColor3 = C.bg
    contentHost.BorderSizePixel = 0
end
if footer then
    footer.BackgroundColor3 = C.bg
    footer.BorderSizePixel = 0
end

-- Search is deliberately flatter and quieter like the reference.
if searchBox then
    searchBox.Size = UDim2.fromOffset(186, 34)
    searchBox.Position = UDim2.new(1, -304, 0, 8)
    searchBox.BackgroundColor3 = C.control
    searchBox.BackgroundTransparency = 0
    searchBox.TextColor3 = C.text
    searchBox.PlaceholderColor3 = C.muted
    searchBox.TextSize = 10
    searchBox.Font = Enum.Font.Gotham
    corner(searchBox, 9)
    stroke(searchBox, .12)
end

local function isSection(object)
    return object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_"
end

local function isOurDecoration(object)
    return string.find(object.Name, "A7DEV_CLEAN_", 1, true) == 1
end

local function findSectionTitle(section)
    local candidate
    local y = math.huge
    for _, child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and child.Text ~= "" and not isOurDecoration(child) then
            local cy = child.Position.Y.Offset
            if cy < y then
                candidate = child
                y = cy
            end
        end
    end
    return candidate
end

local function normalizeSwitch(frame)
    if not frame:IsA("Frame") then return end
    local name = frame.Name or ""
    local isNamedSwitch = string.find(name, "SWITCH", 1, true) ~= nil
    local w = frame.Size.X.Offset
    local h = frame.Size.Y.Offset
    local switchSized = w >= 28 and w <= 48 and h >= 14 and h <= 24
    if not isNamedSwitch and not switchSized then return end

    local knob
    for _, child in ipairs(frame:GetChildren()) do
        if child:IsA("Frame") then
            local kw = child.Size.X.Offset
            local kh = child.Size.Y.Offset
            if kw >= 10 and kw <= 20 and kh >= 10 and kh <= 20 then
                knob = child
                break
            end
        end
    end
    if not knob then return end

    frame.Size = UDim2.fromOffset(36, 18)
    frame.BackgroundColor3 = C.control
    frame.BackgroundTransparency = 0
    corner(frame, 10)
    stroke(frame, .08)

    knob.Size = UDim2.fromOffset(14, 14)
    knob.BackgroundColor3 = C.white
    knob.BorderSizePixel = 0
    corner(knob, 8)

    local onState = knob.Position.X.Offset > 9
    knob.Position = UDim2.fromOffset(onState and 20 or 2, 2)
end

local function normalizeSliderParts(parent)
    for _, object in ipairs(parent:GetDescendants()) do
        if object:IsA("Frame") and not isSection(object) then
            local h = object.Size.Y.Offset
            local w = object.Size.X.Offset
            if h > 0 and h <= 8 and (object.Size.X.Scale > .15 or w >= 48) then
                object.BorderSizePixel = 0
                if redLike(object.BackgroundColor3) then
                    object.BackgroundColor3 = C.white
                elseif object.BackgroundTransparency < .95 then
                    object.BackgroundColor3 = C.border
                end
                corner(object, 6)
            elseif h >= 9 and h <= 16 and w >= 9 and w <= 16 and redLike(object.BackgroundColor3) then
                object.BackgroundColor3 = C.white
                corner(object, 8)
            end
        end
    end
end

local function addChevron(section)
    if section:FindFirstChild("A7DEV_CLEAN_CHEVRON") then return end
    mk("TextLabel", section, {
        Name = "A7DEV_CLEAN_CHEVRON",
        Position = UDim2.new(1, -31, 0, 8),
        Size = UDim2.fromOffset(18, 24),
        BackgroundTransparency = 1,
        Text = "⌄",
        Font = Enum.Font.GothamBold,
        TextSize = 11,
        TextColor3 = C.dim,
        ZIndex = 150,
    })
end

local function addHeaderLine(section)
    local line = section:FindFirstChild("A7DEV_BLACKLIGHT_SEPARATOR")
    if line and line:IsA("Frame") then
        line.Name = "A7DEV_CLEAN_SEPARATOR"
        line.Position = UDim2.fromOffset(16, 39)
        line.Size = UDim2.new(1, -32, 0, 1)
        line.BackgroundColor3 = C.border2
        line.BackgroundTransparency = 0
        line.BorderSizePixel = 0
        return
    end
    if section:FindFirstChild("A7DEV_CLEAN_SEPARATOR") then return end
    mk("Frame", section, {
        Name = "A7DEV_CLEAN_SEPARATOR",
        Position = UDim2.fromOffset(16, 39),
        Size = UDim2.new(1, -32, 0, 1),
        BackgroundColor3 = C.border2,
        BorderSizePixel = 0,
        ZIndex = 149,
    })
end

local function normalizeButton(button)
    if not button:IsA("TextButton") then return end
    if button.Text == "" then
        button.BackgroundTransparency = 1
        return
    end

    button.BorderSizePixel = 0
    button.BackgroundColor3 = C.control
    button.BackgroundTransparency = 0
    button.TextColor3 = C.text
    button.Font = Enum.Font.GothamMedium
    button.TextSize = math.clamp(button.TextSize, 9, 11)

    if button.Size.Y.Offset > 0 and button.Size.Y.Offset < 28 then
        button.Size = UDim2.new(button.Size.X.Scale, button.Size.X.Offset, button.Size.Y.Scale, 30)
    elseif button.Size.Y.Offset > 36 and button.Size.Y.Offset < 50 then
        button.Size = UDim2.new(button.Size.X.Scale, button.Size.X.Offset, button.Size.Y.Scale, 34)
    end

    corner(button, 7)
    stroke(button, .14)
end

local function normalizeInput(box)
    box.BorderSizePixel = 0
    box.BackgroundColor3 = C.control
    box.BackgroundTransparency = 0
    box.TextColor3 = C.text
    box.PlaceholderColor3 = C.muted
    box.Font = Enum.Font.Gotham
    box.TextSize = math.clamp(box.TextSize, 9, 11)
    corner(box, 7)
    stroke(box, .14)
end

local function normalizeLabel(label, title)
    label.BackgroundTransparency = 1
    if title then
        label.Font = Enum.Font.GothamBold
        label.TextSize = 11
        label.TextColor3 = C.text
    else
        label.Font = Enum.Font.Gotham
        label.TextSize = math.clamp(label.TextSize, 8, 11)
        if redLike(label.TextColor3) then
            label.TextColor3 = C.text
        elseif label.TextColor3.R < .83 or label.TextColor3.G < .83 or label.TextColor3.B < .83 then
            label.TextColor3 = C.muted
        end
    end
end

local function neutralizeImages(parent)
    for _, object in ipairs(parent:GetDescendants()) do
        if object:IsA("ImageLabel") or object:IsA("ImageButton") then
            if redLike(object.ImageColor3) then
                object.ImageColor3 = C.muted
            end
        elseif object:IsA("UIStroke") then
            object.Color = C.border
        elseif object:IsA("Frame") and redLike(object.BackgroundColor3) then
            local h = object.Size.Y.Offset
            local w = object.Size.X.Offset
            if h > 0 and h <= 8 and (object.Size.X.Scale > .15 or w >= 48) then
                object.BackgroundColor3 = C.white
            else
                object.BackgroundColor3 = C.control
            end
        end
    end
end

local function polishSection(section)
    if not section or not section.Parent or not isSection(section) then return end
    if section.Name == "Section_Diagnostics" or section.Name == "Section_Live Boss Scanner" then
        section.Visible = false
        return
    end

    section.BackgroundColor3 = C.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    section.ClipsDescendants = false
    section.Size = UDim2.new(1, 0, section.Size.Y.Scale, section.Size.Y.Offset)
    corner(section, 13)
    stroke(section, .08)

    local title = findSectionTitle(section)
    if title then normalizeLabel(title, true) end

    addHeaderLine(section)
    addChevron(section)

    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("TextButton") then
            normalizeButton(object)
        elseif object:IsA("TextBox") then
            normalizeInput(object)
        elseif object:IsA("TextLabel") and object ~= title and not isOurDecoration(object) then
            normalizeLabel(object, false)
        elseif object:IsA("ScrollingFrame") then
            object.BackgroundTransparency = 1
            object.BorderSizePixel = 0
            object.ScrollBarThickness = 2
            object.ScrollBarImageColor3 = C.dim
        elseif object:IsA("Frame") then
            normalizeSwitch(object)
        end
    end

    normalizeSliderParts(section)
    neutralizeImages(section)
end

local function polishCard(card)
    if not card:IsA("Frame") or isSection(card) then return end
    local parent = card.Parent
    if not parent or not parent:IsA("Frame") then return end
    if not parent.Parent or not parent.Parent:IsA("ScrollingFrame") then return end

    if card.BackgroundTransparency < .9 then
        card.BackgroundColor3 = C.panel
        card.BorderSizePixel = 0
        corner(card, 13)
        stroke(card, .08)
    end

    for _, object in ipairs(card:GetDescendants()) do
        if object:IsA("TextButton") then
            normalizeButton(object)
        elseif object:IsA("TextBox") then
            normalizeInput(object)
        elseif object:IsA("TextLabel") then
            local topTitle = object.Position.Y.Offset <= 12 and object.Text ~= ""
            normalizeLabel(object, topTitle)
        end
    end
    neutralizeImages(card)
end

local function polishPage(page)
    if not page:IsA("ScrollingFrame") or string.find(page.Name, "BlackLightPage_", 1, true) ~= 1 then return end
    page.BackgroundTransparency = 1
    page.BorderSizePixel = 0
    page.ScrollBarThickness = 2
    page.ScrollBarImageColor3 = C.dim

    for _, child in ipairs(page:GetChildren()) do
        if child:IsA("Frame") then
            child.BackgroundTransparency = 1
            child.BorderSizePixel = 0
            local layout = child:FindFirstChildOfClass("UIListLayout")
            if layout then layout.Padding = UDim.new(0, 14) end

            for _, card in ipairs(child:GetChildren()) do
                if isSection(card) then
                    polishSection(card)
                elseif card:IsA("Frame") then
                    polishCard(card)
                end
            end
        end
    end
end

local function polishTopNavigation()
    if not topBar then return end
    topBar.BackgroundColor3 = C.bg

    for _, object in ipairs(topBar:GetChildren()) do
        if object:IsA("TextButton") then
            object.BorderSizePixel = 0
            corner(object, 9)
            if object.Text == "" then
                -- Primary navigation tab.
                if object.BackgroundTransparency == 0 then
                    object.BackgroundColor3 = C.active
                end
                for _, d in ipairs(object:GetDescendants()) do
                    if d:IsA("TextLabel") then
                        d.Font = Enum.Font.GothamBold
                        d.TextSize = 10
                    elseif d:IsA("ImageLabel") then
                        if redLike(d.ImageColor3) then d.ImageColor3 = C.muted end
                    end
                end
            else
                -- Window controls.
                object.BackgroundColor3 = C.control
                object.TextColor3 = C.muted
                stroke(object, .18)
            end
        elseif object:IsA("TextLabel") then
            if object.Text == "A7" then
                object.TextColor3 = C.white
                object.TextSize = 17
            end
        end
    end
end

local function polishSecondary()
    if not secondaryBar then return end
    secondaryBar.BackgroundColor3 = C.bg

    for _, object in ipairs(secondaryBar:GetChildren()) do
        if object:IsA("TextButton") then
            object.BorderSizePixel = 0
            object.Font = Enum.Font.Gotham
            object.TextSize = 9
            corner(object, 8)
            if object.BackgroundTransparency == 0 then
                object.BackgroundColor3 = C.active
                object.TextColor3 = C.text
            else
                object.TextColor3 = C.muted
            end
        end
    end
end

local function polishFooter()
    if not footer then return end
    footer.BackgroundColor3 = C.bg
    for _, d in ipairs(footer:GetDescendants()) do
        if d:IsA("TextLabel") then
            d.Font = Enum.Font.Gotham
            d.TextSize = 8
            d.TextColor3 = C.muted
        elseif d:IsA("Frame") then
            d.BackgroundColor3 = C.border2
        end
    end
end

local function polishAll()
    if not alive or not root.Parent then return end
    polishTopNavigation()
    polishSecondary()
    polishFooter()

    for _, page in ipairs(root:GetDescendants()) do
        if page:IsA("ScrollingFrame") and string.find(page.Name, "BlackLightPage_", 1, true) == 1 then
            polishPage(page)
        end
    end
end

polishAll()

-- New controls/sections created by the running Slayer script receive the same finish.
local queued = false
local function queuePolish()
    if queued then return end
    queued = true
    task.defer(function()
        queued = false
        if alive then polishAll() end
    end)
end

on(root.DescendantAdded:Connect(function(object)
    if not alive then return end
    if isOurDecoration(object) then return end
    queuePolish()
end))

if secondaryBar then
    on(secondaryBar.ChildAdded:Connect(queuePolish))
end

-- Active tab states are changed by V2; repolish immediately after a click.
if topBar then
    for _, object in ipairs(topBar:GetChildren()) do
        if object:IsA("TextButton") then
            on(object.Activated:Connect(function()
                task.defer(polishAll)
            end))
        end
    end
end

-- Keep layout crisp after show/hide / maximize operations.
on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then task.defer(polishAll) end
end))
on(main:GetPropertyChangedSignal("Size"):Connect(function()
    task.defer(polishAll)
end))

-- Stop polish when V2 destroys its root.
on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stopPolish() end
end))

task.delay(.35, function()
    if alive then polishAll() end
end)
task.delay(1.25, function()
    if alive then polishAll() end
end)
