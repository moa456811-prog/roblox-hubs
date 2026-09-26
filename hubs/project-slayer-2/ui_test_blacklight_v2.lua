-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V2
-- Isolated presentation layer. Production Loader.lua/main.lua are untouched.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP)
end

local running = true
local connections = {}
local originalSections = {}
local originalDirectVisibility = {}
local root
local mini

local function connect(signal)
    if signal then
        connections[#connections + 1] = signal
    end
    return signal
end

local function disconnectAll()
    for _, c in ipairs(connections) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(connections)
end

local function make(className, parent, properties)
    local object = Instance.new(className)
    for key, value in pairs(properties or {}) do
        object[key] = value
    end
    object.Parent = parent
    return object
end

local function addCorner(parent, radius)
    return make("UICorner", parent, {CornerRadius = UDim.new(0, radius or 8)})
end

local function addStroke(parent, color, transparency)
    return make("UIStroke", parent, {
        ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
        Color = color,
        Thickness = 1,
        Transparency = transparency or 0,
    })
end

-- Exact palette sampled from the provided BlackLight references.
local COLOR = {
    background = Color3.fromRGB(5, 5, 7),
    panel = Color3.fromRGB(14, 14, 17),
    control = Color3.fromRGB(20, 20, 24),
    active = Color3.fromRGB(35, 35, 40),
    border = Color3.fromRGB(38, 38, 44),
    borderSoft = Color3.fromRGB(30, 30, 35),
    white = Color3.fromRGB(240, 240, 245),
    text = Color3.fromRGB(240, 240, 245),
    muted = Color3.fromRGB(118, 122, 130),
    dim = Color3.fromRGB(82, 85, 94),
}

local function lowercase(value)
    return string.lower(tostring(value or ""))
end

local function redLike(color)
    if typeof(color) ~= "Color3" then return false end
    return color.R > .25 and color.R > color.G * 1.35 and color.R > color.B * 1.2
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui

for _ = 1, 600 do
    if not running then return end
    gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
    if gui then break end
    task.wait(.1)
end

if not gui then
    warn("[A7DEV UI TEST V2] Slayer 2 GUI was not found.")
    return
end

local main = gui:FindFirstChild("Main")
if not main then
    for _, object in ipairs(gui:GetChildren()) do
        if object:IsA("Frame") then
            main = object
            break
        end
    end
end

if not main then
    warn("[A7DEV UI TEST V2] Main frame was not found.")
    return
end

for _, name in ipairs({
    "A7DEV_PS2_BLACKLIGHT_TEST",
    "A7DEV_PS2_BLACKLIGHT_TEST_V2",
}) do
    local old = main:FindFirstChild(name)
    if old then old:Destroy() end
end

for _, name in ipairs({
    "A7DEV_PS2_BLACKLIGHT_MINI",
    "A7DEV_PS2_BLACKLIGHT_MINI_V2",
    "A7DEV_PS2_KEYLIST",
    "A7DEV_PS2_KEYLIST_V2",
}) do
    local old = gui:FindFirstChild(name)
    if old then old:Destroy() end
end

local State = ENV.A7DEV_PROJECT_SLAYER_2

-- Snapshot every gameplay section before moving anything.
local sections = {}
for _, object in ipairs(main:GetDescendants()) do
    if object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_" then
        sections[#sections + 1] = object
        originalSections[object] = {
            parent = object.Parent,
            layoutOrder = object.LayoutOrder,
            size = object.Size,
            position = object.Position,
            automaticSize = object.AutomaticSize,
            visible = object.Visible,
            backgroundColor3 = object.BackgroundColor3,
            backgroundTransparency = object.BackgroundTransparency,
        }
    end
end

-- Hide only the old presentation tree. The controls remain alive and are reparented below.
for _, child in ipairs(main:GetChildren()) do
    if child:IsA("GuiObject") then
        originalDirectVisibility[child] = child.Visible
        child.Visible = false
    end
end

main.Name = "Main"
main.AnchorPoint = Vector2.new(.5, .5)
main.Position = UDim2.fromScale(.5, .5)
main.Size = UDim2.fromOffset(956, 565)
main.BackgroundColor3 = COLOR.background
main.BorderSizePixel = 0
main.ClipsDescendants = false

local mainCorner = main:FindFirstChildOfClass("UICorner")
if mainCorner then
    mainCorner.CornerRadius = UDim.new(0, 9)
else
    addCorner(main, 9)
end

local mainStroke = main:FindFirstChildOfClass("UIStroke")
if mainStroke then
    mainStroke.Color = COLOR.border
    mainStroke.Transparency = .05
    mainStroke.Thickness = 1
else
    addStroke(main, COLOR.border, .05)
end

local scale = main:FindFirstChildOfClass("UIScale")
if not scale then
    scale = make("UIScale", main, {Scale = 1})
end

root = make("Frame", main, {
    Name = "A7DEV_PS2_BLACKLIGHT_TEST_V2",
    Size = UDim2.fromScale(1, 1),
    BackgroundColor3 = COLOR.background,
    BorderSizePixel = 0,
    Active = true,
    ZIndex = 500,
})
addCorner(root, 9)

local function getViewport()
    local camera = workspace.CurrentCamera
    return camera and camera.ViewportSize or Vector2.new(1280, 720)
end

local defaultSize = Vector2.new(956, 565)
local maximized = false

local function fitWindow()
    if not running or not main.Parent or maximized then return end
    local viewport = getViewport()
    scale.Scale = math.max(.2, math.min(1, (viewport.X - 10) / defaultSize.X, (viewport.Y - 10) / defaultSize.Y))
    main.Position = UDim2.fromOffset(viewport.X / 2, viewport.Y / 2)
end

fitWindow()

if workspace.CurrentCamera then
    connect(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
        task.defer(fitWindow)
    end))
end

-- =========================================================
-- TOP BAR
-- =========================================================
local topBar = make("Frame", root, {
    Size = UDim2.new(1, 0, 0, 53),
    BackgroundColor3 = COLOR.background,
    BorderSizePixel = 0,
    ZIndex = 520,
})

make("Frame", topBar, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = COLOR.border,
    BorderSizePixel = 0,
    ZIndex = 521,
})

-- Compact monochrome A7 mark in the same footprint as the reference logo.
local logo = make("Frame", topBar, {
    Position = UDim2.fromOffset(16, 7),
    Size = UDim2.fromOffset(42, 38),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    ZIndex = 522,
})

make("TextLabel", logo, {
    Size = UDim2.fromScale(1, 1),
    BackgroundTransparency = 1,
    Text = "A7",
    Font = Enum.Font.GothamBlack,
    TextSize = 18,
    TextColor3 = COLOR.white,
    ZIndex = 523,
})

local PRIMARY = {"INFO", "MAIN", "PLAYER", "SERVER", "SETTINGS"}
local PRIMARY_ICON = {
    INFO = "rbxassetid://7733960981",
    MAIN = "rbxassetid://7733674079",
    PLAYER = "rbxassetid://7743875962",
    SERVER = "rbxassetid://7733992789",
    SETTINGS = "rbxassetid://7734053495",
}
local PRIMARY_X = {76, 153, 244, 343, 438}
local PRIMARY_W = {69, 81, 91, 87, 104}

local primaryButtons = {}

for index, key in ipairs(PRIMARY) do
    local button = make("TextButton", topBar, {
        Position = UDim2.fromOffset(PRIMARY_X[index], 7),
        Size = UDim2.fromOffset(PRIMARY_W[index], 36),
        BackgroundColor3 = COLOR.active,
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "",
        ZIndex = 522,
    })
    addCorner(button, 9)

    local icon = make("ImageLabel", button, {
        Position = UDim2.fromOffset(9, 9),
        Size = UDim2.fromOffset(18, 18),
        BackgroundTransparency = 1,
        Image = PRIMARY_ICON[key],
        ImageColor3 = COLOR.dim,
        ScaleType = Enum.ScaleType.Fit,
        ZIndex = 523,
    })

    local label = make("TextLabel", button, {
        Position = UDim2.fromOffset(32, 0),
        Size = UDim2.new(1, -35, 1, 0),
        BackgroundTransparency = 1,
        Text = key,
        Font = Enum.Font.GothamBold,
        TextSize = 10,
        TextColor3 = COLOR.dim,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 523,
    })

    primaryButtons[key] = {
        button = button,
        icon = icon,
        label = label,
    }
end

local searchBox = make("TextBox", topBar, {
    Position = UDim2.new(1, -304, 0, 7),
    Size = UDim2.fromOffset(186, 36),
    BackgroundColor3 = COLOR.control,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Search settings...",
    PlaceholderColor3 = COLOR.muted,
    Text = "",
    TextColor3 = COLOR.text,
    Font = Enum.Font.Gotham,
    TextSize = 10,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 523,
})
addCorner(searchBox, 9)
addStroke(searchBox, COLOR.border, .12)

make("UIPadding", searchBox, {
    PaddingLeft = UDim.new(0, 30),
    PaddingRight = UDim.new(0, 8),
})

make("TextLabel", topBar, {
    Position = UDim2.new(1, -295, 0, 7),
    Size = UDim2.fromOffset(22, 36),
    BackgroundTransparency = 1,
    Text = "⌕",
    Font = Enum.Font.GothamBold,
    TextSize = 17,
    TextColor3 = COLOR.muted,
    ZIndex = 524,
})

local function topButton(text, rightOffset, textSize)
    local button = make("TextButton", topBar, {
        Position = UDim2.new(1, rightOffset, 0, 9),
        Size = UDim2.fromOffset(32, 32),
        BackgroundColor3 = COLOR.control,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = text,
        Font = Enum.Font.GothamBold,
        TextSize = textSize or 12,
        TextColor3 = COLOR.muted,
        ZIndex = 524,
    })
    addCorner(button, 9)
    addStroke(button, COLOR.border, .18)
    return button
end

local minimizeButton = topButton("−", -112, 14)
local maximizeButton = topButton("↗", -75, 12)
local closeButton = topButton("×", -38, 15)

-- =========================================================
-- SECONDARY BAR / CONTENT / FOOTER
-- =========================================================
local secondaryBar = make("Frame", root, {
    Position = UDim2.fromOffset(0, 53),
    Size = UDim2.new(1, 0, 0, 40),
    BackgroundColor3 = COLOR.background,
    BorderSizePixel = 0,
    Visible = true,
    ZIndex = 515,
})

make("Frame", secondaryBar, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = COLOR.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 516,
})

local contentHost = make("Frame", root, {
    Position = UDim2.fromOffset(0, 93),
    Size = UDim2.new(1, 0, 1, -118),
    BackgroundColor3 = COLOR.background,
    BorderSizePixel = 0,
    ClipsDescendants = true,
    ZIndex = 501,
})

local footer = make("Frame", root, {
    Position = UDim2.new(0, 0, 1, -24),
    Size = UDim2.new(1, 0, 0, 24),
    BackgroundColor3 = COLOR.background,
    BorderSizePixel = 0,
    ZIndex = 520,
})

make("Frame", footer, {
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = COLOR.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 521,
})

make("TextLabel", footer, {
    Position = UDim2.fromOffset(16, 1),
    Size = UDim2.fromOffset(300, 22),
    BackgroundTransparency = 1,
    Text = "A7DEV HUB · Slayers 2",
    Font = Enum.Font.Gotham,
    TextSize = 8,
    TextColor3 = COLOR.muted,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 522,
})

make("TextLabel", footer, {
    Position = UDim2.new(1, -185, 0, 1),
    Size = UDim2.fromOffset(170, 22),
    BackgroundTransparency = 1,
    Text = "LeftControl · menu",
    Font = Enum.Font.Gotham,
    TextSize = 8,
    TextColor3 = COLOR.muted,
    TextXAlignment = Enum.TextXAlignment.Right,
    ZIndex = 522,
})

-- =========================================================
-- PAGE GRID
-- =========================================================
local pages = {}
local pageColumns = {}
local pageSections = {}

local PAGE_IDS = {
    "INFO",
    "MAIN:Settings",
    "MAIN:Farming",
    "MAIN:Dungeon",
    "MAIN:Progression",
    "MAIN:Spin",
    "MAIN:Misc",
    "PLAYER:Combat",
    "PLAYER:Visuals",
    "PLAYER:Movement",
    "PLAYER:Travel",
    "SERVER",
    "SETTINGS",
}

local function createPage(id)
    local page = make("ScrollingFrame", contentHost, {
        Name = "BlackLightPage_" .. id:gsub("[^%w]", "_"),
        Size = UDim2.fromScale(1, 1),
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        CanvasSize = UDim2.new(),
        AutomaticCanvasSize = Enum.AutomaticSize.Y,
        ScrollBarThickness = 2,
        ScrollBarImageColor3 = COLOR.muted,
        ScrollingDirection = Enum.ScrollingDirection.Y,
        Visible = false,
        ZIndex = 502,
    })

    local columnWidth = 298
    local gap = 15
    local startX = 16
    local columns = {}

    for i = 1, 3 do
        local column = make("Frame", page, {
            Position = UDim2.fromOffset(startX + (i - 1) * (columnWidth + gap), 18),
            Size = UDim2.fromOffset(columnWidth, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            ZIndex = 503,
        })

        make("UIListLayout", column, {
            SortOrder = Enum.SortOrder.LayoutOrder,
            Padding = UDim.new(0, 14),
        })

        columns[i] = column
    end

    pages[id] = page
    pageColumns[id] = columns
    pageSections[id] = {}
end

for _, id in ipairs(PAGE_IDS) do
    createPage(id)
end

local ROUTE = {
    ["Section_Farm Position"] = {"MAIN:Settings", 1, 10, "Farm Config"},
    ["Section_Farm Safety + Session"] = {"MAIN:Settings", 2, 10, "Kill Config"},
    ["Section_Defense"] = {"MAIN:Settings", 3, 10, "Defence"},

    ["Section_Farm Automation"] = {"MAIN:Farming", 1, 10, "Farming"},
    ["Section_Target Filter"] = {"MAIN:Farming", 1, 20, "Target"},
    ["Section_Boss Automation"] = {"MAIN:Farming", 2, 10, "Boss"},
    ["Section_Yeti"] = {"MAIN:Farming", 2, 20, "Yeti"},
    ["Section_Boss Actions"] = {"MAIN:Farming", 2, 30, "Boss Actions"},
    ["Section_Boss Selection"] = {"MAIN:Farming", 3, 10, "Boss Selection"},
    ["Section_Boss List"] = {"MAIN:Farming", 3, 20, "Boss List"},

    ["Section_Dungeon + Souls"] = {"MAIN:Dungeon", 1, 10, "Dungeon"},

    ["Section_Quest Assist"] = {"MAIN:Progression", 1, 10, "Quest Assist"},
    ["Section_Slayer Crow"] = {"MAIN:Progression", 1, 20, "Slayer Crow"},
    ["Section_Muzan Quest"] = {"MAIN:Progression", 1, 30, "Muzan Quest"},
    ["Section_Training Quests"] = {"MAIN:Progression", 2, 10, "Training"},
    ["Section_Race Automation"] = {"MAIN:Progression", 2, 20, "Race"},
    ["Section_Winter Lantern"] = {"MAIN:Progression", 2, 30, "Winter Lantern"},
    ["Section_Quest Manager"] = {"MAIN:Progression", 3, 10, "Quest Manager"},
    ["Section_Muzan"] = {"MAIN:Progression", 3, 20, "Muzan"},
    ["Section_Mastery"] = {"MAIN:Progression", 3, 30, "Mastery"},

    ["Section_Clan Spins"] = {"MAIN:Spin", 1, 10, "Spin"},

    ["Section_Chest + Loot"] = {"MAIN:Misc", 1, 10, "Loot"},
    ["Section_Inventory Helper"] = {"MAIN:Misc", 1, 20, "Inventory"},
    ["Section_Crafting / Alchemy"] = {"MAIN:Misc", 2, 10, "Crafting / Alchemy"},
    ["Section_Auto Sell"] = {"MAIN:Misc", 2, 20, "Auto Sell"},
    ["Section_Fishing"] = {"MAIN:Misc", 3, 10, "Fishing"},
    ["Section_Utilities"] = {"MAIN:Misc", 3, 20, "Utilities"},

    ["Section_Native Actions"] = {"PLAYER:Combat", 1, 10, "Fighting"},
    ["Section_Player Farm"] = {"PLAYER:Combat", 2, 10, "Player Farm"},

    ["Section_Visuals"] = {"PLAYER:Visuals", 1, 10, "Visuals"},

    ["Section_Movement"] = {"PLAYER:Movement", 1, 10, "Movement"},
    ["Section_Fly"] = {"PLAYER:Movement", 2, 10, "Fly"},
    ["Section_Horse"] = {"PLAYER:Movement", 3, 10, "Horse"},

    ["Section_Regions"] = {"PLAYER:Travel", 1, 10, "Regions"},
    ["Section_NPC / Trainer"] = {"PLAYER:Travel", 2, 10, "NPC / Trainer"},
    ["Section_Game Systems"] = {"PLAYER:Travel", 2, 20, "Game Systems"},
    ["Section_Activities"] = {"PLAYER:Travel", 3, 10, "Activities"},

    ["Section_Config"] = {"SETTINGS", 1, 10, "Configs"},
}

local titleOverride = setmetatable({}, {__mode = "k"})
local guarded = setmetatable({}, {__mode = "k"})
local styled = setmetatable({}, {__mode = "k"})

local function exactNeutral(object)
    if not object or not object.Parent then return end
    if guarded[object] then return end
    guarded[object] = true

    if object:IsA("UIStroke") then
        object.Color = COLOR.border
        if object.Transparency < .04 then object.Transparency = .04 end
    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        if redLike(object.ImageColor3) then object.ImageColor3 = COLOR.muted end
    elseif object:IsA("TextLabel") then
        if redLike(object.TextColor3) then object.TextColor3 = COLOR.text end
        if redLike(object.BackgroundColor3) then object.BackgroundColor3 = COLOR.control end
    elseif object:IsA("TextButton") then
        if object.Text ~= "" then
            object.BackgroundColor3 = COLOR.control
            object.BackgroundTransparency = 0
            object.TextColor3 = COLOR.text
        elseif redLike(object.BackgroundColor3) then
            object.BackgroundColor3 = COLOR.control
        end
    elseif object:IsA("TextBox") then
        object.BackgroundColor3 = COLOR.control
        object.TextColor3 = COLOR.text
        object.PlaceholderColor3 = COLOR.muted
    elseif object:IsA("Frame") then
        if redLike(object.BackgroundColor3) then
            local h = object.AbsoluteSize.Y > 0 and object.AbsoluteSize.Y or object.Size.Y.Offset
            local w = object.AbsoluteSize.X > 0 and object.AbsoluteSize.X or object.Size.X.Offset
            if h > 0 and h <= 8 and w >= 45 then
                object.BackgroundColor3 = COLOR.white
            elseif h > 0 and h <= 24 and w > 0 and w <= 52 then
                object.BackgroundColor3 = COLOR.control
            else
                object.BackgroundColor3 = COLOR.border
            end
        end
    end

    guarded[object] = nil
end

local function installNeutralWatch(object)
    if styled[object] then return end
    styled[object] = true
    exactNeutral(object)

    if object:IsA("UIStroke") then
        connect(object:GetPropertyChangedSignal("Color"):Connect(function()
            exactNeutral(object)
        end))
    elseif object:IsA("Frame") then
        connect(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            exactNeutral(object)
        end))
    elseif object:IsA("TextButton") or object:IsA("TextLabel") or object:IsA("TextBox") then
        connect(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            exactNeutral(object)
        end))
        connect(object:GetPropertyChangedSignal("TextColor3"):Connect(function()
            exactNeutral(object)
        end))
    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        connect(object:GetPropertyChangedSignal("ImageColor3"):Connect(function()
            exactNeutral(object)
        end))
    end
end

local function findTitleLabel(section)
    local best
    local bestY = math.huge

    for _, child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and child.Text ~= "" then
            local y = child.Position.Y.Offset
            if y < bestY then
                best = child
                bestY = y
            end
        end
    end

    if best then return best end

    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("TextLabel") and object.Text ~= "" then
            local y = object.AbsolutePosition.Y
            if y < bestY then
                best = object
                bestY = y
            end
        end
    end

    return best
end

local function styleSection(section, displayTitle)
    if not section or not section.Parent then return end

    section.Visible = true
    section.BackgroundColor3 = COLOR.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    section.ClipsDescendants = false

    local oldHeight = section.Size.Y.Offset
    if oldHeight <= 0 then
        oldHeight = math.floor(section.AbsoluteSize.Y + .5)
    end
    section.Size = UDim2.new(1, 0, 0, math.max(82, oldHeight))

    local c = section:FindFirstChildOfClass("UICorner")
    if c then
        c.CornerRadius = UDim.new(0, 13)
    else
        addCorner(section, 13)
    end

    local s = section:FindFirstChildOfClass("UIStroke")
    if s then
        s.Color = COLOR.border
        s.Transparency = .08
        s.Thickness = 1
    else
        addStroke(section, COLOR.border, .08)
    end

    local title = findTitleLabel(section)
    if title then
        if titleOverride[title] == nil then
            titleOverride[title] = title.Text
        end
        if displayTitle and displayTitle ~= "" then
            title.Text = displayTitle
        end
        title.Font = Enum.Font.GothamBold
        title.TextSize = 11
        title.TextColor3 = COLOR.text
        title.TextXAlignment = Enum.TextXAlignment.Left
    end

    local separator = section:FindFirstChild("A7DEV_BLACKLIGHT_SEPARATOR")
    if not separator then
        separator = make("Frame", section, {
            Name = "A7DEV_BLACKLIGHT_SEPARATOR",
            Position = UDim2.fromOffset(16, 40),
            Size = UDim2.new(1, -32, 0, 1),
            BackgroundColor3 = COLOR.border,
            BorderSizePixel = 0,
            ZIndex = 100,
        })
    end

    for _, object in ipairs(section:GetDescendants()) do
        if object == separator then
            -- no-op
        elseif object:IsA("ScrollingFrame") then
            object.BackgroundTransparency = 1
            object.BorderSizePixel = 0
            object.ScrollBarThickness = math.min(3, object.ScrollBarThickness)
            object.ScrollBarImageColor3 = COLOR.muted
        elseif object:IsA("TextButton") then
            object.BorderSizePixel = 0
            if object.Text ~= "" then
                object.BackgroundColor3 = COLOR.control
                object.BackgroundTransparency = 0
                object.TextColor3 = COLOR.text
                object.Font = Enum.Font.GothamMedium
                object.TextSize = math.clamp(object.TextSize, 9, 11)
                local bc = object:FindFirstChildOfClass("UICorner")
                if bc then bc.CornerRadius = UDim.new(0, 7) else addCorner(object, 7) end
                local bs = object:FindFirstChildOfClass("UIStroke")
                if bs then
                    bs.Color = COLOR.border
                    bs.Transparency = .15
                else
                    addStroke(object, COLOR.border, .15)
                end
            else
                object.BackgroundTransparency = 1
            end
        elseif object:IsA("TextBox") then
            object.BackgroundColor3 = COLOR.control
            object.BackgroundTransparency = 0
            object.BorderSizePixel = 0
            object.TextColor3 = COLOR.text
            object.PlaceholderColor3 = COLOR.muted
            object.Font = Enum.Font.Gotham
            object.TextSize = math.clamp(object.TextSize, 9, 11)
            local bc = object:FindFirstChildOfClass("UICorner")
            if bc then bc.CornerRadius = UDim.new(0, 7) else addCorner(object, 7) end
            local bs = object:FindFirstChildOfClass("UIStroke")
            if bs then
                bs.Color = COLOR.border
                bs.Transparency = .15
            end
        elseif object:IsA("TextLabel") and object ~= title then
            object.TextColor3 = redLike(object.TextColor3) and COLOR.text or object.TextColor3
            if object.TextColor3.R < .8 and object.TextColor3.G < .8 and object.TextColor3.B < .8 then
                object.TextColor3 = COLOR.muted
            end
            object.Font = Enum.Font.Gotham
            object.TextSize = math.clamp(object.TextSize, 8, 11)
        end

        if object:IsA("Frame") and string.find(object.Name, "SWITCH", 1, true) then
            object.BackgroundColor3 = COLOR.control
            local knob = object:FindFirstChildWhichIsA("Frame")
            if knob then knob.BackgroundColor3 = COLOR.white end
        end

        installNeutralWatch(object)
    end

    installNeutralWatch(section)
end

local function routeSection(section)
    if not section or not section.Parent then return end

    if section.Name == "Section_Diagnostics" or section.Name == "Section_Live Boss Scanner" then
        section.Visible = false
        return
    end

    local route = ROUTE[section.Name] or {"MAIN:Misc", 3, 900, string.gsub(section.Name, "^Section_", "")}
    local pageId = route[1]
    local columnIndex = route[2]
    local order = route[3]
    local displayTitle = route[4]

    local columns = pageColumns[pageId]
    if not columns or not columns[columnIndex] then return end

    section.Parent = columns[columnIndex]
    section.LayoutOrder = order
    section.Position = UDim2.new()
    styleSection(section, displayTitle)
    pageSections[pageId][section] = true
end

for _, section in ipairs(sections) do
    routeSection(section)
end

-- =========================================================
-- NATIVE LOOK CARDS
-- =========================================================
local function createCard(pageId, columnIndex, title, height, order)
    local card = make("Frame", pageColumns[pageId][columnIndex], {
        Size = UDim2.fromOffset(298, height or 150),
        BackgroundColor3 = COLOR.panel,
        BorderSizePixel = 0,
        LayoutOrder = order or -1000,
        ZIndex = 504,
    })
    addCorner(card, 13)
    addStroke(card, COLOR.border, .08)

    make("TextLabel", card, {
        Position = UDim2.fromOffset(16, 8),
        Size = UDim2.new(1, -32, 0, 26),
        BackgroundTransparency = 1,
        Text = title,
        Font = Enum.Font.GothamBold,
        TextSize = 11,
        TextColor3 = COLOR.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 505,
    })

    make("Frame", card, {
        Position = UDim2.fromOffset(16, 40),
        Size = UDim2.new(1, -32, 0, 1),
        BackgroundColor3 = COLOR.border,
        BorderSizePixel = 0,
        ZIndex = 505,
    })

    return card
end

local function infoRow(card, y, left, right)
    make("TextLabel", card, {
        Position = UDim2.fromOffset(16, y),
        Size = UDim2.new(.57, -16, 0, 22),
        BackgroundTransparency = 1,
        Text = left,
        Font = Enum.Font.Gotham,
        TextSize = 11,
        TextColor3 = COLOR.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 506,
    })

    make("TextLabel", card, {
        Position = UDim2.new(.57, 0, 0, y),
        Size = UDim2.new(.43, -16, 0, 22),
        BackgroundTransparency = 1,
        Text = right,
        Font = Enum.Font.Gotham,
        TextSize = 10,
        TextColor3 = COLOR.muted,
        TextXAlignment = Enum.TextXAlignment.Right,
        ZIndex = 506,
    })
end

local infoCard = createCard("INFO", 1, "Info", 150)
infoRow(infoCard, 52, "Hub", "A7DEV HUB")
infoRow(infoCard, 78, "Game", "Slayers 2")
infoRow(infoCard, 104, "Interface", "BlackLight")

local menuCard = createCard("INFO", 2, "Menu", 150)
infoRow(menuCard, 52, "Menu Bind", "[LeftControl]")
infoRow(menuCard, 78, "Search", "Enabled")
infoRow(menuCard, 104, "Test Build", "UI V2")

-- SERVER page
local serverCard = createCard("SERVER", 1, "Rejoin", 214)

local function cardButton(parent, y, text, callback)
    local button = make("TextButton", parent, {
        Position = UDim2.fromOffset(16, y),
        Size = UDim2.new(1, -32, 0, 32),
        BackgroundColor3 = COLOR.control,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = text,
        Font = Enum.Font.GothamMedium,
        TextSize = 11,
        TextColor3 = COLOR.text,
        ZIndex = 506,
    })
    addCorner(button, 7)
    addStroke(button, COLOR.border, .12)
    connect(button.Activated:Connect(callback))
    return button
end

cardButton(serverCard, 51, "Rejoin", function()
    pcall(function()
        if game.JobId ~= "" then
            TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
        else
            TeleportService:Teleport(game.PlaceId, LocalPlayer)
        end
    end)
end)

cardButton(serverCard, 89, "Copy Job ID", function()
    local clipboard = setclipboard or toclipboard
    if clipboard then pcall(clipboard, game.JobId) end
end)

make("TextLabel", serverCard, {
    Position = UDim2.fromOffset(16, 128),
    Size = UDim2.fromOffset(92, 28),
    BackgroundTransparency = 1,
    Text = "Target Job ID",
    Font = Enum.Font.Gotham,
    TextSize = 11,
    TextColor3 = COLOR.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 506,
})

local targetJob = make("TextBox", serverCard, {
    Position = UDim2.new(0, 110, 0, 128),
    Size = UDim2.new(1, -126, 0, 28),
    BackgroundColor3 = COLOR.control,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Paste Job ID here...",
    PlaceholderColor3 = COLOR.muted,
    Text = "",
    TextColor3 = COLOR.text,
    Font = Enum.Font.Gotham,
    TextSize = 10,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 506,
})
addCorner(targetJob, 7)
addStroke(targetJob, COLOR.border, .12)
make("UIPadding", targetJob, {
    PaddingLeft = UDim.new(0, 10),
    PaddingRight = UDim.new(0, 8),
})

cardButton(serverCard, 165, "Join Job ID", function()
    local id = tostring(targetJob.Text or ""):match("^%s*(.-)%s*$")
    if id ~= "" then
        pcall(function()
            TeleportService:TeleportToPlaceInstance(game.PlaceId, id, LocalPlayer)
        end)
    end
end)

-- SETTINGS page
local interfaceCard = createCard("SETTINGS", 2, "Interface", 116)
infoRow(interfaceCard, 52, "Menu Bind", "[LeftControl]")

local keybindRow = make("TextButton", interfaceCard, {
    Position = UDim2.fromOffset(16, 78),
    Size = UDim2.new(1, -32, 0, 28),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    AutoButtonColor = false,
    Text = "",
    ZIndex = 506,
})

make("TextLabel", keybindRow, {
    Size = UDim2.new(1, -52, 1, 0),
    BackgroundTransparency = 1,
    Text = "Keybind List",
    Font = Enum.Font.Gotham,
    TextSize = 11,
    TextColor3 = COLOR.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 507,
})

local switchTrack = make("Frame", keybindRow, {
    Position = UDim2.new(1, -37, .5, -9),
    Size = UDim2.fromOffset(36, 18),
    BackgroundColor3 = COLOR.control,
    BorderSizePixel = 0,
    ZIndex = 507,
})
addCorner(switchTrack, 10)
addStroke(switchTrack, COLOR.border, .1)

local switchKnob = make("Frame", switchTrack, {
    Position = UDim2.fromOffset(2, 2),
    Size = UDim2.fromOffset(14, 14),
    BackgroundColor3 = COLOR.white,
    BorderSizePixel = 0,
    ZIndex = 508,
})
addCorner(switchKnob, 8)

local keyList = make("Frame", gui, {
    Name = "A7DEV_PS2_KEYLIST_V2",
    Position = UDim2.new(1, -190, 0, 68),
    Size = UDim2.fromOffset(174, 76),
    BackgroundColor3 = COLOR.panel,
    BorderSizePixel = 0,
    Visible = false,
    ZIndex = 950,
})
addCorner(keyList, 10)
addStroke(keyList, COLOR.border, .08)

make("TextLabel", keyList, {
    Position = UDim2.fromOffset(12, 8),
    Size = UDim2.new(1, -24, 0, 22),
    BackgroundTransparency = 1,
    Text = "Keybind List",
    Font = Enum.Font.GothamBold,
    TextSize = 10,
    TextColor3 = COLOR.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 951,
})

make("TextLabel", keyList, {
    Position = UDim2.fromOffset(12, 36),
    Size = UDim2.new(1, -24, 0, 22),
    BackgroundTransparency = 1,
    Text = "LeftControl     Menu",
    Font = Enum.Font.Gotham,
    TextSize = 9,
    TextColor3 = COLOR.muted,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 951,
})

local keyListEnabled = false
local minimized = false

local function syncKeybind()
    switchKnob.Position = UDim2.fromOffset(keyListEnabled and 20 or 2, 2)
    keyList.Visible = keyListEnabled and not minimized and root.Visible
end

connect(keybindRow.Activated:Connect(function()
    keyListEnabled = not keyListEnabled
    syncKeybind()
end))

local themeCard = createCard("SETTINGS", 2, "Theming", 188, -999)
themeCard.LayoutOrder = 20
infoRow(themeCard, 52, "Preset", "BlackLight")
infoRow(themeCard, 78, "Background", "5, 5, 7")
infoRow(themeCard, 104, "Panel", "14, 14, 17")
infoRow(themeCard, 130, "Surface", "20, 20, 24")
infoRow(themeCard, 156, "Text", "240, 240, 245")

-- =========================================================
-- NAVIGATION
-- =========================================================
local SUB_TABS = {
    MAIN = {"Settings", "Farming", "Dungeon", "Progression", "Spin", "Misc"},
    PLAYER = {"Combat", "Visuals", "Movement", "Travel"},
}

local secondaryButtons = {}
local currentPrimary = "MAIN"
local currentSub = "Settings"
local currentPage = "MAIN:Settings"

local function pageName(primary, sub)
    if primary == "MAIN" or primary == "PLAYER" then
        return primary .. ":" .. tostring(sub)
    end
    return primary
end

local function sectionContains(section, query)
    if query == "" then return true end
    if string.find(lowercase(section.Name), query, 1, true) then return true end

    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("TextLabel") or object:IsA("TextButton") then
            if string.find(lowercase(object.Text), query, 1, true) then
                return true
            end
        elseif object:IsA("TextBox") then
            if string.find(lowercase(object.Text .. " " .. object.PlaceholderText), query, 1, true) then
                return true
            end
        end
    end

    return false
end

local function applySearch()
    local query = lowercase(searchBox.Text):match("^%s*(.-)%s*$")
    local set = pageSections[currentPage]
    if not set then return end

    for section in pairs(set) do
        if section.Parent then
            section.Visible = sectionContains(section, query)
        end
    end
end

local function clearSecondaryButtons()
    for _, object in ipairs(secondaryBar:GetChildren()) do
        if object:IsA("TextButton") then
            object:Destroy()
        end
    end
    table.clear(secondaryButtons)
end

local selectView

local function rebuildSecondary(primary, selected)
    clearSecondaryButtons()
    local tabs = SUB_TABS[primary]
    if not tabs then return end

    local x = 18

    for _, name in ipairs(tabs) do
        local width = math.max(62, #name * 7 + 22)
        local button = make("TextButton", secondaryBar, {
            Position = UDim2.fromOffset(x, 7),
            Size = UDim2.fromOffset(width, 28),
            BackgroundColor3 = COLOR.active,
            BackgroundTransparency = name == selected and 0 or 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = name,
            Font = Enum.Font.Gotham,
            TextSize = 9,
            TextColor3 = name == selected and COLOR.text or COLOR.muted,
            ZIndex = 517,
        })
        addCorner(button, 8)
        secondaryButtons[name] = button
        x = x + width + 6
    end

    for name, button in pairs(secondaryButtons) do
        connect(button.Activated:Connect(function()
            selectView(primary, name)
        end))
    end
end

selectView = function(primary, sub)
    currentPrimary = primary

    local tabs = SUB_TABS[primary]
    if tabs then
        local valid = false
        for _, name in ipairs(tabs) do
            if name == sub then
                valid = true
                break
            end
        end
        if not valid then sub = tabs[1] end
    else
        sub = nil
    end

    currentSub = sub
    currentPage = pageName(primary, sub)

    local hasSecondary = tabs ~= nil
    secondaryBar.Visible = hasSecondary

    if hasSecondary then
        contentHost.Position = UDim2.fromOffset(0, 93)
        contentHost.Size = UDim2.new(1, 0, 1, -117)
    else
        contentHost.Position = UDim2.fromOffset(0, 53)
        contentHost.Size = UDim2.new(1, 0, 1, -77)
    end

    for id, page in pairs(pages) do
        page.Visible = id == currentPage
    end

    for key, item in pairs(primaryButtons) do
        local active = key == primary
        item.button.BackgroundTransparency = active and 0 or 1
        item.icon.ImageColor3 = active and COLOR.white or COLOR.dim
        item.label.TextColor3 = active and COLOR.text or COLOR.dim
    end

    if hasSecondary then
        rebuildSecondary(primary, sub)
    else
        clearSecondaryButtons()
    end

    applySearch()
end

for key, item in pairs(primaryButtons) do
    connect(item.button.Activated:Connect(function()
        local tabs = SUB_TABS[key]
        selectView(key, tabs and tabs[1] or nil)
    end))
end

connect(searchBox:GetPropertyChangedSignal("Text"):Connect(applySearch))

-- Keep late-added features inside the test presentation.
connect(gui.DescendantAdded:Connect(function(object)
    if not running or not object.Parent then return end
    if object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_" then
        if not originalSections[object] then
            originalSections[object] = {
                parent = object.Parent,
                layoutOrder = object.LayoutOrder,
                size = object.Size,
                position = object.Position,
                automaticSize = object.AutomaticSize,
                visible = object.Visible,
                backgroundColor3 = object.BackgroundColor3,
                backgroundTransparency = object.BackgroundTransparency,
            }
        end

        task.delay(.08, function()
            if running and object.Parent then
                routeSection(object)
                applySearch()
            end
        end)
    end
end))

-- =========================================================
-- WINDOW INTERACTION
-- =========================================================
local dragging
local dragStart
local startPosition

connect(topBar.InputBegan:Connect(function(input)
    if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then
        return
    end

    if input.Position.X >= searchBox.AbsolutePosition.X - 4 then
        return
    end

    dragging = input
    dragStart = input.Position
    startPosition = main.Position
end))

connect(UserInputService.InputChanged:Connect(function(input)
    if not dragging then return end

    if dragging.UserInputType == Enum.UserInputType.MouseButton1 then
        if input.UserInputType ~= Enum.UserInputType.MouseMovement then return end
    elseif dragging.UserInputType == Enum.UserInputType.Touch then
        if input ~= dragging then return end
    end

    local delta = input.Position - dragStart
    main.Position = UDim2.new(
        startPosition.X.Scale,
        startPosition.X.Offset + delta.X,
        startPosition.Y.Scale,
        startPosition.Y.Offset + delta.Y
    )
end))

connect(UserInputService.InputEnded:Connect(function(input)
    if input == dragging
        or (dragging
            and dragging.UserInputType == Enum.UserInputType.MouseButton1
            and input.UserInputType == Enum.UserInputType.MouseButton1) then
        dragging = nil
    end
end))

mini = make("TextButton", gui, {
    Name = "A7DEV_PS2_BLACKLIGHT_MINI_V2",
    Position = UDim2.new(1, -58, 0, 14),
    Size = UDim2.fromOffset(44, 36),
    BackgroundColor3 = COLOR.control,
    BorderSizePixel = 0,
    AutoButtonColor = false,
    Text = "A7",
    Font = Enum.Font.GothamBold,
    TextSize = 11,
    TextColor3 = COLOR.text,
    Visible = false,
    ZIndex = 960,
})
addCorner(mini, 9)
addStroke(mini, COLOR.border, .1)

local function setMinimized(value)
    minimized = value == true
    root.Visible = not minimized
    mini.Visible = minimized
    syncKeybind()
end

connect(minimizeButton.Activated:Connect(function()
    setMinimized(true)
end))

connect(mini.Activated:Connect(function()
    setMinimized(false)
end))

connect(maximizeButton.Activated:Connect(function()
    maximized = not maximized
    if maximized then
        local viewport = getViewport()
        scale.Scale = 1
        main.Size = UDim2.fromOffset(math.max(956, viewport.X - 8), math.max(565, viewport.Y - 8))
        main.Position = UDim2.fromOffset(viewport.X / 2, viewport.Y / 2)
        maximizeButton.Text = "↙"
    else
        main.Size = UDim2.fromOffset(defaultSize.X, defaultSize.Y)
        maximizeButton.Text = "↗"
        fitWindow()
    end
end))

local function restoreOldPresentation()
    for section, info in pairs(originalSections) do
        if section and section.Parent and info.parent and info.parent.Parent then
            pcall(function()
                section.Parent = info.parent
                section.LayoutOrder = info.layoutOrder
                section.Size = info.size
                section.Position = info.position
                section.AutomaticSize = info.automaticSize
                section.Visible = info.visible
                section.BackgroundColor3 = info.backgroundColor3
                section.BackgroundTransparency = info.backgroundTransparency
            end)
        end
    end

    for label, oldText in pairs(titleOverride) do
        if label and label.Parent then
            pcall(function() label.Text = oldText end)
        end
    end

    for child, visible in pairs(originalDirectVisibility) do
        if child and child.Parent == main then
            pcall(function() child.Visible = visible end)
        end
    end
end

local function stop(restore)
    if not running then return end
    running = false
    disconnectAll()

    if keyList and keyList.Parent then keyList:Destroy() end
    if mini and mini.Parent then mini:Destroy() end
    if root and root.Parent then root:Destroy() end

    if restore then
        restoreOldPresentation()
    end

    ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP = nil
end

ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP = function()
    stop(true)
end

connect(closeButton.Activated:Connect(function()
    local destroyed = false

    if State and type(State.Destroy) == "function" then
        destroyed = pcall(State.Destroy)
    elseif State and State.Runtime and type(State.Runtime.destroyAll) == "function" then
        destroyed = pcall(State.Runtime.destroyAll)
    end

    if destroyed then
        stop(false)
    else
        stop(true)
        if gui and gui.Parent then
            pcall(function() gui:Destroy() end)
        end
    end
end))

connect(UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end

    if input.KeyCode == Enum.KeyCode.LeftControl then
        setMinimized(not minimized)
    end
end))

selectView("MAIN", "Settings")
fitWindow()
