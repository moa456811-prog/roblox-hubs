-- A7DEV HUB | Slayers 2 | Reference UI TEST V15
-- Targeted fix for the remaining large grey backgrounds seen in the user's screenshot.
-- Keeps switches/buttons/inputs unchanged. Test branch only.

local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_REF_V14_STOP",
    "A7DEV_PS2_REF_V15_STOP",
}) do
    if type(ENV[key]) == "function" then pcall(ENV[key]) end
end

local BASE_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_reference_v13.lua"

local okHttp, source = pcall(game.HttpGet, game, BASE_URL)
if not okHttp then
    warn("[A7DEV UI V15] base download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V15] base compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V15] base runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

local BG = Color3.fromRGB(5,5,7)
local alive = true
local connections = {}

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
    ENV.A7DEV_PS2_REF_V15_STOP = nil
end
ENV.A7DEV_PS2_REF_V15_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V13")

if not gui or not main or not root then
    warn("[A7DEV UI V15] V13 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V15"

local function isSection(o)
    return o:IsA("Frame") and string.sub(o.Name,1,8) == "Section_"
end

local function inSection(o)
    local p=o
    while p and p~=root do
        if isSection(p) then return true end
        p=p.Parent
    end
    return false
end

local function isSmallControlFrame(frame)
    local w = frame.AbsoluteSize.X > 0 and frame.AbsoluteSize.X or frame.Size.X.Offset
    local h = frame.AbsoluteSize.Y > 0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset

    -- Keep toggle tracks, knobs and slider rails untouched.
    if w > 0 and w <= 55 and h > 0 and h <= 30 then return true end
    if h > 0 and h <= 10 then return true end

    local parent = frame.Parent
    if parent and (parent:IsA("TextButton") or parent:IsA("TextBox")) then
        return true
    end

    return false
end

local function isGreyBackground(color)
    if typeof(color) ~= "Color3" then return false end
    local r = math.floor(color.R*255 + .5)
    local g = math.floor(color.G*255 + .5)
    local b = math.floor(color.B*255 + .5)

    -- Covers the grey visible in the screenshot (~37,41,48)
    -- plus neighboring legacy shades from the old UI.
    return r >= 28 and r <= 55
       and g >= 28 and g <= 58
       and b >= 30 and b <= 65
end

local function removeGrey(object)
    if not object or not object.Parent then return end

    if isSection(object) then
        object.BackgroundColor3 = BG
        object.BackgroundTransparency = 0
        return
    end

    if (object:IsA("Frame") or object:IsA("ScrollingFrame"))
        and inSection(object)
        and not isSmallControlFrame(object)
        and object.BackgroundTransparency < 1
        and isGreyBackground(object.BackgroundColor3) then
        object.BackgroundColor3 = BG
    end
end

local function apply()
    if not alive or not root.Parent then return end

    for _,object in ipairs(root:GetDescendants()) do
        removeGrey(object)
    end
end

apply()

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if alive and object.Parent then
            removeGrey(object)
        end
    end)
end))

-- V13 can restyle dynamic content after it appears; keep only these
-- large grey surfaces forced back to the near-black background.
task.spawn(function()
    while alive and root.Parent do
        apply()
        task.wait(.12)
    end
end)

on(root.AncestryChanged:Connect(function(_,parent)
    if not parent then stop() end
end))
