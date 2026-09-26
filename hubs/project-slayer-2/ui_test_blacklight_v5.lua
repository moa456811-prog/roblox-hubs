-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V5 SAFE
-- Safe UI pass: no extra descendants inside native gameplay sections.
-- Fixes blank pages, text overflow, English-only labels, and preserves native callbacks.

local V2_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v2.lua"

local okHttp, source = pcall(game.HttpGet, game, V2_URL)
if not okHttp then
    warn("[A7DEV UI TEST V5] Base UI download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI TEST V5] Base UI compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI TEST V5] Base UI runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_SAFE_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_SAFE_STOP)
end

local alive = true
local connections = {}
local textLocks = setmetatable({}, {__mode = "k"})

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
    ENV.A7DEV_PS2_BLACKLIGHT_SAFE_STOP = nil
end
ENV.A7DEV_PS2_BLACKLIGHT_SAFE_STOP = stop

local C = {
    bg = Color3.fromRGB(5, 5, 7),
    panel = Color3.fromRGB(14, 14, 17),
    control = Color3.fromRGB(20, 20, 24),
    active = Color3.fromRGB(35, 35, 40),
    border = Color3.fromRGB(38, 38, 44),
    text = Color3.fromRGB(240, 240, 245),
    muted = Color3.fromRGB(137, 140, 148),
    dim = Color3.fromRGB(84, 87, 95),
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

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V2")

if not gui or not main or not root then
    warn("[A7DEV UI TEST V5] BlackLight base root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V5"
root.Active = true

local function isSection(object)
    return object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_"
end

local function translate(object)
    if not object or not object.Parent then return end
    if not (object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox")) then return end

    pcall(function() object.AutoLocalize = false end)

    local text = tostring(object.Text or "")
    local replacement = ENGLISH[text]
    if replacement and text ~= replacement then
        object.Text = replacement
    end
end

local function guardTranslation(object)
    if textLocks[object] then return end
    textLocks[object] = true
    translate(object)
    on(object:GetPropertyChangedSignal("Text"):Connect(function()
        if alive and object.Parent then
            translate(object)
        end
    end))
end

local function commas(text)
    local _, count = tostring(text or ""):gsub(",", "")
    return count
end

local function cleanTextObject(object)
    if not object or not object.Parent then return end

    if object:IsA("TextLabel") then
        guardTranslation(object)

        local text = tostring(object.Text or "")

        -- Hide raw catalogs/debug dumps that were never intended as visible UI.
        if #text > 95 and commas(text) >= 5 then
            object.Visible = false
            return
        end

        object.TextWrapped = false
        object.TextTruncate = Enum.TextTruncate.AtEnd

        if string.find(text, "Fishing:", 1, true) == 1
            or string.find(text, "Crafting:", 1, true) == 1
            or string.find(text, "Session:", 1, true) == 1
            or string.find(text, "Progress:", 1, true) == 1
            or string.find(text, "God Mode:", 1, true) == 1 then
            object.TextTruncate = Enum.TextTruncate.AtEnd
            object.TextWrapped = false
        end
    elseif object:IsA("TextButton") then
        guardTranslation(object)
        object.Active = true
        object.Selectable = true
        object.AutoButtonColor = false

        if object.Text ~= "" then
            object.TextWrapped = false
            object.TextTruncate = Enum.TextTruncate.AtEnd
        end
    elseif object:IsA("TextBox") then
        guardTranslation(object)
        object.Active = true
        object.Selectable = true
        object.TextWrapped = false
    end
end

local function pages()
    local result = {}
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("ScrollingFrame") and string.find(object.Name, "BlackLightPage_", 1, true) == 1 then
            result[#result + 1] = object
        end
    end
    return result
end

local function columns(page)
    local result = {}

    for _, child in ipairs(page:GetChildren()) do
        if child:IsA("Frame") and child:FindFirstChildOfClass("UIListLayout") then
            result[#result + 1] = child
        end
    end

    table.sort(result, function(a, b)
        local ax = a.Position.X.Scale * 10000 + a.Position.X.Offset
        local bx = b.Position.X.Scale * 10000 + b.Position.X.Offset
        return ax < bx
    end)

    return result
end

local function fixPageGrid(page)
    page.BackgroundTransparency = 1
    page.BorderSizePixel = 0
    page.ClipsDescendants = true
    page.ScrollBarThickness = 2
    page.ScrollBarImageColor3 = C.dim

    local cols = columns(page)
    if #cols < 3 then return end

    -- Responsive 3-column grid: 20px outer margins + 14px gaps.
    local positions = {
        UDim2.new(0, 20, 0, 18),
        UDim2.new(1/3, 9, 0, 18),
        UDim2.new(2/3, -2, 0, 18),
    }

    for index = 1, 3 do
        local col = cols[index]
        col.Position = positions[index]
        col.Size = UDim2.new(1/3, -23, 0, 0)
        col.AutomaticSize = Enum.AutomaticSize.Y
        col.BackgroundTransparency = 1
        col.BorderSizePixel = 0
        col.ClipsDescendants = false

        local layout = col:FindFirstChildOfClass("UIListLayout")
        if layout then
            layout.Padding = UDim.new(0, 14)
        end

        for _, card in ipairs(col:GetChildren()) do
            if card:IsA("Frame") then
                card.Size = UDim2.new(1, 0, card.Size.Y.Scale, card.Size.Y.Offset)
                card.Position = UDim2.new()

                -- No children are added here. Native click connections remain intact.
                for _, object in ipairs(card:GetDescendants()) do
                    cleanTextObject(object)
                end
            end
        end
    end
end

local function removeBadSearchGlyph()
    local searchBox

    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextBox") and object.PlaceholderText == "Search settings..." then
            searchBox = object
            break
        end
    end

    if not searchBox then return end

    for _, sibling in ipairs(searchBox.Parent:GetChildren()) do
        if sibling:IsA("TextLabel") then
            local text = tostring(sibling.Text or "")
            if text == "⌕" or text == "□" or text == "◻" then
                sibling.Visible = false
            end
        end
    end

    local padding = searchBox:FindFirstChildOfClass("UIPadding")
    if padding then
        padding.PaddingLeft = UDim.new(0, 12)
    end
end

local function repairSections()
    -- V2 already performs the actual safe reparenting. Here we only ensure
    -- visible sections stay visible and text never overflows.
    for _, object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            if object.Name == "Section_Diagnostics" or object.Name == "Section_Live Boss Scanner" then
                object.Visible = false
            else
                object.Visible = true
            end

            object.ClipsDescendants = false

            for _, child in ipairs(object:GetDescendants()) do
                cleanTextObject(child)
            end
        end
    end
end

local function fixTopText()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
            cleanTextObject(object)
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end

    root.BackgroundColor3 = C.bg
    main.BackgroundColor3 = C.bg

    removeBadSearchGlyph()
    fixTopText()

    for _, page in ipairs(pages()) do
        fixPageGrid(page)
    end

    repairSections()
end

-- Let V2 finish moving/restoring all native feature sections first.
task.wait(.35)
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

-- IMPORTANT: property-only maintenance. We do not create objects in native sections.
on(root.DescendantAdded:Connect(function(object)
    if not alive then return end

    if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
        task.defer(function()
            if alive and object.Parent then cleanTextObject(object) end
        end)
    end
end))

on(main:GetPropertyChangedSignal("Size"):Connect(queuePass))
on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then queuePass() end
end))

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))

task.delay(1.0, function()
    if alive then fullPass() end
end)
