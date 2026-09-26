-- A7DEV HUB | Slayers 2 | REFERENCE UI TEST V13
-- Matches the first four supplied screenshots:
-- near-black layered surfaces, subtle borders, compact typography,
-- visible pill activation switches on EVERY native toggle row.
-- Native callbacks are preserved. Test branch only.

local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_BW_V8_STOP",
    "A7DEV_PS2_BW_V9_STOP",
    "A7DEV_PS2_BW_V10_STOP",
    "A7DEV_PS2_REF_V11_STOP",
    "A7DEV_PS2_BW_V12_STOP",
    "A7DEV_PS2_REF_V13_STOP",
    "A7DEV_PS2_BLACKLIGHT_V7_STOP",
}) do
    if type(ENV[key]) == "function" then pcall(ENV[key]) end
end

local BASE_UI = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v7.lua"

local okHttp, source = pcall(game.HttpGet, game, BASE_UI)
if not okHttp then
    warn("[A7DEV UI V13] base download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V13] base compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V13] base runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

local alive = true
local connections = {}
local legacyGuards = setmetatable({}, {__mode="k"})
local toggleGuards = setmetatable({}, {__mode="k"})
local rebuiltSwitch = setmetatable({}, {__mode="k"})

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
    ENV.A7DEV_PS2_REF_V13_STOP = nil
end
ENV.A7DEV_PS2_REF_V13_STOP = stop

-- Exact dominant colors from the first supplied screenshots.
local C = {
    BG       = Color3.fromRGB(5,5,7),       -- ~70-85% of reference surface
    PANEL    = Color3.fromRGB(14,14,17),    -- section cards
    CONTROL  = Color3.fromRGB(20,20,24),    -- buttons / inputs / tracks
    ACTIVE   = Color3.fromRGB(35,35,40),    -- selected tab
    BORDER   = Color3.fromRGB(38,38,44),    -- card/control outlines
    OUTLINE  = Color3.fromRGB(60,60,66),    -- stronger control outline
    TEXT     = Color3.fromRGB(240,240,245),  -- primary text
    WHITE    = Color3.fromRGB(245,247,250),  -- bright active knob / slider
    MUTED    = Color3.fromRGB(118,122,130),  -- inactive labels
    KNOB_OFF = Color3.fromRGB(130,131,134),  -- inactive switch knob
}

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not gui or not main or not root then
    warn("[A7DEV UI V13] V7 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V13"
pcall(function() gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling end)

local function low(v) return string.lower(tostring(v or "")) end

local function isSection(o)
    return o:IsA("Frame") and string.sub(o.Name,1,8) == "Section_"
end

local function findSection(o)
    local p=o
    while p and p~=root and p~=gui do
        if isSection(p) then return p end
        p=p.Parent
    end
end

local function isPrimaryTab(button)
    if not button:IsA("TextButton") or button.Text~="" then return false end
    local label,icon=false,false
    for _,child in ipairs(button:GetChildren()) do
        if child:IsA("TextLabel") then label=true end
        if child:IsA("ImageLabel") then icon=true end
    end
    return label and icon
end

local function isSubTab(button)
    if not button:IsA("TextButton") or button.Text=="" then return false end
    local p=button.Parent
    return p and p:IsA("Frame") and p.Parent==root and p.Position.Y.Offset==55
end

local function isWindowButton(button)
    if not button:IsA("TextButton") then return false end
    local t=tostring(button.Text or "")
    return t=="−" or t=="↗" or t=="↙" or t=="×"
end

local function activeTab(button)
    return (isPrimaryTab(button) or isSubTab(button)) and button.BackgroundTransparency < .5
end

local noise = {
    "session:",
    "progress:",
    "recoveries:",
    "scan:",
    "catalog:",
    "streaming ",
    "selected bosses:",
    "boss page ",
    "souls idle",
    "auto sell | idle",
    "crafting types:",
    "crafting:",
    "fishing:",
    "god mode:",
    "phase=",
}

local function hideNoise(label)
    if not label:IsA("TextLabel") then return end
    local text=tostring(label.Text or "")
    local l=low(text)

    for _,pattern in ipairs(noise) do
        if string.find(l,pattern,1,true) then
            label.Visible=false
            return
        end
    end

    local commas=0
    text:gsub(",",function() commas+=1 end)
    if #text>72 and commas>=3 then
        label.Visible=false
    end
end

local function setExistingCorner(object,radius)
    local c=object:FindFirstChildOfClass("UICorner")
    if c then c.CornerRadius=UDim.new(0,radius) end
end

local function setExistingStroke(object,color,transparency)
    local s=object:FindFirstChildOfClass("UIStroke")
    if s then
        s.Color=color
        s.Transparency=transparency or 0
        s.Thickness=1
    end
end

local function styleSection(section)
    section.BackgroundColor3=C.PANEL
    section.BackgroundTransparency=0
    section.BorderSizePixel=0
    section.ClipsDescendants=false
    setExistingCorner(section,12)
    setExistingStroke(section,C.BORDER,.06)

    local title
    for _,child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and child.Text~="" then
            title=child
            break
        end
    end

    for _,object in ipairs(section:GetDescendants()) do
        if object:IsA("TextLabel") then
            if object==title then
                object.Visible=true
                object.Font=Enum.Font.GothamBold
                object.TextSize=11
                object.TextColor3=C.TEXT
                object.TextWrapped=false
                object.TextTruncate=Enum.TextTruncate.AtEnd
            else
                hideNoise(object)
                if object.Visible then
                    object.Font=Enum.Font.Gotham
                    object.TextSize=math.clamp(object.TextSize,9,11)
                    object.TextColor3=C.TEXT
                    object.TextWrapped=false
                    object.TextTruncate=Enum.TextTruncate.AtEnd
                end
            end

        elseif object:IsA("TextButton") then
            object.Active=true
            object.Selectable=true
            object.AutoButtonColor=false
            object.BorderSizePixel=0

            if object.Text~="" then
                object.BackgroundColor3=C.CONTROL
                object.BackgroundTransparency=0
                object.TextColor3=C.TEXT
                object.Font=Enum.Font.GothamMedium
                object.TextSize=10
                object.TextWrapped=false
                object.TextTruncate=Enum.TextTruncate.AtEnd
                setExistingCorner(object,7)
                setExistingStroke(object,C.OUTLINE,.28)
            else
                object.BackgroundTransparency=1
                object.BorderSizePixel=0
            end

        elseif object:IsA("TextBox") then
            object.Active=true
            object.Selectable=true
            object.BorderSizePixel=0
            object.BackgroundColor3=C.CONTROL
            object.BackgroundTransparency=0
            object.TextColor3=C.TEXT
            object.PlaceholderColor3=C.MUTED
            object.Font=Enum.Font.Gotham
            object.TextSize=10
            object.TextWrapped=false
            setExistingCorner(object,7)
            setExistingStroke(object,C.OUTLINE,.28)

        elseif object:IsA("ScrollingFrame") then
            object.BackgroundTransparency=1
            object.BorderSizePixel=0
            object.ScrollBarThickness=2
            object.ScrollBarImageColor3=C.MUTED

        elseif object:IsA("UIStroke") then
            object.Color=C.BORDER

        elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
            object.ImageColor3=C.MUTED

        elseif object:IsA("UIGradient") then
            object.Enabled=false
        end
    end
end

local function directSmallBox(row)
    for _,child in ipairs(row:GetChildren()) do
        if child:IsA("Frame") and child.Name~="A7DEV_REF3_V7_SWITCH" then
            local w=child.AbsoluteSize.X>0 and child.AbsoluteSize.X or child.Size.X.Offset
            local h=child.AbsoluteSize.Y>0 and child.AbsoluteSize.Y or child.Size.Y.Offset
            if w>0 and w<=24 and h>0 and h<=24 then
                return child
            end
        end
    end
end

local function buildReferenceSwitch(row)
    local existing=row:FindFirstChild("A7DEV_REF3_V7_SWITCH")

    if existing and not rebuiltSwitch[row] then
        -- Remove production-created visual so its old color callbacks can no longer
        -- fight the reference styling. Native toggle state/callback lives on the row.
        pcall(function() existing:Destroy() end)
        existing=nil
    end

    if not existing then
        existing=Instance.new("Frame")
        existing.Name="A7DEV_REF3_V7_SWITCH"
        existing.Position=UDim2.new(1,-38,.5,-9)
        existing.Size=UDim2.fromOffset(36,18)
        existing.BackgroundColor3=C.CONTROL
        existing.BorderSizePixel=0
        existing.Active=false
        existing.ZIndex=row.ZIndex+5
        existing.Parent=row

        local corner=Instance.new("UICorner")
        corner.CornerRadius=UDim.new(0,9)
        corner.Parent=existing

        local outline=Instance.new("UIStroke")
        outline.Name="A7DEV_REF_SWITCH_OUTLINE"
        outline.ApplyStrokeMode=Enum.ApplyStrokeMode.Border
        outline.Color=C.OUTLINE
        outline.Transparency=0
        outline.Thickness=1
        outline.Parent=existing

        local knob=Instance.new("Frame")
        knob.Name="A7DEV_REF_SWITCH_KNOB"
        knob.Position=UDim2.fromOffset(2,2)
        knob.Size=UDim2.fromOffset(14,14)
        knob.BackgroundColor3=C.KNOB_OFF
        knob.BorderSizePixel=0
        knob.Active=false
        knob.ZIndex=existing.ZIndex+1
        knob.Parent=existing

        local kc=Instance.new("UICorner")
        kc.CornerRadius=UDim.new(0,7)
        kc.Parent=knob
    end

    rebuiltSwitch[row]=true
    return existing
end

local function styleToggle(label,control)
    if not control or not control.Row or not control.Row.Parent then return end

    local row=control.Row
    row.Visible=true
    row.Active=true
    row.Selectable=true
    row.AutoButtonColor=false
    row.BackgroundTransparency=1
    row.BorderSizePixel=0

    local oldBox=directSmallBox(row)
    if oldBox then oldBox.Visible=false end

    local labelObject=row:FindFirstChildWhichIsA("TextLabel")
    local enabled=false

    if type(control.Get)=="function" then
        local ok,value=pcall(control.Get)
        if ok then enabled=value==true end
    end

    if labelObject then
        labelObject.Visible=true
        labelObject.Font=Enum.Font.Gotham
        labelObject.TextSize=10
        labelObject.TextColor3=enabled and C.TEXT or C.MUTED
        labelObject.TextWrapped=false
        labelObject.TextTruncate=Enum.TextTruncate.AtEnd
        labelObject.Position=UDim2.fromOffset(0,0)
        labelObject.Size=UDim2.new(1,-54,1,0)
    end

    local track=buildReferenceSwitch(row)
    track.Visible=true
    track.Position=UDim2.new(1,-38,.5,-9)
    track.Size=UDim2.fromOffset(36,18)
    track.BackgroundColor3=C.CONTROL
    track.BorderSizePixel=0

    local outline=track:FindFirstChild("A7DEV_REF_SWITCH_OUTLINE")
        or track:FindFirstChildOfClass("UIStroke")
    if outline then
        outline.Color=C.OUTLINE
        outline.Transparency=0
        outline.Thickness=1
    end

    local knob=track:FindFirstChild("A7DEV_REF_SWITCH_KNOB")
        or track:FindFirstChildWhichIsA("Frame")

    if knob then
        knob.Visible=true
        knob.Size=UDim2.fromOffset(14,14)
        knob.BackgroundColor3=enabled and C.WHITE or C.KNOB_OFF
        knob.BorderSizePixel=0
        knob.Position=UDim2.fromOffset(enabled and 20 or 2,2)
    end

    if not toggleGuards[row] then
        toggleGuards[row]=true
        on(row.Activated:Connect(function()
            task.delay(.02,function()
                if alive and row.Parent then styleToggle(label,control) end
            end)
        end))
    end
end

local function styleAllToggles()
    local state=ENV.A7DEV_PROJECT_SLAYER_2
    local runtime=state and state.Runtime
    local controls=runtime and runtime.ToggleControls
    if type(controls)~="table" then return end

    for label,control in pairs(controls) do
        styleToggle(label,control)
    end
end

local function styleNavigation()
    for _,button in ipairs(root:GetDescendants()) do
        if button:IsA("TextButton") then
            if isPrimaryTab(button) then
                local selected=activeTab(button)
                button.BackgroundColor3=C.ACTIVE
                button.BackgroundTransparency=selected and 0 or 1
                button.BorderSizePixel=0

                for _,d in ipairs(button:GetDescendants()) do
                    if d:IsA("TextLabel") then
                        d.TextColor3=selected and C.TEXT or C.MUTED
                        d.Font=Enum.Font.GothamBold
                        d.TextSize=10
                    elseif d:IsA("ImageLabel") then
                        d.ImageColor3=selected and C.TEXT or C.MUTED
                    end
                end

            elseif isSubTab(button) then
                local selected=activeTab(button)
                button.BackgroundColor3=C.ACTIVE
                button.BackgroundTransparency=selected and 0 or 1
                button.BorderSizePixel=0
                button.TextColor3=selected and C.TEXT or C.MUTED
                button.Font=Enum.Font.Gotham
                button.TextSize=9

            elseif isWindowButton(button) then
                button.BackgroundColor3=C.CONTROL
                button.BackgroundTransparency=0
                button.BorderSizePixel=0
                button.TextColor3=C.MUTED
                setExistingStroke(button,C.OUTLINE,.38)
            end
        end
    end
end

local function styleShell()
    main.BackgroundColor3=C.BG
    main.BorderSizePixel=0
    root.BackgroundColor3=C.BG

    for _,object in ipairs(root:GetDescendants()) do
        if not findSection(object) then
            if object:IsA("Frame") then
                if object.BackgroundTransparency<1 then object.BackgroundColor3=C.BG end

            elseif object:IsA("ScrollingFrame") then
                object.BackgroundTransparency=1
                object.ScrollBarImageColor3=C.MUTED

            elseif object:IsA("TextLabel") then
                if object.BackgroundTransparency<1 then object.BackgroundColor3=C.BG end
                object.TextColor3=C.MUTED
                object.Font=Enum.Font.Gotham
                object.TextSize=math.clamp(object.TextSize,8,10)

            elseif object:IsA("TextBox") then
                object.BackgroundColor3=C.CONTROL
                object.TextColor3=C.TEXT
                object.PlaceholderColor3=C.MUTED
                object.Font=Enum.Font.Gotham
                object.TextSize=10
                setExistingStroke(object,C.OUTLINE,.34)

            elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
                object.ImageColor3=C.MUTED

            elseif object:IsA("UIStroke") then
                object.Color=C.BORDER

            elseif object:IsA("UIGradient") then
                object.Enabled=false
            end
        end
    end

    -- Header's bottom divider in the references is the brightest structural line.
    for _,child in ipairs(root:GetChildren()) do
        if child:IsA("Frame") and child.Position.Y.Offset==0 and child.Size.Y.Offset==55 then
            for _,line in ipairs(child:GetChildren()) do
                if line:IsA("Frame") and line.Size.Y.Offset==1 then
                    line.BackgroundColor3=C.WHITE
                end
            end
        end
    end
end

local function hideLegacy(object)
    if not object or not object.Parent or object==root or not object:IsA("GuiObject") then return end
    object.Visible=false

    if legacyGuards[object] then return end
    legacyGuards[object]=true
    on(object:GetPropertyChangedSignal("Visible"):Connect(function()
        if alive and object.Parent and object.Visible then object.Visible=false end
    end))
end

local function lockLegacy()
    for _,child in ipairs(main:GetChildren()) do
        if child~=root and child:IsA("GuiObject") then hideLegacy(child) end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end

    lockLegacy()
    styleShell()

    for _,object in ipairs(root:GetDescendants()) do
        if isSection(object) then styleSection(object) end
    end

    styleNavigation()
    styleAllToggles()
end

fullPass()

on(main.ChildAdded:Connect(function(child)
    task.defer(function()
        if alive and child.Parent==main and child~=root and child:IsA("GuiObject") then
            hideLegacy(child)
        end
    end)
end))

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if not alive or not object.Parent then return end
        local section=findSection(object)
        if section then styleSection(section) end
        styleAllToggles()
    end)
end))

for _,button in ipairs(root:GetDescendants()) do
    if button:IsA("TextButton") and (isPrimaryTab(button) or isSubTab(button)) then
        on(button.Activated:Connect(function()
            task.delay(.02,fullPass)
            task.delay(.12,fullPass)
        end))
    end
end

-- Keep switch position/color synchronized with native state changes.
task.spawn(function()
    while alive and root.Parent do
        styleAllToggles()
        lockLegacy()
        task.wait(.12)
    end
end)

on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then task.defer(fullPass) end
end))

on(root.AncestryChanged:Connect(function(_,parent)
    if not parent then stop() end
end))
