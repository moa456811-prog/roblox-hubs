-- A7DEV HUB | Slayers 2 | BlackLight UI V18
-- Only change from V17: prevent any red color from reappearing.
-- No layout, text, button, switch, size or startup behavior changes.

local ENV = (getgenv and getgenv()) or _G

if type(ENV.A7DEV_PS2_REF_V18_STOP) == "function" then
    pcall(ENV.A7DEV_PS2_REF_V18_STOP)
end

local V17_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/hubs/project-slayer-2/ui_blacklight_v17.lua"

local okHttp, source = pcall(game.HttpGet, game, V17_URL)
if not okHttp then
    warn("[A7DEV UI V18] V17 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V18] V17 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V18] V17 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

local BG = Color3.fromRGB(5,5,7)
local CONTROL = Color3.fromRGB(20,20,24)
local BORDER = Color3.fromRGB(37,37,43)
local TEXT = Color3.fromRGB(241,241,244)
local MUTED = Color3.fromRGB(135,138,146)
local WHITE = Color3.fromRGB(236,237,241)

local alive = true
local connections = {}
local watched = setmetatable({}, {__mode="k"})
local guard = setmetatable({}, {__mode="k"})

local function on(c)
    if c then connections[#connections+1] = c end
    return c
end

local function stop()
    if not alive then return end
    alive = false
    for _,c in ipairs(connections) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(connections)
    ENV.A7DEV_PS2_REF_V18_STOP = nil
end
ENV.A7DEV_PS2_REF_V18_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not root then
    warn("[A7DEV UI V18] V17 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V18"

local function isRed(color)
    return typeof(color) == "Color3"
        and color.R > .24
        and color.R > color.G * 1.30
        and color.R > color.B * 1.15
end

local function neutralize(object)
    if not object or not object.Parent or guard[object] then return end
    guard[object] = true

    if object:IsA("Frame") then
        if isRed(object.BackgroundColor3) then
            local w = object.AbsoluteSize.X > 0 and object.AbsoluteSize.X or object.Size.X.Offset
            local h = object.AbsoluteSize.Y > 0 and object.AbsoluteSize.Y or object.Size.Y.Offset

            if h > 0 and h <= 8 and (object.Size.X.Scale > .1 or w >= 45) then
                object.BackgroundColor3 = WHITE
            elseif w > 0 and w <= 60 and h > 0 and h <= 30 then
                object.BackgroundColor3 = CONTROL
            else
                object.BackgroundColor3 = BG
            end
        end

    elseif object:IsA("TextButton") then
        if isRed(object.BackgroundColor3) then object.BackgroundColor3 = CONTROL end
        if isRed(object.TextColor3) then object.TextColor3 = TEXT end

    elseif object:IsA("TextBox") then
        if isRed(object.BackgroundColor3) then object.BackgroundColor3 = CONTROL end
        if isRed(object.TextColor3) then object.TextColor3 = TEXT end
        if isRed(object.PlaceholderColor3) then object.PlaceholderColor3 = MUTED end

    elseif object:IsA("TextLabel") then
        if isRed(object.BackgroundColor3) then object.BackgroundColor3 = BG end
        if isRed(object.TextColor3) then object.TextColor3 = TEXT end

    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        if isRed(object.ImageColor3) then object.ImageColor3 = MUTED end
        if isRed(object.BackgroundColor3) then object.BackgroundColor3 = BG end

    elseif object:IsA("UIStroke") then
        if isRed(object.Color) then object.Color = BORDER end

    elseif object:IsA("ScrollingFrame") then
        if isRed(object.BackgroundColor3) then object.BackgroundColor3 = BG end
        if isRed(object.ScrollBarImageColor3) then object.ScrollBarImageColor3 = MUTED end
    end

    guard[object] = nil
end

local function watch(object)
    if watched[object] or not object.Parent then return end
    watched[object] = true
    neutralize(object)

    if object:IsA("Frame") then
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("TextButton") then
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("TextColor3"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("TextBox") then
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("TextColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("PlaceholderColor3"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("TextLabel") then
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("TextColor3"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        on(object:GetPropertyChangedSignal("ImageColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("UIStroke") then
        on(object:GetPropertyChangedSignal("Color"):Connect(function()
            if alive then neutralize(object) end
        end))

    elseif object:IsA("ScrollingFrame") then
        on(object:GetPropertyChangedSignal("BackgroundColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
        on(object:GetPropertyChangedSignal("ScrollBarImageColor3"):Connect(function()
            if alive then neutralize(object) end
        end))
    end
end

-- Batch registration to avoid a startup hitch.
task.spawn(function()
    local all = root:GetDescendants()
    for i,object in ipairs(all) do
        if not alive then return end
        watch(object)
        if i % 80 == 0 then task.wait() end
    end
end)

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if alive and object.Parent then watch(object) end
    end)
end))

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))
