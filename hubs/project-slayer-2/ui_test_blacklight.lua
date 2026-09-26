-- A7DEV HUB - Slayer 2 BlackLight UI TEST
-- UI-only overlay for the isolated test branch.
-- It loads on top of the current production script and does not change Loader.lua or main.lua.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP)
end

local alive = true
local conns = {}
local sectionOrigins = {}
local directVisibility = {}
local root
local miniButton

local function on(c)
    if c then
        conns[#conns + 1] = c
    end
    return c
end

local function disconnectAll()
    for _, c in ipairs(conns) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(conns)
end

local function mk(className, parent, props)
    local o = Instance.new(className)
    for k, v in pairs(props or {}) do
        o[k] = v
    end
    o.Parent = parent
    return o
end

local function corner(parent, radius)
    return mk("UICorner", parent, {CornerRadius = UDim.new(0, radius or 8)})
end

local function stroke(parent, color, transparency)
    return mk("UIStroke", parent, {
        Color = color,
        Thickness = 1,
        Transparency = transparency or 0,
        ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
    })
end

local C = {
    bg = Color3.fromRGB(5, 5, 7),
    top = Color3.fromRGB(7, 7, 9),
    panel = Color3.fromRGB(15, 16, 19),
    panel2 = Color3.fromRGB(20, 21, 26),
    control = Color3.fromRGB(24, 25, 30),
    active = Color3.fromRGB(43, 43, 51),
    border = Color3.fromRGB(39, 40, 47),
    borderSoft = Color3.fromRGB(31, 32, 38),
    text = Color3.fromRGB(239, 240, 244),
    muted = Color3.fromRGB(149, 151, 160),
    dim = Color3.fromRGB(102, 104, 114),
    white = Color3.fromRGB(232, 233, 238),
}

local function low(v)
    return string.lower(tostring(v or ""))
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui
for _ = 1, 600 do
    if not alive then return end
    gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
    if gui then break end
    task.wait(.1)
end
if not gui then
    warn("[A7DEV TEST UI] A7DEV_ProjectSlayer2 was not found.")
    return
end

local main = gui:FindFirstChild("Main")
if not main then
    for _, child in ipairs(gui:GetChildren()) do
        if child:IsA("Frame") then
            main = child
            break
        end
    end
end
if not main then
    warn("[A7DEV TEST UI] Main window was not found.")
    return
end

local oldTest = main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST")
if oldTest then oldTest:Destroy() end
local oldMini = gui:FindFirstChild("A7DEV_PS2_BLACKLIGHT_MINI")
if oldMini then oldMini:Destroy() end

local State = ENV.A7DEV_PROJECT_SLAYER_2

-- Keep every original section and callback. Only move the containers.
local sections = {}
for _, d in ipairs(main:GetDescendants()) do
    if d:IsA("Frame") and string.sub(d.Name, 1, 8) == "Section_" then
        sections[#sections + 1] = d
        sectionOrigins[d] = {
            parent = d.Parent,
            layoutOrder = d.LayoutOrder,
            size = d.Size,
            automaticSize = d.AutomaticSize,
            visible = d.Visible,
        }
    end
end

-- Hide the old presentation layer without destroying it.
for _, child in ipairs(main:GetChildren()) do
    if child:IsA("GuiObject") then
        directVisibility[child] = child.Visible
        child.Visible = false
    end
end

main.Name = "Main"
main.AnchorPoint = Vector2.new(.5, .5)
main.Position = UDim2.fromScale(.5, .5)
main.Size = UDim2.fromOffset(960, 560)
main.BackgroundColor3 = C.bg
main.BorderSizePixel = 0
main.ClipsDescendants = false

local mainCorner = main:FindFirstChildOfClass("UICorner")
if mainCorner then
    mainCorner.CornerRadius = UDim.new(0, 10)
else
    corner(main, 10)
end

local mainStroke = main:FindFirstChildOfClass("UIStroke")
if mainStroke then
    mainStroke.Color = C.border
    mainStroke.Transparency = .15
else
    stroke(main, C.border, .15)
end

local scale = main:FindFirstChildOfClass("UIScale")
if not scale then
    scale = mk("UIScale", main, {Scale = 1})
end

root = mk("Frame", main, {
    Name = "A7DEV_PS2_BLACKLIGHT_TEST",
    Size = UDim2.fromScale(1, 1),
    BackgroundColor3 = C.bg,
    BorderSizePixel = 0,
    Active = true,
    ZIndex = 500,
})
corner(root, 10)

local function viewport()
    local cam = workspace.CurrentCamera
    return cam and cam.ViewportSize or Vector2.new(1280, 720)
end

local function fit()
    if not alive or not main.Parent then return end
    local vp = viewport()
    local s = math.min(1, (vp.X - 12) / 960, (vp.Y - 12) / 560)
    scale.Scale = math.max(.2, s)
    local px = main.Position.X.Scale * vp.X + main.Position.X.Offset
    local py = main.Position.Y.Scale * vp.Y + main.Position.Y.Offset
    local halfW = 480 * scale.Scale
    local halfH = 280 * scale.Scale
    px = math.clamp(px, halfW + 6, math.max(halfW + 6, vp.X - halfW - 6))
    py = math.clamp(py, halfH + 6, math.max(halfH + 6, vp.Y - halfH - 6))
    main.Position = UDim2.fromOffset(px, py)
end
fit()

if workspace.CurrentCamera then
    on(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
        task.defer(fit)
    end))
end

local top = mk("Frame", root, {
    Size = UDim2.new(1, 0, 0, 52),
    BackgroundColor3 = C.top,
    BorderSizePixel = 0,
    ZIndex = 510,
})
mk("Frame", top, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.border,
    BorderSizePixel = 0,
    ZIndex = 511,
})

local logo = mk("TextLabel", top, {
    Position = UDim2.fromOffset(16, 0),
    Size = UDim2.fromOffset(42, 52),
    BackgroundTransparency = 1,
    Text = "A7",
    Font = Enum.Font.GothamBlack,
    TextSize = 18,
    TextColor3 = C.text,
    ZIndex = 512,
})

local primaryOrder = {"INFO", "MAIN", "PLAYER", "SERVER", "SETTINGS"}
local primaryIcon = {
    INFO = "rbxassetid://7733960981",
    MAIN = "rbxassetid://7733674079",
    PLAYER = "rbxassetid://7743875962",
    SERVER = "rbxassetid://7733992789",
    SETTINGS = "rbxassetid://7734053495",
}
local primaryButtons = {}
local xPositions = {70, 150, 236, 334, 430}
local widths = {72, 78, 90, 88, 104}

for i, key in ipairs(primaryOrder) do
    local b = mk("TextButton", top, {
        Position = UDim2.fromOffset(xPositions[i], 8),
        Size = UDim2.fromOffset(widths[i], 36),
        BackgroundColor3 = C.active,
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "",
        ZIndex = 512,
    })
    corner(b, 9)
    local icon = mk("ImageLabel", b, {
        Position = UDim2.fromOffset(9, 9),
        Size = UDim2.fromOffset(18, 18),
        BackgroundTransparency = 1,
        Image = primaryIcon[key],
        ImageColor3 = C.dim,
        ScaleType = Enum.ScaleType.Fit,
        ZIndex = 513,
    })
    local tx = mk("TextLabel", b, {
        Position = UDim2.fromOffset(33, 0),
        Size = UDim2.new(1, -37, 1, 0),
        BackgroundTransparency = 1,
        Text = key,
        Font = Enum.Font.GothamBold,
        TextSize = 10,
        TextColor3 = C.dim,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 513,
    })
    primaryButtons[key] = {button = b, icon = icon, text = tx}
end

local search = mk("TextBox", top, {
    Position = UDim2.new(1, -310, 0, 8),
    Size = UDim2.fromOffset(185, 36),
    BackgroundColor3 = C.panel2,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Search settings...",
    PlaceholderColor3 = C.muted,
    Text = "",
    TextColor3 = C.text,
    TextSize = 10,
    Font = Enum.Font.Gotham,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 514,
})
corner(search, 9)
stroke(search, C.border, .15)
mk("UIPadding", search, {
    PaddingLeft = UDim.new(0, 28),
    PaddingRight = UDim.new(0, 8),
})
mk("TextLabel", top, {
    Position = UDim2.new(1, -299, 0, 8),
    Size = UDim2.fromOffset(20, 36),
    BackgroundTransparency = 1,
    Text = "⌕",
    Font = Enum.Font.GothamBold,
    TextSize = 17,
    TextColor3 = C.muted,
    ZIndex = 515,
})

local function windowButton(textValue, xOffset)
    local b = mk("TextButton", top, {
        Position = UDim2.new(1, xOffset, 0, 9),
        Size = UDim2.fromOffset(32, 32),
        BackgroundColor3 = C.panel2,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = textValue,
        Font = Enum.Font.GothamBold,
        TextSize = 13,
        TextColor3 = C.muted,
        ZIndex = 515,
    })
    corner(b, 9)
    stroke(b, C.border, .25)
    return b
end

local minimize = windowButton("−", -116)
local maximize = windowButton("□", -78)
local close = windowButton("×", -40)

local secondary = mk("Frame", root, {
    Position = UDim2.fromOffset(0, 52),
    Size = UDim2.new(1, 0, 0, 40),
    BackgroundColor3 = C.bg,
    BorderSizePixel = 0,
    ZIndex = 505,
})
mk("Frame", secondary, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 506,
})

local contentHost = mk("Frame", root, {
    Position = UDim2.fromOffset(0, 92),
    Size = UDim2.new(1, 0, 1, -116),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    ClipsDescendants = true,
    ZIndex = 501,
})

local footer = mk("Frame", root, {
    Position = UDim2.new(0, 0, 1, -24),
    Size = UDim2.new(1, 0, 0, 24),
    BackgroundColor3 = C.top,
    BorderSizePixel = 0,
    ZIndex = 510,
})
mk("Frame", footer, {
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 511,
})
mk("TextLabel", footer, {
    Position = UDim2.fromOffset(16, 1),
    Size = UDim2.fromOffset(260, 22),
    BackgroundTransparency = 1,
    Text = "A7DEV HUB · Slayers 2",
    Font = Enum.Font.Gotham,
    TextSize = 8,
    TextColor3 = C.muted,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 512,
})
mk("TextLabel", footer, {
    Position = UDim2.new(1, -180, 0, 1),
    Size = UDim2.fromOffset(165, 22),
    BackgroundTransparency = 1,
    Text = "LeftControl · menu",
    Font = Enum.Font.Gotham,
    TextSize = 8,
    TextColor3 = C.muted,
    TextXAlignment = Enum.TextXAlignment.Right,
    ZIndex = 512,
})

local pages = {}
local pageSections = {}
local pageColumns = {}

local function createPage(id)
    local sf = mk("ScrollingFrame", contentHost, {
        Name = "TestPage_" .. id:gsub("[^%w]", "_"),
        Size = UDim2.fromScale(1, 1),
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        ScrollBarThickness = 2,
        ScrollBarImageColor3 = C.muted,
        AutomaticCanvasSize = Enum.AutomaticSize.Y,
        CanvasSize = UDim2.new(),
        ScrollingDirection = Enum.ScrollingDirection.Y,
        Visible = false,
        ZIndex = 502,
    })

    local cols = {}
    local x = {UDim2.new(0, 16, 0, 18), UDim2.new(1/3, 8, 0, 18), UDim2.new(2/3, 0, 0, 18)}
    for i = 1, 3 do
        local col = mk("Frame", sf, {
            Position = x[i],
            Size = UDim2.new(1/3, -18, 0, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            ZIndex = 503,
        })
        mk("UIListLayout", col, {
            SortOrder = Enum.SortOrder.LayoutOrder,
            Padding = UDim.new(0, 14),
        })
        cols[i] = col
    end
    pages[id] = sf
    pageSections[id] = {}
    pageColumns[id] = cols
    return sf
end

local pageIds = {
    "INFO",
    "MAIN:Settings", "MAIN:Farming", "MAIN:Dungeon", "MAIN:Progression", "MAIN:Spin", "MAIN:Misc",
    "PLAYER:Combat", "PLAYER:Visuals", "PLAYER:Movement", "PLAYER:Travel",
    "SERVER",
    "SETTINGS",
}
for _, id in ipairs(pageIds) do createPage(id) end

local map = {
    ["Section_Farm Position"] = {"MAIN:Settings", 1, 10},
    ["Section_Farm Safety + Session"] = {"MAIN:Settings", 2, 10},

    ["Section_Farm Automation"] = {"MAIN:Farming", 1, 10},
    ["Section_Target Filter"] = {"MAIN:Farming", 1, 20},
    ["Section_Boss Automation"] = {"MAIN:Farming", 2, 10},
    ["Section_Yeti"] = {"MAIN:Farming", 2, 20},
    ["Section_Boss Actions"] = {"MAIN:Farming", 2, 30},
    ["Section_Boss Selection"] = {"MAIN:Farming", 3, 10},
    ["Section_Boss List"] = {"MAIN:Farming", 3, 20},
    ["Section_Live Boss Scanner"] = {"MAIN:Farming", 3, 30},

    ["Section_Dungeon + Souls"] = {"MAIN:Dungeon", 1, 10},

    ["Section_Quest Assist"] = {"MAIN:Progression", 1, 10},
    ["Section_Slayer Crow"] = {"MAIN:Progression", 1, 20},
    ["Section_Muzan Quest"] = {"MAIN:Progression", 1, 30},
    ["Section_Training Quests"] = {"MAIN:Progression", 2, 10},
    ["Section_Race Automation"] = {"MAIN:Progression", 2, 20},
    ["Section_Winter Lantern"] = {"MAIN:Progression", 2, 30},
    ["Section_Quest Manager"] = {"MAIN:Progression", 3, 10},
    ["Section_Muzan"] = {"MAIN:Progression", 3, 20},
    ["Section_Mastery"] = {"MAIN:Progression", 3, 30},

    ["Section_Clan Spins"] = {"MAIN:Spin", 1, 10},

    ["Section_Chest + Loot"] = {"MAIN:Misc", 1, 10},
    ["Section_Inventory Helper"] = {"MAIN:Misc", 1, 20},
    ["Section_Crafting / Alchemy"] = {"MAIN:Misc", 2, 10},
    ["Section_Auto Sell"] = {"MAIN:Misc", 2, 20},
    ["Section_Fishing"] = {"MAIN:Misc", 3, 10},

    ["Section_Defense"] = {"PLAYER:Combat", 1, 10},
    ["Section_Player Farm"] = {"PLAYER:Combat", 1, 20},
    ["Section_Native Actions"] = {"PLAYER:Combat", 2, 10},

    ["Section_Visuals"] = {"PLAYER:Visuals", 1, 10},

    ["Section_Movement"] = {"PLAYER:Movement", 1, 10},
    ["Section_Fly"] = {"PLAYER:Movement", 2, 10},
    ["Section_Horse"] = {"PLAYER:Movement", 3, 10},

    ["Section_Regions"] = {"PLAYER:Travel", 1, 10},
    ["Section_NPC / Trainer"] = {"PLAYER:Travel", 2, 10},
    ["Section_Game Systems"] = {"PLAYER:Travel", 2, 20},
    ["Section_Activities"] = {"PLAYER:Travel", 3, 10},

    ["Section_Config"] = {"SETTINGS", 1, 10},
    ["Section_Utilities"] = {"MAIN:Misc", 3, 20},
}

local styling = setmetatable({}, {__mode = "k"})
local neutralGuard = setmetatable({}, {__mode = "k"})

local function isRed(c)
    if typeof(c) ~= "Color3" then return false end
    return c.R > .25 and c.R > c.G * 1.45 and c.R > c.B * 1.2
end

local function neutralize(obj)
    if not obj or styling[obj] then return end
    styling[obj] = true

    local function apply()
        if neutralGuard[obj] or not obj.Parent then return end
        neutralGuard[obj] = true
        if obj:IsA("UIStroke") then
            if isRed(obj.Color) then obj.Color = C.border end
        elseif obj:IsA("ImageLabel") or obj:IsA("ImageButton") then
            if isRed(obj.ImageColor3) then obj.ImageColor3 = C.text end
        elseif obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox") then
            if isRed(obj.TextColor3) then obj.TextColor3 = C.text end
            if obj:IsA("GuiObject") and isRed(obj.BackgroundColor3) then
                obj.BackgroundColor3 = C.control
            end
        elseif obj:IsA("Frame") then
            if isRed(obj.BackgroundColor3) then
                local h = obj.AbsoluteSize.Y > 0 and obj.AbsoluteSize.Y or obj.Size.Y.Offset
                local w = obj.AbsoluteSize.X > 0 and obj.AbsoluteSize.X or obj.Size.X.Offset
                if h > 0 and h <= 9 then
                    obj.BackgroundColor3 = C.white
                elseif h > 0 and h <= 24 and w > 0 and w <= 48 then
                    obj.BackgroundColor3 = C.control
                else
                    obj.BackgroundColor3 = C.border
                end
            end
        end
        neutralGuard[obj] = nil
    end

    apply()
    if obj:IsA("UIStroke") then
        on(obj:GetPropertyChangedSignal("Color"):Connect(apply))
    elseif obj:IsA("ImageLabel") or obj:IsA("ImageButton") then
        on(obj:GetPropertyChangedSignal("ImageColor3"):Connect(apply))
    elseif obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox") then
        on(obj:GetPropertyChangedSignal("TextColor3"):Connect(apply))
        on(obj:GetPropertyChangedSignal("BackgroundColor3"):Connect(apply))
    elseif obj:IsA("Frame") then
        on(obj:GetPropertyChangedSignal("BackgroundColor3"):Connect(apply))
    end
end

local function styleSection(section)
    if not section or not section.Parent then return end
    section.Visible = true
    section.BackgroundColor3 = C.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    section.ClipsDescendants = false
    local h = section.Size.Y.Offset
    if h < 72 then h = math.max(110, math.floor(section.AbsoluteSize.Y + .5)) end
    section.Size = UDim2.new(1, 0, 0, h)

    local c = section:FindFirstChildOfClass("UICorner")
    if c then c.CornerRadius = UDim.new(0, 13) else corner(section, 13) end
    local s = section:FindFirstChildOfClass("UIStroke")
    if s then
        s.Color = C.border
        s.Transparency = .1
        s.Thickness = 1
    else
        stroke(section, C.border, .1)
    end

    local firstLabel = true
    for _, d in ipairs(section:GetDescendants()) do
        if d:IsA("TextLabel") then
            d.Font = firstLabel and Enum.Font.GothamBold or Enum.Font.Gotham
            d.TextSize = firstLabel and math.max(10, math.min(12, d.TextSize)) or math.max(9, math.min(12, d.TextSize))
            d.TextColor3 = firstLabel and C.text or C.muted
            firstLabel = false
        elseif d:IsA("TextButton") then
            d.BorderSizePixel = 0
            if d.Text ~= "" then
                d.BackgroundColor3 = C.control
                d.TextColor3 = C.text
                d.Font = Enum.Font.GothamMedium
                d.TextSize = math.max(9, math.min(12, d.TextSize))
                if not d:FindFirstChildOfClass("UICorner") then corner(d, 7) end
                local bs = d:FindFirstChildOfClass("UIStroke")
                if bs then
                    bs.Color = C.border
                    bs.Transparency = .15
                end
            else
                d.BackgroundTransparency = 1
            end
        elseif d:IsA("TextBox") then
            d.BackgroundColor3 = C.control
            d.TextColor3 = C.text
            d.PlaceholderColor3 = C.muted
            d.BorderSizePixel = 0
            d.Font = Enum.Font.Gotham
            d.TextSize = math.max(9, math.min(12, d.TextSize))
            if not d:FindFirstChildOfClass("UICorner") then corner(d, 7) end
            local bs = d:FindFirstChildOfClass("UIStroke")
            if bs then
                bs.Color = C.border
                bs.Transparency = .15
            end
        elseif d:IsA("ScrollingFrame") then
            d.BackgroundTransparency = 1
            d.BorderSizePixel = 0
            d.ScrollBarImageColor3 = C.muted
            d.ScrollBarThickness = math.min(3, d.ScrollBarThickness)
        end

        if string.find(d.Name, "SWITCH", 1, true) and d:IsA("Frame") then
            d.BackgroundColor3 = C.control
            local knob = d:FindFirstChildWhichIsA("Frame")
            if knob then knob.BackgroundColor3 = C.white end
        end
        neutralize(d)
    end
    neutralize(section)
end

local function routeSection(section)
    if not section or not section.Parent then return end
    if section.Name == "Section_Diagnostics" or section.Name == "Section_Live Boss Scanner" then
        section.Visible = false
        return
    end
    local info = map[section.Name] or {"MAIN:Misc", 3, 900}
    local pageId, col, order = info[1], info[2], info[3]
    local columns = pageColumns[pageId]
    if not columns then return end
    section.Parent = columns[col]
    section.LayoutOrder = order
    styleSection(section)
    pageSections[pageId][section] = true
end

for _, section in ipairs(sections) do
    routeSection(section)
end

local function addCard(pageId, column, title, height)
    local card = mk("Frame", pageColumns[pageId][column], {
        Size = UDim2.new(1, 0, 0, height or 150),
        BackgroundColor3 = C.panel,
        BorderSizePixel = 0,
        LayoutOrder = -1000,
        ZIndex = 504,
    })
    corner(card, 13)
    stroke(card, C.border, .1)
    mk("TextLabel", card, {
        Position = UDim2.fromOffset(16, 8),
        Size = UDim2.new(1, -32, 0, 26),
        BackgroundTransparency = 1,
        Text = title,
        Font = Enum.Font.GothamBold,
        TextSize = 12,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 505,
    })
    mk("Frame", card, {
        Position = UDim2.fromOffset(16, 39),
        Size = UDim2.new(1, -32, 0, 1),
        BackgroundColor3 = C.border,
        BorderSizePixel = 0,
        ZIndex = 505,
    })
    return card
end

local function addInfoRow(card, y, left, right)
    mk("TextLabel", card, {
        Position = UDim2.fromOffset(16, y),
        Size = UDim2.new(.55, -16, 0, 22),
        BackgroundTransparency = 1,
        Text = left,
        Font = Enum.Font.Gotham,
        TextSize = 11,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 506,
    })
    mk("TextLabel", card, {
        Position = UDim2.new(.55, 0, 0, y),
        Size = UDim2.new(.45, -16, 0, 22),
        BackgroundTransparency = 1,
        Text = right,
        Font = Enum.Font.Gotham,
        TextSize = 10,
        TextColor3 = C.muted,
        TextXAlignment = Enum.TextXAlignment.Right,
        ZIndex = 506,
    })
end

local about = addCard("INFO", 1, "Information", 150)
addInfoRow(about, 52, "Hub", "A7DEV HUB")
addInfoRow(about, 78, "Game", "Slayers 2")
addInfoRow(about, 104, "Menu Bind", "[LeftControl]")

local statusCard = addCard("INFO", 2, "Interface", 150)
addInfoRow(statusCard, 52, "Style", "BlackLight")
addInfoRow(statusCard, 78, "Layout", "Compact")
addInfoRow(statusCard, 104, "Search", "Enabled")

-- SERVER / Rejoin card: all controls are functional.
local serverCard = addCard("SERVER", 1, "Rejoin", 214)
local function simpleButton(parent, y, textValue, callback)
    local b = mk("TextButton", parent, {
        Position = UDim2.fromOffset(16, y),
        Size = UDim2.new(1, -32, 0, 32),
        BackgroundColor3 = C.control,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = textValue,
        Font = Enum.Font.GothamMedium,
        TextSize = 11,
        TextColor3 = C.text,
        ZIndex = 506,
    })
    corner(b, 7)
    stroke(b, C.border, .15)
    on(b.Activated:Connect(callback))
    return b
end

simpleButton(serverCard, 50, "Rejoin", function()
    pcall(function()
        if game.JobId ~= "" then
            TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
        else
            TeleportService:Teleport(game.PlaceId, LocalPlayer)
        end
    end)
end)

simpleButton(serverCard, 88, "Copy Job ID", function()
    local clip = setclipboard or toclipboard
    if clip then pcall(clip, game.JobId) end
end)

mk("TextLabel", serverCard, {
    Position = UDim2.fromOffset(16, 128),
    Size = UDim2.fromOffset(90, 28),
    BackgroundTransparency = 1,
    Text = "Target Job ID",
    Font = Enum.Font.Gotham,
    TextSize = 11,
    TextColor3 = C.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 506,
})

local jobBox = mk("TextBox", serverCard, {
    Position = UDim2.new(0, 110, 0, 128),
    Size = UDim2.new(1, -126, 0, 28),
    BackgroundColor3 = C.control,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Paste Job ID here...",
    PlaceholderColor3 = C.muted,
    Text = "",
    TextColor3 = C.text,
    Font = Enum.Font.Gotham,
    TextSize = 10,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 506,
})
corner(jobBox, 7)
stroke(jobBox, C.border, .15)
mk("UIPadding", jobBox, {PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 8)})

simpleButton(serverCard, 164, "Join Job ID", function()
    local id = tostring(jobBox.Text or ""):match("^%s*(.-)%s*$")
    if id ~= "" then
        pcall(function()
            TeleportService:TeleportToPlaceInstance(game.PlaceId, id, LocalPlayer)
        end)
    end
end)

-- SETTINGS cards. Existing Config stays functional in column 1.
local interfaceCard = addCard("SETTINGS", 2, "Interface", 150)
addInfoRow(interfaceCard, 52, "Menu Bind", "[LeftControl]")

local keyList = mk("Frame", gui, {
    Name = "A7DEV_PS2_KEYLIST",
    Position = UDim2.new(1, -190, 0, 70),
    Size = UDim2.fromOffset(174, 72),
    BackgroundColor3 = C.panel,
    BorderSizePixel = 0,
    Visible = false,
    ZIndex = 900,
})
corner(keyList, 10)
stroke(keyList, C.border, .08)
mk("TextLabel", keyList, {
    Position = UDim2.fromOffset(12, 7),
    Size = UDim2.new(1, -24, 0, 22),
    BackgroundTransparency = 1,
    Text = "Keybind List",
    Font = Enum.Font.GothamBold,
    TextSize = 10,
    TextColor3 = C.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 901,
})
mk("TextLabel", keyList, {
    Position = UDim2.fromOffset(12, 33),
    Size = UDim2.new(1, -24, 0, 24),
    BackgroundTransparency = 1,
    Text = "LeftControl    Menu",
    Font = Enum.Font.Gotham,
    TextSize = 9,
    TextColor3 = C.muted,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 901,
})

local keyToggle = mk("TextButton", interfaceCard, {
    Position = UDim2.fromOffset(16, 86),
    Size = UDim2.new(1, -32, 0, 34),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    AutoButtonColor = false,
    Text = "",
    ZIndex = 506,
})
mk("TextLabel", keyToggle, {
    Position = UDim2.fromOffset(0, 0),
    Size = UDim2.new(1, -58, 1, 0),
    BackgroundTransparency = 1,
    Text = "Keybind List",
    Font = Enum.Font.Gotham,
    TextSize = 11,
    TextColor3 = C.text,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 507,
})
local keyTrack = mk("Frame", keyToggle, {
    Position = UDim2.new(1, -38, .5, -9),
    Size = UDim2.fromOffset(36, 18),
    BackgroundColor3 = C.control,
    BorderSizePixel = 0,
    ZIndex = 507,
})
corner(keyTrack, 10)
stroke(keyTrack, C.border, .1)
local keyKnob = mk("Frame", keyTrack, {
    Position = UDim2.fromOffset(2, 2),
    Size = UDim2.fromOffset(14, 14),
    BackgroundColor3 = C.white,
    BorderSizePixel = 0,
    ZIndex = 508,
})
corner(keyKnob, 8)
local keyEnabled = false
local function syncKeyToggle()
    keyKnob.Position = UDim2.fromOffset(keyEnabled and 20 or 2, 2)
    keyList.Visible = keyEnabled and root.Visible
end
on(keyToggle.Activated:Connect(function()
    keyEnabled = not keyEnabled
    syncKeyToggle()
end))

local themeCard = addCard("SETTINGS", 3, "Theming", 176)
addInfoRow(themeCard, 52, "Preset", "BlackLight")
addInfoRow(themeCard, 78, "Panel", "Neutral Black")
addInfoRow(themeCard, 104, "Surface", "Graphite")
addInfoRow(themeCard, 130, "Accent", "Soft White")

local subTabs = {
    MAIN = {"Settings", "Farming", "Dungeon", "Progression", "Spin", "Misc"},
    PLAYER = {"Combat", "Visuals", "Movement", "Travel"},
}
local secondaryButtons = {}
local currentPrimary = "MAIN"
local currentSub = "Settings"
local currentPageId = "MAIN:Settings"

local function pageIdFor(primary, sub)
    if primary == "MAIN" or primary == "PLAYER" then
        return primary .. ":" .. tostring(sub)
    end
    return primary
end

local function sectionMatches(section, query)
    if query == "" then return true end
    if string.find(low(section.Name), query, 1, true) then return true end
    for _, d in ipairs(section:GetDescendants()) do
        if (d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox")) then
            local textValue = d:IsA("TextBox") and (d.Text .. " " .. d.PlaceholderText) or d.Text
            if string.find(low(textValue), query, 1, true) then
                return true
            end
        end
    end
    return false
end

local function applySearch()
    local q = low(search.Text):match("^%s*(.-)%s*$")
    local set = pageSections[currentPageId]
    if not set then return end
    for section in pairs(set) do
        if section.Parent then
            section.Visible = sectionMatches(section, q)
        end
    end
end

local function rebuildSecondary(primary, selectedSub)
    for _, d in ipairs(secondary:GetChildren()) do
        if d:IsA("TextButton") then d:Destroy() end
    end
    table.clear(secondaryButtons)
    local list = subTabs[primary]
    if not list then return end
    local x = 18
    for _, name in ipairs(list) do
        local width = math.max(62, #name * 7 + 24)
        local b = mk("TextButton", secondary, {
            Position = UDim2.fromOffset(x, 7),
            Size = UDim2.fromOffset(width, 28),
            BackgroundColor3 = C.active,
            BackgroundTransparency = name == selectedSub and 0 or 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = name,
            Font = Enum.Font.Gotham,
            TextSize = 9,
            TextColor3 = name == selectedSub and C.text or C.muted,
            ZIndex = 507,
        })
        corner(b, 8)
        secondaryButtons[name] = b
        x = x + width + 6
    end
end

local selectView
selectView = function(primary, sub)
    currentPrimary = primary
    local list = subTabs[primary]
    if list then
        local found = false
        for _, name in ipairs(list) do if name == sub then found = true break end end
        if not found then sub = list[1] end
    else
        sub = nil
    end
    currentSub = sub
    currentPageId = pageIdFor(primary, sub)

    for id, page in pairs(pages) do
        page.Visible = id == currentPageId
    end

    for key, b in pairs(primaryButtons) do
        local active = key == primary
        b.button.BackgroundTransparency = active and 0 or 1
        b.icon.ImageColor3 = active and C.text or C.dim
        b.text.TextColor3 = active and C.text or C.dim
    end

    rebuildSecondary(primary, sub)
    for name, b in pairs(secondaryButtons) do
        on(b.Activated:Connect(function()
            selectView(primary, name)
        end))
    end
    applySearch()
end

for key, b in pairs(primaryButtons) do
    on(b.button.Activated:Connect(function()
        local list = subTabs[key]
        selectView(key, list and list[1] or nil)
    end))
end

on(search:GetPropertyChangedSignal("Text"):Connect(applySearch))

-- Restyle new/dynamic original sections and move them to the new layout.
on(gui.DescendantAdded:Connect(function(d)
    if not alive or not d.Parent then return end
    if d:IsA("Frame") and string.sub(d.Name, 1, 8) == "Section_" then
        if not sectionOrigins[d] then
            sectionOrigins[d] = {
                parent = d.Parent,
                layoutOrder = d.LayoutOrder,
                size = d.Size,
                automaticSize = d.AutomaticSize,
                visible = d.Visible,
            }
        end
        task.delay(.08, function()
            if alive and d.Parent then routeSection(d) applySearch() end
        end)
    end
end))

-- Dragging.
local dragging, dragStart, startPos
on(top.InputBegan:Connect(function(input)
    if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then return end
    if input.Position.X >= search.AbsolutePosition.X - 4 then return end
    dragging = input
    dragStart = input.Position
    startPos = main.Position
end))
on(UserInputService.InputChanged:Connect(function(input)
    if not dragging then return end
    if dragging.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.MouseMovement then return end
    if dragging.UserInputType == Enum.UserInputType.Touch and input ~= dragging then return end
    local delta = input.Position - dragStart
    main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
end))
on(UserInputService.InputEnded:Connect(function(input)
    if input == dragging or (dragging and dragging.UserInputType == Enum.UserInputType.MouseButton1 and input.UserInputType == Enum.UserInputType.MouseButton1) then
        dragging = nil
    end
end))

-- Minimize / maximize / close.
miniButton = mk("TextButton", gui, {
    Name = "A7DEV_PS2_BLACKLIGHT_MINI",
    Position = UDim2.new(1, -58, 0, 14),
    Size = UDim2.fromOffset(44, 36),
    BackgroundColor3 = C.panel2,
    BorderSizePixel = 0,
    AutoButtonColor = false,
    Text = "A7",
    Font = Enum.Font.GothamBold,
    TextSize = 12,
    TextColor3 = C.text,
    Visible = false,
    ZIndex = 950,
})
corner(miniButton, 9)
stroke(miniButton, C.border, .1)

local minimized = false
local expanded = false
local function setMinimized(v)
    minimized = v == true
    root.Visible = not minimized
    miniButton.Visible = minimized
    keyList.Visible = keyEnabled and not minimized
end

on(minimize.Activated:Connect(function() setMinimized(true) end))
on(miniButton.Activated:Connect(function() setMinimized(false) end))

on(maximize.Activated:Connect(function()
    expanded = not expanded
    if expanded then
        local vp = viewport()
        main.Size = UDim2.fromOffset(math.max(960, vp.X - 18), math.max(560, vp.Y - 18))
        scale.Scale = 1
        main.Position = UDim2.fromScale(.5, .5)
    else
        main.Size = UDim2.fromOffset(960, 560)
        main.Position = UDim2.fromScale(.5, .5)
        fit()
    end
end))

local function restorePresentation()
    for section, info in pairs(sectionOrigins) do
        if section and section.Parent and info.parent and info.parent.Parent then
            pcall(function()
                section.Parent = info.parent
                section.LayoutOrder = info.layoutOrder
                section.Size = info.size
                section.AutomaticSize = info.automaticSize
                section.Visible = info.visible
            end)
        end
    end
    for child, visible in pairs(directVisibility) do
        if child and child.Parent == main then
            pcall(function() child.Visible = visible end)
        end
    end
end

local function stop(restore)
    if not alive then return end
    alive = false
    disconnectAll()
    if keyList and keyList.Parent then keyList:Destroy() end
    if miniButton and miniButton.Parent then miniButton:Destroy() end
    if root and root.Parent then root:Destroy() end
    if restore then restorePresentation() end
    ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP = nil
end
ENV.A7DEV_PS2_BLACKLIGHT_TEST_STOP = function() stop(true) end

on(close.Activated:Connect(function()
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
        if gui and gui.Parent then pcall(function() gui:Destroy() end) end
    end
end))

on(UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Enum.KeyCode.LeftControl then
        setMinimized(not minimized)
    end
end))

selectView("MAIN", "Settings")
fit()
