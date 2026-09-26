-- A7DEV HUB | Slayers 2 | Black/White UI TEST V8
-- Loads V7 and applies a strict black/white-only palette.
-- Property-only pass: no native callbacks are replaced.

local V7_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v7.lua"

local okHttp, source = pcall(game.HttpGet, game, V7_URL)
if not okHttp then
    warn("[A7DEV UI V8] V7 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V8] V7 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V8] V7 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BW_V8_STOP then
    pcall(ENV.A7DEV_PS2_BW_V8_STOP)
end

local alive = true
local connections = {}
local guarded = setmetatable({}, {__mode = "k"})

local BLACK = Color3.fromRGB(0, 0, 0)
local WHITE = Color3.fromRGB(255, 255, 255)

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
    ENV.A7DEV_PS2_BW_V8_STOP = nil
end
ENV.A7DEV_PS2_BW_V8_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not gui or not main or not root then
    warn("[A7DEV UI V8] V7 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V8"

local function isPrimaryTab(button)
    if not button:IsA("TextButton") or button.Text ~= "" then return false end
    local hasLabel = false
    local hasIcon = false
    for _, d in ipairs(button:GetChildren()) do
        if d:IsA("TextLabel") then hasLabel = true end
        if d:IsA("ImageLabel") then hasIcon = true end
    end
    return hasLabel and hasIcon
end

local function isWindowControl(button)
    if not button:IsA("TextButton") then return false end
    local t = tostring(button.Text or "")
    return t == "−" or t == "↗" or t == "↙" or t == "×"
end

local function isActivePrimary(button)
    return isPrimaryTab(button) and button.BackgroundTransparency < .5
end

local function isActiveSub(button)
    if not button:IsA("TextButton") or button.Text == "" then return false end
    local parent = button.Parent
    return parent
        and parent:IsA("Frame")
        and parent.Position.Y.Offset == 55
        and button.BackgroundTransparency < .5
end

local function forceBW(object)
    if not object or not object.Parent then return end

    if object:IsA("Frame") or object:IsA("ScrollingFrame") then
        if object.BackgroundTransparency < 1 then
            object.BackgroundColor3 = BLACK
        end

    elseif object:IsA("TextButton") then
        object.BorderSizePixel = 0

        if isActivePrimary(object) or isActiveSub(object) then
            object.BackgroundColor3 = WHITE
            object.BackgroundTransparency = 0
            object.TextColor3 = BLACK
            for _, d in ipairs(object:GetDescendants()) do
                if d:IsA("TextLabel") then d.TextColor3 = BLACK end
                if d:IsA("ImageLabel") then d.ImageColor3 = BLACK end
            end
        elseif isWindowControl(object) then
            object.BackgroundColor3 = BLACK
            object.TextColor3 = WHITE
        elseif object.Text ~= "" then
            object.BackgroundColor3 = BLACK
            object.TextColor3 = WHITE
        else
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 1
        end

    elseif object:IsA("TextBox") then
        object.BackgroundColor3 = BLACK
        object.TextColor3 = WHITE
        object.PlaceholderColor3 = WHITE

    elseif object:IsA("TextLabel") then
        if object.BackgroundTransparency < 1 then
            object.BackgroundColor3 = BLACK
        end
        object.TextColor3 = WHITE

    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        object.ImageColor3 = WHITE
        if object.BackgroundTransparency < 1 then
            object.BackgroundColor3 = BLACK
        end

    elseif object:IsA("UIStroke") then
        object.Color = WHITE

    elseif object:IsA("UIGradient") then
        object.Enabled = false
    end
end

local function syncToggleVisuals(section)
    for _, button in ipairs(section:GetDescendants()) do
        if button:IsA("TextButton") and button.Text == "" then
            local label = button:FindFirstChildWhichIsA("TextLabel")
            if label then
                label.TextColor3 = WHITE
            end

            for _, frame in ipairs(button:GetDescendants()) do
                if frame:IsA("Frame") then
                    local w = frame.AbsoluteSize.X > 0 and frame.AbsoluteSize.X or frame.Size.X.Offset
                    local h = frame.AbsoluteSize.Y > 0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset

                    if w > 0 and w <= 52 and h > 0 and h <= 26 then
                        frame.BackgroundColor3 = BLACK
                        local knob = frame:FindFirstChildWhichIsA("Frame")
                        if knob then
                            knob.BackgroundColor3 = WHITE
                        end
                    end
                end
            end
        end
    end
end

local function styleSearch()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextBox") and object.PlaceholderText == "Search settings..." then
            object.BackgroundColor3 = BLACK
            object.TextColor3 = WHITE
            object.PlaceholderColor3 = WHITE
            local stroke = object:FindFirstChildOfClass("UIStroke")
            if stroke then
                stroke.Color = WHITE
                stroke.Transparency = .55
            end
        end
    end
end

local function styleTabs()
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextButton") then
            if isActivePrimary(object) or isActiveSub(object) then
                object.BackgroundColor3 = WHITE
                object.BackgroundTransparency = 0
                object.TextColor3 = BLACK
                for _, d in ipairs(object:GetDescendants()) do
                    if d:IsA("TextLabel") then d.TextColor3 = BLACK end
                    if d:IsA("ImageLabel") then d.ImageColor3 = BLACK end
                end
            elseif isPrimaryTab(object) then
                object.BackgroundColor3 = BLACK
                object.BackgroundTransparency = 1
                for _, d in ipairs(object:GetDescendants()) do
                    if d:IsA("TextLabel") then d.TextColor3 = WHITE end
                    if d:IsA("ImageLabel") then d.ImageColor3 = WHITE end
                end
            end
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end

    main.BackgroundColor3 = BLACK
    root.BackgroundColor3 = BLACK

    for _, object in ipairs(root:GetDescendants()) do
        forceBW(object)
    end

    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_" then
            object.BackgroundColor3 = BLACK
            local stroke = object:FindFirstChildOfClass("UIStroke")
            if stroke then
                stroke.Color = WHITE
                stroke.Transparency = .72
            end
            syncToggleVisuals(object)
        end
    end

    styleTabs()
    styleSearch()
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
    task.defer(function()
        if alive and object.Parent then
            forceBW(object)
            queuePass()
        end
    end)
end))

for _, object in ipairs(root:GetDescendants()) do
    if object:IsA("TextButton") then
        on(object.Activated:Connect(function()
            task.delay(.02, queuePass)
        end))
    end
end

on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then queuePass() end
end))

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))

task.spawn(function()
    while alive and root.Parent do
        fullPass()
        task.wait(.6)
    end
end)
