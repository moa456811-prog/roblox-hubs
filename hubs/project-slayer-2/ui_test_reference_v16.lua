-- A7DEV HUB | Slayers 2 | Reference UI TEST V16
-- Extends V15: remove ALL remaining grey section/container backgrounds.
-- Keeps native buttons, inputs, sliders and toggle visuals intact.

local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_REF_V15_STOP",
    "A7DEV_PS2_REF_V16_STOP",
}) do
    if type(ENV[key]) == "function" then pcall(ENV[key]) end
end

local BASE_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_reference_v13.lua"

local okHttp, source = pcall(game.HttpGet, game, BASE_URL)
if not okHttp then
    warn("[A7DEV UI V16] base download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V16] base compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V16] base runtime failed: " .. tostring(runError))
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
    alive=false
    for _,c in ipairs(connections) do
        pcall(function() c:Disconnect() end)
    end
    table.clear(connections)
    ENV.A7DEV_PS2_REF_V16_STOP=nil
end
ENV.A7DEV_PS2_REF_V16_STOP=stop

local playerGui=LocalPlayer:WaitForChild("PlayerGui")
local gui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main=gui and gui:FindFirstChild("Main")
local root=main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V13")

if not gui or not main or not root then
    warn("[A7DEV UI V16] V13 root not found.")
    stop()
    return
end

root.Name="A7DEV_PS2_BLACKLIGHT_TEST_V16"

local function isSection(o)
    return o:IsA("Frame") and string.sub(o.Name,1,8)=="Section_"
end

local function findSection(o)
    local p=o
    while p and p~=root do
        if isSection(p) then return p end
        p=p.Parent
    end
end

local function isToggleOrSliderPart(frame)
    local name=string.lower(tostring(frame.Name or ""))

    if string.find(name,"switch",1,true)
        or string.find(name,"knob",1,true)
        or string.find(name,"slider",1,true)
        or string.find(name,"track",1,true)
        or string.find(name,"rail",1,true)
        or string.find(name,"fill",1,true) then
        return true
    end

    local w=frame.AbsoluteSize.X>0 and frame.AbsoluteSize.X or frame.Size.X.Offset
    local h=frame.AbsoluteSize.Y>0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset

    -- Toggle tracks/knobs and slider rails must keep their own colors.
    if w>0 and w<=60 and h>0 and h<=30 then return true end
    if h>0 and h<=10 then return true end

    local parent=frame.Parent
    if parent and (parent:IsA("TextButton") or parent:IsA("TextBox")) then
        return true
    end

    return false
end

local function isInteractiveContainer(frame)
    -- Preserve dropdown/button/input internals.
    local parent=frame.Parent
    if parent and (parent:IsA("TextButton") or parent:IsA("TextBox")) then
        return true
    end

    for _,child in ipairs(frame:GetChildren()) do
        if child:IsA("TextBox") then
            return true
        end
    end

    return false
end

local function removeSectionGrey(section)
    if not section or not section.Parent then return end

    -- Section card itself.
    section.BackgroundColor3=BG
    section.BackgroundTransparency=0

    -- Every large decorative/internal container inside the section.
    for _,object in ipairs(section:GetDescendants()) do
        if object:IsA("Frame") then
            if not isToggleOrSliderPart(object)
                and not isInteractiveContainer(object)
                and object.BackgroundTransparency<1 then
                object.BackgroundColor3=BG
            end

        elseif object:IsA("ScrollingFrame") then
            if object.BackgroundTransparency<1 then
                object.BackgroundColor3=BG
            end
        end
    end
end

local function apply()
    if not alive or not root.Parent then return end

    for _,object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            removeSectionGrey(object)
        end
    end
end

apply()

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if not alive or not object.Parent then return end

        local section=findSection(object)
        if section then
            removeSectionGrey(section)
        end
    end)
end))

-- V13 dynamically refreshes several native sections. Keep only their large
-- backgrounds pinned to black while preserving every control-specific color.
task.spawn(function()
    while alive and root.Parent do
        apply()
        task.wait(.10)
    end
end)

on(root.AncestryChanged:Connect(function(_,parent)
    if not parent then stop() end
end))
