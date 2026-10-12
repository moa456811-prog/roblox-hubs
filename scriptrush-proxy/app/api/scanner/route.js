const SCANNER = String.raw`-- ScriptRush Live Game Intelligence Scanner
-- Read-only: observes client-visible instances and never calls game remotes.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local UserInputService = game:GetService("UserInputService")
local CoreGui = game:GetService("CoreGui")

local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    LocalPlayer = Players.LocalPlayer
end

local PlayerGui = LocalPlayer:WaitForChild("PlayerGui", 10)
local Backpack = LocalPlayer:FindFirstChildOfClass("Backpack") or LocalPlayer:WaitForChild("Backpack", 10)

local clipboardFn = setclipboard or toclipboard
local fileFn = writefile
local huiFn = gethui
local executorFn = identifyexecutor

local LIMITS = {
    quick = {instances = 4500, npcs = 45, remotes = 60, prompts = 45, tools = 40, gui = 70, values = 60, structures = 60, tags = 40},
    deep = {instances = 14000, npcs = 90, remotes = 120, prompts = 90, tools = 70, gui = 130, values = 110, structures = 110, tags = 80},
}

local state = {
    latest = nil,
    before = nil,
    after = nil,
    diff = nil,
    events = {},
    connections = {},
    mode = "none",
}

local statusLabel
local function setStatus(text)
    if statusLabel then statusLabel.Text = text end
    print("[ScriptRush] " .. tostring(text))
end

local function disconnectRecorder()
    for _, connection in ipairs(state.connections) do
        pcall(function() connection:Disconnect() end)
    end
    table.clear(state.connections)
end

local function safeName(value)
    local text = tostring(value or "")
    text = text:gsub("[%c]", " ")
    if #text > 120 then text = text:sub(1, 120) end
    return text
end

local function pathOf(instance)
    local parts = {}
    local cursor = instance
    local depth = 0
    while cursor and cursor ~= game and depth < 12 do
        table.insert(parts, 1, safeName(cursor.Name))
        cursor = cursor.Parent
        depth += 1
    end
    return table.concat(parts, ".")
end

local function scalar(value)
    local kind = typeof(value)
    if kind == "string" then return safeName(value) end
    if kind == "number" or kind == "boolean" then return value end
    if kind == "Vector3" then return string.format("%.2f,%.2f,%.2f", value.X, value.Y, value.Z) end
    if kind == "CFrame" then
        local p = value.Position
        return string.format("%.2f,%.2f,%.2f", p.X, p.Y, p.Z)
    end
    if kind == "Color3" then return string.format("%.3f,%.3f,%.3f", value.R, value.G, value.B) end
    if kind == "BrickColor" then return value.Name end
    if kind == "EnumItem" then return tostring(value) end
    return nil
end

local function attributesOf(instance, maxItems)
    local out = {}
    local ok, attributes = pcall(function() return instance:GetAttributes() end)
    if not ok then return out end
    local count = 0
    for key, value in pairs(attributes) do
        local encoded = scalar(value)
        if encoded ~= nil then
            out[safeName(key)] = encoded
            count += 1
            if count >= maxItems then break end
        end
    end
    return out
end

local function tagsOf(instance, maxItems)
    local out = {}
    local ok, tags = pcall(function() return CollectionService:GetTags(instance) end)
    if not ok then return out end
    for index = 1, math.min(#tags, maxItems) do
        out[index] = safeName(tags[index])
    end
    return out
end

local function isPlayerCharacter(model)
    if not model or not model:IsA("Model") then return false end
    return Players:GetPlayerFromCharacter(model) ~= nil
end

local function rootPartOf(model)
    return model:FindFirstChild("HumanoidRootPart")
        or model.PrimaryPart
        or model:FindFirstChild("Torso")
        or model:FindFirstChild("UpperTorso")
end

local function isPrivateGuiPath(path)
    local lower = path:lower()
    return lower:find("chat", 1, true)
        or lower:find("playerlist", 1, true)
        or lower:find("friend", 1, true)
        or lower:find("voice", 1, true)
end

local function push(list, value, limit)
    if #list < limit then table.insert(list, value) end
end

local function snapshotMaps()
    return {values = {}, gui = {}, humanoids = {}, tools = {}}
end

local function scan(mode)
    mode = mode == "deep" and "deep" or "quick"
    local limits = LIMITS[mode]
    local result = {
        mode = mode,
        scannedAt = os.time(),
        counts = {instances = 0, npcs = 0, remotes = 0, prompts = 0, tools = 0, gui = 0, values = 0},
        npcs = {}, remotes = {}, prompts = {}, clickDetectors = {}, tools = {}, gui = {}, values = {},
        structures = {}, tagged = {}, animations = {}, zones = {},
        _maps = snapshotMaps(),
    }

    local roots = {
        {name = "Workspace", object = Workspace},
        {name = "ReplicatedStorage", object = ReplicatedStorage},
        {name = "PlayerGui", object = PlayerGui},
        {name = "Backpack", object = Backpack},
    }

    local queue = {}
    for _, root in ipairs(roots) do
        if root.object then table.insert(queue, {object = root.object, depth = 0, root = root.name}) end
    end

    local seenNpc = {}
    local cursor = 1
    while cursor <= #queue and result.counts.instances < limits.instances do
        local node = queue[cursor]
        cursor += 1
        local object = node.object
        if object and object.Parent then
            result.counts.instances += 1
            local class = object.ClassName
            local path = pathOf(object)
            local lower = (object.Name .. " " .. path):lower()

            if node.depth <= 3 and (object:IsA("Folder") or object:IsA("Model")) then
                push(result.structures, {path = path, class = class, children = #object:GetChildren()}, limits.structures)
            end

            if object:IsA("Model") and not seenNpc[object] then
                local humanoid = object:FindFirstChildOfClass("Humanoid")
                local root = rootPartOf(object)
                if humanoid and root and not isPlayerCharacter(object) then
                    seenNpc[object] = true
                    local record = {
                        name = safeName(object.Name),
                        path = path,
                        health = math.floor(humanoid.Health * 100) / 100,
                        maxHealth = math.floor(humanoid.MaxHealth * 100) / 100,
                        root = root.Name,
                        position = scalar(root.CFrame),
                        attributes = attributesOf(object, 10),
                        tags = mode == "deep" and tagsOf(object, 8) or nil,
                        bossCandidate = object.Name:lower():find("boss", 1, true) ~= nil or humanoid.MaxHealth >= 5000,
                    }
                    push(result.npcs, record, limits.npcs)
                    result._maps.humanoids[path] = record.health
                end
            end

            if object:IsA("RemoteEvent") or object:IsA("RemoteFunction") then
                push(result.remotes, {name = safeName(object.Name), path = path, class = class}, limits.remotes)
            elseif object:IsA("ProximityPrompt") then
                push(result.prompts, {
                    name = safeName(object.Name), path = path, action = safeName(object.ActionText),
                    object = safeName(object.ObjectText), enabled = object.Enabled, hold = object.HoldDuration,
                }, limits.prompts)
            elseif object:IsA("ClickDetector") then
                push(result.clickDetectors, {path = path, distance = object.MaxActivationDistance}, 60)
            elseif object:IsA("Tool") then
                local record = {name = safeName(object.Name), path = path, parent = object.Parent and safeName(object.Parent.Name) or "", attributes = attributesOf(object, 8)}
                push(result.tools, record, limits.tools)
                result._maps.tools[path] = true
            elseif object:IsA("Animation") then
                push(result.animations, {name = safeName(object.Name), path = path, id = safeName(object.AnimationId)}, 60)
            elseif object:IsA("ValueBase") then
                local ok, value = pcall(function() return object.Value end)
                if ok then
                    local encoded = scalar(value)
                    if encoded ~= nil then
                        push(result.values, {name = safeName(object.Name), path = path, class = class, value = encoded}, limits.values)
                        result._maps.values[path] = tostring(encoded)
                    end
                end
            end

            if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
                if not isPrivateGuiPath(path) then
                    local text = safeName(object.Text)
                    if text ~= "" and text ~= LocalPlayer.Name and text ~= LocalPlayer.DisplayName then
                        local visible = true
                        pcall(function() visible = object.Visible end)
                        push(result.gui, {path = path, class = class, text = text, visible = visible}, limits.gui)
                        result._maps.gui[path] = text .. "|" .. tostring(visible)
                    end
                end
            end

            if mode == "deep" and (object:IsA("Model") or object:IsA("Folder") or object:IsA("Tool") or object:IsA("BasePart")) then
                local tags = tagsOf(object, 6)
                if #tags > 0 then push(result.tagged, {path = path, tags = tags}, limits.tags) end
            end

            if object:IsA("BasePart") and (lower:find("spawn") or lower:find("zone") or lower:find("chest") or lower:find("drop") or lower:find("loot") or lower:find("door") or lower:find("teleport")) then
                push(result.zones, {name = safeName(object.Name), path = path, position = scalar(object.CFrame)}, 70)
            end

            local ok, children = pcall(function() return object:GetChildren() end)
            if ok then
                for _, child in ipairs(children) do
                    if result.counts.instances + (#queue - cursor) < limits.instances * 2 then
                        table.insert(queue, {object = child, depth = node.depth + 1, root = node.root})
                    end
                end
            end

            if result.counts.instances % 250 == 0 then task.wait() end
        end
    end

    result.counts.npcs = #result.npcs
    result.counts.remotes = #result.remotes
    result.counts.prompts = #result.prompts
    result.counts.tools = #result.tools
    result.counts.gui = #result.gui
    result.counts.values = #result.values
    return result
end

local function compareMap(before, after, limit)
    local added, removed, changed = {}, {}, {}
    for key, value in pairs(after or {}) do
        if before[key] == nil then
            push(added, {path = key, value = value}, limit)
        elseif tostring(before[key]) ~= tostring(value) then
            push(changed, {path = key, before = before[key], after = value}, limit)
        end
    end
    for key, value in pairs(before or {}) do
        if after[key] == nil then push(removed, {path = key, value = value}, limit) end
    end
    return {added = added, removed = removed, changed = changed}
end

local function buildDiff(before, after)
    if not before or not after then return nil end
    return {
        values = compareMap(before._maps.values, after._maps.values, 70),
        gui = compareMap(before._maps.gui, after._maps.gui, 70),
        humanoids = compareMap(before._maps.humanoids, after._maps.humanoids, 70),
        tools = compareMap(before._maps.tools, after._maps.tools, 50),
        timeline = state.events,
    }
end

local function startRecorder()
    disconnectRecorder()
    table.clear(state.events)
    local roots = {Workspace, ReplicatedStorage, PlayerGui, Backpack}
    local function event(kind, object)
        if #state.events >= 180 or not object then return end
        local path = pathOf(object)
        if isPrivateGuiPath(path) then return end
        table.insert(state.events, {time = math.floor(os.clock() * 100) / 100, kind = kind, class = object.ClassName, path = path})
    end
    for _, root in ipairs(roots) do
        if root then
            table.insert(state.connections, root.DescendantAdded:Connect(function(object) event("added", object) end))
            table.insert(state.connections, root.DescendantRemoving:Connect(function(object) event("removed", object) end))
        end
    end
end

local function featureScores(scanResult, diff)
    local corpusParts = {}
    local function add(value) table.insert(corpusParts, tostring(value or ""):lower()) end
    for _, value in ipairs(scanResult.gui) do add(value.text); add(value.path) end
    for _, value in ipairs(scanResult.prompts) do add(value.name); add(value.action); add(value.object); add(value.path) end
    for _, value in ipairs(scanResult.tools) do add(value.name); add(value.path) end
    for _, value in ipairs(scanResult.structures) do add(value.path) end
    for _, value in ipairs(scanResult.npcs) do add(value.name); add(value.path) end
    local corpus = table.concat(corpusParts, " ")

    local function contains(words)
        local count = 0
        for _, word in ipairs(words) do if corpus:find(word, 1, true) then count += 1 end end
        return count
    end

    local function confidence(score)
        if score >= 80 then return "high" end
        if score >= 45 then return "medium" end
        if score > 0 then return "low" end
        return "none"
    end

    local bossCount = 0
    for _, npc in ipairs(scanResult.npcs) do if npc.bossCandidate then bossCount += 1 end end
    local changedHealth = diff and #(diff.humanoids.changed or {}) or 0
    local changedGui = diff and #(diff.gui.changed or {}) or 0
    local changedValues = diff and #(diff.values.changed or {}) or 0

    local raw = {
        {key = "farm", label = "Auto Farm", score = math.min(100, #scanResult.npcs * 5 + changedHealth * 12), evidence = {"NPC candidates: " .. #scanResult.npcs, "Health changes: " .. changedHealth}},
        {key = "quest", label = "Auto Quest", score = math.min(100, contains({"quest", "objective", "mission", "task"}) * 24 + changedGui * 5 + changedValues * 5), evidence = {"Quest signals: " .. contains({"quest", "objective", "mission", "task"}), "State changes: " .. (changedGui + changedValues)}},
        {key = "boss", label = "Auto Boss", score = math.min(100, bossCount * 30 + contains({"boss", "respawn", "spawn timer"}) * 18), evidence = {"Boss candidates: " .. bossCount}},
        {key = "loot", label = "Auto Loot", score = math.min(100, contains({"loot", "drop", "chest", "collect", "reward"}) * 20 + #scanResult.prompts * 2), evidence = {"Loot signals: " .. contains({"loot", "drop", "chest", "collect", "reward"}), "Prompts: " .. #scanResult.prompts}},
        {key = "fishing", label = "Fishing", score = math.min(100, contains({"fish", "rod", "bait", "hook"}) * 28), evidence = {"Fishing signals: " .. contains({"fish", "rod", "bait", "hook"})}},
        {key = "sell", label = "Auto Sell", score = math.min(100, contains({"sell", "merchant", "vendor", "shop"}) * 24), evidence = {"Sell signals: " .. contains({"sell", "merchant", "vendor", "shop"})}},
        {key = "dungeon", label = "Dungeon/Raid", score = math.min(100, contains({"dungeon", "raid", "wave", "stage"}) * 24), evidence = {"Dungeon signals: " .. contains({"dungeon", "raid", "wave", "stage"})}},
        {key = "skills", label = "Skills", score = math.min(100, contains({"skill", "ability", "cooldown", "mastery"}) * 20 + #scanResult.tools * 2), evidence = {"Skill signals: " .. contains({"skill", "ability", "cooldown", "mastery"})}},
    }
    for _, feature in ipairs(raw) do feature.confidence = confidence(feature.score) end
    return raw
end

local function compactScan(scanResult)
    return {
        mode = scanResult.mode,
        scannedAt = scanResult.scannedAt,
        counts = scanResult.counts,
        npcs = scanResult.npcs,
        remotes = scanResult.remotes,
        prompts = scanResult.prompts,
        clickDetectors = scanResult.clickDetectors,
        tools = scanResult.tools,
        gui = scanResult.gui,
        values = scanResult.values,
        structures = scanResult.structures,
        tagged = scanResult.tagged,
        animations = scanResult.animations,
        zones = scanResult.zones,
    }
end

local function executorName()
    if type(executorFn) == "function" then
        local ok, value = pcall(executorFn)
        if ok then return safeName(value) end
    end
    return "unknown"
end

local function encodeReport()
    if not state.latest then
        setStatus("Run Quick or Deep first")
        return nil
    end
    local report = {
        version = "2.0",
        type = "live-client-read-only",
        game = {placeId = tostring(game.PlaceId), universeId = tostring(game.GameId)},
        capabilities = {
            executor = executorName(),
            clipboard = type(clipboardFn) == "function",
            writefile = type(fileFn) == "function",
            gethui = type(huiFn) == "function",
            remoteObservationOnly = true,
        },
        scan = compactScan(state.latest),
        guided = state.diff,
        features = featureScores(state.latest, state.diff),
        generatedAt = os.time(),
    }
    local ok, encoded = pcall(function() return HttpService:JSONEncode(report) end)
    if not ok then
        setStatus("Could not encode report")
        return nil
    end
    return "[SCRIPTRUSH_RUNTIME_PROFILE]" .. encoded
end

local function exportReport()
    local report = encodeReport()
    if not report then return end
    local copied = false
    if type(clipboardFn) == "function" then
        copied = pcall(clipboardFn, report)
    end
    if type(fileFn) == "function" then
        pcall(fileFn, "scriptrush-runtime-profile.json", report)
    end
    print(report)
    setStatus(copied and "Report copied" or "Report printed / saved")
end

local function parentForGui()
    if type(huiFn) == "function" then
        local ok, value = pcall(huiFn)
        if ok and value then return value end
    end
    local ok, value = pcall(function() return CoreGui end)
    if ok and value then return value end
    return PlayerGui
end

local existing = parentForGui():FindFirstChild("ScriptRushScanner")
if existing then existing:Destroy() end

local gui = Instance.new("ScreenGui")
gui.Name = "ScriptRushScanner"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 999999
gui.Parent = parentForGui()

local frame = Instance.new("Frame")
frame.Size = UDim2.fromOffset(430, 262)
frame.Position = UDim2.new(0.5, -215, 0.5, -131)
frame.BackgroundColor3 = Color3.fromRGB(10, 10, 10)
frame.BorderSizePixel = 0
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(72, 72, 72)
stroke.Thickness = 1
stroke.Parent = frame

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -24, 0, 42)
title.Position = UDim2.fromOffset(12, 4)
title.BackgroundTransparency = 1
title.Text = "ScriptRush Live Scanner"
title.TextColor3 = Color3.new(1, 1, 1)
title.TextSize = 15
title.Font = Enum.Font.GothamBold
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = frame

statusLabel = Instance.new("TextLabel")
statusLabel.Size = UDim2.new(1, -24, 0, 30)
statusLabel.Position = UDim2.fromOffset(12, 42)
statusLabel.BackgroundColor3 = Color3.fromRGB(20, 20, 20)
statusLabel.BorderSizePixel = 0
statusLabel.Text = "Ready • read-only • no remotes called"
statusLabel.TextColor3 = Color3.fromRGB(190, 190, 190)
statusLabel.TextSize = 11
statusLabel.Font = Enum.Font.Gotham
statusLabel.Parent = frame
Instance.new("UICorner", statusLabel).CornerRadius = UDim.new(0, 8)

local function button(text, x, y, callback)
    local value = Instance.new("TextButton")
    value.Size = UDim2.fromOffset(194, 40)
    value.Position = UDim2.fromOffset(x, y)
    value.BackgroundColor3 = Color3.fromRGB(245, 245, 245)
    value.TextColor3 = Color3.fromRGB(5, 5, 5)
    value.BorderSizePixel = 0
    value.Text = text
    value.TextSize = 12
    value.Font = Enum.Font.GothamSemibold
    value.AutoButtonColor = true
    value.Parent = frame
    Instance.new("UICorner", value).CornerRadius = UDim.new(0, 8)
    value.MouseButton1Click:Connect(function()
        task.spawn(function()
            local ok, err = pcall(callback)
            if not ok then setStatus("Error: " .. safeName(err)) end
        end)
    end)
    return value
end

button("Quick scan", 12, 82, function()
    setStatus("Scanning client-visible game data...")
    state.latest = scan("quick")
    state.mode = "quick"
    setStatus("Quick scan complete • " .. state.latest.counts.instances .. " instances")
end)

button("Deep scan", 224, 82, function()
    setStatus("Deep scan running...")
    state.latest = scan("deep")
    state.mode = "deep"
    setStatus("Deep scan complete • " .. state.latest.counts.instances .. " instances")
end)

button("Record before", 12, 132, function()
    setStatus("Capturing BEFORE state...")
    state.before = scan("deep")
    state.latest = state.before
    state.after = nil
    state.diff = nil
    startRecorder()
    state.mode = "guided"
    setStatus("Recording • perform one action, then press Record after")
end)

button("Record after", 224, 132, function()
    if not state.before then
        setStatus("Press Record before first")
        return
    end
    setStatus("Capturing AFTER state...")
    state.after = scan("deep")
    disconnectRecorder()
    state.diff = buildDiff(state.before, state.after)
    state.latest = state.after
    setStatus("Action learned • export the report")
end)

button("Export / Copy report", 12, 182, exportReport)
button("Close", 224, 182, function()
    disconnectRecorder()
    gui:Destroy()
end)

local hint = Instance.new("TextLabel")
hint.Size = UDim2.new(1, -24, 0, 24)
hint.Position = UDim2.fromOffset(12, 230)
hint.BackgroundTransparency = 1
hint.Text = "Guided: Before → perform quest/combat/loot action → After → Export"
hint.TextColor3 = Color3.fromRGB(125, 125, 125)
hint.TextSize = 10
hint.Font = Enum.Font.Gotham
hint.TextXAlignment = Enum.TextXAlignment.Left
hint.Parent = frame

local dragging = false
local dragStart, startPosition

title.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPosition = frame.Position
    end
end)

title.InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
end)

UserInputService.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        frame.Position = UDim2.new(startPosition.X.Scale, startPosition.X.Offset + delta.X, startPosition.Y.Scale, startPosition.Y.Offset + delta.Y)
    end
end)

setStatus("Ready • run inside the live game")
`;

export async function GET() {
  return Response.json({ script: SCANNER, version: "2.0", runtime: "live-client" }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
