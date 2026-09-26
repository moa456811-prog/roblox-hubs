-- A7DEV Project Slayer 2 | TEST CORE REPAIR V2
-- Test branch only. Does not modify the public loader/backend.
-- UI is intentionally untouched; this file only repairs runtime/gameplay behavior.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if type(ENV.A7DEV_PS2_TEST_CORE_STOP) == "function" then
    pcall(ENV.A7DEV_PS2_TEST_CORE_STOP)
end

local R = {
    alive = true,
    conns = {},
    cleanups = {},
    errors = {},
    recoveries = {
        farm = 0,
        boss = 0,
        sell = 0,
        underwater = 0,
    },
    farmNoTargetSince = nil,
    lastFarmRecovery = -math.huge,
    bossNoTargetSince = nil,
    lastBossRecovery = -math.huge,
    lastBossStream = -math.huge,
    previousBoss = false,
    previousDungeon = false,
    trainingTween = nil,
}
ENV.A7DEV_PS2_TEST_CORE = R

local function track(connection)
    if connection then
        R.conns[#R.conns + 1] = connection
    end
    return connection
end

local function cleanup(fn)
    if type(fn) == "function" then
        R.cleanups[#R.cleanups + 1] = fn
    end
    return fn
end

local function stop()
    if not R.alive then return end
    R.alive = false

    if R.trainingTween then
        pcall(function() R.trainingTween:Cancel() end)
        R.trainingTween = nil
    end

    for _, fn in ipairs(R.cleanups) do
        pcall(fn)
    end
    table.clear(R.cleanups)

    for _, connection in ipairs(R.conns) do
        pcall(function() connection:Disconnect() end)
    end
    table.clear(R.conns)

    ENV.A7DEV_PS2_TEST_CORE_STOP = nil
end
ENV.A7DEV_PS2_TEST_CORE_STOP = stop

local function low(value)
    return string.lower(tostring(value or ""))
end

local function safe(tag, fn, ...)
    if type(fn) ~= "function" then
        return false, nil
    end
    local ok, a, b, c, d = pcall(fn, ...)
    if not ok then
        R.errors[tag] = tostring(a)
        warn("[A7DEV TEST CORE] " .. tostring(tag) .. ": " .. tostring(a))
        return false, nil
    end
    return true, a, b, c, d
end

local State
for _ = 1, 400 do
    if not R.alive then return end
    State = ENV.A7DEV_PROJECT_SLAYER_2
    if State and type(State) == "table" then break end
    task.wait(.05)
end

if not State or type(State) ~= "table" then
    warn("[A7DEV TEST CORE] State not found.")
    stop()
    return
end

State.Flags = State.Flags or {}
State.Runtime = State.Runtime or {}
State.A7DEVTestCore = R

local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui
for _ = 1, 300 do
    if not R.alive then return end
    gui = PlayerGui:FindFirstChild("A7DEV_ProjectSlayer2")
    if gui then break end
    task.wait(.05)
end

local function humanoidOf(model)
    return model and model:FindFirstChildOfClass("Humanoid")
end

local function rootOf(model)
    if not model then return nil end
    if model:IsA("BasePart") then return model end
    if model:IsA("Model") then
        local hum = humanoidOf(model)
        return (hum and hum.RootPart)
            or model:FindFirstChild("HumanoidRootPart")
            or model.PrimaryPart
            or model:FindFirstChildWhichIsA("BasePart", true)
    end
    return model:FindFirstChildWhichIsA("BasePart", true)
end

local function aliveModel(model)
    if not model or not model.Parent or not model:IsA("Model") then return false end
    local hum = humanoidOf(model)
    return hum ~= nil and hum.Health > 0
end

local function livingCharacter()
    local character = LocalPlayer.Character
    local hum = character and humanoidOf(character)
    local root = character and rootOf(character)
    if not character or not hum or hum.Health <= 0 or not root then
        return nil, nil, nil
    end
    return character, hum, root
end

local function objectPosition(object)
    local root = rootOf(object)
    return root and root.Position or nil
end

local function isWorkspaceDescendant(object)
    if not object or not object.Parent then return false end
    local ok, result = pcall(object.IsDescendantOf, object, workspace)
    return ok and result == true
end

local function setControl(label, value)
    value = value == true
    local controls = State.Runtime and State.Runtime.ToggleControls
    local control = type(controls) == "table" and controls[label] or nil

    if control and type(control.Set) == "function" then
        local ok, current = pcall(function()
            return type(control.Get) == "function" and control.Get() or nil
        end)
        if not ok or current ~= value then
            pcall(control.Set, value)
        end
        return true
    end
    return false
end

local function statusText()
    local text = tostring(State.Status or "")
    local label = State.StatusLabel
    if label and label.Parent and label:IsA("TextLabel") then
        local current = tostring(label.Text or "")
        if current ~= "" then text = text .. " " .. current end
    end
    return low(text)
end

local function highPriorityRoute()
    local f = State.Flags
    return f.AutoBoss == true
        or f.AutoAllBoss == true
        or f.AutoDungeon == true
        or f.AutoDungeonClear == true
        or f.AutoYeti == true
        or f.AutoHeartYeti == true
        or f.AutoFarmPlayers == true
        or f.AutoFishingReel == true
        or f.AutoMuzanQuest == true
        or f.AutoCrowQuest == true
        or f.AutoTrainingQuests == true
end

-- ============================================================================
-- NATIVE GAME BRIDGE
-- ============================================================================

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
    local subsets = Global and Global:FindFirstChild("Subsets")
    local gameplay = subsets and subsets:FindFirstChild("Gameplay")
    local comm = ReplicatedStorage:FindFirstChild("Communication")
    local sc = comm and comm:FindFirstChild("ServerAndClient")
    local signals = sc and sc:FindFirstChild("Signals")

    Native.Utility = Global and requireSafe(Global:FindFirstChild("Utility"))
    Native.Quests = gameplay and requireSafe(gameplay:FindFirstChild("Quests"))
    Native.SignalFunction = signals and requireSafe(signals:FindFirstChild("SignalFunction"))
    Native.SignalEvent = signals and requireSafe(signals:FindFirstChild("SignalEvent"))
    Native.ready = true
end

local function playerData()
    refreshNative()
    if Native.Utility and type(Native.Utility.GetData) == "function" then
        local ok, value = pcall(Native.Utility.GetData, LocalPlayer)
        if ok then return value end
    end
end

local function inventoryFolder()
    local data = playerData()
    local inventory = data and data:FindFirstChild("Inventory")
    return inventory and inventory:FindFirstChild("Inventory")
end

local function itemAmount(name)
    local inv = inventoryFolder()
    if not inv then return 0 end

    local total = 0
    for _, item in ipairs(inv:GetChildren()) do
        if low(item.Name) == low(name) then
            local amount = item:FindFirstChild("Amount")
            total += math.max(1, math.floor(tonumber(amount and amount.Value) or 1))
        end
    end
    return total
end

local function nativeFunction(...)
    refreshNative()
    if not Native.SignalFunction or type(Native.SignalFunction.ToServer) ~= "function" then
        refreshNative(true)
    end
    if Native.SignalFunction and type(Native.SignalFunction.ToServer) == "function" then
        return pcall(Native.SignalFunction.ToServer, ...)
    end
    return false, nil
end

-- ============================================================================
-- DEFAULTS / NON-REGRESSION
-- ============================================================================

local function applySafeDefaults()
    local f = State.Flags

    -- These were explicitly requested as normal defaults.
    f.AutoSkills = true
    f.AutoLootDrops = true
    f.AutoChestLoot = true
    f.ChestInterruptFarm = true
    f.AutoFarmQuest = true
    f.StrictFarmQuest = true
    f.AutoQuestProgression = true

    -- The validated farm position is Behind. Do not reintroduce Under.
    if State.FarmStyle == nil or State.FarmStyle == "Under" then
        State.FarmStyle = "Behind"
    end

    if State.SellKeepAmount == nil then
        State.SellKeepAmount = 1
    else
        State.SellKeepAmount = math.max(0, math.floor(tonumber(State.SellKeepAmount) or 1))
    end

    -- Auto Sell itself must remain internal. Seller-unlock travel is a separate,
    -- explicit opt-in and is not enabled automatically.
    f.AutoSellUnlock = false

    task.defer(function()
        if not R.alive then return end
        setControl("Auto Skills", true)
        setControl("Auto Loot Drops", true)
        setControl("Auto Chest Loot", true)
        setControl("Allow loot/chest route to interrupt farm", true)
        setControl("Auto Unlock Ginzo", false)
    end)
end

applySafeDefaults()

-- ============================================================================
-- AUTO SELL: CONFIRM SERVER RESULT / NO IMPLICIT SELLER TRAVEL
-- ============================================================================

local function installSellRepair()
    local ops = State.SellOps
    if type(ops) ~= "table" or ops.A7DEV_TEST_REPAIR then return false end
    if type(ops.selection) ~= "function" or type(ops.sellerState) ~= "function" then return false end

    ops.A7DEV_TEST_REPAIR = true
    ops.A7DEV_TEST_ORIGINAL_SELL = ops.sell

    ops.sell = function()
        if ops.Busy then return false end

        local okState, sellerState = pcall(ops.sellerState)
        if not okState or tostring(sellerState) ~= "Done" then
            State.SellStatus = "Seller locked | Auto Sell stays internal"
            return false
        end

        local okSelection, selected, count, requestedUnits = pcall(ops.selection)
        if not okSelection or type(selected) ~= "table" then
            State.SellStatus = "Unable to read sell selection"
            return false
        end
        if (tonumber(count) or 0) < 1 then
            State.SellStatus = "No selected sellable items"
            return false
        end

        local before = {}
        for name in pairs(selected) do
            before[name] = itemAmount(name)
        end

        ops.Busy = true
        local ok, result = nativeFunction("SellItems", selected)
        ops.Busy = false
        ops.Last = os.clock()

        local nativeConfirmed = ok and type(result) == "table" and next(result) ~= nil
        local removed = 0

        local deadline = os.clock() + 0.8
        repeat
            removed = 0
            for name, oldAmount in pairs(before) do
                removed += math.max(0, oldAmount - itemAmount(name))
            end
            if removed > 0 then break end
            if nativeConfirmed then break end
            task.wait(.10)
        until os.clock() >= deadline

        if nativeConfirmed or removed > 0 then
            R.recoveries.sell += 1
            local actual = removed > 0 and removed or (tonumber(requestedUnits) or 0)
            State.SellStatus = actual > 0 and ("Sold " .. tostring(actual) .. " item(s)") or "Sale accepted"
            return true
        end

        State.SellStatus = "Sale not confirmed | no teleport used"
        return false
    end

    return true
end

-- ============================================================================
-- AUTO SKILLS: KEEP DEFAULT ON, BUT NEVER CAST AT IDLE
-- ============================================================================

local function installSkillGuard()
    local exports = State.A7DEVExports
    if type(exports) ~= "table" or exports.A7DEV_TEST_SKILL_GUARD then return false end
    exports.A7DEV_TEST_SKILL_GUARD = true

    local function combatReady()
        local f = State.Flags
        if f.AutoSkills ~= true or f.AutoAttack == false then return false end

        if type(State.Runtime.skillCombatActive) == "function" then
            local ok, active = pcall(State.Runtime.skillCombatActive)
            if ok then return active == true end
        end

        local activeAutomation = f.AutoFarm == true
            or f.AutoBoss == true
            or f.AutoDungeon == true
            or f.AutoYeti == true
            or f.AutoHeartYeti == true
            or f.AutoFarmPlayers == true
            or State.MuzanPriorityActive == true
            or State.CrowPriorityActive == true
            or State.TrainingPriorityActive == true
        if not activeAutomation then return false end

        local target = State.CurrentTarget
            or State.FarmPlanTarget
            or State.CurrentBoss
            or (type(State.YetiOps) == "table" and State.YetiOps.lastTarget)
        if not aliveModel(target) then return false end

        local _, hum = livingCharacter()
        return hum ~= nil and hum.Health > 0
    end

    for _, key in ipairs({"autoSkillTick", "skillWarmup"}) do
        local original = exports[key]
        if type(original) == "function" then
            exports["A7DEV_TEST_ORIGINAL_" .. key] = original
            exports[key] = function(...)
                if not combatReady() then return false end
                return original(...)
            end
        end
    end

    return true
end

-- ============================================================================
-- FARM RECOVERY: NO MORE PERMANENT "SCANNING TARGETS" DEADLOCK
-- ============================================================================

local function recoverFarm(now)
    local f = State.Flags
    if f.AutoFarm ~= true or highPriorityRoute() then
        R.farmNoTargetSince = nil
        return
    end

    local target = State.FarmPlanTarget
    if not aliveModel(target) then target = State.CurrentTarget end

    if aliveModel(target) then
        R.farmNoTargetSince = nil
        return
    end

    local text = statusText()
    local looksStuck = string.find(text, "scanning target", 1, true)
        or string.find(text, "finding target", 1, true)
        or string.find(text, "no target", 1, true)

    R.farmNoTargetSince = R.farmNoTargetSince or now

    if not looksStuck and now - R.farmNoTargetSince < 6 then
        return
    end
    if now - R.farmNoTargetSince < 3.5 then return end
    if now - R.lastFarmRecovery < 4 then return end

    R.lastFarmRecovery = now
    R.recoveries.farm += 1

    if State.CurrentTarget and not aliveModel(State.CurrentTarget) then
        State.CurrentTarget = nil
    end
    if State.FarmPlanTarget and not aliveModel(State.FarmPlanTarget) then
        State.FarmPlanTarget = nil
    end

    State.FarmPlanSource = nil
    State.FarmPlannerForce = true
    State.FarmPlannerLastTick = 0
    State.SmartFarmLastFallbackAttack = 0
    State.SmartFarmLastReposition = 0

    if type(State.Runtime.mainHeartbeat) == "function" then
        safe("Farm recovery heartbeat", State.Runtime.mainHeartbeat)
    end

    R.farmNoTargetSince = now
end

-- ============================================================================
-- BOSS RECOVERY: KEEP LIVE LOCK, RECOVER SCAN ONLY WHEN NO LOCK EXISTS
-- ============================================================================

local function bossTarget()
    local locked = State.BossLock
    if aliveModel(locked) then return locked end
    local current = State.CurrentBoss
    if aliveModel(current) then return current end
    return locked or current
end

local function recoverBoss(now)
    local f = State.Flags
    local enabled = f.AutoBoss == true or f.AutoAllBoss == true
    if not enabled then
        R.bossNoTargetSince = nil
        return
    end

    f.AutoAttack = true
    f.AutoEquip = true
    f.FarmNoclip = true

    local boss = bossTarget()
    local hum = humanoidOf(boss)

    if boss and hum and hum.Health > 0 then
        local position = objectPosition(boss)
        if position then State.BossLastPosition = position end

        if isWorkspaceDescendant(boss) then
            R.bossNoTargetSince = nil
            return
        end

        -- Streaming disappearance is not a death. Keep the lock and request
        -- the last known area instead of selecting another boss.
        if State.BossLastPosition and now - R.lastBossStream >= 2 then
            R.lastBossStream = now
            task.spawn(function()
                pcall(LocalPlayer.RequestStreamAroundAsync, LocalPlayer, State.BossLastPosition, 0.35)
            end)
        end
        return
    end

    -- Health == 0 is a confirmed local death signal. Let the existing base
    -- perform its configured loot delay / defeated transition.
    if boss and hum and hum.Health <= 0 then
        R.bossNoTargetSince = nil
        return
    end

    if R.bossTimerUntil and now < R.bossTimerUntil then
        local remaining = math.max(0, math.ceil(R.bossTimerUntil - now))
        State.BossStatus = string.format("Respawn in %d:%02d", math.floor(remaining / 60), remaining % 60)
        R.bossNoTargetSince = now
        return
    end

    R.bossNoTargetSince = R.bossNoTargetSince or now
    if now - R.bossNoTargetSince < 3.5 then return end
    if now - R.lastBossRecovery < 8 then return end
    R.lastBossRecovery = now

    local ops = State.BossOps
    if type(ops) ~= "table" then return end

    local acquired
    if type(ops.acquire) == "function" then
        local ok, value = pcall(ops.acquire, false)
        if ok and aliveModel(value) then acquired = value end
    end
    if acquired then
        R.bossNoTargetSince = nil
        return
    end

    -- Never start another scan while the native scanner is already busy.
    if State.BossFullScanRunning == true or State.BossStreamBusy == true then
        return
    end

    R.recoveries.boss += 1
    if type(ops.fullMapScan) == "function" then
        safe("Boss full-map recovery", ops.fullMapScan, false)
    end

    task.delay(.45, function()
        if not R.alive or not State.Flags.AutoBoss then return end
        if aliveModel(State.BossLock) or aliveModel(State.CurrentBoss) then return end
        if type(ops.acquire) == "function" then
            safe("Boss reacquire", ops.acquire, true)
        end
    end)

    R.bossNoTargetSince = now
end

-- ============================================================================
-- ROUTE OWNERSHIP: LAST EXPLICIT BOSS/DUNGEON ACTIVATION WINS
-- ============================================================================

local function stopDungeonHover()
    local h = R.dungeonHover
    if not h then return end

    for _, key in ipairs({"position", "orientation", "attachment"}) do
        local object = h[key]
        h[key] = nil
        if object then pcall(function() object:Destroy() end) end
    end

    if h.humanoid and h.humanoid.Parent and h.autoRotate ~= nil then
        pcall(function() h.humanoid.AutoRotate = h.autoRotate end)
    end

    h.root = nil
    h.humanoid = nil
    h.target = nil
    h.approach = nil
    h.lastTouch = nil
end

local function coordinateExclusiveRoutes()
    local f = State.Flags
    local boss = f.AutoBoss == true
    local dungeon = f.AutoDungeon == true or f.AutoDungeonClear == true

    if boss and not R.previousBoss then
        if f.AutoDungeon == true then
            f.AutoDungeon = false
            setControl("Auto Dungeon", false)
        end
        if f.AutoDungeonClear == true then
            f.AutoDungeonClear = false
            setControl("Dungeon Auto Clear", false)
            setControl("Auto Clear Dungeon", false)
        end
        State.DungeonCombatTarget = nil
        State.DungeonAutoClearTarget = nil
        stopDungeonHover()
    elseif dungeon and not R.previousDungeon then
        if f.AutoBoss == true then
            f.AutoBoss = false
            setControl("Auto Boss", false)
        end
        State.BossWaiting = false
        State.FarmPlanTarget = nil
        State.FarmPlanSource = nil
    end

    R.previousBoss = f.AutoBoss == true
    R.previousDungeon = f.AutoDungeon == true or f.AutoDungeonClear == true
end

-- ============================================================================
-- DUNGEON COMBAT POSITION: 7 STUDS ABOVE, CLOSE HORIZONTAL OFFSET, LIVE AIM
-- No target hitbox enlargement and no M1 gate.
-- ============================================================================

R.dungeonHover = {}

local function dungeonInRun()
    local ops = State.DungeonOps
    if type(ops) == "table" and type(ops.inRun) == "function" then
        local ok, value = pcall(ops.inRun)
        if ok then return value == true end
    end
    return workspace:GetAttribute("MinigameKey") == "Ouwigahara"
end

local function dungeonHoverEnabled()
    local f = State.Flags
    return not State.Destroyed
        and f.AutoBoss ~= true
        and f.Fly ~= true
        and (f.AutoDungeon == true or f.AutoDungeonClear == true or f.DungeonKillAura == true)
        and dungeonInRun()
end

local function ensureDungeonConstraint(root, hum)
    local h = R.dungeonHover
    if h.root == root
        and h.position and h.position.Parent
        and h.orientation and h.orientation.Parent
        and h.attachment and h.attachment.Parent then
        return true
    end

    stopDungeonHover()

    h.root = root
    h.humanoid = hum
    h.autoRotate = hum.AutoRotate

    local attachment = Instance.new("Attachment")
    attachment.Name = "A7DEV_TEST_DungeonHoverAttachment"
    attachment.Parent = root
    h.attachment = attachment

    local position = Instance.new("AlignPosition")
    position.Name = "A7DEV_TEST_DungeonHoverPosition"
    position.Mode = Enum.PositionAlignmentMode.OneAttachment
    position.Attachment0 = attachment
    position.ApplyAtCenterOfMass = true
    position.RigidityEnabled = false
    position.ReactionForceEnabled = false
    position.MaxVelocity = 45
    position.Responsiveness = 65
    position.MaxForce = math.max(10000, root.AssemblyMass * (workspace.Gravity + 500) * 10)
    position.Position = root.Position
    position.Parent = root
    h.position = position

    local orientation = Instance.new("AlignOrientation")
    orientation.Name = "A7DEV_TEST_DungeonHoverOrientation"
    orientation.Mode = Enum.OrientationAlignmentMode.OneAttachment
    orientation.Attachment0 = attachment
    orientation.RigidityEnabled = false
    orientation.MaxTorque = 1000000
    orientation.MaxAngularVelocity = 20
    orientation.Responsiveness = 45
    orientation.CFrame = root.CFrame
    orientation.Parent = root
    h.orientation = orientation

    hum.AutoRotate = false
    return true
end

local function updateDungeonHover(now)
    if not dungeonHoverEnabled() then
        if R.dungeonHover.root then stopDungeonHover() end
        return
    end

    local character, hum, root = livingCharacter()
    if not character then
        stopDungeonHover()
        return
    end

    local target = State.DungeonCombatTarget
    if not aliveModel(target) then target = State.CurrentTarget end
    if not aliveModel(target) or Players:GetPlayerFromCharacter(target) then
        stopDungeonHover()
        return
    end

    local targetRoot = rootOf(target)
    if not targetRoot then
        stopDungeonHover()
        return
    end

    if not ensureDungeonConstraint(root, hum) then return end

    local h = R.dungeonHover
    local changed = h.target ~= target

    if changed or not h.approach then
        local flat = (root.Position - targetRoot.Position) * Vector3.new(1, 0, 1)
        if flat.Magnitude < 0.1 then
            flat = targetRoot.CFrame.LookVector * Vector3.new(-1, 0, -1)
        end
        if flat.Magnitude < 0.1 then flat = Vector3.new(0, 0, 1) end
        h.approach = flat.Unit
    end

    h.target = target
    h.lastTouch = now

    if not changed and now < (h.nextUpdate or 0) then return end
    h.nextUpdate = now + 0.08

    local goal = targetRoot.Position
        + Vector3.new(0, 7, 0)
        + h.approach * 0.5
    local aimPoint = targetRoot.Position + Vector3.new(0, 1.5, 0)

    h.position.MaxForce = math.max(10000, root.AssemblyMass * (workspace.Gravity + 500) * 10)
    h.position.Position = goal

    if (root.Position - aimPoint).Magnitude > 0.1 then
        h.orientation.CFrame = CFrame.lookAt(root.Position, aimPoint)
    else
        h.orientation.CFrame = CFrame.lookAt(goal, aimPoint)
    end

    -- One entry correction only. Afterwards the constraint follows the same mob.
    if changed and (root.Position - goal).Magnitude > 12 then
        root.AssemblyLinearVelocity = Vector3.zero
        root.AssemblyAngularVelocity = Vector3.zero
        root.CFrame = CFrame.lookAt(goal, aimPoint)
    end
end

track(RunService.Heartbeat:Connect(function()
    if not R.alive then return end
    updateDungeonHover(os.clock())
end))

track(LocalPlayer.CharacterAdded:Connect(function()
    stopDungeonHover()
    R.farmNoTargetSince = nil
    R.bossNoTargetSince = nil
end))

cleanup(stopDungeonHover)

-- ============================================================================
-- UNDERWATER ROCKS: CONFIRM PickedN, REBUILD NATIVE CLIENT QUEST PROPS IF NEEDED
-- ============================================================================

local Underwater = {
    questName = nil,
    taskObject = nil,
    bundle = nil,
    pending = nil,
    attempts = {},
    restores = 0,
    nextRestore = 0,
    lastStepAt = 0,
}
R.underwater = Underwater

local function clearUnderwaterBundle()
    local bundle = Underwater.bundle
    Underwater.bundle = nil
    if bundle and bundle.clean then
        pcall(function() bundle.clean:Destroy() end)
    end
end
cleanup(clearUnderwaterBundle)

local function activeUnderwaterTask()
    refreshNative()
    local data = playerData()
    local quests = data and data:FindFirstChild("Quests")
    local holder = quests and quests:FindFirstChild("Holder")
    if not holder then return nil end

    for _, quest in ipairs(holder:GetChildren()) do
        local taskFolder = quest:FindFirstChild("Tasks")
        local taskObject = taskFolder and taskFolder:FindFirstChild("Underwater Rocks")
        if taskObject then
            local value = taskObject:FindFirstChild("Value")
            local max = taskObject:FindFirstChild("Max")
            if value and max and tonumber(value.Value) and tonumber(max.Value)
                and tonumber(value.Value) < tonumber(max.Value) then
                local questString = quest:FindFirstChild("QuestString")
                local questName = (questString and tostring(questString.Value) ~= "" and tostring(questString.Value))
                    or tostring(quest.Name)
                return questName, quest, taskObject
            end
        end
    end
end

local function promptPosition(prompt)
    if not prompt or not prompt.Parent then return nil end
    local parent = prompt.Parent
    if parent:IsA("BasePart") then return parent.Position end
    local part = parent:FindFirstChildWhichIsA("BasePart", true)
    if not part then
        local model = parent:FindFirstAncestorOfClass("Model")
        part = model and rootOf(model)
    end
    return part and part.Position or nil
end

local function crystalPrompt(index)
    local expected = "Sea Crystal" .. tostring(index)
    local found

    local function inspect(object)
        if object.Name ~= expected then return end
        local prompt = object:FindFirstChildWhichIsA("ProximityPrompt", true)
        if not prompt or not prompt.Enabled or not promptPosition(prompt) then return end
        if found and found ~= prompt then
            found = false -- ambiguous duplicate from another quest
            return
        end
        found = prompt
    end

    if Underwater.bundle then
        for object in pairs(Underwater.bundle.objects) do
            if object and object.Parent then inspect(object) end
            if found == false then return nil end
        end
        if found then return found end
    end

    found = nil
    for _, object in ipairs(workspace:GetChildren()) do
        inspect(object)
        if found == false then return nil end
    end
    return found or nil
end

local function restoreUnderwaterProps(questName, taskObject)
    if Underwater.restores >= 3 or os.clock() < Underwater.nextRestore then
        return false
    end

    Underwater.restores += 1
    Underwater.nextRestore = os.clock() + 8

    local questStates = ReplicatedStorage:FindFirstChild("QuestStates")
    local module = questStates and questStates:FindFirstChild(questName)
    local packages = ReplicatedStorage:FindFirstChild("Packages")
    local cleanupModule = packages and packages:FindFirstChild("cleanit")
    if not module or not module:IsA("ModuleScript") or not cleanupModule then
        return false
    end

    local okState, stateModule = pcall(require, module)
    local okClean, cleanit = pcall(require, cleanupModule)
    if not okState or not okClean
        or type(stateModule) ~= "table"
        or type(stateModule.Tasks) ~= "table"
        or type(cleanit) ~= "table"
        or type(cleanit.new) ~= "function" then
        return false
    end

    local taskState = stateModule.Tasks[taskObject.Name]
    if type(taskState) ~= "table" or type(taskState.Do) ~= "function" then
        return false
    end

    clearUnderwaterBundle()

    local bundle = {
        clean = cleanit.new(),
        objects = setmetatable({}, {__mode = "k"}),
        questName = questName,
        taskObject = taskObject,
    }
    Underwater.bundle = bundle

    local bag = {}

    function bag:Add(object, ...)
        if Underwater.bundle ~= bundle then
            if typeof(object) == "Instance" then pcall(function() object:Destroy() end) end
            return object
        end
        if typeof(object) == "Instance" then bundle.objects[object] = true end
        return bundle.clean:Add(object, ...)
    end

    function bag:Remove(object, ...)
        bundle.objects[object] = nil
        return bundle.clean:Remove(object, ...)
    end

    local started, err = pcall(taskState.Do, LocalPlayer, taskObject, bag)
    if not started then
        R.errors["Underwater restore"] = tostring(err)
        clearUnderwaterBundle()
        return false
    end

    R.recoveries.underwater += 1
    return true
end

local function moveTrainingNear(position, tolerance)
    local _, hum, root = livingCharacter()
    if not root or typeof(position) ~= "Vector3" then return false end
    tolerance = tonumber(tolerance) or 2.5
    local distance = (root.Position - position).Magnitude
    if distance <= tolerance then
        if R.trainingTween then
            pcall(function() R.trainingTween:Cancel() end)
            R.trainingTween = nil
        end
        return true
    end

    if R.trainingTween then
        pcall(function() R.trainingTween:Cancel() end)
    end
    R.trainingTween = TweenService:Create(
        root,
        TweenInfo.new(math.clamp(distance / 40, .08, 6), Enum.EasingStyle.Linear),
        {CFrame = CFrame.new(position + Vector3.new(0, 1.5, 0))}
    )
    R.trainingTween:Play()
    return false
end

local function triggerCrystal(prompt)
    if not prompt or not prompt.Parent or not prompt.Enabled then return false end
    local position = promptPosition(prompt)
    local _, _, root = livingCharacter()
    if not position or not root then return false end

    local reach = tonumber(prompt.MaxActivationDistance) or 8
    if (root.Position - position).Magnitude > reach then return false end

    local triggered = false
    local connection
    pcall(function()
        connection = prompt.Triggered:Connect(function()
            triggered = true
        end)
    end)

    local ok = pcall(function()
        prompt:InputHoldBegin()
        local finish = os.clock() + math.max(.12, (tonumber(prompt.HoldDuration) or 0) + .1)
        while os.clock() < finish and not triggered and prompt.Parent and prompt.Enabled do
            task.wait(.03)
        end
        prompt:InputHoldEnd()
    end)

    if connection then pcall(function() connection:Disconnect() end) end

    if not ok and type(fireproximityprompt) == "function" then
        ok = pcall(fireproximityprompt, prompt)
    end

    return ok
end

local function underwaterTick(now)
    if State.Flags.AutoTrainingQuests ~= true then
        Underwater.questName = nil
        Underwater.taskObject = nil
        Underwater.pending = nil
        Underwater.attempts = {}
        Underwater.restores = 0
        clearUnderwaterBundle()
        return
    end

    local questName, _, taskObject = activeUnderwaterTask()
    if not questName or not taskObject then
        if Underwater.taskObject then
            clearUnderwaterBundle()
            Underwater.pending = nil
            Underwater.attempts = {}
            Underwater.restores = 0
        end
        Underwater.questName = nil
        Underwater.taskObject = nil
        return
    end

    if Underwater.questName ~= questName or Underwater.taskObject ~= taskObject then
        clearUnderwaterBundle()
        Underwater.questName = questName
        Underwater.taskObject = taskObject
        Underwater.pending = nil
        Underwater.attempts = {}
        Underwater.restores = 0
        Underwater.nextRestore = 0
    end

    State.TrainingPriorityActive = true

    if Underwater.pending then
        local pending = Underwater.pending
        if taskObject:GetAttribute("Picked" .. tostring(pending.index)) == true then
            Underwater.pending = nil
            Underwater.attempts[pending.index] = nil
        elseif now < pending.untilAt then
            return
        else
            Underwater.pending = nil
        end
    end

    local index
    for i = 1, 5 do
        if taskObject:GetAttribute("Picked" .. tostring(i)) ~= true then
            index = i
            break
        end
    end
    if not index then return end

    local prompt = crystalPrompt(index)
    if not prompt then
        restoreUnderwaterProps(questName, taskObject)
        return
    end

    local position = promptPosition(prompt)
    if not position then return end
    local reach = tonumber(prompt.MaxActivationDistance) or 8
    local tolerance = math.max(.8, math.min(2.5, reach * .5))
    if not moveTrainingNear(position, tolerance) then return end

    local attempts = Underwater.attempts[index] or {count = 0, nextAt = 0}
    if now < attempts.nextAt then return end
    if attempts.count >= 6 then
        State.TrainingStatus = "Underwater Rocks | pickup not confirmed"
        return
    end

    attempts.count += 1
    attempts.nextAt = now + 3.5
    Underwater.attempts[index] = attempts
    Underwater.pending = {index = index, untilAt = now + 3.5}
    triggerCrystal(prompt)
end

task.spawn(function()
    while R.alive and not State.Destroyed do
        task.wait(.18)
        if State.Flags.AutoTrainingQuests == true then
            safe("Underwater Rocks", underwaterTick, os.clock())
        elseif Underwater.taskObject then
            safe("Underwater cleanup", underwaterTick, os.clock())
        end
    end
end)

-- ============================================================================
-- DUNGEON UI / CARDS: USE ONLY VISIBLE GAME CONTROLS, NEVER A7DEV UI
-- ============================================================================

local function installDungeonUiRepair()
    local ops = State.DungeonOps
    if type(ops) ~= "table" or ops.A7DEV_TEST_UI_REPAIR then return false end
    ops.A7DEV_TEST_UI_REPAIR = true

    local function trim(value)
        return tostring(value or ""):match("^%s*(.-)%s*$") or ""
    end

    local function splitCSV(value)
        local out = {}
        for token in tostring(value or ""):gmatch("[^,]+") do
            token = low(trim(token))
            if token ~= "" then out[#out + 1] = token end
        end
        return out
    end

    ops.guiVisible = function(object)
        if not object or not object:IsDescendantOf(PlayerGui) then return false end
        local p = object
        while p and p ~= PlayerGui do
            if string.find(low(p.Name), "a7dev", 1, true) then return false end
            if p:IsA("ScreenGui") and p.Enabled == false then return false end
            if p:IsA("GuiObject") and p.Visible == false then return false end
            p = p.Parent
        end
        return p == PlayerGui
    end

    ops.buttonText = function(button, parentDepth)
        local out = {tostring(button and button.Name or "")}
        if button and button:IsA("TextButton") then out[#out + 1] = tostring(button.Text or "") end
        if button then
            for _, child in ipairs(button:GetDescendants()) do
                if child:IsA("TextLabel") and child.Visible then
                    out[#out + 1] = tostring(child.Text or "")
                end
            end
            local p = button.Parent
            for _ = 1, tonumber(parentDepth) or 0 do
                if not p then break end
                out[#out + 1] = tostring(p.Name or "")
                p = p.Parent
            end
        end
        return low(table.concat(out, " "))
    end

    ops.context = function(button)
        local names = {}
        local p = button and button.Parent
        for _ = 1, 5 do
            if not p or p == PlayerGui then break end
            names[#names + 1] = low(p.Name)
            p = p.Parent
        end
        return table.concat(names, " ")
    end

    ops.actionText = function(button)
        if not button then return "" end
        local text = button:IsA("TextButton") and button.Text or ""
        if trim(text) == "" then
            for _, child in ipairs(button:GetDescendants()) do
                if child:IsA("TextLabel") and trim(child.Text) ~= "" then
                    text = child.Text
                    break
                end
            end
        end
        if trim(text) == "" then text = button.Name end
        return trim(low(text):gsub("<[^>]+>", "")):gsub("%s+", " ")
    end

    ops.clickAttempts = setmetatable({}, {__mode = "k"})
    ops.clickButton = function(button)
        if not button or not button:IsA("GuiButton") or not ops.guiVisible(button) then return false end
        if button.AbsoluteSize.X <= 0 or button.AbsoluteSize.Y <= 0 then return false end

        local readable, interactable = pcall(function() return button.Interactable end)
        if readable and interactable == false then return false end

        if type(getconnections) == "function" and type(firesignal) == "function" then
            for _, signal in ipairs({button.Activated, button.MouseButton1Click, button.MouseButton1Down}) do
                local ok, list = pcall(getconnections, signal)
                if ok and type(list) == "table" and #list > 0 then
                    local hasLive = false
                    for _, connection in ipairs(list) do
                        local canRead, enabled = pcall(function() return connection.Enabled end)
                        if not canRead or enabled ~= false then
                            hasLive = true
                            break
                        end
                    end
                    if hasLive and pcall(firesignal, signal) then return true end
                end
            end
        end

        local attempt = (ops.clickAttempts[button] or 0) + 1
        ops.clickAttempts[button] = attempt

        if type(firesignal) == "function" and attempt % 3 ~= 0 then
            local signal = attempt % 3 == 1 and button.Activated or button.MouseButton1Click
            if pcall(firesignal, signal) then return true end
        end

        return pcall(function() button:Activate() end)
    end

    ops.isCardCandidate = function(button)
        local action = ops.actionText(button)
        for _, word in ipairs({"reroll", "buy", "purchase", "robux", "skip", "close", "cancel", "back", "continue"}) do
            if string.find(action, word, 1, true) then return false end
        end

        local context = ops.context(button)
        return string.find(context, "card", 1, true) ~= nil
            or string.find(context, "reward", 1, true) ~= nil
            or string.find(context, "draft", 1, true) ~= nil
    end

    ops.cardPickTick = function()
        if State.Flags.AutoDungeonCards ~= true or not dungeonInRun() then return false end

        local now = os.clock()
        if now - (State.DungeonLastCardPick or 0) < 1 then
            return State.DungeonCardPending ~= nil
        end

        local pending = State.DungeonCardPending
        if pending and (not pending.Parent or not ops.guiVisible(pending)) then
            State.DungeonCardPending = nil
            State.DungeonCardRetries = 0
        end

        local priorities = splitCSV(State.DungeonCardPriority)
        local best, bestText, bestScore

        for _, object in ipairs(PlayerGui:GetDescendants()) do
            if object:IsA("GuiButton") and ops.guiVisible(object) and ops.isCardCandidate(object) then
                local text = ops.buttonText(object, 2)
                local score = 0

                for index, token in ipairs(priorities) do
                    if string.find(text, token, 1, true) then
                        score = 2000 - index * 20
                        break
                    end
                end

                if string.find(text, "supreme", 1, true) then score += 70
                elseif string.find(text, "mythic", 1, true) then score += 60
                elseif string.find(text, "legendary", 1, true) then score += 50
                elseif string.find(text, "rare", 1, true) then score += 30 end

                if not best or score > bestScore then
                    best, bestText, bestScore = object, text, score
                end
            end
        end

        if not best then
            State.DungeonCardPending = nil
            State.DungeonCardRetries = 0
            return false
        end

        local signature = best:GetFullName() .. "|" .. tostring(bestText)
        if signature ~= State.DungeonLastCardSignature or best ~= State.DungeonCardPending then
            State.DungeonCardRetries = 0
        end

        State.DungeonLastCardSignature = signature
        State.DungeonCardPending = best
        State.DungeonLastCardPick = now

        if (State.DungeonCardRetries or 0) >= 3 then
            State.DungeonStatus = "Card selection needs a manual click"
            return true
        end

        State.DungeonCardRetries = (State.DungeonCardRetries or 0) + 1
        ops.clickButton(best)
        State.DungeonStatus = "Ouwigahara | card selection requested"
        return true
    end

    if type(ops.tick) == "function" then
        local originalTick = ops.tick
        ops.A7DEV_TEST_ORIGINAL_TICK = originalTick
        ops.tick = function(...)
            if State.Flags.AutoDungeonClear == true then
                State.Flags.AutoDungeon = true
            end
            if dungeonInRun() and (State.Flags.AutoDungeon == true or State.Flags.AutoDungeonClear == true) then
                State.Flags.AutoAttack = true
                State.Flags.AutoEquip = true
            end
            return originalTick(...)
        end
    end

    return true
end

-- ============================================================================
-- BRING / FREEZE: APPLY ONLY WITH CONFIRMED LOCAL NETWORK OWNERSHIP
-- ============================================================================

local function installFreezeOwnershipRepair()
    local ops = State.MobLockOps
    if type(ops) ~= "table" or ops.A7DEV_TEST_OWNERSHIP_REPAIR then return false end
    ops.A7DEV_TEST_OWNERSHIP_REPAIR = true

    ops.owns = function(root)
        if not root or not root.Parent or not root:IsA("BasePart") then
            return false, "invalid"
        end
        if root.Anchored then return false, "anchored" end

        local fn = ENV.isnetworkowner or isnetworkowner
        if type(fn) ~= "function" then return nil, "unavailable" end

        local ok, owned = pcall(fn, root)
        if not ok or type(owned) ~= "boolean" then
            return nil, "unavailable"
        end
        return owned, owned and "owned" or "not_owned"
    end

    if type(ops.expectedName) == "function" then
        local originalExpectedName = ops.expectedName
        ops.A7DEV_TEST_ORIGINAL_EXPECTED_NAME = originalExpectedName
        ops.expectedName = function(...)
            if dungeonInRun() then return "" end
            return originalExpectedName(...)
        end
    end

    return true
end

-- ============================================================================
-- ROUTE ARBITER: LAST EXPLICIT MOVEMENT MODE WINS
-- ============================================================================

local function setControlAny(labels, value)
    local controls = State.Runtime and State.Runtime.ToggleControls
    if type(controls) ~= "table" then return false end

    for _, wanted in ipairs(labels or {}) do
        local exact = controls[wanted]
        if exact and type(exact.Set) == "function" then
            local current
            if type(exact.Get) == "function" then
                pcall(function() current = exact.Get() end)
            end
            if current ~= value then pcall(exact.Set, value) end
            return true
        end
    end

    for label, control in pairs(controls) do
        local l = low(label)
        for _, wanted in ipairs(labels or {}) do
            if l == low(wanted) and type(control.Set) == "function" then
                local current
                if type(control.Get) == "function" then
                    pcall(function() current = control.Get() end)
                end
                if current ~= value then pcall(control.Set, value) end
                return true
            end
        end
    end

    return false
end

local ROUTE_SPECS = {
    farm = {
        flags = {"AutoFarm"},
        labels = {"Auto Farm"},
        combat = true,
    },
    boss = {
        flags = {"AutoBoss", "AutoAllBoss"},
        labels = {"Auto Boss", "Auto All Boss"},
        combat = true,
    },
    dungeon = {
        flags = {"AutoDungeon", "AutoDungeonClear"},
        labels = {"Auto Dungeon", "Dungeon Auto Clear", "Auto Clear Dungeon"},
        combat = true,
    },
    yeti = {
        flags = {"AutoYeti", "AutoHeartYeti"},
        labels = {"Auto Yeti", "Auto Heart Yeti"},
        combat = true,
    },
    fishing = {
        flags = {"AutoFishingReel"},
        labels = {"Auto Fish", "Auto Fishing", "Auto Fishing Reel"},
        combat = false,
    },
    player = {
        flags = {"AutoFarmPlayers"},
        labels = {"Auto Farm Player", "Player Farm"},
        combat = true,
    },
}

local ROUTE_ORDER = {"farm", "boss", "dungeon", "yeti", "fishing", "player"}
R.routePrev = R.routePrev or {}
R.routeOwner = R.routeOwner or nil

local function routeEnabled(name)
    local spec = ROUTE_SPECS[name]
    if not spec then return false end
    for _, flag in ipairs(spec.flags) do
        if State.Flags[flag] == true then return true end
    end
    return false
end

local function disableRoute(name)
    local spec = ROUTE_SPECS[name]
    if not spec then return end

    for _, flag in ipairs(spec.flags) do
        State.Flags[flag] = false
    end
    for _, label in ipairs(spec.labels) do
        setControlAny({label}, false)
    end

    if name == "boss" then
        State.BossWaiting = false
    elseif name == "dungeon" then
        State.DungeonCombatTarget = nil
        State.DungeonAutoClearTarget = nil
        stopDungeonHover()
    elseif name == "player" and type(State.PlayerOps) == "table" then
        State.PlayerOps.manualHold = false
    end
end

local function claimRoute(name)
    if not ROUTE_SPECS[name] then return end
    R.routeOwner = name

    for _, other in ipairs(ROUTE_ORDER) do
        if other ~= name and routeEnabled(other) then
            disableRoute(other)
        end
    end

    local spec = ROUTE_SPECS[name]
    if spec.combat then
        State.Flags.AutoAttack = true
        State.Flags.AutoEquip = true
        State.Flags.FarmNoclip = true
        setControlAny({"Auto Attack", "Auto Attack (native)"}, true)
        setControlAny({"Auto Equip", "Auto Equip Combat Tool"}, true)
    end

    State.CurrentTarget = nil
    State.FarmPlanTarget = nil
    State.FarmPlanSource = nil
    State.FarmPlannerForce = true
    State.FarmPlannerLastTick = 0
end

local function routeArbiterTick()
    for _, name in ipairs(ROUTE_ORDER) do
        local current = routeEnabled(name)
        local previous = R.routePrev[name]
        if previous == nil then
            R.routePrev[name] = current
        elseif current and not previous then
            claimRoute(name)
            current = routeEnabled(name)
        end
        R.routePrev[name] = current
    end

    if R.routeOwner and not routeEnabled(R.routeOwner) then
        R.routeOwner = nil
    end
end

-- ============================================================================
-- BOSS RESPAWN TIMER: READ THE GAME UI AND AVOID POINTLESS RESCANS
-- ============================================================================

local function visibleGameText(object)
    if not (object:IsA("TextLabel") or object:IsA("TextButton")) then return nil end
    if object.Visible == false then return nil end

    local p = object
    while p and p ~= PlayerGui do
        if string.find(low(p.Name), "a7dev", 1, true) then return nil end
        if p:IsA("ScreenGui") and p.Enabled == false then return nil end
        if p:IsA("GuiObject") and p.Visible == false then return nil end
        p = p.Parent
    end

    local text = tostring(object.Text or "")
    return text ~= "" and text or nil
end

local function timerSeconds(text)
    text = tostring(text or "")
    local minutes, seconds = text:match("(%d+)%s*:%s*(%d%d)")
    if minutes and seconds then
        local m, s = tonumber(minutes), tonumber(seconds)
        if m and s and s < 60 then return m * 60 + s end
    end

    local sec = text:match("(%d+)%s*[Ss][Ee][Cc]")
        or text:match("(%d+)%s*[Ss]")
    sec = tonumber(sec)
    if sec and sec > 0 and sec <= 7200 then return sec end
end

local function selectedBossNames()
    local names = {}
    local seen = {}

    local function add(value)
        local text = tostring(value or "")
        if text == "" then return end
        local key = low(text)
        if not seen[key] then
            seen[key] = true
            names[#names + 1] = text
        end
    end

    if type(State.BossSelectedNames) == "table" then
        for _, name in ipairs(State.BossSelectedNames) do add(name) end
    end
    if State.BossLock then add(State.BossLock.Name) end
    if State.CurrentBoss then add(State.CurrentBoss.Name) end
    return names
end

local function scanBossRespawnTimer(now)
    if not (State.Flags.AutoBoss or State.Flags.AutoAllBoss) then
        R.bossTimerUntil = nil
        return
    end
    if aliveModel(State.BossLock) or aliveModel(State.CurrentBoss) then
        R.bossTimerUntil = nil
        return
    end
    if now < (R.nextBossTimerScan or 0) then return end
    R.nextBossTimerScan = now + 1

    local selected = selectedBossNames()
    if #selected == 0 then return end

    local best
    for _, object in ipairs(PlayerGui:GetDescendants()) do
        local text = visibleGameText(object)
        if text then
            local seconds = timerSeconds(text)
            if seconds then
                local context = low(text)
                local p = object.Parent
                for _ = 1, 3 do
                    if not p or p == PlayerGui then break end
                    for _, child in ipairs(p:GetChildren()) do
                        if child:IsA("TextLabel") or child:IsA("TextButton") then
                            context = context .. " " .. low(child.Text)
                        end
                    end
                    context = context .. " " .. low(p.Name)
                    p = p.Parent
                end

                for _, name in ipairs(selected) do
                    local bossKey = low(name)
                    if bossKey ~= "" and string.find(context, bossKey, 1, true) then
                        if not best or seconds < best then best = seconds end
                        break
                    end
                end
            end
        end
    end

    if best and best > 0 then
        R.bossTimerUntil = now + best
    elseif R.bossTimerUntil and now >= R.bossTimerUntil then
        R.bossTimerUntil = nil
    end
end

-- ============================================================================
-- YETI: STRICT SUMMON PRIORITY + VERIFIED BOSS LOOT WINDOW
-- ============================================================================

local function normalizeName(value)
    return low(value):gsub("[^%w]", "")
end

local function modelAliases(model)
    local out = {model and model.Name or ""}
    if not model then return out end

    for _, key in ipairs({"NpcCode", "NPCCode", "Title", "DisplayName", "EnemyType", "MobType"}) do
        local ok, value = pcall(model.GetAttribute, model, key)
        if ok and value ~= nil then out[#out + 1] = tostring(value) end
    end

    local bossTag = model:FindFirstChild("BossTag", true)
    if bossTag then
        local ok, title = pcall(bossTag.GetAttribute, bossTag, "Title")
        if ok and title ~= nil then out[#out + 1] = tostring(title) end
    end
    return out
end

local function isYetiAdd(model)
    if not aliveModel(model) or Players:GetPlayerFromCharacter(model) then return false end

    local mainBoss = false
    for _, alias in ipairs(modelAliases(model)) do
        local key = normalizeName(alias)
        if string.sub(key, 1, 9) == "smallyeti" or string.sub(key, 1, 8) == "miniyeti" then
            return true
        end
        if key == "yetidemon" or key == "whiteterror" or key == "thewhiteterror" then
            mainBoss = true
        end
    end

    local mark = model:FindFirstChild("SummonMark")
    return not mainBoss and mark ~= nil and mark:IsA("Highlight")
end

local function isYetiFamily(model)
    if not aliveModel(model) or Players:GetPlayerFromCharacter(model) then return false end
    if isYetiAdd(model) then return true end
    for _, alias in ipairs(modelAliases(model)) do
        local key = normalizeName(alias)
        if string.find(key, "yeti", 1, true) or string.find(key, "whiteterror", 1, true) then
            return true
        end
    end
    return false
end

local function nearestModel(list, reference)
    local best, bestDistance
    for _, model in ipairs(list) do
        local position = objectPosition(model)
        if position then
            local distance = reference and (position - reference).Magnitude or 0
            if not bestDistance or distance < bestDistance then
                best, bestDistance = model, distance
            end
        end
    end
    return best
end

local function installYetiPriorityRepair()
    local ops = State.YetiOps
    if type(ops) ~= "table" or ops.A7DEV_TEST_PRIORITY_REPAIR then return false end
    ops.A7DEV_TEST_PRIORITY_REPAIR = true

    if type(ops.findLive) == "function" then
        local original = ops.findLive
        ops.A7DEV_TEST_ORIGINAL_FINDLIVE = original
        ops.findLive = function(now, ...)
            local preferred
            local ok, value = pcall(original, now, ...)
            if ok then preferred = value end

            if not (State.Flags.AutoYeti or State.Flags.AutoHeartYeti) then
                return preferred
            end

            local humanoids = workspace:FindFirstChild("Humanoids")
            if not humanoids then return preferred end

            local summons = {}
            for _, model in ipairs(humanoids:GetChildren()) do
                if model:IsA("Model") and isYetiAdd(model) then
                    summons[#summons + 1] = model
                end
            end

            if #summons > 0 then
                if isYetiAdd(ops.target) then return ops.target end
                local ref = objectPosition(preferred)
                if not ref then
                    local _, _, root = livingCharacter()
                    ref = root and root.Position
                end
                return nearestModel(summons, ref)
            end

            return preferred
        end
    end

    return true
end

R.yetiLoot = R.yetiLoot or {
    tracked = nil,
    lastPos = nil,
    deathAt = nil,
    untilAt = 0,
    beforeHearts = 0,
    attempted = setmetatable({}, {__mode = "k"}),
}

R.promptIndex = R.promptIndex or setmetatable({}, {__mode = "k"})

local function addPrompt(object)
    if object and object:IsA("ProximityPrompt") then
        R.promptIndex[object] = true
    end
end

task.spawn(function()
    local descendants = workspace:GetDescendants()
    for index, object in ipairs(descendants) do
        if not R.alive then return end
        addPrompt(object)
        if index % 500 == 0 then task.wait() end
    end
end)

track(workspace.DescendantAdded:Connect(addPrompt))

local function promptContext(prompt)
    local parts = {
        tostring(prompt.Name or ""),
        tostring(prompt.ActionText or ""),
        tostring(prompt.ObjectText or ""),
    }
    local p = prompt.Parent
    for _ = 1, 4 do
        if not p or p == workspace then break end
        parts[#parts + 1] = tostring(p.Name or "")
        p = p.Parent
    end
    return low(table.concat(parts, " "))
end

local function isYetiLootPrompt(prompt)
    if not prompt or not prompt.Parent or not prompt.Enabled then return false end
    local text = promptContext(prompt)
    for _, bad in ipairs({"buy", "shop", "merchant", "sell", "trade", "purchase"}) do
        if string.find(text, bad, 1, true) then return false end
    end
    return string.find(text, "chest", 1, true)
        or string.find(text, "loot", 1, true)
        or string.find(text, "frozen heart", 1, true)
        or string.find(text, "drop", 1, true)
end

local function triggerPromptNative(prompt)
    if not prompt or not prompt.Parent or not prompt.Enabled then return false end
    local pos = promptPosition(prompt)
    local _, _, root = livingCharacter()
    if not pos or not root then return false end

    local reach = tonumber(prompt.MaxActivationDistance) or 8
    if (root.Position - pos).Magnitude > reach then return false end

    local ok = pcall(function()
        prompt:InputHoldBegin()
        task.wait(math.max(.08, tonumber(prompt.HoldDuration) or 0))
        prompt:InputHoldEnd()
    end)
    if not ok and type(fireproximityprompt) == "function" then
        ok = pcall(fireproximityprompt, prompt)
    end
    return ok
end

local function moveSupplemental(position, tolerance)
    local _, hum, root = livingCharacter()
    if not root or typeof(position) ~= "Vector3" then return false end
    tolerance = tonumber(tolerance) or 3

    local distance = (root.Position - position).Magnitude
    if distance <= tolerance then
        if R.utilityTween then
            pcall(function() R.utilityTween:Cancel() end)
            R.utilityTween = nil
        end
        return true
    end

    if R.utilityTween then pcall(function() R.utilityTween:Cancel() end) end
    R.utilityTween = TweenService:Create(
        root,
        TweenInfo.new(math.clamp(distance / 40, .08, 5), Enum.EasingStyle.Linear),
        {CFrame = CFrame.new(position + Vector3.new(0, 2, 0))}
    )
    R.utilityTween:Play()
    return false
end

cleanup(function()
    if R.utilityTween then
        pcall(function() R.utilityTween:Cancel() end)
        R.utilityTween = nil
    end
end)

local function nextYetiLootPrompt(center)
    local best, bestDistance
    for prompt in pairs(R.promptIndex) do
        if prompt.Parent and isYetiLootPrompt(prompt) then
            local position = promptPosition(prompt)
            if position then
                local fromDeath = (position - center).Magnitude
                if fromDeath <= 100 then
                    local last = R.yetiLoot.attempted[prompt] or -math.huge
                    if os.clock() - last >= 1.0 then
                        if not bestDistance or fromDeath < bestDistance then
                            best, bestDistance = prompt, fromDeath
                        end
                    end
                end
            end
        end
    end
    return best
end

local function yetiLootTick(now)
    local enabled = State.Flags.AutoYeti == true or State.Flags.AutoHeartYeti == true
    local y = R.yetiLoot

    if not enabled then
        y.tracked, y.lastPos, y.deathAt, y.untilAt = nil, nil, nil, 0
        return
    end

    State.Flags.AutoAttack = true
    State.Flags.AutoEquip = true

    -- Detect the death from the boss we already owned before asking the live
    -- selector for another target. A dead model no longer passes aliveModel().
    if y.tracked then
        local trackedHum = humanoidOf(y.tracked)
        local trackedPos = objectPosition(y.tracked) or y.lastPos
        if trackedHum and trackedHum.Health <= 0 and not y.deathAt then
            y.lastPos = trackedPos
            y.deathAt = now
            y.untilAt = now + 8
            y.beforeHearts = itemAmount("Frozen Heart")
        end
    end

    local ops = State.YetiOps
    local target = type(ops) == "table" and (ops.target or ops.lastTarget or ops.liveCache) or nil
    if not target and isYetiFamily(State.CurrentBoss) then target = State.CurrentBoss end

    if target and isYetiFamily(target) and not isYetiAdd(target) then
        local hum = humanoidOf(target)
        local position = objectPosition(target) or y.lastPos

        if hum and hum.Health > 0 then
            y.tracked = target
            y.lastPos = position
            y.deathAt = nil
            y.untilAt = 0
            y.beforeHearts = itemAmount("Frozen Heart")
        end
    end

    if not y.deathAt or not y.lastPos then return end
    if now < y.deathAt + 2.5 then return end
    if now >= y.untilAt then
        y.tracked, y.lastPos, y.deathAt, y.untilAt = nil, nil, nil, 0
        return
    end

    local prompt = nextYetiLootPrompt(y.lastPos)
    if not prompt then return end

    local position = promptPosition(prompt)
    if not position then return end

    if moveSupplemental(position, 3) then
        y.attempted[prompt] = now
        triggerPromptNative(prompt)
    end
end

-- Request streaming around the confirmed White Terror Lair approach points
-- only when the live event resolver has not found a destination yet.
local YETI_APPROACH_POINTS = {
    Vector3.new(-1948.429, 28.374, 374.307),
    Vector3.new(-1834.05, 31, 487.559),
    Vector3.new(-1773.585, 39.377, 582.476),
}
R.yetiStreamIndex = 1

local function yetiResolverRecovery(now)
    if not (State.Flags.AutoYeti or State.Flags.AutoHeartYeti) then return end

    local y = State.YetiOps
    if type(y) == "table" then
        local live = y.target or y.liveCache or y.lastTarget
        if aliveModel(live) then return end
    end

    local resolver = State.YetiSummonResolver
    if type(resolver) == "table" and (resolver.dest or resolver.prompt) then return end
    if now < (R.nextYetiStream or 0) then return end
    R.nextYetiStream = now + 2

    local point = YETI_APPROACH_POINTS[R.yetiStreamIndex]
    R.yetiStreamIndex = R.yetiStreamIndex % #YETI_APPROACH_POINTS + 1
    task.spawn(function()
        pcall(LocalPlayer.RequestStreamAroundAsync, LocalPlayer, point, .35)
    end)
end

-- ============================================================================
-- LANTERN ACQUISITION: USE THE EXISTING YETI CHAIN WHEN NO LANTERN IS OWNED
-- ============================================================================

R.lanternAcquire = R.lanternAcquire or {
    active = false,
    prev = nil,
    changed = {},
}

local function hasSupportedLantern()
    local inv = inventoryFolder()
    return inv and (inv:FindFirstChild("Everburn Lantern") or inv:FindFirstChild("Emberheart Lantern")) ~= nil
end

local function restoreLanternOwnedFlags()
    local L = R.lanternAcquire
    if not L.active or type(L.prev) ~= "table" then return end

    local function restore(flag, label)
        if L.changed[flag] and State.Flags[flag] == L.changed[flag].forced then
            State.Flags[flag] = L.prev[flag]
            setControlAny(label, L.prev[flag] == true)
        end
    end

    restore("AutoFarm", {"Auto Farm"})
    restore("AutoYeti", {"Auto Yeti"})
    restore("AutoHeartYeti", {"Auto Heart Yeti"})

    L.active = false
    L.prev = nil
    L.changed = {}
end

local function lanternAcquireTick()
    local enabled = State.Flags.AutoLantern == true
    local L = R.lanternAcquire

    if not enabled then
        restoreLanternOwnedFlags()
        return
    end

    if hasSupportedLantern() then
        restoreLanternOwnedFlags()
        return
    end

    -- Never steal movement from an explicitly active higher-priority mode.
    if State.Flags.AutoBoss or State.Flags.AutoDungeon or State.Flags.AutoDungeonClear
        or State.Flags.AutoFishingReel or State.Flags.AutoFarmPlayers then
        if L.active then restoreLanternOwnedFlags() end
        return
    end

    if not L.active then
        L.active = true
        L.prev = {
            AutoFarm = State.Flags.AutoFarm == true,
            AutoYeti = State.Flags.AutoYeti == true,
            AutoHeartYeti = State.Flags.AutoHeartYeti == true,
        }
        L.changed = {}
    end

    local function force(flag, labels, value)
        if State.Flags[flag] ~= value then
            L.changed[flag] = {forced = value}
            State.Flags[flag] = value
            setControlAny(labels, value)
        end
    end

    force("AutoFarm", {"Auto Farm"}, false)
    force("AutoYeti", {"Auto Yeti"}, true)
    force("AutoHeartYeti", {"Auto Heart Yeti"}, true)

    State.Flags.AutoAttack = true
    State.Flags.AutoEquip = true
end

cleanup(restoreLanternOwnedFlags)

-- ============================================================================
-- PLAYER FARM: PRESENT TARGET MUST NOT EXPIRE WHILE WAITING FOR ROUTE
-- ============================================================================

local function playerRecoveryTick(now)
    if State.Flags.AutoFarmPlayers ~= true then return end
    State.Flags.AutoAttack = true
    State.Flags.AutoEquip = true

    local ops = State.PlayerOps
    if type(ops) ~= "table" then return end

    local selected
    if tonumber(ops.selectedId) then
        for _, player in ipairs(Players:GetPlayers()) do
            if player.UserId == tonumber(ops.selectedId) then
                selected = player
                break
            end
        end
    end

    if selected and selected.Character and aliveModel(selected.Character) then
        if type(ops.pending) == "table" then
            ops.pending.missingSince = nil
            ops.pending.untilAt = math.max(tonumber(ops.pending.untilAt) or 0, now + 5)
        end
    end
end

-- ============================================================================
-- DUNGEON WAIT RECOVERY: RETRY THE EXISTING SCHEDULER, NEVER GUESS AN ENTRY TP
-- ============================================================================

local function dungeonRecoveryTick(now)
    local enabled = State.Flags.AutoDungeon == true or State.Flags.AutoDungeonClear == true
    if not enabled then
        R.dungeonWaitSince = nil
        return
    end

    local ops = State.DungeonOps
    if type(ops) ~= "table" then return end

    if State.Flags.AutoDungeonClear == true then
        State.Flags.AutoDungeon = true
    end

    if dungeonInRun() then
        R.dungeonWaitSince = nil
        if State.DungeonCombatTarget and not aliveModel(State.DungeonCombatTarget) then
            State.DungeonCombatTarget = nil
        end
        if State.DungeonAutoClearTarget and not aliveModel(State.DungeonAutoClearTarget) then
            State.DungeonAutoClearTarget = nil
        end
        State.Flags.AutoAttack = true
        State.Flags.AutoEquip = true
        return
    end

    local text = low(tostring(State.DungeonStatus or "") .. " " .. statusText())
    local waiting = string.find(text, "dungeonwait", 1, true)
        or string.find(text, "waiting for dungeon", 1, true)
        or string.find(text, "waiting dungeon", 1, true)
        or string.find(text, "queue", 1, true)

    if waiting then
        R.dungeonWaitSince = R.dungeonWaitSince or now
    else
        R.dungeonWaitSince = nil
    end

    if not R.dungeonWaitSince or now - R.dungeonWaitSince < 12 then return end
    if now < (R.nextDungeonRetry or 0) then return end
    R.nextDungeonRetry = now + 5

    if type(ops.setResume) == "function" then
        safe("Dungeon resume", ops.setResume, true)
    end
    if type(ops.tick) == "function" then
        safe("Dungeon retry", ops.tick)
    end
end

-- ============================================================================
-- FISHING: BOUNDED STUCK-STATE RECOVERY WITHOUT REPLACING THE NATIVE HOOK
-- ============================================================================

R.fishing = R.fishing or {
    active = false,
    fingerprint = nil,
    changedAt = 0,
    lastPulse = -math.huge,
    pulses = 0,
    internalPulse = false,
}

local function fishingFingerprint()
    local parts = {}

    for key, value in pairs(State) do
        local k = low(key)
        if string.find(k, "fish", 1, true) or string.find(k, "bait", 1, true)
            or string.find(k, "rod", 1, true) or string.find(k, "reel", 1, true) then
            local kind = typeof(value)
            if kind == "string" or kind == "number" or kind == "boolean" then
                parts[#parts + 1] = tostring(key) .. "=" .. tostring(value)
            end
        end
    end

    local character = LocalPlayer.Character
    if character then
        for _, child in ipairs(character:GetChildren()) do
            if child:IsA("Tool") then
                local n = low(child.Name)
                if string.find(n, "rod", 1, true) or string.find(n, "fish", 1, true) then
                    parts[#parts + 1] = "tool=" .. child.Name
                end
            end
        end
    end

    parts[#parts + 1] = "status=" .. statusText()
    table.sort(parts)
    return table.concat(parts, "|")
end

local function findFishingControl()
    local controls = State.Runtime and State.Runtime.ToggleControls
    if type(controls) ~= "table" then return nil end
    for label, control in pairs(controls) do
        local l = low(label)
        if string.find(l, "fish", 1, true) and type(control.Set) == "function" then
            return control
        end
    end
end

local function fishingRecoveryTick(now)
    local F = R.fishing
    local enabled = State.Flags.AutoFishingReel == true

    if F.internalPulse then return end

    if not enabled then
        F.active = false
        F.fingerprint = nil
        F.changedAt = now
        F.pulses = 0
        return
    end

    local fp = fishingFingerprint()
    if not F.active then
        F.active = true
        F.fingerprint = fp
        F.changedAt = now
        F.pulses = 0
        return
    end

    if fp ~= F.fingerprint then
        F.fingerprint = fp
        F.changedAt = now
        return
    end

    local text = low(fp .. " " .. statusText())
    local stuck = string.find(text, "waiting for bite", 1, true)
        or string.find(text, "no bite", 1, true)
        or string.find(text, "waiting bite", 1, true)
        or string.find(text, "reel", 1, true)
        or string.find(text, "casting", 1, true)

    if not stuck or now - F.changedAt < 30 or now - F.lastPulse < 45 or F.pulses >= 2 then
        return
    end

    local control = findFishingControl()
    if not control then return end

    F.lastPulse = now
    F.pulses += 1
    F.internalPulse = true

    task.spawn(function()
        pcall(control.Set, false)
        task.wait(.25)

        if R.alive and not State.Destroyed
            and not State.Flags.AutoBoss
            and not State.Flags.AutoDungeon
            and not State.Flags.AutoDungeonClear
            and not State.Flags.AutoYeti
            and not State.Flags.AutoHeartYeti
            and not State.Flags.AutoFarmPlayers then
            pcall(control.Set, true)
        end

        F.fingerprint = nil
        F.changedAt = os.clock()
        F.internalPulse = false
    end)
end

-- ============================================================================
-- SPECIAL QUESTS: RELEASE STALE PRIORITY AND RETRY EXISTING CROW LOGIC
-- ============================================================================

local function specialQuestRecoveryTick(now)
    if State.Flags.AutoMuzanQuest ~= true then State.MuzanPriorityActive = false end
    if State.Flags.AutoCrowQuest ~= true then State.CrowPriorityActive = false end
    if State.Flags.AutoTrainingQuests ~= true then State.TrainingPriorityActive = false end

    if State.Flags.AutoCrowQuest and type(State.CrowQuestOps) == "table" then
        local status = low(State.CrowQuestStatus)
        if string.find(status, "waiting", 1, true) or status == "idle" then
            R.crowWaitingSince = R.crowWaitingSince or now
            if now - R.crowWaitingSince >= 10 and now >= (R.nextCrowRetry or 0) then
                R.nextCrowRetry = now + 8
                State.CrowQuestOps.NextTry = 0
                if type(State.CrowQuestOps.tick) == "function" then
                    task.spawn(function()
                        safe("Crow retry", State.CrowQuestOps.tick, true)
                    end)
                end
            end
        else
            R.crowWaitingSince = nil
        end
    else
        R.crowWaitingSince = nil
    end
end

-- ============================================================================
-- LOW-FREQUENCY RECOVERY SUPERVISOR
-- ============================================================================

local installDeadline = os.clock() + 12
task.spawn(function()
    while R.alive and not State.Destroyed do
        local now = os.clock()

        if not State.SellOps or not State.SellOps.A7DEV_TEST_REPAIR then
            installSellRepair()
        end
        if not (State.A7DEVExports and State.A7DEVExports.A7DEV_TEST_SKILL_GUARD) then
            installSkillGuard()
        end
        if not (State.DungeonOps and State.DungeonOps.A7DEV_TEST_UI_REPAIR) then
            installDungeonUiRepair()
        end
        if not (State.MobLockOps and State.MobLockOps.A7DEV_TEST_OWNERSHIP_REPAIR) then
            installFreezeOwnershipRepair()
        end
        if not (State.YetiOps and State.YetiOps.A7DEV_TEST_PRIORITY_REPAIR) then
            installYetiPriorityRepair()
        end

        routeArbiterTick()
        coordinateExclusiveRoutes()
        scanBossRespawnTimer(now)
        recoverFarm(now)
        recoverBoss(now)
        yetiLootTick(now)
        yetiResolverRecovery(now)
        lanternAcquireTick()
        playerRecoveryTick(now)
        dungeonRecoveryTick(now)
        fishingRecoveryTick(now)
        specialQuestRecoveryTick(now)

        -- Do not repeatedly hunt optional modules forever on a broken startup.
        if os.clock() > installDeadline then
            installDeadline = math.huge
        end

        task.wait(.35)
    end
end)

-- Keep test defaults visually synchronized after all restored controls exist.
task.delay(.8, function()
    if not R.alive then return end
    applySafeDefaults()
    installSellRepair()
    installSkillGuard()
    installDungeonUiRepair()
    installFreezeOwnershipRepair()
    installYetiPriorityRepair()
end)

if gui then
    track(gui.AncestryChanged:Connect(function(_, parent)
        if not parent then stop() end
    end))
end

print("[A7DEV TEST CORE] Complete repair overlay V2 loaded.")
