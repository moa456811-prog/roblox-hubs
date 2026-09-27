-- A7DEV HUB | Slayers 2 | A7 Blue TEST UI V1
-- Visual-only adapter for the TEST loadstring.
-- Gameplay callbacks stay on the original native controls.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if type(ENV.A7DEV_PS2_BLUE_TEST_V1_STOP) == "function" then
    pcall(ENV.A7DEV_PS2_BLUE_TEST_V1_STOP)
end

local alive = true
local connections = {}
local watchedButtons = setmetatable({}, {__mode = "k"})
local watchedSwitches = setmetatable({}, {__mode = "k"})
local navGuard = setmetatable({}, {__mode = "k"})
local created = {}
local sessionStarted = os.clock()

local C = {
    background = Color3.fromRGB(6, 11, 18),
    panel = Color3.fromRGB(8, 15, 25),
    row = Color3.fromRGB(11, 21, 35),
    rowHover = Color3.fromRGB(15, 29, 48),
    stroke = Color3.fromRGB(25, 46, 75),
    strokeSoft = Color3.fromRGB(18, 35, 60),
    blue = Color3.fromRGB(0, 110, 255),
    bright = Color3.fromRGB(57, 158, 255),
    text = Color3.fromRGB(220, 233, 255),
    muted = Color3.fromRGB(114, 151, 203),
    dim = Color3.fromRGB(72, 100, 142),
    white = Color3.fromRGB(246, 251, 255),
    green = Color3.fromRGB(0, 218, 161),
}

local function on(connection)
    if connection then
        connections[#connections + 1] = connection
    end
    return connection
end

local function remember(object)
    created[#created + 1] = object
    return object
end

local function make(className, parent, props)
    local object = Instance.new(className)
    for key, value in pairs(props or {}) do
        object[key] = value
    end
    object.Parent = parent
    return object
end

local function round(object, radius)
    local c = object:FindFirstChildOfClass("UICorner")
    if not c then c = make("UICorner", object) end
    c.CornerRadius = UDim.new(0, radius)
    return c
end

local function border(object, color, transparency, thickness)
    local s = object:FindFirstChildOfClass("UIStroke")
    if not s then s = make("UIStroke", object) end
    s.Color = color or C.stroke
    s.Transparency = transparency or 0
    s.Thickness = thickness or 1
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    return s
end

local function addGradient(object, name, a, b, rotation)
    local old = object:FindFirstChild(name)
    if old then old:Destroy() end
    local g = make("UIGradient", object, {
        Name = name,
        Color = ColorSequence.new(a, b),
        Rotation = rotation or 90,
    })
    remember(g)
    return g
end

local function tween(object, props)
    local ok, tw = pcall(function()
        return TweenService:Create(object, TweenInfo.new(.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
    end)
    if ok and tw then tw:Play() end
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui, main, root

for _ = 1, 1200 do
    if not alive then return end
    gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
    main = gui and gui:FindFirstChild("Main")
    if main then
        root = main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V18")
            or main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")
            or main:FindFirstChild("A7DEV_PS2_A7BLUE_TEST_V1")
    end
    if root then break end
    task.wait(.1)
end

if not (gui and main and root) then
    warn("[A7DEV BLUE TEST] Slayer 2 BlackLight root was not found.")
    return
end

root.Name = "A7DEV_PS2_A7BLUE_TEST_V1"
root:SetAttribute("A7DEV_TEST_THEME", "A7BlueV1")
root.BackgroundColor3 = C.background
main.BackgroundColor3 = C.background
border(main, C.stroke, .08, 1)
round(main, 14)
addGradient(root, "A7BlueRootGradient", Color3.fromRGB(8, 15, 25), Color3.fromRGB(5, 10, 17), 60)

local function findNamed(name)
    return root:FindFirstChild(name, true)
end

local infoPage = findNamed("A7DEV_V7_PAGE_INFO")
local mainSettingsPage = findNamed("A7DEV_V7_PAGE_MAIN_Settings")
local content = infoPage and infoPage.Parent or (mainSettingsPage and mainSettingsPage.Parent)

local header, secondary, footer
for _, child in ipairs(root:GetChildren()) do
    if child:IsA("Frame") then
        local y = child.Position.Y.Offset
        local h = child.Size.Y.Offset
        if not header and y == 0 and h >= 50 and h <= 75 then
            header = child
        elseif not secondary and y >= 50 and y <= 80 and h >= 32 and h <= 50 then
            secondary = child
        elseif not footer and child.Position.Y.Scale >= .9 and h >= 20 and h <= 36 then
            footer = child
        end
    end
end

if header then
    header.BackgroundColor3 = C.panel
    border(header, C.stroke, .12, 1)
    addGradient(header, "A7BlueHeaderGradient", Color3.fromRGB(10, 20, 35), Color3.fromRGB(6, 12, 21), 20)

    local accent = header:FindFirstChild("A7BlueHeaderAccent")
    if not accent then
        accent = remember(make("Frame", header, {
            Name = "A7BlueHeaderAccent",
            Position = UDim2.new(0, 0, 1, -2),
            Size = UDim2.new(1, 0, 0, 2),
            BackgroundColor3 = C.blue,
            BorderSizePixel = 0,
            ZIndex = 260,
        }))
    end

    for _, child in ipairs(header:GetChildren()) do
        if child:IsA("TextLabel") and tostring(child.Text) == "A7" then
            child.Text = "A7"
            child.TextColor3 = C.white
            child.Font = Enum.Font.GothamBlack
            child.TextSize = 20
        elseif child:IsA("TextBox") then
            child.BackgroundColor3 = C.row
            child.TextColor3 = C.text
            child.PlaceholderColor3 = C.muted
            child.PlaceholderText = "Search..."
            round(child, 10)
            border(child, C.stroke, .12, 1)
        elseif child:IsA("TextButton") and child.Text ~= "" then
            child.BackgroundColor3 = C.row
            child.TextColor3 = C.muted
            round(child, 10)
            border(child, C.stroke, .18, 1)
        end
    end
end

local function syncNavButton(button)
    if not button or not button.Parent or navGuard[button] then return end
    navGuard[button] = true

    local active = button.BackgroundTransparency < .5
    button.BackgroundColor3 = C.row
    button.BackgroundTransparency = active and 0 or 1
    round(button, 10)

    local underline = button:FindFirstChild("A7BlueNavUnderline")
    if not underline then
        underline = make("Frame", button, {
            Name = "A7BlueNavUnderline",
            AnchorPoint = Vector2.new(.5, 1),
            Position = UDim2.new(.5, 0, 1, 0),
            Size = UDim2.new(.58, 0, 0, 3),
            BackgroundColor3 = C.blue,
            BorderSizePixel = 0,
            ZIndex = button.ZIndex + 3,
        })
        round(underline, 2)
    end
    underline.Visible = active

    for _, d in ipairs(button:GetChildren()) do
        if d:IsA("ImageLabel") then
            d.ImageColor3 = active and C.bright or C.muted
        elseif d:IsA("TextLabel") then
            d.TextColor3 = active and C.text or C.muted
            d.Font = Enum.Font.GothamMedium
        end
    end

    navGuard[button] = nil
end

local function styleWindowButton(button)
    button.BackgroundColor3 = C.row
    button.BackgroundTransparency = 0
    button.TextColor3 = C.muted
    round(button, 10)
    border(button, C.stroke, .18, 1)
    if not watchedButtons[button] then
        watchedButtons[button] = true
        on(button.MouseEnter:Connect(function()
            if alive then tween(button, {BackgroundColor3 = C.rowHover, TextColor3 = C.text}) end
        end))
        on(button.MouseLeave:Connect(function()
            if alive then tween(button, {BackgroundColor3 = C.row, TextColor3 = C.muted}) end
        end))
    end
end

local function styleHeaderButtons()
    if not header then return end
    for _, child in ipairs(header:GetChildren()) do
        if child:IsA("TextButton") then
            if child.Text == "−" or child.Text == "×" or child.Text == "↗" or child.Text == "↙" then
                styleWindowButton(child)
            else
                local hasIcon = child:FindFirstChildWhichIsA("ImageLabel") ~= nil
                local hasLabel = child:FindFirstChildWhichIsA("TextLabel") ~= nil
                if hasIcon or hasLabel then
                    syncNavButton(child)
                    if not watchedButtons[child] then
                        watchedButtons[child] = true
                        on(child:GetPropertyChangedSignal("BackgroundTransparency"):Connect(function()
                            task.defer(function() if alive then syncNavButton(child) end end)
                        end))
                        on(child.Activated:Connect(function()
                            task.defer(function()
                                if not alive or not header then return end
                                for _, b in ipairs(header:GetChildren()) do
                                    if b:IsA("TextButton") and (b:FindFirstChildWhichIsA("ImageLabel") or b:FindFirstChildWhichIsA("TextLabel")) then
                                        syncNavButton(b)
                                    end
                                end
                            end)
                        end))
                    end
                end
            end
        end
    end
end

styleHeaderButtons()

if secondary then
    secondary.BackgroundColor3 = C.background
    for _, child in ipairs(secondary:GetChildren()) do
        if child:IsA("Frame") and child.Size.Y.Offset <= 3 then
            child.BackgroundColor3 = C.strokeSoft
        end
    end
end

local function styleSecondaryButton(button)
    if not button or not button.Parent then return end
    local active = button.BackgroundTransparency < .5
    button.BackgroundColor3 = C.row
    button.BackgroundTransparency = active and 0 or 1
    button.TextColor3 = active and C.bright or C.muted
    button.Font = Enum.Font.GothamMedium
    round(button, 8)
end

local function resyncSecondary()
    if not secondary then return end
    for _, child in ipairs(secondary:GetChildren()) do
        if child:IsA("TextButton") then
            styleSecondaryButton(child)
            if not watchedButtons[child] then
                watchedButtons[child] = true
                on(child:GetPropertyChangedSignal("BackgroundTransparency"):Connect(function()
                    task.defer(function() if alive then styleSecondaryButton(child) end end)
                end))
                on(child.Activated:Connect(function()
                    task.defer(function()
                        if not alive then return end
                        for _, b in ipairs(secondary:GetChildren()) do
                            if b:IsA("TextButton") then styleSecondaryButton(b) end
                        end
                    end)
                end))
            end
        end
    end
end

resyncSecondary()
if secondary then
    on(secondary.ChildAdded:Connect(function()
        task.defer(function()
            if alive then resyncSecondary() end
        end)
    end))
end

if content then
    content.BackgroundColor3 = C.background
    for _, page in ipairs(content:GetChildren()) do
        if page:IsA("ScrollingFrame") then
            page.ScrollBarImageColor3 = C.muted
            page.ScrollBarThickness = 3
        end
    end
end

if footer then
    footer.BackgroundColor3 = C.panel
    for _, child in ipairs(footer:GetDescendants()) do
        if child:IsA("TextLabel") then
            child.TextColor3 = C.muted
        elseif child:IsA("Frame") and child.Size.Y.Offset <= 3 then
            child.BackgroundColor3 = C.strokeSoft
        end
    end
end

local function findSection(object)
    local p = object
    while p and p ~= gui do
        if p:IsA("Frame") and string.sub(p.Name or "", 1, 8) == "Section_" then
            return p
        end
        p = p.Parent
    end
end

local function firstTitle(section)
    local best, bestY
    bestY = math.huge
    for _, child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and tostring(child.Text or "") ~= "" then
            local y = child.Position.Y.Offset
            if y < bestY then
                best = child
                bestY = y
            end
        end
    end
    return best
end

local function syncSwitch(track)
    if not track or not track.Parent then return end
    local knob = track:FindFirstChild("A7DEV_V17_KNOB") or track:FindFirstChildWhichIsA("Frame")
    if not knob then return end

    local enabled = knob.Position.X.Offset >= 10 or knob.Position.X.Scale > 0
    track.BackgroundColor3 = enabled and C.blue or Color3.fromRGB(30, 40, 55)
    border(track, enabled and Color3.fromRGB(74, 153, 255) or C.stroke, .35, 1)
    knob.BackgroundColor3 = C.white
    round(track, 10)
    round(knob, 8)

    if not watchedSwitches[track] then
        watchedSwitches[track] = true
        on(knob:GetPropertyChangedSignal("Position"):Connect(function()
            task.defer(function() if alive then syncSwitch(track) end end)
        end))
    end
end

local function smallFrame(frame)
    local name = string.lower(tostring(frame.Name or ""))
    if string.find(name, "switch", 1, true)
        or string.find(name, "knob", 1, true)
        or string.find(name, "slider", 1, true)
        or string.find(name, "track", 1, true)
        or string.find(name, "fill", 1, true) then
        return true
    end
    local w = frame.AbsoluteSize.X > 0 and frame.AbsoluteSize.X or frame.Size.X.Offset
    local h = frame.AbsoluteSize.Y > 0 and frame.AbsoluteSize.Y or frame.Size.Y.Offset
    return (w > 0 and w <= 70 and h > 0 and h <= 34) or (h > 0 and h <= 8)
end

local function styleSection(section)
    if not section or not section.Parent then return end
    section.BackgroundColor3 = C.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    round(section, 12)
    border(section, C.stroke, .10, 1)

    local title = firstTitle(section)
    for _, object in ipairs(section:GetDescendants()) do
        if object:IsA("TextLabel") then
            object.TextColor3 = object == title and C.text or C.muted
            object.Font = object == title and Enum.Font.GothamBold or Enum.Font.GothamMedium
        elseif object:IsA("TextBox") then
            object.BackgroundColor3 = C.row
            object.TextColor3 = C.text
            object.PlaceholderColor3 = C.muted
            object.BorderSizePixel = 0
            round(object, 8)
            border(object, C.stroke, .16, 1)
        elseif object:IsA("TextButton") then
            object.AutoButtonColor = false
            object.BorderSizePixel = 0
            if object.Text ~= "" then
                object.BackgroundColor3 = C.row
                object.TextColor3 = C.text
                round(object, 8)
                border(object, C.stroke, .16, 1)
            end
            if not watchedButtons[object] then
                watchedButtons[object] = true
                on(object.Activated:Connect(function()
                    task.delay(.03, function()
                        if alive and section.Parent then styleSection(section) end
                    end)
                end))
            end
        elseif object:IsA("ScrollingFrame") then
            object.BackgroundColor3 = C.background
            object.BackgroundTransparency = 1
            object.ScrollBarImageColor3 = C.muted
        elseif object:IsA("UIStroke") then
            object.Color = C.stroke
        elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
            if object.ImageTransparency < 1 then object.ImageColor3 = C.muted end
        elseif object:IsA("Frame") then
            if object.Name == "A7DEV_REF3_V7_SWITCH" or string.find(object.Name or "", "SWITCH", 1, true) then
                syncSwitch(object)
            elseif object.Name == "A7DEV_V17_KNOB" then
                object.BackgroundColor3 = C.white
            elseif object.BackgroundTransparency < 1 and not smallFrame(object) then
                object.BackgroundColor3 = C.row
            elseif object.BackgroundTransparency < 1 and object.Size.Y.Offset <= 8 then
                object.BackgroundColor3 = C.strokeSoft
            end
        end
    end
end

local sections = {}
for _, object in ipairs(gui:GetDescendants()) do
    if object:IsA("Frame") and string.sub(object.Name or "", 1, 8) == "Section_" then
        sections[#sections + 1] = object
    end
end
for _, section in ipairs(sections) do
    styleSection(section)
end

on(gui.DescendantAdded:Connect(function(object)
    task.delay(.04, function()
        if not alive or not object.Parent then return end
        local section = findSection(object)
        if section then styleSection(section) end
    end)
end))

local function listColumns(page)
    local columns = {}
    if not page then return columns end
    for _, child in ipairs(page:GetChildren()) do
        if child:IsA("Frame") and child:FindFirstChildOfClass("UIListLayout") then
            columns[#columns + 1] = child
        end
    end
    table.sort(columns, function(a, b)
        local ax = a.Position.X.Scale * 10000 + a.Position.X.Offset
        local bx = b.Position.X.Scale * 10000 + b.Position.X.Offset
        return ax < bx
    end)
    return columns
end

local function infoCard(parent, name, title, height, order)
    local old = parent:FindFirstChild(name)
    if old then old:Destroy() end
    local card = remember(make("Frame", parent, {
        Name = name,
        Size = UDim2.new(1, 0, 0, height),
        BackgroundColor3 = C.panel,
        BorderSizePixel = 0,
        LayoutOrder = order,
        ZIndex = 135,
    }))
    round(card, 12)
    border(card, C.stroke, .10, 1)
    make("TextLabel", card, {
        Position = UDim2.fromOffset(14, 9),
        Size = UDim2.new(1, -28, 0, 23),
        BackgroundTransparency = 1,
        Text = title,
        TextColor3 = C.text,
        Font = Enum.Font.GothamBold,
        TextSize = 11,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 136,
    })
    return card
end

local infoColumns = listColumns(infoPage)
if #infoColumns >= 3 then
    local profile = infoCard(infoColumns[3], "A7DEV_BLUE_PROFILE", "Profile", 126, -300)
    local avatar = make("Frame", profile, {
        Position = UDim2.fromOffset(14, 40),
        Size = UDim2.fromOffset(62, 62),
        BackgroundColor3 = C.row,
        BorderSizePixel = 0,
        ZIndex = 136,
    })
    round(avatar, 31)
    border(avatar, C.stroke, .08, 1)
    local avatarImage = make("ImageLabel", avatar, {
        Size = UDim2.fromScale(1, 1),
        BackgroundTransparency = 1,
        Image = "",
        ZIndex = 137,
    })
    round(avatarImage, 31)

    local displayName = make("TextLabel", profile, {
        Position = UDim2.fromOffset(88, 47),
        Size = UDim2.new(1, -102, 0, 24),
        BackgroundTransparency = 1,
        Text = LocalPlayer.DisplayName,
        TextColor3 = C.text,
        Font = Enum.Font.GothamBold,
        TextSize = 13,
        TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd,
        ZIndex = 136,
    })
    make("TextLabel", profile, {
        Position = UDim2.fromOffset(88, 73),
        Size = UDim2.new(1, -102, 0, 22),
        BackgroundTransparency = 1,
        Text = "@" .. LocalPlayer.Name,
        TextColor3 = C.bright,
        Font = Enum.Font.GothamMedium,
        TextSize = 10,
        TextXAlignment = Enum.TextXAlignment.Left,
        TextTruncate = Enum.TextTruncate.AtEnd,
        ZIndex = 136,
    })
    local online = make("Frame", profile, {
        Position = UDim2.fromOffset(64, 88),
        Size = UDim2.fromOffset(12, 12),
        BackgroundColor3 = C.green,
        BorderSizePixel = 0,
        ZIndex = 138,
    })
    round(online, 6)

    task.spawn(function()
        local ok, url, ready = pcall(function()
            return Players:GetUserThumbnailAsync(LocalPlayer.UserId, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size180x180)
        end)
        if alive and ok and ready then avatarImage.Image = url end
    end)
    on(LocalPlayer:GetPropertyChangedSignal("DisplayName"):Connect(function()
        if alive then displayName.Text = LocalPlayer.DisplayName end
    end))

    local performance = infoCard(infoColumns[3], "A7DEV_BLUE_PERFORMANCE", "Performance", 118, -290)
    local fpsLabel = make("TextLabel", performance, {
        Position = UDim2.fromOffset(14, 42), Size = UDim2.new(.5, -14, 0, 24),
        BackgroundTransparency = 1, Text = "-- FPS", TextColor3 = C.text,
        Font = Enum.Font.GothamBold, TextSize = 12, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 136,
    })
    local pingLabel = make("TextLabel", performance, {
        Position = UDim2.new(.5, 0, 0, 42), Size = UDim2.new(.5, -14, 0, 24),
        BackgroundTransparency = 1, Text = "Ping -- ms", TextColor3 = C.muted,
        Font = Enum.Font.GothamMedium, TextSize = 10, TextXAlignment = Enum.TextXAlignment.Right, ZIndex = 136,
    })
    local track = make("Frame", performance, {
        Position = UDim2.fromOffset(14, 82), Size = UDim2.new(1, -28, 0, 10),
        BackgroundColor3 = Color3.fromRGB(16, 29, 49), BorderSizePixel = 0, ZIndex = 136,
    })
    round(track, 5)
    local fill = make("Frame", track, {
        Size = UDim2.fromOffset(0, 10), BackgroundColor3 = C.blue, BorderSizePixel = 0, ZIndex = 137,
    })
    round(fill, 5)
    addGradient(fill, "A7BluePerfGradient", C.blue, C.bright, 0)

    local fpsTime, frameCount, pingTime = 0, 0, 0
    on(RunService.RenderStepped:Connect(function(dt)
        fpsTime = fpsTime + dt
        frameCount = frameCount + 1
        if fpsTime >= .5 then
            local fps = frameCount / fpsTime
            fpsLabel.Text = string.format("%d FPS", math.floor(fps + .5))
            fill.Size = UDim2.new(math.clamp(fps / 60, 0, 1), 0, 0, 10)
            fpsTime, frameCount = 0, 0
        end
    end))
    on(RunService.Heartbeat:Connect(function(dt)
        pingTime = pingTime + dt
        if pingTime < 1 then return end
        pingTime = 0
        local ok, seconds = pcall(function() return LocalPlayer:GetNetworkPing() end)
        pingLabel.Text = ok and string.format("Ping %d ms", math.floor(seconds * 1000 + .5)) or "Ping -- ms"
    end))

    local session = infoCard(infoColumns[3], "A7DEV_BLUE_SESSION", "Session", 118, -280)
    local playerCount = make("TextLabel", session, {
        Position = UDim2.fromOffset(14, 44), Size = UDim2.new(.5, -14, 0, 30),
        BackgroundTransparency = 1, Text = tostring(#Players:GetPlayers()), TextColor3 = C.text,
        Font = Enum.Font.GothamBold, TextSize = 16, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 136,
    })
    make("TextLabel", session, {
        Position = UDim2.fromOffset(14, 72), Size = UDim2.new(.5, -14, 0, 20),
        BackgroundTransparency = 1, Text = "Players", TextColor3 = C.muted,
        Font = Enum.Font.GothamMedium, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 136,
    })
    local elapsed = make("TextLabel", session, {
        Position = UDim2.new(.5, 0, 0, 44), Size = UDim2.new(.5, -14, 0, 30),
        BackgroundTransparency = 1, Text = "00:00:00", TextColor3 = C.text,
        Font = Enum.Font.GothamBold, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Right, ZIndex = 136,
    })
    make("TextLabel", session, {
        Position = UDim2.new(.5, 0, 0, 72), Size = UDim2.new(.5, -14, 0, 20),
        BackgroundTransparency = 1, Text = "Elapsed", TextColor3 = C.muted,
        Font = Enum.Font.GothamMedium, TextSize = 9, TextXAlignment = Enum.TextXAlignment.Right, ZIndex = 136,
    })

    local function updatePlayers()
        if alive then playerCount.Text = tostring(#Players:GetPlayers()) end
    end
    on(Players.PlayerAdded:Connect(updatePlayers))
    on(Players.PlayerRemoving:Connect(function()
        task.defer(updatePlayers)
    end))
    local lastSecond = -1
    on(RunService.Heartbeat:Connect(function()
        local seconds = math.floor(os.clock() - sessionStarted)
        if seconds == lastSecond then return end
        lastSecond = seconds
        elapsed.Text = string.format("%02d:%02d:%02d", math.floor(seconds / 3600), math.floor(seconds / 60) % 60, seconds % 60)
    end))
end

local function stop()
    if not alive then return end
    alive = false
    for _, connection in ipairs(connections) do
        pcall(function() connection:Disconnect() end)
    end
    for _, object in ipairs(created) do
        if object and object.Parent then
            pcall(function() object:Destroy() end)
        end
    end
    ENV.A7DEV_PS2_BLUE_TEST_V1_STOP = nil
end

ENV.A7DEV_PS2_BLUE_TEST_V1_STOP = stop

task.delay(.35, function()
    if not alive then return end
    styleHeaderButtons()
    resyncSecondary()
    for _, section in ipairs(sections) do
        if section.Parent then styleSection(section) end
    end
end)
