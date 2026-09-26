-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V7
-- Clean monochrome rebuild based on the user's reference.
-- Native gameplay controls are preserved and moved as-is so their callbacks remain intact.
-- Test branch only. Production Loader.lua/main.lua are not changed.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_BLACKLIGHT_TEST_STOP",
    "A7DEV_PS2_BLACKLIGHT_POLISH_STOP",
    "A7DEV_PS2_BLACKLIGHT_V4_STOP",
    "A7DEV_PS2_BLACKLIGHT_SAFE_STOP",
    "A7DEV_PS2_BLACKLIGHT_NATIVE_STOP",
    "A7DEV_PS2_BLACKLIGHT_V7_STOP",
}) do
    if type(ENV[key]) == "function" then
        pcall(ENV[key])
    end
end

local alive = true
local connections = {}
local originalSections = {}
local originalDirectVisibility = {}
local routedSections = setmetatable({}, {__mode = "k"})
local watchedButtons = setmetatable({}, {__mode = "k"})

local function on(connection)
    if connection then
        connections[#connections + 1] = connection
    end
    return connection
end

local function mk(className, parent, props)
    local object = Instance.new(className)
    for key, value in pairs(props or {}) do
        object[key] = value
    end
    object.Parent = parent
    return object
end

local function existingCorner(object, radius)
    local c = object:FindFirstChildOfClass("UICorner")
    if c then c.CornerRadius = UDim.new(0, radius) end
end

local function existingStroke(object, color, transparency)
    local s = object:FindFirstChildOfClass("UIStroke")
    if s then
        s.Color = color
        s.Thickness = 1
        s.Transparency = transparency
    end
end

local C = {
    bg = Color3.fromRGB(5, 5, 7),
    header = Color3.fromRGB(7, 7, 9),
    panel = Color3.fromRGB(14, 14, 17),
    control = Color3.fromRGB(20, 20, 24),
    controlHover = Color3.fromRGB(25, 25, 30),
    active = Color3.fromRGB(38, 38, 44),
    border = Color3.fromRGB(37, 37, 43),
    borderSoft = Color3.fromRGB(29, 29, 34),
    text = Color3.fromRGB(241, 241, 244),
    muted = Color3.fromRGB(135, 138, 146),
    dim = Color3.fromRGB(79, 82, 90),
    white = Color3.fromRGB(236, 237, 241),
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
}

local function lower(value)
    return string.lower(tostring(value or ""))
end

local function isRed(color)
    return typeof(color) == "Color3"
        and color.R > .24
        and color.R > color.G * 1.35
        and color.R > color.B * 1.18
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
    warn("[A7DEV UI V7] Slayer 2 GUI was not found.")
    return
end

local main = gui:FindFirstChild("Main")
if not main then
    warn("[A7DEV UI V7] Main frame was not found.")
    return
end

pcall(function()
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
end)

-- Remove stale test-only shells from repeated execution.
for _, child in ipairs(main:GetChildren()) do
    if string.find(child.Name or "", "A7DEV_PS2_BLACKLIGHT_TEST_", 1, true) == 1 then
        pcall(function() child:Destroy() end)
    end
end
for _, name in ipairs({
    "A7DEV_PS2_BLACKLIGHT_MINI",
    "A7DEV_PS2_BLACKLIGHT_MINI_V2",
    "A7DEV_PS2_NATIVE_MINI",
    "A7DEV_PS2_V7_MINI",
    "A7DEV_PS2_KEYLIST",
    "A7DEV_PS2_KEYLIST_V2",
}) do
    local old = gui:FindFirstChild(name)
    if old then pcall(function() old:Destroy() end) end
end

local sections = {}
for _, object in ipairs(main:GetDescendants()) do
    if object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_" then
        sections[#sections + 1] = object
        originalSections[object] = {
            parent = object.Parent,
            position = object.Position,
            size = object.Size,
            layoutOrder = object.LayoutOrder,
            automaticSize = object.AutomaticSize,
            visible = object.Visible,
            zindex = object.ZIndex,
        }
    end
end

for _, child in ipairs(main:GetChildren()) do
    if child:IsA("GuiObject") then
        originalDirectVisibility[child] = child.Visible
    end
end

local uselessPrefixes = {
    "session:",
    "progress:",
    "recoveries:",
    "crafting:",
    "fishing:",
    "god mode:",
    "scan:",
    "catalog:",
    "streaming ",
    "selected bosses:",
    "boss page ",
    "waiting for ",
    "phase=",
}

local function hasInteractiveDescendant(parent)
    for _, d in ipairs(parent:GetDescendants()) do
        if d:IsA("TextButton") or d:IsA("TextBox") then
            return true
        end
    end
    return false
end

local function insideButton(object, stopAt)
    local parent = object.Parent
    while parent and parent ~= stopAt do
        if parent:IsA("TextButton") then return true end
        parent = parent.Parent
    end
    return false
end

local function translateText(object)
    if not object or not object.Parent then return end
    if not (object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox")) then return end
    pcall(function() object.AutoLocalize = false end)
    local replacement = ENGLISH[tostring(object.Text or "")]
    if replacement then object.Text = replacement end
end

local function shouldHideText(label, section, title)
    if label == title then return false end
    if insideButton(label, section) then return false end

    local text = tostring(label.Text or "")
    if text == "" then return false end

    local l = lower(text)
    for _, prefix in ipairs(uselessPrefixes) do
        if string.find(l, prefix, 1, true) == 1 then
            return true
        end
    end

    local commas = 0
    text:gsub(",", function() commas += 1 end)
    if #text > 76 and commas >= 3 then return true end

    -- Long non-control descriptions are intentionally removed.
    if #text > 52 then return true end

    return false
end

local function hideTextRow(label, section)
    local parent = label.Parent
    if parent and parent ~= section and parent:IsA("Frame") and not hasInteractiveDescendant(parent) then
        parent.Visible = false
    else
        label.Visible = false
    end
end

local function firstDirectTitle(section)
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
    return best
end

local function neutralizeFrame(frame)
    if not frame:IsA("Frame") then return end
    if not isRed(frame.BackgroundColor3) then return end

    local h = frame.AbsoluteSize.Y > 0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset
    local w = frame.AbsoluteSize.X > 0 and frame.AbsoluteSize.X or frame.Size.X.Offset

    if h > 0 and h <= 8 and (frame.Size.X.Scale > .1 or w >= 45) then
        frame.BackgroundColor3 = C.white
    elseif h > 0 and h <= 24 and w > 0 and w <= 52 then
        frame.BackgroundColor3 = C.control
    else
        frame.BackgroundColor3 = C.border
    end
end

local function fixZ(section)
    section.ZIndex = 130
    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("GuiObject") then
            local relative = math.clamp(object.ZIndex, 0, 20)
            object.ZIndex = 131 + relative
        end
    end
end

local function styleNativeSection(section)
    if not section or not section.Parent then return end

    section.BackgroundColor3 = C.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    section.ClipsDescendants = false
    existingCorner(section, 11)
    existingStroke(section, C.border, .08)

    local title = firstDirectTitle(section)

    for _, object in ipairs(section:GetDescendants()) do
        translateText(object)

        if object:IsA("TextLabel") then
            if object == title then
                object.Visible = true
                object.Font = Enum.Font.GothamBold
                object.TextSize = 11
                object.TextColor3 = C.text
                object.TextXAlignment = Enum.TextXAlignment.Left
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
            elseif shouldHideText(object, section, title) then
                hideTextRow(object, section)
            else
                object.Font = Enum.Font.GothamMedium
                object.TextSize = math.clamp(object.TextSize, 9, 10)
                object.TextColor3 = C.muted
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
            end

        elseif object:IsA("TextButton") then
            object.Active = true
            object.Selectable = true
            object.AutoButtonColor = false
            object.BorderSizePixel = 0

            if object.Text ~= "" then
                object.BackgroundColor3 = C.control
                object.BackgroundTransparency = 0
                object.TextColor3 = C.text
                object.Font = Enum.Font.GothamMedium
                object.TextSize = 10
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
                existingCorner(object, 7)
                existingStroke(object, C.border, .14)
            else
                object.BackgroundTransparency = 1
                local label = object:FindFirstChildWhichIsA("TextLabel")
                if label then
                    label.Visible = true
                    label.Font = Enum.Font.GothamMedium
                    label.TextSize = 10
                    label.TextColor3 = C.text
                    label.TextWrapped = false
                    label.TextTruncate = Enum.TextTruncate.AtEnd
                end
            end

        elseif object:IsA("TextBox") then
            object.Active = true
            object.Selectable = true
            object.BorderSizePixel = 0
            object.BackgroundColor3 = C.control
            object.BackgroundTransparency = 0
            object.TextColor3 = C.text
            object.PlaceholderColor3 = C.dim
            object.Font = Enum.Font.GothamMedium
            object.TextSize = 10
            object.TextWrapped = false
            existingCorner(object, 7)
            existingStroke(object, C.border, .14)

        elseif object:IsA("ScrollingFrame") then
            object.BackgroundTransparency = 1
            object.BorderSizePixel = 0
            object.ScrollBarThickness = 2
            object.ScrollBarImageColor3 = C.dim

        elseif object:IsA("UIStroke") then
            object.Color = C.border
            if object.Transparency < .04 then object.Transparency = .04 end

        elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
            if isRed(object.ImageColor3) then
                object.ImageColor3 = C.muted
            end

        elseif object:IsA("Frame") then
            neutralizeFrame(object)
        end
    end

    -- Clean all currently visible red inherited from the production theme.
    if isRed(section.BackgroundColor3) then section.BackgroundColor3 = C.panel end
    fixZ(section)
end

-- Style while the controls are still in their production hierarchy.
for _, section in ipairs(sections) do
    styleNativeSection(section)
end

-- Let production-side DescendantAdded handlers finish before final placement.
task.wait(.25)

-- Hide the old presentation only after the native controls have been styled.
for child in pairs(originalDirectVisibility) do
    if child and child.Parent == main then
        child.Visible = false
    end
end

main.AnchorPoint = Vector2.new(.5, .5)
main.Position = UDim2.fromScale(.5, .5)
main.Size = UDim2.fromOffset(956, 565)
main.BackgroundColor3 = C.bg
main.BorderSizePixel = 0
existingCorner(main, 9)
existingStroke(main, C.border, .04)

local uiScale = main:FindFirstChildOfClass("UIScale")
if not uiScale then
    uiScale = mk("UIScale", main, {Scale = 1})
end

local root = mk("Frame", main, {
    Name = "A7DEV_PS2_BLACKLIGHT_TEST_V7",
    Size = UDim2.fromScale(1, 1),
    BackgroundColor3 = C.bg,
    BorderSizePixel = 0,
    Active = false,
    ZIndex = 100,
})
mk("UICorner", root, {CornerRadius = UDim.new(0, 9)})

local function viewport()
    local cam = workspace.CurrentCamera
    return cam and cam.ViewportSize or Vector2.new(1280, 720)
end

local maximized = false
local function fit()
    if maximized then return end
    local vp = viewport()
    uiScale.Scale = math.max(.2, math.min(1, (vp.X - 10) / 956, (vp.Y - 10) / 565))
    main.Position = UDim2.fromOffset(vp.X / 2, vp.Y / 2)
end
fit()

-- Header: flat, monochrome, no glow, no gradients.
local header = mk("Frame", root, {
    Position = UDim2.fromOffset(0, 0),
    Size = UDim2.new(1, 0, 0, 55),
    BackgroundColor3 = C.header,
    BorderSizePixel = 0,
    Active = true,
    ZIndex = 200,
})
mk("Frame", header, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 201,
})

mk("TextLabel", header, {
    Position = UDim2.fromOffset(20, 0),
    Size = UDim2.fromOffset(46, 55),
    BackgroundTransparency = 1,
    Text = "A7",
    Font = Enum.Font.GothamBold,
    TextSize = 18,
    TextColor3 = C.text,
    AutoLocalize = false,
    ZIndex = 202,
})

local primaryOrder = {"INFO", "MAIN", "PLAYER", "SERVER", "SETTINGS"}
local primaryIcons = {
    INFO = "rbxassetid://7733960981",
    MAIN = "rbxassetid://7733674079",
    PLAYER = "rbxassetid://7743875962",
    SERVER = "rbxassetid://7733992789",
    SETTINGS = "rbxassetid://7734053495",
}
local px = {76, 153, 244, 343, 436}
local pw = {69, 81, 91, 87, 105}
local primaryButtons = {}

for i, key in ipairs(primaryOrder) do
    local button = mk("TextButton", header, {
        Position = UDim2.fromOffset(px[i], 8),
        Size = UDim2.fromOffset(pw[i], 38),
        BackgroundColor3 = C.active,
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "",
        Active = true,
        Selectable = true,
        ZIndex = 202,
    })
    mk("UICorner", button, {CornerRadius = UDim.new(0, 9)})

    local icon = mk("ImageLabel", button, {
        Position = UDim2.fromOffset(9, 10),
        Size = UDim2.fromOffset(18, 18),
        BackgroundTransparency = 1,
        Image = primaryIcons[key],
        ImageColor3 = C.dim,
        ScaleType = Enum.ScaleType.Fit,
        ZIndex = 203,
    })

    local label = mk("TextLabel", button, {
        Position = UDim2.fromOffset(32, 0),
        Size = UDim2.new(1, -35, 1, 0),
        BackgroundTransparency = 1,
        Text = key,
        Font = Enum.Font.GothamBold,
        TextSize = 10,
        TextColor3 = C.dim,
        TextXAlignment = Enum.TextXAlignment.Left,
        AutoLocalize = false,
        ZIndex = 203,
    })

    primaryButtons[key] = {button = button, icon = icon, label = label}
end

local search = mk("TextBox", header, {
    Position = UDim2.new(1, -303, 0, 10),
    Size = UDim2.fromOffset(188, 34),
    BackgroundColor3 = C.control,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Search settings...",
    PlaceholderColor3 = C.dim,
    Text = "",
    TextColor3 = C.text,
    Font = Enum.Font.GothamMedium,
    TextSize = 10,
    TextXAlignment = Enum.TextXAlignment.Left,
    AutoLocalize = false,
    Active = true,
    Selectable = true,
    ZIndex = 203,
})
mk("UICorner", search, {CornerRadius = UDim.new(0, 9)})
mk("UIStroke", search, {Color = C.border, Thickness = 1, Transparency = .12})
mk("UIPadding", search, {
    PaddingLeft = UDim.new(0, 12),
    PaddingRight = UDim.new(0, 10),
})

local function windowButton(text, right)
    local b = mk("TextButton", header, {
        Position = UDim2.new(1, right, 0, 11),
        Size = UDim2.fromOffset(32, 32),
        BackgroundColor3 = C.control,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = text,
        Font = Enum.Font.GothamBold,
        TextSize = 13,
        TextColor3 = C.muted,
        AutoLocalize = false,
        Active = true,
        Selectable = true,
        ZIndex = 204,
    })
    mk("UICorner", b, {CornerRadius = UDim.new(0, 8)})
    mk("UIStroke", b, {Color = C.border, Thickness = 1, Transparency = .16})
    return b
end

local minimizeButton = windowButton("−", -110)
local maximizeButton = windowButton("↗", -73)
local closeButton = windowButton("×", -36)

local secondary = mk("Frame", root, {
    Position = UDim2.fromOffset(0, 55),
    Size = UDim2.new(1, 0, 0, 42),
    BackgroundColor3 = C.bg,
    BorderSizePixel = 0,
    Active = false,
    ZIndex = 190,
})
mk("Frame", secondary, {
    Position = UDim2.new(0, 0, 1, -1),
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 191,
})

local content = mk("Frame", root, {
    Position = UDim2.fromOffset(0, 97),
    Size = UDim2.new(1, 0, 1, -122),
    BackgroundColor3 = C.bg,
    BorderSizePixel = 0,
    Active = false,
    ClipsDescendants = true,
    ZIndex = 110,
})

local footer = mk("Frame", root, {
    Position = UDim2.new(0, 0, 1, -25),
    Size = UDim2.new(1, 0, 0, 25),
    BackgroundColor3 = C.header,
    BorderSizePixel = 0,
    Active = false,
    ZIndex = 190,
})
mk("Frame", footer, {
    Size = UDim2.new(1, 0, 0, 1),
    BackgroundColor3 = C.borderSoft,
    BorderSizePixel = 0,
    ZIndex = 191,
})
mk("TextLabel", footer, {
    Position = UDim2.fromOffset(16, 1),
    Size = UDim2.fromOffset(300, 23),
    BackgroundTransparency = 1,
    Text = "A7DEV HUB · Slayers 2",
    Font = Enum.Font.GothamMedium,
    TextSize = 8,
    TextColor3 = C.dim,
    TextXAlignment = Enum.TextXAlignment.Left,
    AutoLocalize = false,
    ZIndex = 192,
})
mk("TextLabel", footer, {
    Position = UDim2.new(1, -180, 0, 1),
    Size = UDim2.fromOffset(165, 23),
    BackgroundTransparency = 1,
    Text = "LeftControl · menu",
    Font = Enum.Font.GothamMedium,
    TextSize = 8,
    TextColor3 = C.dim,
    TextXAlignment = Enum.TextXAlignment.Right,
    AutoLocalize = false,
    ZIndex = 192,
})

local pages = {}
local pageColumns = {}
local pageSections = {}

local pageIds = {
    "INFO",
    "MAIN:Settings", "MAIN:Farming", "MAIN:Dungeon", "MAIN:Progression", "MAIN:Spin", "MAIN:Misc",
    "PLAYER:Combat", "PLAYER:Visuals", "PLAYER:Movement", "PLAYER:Travel",
    "SERVER",
    "SETTINGS",
}

local function createPage(id)
    local page = mk("ScrollingFrame", content, {
        Name = "A7DEV_V7_PAGE_" .. id:gsub("[^%w]", "_"),
        Size = UDim2.fromScale(1, 1),
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        CanvasSize = UDim2.new(),
        AutomaticCanvasSize = Enum.AutomaticSize.Y,
        ScrollBarThickness = 2,
        ScrollBarImageColor3 = C.dim,
        ScrollingDirection = Enum.ScrollingDirection.Y,
        Visible = false,
        Active = true,
        ZIndex = 120,
    })

    local positions = {
        UDim2.new(0, 18, 0, 17),
        UDim2.new(1/3, 7, 0, 17),
        UDim2.new(2/3, -4, 0, 17),
    }

    local columns = {}
    for i = 1, 3 do
        local column = mk("Frame", page, {
            Position = positions[i],
            Size = UDim2.new(1/3, -21, 0, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            Active = false,
            ZIndex = 121,
        })
        mk("UIListLayout", column, {
            SortOrder = Enum.SortOrder.LayoutOrder,
            Padding = UDim.new(0, 13),
        })
        columns[i] = column
    end

    pages[id] = page
    pageColumns[id] = columns
    pageSections[id] = {}
end

for _, id in ipairs(pageIds) do
    createPage(id)
end

local ROUTE = {
    ["Section_Farm Position"] = {"MAIN:Settings", 1, 10, "Farm Config"},
    ["Section_Farm Safety + Session"] = {"MAIN:Settings", 2, 10, "Safety"},
    ["Section_Defense"] = {"MAIN:Settings", 3, 10, "Defence"},

    ["Section_Farm Automation"] = {"MAIN:Farming", 1, 10, "Farming"},
    ["Section_Target Filter"] = {"MAIN:Farming", 1, 20, "Targets"},
    ["Section_Boss Automation"] = {"MAIN:Farming", 2, 10, "Boss Farm"},
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

    ["Section_Clan Spins"] = {"MAIN:Spin", 1, 10, "Clan Spins"},

    ["Section_Chest + Loot"] = {"MAIN:Misc", 1, 10, "Loot"},
    ["Section_Inventory Helper"] = {"MAIN:Misc", 1, 20, "Inventory"},
    ["Section_Crafting / Alchemy"] = {"MAIN:Misc", 2, 10, "Crafting"},
    ["Section_Auto Sell"] = {"MAIN:Misc", 2, 20, "Auto Sell"},
    ["Section_Fishing"] = {"MAIN:Misc", 3, 10, "Fishing"},
    ["Section_Utilities"] = {"MAIN:Misc", 3, 20, "Utilities"},

    ["Section_Native Actions"] = {"PLAYER:Combat", 1, 10, "Combat"},
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

local function setTitle(section, title)
    local label = firstDirectTitle(section)
    if label and title then
        label.Text = title
        label.AutoLocalize = false
        label.Font = Enum.Font.GothamBold
        label.TextSize = 11
        label.TextColor3 = C.text
    end
end

local function routeSection(section)
    if not section or not section.Parent then return end

    if section.Name == "Section_Diagnostics" or section.Name == "Section_Live Boss Scanner" then
        section.Visible = false
        return
    end

    local route = ROUTE[section.Name] or {"MAIN:Misc", 3, 900, section.Name:gsub("^Section_", "")}
    local target = pageColumns[route[1]] and pageColumns[route[1]][route[2]]
    if not target then return end

    section.Parent = target
    section.Position = UDim2.new()
    section.Size = UDim2.new(1, 0, section.Size.Y.Scale, section.Size.Y.Offset)
    section.LayoutOrder = route[3]
    section.Visible = true
    section.ClipsDescendants = false
    setTitle(section, route[4])
    fixZ(section)

    routedSections[section] = true
    pageSections[route[1]][section] = true
end

-- Final placement. No decorative descendants are inserted into native sections after this.
for _, section in ipairs(sections) do
    routeSection(section)
end

-- Minimal custom cards only for pages that have no production controls.
local function card(pageId, column, title, height, order)
    local frame = mk("Frame", pageColumns[pageId][column], {
        Size = UDim2.new(1, 0, 0, height),
        BackgroundColor3 = C.panel,
        BorderSizePixel = 0,
        LayoutOrder = order or -1000,
        Active = false,
        ZIndex = 130,
    })
    mk("UICorner", frame, {CornerRadius = UDim.new(0, 11)})
    mk("UIStroke", frame, {Color = C.border, Thickness = 1, Transparency = .08})
    mk("TextLabel", frame, {
        Position = UDim2.fromOffset(14, 8),
        Size = UDim2.new(1, -28, 0, 24),
        BackgroundTransparency = 1,
        Text = title,
        Font = Enum.Font.GothamBold,
        TextSize = 11,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        AutoLocalize = false,
        ZIndex = 131,
    })
    return frame
end

local function row(frame, y, left, right)
    mk("TextLabel", frame, {
        Position = UDim2.fromOffset(14, y),
        Size = UDim2.new(.58, -14, 0, 21),
        BackgroundTransparency = 1,
        Text = left,
        Font = Enum.Font.GothamMedium,
        TextSize = 10,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        AutoLocalize = false,
        ZIndex = 131,
    })
    mk("TextLabel", frame, {
        Position = UDim2.new(.58, 0, 0, y),
        Size = UDim2.new(.42, -14, 0, 21),
        BackgroundTransparency = 1,
        Text = right,
        Font = Enum.Font.GothamMedium,
        TextSize = 9,
        TextColor3 = C.muted,
        TextXAlignment = Enum.TextXAlignment.Right,
        AutoLocalize = false,
        ZIndex = 131,
    })
end

local infoCard = card("INFO", 1, "Information", 124)
row(infoCard, 42, "Hub", "A7DEV HUB")
row(infoCard, 66, "Game", "Slayers 2")
row(infoCard, 90, "Interface", "BlackLight")

local menuCard = card("INFO", 2, "Menu", 124)
row(menuCard, 42, "Menu Bind", "LeftControl")
row(menuCard, 66, "Search", "Enabled")
row(menuCard, 90, "Language", "English")

local serverCard = card("SERVER", 1, "Server", 196)

local function action(parent, y, text, callback)
    local b = mk("TextButton", parent, {
        Position = UDim2.fromOffset(14, y),
        Size = UDim2.new(1, -28, 0, 32),
        BackgroundColor3 = C.control,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = text,
        Font = Enum.Font.GothamMedium,
        TextSize = 10,
        TextColor3 = C.text,
        AutoLocalize = false,
        Active = true,
        Selectable = true,
        ZIndex = 132,
    })
    mk("UICorner", b, {CornerRadius = UDim.new(0, 7)})
    mk("UIStroke", b, {Color = C.border, Thickness = 1, Transparency = .14})
    on(b.Activated:Connect(callback))
    return b
end

action(serverCard, 40, "Rejoin", function()
    pcall(function()
        if game.JobId ~= "" then
            TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
        else
            TeleportService:Teleport(game.PlaceId, LocalPlayer)
        end
    end)
end)

action(serverCard, 77, "Copy Job ID", function()
    local clipboard = setclipboard or toclipboard
    if clipboard then pcall(clipboard, game.JobId) end
end)

local jobBox = mk("TextBox", serverCard, {
    Position = UDim2.fromOffset(14, 114),
    Size = UDim2.new(1, -28, 0, 30),
    BackgroundColor3 = C.control,
    BorderSizePixel = 0,
    ClearTextOnFocus = false,
    PlaceholderText = "Job ID...",
    PlaceholderColor3 = C.dim,
    Text = "",
    TextColor3 = C.text,
    Font = Enum.Font.GothamMedium,
    TextSize = 10,
    TextXAlignment = Enum.TextXAlignment.Left,
    AutoLocalize = false,
    Active = true,
    Selectable = true,
    ZIndex = 132,
})
mk("UICorner", jobBox, {CornerRadius = UDim.new(0, 7)})
mk("UIStroke", jobBox, {Color = C.border, Thickness = 1, Transparency = .14})
mk("UIPadding", jobBox, {PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10)})

action(serverCard, 150, "Join Job", function()
    local id = tostring(jobBox.Text or ""):match("^%s*(.-)%s*$")
    if id ~= "" then
        pcall(function()
            TeleportService:TeleportToPlaceInstance(game.PlaceId, id, LocalPlayer)
        end)
    end
end)

local interfaceCard = card("SETTINGS", 2, "Interface", 124)
row(interfaceCard, 42, "Menu Bind", "LeftControl")
row(interfaceCard, 66, "Theme", "BlackLight")
row(interfaceCard, 90, "Accent", "Monochrome")

local SUB = {
    MAIN = {"Settings", "Farming", "Dungeon", "Progression", "Spin", "Misc"},
    PLAYER = {"Combat", "Visuals", "Movement", "Travel"},
}

local subButtons = {}
local currentPrimary = "MAIN"
local currentSub = "Settings"
local currentPage = "MAIN:Settings"

local function pageId(primary, sub)
    if primary == "MAIN" or primary == "PLAYER" then
        return primary .. ":" .. tostring(sub)
    end
    return primary
end

local function sectionMatches(section, query)
    if query == "" then return true end
    if string.find(lower(section.Name), query, 1, true) then return true end

    for _, object in ipairs(section:GetDescendants()) do
        if (object:IsA("TextLabel") or object:IsA("TextButton")) and object.Visible then
            if string.find(lower(object.Text), query, 1, true) then return true end
        elseif object:IsA("TextBox") and object.Visible then
            if string.find(lower(object.Text .. " " .. object.PlaceholderText), query, 1, true) then return true end
        end
    end
    return false
end

local function applySearch()
    local query = lower(search.Text):match("^%s*(.-)%s*$")
    local set = pageSections[currentPage]
    if not set then return end

    for section in pairs(set) do
        if section.Parent then
            section.Visible = sectionMatches(section, query)
        end
    end
end

local selectView

local function clearSubButtons()
    for _, object in ipairs(secondary:GetChildren()) do
        if object:IsA("TextButton") then object:Destroy() end
    end
    table.clear(subButtons)
end

local function rebuildSub(primary, selected)
    clearSubButtons()
    local tabs = SUB[primary]
    if not tabs then return end

    local x = 18
    for _, name in ipairs(tabs) do
        local width = math.max(76, #name * 7 + 24)
        local button = mk("TextButton", secondary, {
            Position = UDim2.fromOffset(x, 7),
            Size = UDim2.fromOffset(width, 28),
            BackgroundColor3 = C.active,
            BackgroundTransparency = name == selected and 0 or 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = name,
            Font = Enum.Font.GothamMedium,
            TextSize = 9,
            TextColor3 = name == selected and C.text or C.muted,
            AutoLocalize = false,
            Active = true,
            Selectable = true,
            ZIndex = 192,
        })
        mk("UICorner", button, {CornerRadius = UDim.new(0, 8)})
        subButtons[name] = button
        x += width + 6
    end

    for name, button in pairs(subButtons) do
        on(button.Activated:Connect(function()
            selectView(primary, name)
        end))
    end
end

selectView = function(primary, sub)
    currentPrimary = primary
    local tabs = SUB[primary]

    if tabs then
        local valid = false
        for _, name in ipairs(tabs) do
            if name == sub then valid = true break end
        end
        if not valid then sub = tabs[1] end
    else
        sub = nil
    end

    currentSub = sub
    currentPage = pageId(primary, sub)

    local hasSub = tabs ~= nil
    secondary.Visible = hasSub

    if hasSub then
        content.Position = UDim2.fromOffset(0, 97)
        content.Size = UDim2.new(1, 0, 1, -122)
        rebuildSub(primary, sub)
    else
        content.Position = UDim2.fromOffset(0, 55)
        content.Size = UDim2.new(1, 0, 1, -80)
        clearSubButtons()
    end

    for id, page in pairs(pages) do
        page.Visible = id == currentPage
    end

    for key, item in pairs(primaryButtons) do
        local active = key == primary
        item.button.BackgroundTransparency = active and 0 or 1
        item.icon.ImageColor3 = active and C.text or C.dim
        item.label.TextColor3 = active and C.text or C.dim
    end

    applySearch()
end

for key, item in pairs(primaryButtons) do
    on(item.button.Activated:Connect(function()
        local tabs = SUB[key]
        selectView(key, tabs and tabs[1] or nil)
    end))
end

on(search:GetPropertyChangedSignal("Text"):Connect(applySearch))

-- Keep native buttons above the page containers and re-neutralize toggles after clicks.
local function watchNativeButton(button, section)
    if watchedButtons[button] then return end
    watchedButtons[button] = true

    on(button.Activated:Connect(function()
        task.defer(function()
            if alive and section.Parent then
                styleNativeSection(section)
                fixZ(section)
            end
        end)
    end))
end

for section in pairs(routedSections) do
    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("TextButton") then
            watchNativeButton(object, section)
        end
    end
end

-- Dynamic native controls/features: property-only styling, then re-route the section last.
on(gui.DescendantAdded:Connect(function(object)
    if not alive or not object.Parent then return end
    if string.find(object.Name or "", "A7DEV_PS2_BLACKLIGHT_TEST_", 1, true) == 1 then return end
    if string.find(object.Name or "", "A7DEV_V7_", 1, true) == 1 then return end

    local section = object
    while section and section ~= gui do
        if section:IsA("Frame") and string.sub(section.Name, 1, 8) == "Section_" then break end
        section = section.Parent
    end

    if section and section ~= gui then
        task.defer(function()
            if not alive or not section.Parent then return end

            translateText(object)

            if object:IsA("TextLabel") then
                local title = firstDirectTitle(section)
                if shouldHideText(object, section, title) then
                    hideTextRow(object, section)
                else
                    object.Font = Enum.Font.GothamMedium
                    object.TextSize = math.clamp(object.TextSize, 9, 10)
                    object.TextWrapped = false
                    object.TextTruncate = Enum.TextTruncate.AtEnd
                end
            elseif object:IsA("TextButton") then
                object.Active = true
                object.Selectable = true
                object.AutoButtonColor = false
                object.TextWrapped = false
                object.TextTruncate = Enum.TextTruncate.AtEnd
                watchNativeButton(object, section)
            elseif object:IsA("TextBox") then
                object.Active = true
                object.Selectable = true
                object.TextWrapped = false
            elseif object:IsA("Frame") then
                neutralizeFrame(object)
            elseif object:IsA("UIStroke") then
                object.Color = C.border
            end

            -- Production runtime may move the section when a descendant is added.
            -- Move it back after its own deferred handler has run.
            task.delay(.03, function()
                if alive and section.Parent then
                    routeSection(section)
                end
            end)
        end)
    end
end))

-- Dragging.
local dragging, dragStart, startPosition
on(header.InputBegan:Connect(function(input)
    if input.UserInputType ~= Enum.UserInputType.MouseButton1
        and input.UserInputType ~= Enum.UserInputType.Touch then return end
    if input.Position.X >= search.AbsolutePosition.X - 4 then return end

    dragging = input
    dragStart = input.Position
    startPosition = main.Position
end))

on(UserInputService.InputChanged:Connect(function(input)
    if not dragging then return end
    if dragging.UserInputType == Enum.UserInputType.MouseButton1
        and input.UserInputType ~= Enum.UserInputType.MouseMovement then return end
    if dragging.UserInputType == Enum.UserInputType.Touch and input ~= dragging then return end

    local delta = input.Position - dragStart
    main.Position = UDim2.new(
        startPosition.X.Scale,
        startPosition.X.Offset + delta.X,
        startPosition.Y.Scale,
        startPosition.Y.Offset + delta.Y
    )
end))

on(UserInputService.InputEnded:Connect(function(input)
    if input == dragging
        or (dragging
            and dragging.UserInputType == Enum.UserInputType.MouseButton1
            and input.UserInputType == Enum.UserInputType.MouseButton1) then
        dragging = nil
    end
end))

local mini = mk("TextButton", gui, {
    Name = "A7DEV_PS2_V7_MINI",
    Position = UDim2.new(1, -58, 0, 14),
    Size = UDim2.fromOffset(44, 36),
    BackgroundColor3 = C.control,
    BorderSizePixel = 0,
    AutoButtonColor = false,
    Text = "A7",
    Font = Enum.Font.GothamBold,
    TextSize = 11,
    TextColor3 = C.text,
    AutoLocalize = false,
    Active = true,
    Selectable = true,
    Visible = false,
    ZIndex = 1000,
})
mk("UICorner", mini, {CornerRadius = UDim.new(0, 9)})
mk("UIStroke", mini, {Color = C.border, Thickness = 1, Transparency = .1})

local minimized = false
local function setMinimized(value)
    minimized = value == true
    root.Visible = not minimized
    mini.Visible = minimized
end

on(minimizeButton.Activated:Connect(function() setMinimized(true) end))
on(mini.Activated:Connect(function() setMinimized(false) end))

on(maximizeButton.Activated:Connect(function()
    maximized = not maximized
    if maximized then
        local vp = viewport()
        uiScale.Scale = 1
        main.Size = UDim2.fromOffset(math.max(956, vp.X - 8), math.max(565, vp.Y - 8))
        main.Position = UDim2.fromOffset(vp.X / 2, vp.Y / 2)
        maximizeButton.Text = "↙"
    else
        main.Size = UDim2.fromOffset(956, 565)
        maximizeButton.Text = "↗"
        fit()
    end
end))

local function restorePresentation()
    for section, info in pairs(originalSections) do
        if section and section.Parent and info.parent and info.parent.Parent then
            pcall(function()
                section.Parent = info.parent
                section.Position = info.position
                section.Size = info.size
                section.LayoutOrder = info.layoutOrder
                section.AutomaticSize = info.automaticSize
                section.Visible = info.visible
                section.ZIndex = info.zindex
            end)
        end
    end

    for child, visible in pairs(originalDirectVisibility) do
        if child and child.Parent == main then
            pcall(function() child.Visible = visible end)
        end
    end
end

local function stopV7(restoreOld)
    if not alive then return end
    alive = false

    for _, connection in ipairs(connections) do
        pcall(function() connection:Disconnect() end)
    end
    table.clear(connections)

    if mini and mini.Parent then mini:Destroy() end
    if root and root.Parent then root:Destroy() end
    if restoreOld then restorePresentation() end

    ENV.A7DEV_PS2_BLACKLIGHT_V7_STOP = nil
end

ENV.A7DEV_PS2_BLACKLIGHT_V7_STOP = function()
    stopV7(true)
end

on(closeButton.Activated:Connect(function()
    local state = ENV.A7DEV_PROJECT_SLAYER_2
    local destroyed = false

    if state and type(state.Destroy) == "function" then
        destroyed = pcall(state.Destroy)
    elseif state and state.Runtime and type(state.Runtime.destroyAll) == "function" then
        destroyed = pcall(state.Runtime.destroyAll)
    end

    if destroyed then
        stopV7(false)
    else
        stopV7(true)
        pcall(function() gui:Destroy() end)
    end
end))

on(UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Enum.KeyCode.LeftControl then
        setMinimized(not minimized)
    end
end))

if workspace.CurrentCamera then
    on(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
        task.defer(fit)
    end))
end

-- Final monochrome sweep. Property changes only.
task.spawn(function()
    while alive and root.Parent do
        for section in pairs(routedSections) do
            if section and section.Parent then
                for _, object in ipairs(section:GetDescendants()) do
                    if object:IsA("Frame") then
                        neutralizeFrame(object)
                    elseif object:IsA("UIStroke") then
                        object.Color = C.border
                    elseif (object:IsA("ImageLabel") or object:IsA("ImageButton")) and isRed(object.ImageColor3) then
                        object.ImageColor3 = C.muted
                    elseif (object:IsA("TextLabel") or object:IsA("TextButton")) and isRed(object.TextColor3) then
                        object.TextColor3 = object:IsA("TextButton") and C.text or C.muted
                    end
                end
            end
        end
        task.wait(.8)
    end
end)

selectView("MAIN", "Settings")
fit()
