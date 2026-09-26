-- A7DEV HUB | Slayers 2 | BLACK / WHITE UI TEST V10
-- Targeted fix:
-- 1) visible ON/OFF activation switches tied to the native controls
-- 2) black/white modern styling without giant white button fills
-- 3) legacy A7DEV presentation cannot reopen behind this UI
-- Test branch only.

local ENV = (getgenv and getgenv()) or _G

for _, key in ipairs({
    "A7DEV_PS2_BW_V8_STOP",
    "A7DEV_PS2_BW_V9_STOP",
    "A7DEV_PS2_BLACKLIGHT_V7_STOP",
    "A7DEV_PS2_BLACKLIGHT_NATIVE_STOP",
    "A7DEV_PS2_BLACKLIGHT_SAFE_STOP",
    "A7DEV_PS2_BLACKLIGHT_V4_STOP",
    "A7DEV_PS2_BLACKLIGHT_POLISH_STOP",
    "A7DEV_PS2_BW_V10_STOP",
}) do
    if type(ENV[key]) == "function" then pcall(ENV[key]) end
end

local V7_URL = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_blacklight_v7.lua"

local okHttp, source = pcall(game.HttpGet, game, V7_URL)
if not okHttp then
    warn("[A7DEV UI V10] V7 download failed: " .. tostring(source))
    return
end

local fn, compileError = loadstring(source)
if not fn then
    warn("[A7DEV UI V10] V7 compile failed: " .. tostring(compileError))
    return
end

local okRun, runError = pcall(fn)
if not okRun then
    warn("[A7DEV UI V10] V7 runtime failed: " .. tostring(runError))
    return
end

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()

local BLACK = Color3.fromRGB(0,0,0)
local WHITE = Color3.fromRGB(255,255,255)

local alive = true
local connections = {}
local legacyGuards = setmetatable({}, {__mode="k"})
local buttonGuards = setmetatable({}, {__mode="k"})

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
    ENV.A7DEV_PS2_BW_V10_STOP = nil
end
ENV.A7DEV_PS2_BW_V10_STOP = stop

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
local main = gui and gui:FindFirstChild("Main")
local root = main and main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")

if not gui or not main or not root then
    warn("[A7DEV UI V10] V7 root not found.")
    stop()
    return
end

root.Name = "A7DEV_PS2_BLACKLIGHT_TEST_V10"

pcall(function()
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
end)

local State = ENV.A7DEV_PROJECT_SLAYER_2

local function isSection(o)
    return o:IsA("Frame") and string.sub(o.Name,1,8) == "Section_"
end

local function isOurPage(o)
    return o:IsA("ScrollingFrame") and string.find(o.Name or "","A7DEV_V7_PAGE_",1,true) == 1
end

local function isPrimaryTab(button)
    if not button:IsA("TextButton") or button.Text ~= "" then return false end
    local hasText,hasIcon=false,false
    for _,child in ipairs(button:GetChildren()) do
        if child:IsA("TextLabel") then hasText=true end
        if child:IsA("ImageLabel") then hasIcon=true end
    end
    return hasText and hasIcon
end

local function isSubTab(button)
    if not button:IsA("TextButton") or button.Text == "" then return false end
    local p=button.Parent
    return p and p:IsA("Frame") and p.Parent==root and p.Position.Y.Offset==55
end

local function activeTab(button)
    return (isPrimaryTab(button) or isSubTab(button)) and button.BackgroundTransparency < .5
end

local function isWindowControl(button)
    if not button:IsA("TextButton") then return false end
    local t=tostring(button.Text or "")
    return t=="−" or t=="↗" or t=="↙" or t=="×"
end

local function findSection(object)
    local p=object
    while p and p~=root and p~=gui do
        if isSection(p) then return p end
        p=p.Parent
    end
end

local function styleCard(section)
    section.BackgroundColor3=BLACK
    section.BackgroundTransparency=0
    section.BorderColor3=WHITE
    section.BorderSizePixel=0

    local s=section:FindFirstChildOfClass("UIStroke")
    if s then
        s.Color=WHITE
        s.Thickness=1
        s.Transparency=.72
    end

    local c=section:FindFirstChildOfClass("UICorner")
    if c then c.CornerRadius=UDim.new(0,11) end
end

local useless = {
    "session:",
    "progress:",
    "recoveries:",
    "scan:",
    "catalog:",
    "streaming ",
    "selected bosses:",
    "boss page ",
    "souls idle",
    "auto sell |",
    "crafting:",
    "fishing:",
    "god mode:",
    "phase=",
}

local function hideUselessLabel(label)
    if not label:IsA("TextLabel") then return end

    local text=string.lower(tostring(label.Text or ""))
    for _,pattern in ipairs(useless) do
        if string.find(text,pattern,1,true) then
            label.Visible=false
            return
        end
    end

    local commas=0
    tostring(label.Text or ""):gsub(",",function() commas+=1 end)
    if #tostring(label.Text or "")>74 and commas>=3 then
        label.Visible=false
    end
end

local function styleText(object)
    if object:IsA("TextLabel") then
        object.TextColor3=WHITE
        object.Font=Enum.Font.GothamMedium
        object.TextSize=math.clamp(object.TextSize,9,11)
        object.TextTruncate=Enum.TextTruncate.AtEnd
        hideUselessLabel(object)

    elseif object:IsA("TextButton") then
        object.Active=true
        object.Selectable=true
        object.AutoButtonColor=false

        if activeTab(object) then
            -- Active navigation: white outline only, no white fill.
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=0
            object.BorderColor3=WHITE
            object.BorderSizePixel=1
            object.TextColor3=WHITE
            for _,d in ipairs(object:GetDescendants()) do
                if d:IsA("TextLabel") then d.TextColor3=WHITE end
                if d:IsA("ImageLabel") then d.ImageColor3=WHITE end
            end
        elseif isPrimaryTab(object) then
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=1
            object.BorderSizePixel=0
            for _,d in ipairs(object:GetDescendants()) do
                if d:IsA("TextLabel") then d.TextColor3=WHITE end
                if d:IsA("ImageLabel") then d.ImageColor3=WHITE end
            end
        elseif isSubTab(object) then
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=0
            object.BorderColor3=WHITE
            object.BorderSizePixel=activeTab(object) and 1 or 0
            object.TextColor3=WHITE
        elseif isWindowControl(object) then
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=0
            object.BorderColor3=WHITE
            object.BorderSizePixel=1
            object.TextColor3=WHITE
        elseif object.Text~="" then
            -- Action/dropdown button: black with thin white outline.
            object.BackgroundColor3=BLACK
            object.BackgroundTransparency=0
            object.BorderColor3=WHITE
            object.BorderSizePixel=1
            object.TextColor3=WHITE
            object.Font=Enum.Font.GothamMedium
            object.TextSize=10
            object.TextWrapped=false
            object.TextTruncate=Enum.TextTruncate.AtEnd
        else
            -- Toggle row itself stays invisible so the row remains a large click target.
            object.BackgroundTransparency=1
            object.BorderSizePixel=0
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
        object.Font=Enum.Font.GothamMedium
        object.TextSize=10
        object.TextWrapped=false

    elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
        object.ImageColor3=WHITE

    elseif object:IsA("UIStroke") then
        object.Color=WHITE

    elseif object:IsA("UIGradient") then
        object.Enabled=false
    end
end

local function locateSwitch(row)
    -- Production V28 creates this visual switch for native toggle rows.
    local named=row:FindFirstChild("A7DEV_REF3_V7_SWITCH")
    if named and named:IsA("Frame") then return named end

    local best
    for _,frame in ipairs(row:GetDescendants()) do
        if frame:IsA("Frame") then
            local w=frame.AbsoluteSize.X>0 and frame.AbsoluteSize.X or frame.Size.X.Offset
            local h=frame.AbsoluteSize.Y>0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset
            if w>=28 and w<=46 and h>=14 and h<=24 then
                if frame:FindFirstChildWhichIsA("Frame") then
                    best=frame
                    break
                end
            end
        end
    end
    return best
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
        rowLabel.Font=Enum.Font.GothamMedium
        rowLabel.TextSize=10
        rowLabel.TextTruncate=Enum.TextTruncate.AtEnd
        rowLabel.TextWrapped=false
        rowLabel.Position=UDim2.fromOffset(0,0)
        rowLabel.Size=UDim2.new(1,-54,1,0)
    end

    local track=locateSwitch(row)
    if not track then return end

    track.Visible=true
    track.Active=false
    track.Position=UDim2.new(1,-39,.5,-9)
    track.Size=UDim2.fromOffset(36,18)
    track.BackgroundTransparency=0
    track.BorderColor3=WHITE
    track.BorderSizePixel=1

    local ts=track:FindFirstChildOfClass("UIStroke")
    if ts then
        ts.Color=WHITE
        ts.Transparency=0
        ts.Thickness=1
    end

    local knob=track:FindFirstChildWhichIsA("Frame")
    if knob then
        knob.Visible=true
        knob.Active=false
        knob.Size=UDim2.fromOffset(12,12)
        knob.BorderSizePixel=0
    end

    local enabled=false
    if type(control.Get)=="function" then
        local ok,value=pcall(control.Get)
        if ok then enabled=value==true end
    end

    if enabled then
        track.BackgroundColor3=WHITE
        if knob then
            knob.BackgroundColor3=BLACK
            knob.Position=UDim2.fromOffset(21,2)
        end
    else
        track.BackgroundColor3=BLACK
        if knob then
            knob.BackgroundColor3=WHITE
            knob.Position=UDim2.fromOffset(2,2)
        end
    end

    if not buttonGuards[row] then
        buttonGuards[row]=true
        on(row.Activated:Connect(function()
            task.delay(.02,function()
                if alive and row.Parent then styleToggle(label,control) end
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

local function styleSections()
    for _,object in ipairs(root:GetDescendants()) do
        if isSection(object) then
            styleCard(object)
            for _,d in ipairs(object:GetDescendants()) do
                styleText(d)
            end
        end
    end
end

local function styleShell()
    main.BackgroundColor3=BLACK
    main.BorderColor3=WHITE
    main.BorderSizePixel=0
    root.BackgroundColor3=BLACK

    for _,object in ipairs(root:GetDescendants()) do
        if not findSection(object) then
            styleText(object)

            if object:IsA("Frame") and object.BackgroundTransparency<1 then
                object.BackgroundColor3=BLACK
            elseif object:IsA("ScrollingFrame") then
                object.BackgroundTransparency=1
                object.ScrollBarImageColor3=WHITE
            end
        end
    end
end

local function hideLegacyObject(object)
    if not object or not object.Parent or object==root then return end
    if not object:IsA("GuiObject") then return end

    object.Visible=false

    if not legacyGuards[object] then
        legacyGuards[object]=true
        on(object:GetPropertyChangedSignal("Visible"):Connect(function()
            if alive and object.Parent and object.Visible then
                object.Visible=false
            end
        end))
    end
end

local function lockOldA7UI()
    -- Nothing else inside Main may become visible.
    for _,child in ipairs(main:GetChildren()) do
        if child~=root and child:IsA("GuiObject") then
            hideLegacyObject(child)
        end
    end

    -- Also suppress extra presentation objects owned by this A7DEV ScreenGui.
    for _,child in ipairs(gui:GetChildren()) do
        if child~=main
            and child:IsA("GuiObject")
            and child.Name~="A7DEV_PS2_V7_MINI"
            and child.Name~="A7DEV_PS2_NATIVE_MINI"
            and child.Name~="A7DEV_PS2_BLACKLIGHT_MINI"
            and child.Name~="A7DEV_PS2_BLACKLIGHT_MINI_V2" then
            hideLegacyObject(child)
        end
    end
end

local function styleNavigation()
    for _,object in ipairs(root:GetDescendants()) do
        if object:IsA("TextButton") and (isPrimaryTab(object) or isSubTab(object)) then
            styleText(object)
        end
    end
end

local function fullPass()
    if not alive or not root.Parent then return end
    lockOldA7UI()
    styleShell()
    styleSections()
    styleNavigation()
    styleNativeToggles()
end

fullPass()

on(main.ChildAdded:Connect(function(child)
    task.defer(function()
        if alive and child.Parent==main and child~=root and child:IsA("GuiObject") then
            hideLegacyObject(child)
        end
    end)
end))

on(gui.ChildAdded:Connect(function(child)
    task.defer(function()
        if alive and child.Parent==gui and child~=main and child:IsA("GuiObject") then
            hideLegacyObject(child)
        end
    end)
end))

on(root.DescendantAdded:Connect(function(object)
    task.defer(function()
        if alive and object.Parent then
            local section=findSection(object)
            if section then
                styleCard(section)
                styleText(object)
            else
                styleText(object)
            end
            styleNativeToggles()
        end
    end)
end))

-- Refresh the visible switch whenever any native toggle changes through code.
task.spawn(function()
    while alive and root.Parent do
        styleNativeToggles()
        lockOldA7UI()
        task.wait(.2)
    end
end)

-- Navigation state changes after Activated, so restyle right after the click.
for _,object in ipairs(root:GetDescendants()) do
    if object:IsA("TextButton") and (isPrimaryTab(object) or isSubTab(object)) then
        on(object.Activated:Connect(function()
            task.delay(.02,fullPass)
            task.delay(.12,fullPass)
        end))
    end
end

on(root:GetPropertyChangedSignal("Visible"):Connect(function()
    if root.Visible then task.defer(fullPass) end
end))

on(root.AncestryChanged:Connect(function(_,parent)
    if not parent then stop() end
end))
