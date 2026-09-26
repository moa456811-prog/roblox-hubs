-- A7DEV Project Slayer 2 | Auto Parry V1
-- Isolated optional feature. OFF by default.
-- Uses the game's native Blocking skill through Skill_Controller.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if type(ENV.A7DEV_PS2_AUTO_PARRY_STOP) == "function" then
    pcall(ENV.A7DEV_PS2_AUTO_PARRY_STOP)
end

local State
for _ = 1, 300 do
    State = ENV.A7DEV_PROJECT_SLAYER_2
    if State and type(State) == "table" then break end
    task.wait(.05)
end
if not State then
    warn("[A7DEV] Auto Parry: Slayer 2 state unavailable.")
    return
end

State.Flags = State.Flags or {}
State.Flags.AutoParry = State.Flags.AutoParry == true

local Ops = {
    alive = true,
    conns = {},
    watched = setmetatable({}, {__mode = "k"}),
    modelConns = setmetatable({}, {__mode = "k"}),
    lastParry = -math.huge,
    ownBlocking = false,
    releaseAt = 0,
    blockEpoch = 0,
    range = 16,
    closeRange = 6.5,
    reactionDelay = 0.045,
    holdTime = 0.30,
    cooldown = 0.38,
}
State.AutoParryOps = Ops

local function low(value)
    return string.lower(tostring(value or ""))
end

local function on(connection)
    if connection then Ops.conns[#Ops.conns + 1] = connection end
    return connection
end

local function rootOf(model)
    if not model then return nil end
    local humanoid = model:FindFirstChildOfClass("Humanoid")
    return (humanoid and humanoid.RootPart)
        or model:FindFirstChild("HumanoidRootPart")
        or model.PrimaryPart
        or model:FindFirstChildWhichIsA("BasePart", true)
end

local function alive(model)
    local humanoid = model and model:FindFirstChildOfClass("Humanoid")
    return model and model.Parent and humanoid and humanoid.Health > 0
end

local function myCharacter()
    local character = LocalPlayer.Character
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    local root = character and rootOf(character)
    if not character or not humanoid or humanoid.Health <= 0 or not root then
        return nil, nil, nil
    end
    return character, humanoid, root
end

local Native = {}
local function requireSafe(module)
    if not module then return nil end
    local ok, value = pcall(require, module)
    return ok and value or nil
end

local function refreshNative(force)
    if Native.ready and force ~= true then return end
    local CAM = ReplicatedStorage:FindFirstChild("CAM")
    local Global = CAM and CAM:FindFirstChild("Global")
    local Client = CAM and CAM:FindFirstChild("Client")
    local controllers = Client and Client:FindFirstChild("Controllers")

    Native.SkillController = controllers and requireSafe(controllers:FindFirstChild("Skill_Controller"))
    Native.SkillsModule = Global and requireSafe(Global:FindFirstChild("Skills_Module"))
    Native.ready = true
end
refreshNative()

local function releaseOwnedBlock()
    if not Ops.ownBlocking then return end
    Ops.blockEpoch += 1
    Ops.ownBlocking = false
    Ops.releaseAt = 0

    refreshNative()
    if Native.SkillController and type(Native.SkillController.StopHold) == "function" then
        pcall(Native.SkillController.StopHold, "Blocking")
    end
end

local function stop()
    if not Ops.alive then return end
    Ops.alive = false
    releaseOwnedBlock()

    for _, list in pairs(Ops.modelConns) do
        for _, connection in ipairs(list) do
            pcall(function() connection:Disconnect() end)
        end
    end
    Ops.modelConns = setmetatable({}, {__mode = "k"})

    for _, connection in ipairs(Ops.conns) do
        pcall(function() connection:Disconnect() end)
    end
    table.clear(Ops.conns)

    ENV.A7DEV_PS2_AUTO_PARRY_STOP = nil
end
ENV.A7DEV_PS2_AUTO_PARRY_STOP = stop

local REJECT = {
    "idle", "walk", "run", "jump", "fall", "land", "sit", "sleep",
    "equip", "unequip", "draw", "sheath", "spawn", "death", "dead",
    "hurt", "damage", "hitreact", "stun", "knock", "ragdoll",
    "block", "blocking", "guard", "parry", "dodge", "roll", "dash",
    "drink", "eat", "emote", "pose", "climb", "swim",
}

local ATTACK = {
    "attack", "slash", "swing", "strike", "m1", "m2", "combo",
    "punch", "kick", "claw", "bite", "combat", "skill",
    "sword", "katana", "fist", "scythe", "spear", "weapon",
    "breath", "blood", "demonart", "art", "flame", "water",
    "wind", "thunder", "mist", "sound", "beast", "serpent", "insect",
}

local function animationText(track)
    local parts = {track and track.Name or ""}
    local animation = track and track.Animation
    if animation then
        parts[#parts + 1] = animation.Name
        parts[#parts + 1] = animation.AnimationId
    end
    return low(table.concat(parts, " "))
end

local function attackLike(track)
    if not track then return false end
    local text = animationText(track)

    for _, token in ipairs(REJECT) do
        if string.find(text, token, 1, true) then return false end
    end

    for _, token in ipairs(ATTACK) do
        if string.find(text, token, 1, true) then return true end
    end

    local priority
    pcall(function() priority = track.Priority end)
    return priority == Enum.AnimationPriority.Action
        or priority == Enum.AnimationPriority.Action2
        or priority == Enum.AnimationPriority.Action3
        or priority == Enum.AnimationPriority.Action4
end

local function threatening(model)
    if not State.Flags.AutoParry or not alive(model) then return false end
    if model == LocalPlayer.Character then return false end

    local _, _, myRoot = myCharacter()
    local enemyRoot = rootOf(model)
    if not myRoot or not enemyRoot then return false end

    local offset = myRoot.Position - enemyRoot.Position
    local distance = offset.Magnitude
    if distance > Ops.range then return false end
    if distance <= Ops.closeRange then return true end
    if distance < .01 then return true end

    local flat = Vector3.new(offset.X, 0, offset.Z)
    if flat.Magnitude < .01 then return true end

    local look = enemyRoot.CFrame.LookVector
    local enemyFlat = Vector3.new(look.X, 0, look.Z)
    if enemyFlat.Magnitude < .01 then return true end

    -- Allow a generous frontal cone; reject enemies clearly attacking away.
    return enemyFlat.Unit:Dot(flat.Unit) > -0.15
end

local function canBlock()
    refreshNative()
    if not Native.SkillController or type(Native.SkillController.Attempt_Hold) ~= "function" then
        refreshNative(true)
    end
    if not Native.SkillController or type(Native.SkillController.Attempt_Hold) ~= "function" then
        return false
    end

    if Native.SkillsModule and type(Native.SkillsModule.Can_Skill) == "function" then
        local ok, allowed = pcall(Native.SkillsModule.Can_Skill, LocalPlayer, "Blocking")
        if ok and allowed == false then return false end
    end

    return true
end

local function startParry(model)
    if not Ops.alive or not State.Flags.AutoParry or not threatening(model) then return false end

    local now = os.clock()
    if Ops.ownBlocking then
        Ops.releaseAt = math.max(Ops.releaseAt, now + Ops.holdTime)
        return true
    end
    if now - Ops.lastParry < Ops.cooldown then return false end
    if not canBlock() then return false end

    local ok, used = pcall(Native.SkillController.Attempt_Hold, "Blocking", "A7DEV_AUTO_PARRY")
    if not ok or used ~= true then
        return false
    end

    Ops.lastParry = now
    Ops.ownBlocking = true
    Ops.releaseAt = now + Ops.holdTime
    Ops.blockEpoch += 1
    local epoch = Ops.blockEpoch

    State.AutoParryLastThreat = model.Name
    State.AutoParryLastAt = now

    task.spawn(function()
        while Ops.alive and Ops.ownBlocking and Ops.blockEpoch == epoch do
            local remaining = Ops.releaseAt - os.clock()
            if remaining <= 0 then break end
            task.wait(math.min(.05, remaining))
        end

        if Ops.alive and Ops.ownBlocking and Ops.blockEpoch == epoch then
            releaseOwnedBlock()
        end
    end)

    return true
end

local function react(model, track)
    if not Ops.alive or not State.Flags.AutoParry then return end
    if not attackLike(track) or not threatening(model) then return end

    local character = LocalPlayer.Character
    local started = os.clock()

    task.delay(Ops.reactionDelay, function()
        if not Ops.alive or not State.Flags.AutoParry then return end
        if LocalPlayer.Character ~= character then return end
        if os.clock() - started > .35 then return end
        if track and track.IsPlaying == false then return end
        startParry(model)
    end)
end

local function unwatch(model)
    local list = Ops.modelConns[model]
    if not list then return end
    Ops.modelConns[model] = nil
    Ops.watched[model] = nil
    for _, connection in ipairs(list) do
        pcall(function() connection:Disconnect() end)
    end
end

local function watchModel(model)
    if not model or Ops.watched[model] or model == LocalPlayer.Character then return end
    if not model:IsA("Model") then return end

    local humanoid = model:FindFirstChildOfClass("Humanoid")
    if not humanoid then return end

    Ops.watched[model] = true
    local list = {}
    Ops.modelConns[model] = list

    local animatorConnection
    local function attachAnimator(animator)
        if animatorConnection or not animator or not animator:IsA("Animator") then return end
        animatorConnection = animator.AnimationPlayed:Connect(function(track)
            react(model, track)
        end)
        list[#list + 1] = animatorConnection
    end

    attachAnimator(humanoid:FindFirstChildOfClass("Animator"))
    list[#list + 1] = humanoid.ChildAdded:Connect(function(child)
        if child:IsA("Animator") then attachAnimator(child) end
    end)
    list[#list + 1] = model.AncestryChanged:Connect(function(_, parent)
        if not parent then unwatch(model) end
    end)
end

local function refreshTargets()
    local folder = workspace:FindFirstChild("Humanoids")
    if folder then
        for _, model in ipairs(folder:GetChildren()) do
            if model:IsA("Model") then watchModel(model) end
        end
    end

    if type(State.NPCRegistry) == "table" then
        for model in pairs(State.NPCRegistry) do
            if typeof(model) == "Instance" and model:IsA("Model") then
                watchModel(model)
            end
        end
    end

    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and player.Character then
            watchModel(player.Character)
        end
    end
end

local humanoids = workspace:FindFirstChild("Humanoids")
if humanoids then
    on(humanoids.ChildAdded:Connect(function(child)
        task.defer(function()
            if Ops.alive then watchModel(child) end
        end)
    end))
end

on(workspace.ChildAdded:Connect(function(child)
    if child.Name == "Humanoids" then
        on(child.ChildAdded:Connect(function(model)
            task.defer(function()
                if Ops.alive then watchModel(model) end
            end)
        end))
    end
end))

local function watchPlayer(player)
    if player == LocalPlayer then return end
    if player.Character then watchModel(player.Character) end
    on(player.CharacterAdded:Connect(function(character)
        task.defer(function()
            if Ops.alive then watchModel(character) end
        end)
    end))
end

for _, player in ipairs(Players:GetPlayers()) do watchPlayer(player) end
on(Players.PlayerAdded:Connect(watchPlayer))

on(LocalPlayer.CharacterAdded:Connect(function()
    Ops.ownBlocking = false
    Ops.releaseAt = 0
    Ops.lastParry = -math.huge
end))

task.spawn(function()
    while Ops.alive and not State.Destroyed do
        refreshTargets()
        task.wait(1.25)
    end
end)

-- Native UI control. BlackLight V18 restyles the existing row automatically.
task.spawn(function()
    local gui
    local pg = LocalPlayer:WaitForChild("PlayerGui")
    for _ = 1, 200 do
        if not Ops.alive then return end
        gui = pg:FindFirstChild("A7DEV_ProjectSlayer2")
        if gui and State.Runtime and type(State.Runtime.addToggle) == "function" then break end
        task.wait(.05)
    end
    if not gui or not Ops.alive then return end

    local existing = State.Runtime.ToggleControls
        and State.Runtime.ToggleControls["Auto Parry"]
    if existing then return end

    local section = gui:FindFirstChild("Section_Defense", true)

    if not section and type(State.Runtime.createSection) == "function" then
        local page = gui:FindFirstChild("Page_PLAYER", true)
        if page then
            local columns = {}
            for _, child in ipairs(page:GetChildren()) do
                if child:IsA("ScrollingFrame") then columns[#columns + 1] = child end
            end
            table.sort(columns, function(a, b)
                return a.AbsolutePosition.X < b.AbsolutePosition.X
            end)
            local column = columns[2] or columns[1]
            if column then
                section = State.Runtime.createSection(column, "Defense")
            end
        end
    end

    if not section then
        warn("[A7DEV] Auto Parry: Defense section unavailable.")
        return
    end

    State.Runtime.addToggle(section, "Auto Parry", State.Flags.AutoParry, function(value)
        State.Flags.AutoParry = value == true
        if not State.Flags.AutoParry then
            releaseOwnedBlock()
        else
            refreshNative(true)
            refreshTargets()
        end
    end)
end)

print("[A7DEV] Auto Parry V1 loaded.")
