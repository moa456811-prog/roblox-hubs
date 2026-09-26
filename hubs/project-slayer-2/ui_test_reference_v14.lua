-- A7DEV HUB | Slayers 2 | Reference UI TEST V14
-- Targeted change only: remove the grey section/card background from V13.
-- Everything else (buttons, switches, tabs, text, callbacks) stays unchanged.

local ENV = (getgenv and getgenv()) or _G

if type(ENV.A7DEV_PS2_REF_V14_STOP) == "function" then
    pcall(ENV.A7DEV_PS2_REF_V14_STOP)
end

local V13_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_reference_v13.lua"

local okHttp, source = pcall(game.HttpGet, game, V13_URL)
if not okHttp then
    warn("[A7DEV UI V14] V13 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V14] V13 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V14] V13 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local BLACK = Color3.fromRGB(5,5,7)

local alive = true
local connections = {}

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
    ENV.A7DEV_PS2_REF_V14_STOP = nil
end

ENV.A7DEV_PS2_REF_V14_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V13")

if not gui or not main or not root then
    warn("[A7DEV UI V14] V13 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V14"

local function isSection(object)
    return object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_"
end

local function removeGreyFromSection(section)
    if not section or not section.Parent then return end
    section.BackgroundColor3 = BLACK
    section.BackgroundTransparency = 0
end

local function apply()
    if not alive or not root.Parent then return end
    for _, object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            removeGreyFromSection(object)
        end
    end
end

apply()

on(root.DescendantAdded:Connect(function(object)
    if isSection(object) then
        task.defer(function()
            if alive and object.Parent then
                removeGreyFromSection(object)
            end
        end)
    end
end))

-- V13 may restyle dynamic sections later; keep only the section background black.
task.spawn(function()
    while alive and root.Parent do
        apply()
        task.wait(.15)
    end
end)

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))
