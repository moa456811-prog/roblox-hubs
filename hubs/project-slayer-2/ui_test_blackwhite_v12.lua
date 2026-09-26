-- A7DEV HUB | Slayers 2 | PURE BLACK / WHITE UI TEST V12
-- Strict two-color palette: only black and white.
-- Native gameplay callbacks are preserved.
-- Test branch only.

local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_BW_V8_STOP",
    "A7DEV_PS2_BW_V9_STOP",
    "A7DEV_PS2_BW_V10_STOP",
    "A7DEV_PS2_REF_V11_STOP",
    "A7DEV_PS2_BW_V12_STOP",
    "A7DEV_PS2_BLACKLIGHT_V7_STOP",
}) do
    if type(ENV[key]) == "function" then
        pcall(ENV[key])
    end
end

local V7_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v7.lua"

local okHttp, source = pcall(game.HttpGet, game, V7_URL)
if not okHttp then
    warn("[A7DEV UI V12] base download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V12] base compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V12] base runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

local BLACK = Color3.fromRGB(0,0,0)
local WHITE = Color3.fromRGB(255,255,255)

local alive = true
local connections = {}
local legacyGuards = setmetatable({}, {__mode="k"})
local toggleGuards = setmetatable({}, {__mode="k"})

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
    ENV.A7DEV_PS2_BW_V12_STOP=nil
end
ENV.A7DEV_PS2_BW_V12_STOP=stop

local playerGui=LocalPlayer:WaitForChild("PlayerGui")
local gui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main=gui and gui:FindFirstChild("Main")
local root=main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not gui or not main or not root then
    warn("[A7DEV UI V12] V7 root not found.")
    stop()
    return
end

root.Name="A7DEV_PS2_BLACKLIGHT_TEST_V12"
pcall(function() gui.ZIndexBehavior=Enum.ZIndexBehavior.Sibling end)

local function low(v) return string.lower(tostring(v or "")) end

local function isSection(o)
    return o:IsA("Frame") and string.sub(o.Name,1,8)=="Section_"
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
    local hasLabel=false
    local hasIcon=false
    for _,child in ipairs(button:GetChildren()) do
        if child:IsA("TextLabel") then hasLabel=true end
        if child:IsA("ImageLabel") then hasIcon=true end
    end
    return hasLabel and hasIcon
end

local function isSubTab(button)
    if not button:IsA("TextButton") or button.Text=="" then return false end
    local p=button.Parent
    return p and p:IsA("Frame") and p.Parent==root and p.Position.Y.Offset==55
end

local function activeTab(button)
    return (isPrimaryTab(button) or isSubTab(button)) and button.BackgroundTransparency<.5
end

local function isWindowControl(button)
    if not button:IsA("TextButton") then return false end
    local t=tostring(button.Text or "")
    return t=="−" or t=="↗" or t=="↙" or t=="×"
end

local uselessPatterns={
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
    for _,pattern in ipairs(uselessPatterns) do
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

local function styleSection(section)
    section.BackgroundColor3=BLACK
    section.BackgroundTransparency=0
    section.BorderColor3=WHITE
    section.BorderSizePixel=1
    section.ClipsDescendants=false

    local stroke=section:FindFirstChildOfClass("UIStroke")
    if stroke then
        stroke.Color=WHITE
        stroke.Transparency=0
        stroke.Thickness=1
    end

    local corner=section:FindFirstChildOfClass("UICorner")
    if corner then corner.CornerRadius=UDim.new(0,10) end

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
                object.TextColor3=WHITE
                object.TextWrapped=false
                object.TextTruncate=Enum.TextTruncate.AtEnd
            else
                hideNoise(object)
                if object.Visible then
                    object.Font=Enum.Font.Gotham
                    object.TextSize=math.clamp(object.TextSize,9,10)
                    object.TextColor3=WHITE
                    object.TextWrapped=false
                    object.TextTruncate=Enum.TextTruncate.AtEnd
                end
            end

        elseif object:IsA("TextButton") then
            object.Active=true
            object.Selectable=true
            object.AutoButtonColor=false
            object.TextColor3=WHITE
            object.Font=Enum.Font.GothamMedium
            object.TextSize=10
            object.TextWrapped=false
            object.TextTruncate=Enum.TextTruncate.AtEnd

            if object.Text~="" then
                object.BackgroundColor3=BLACK
                object.BackgroundTransparency=0
                object.BorderColor3=WHITE
                object.BorderSizePixel=1
            else
                object.BackgroundColor3=BLACK
                object.BackgroundTransparency=1
                object.BorderSizePixel=0

                local label=object:FindFirstChildWhichIsA("TextLabel")
                if label then
                    label.Visible=true
                    label.TextColor3=WHITE
                    label.Font=Enum.Font.Gotham
                    label.TextSize=10
                    label.TextWrapped=false
                    label.TextTruncate=Enum.TextTruncate.AtEnd
                    label.Position=UDim2.fromOffset(0,0)
                    label.Size=UDim2.new(1,-56,1,0)
                end
            end

        elseif object:IsA("TextBox") then
            object.Active=true
            object.Selectable=true
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=0
            object.BorderColor3=WHITE
            object.BorderSizePixel=1
            object.TextColor3=WHITE
            object.PlaceholderColor3=WHITE
            object.Font=Enum.Font.Gotham
            object.TextSize=10
            object.TextWrapped=false

        elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
            object.ImageColor3=WHITE

        elseif object:IsA("UIStroke") then
            object.Color=WHITE
            object.Transparency=0
            object.Thickness=1

        elseif object:IsA("UIGradient") then
            object.Enabled=false

        elseif object:IsA("ScrollingFrame") then
            object.BackgroundTransparency=1
            object.ScrollBarImageColor3=WHITE
        end
    end
end

local function locateToggleTrack(row)
    local named=row:FindFirstChild("A7DEV_REF3_V7_SWITCH")
    if named and named:IsA("Frame") then return named end

    for _,frame in ipairs(row:GetDescendants()) do
        if frame:IsA("Frame") then
            local w=frame.AbsoluteSize.X>0 and frame.AbsoluteSize.X or frame.Size.X.Offset
            local h=frame.AbsoluteSize.Y>0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset
            if w>=28 and w<=42 and h>=14 and h<=22 and frame:FindFirstChildWhichIsA("Frame") then
                return frame
            end
        end
    end
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

    local rowLabel=row:FindFirstChildWhichIsA("TextLabel")
    if rowLabel then
        rowLabel.Visible=true
        rowLabel.TextColor3=WHITE
        rowLabel.Font=Enum.Font.Gotham
        rowLabel.TextSize=10
        rowLabel.TextWrapped=false
        rowLabel.TextTruncate=Enum.TextTruncate.AtEnd
        rowLabel.Position=UDim2.fromOffset(0,0)
        rowLabel.Size=UDim2.new(1,-56,1,0)
    end

    local track=locateToggleTrack(row)
    if not track then return end

    track.Visible=true
    track.Active=false
    track.Position=UDim2.new(1,-39,.5,-9)
    track.Size=UDim2.fromOffset(36,18)
    track.BorderColor3=WHITE
    track.BorderSizePixel=1

    local ts=track:FindFirstChildOfClass("UIStroke")
    if ts then
        ts.Color=WHITE
        ts.Transparency=0
        ts.Thickness=1
    end

    local knob=track:FindFirstChildWhichIsA("Frame")
    if not knob then return end

    knob.Visible=true
    knob.Active=false
    knob.Size=UDim2.fromOffset(14,14)
    knob.BorderSizePixel=0

    local enabled=false
    if type(control.Get)=="function" then
        local ok,value=pcall(control.Get)
        if ok then enabled=value==true end
    end

    if enabled then
        track.BackgroundColor3=WHITE
        knob.BackgroundColor3=BLACK
        knob.Position=UDim2.fromOffset(20,1)
    else
        track.BackgroundColor3=BLACK
        knob.BackgroundColor3=WHITE
        knob.Position=UDim2.fromOffset(1,1)
    end

    if not toggleGuards[row] then
        toggleGuards[row]=true
        on(row.Activated:Connect(function()
            task.delay(.02,function()
                if alive and row.Parent then
                    styleToggle(label,control)
                end
            end)
        end))
    end
end

local function styleNativeToggles()
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
                local active=activeTab(button)
                button.BackgroundColor3=active and WHITE or BLACK
                button.BackgroundTransparency=active and 0 or 1
                button.BorderSizePixel=0

                for _,d in ipairs(button:GetDescendants()) do
                    if d:IsA("TextLabel") then
                        d.TextColor3=active and BLACK or WHITE
                        d.Font=Enum.Font.GothamBold
                        d.TextSize=10
                    elseif d:IsA("ImageLabel") then
                        d.ImageColor3=active and BLACK or WHITE
                    end
                end

            elseif isSubTab(button) then
                local active=activeTab(button)
                button.BackgroundColor3=active and WHITE or BLACK
                button.BackgroundTransparency=0
                button.BorderColor3=WHITE
                button.BorderSizePixel=1
                button.TextColor3=active and BLACK or WHITE
                button.Font=Enum.Font.Gotham
                button.TextSize=9

            elseif isWindowControl(button) then
                button.BackgroundColor3=BLACK
                button.BackgroundTransparency=0
                button.BorderColor3=WHITE
                button.BorderSizePixel=1
                button.TextColor3=WHITE
            end
        end
    end
end

local function styleShell()
    main.BackgroundColor3=BLACK
    main.BorderColor3=WHITE
    main.BorderSizePixel=1
    root.BackgroundColor3=BLACK

    for _,object in ipairs(root:GetDescendants()) do
        if not findSection(object) then
            if object:IsA("Frame") then
                if object.BackgroundTransparency<1 then
                    object.BackgroundColor3=BLACK
                end
                object.BorderColor3=WHITE

            elseif object:IsA("ScrollingFrame") then
                object.BackgroundTransparency=1
                object.ScrollBarImageColor3=WHITE

            elseif object:IsA("TextLabel") then
                if object.BackgroundTransparency<1 then object.BackgroundColor3=BLACK end
                object.TextColor3=WHITE
                object.Font=Enum.Font.Gotham
                object.TextSize=math.clamp(object.TextSize,8,10)

            elseif object:IsA("TextBox") then
                object.BackgroundColor3=BLACK
                object.TextColor3=WHITE
                object.PlaceholderColor3=WHITE
                object.BorderColor3=WHITE
                object.BorderSizePixel=1

            elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
                object.ImageColor3=WHITE

            elseif object:IsA("UIStroke") then
                object.Color=WHITE
                object.Transparency=0

            elseif object:IsA("UIGradient") then
                object.Enabled=false
            end
        end
    end
end

local function hideLegacy(object)
    if not object or not object.Parent or object==root then return end
    if not object:IsA("GuiObject") then return end

    object.Visible=false

    if legacyGuards[object] then return end
    legacyGuards[object]=true

    on(object:GetPropertyChangedSignal("Visible"):Connect(function()
        if alive and object.Parent and object.Visible then
            object.Visible=false
        end
    end))
end

local function lockLegacy()
    for _,child in ipairs(main:GetChildren()) do
        if child~=root and child:IsA("GuiObject") then
            hideLegacy(child)
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end

    lockLegacy()
    styleShell()

    for _,object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            styleSection(object)
        end
    end

    styleNavigation()
    styleNativeToggles()
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
        styleNativeToggles()
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

task.spawn(function()
    while alive and root.Parent do
        styleNativeToggles()
        lockLegacy()
        task.wait(.18)
    end
end)

on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then task.defer(fullPass) end
end))

on(root.AncestryChanged:Connect(function(_,parent)
    if not parent then stop() end
end))
