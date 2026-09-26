-- A7DEV HUB | Slayers 2 | Black/White UI TEST V9
-- Fixes V8 control visibility and permanently suppresses the legacy presentation.
-- Black/white only. Property-only styling on native gameplay controls.

local V7_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v7.lua"

local okHttp, source = pcall(game.HttpGet, game, V7_URL)
if not okHttp then
    warn("[A7DEV UI V9] V7 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V9] V7 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V9] V7 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BW_V9_STOP then
    pcall(ENV.A7DEV_PS2_BW_V9_STOP)
end

local alive = true
local connections = {}
local watched = setmetatable({}, {__mode = "k"})
local legacyVisibleGuards = setmetatable({}, {__mode = "k"})

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
    ENV.A7DEV_PS2_BW_V9_STOP = nil
end
ENV.A7DEV_PS2_BW_V9_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not gui or not main or not root then
    warn("[A7DEV UI V9] V7 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V9"

pcall(function()
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
end)

local function isSection(object)
    return object:IsA("Frame") and string.sub(object.Name, 1, 8) == "Section_"
end

local function isPage(object)
    return object:IsA("ScrollingFrame") and string.find(object.Name, "A7DEV_V7_PAGE_", 1, true) == 1
end

local function isPrimaryTab(button)
    if not button:IsA("TextButton") or button.Text ~= "" then return false end
    local labels, icons = 0, 0
    for _, child in ipairs(button:GetChildren()) do
        if child:IsA("TextLabel") then labels += 1 end
        if child:IsA("ImageLabel") then icons += 1 end
    end
    return labels > 0 and icons > 0
end

local function isWindowButton(button)
    if not button:IsA("TextButton") then return false end
    local text = tostring(button.Text or "")
    return text == "−" or text == "↗" or text == "↙" or text == "×"
end

local function isSubTab(button)
    if not button:IsA("TextButton") or button.Text == "" then return false end
    local parent = button.Parent
    return parent
        and parent:IsA("Frame")
        and parent.Parent == root
        and parent.Position.Y.Offset == 55
end

local function activeTab(button)
    return (isPrimaryTab(button) or isSubTab(button)) and button.BackgroundTransparency < .5
end

local function noGreyText(object)
    if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
        object.TextColor3 = WHITE
    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        object.ImageColor3 = WHITE
    end
end

local function styleBasic(object)
    if not object or not object.Parent then return end

    if object:IsA("UIGradient") then
        object.Enabled = false
        return
    end

    if object:IsA("UIStroke") then
        object.Color = WHITE
        object.Transparency = .45
        object.Thickness = 1
        return
    end

    if object:IsA("Frame") then
        if object.BackgroundTransparency < 1 then
            object.BackgroundColor3 = BLACK
        end
        object.BorderColor3 = WHITE
        if object.BorderSizePixel > 0 then
            object.BorderSizePixel = 1
        end
        return
    end

    if object:IsA("ScrollingFrame") then
        if object.BackgroundTransparency < 1 then object.BackgroundColor3 = BLACK end
        object.BorderColor3 = WHITE
        object.ScrollBarImageColor3 = WHITE
        return
    end

    if object:IsA("TextLabel") then
        if object.BackgroundTransparency < 1 then object.BackgroundColor3 = BLACK end
        object.TextColor3 = WHITE
        return
    end

    if object:IsA("ImageLabel") then
        if object.BackgroundTransparency < 1 then object.BackgroundColor3 = BLACK end
        object.ImageColor3 = WHITE
        return
    end

    if object:IsA("TextBox") then
        object.BackgroundColor3 = BLACK
        object.BackgroundTransparency = 0
        object.TextColor3 = WHITE
        object.PlaceholderColor3 = WHITE
        object.BorderColor3 = WHITE
        object.BorderSizePixel = 1
        return
    end

    if object:IsA("TextButton") then
        object.Active = true
        object.Selectable = true
        object.AutoButtonColor = false
        object.BorderColor3 = WHITE

        if activeTab(object) then
            object.BackgroundColor3 = WHITE
            object.BackgroundTransparency = 0
            object.BorderSizePixel = 0
            object.TextColor3 = BLACK
            for _, d in ipairs(object:GetDescendants()) do
                if d:IsA("TextLabel") then d.TextColor3 = BLACK end
                if d:IsA("ImageLabel") then d.ImageColor3 = BLACK end
            end
        elseif isPrimaryTab(object) then
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 1
            object.BorderSizePixel = 0
            for _, d in ipairs(object:GetDescendants()) do
                noGreyText(d)
            end
        elseif isSubTab(object) then
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 0
            object.BorderColor3 = WHITE
            object.BorderSizePixel = 1
            object.TextColor3 = WHITE
        elseif isWindowButton(object) then
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 0
            object.BorderColor3 = WHITE
            object.BorderSizePixel = 1
            object.TextColor3 = WHITE
        elseif object.Text ~= "" then
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 0
            object.BorderColor3 = WHITE
            object.BorderSizePixel = 1
            object.TextColor3 = WHITE
        else
            -- Native toggle row: the row remains transparent/clickable.
            object.BackgroundColor3 = BLACK
            object.BackgroundTransparency = 1
            object.BorderSizePixel = 0
        end
        return
    end

    if object:IsA("ImageButton") then
        object.ImageColor3 = WHITE
        object.BorderColor3 = WHITE
    end
end

local function makeNativeControlVisible(section)
    if not section or not section.Parent then return end

    section.BackgroundColor3 = BLACK
    section.BackgroundTransparency = 0
    section.BorderColor3 = WHITE
    section.BorderSizePixel = 1

    for _, object in ipairs(section:GetDescendants()) do
        styleBasic(object)

        -- Checkbox/toggle/slider pieces: use white outlines so black-on-black never disappears.
        if object:IsA("Frame") then
            local width = object.AbsoluteSize.X > 0 and object.AbsoluteSize.X or object.Size.X.Offset
            local height = object.AbsoluteSize.Y > 0 and object.AbsoluteSize.Y or object.Size.Y.Offset

            if width > 0 and width <= 54 and height > 0 and height <= 28 then
                object.BackgroundColor3 = BLACK
                object.BorderColor3 = WHITE
                object.BorderSizePixel = 1

                for _, child in ipairs(object:GetChildren()) do
                    if child:IsA("Frame") then
                        local cw = child.AbsoluteSize.X > 0 and child.AbsoluteSize.X or child.Size.X.Offset
                        local ch = child.AbsoluteSize.Y > 0 and child.AbsoluteSize.Y or child.Size.Y.Offset
                        if cw > 0 and cw <= 22 and ch > 0 and ch <= 22 then
                            child.BackgroundColor3 = WHITE
                            child.BorderSizePixel = 0
                        end
                    end
                end
            elseif height > 0 and height <= 8 and (object.Size.X.Scale > .1 or width >= 45) then
                -- Slider rail/fill.
                object.BackgroundColor3 = WHITE
                object.BorderSizePixel = 0
            end
        end
    end
end

local function hideLegacyChild(child)
    if not child or not child.Parent or child == root then return end
    if not child:IsA("GuiObject") then return end

    child.Visible = false

    if legacyVisibleGuards[child] then return end
    legacyVisibleGuards[child] = true

    on(child:GetPropertyChangedSignal("Visible"):Connect(function()
        if alive and child.Parent == main and child ~= root and child.Visible then
            child.Visible = false
        end
    end))
end

local function lockLegacyUI()
    for _, child in ipairs(main:GetChildren()) do
        if child ~= root and child:IsA("GuiObject") then
            hideLegacyChild(child)
        end
    end
end

local function styleHeaderAndPages()
    main.BackgroundColor3 = BLACK
    main.BorderColor3 = WHITE
    main.BorderSizePixel = 1
    root.BackgroundColor3 = BLACK

    for _, object in ipairs(root:GetDescendants()) do
        styleBasic(object)
    end

    for _, object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            makeNativeControlVisible(object)
        elseif isPage(object) then
            object.ScrollBarImageColor3 = WHITE
        end
    end

    -- Re-apply active/inactive tab contrast last.
    for _, object in ipairs(root:GetDescendants()) do
        if object:IsA("TextButton") and (isPrimaryTab(object) or isSubTab(object)) then
            if activeTab(object) then
                object.BackgroundColor3 = WHITE
                object.BackgroundTransparency = 0
                object.BorderSizePixel = 0
                for _, d in ipairs(object:GetDescendants()) do
                    if d:IsA("TextLabel") then d.TextColor3 = BLACK end
                    if d:IsA("ImageLabel") then d.ImageColor3 = BLACK end
                end
            else
                object.BackgroundColor3 = BLACK
                object.TextColor3 = WHITE
                for _, d in ipairs(object:GetDescendants()) do
                    noGreyText(d)
                end
                if isSubTab(object) then
                    object.BackgroundTransparency = 0
                    object.BorderColor3 = WHITE
                    object.BorderSizePixel = 1
                else
                    object.BackgroundTransparency = 1
                    object.BorderSizePixel = 0
                end
            end
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end
    lockLegacyUI()
    styleHeaderAndPages()
end

fullPass()

-- Any old production UI that tries to reappear is hidden again immediately.
on(main.ChildAdded:Connect(function(child)
    task.defer(function()
        if alive and child.Parent == main and child ~= root and child:IsA("GuiObject") then
            hideLegacyChild(child)
        end
    end)
end))

-- Keep active-tab styling in sync after navigation.
for _, object in ipairs(root:GetDescendants()) do
    if object:IsA("TextButton") then
        on(object.Activated:Connect(function()
            task.delay(.02, fullPass)
            task.delay(.12, fullPass)
        end))
    end
end

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if alive and object.Parent then
            styleBasic(object)

            local section = object
            while section and section ~= root do
                if isSection(section) then
                    makeNativeControlVisible(section)
                    break
                end
                section = section.Parent
            end
        end
    end)
end))

on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then task.defer(fullPass) end
end))

on(root.AncestryChanged:Connect(function(_, parent)
    if not parent then stop() end
end))

task.spawn(function()
    while alive and root.Parent do
        fullPass()
        task.wait(.5)
    end
end)
