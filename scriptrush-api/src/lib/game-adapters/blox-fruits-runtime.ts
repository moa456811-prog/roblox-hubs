/** Original controller using only the documented source-backed game surfaces.
 * Public examples establish an integration contract, not live-game success. */
import { BLOX_FRUITS_FIRST_SEA_QUESTS } from "./blox-fruits-quest-data.ts";

const firstSeaFacts = "{\n" + BLOX_FRUITS_FIRST_SEA_QUESTS.map(row =>
  `        { minimum = ${row.minLevel}, questId = ${JSON.stringify(row.questId)}, stageIndex = ${row.tier}, targetName = ${JSON.stringify(row.target)}, giverPosition = Vector3.new(${row.questPosition.join(", ")}), enemyPosition = Vector3.new(${row.enemyPosition.join(", ")}), positionWarning = ${Boolean(row.positionWarning)} },`
).join("\n") + "\n    }";

export const BLOX_FRUITS_RUNTIME_FACTORY = String.raw`(function(env)
    local player = env.player
    local RunService = game:GetService("RunService")
    local TweenService = game:GetService("TweenService")
    local CollectionService = game:GetService("CollectionService")
    local ReplicatedStorage = game:GetService("ReplicatedStorage")
    local Workspace = game:GetService("Workspace")
    local virtualUserOk, VirtualUser = pcall(function() return game:GetService("VirtualUser") end)
    if not virtualUserOk then VirtualUser = nil end
    local seas = {
        [2753915549] = { minimum = 0, maximum = 700 },
        [4442272183] = { minimum = 700, maximum = 1500 },
        [7449423635] = { minimum = 1500, maximum = math.huge },
    }
    local labels = { farm = "Auto Farm", boss = "Auto Boss", quest = "Quest Farm", loot = "Auto Loot" }
    local firstSeaFacts = ${firstSeaFacts}
    local enabled = { farm = false, boss = false, quest = false, loot = false }
    local bossReady, farmReady = false, false
    local progress = { farmDamage = 0, bossDamage = 0, questDamage = 0, questStarts = 0, chestsCollected = 0, fruitsCollected = 0 }
    local closed, busy, revision = false, false, 0
    local clock, accumulated, lastAttack, lastQuestCall = 0, 0, -math.huge, -math.huge
    local active, status, lastError = nil, "All automation is off.", nil
    local pendingThread, pendingDeadline, pendingFeature = nil, nil, nil
    local movement, combat, pendingLoot, pendingQuest = nil, nil, nil, nil
    local enemyCache, lootCache, enemyCacheAt, lootCacheAt = {}, {}, -math.huge, -math.huge
    local enemyCursor, taggedCursor, chestCursor, fruitCursor = 1, 1, 1, 1
    local questModules, questSelection = nil, nil
    local questFailureKey, questFailures = nil, 0
    local fallbackNpcAt, fallbackNpcPlan, fallbackNpc = -math.huge, nil, nil
    local spawnCacheAt, spawnCacheName, spawnCache = -math.huge, nil, {}
    local heartbeatConnection, characterConnection = nil, nil

    local function announce(message)
        status = message
        if type(env.notify) == "function" then pcall(env.notify, message) end
    end
    local function syncControl(feature, value)
        if type(env.controlState) == "function" then pcall(env.controlState, feature, value) end
    end
    local function chooseFeature()
        if enabled.boss and bossReady then return "boss" end
        if enabled.quest then return "quest" end
        if enabled.farm and farmReady then return "farm" end
        if enabled.loot then return "loot" end
        if enabled.boss then return "boss" end
        if enabled.farm then return "farm" end
        return nil
    end
    local function valid(token, feature)
        return not closed and revision == token and enabled[feature] == true and chooseFeature() == feature and seas[game.PlaceId] ~= nil
    end
    local function cancelMovement()
        local old = movement
        movement = nil
        if old and old.tween then pcall(function() old.tween:Cancel() end) end
    end
    local function resetWork()
        cancelMovement()
        combat, pendingLoot, pendingQuest = nil, nil, nil
    end
    local function invalidateWork()
        revision = revision + 1
        local old = pendingThread
        pendingThread, pendingDeadline, pendingFeature, busy = nil, nil, nil, false
        questFailureKey, questFailures = nil, 0
        resetWork()
        if old and type(task.cancel) == "function" then pcall(task.cancel, old) end
    end
    local function pauseFeature(feature, message)
        if closed or not enabled[feature] then return end
        enabled[feature] = false
        syncControl(feature, false)
        resetWork()
        active = chooseFeature()
        lastError = message
        announce(labels[feature] .. " paused: " .. message)
    end
    local function liveCharacter()
        local character = player.Character
        if not character or not character.Parent then return nil end
        local humanoid = character:FindFirstChildOfClass("Humanoid")
        local root = character:FindFirstChild("HumanoidRootPart")
        if not humanoid or humanoid.Health <= 0 or not root or not root:IsA("BasePart") then return nil end
        return character, humanoid, root
    end
    local function pivotPosition(object)
        if not object or not object.Parent or not (object:IsA("Model") or object:IsA("BasePart")) then return nil end
        local ok, pivot = pcall(function() return object:GetPivot() end)
        if ok and typeof(pivot) == "CFrame" then return pivot.Position end
        return nil
    end
    local function moveToward(root, destination, range, feature, token, identity)
        if not valid(token, feature) or not root.Parent then return false end
        local distance = (root.Position - destination).Magnitude
        if distance <= range then cancelMovement(); return true end
        local sameLeg = movement and movement.root == root and movement.feature == feature and movement.identity == identity
        local leg = sameLeg and movement or { deadline = clock + math.min(distance / 120 + 30, 600), lastProgressAt = clock, lastDistance = distance }
        if distance < leg.lastDistance - 0.5 then leg.lastDistance, leg.lastProgressAt = distance, clock end
        if clock - leg.lastProgressAt >= 12 or clock >= leg.deadline then
            pauseFeature(feature, "The travel route did not make enough progress or exceeded its bounded travel time. The selected zone may be inaccessible; no arrival was assumed.")
            return false
        end
        if sameLeg and (movement.destination - destination).Magnitude <= 3 then return false end
        cancelMovement()
        if not valid(token, feature) then return false end
        local tween = TweenService:Create(root, TweenInfo.new(math.max(distance / 120, 0.05), Enum.EasingStyle.Linear), { CFrame = CFrame.new(destination) })
        movement = { tween = tween, root = root, destination = destination, feature = feature, identity = identity, deadline = leg.deadline, lastProgressAt = leg.lastProgressAt, lastDistance = leg.lastDistance }
        tween:Play()
        return false
    end
    local function normalizedEnemyName(name)
        local value = tostring(name or "")
        for _ = 1, 2 do
            value = value:gsub("%s*%[Boss%]%s*$", "")
            value = value:gsub("%s*%[Lv%.?[^%]]*%]%s*$", "")
        end
        return value:lower():gsub("^%s+", ""):gsub("%s+$", "")
    end
    local function enemyParts(model)
        if not model or not model.Parent or not model:IsA("Model") then return nil end
        local humanoid = model:FindFirstChildOfClass("Humanoid")
        local root = model:FindFirstChild("HumanoidRootPart")
        if not humanoid or humanoid.Health <= 0 or not root or not root:IsA("BasePart") then return nil end
        return humanoid, root
    end
    local function refreshEnemies()
        if clock - enemyCacheAt < 1 then return end
        enemyCacheAt, enemyCache = clock, {}
        local folder = Workspace:FindFirstChild("Enemies")
        if not folder then return end
        local children = folder:GetChildren()
        local length, amount = #children, math.min(#children, 200)
        if length == 0 then enemyCursor = 1; return end
        local start = (enemyCursor - 1) % length + 1
        for offset = 0, amount - 1 do
            local model = children[(start + offset - 1) % length + 1]
            local humanoid = enemyParts(model)
            if humanoid then table.insert(enemyCache, model) end
        end
        enemyCursor = (start + amount - 1) % length + 1
    end
    local function isBoss(model)
        return model:GetAttribute("IsBoss") == true or model:GetAttribute("RaidBoss") == true
    end
    -- Arbitration uses the same bounded enemy cache as targeting. Keeping its
    -- readiness snapshot stable between controller ticks makes yielding work
    -- cancellable without starting a second worker or rescanning the world.
    local function refreshArbitration()
        refreshEnemies()
        bossReady, farmReady = false, false
        local folder = Workspace:FindFirstChild("Enemies")
        local function inspect(model)
            if model and model.Parent == folder and enemyParts(model) then
                if isBoss(model) then bossReady = true else farmReady = true end
            end
        end
        if combat then inspect(combat.model) end
        for _, model in ipairs(enemyCache) do inspect(model) end
    end
    local function selectEnemy(feature, root, targetName)
        refreshEnemies()
        local folder = Workspace:FindFirstChild("Enemies")
        local function allowed(model)
            if not model or model.Parent ~= folder then return false end
            local humanoid = enemyParts(model)
            if not humanoid then return false end
            if feature == "boss" then return isBoss(model) end
            if isBoss(model) then return false end
            return not targetName or normalizedEnemyName(model.Name) == normalizedEnemyName(targetName)
        end
        if combat and combat.feature == feature and allowed(combat.model) then return combat.model end
        local nearest, nearestDistance = nil, math.huge
        for _, model in ipairs(enemyCache) do
            if allowed(model) then
                local _, enemyRoot = enemyParts(model)
                local distance = (root.Position - enemyRoot.Position).Magnitude
                if distance < nearestDistance then nearest, nearestDistance = model, distance end
            end
        end
        return nearest
    end
    local function equippedTool(character, humanoid)
        local current = character:FindFirstChildOfClass("Tool")
        if current then return current end
        local backpack = player:FindFirstChildOfClass("Backpack") or player:FindFirstChild("Backpack")
        if not backpack then return nil end
        local children = backpack:GetChildren()
        for index = 1, math.min(#children, 200) do
            if children[index]:IsA("Tool") then
                humanoid:EquipTool(children[index])
                if children[index].Parent == character then return children[index] end
                return nil
            end
        end
        return nil
    end
    local function normalAttack(tool)
        local camera = Workspace.CurrentCamera
        if VirtualUser and camera and typeof(camera.ViewportSize) == "Vector2" and typeof(camera.CFrame) == "CFrame" then
            local point = Vector2.new(camera.ViewportSize.X / 2, camera.ViewportSize.Y / 2)
            local down = pcall(function()
                VirtualUser:CaptureController()
                VirtualUser:Button1Down(point, camera.CFrame)
            end)
            local up = pcall(function() VirtualUser:Button1Up(point, camera.CFrame) end)
            if down and up then return true end
        end
        return pcall(function() tool:Activate() end)
    end
    local function observeCombatHealth(feature)
        if not combat or combat.feature ~= feature then return end
        local health = combat.humanoid.Health
        if type(health) ~= "number" then return end
        if health < combat.lastHealth then
            local key = feature .. "Damage"
            progress[key] = progress[key] + math.max(0, combat.lastHealth - math.max(0, health))
            combat.lastDamageAt = clock
            status = labels[feature] .. ": enemy health decreased."
        end
        combat.lastHealth = health
    end
    local function combatStep(feature, model, character, humanoid, root, token)
        if not valid(token, feature) then return end
        local enemyHumanoid, enemyRoot = enemyParts(model)
        if not enemyHumanoid then combat = nil; cancelMovement(); return end
        if not combat or combat.model ~= model or combat.feature ~= feature then
            combat = { model = model, humanoid = enemyHumanoid, feature = feature, lastHealth = enemyHumanoid.Health, lastDamageAt = nil }
        end
        observeCombatHealth(feature)
        local distance = (root.Position - enemyRoot.Position).Magnitude
        if distance > 6 then
            combat.lastDamageAt = nil
            status = labels[feature] .. ": moving toward the selected enemy."
            moveToward(root, enemyRoot.Position + Vector3.new(0, 0, 5), 1, feature, token, model)
            return
        end
        cancelMovement()
        if not combat.lastDamageAt then combat.lastDamageAt = clock end
        if clock - combat.lastDamageAt >= 12 then
            pauseFeature(feature, "No enemy health decrease was observed for 12 seconds. Check the equipped weapon and the current game combat rules.")
            return
        end
        local tool = equippedTool(character, humanoid)
        if not valid(token, feature) then return end
        if not tool then pauseFeature(feature, "No usable Tool is equipped or present in Backpack. Equip a supported weapon before enabling again."); return end
        if clock - lastAttack >= 0.25 then
            lastAttack = clock
            if not normalAttack(tool) then pauseFeature(feature, "Normal attack input was rejected. Check weapon availability before enabling again."); return end
            status = labels[feature] .. ": attacking; waiting for an observed health decrease."
        end
    end
    local function playerLevel()
        local data = player:FindFirstChild("Data")
        local level = data and data:FindFirstChild("Level")
        local value = level and level.Value
        if type(value) ~= "number" or value ~= value or value < 0 or value == math.huge then return nil end
        return value
    end
    local function loadQuestModules(token)
        local quests = ReplicatedStorage:FindFirstChild("Quests")
        local guide = ReplicatedStorage:FindFirstChild("GuideModule")
        if not quests or not quests:IsA("ModuleScript") then return nil, "ReplicatedStorage.Quests must be an actual ModuleScript." end
        if not guide or not guide:IsA("ModuleScript") then return nil, "ReplicatedStorage.GuideModule must be an actual ModuleScript." end
        if questModules and questModules.questsInstance == quests and questModules.guideInstance == guide then return questModules end
        local questsOk, questData = pcall(require, quests)
        if not valid(token, "quest") then return nil, "cancelled" end
        if not questsOk or type(questData) ~= "table" then return nil, "The Quests module did not return a readable quest table." end
        local guideOk, guideData = pcall(require, guide)
        if not valid(token, "quest") then return nil, "cancelled" end
        if not guideOk or type(guideData) ~= "table" or type(guideData.Data) ~= "table" or type(guideData.Data.NPCList) ~= "table" then return nil, "GuideModule.Data.NPCList is missing or has an unsupported shape." end
        if guideData.Data.IsFakeData == true then return nil, "GuideModule reports IsFakeData; quest giver positions cannot be trusted." end
        questModules = { questsInstance = quests, guideInstance = guide, quests = questData, npcs = guideData.Data.NPCList }
        return questModules
    end
    local function fallbackQuest(level, reason)
        if game.PlaceId ~= 2753915549 then return nil, reason end
        if questSelection and questSelection.source == "curated-first-sea-2026" and questSelection.level == level then return questSelection end
        local row = nil
        for _, fact in ipairs(firstSeaFacts) do
            if fact.minimum <= level and (not row or fact.minimum > row.minimum) then row = fact end
        end
        if not row then return nil, "No curated first-sea quest matches the current level; valid live quest modules are required." end
        questSelection = {
            questId = row.questId, stageIndex = row.stageIndex, targetName = row.targetName,
            displayName = row.targetName, requiredLevel = row.minimum, level = level,
            sourcePosition = row.giverPosition, giverPosition = row.giverPosition,
            enemyPosition = row.enemyPosition, positionWarning = row.positionWarning,
            source = "curated-first-sea-2026", dynamicIssue = reason,
        }
        return questSelection
    end
    local function corroborateFallbackGiver(plan)
        if plan.source ~= "curated-first-sea-2026" then return true end
        local folder = Workspace:FindFirstChild("NPCs")
        if fallbackNpcPlan ~= plan or clock - fallbackNpcAt >= 1 then
            fallbackNpcPlan, fallbackNpcAt, fallbackNpc = plan, clock, nil
            if folder then
                local distance = 32
                local children = folder:GetChildren()
                for index = 1, math.min(#children, 200) do
                    local npc = children[index]
                    local position = npc:IsA("Model") and pivotPosition(npc) or nil
                    if position and (position - plan.sourcePosition).Magnitude <= distance then fallbackNpc, distance = npc, (position - plan.sourcePosition).Magnitude end
                end
            end
        end
        local position = fallbackNpc and fallbackNpc.Parent == folder and pivotPosition(fallbackNpc) or nil
        if not position or (position - plan.sourcePosition).Magnitude > 32 then
            if plan.positionWarning then return false, "The curated SkyExp2Quest coordinates conflict between sources, and no nearby live NPC corroborates this position. No alternate coordinates were guessed." end
            return false, "The curated first-sea giver position has no matching nearby live NPC. Move into a loaded quest-giver area or supply valid live quest modules; no giver or arrival was assumed."
        end
        plan.giverPosition, plan.giverName = position, fallbackNpc.Name
        return true
    end
    local function selectQuest(token)
        local level, sea = playerLevel(), seas[game.PlaceId]
        if not level or not sea then return nil, "The current sea or player.Data.Level is unavailable." end
        local modules, moduleError = loadQuestModules(token)
        if not modules then
            if moduleError == "cancelled" then return nil, moduleError end
            return fallbackQuest(level, moduleError)
        end
        if questSelection and questSelection.level == level and questSelection.modules == modules then return questSelection end
        local excluded = { BartiloQuest = true, MarineQuest = true, CitizenQuest = true }
        local best, inspectedQuests, inspectedStages = nil, 0, 0
        for questId, stages in pairs(modules.quests) do
            inspectedQuests = inspectedQuests + 1
            if inspectedQuests > 200 or inspectedStages >= 200 then break end
            if type(questId) == "string" and not excluded[questId] and type(stages) == "table" then
                for stageIndex, stage in pairs(stages) do
                    inspectedStages = inspectedStages + 1
                    if inspectedStages > 200 then break end
                    if type(stageIndex) == "number" and stageIndex >= 1 and stageIndex % 1 == 0 and type(stage) == "table" and type(stage.LevelReq) == "number" and stage.LevelReq <= level and stage.LevelReq >= sea.minimum and stage.LevelReq < sea.maximum and type(stage.Name) == "string" and type(stage.Task) == "table" then
                        local tasksSeen = 0
                        for targetName, amount in pairs(stage.Task) do
                            tasksSeen = tasksSeen + 1
                            if tasksSeen > 8 then break end
                            if type(targetName) == "string" and type(amount) == "number" and amount > 1 and not targetName:lower():find("boss", 1, true) and (not best or stage.LevelReq > best.requiredLevel) then
                                best = { questId = questId, stageIndex = stageIndex, targetName = targetName, displayName = stage.Name, requiredLevel = stage.LevelReq, amount = amount, level = level, modules = modules, source = "live-modules" }
                            end
                        end
                    end
                end
            end
        end
        if not best then return fallbackQuest(level, "No normal kill quest matches the current level and sea in the actual Quests module.") end
        local npcsSeen = 0
        for _, npc in pairs(modules.npcs) do
            npcsSeen = npcsSeen + 1
            if npcsSeen > 200 then break end
            if type(npc) == "table" and type(npc.NPCName) == "string" and type(npc.Levels) == "table" then
                local matchingLevel, levelsSeen = false, 0
                for _, required in pairs(npc.Levels) do
                    levelsSeen = levelsSeen + 1
                    if levelsSeen > 200 then break end
                    if type(required) == "number" and required == best.requiredLevel then matchingLevel = true; break end
                end
                local position = typeof(npc.Position) == "CFrame" and npc.Position.Position or typeof(npc.Position) == "Vector3" and npc.Position or nil
                if matchingLevel and position then best.giverName, best.giverPosition = npc.NPCName, position; break end
            end
        end
        if not best.giverPosition then return fallbackQuest(level, "No GuideModule NPCList giver position matches the selected quest LevelReq.") end
        questSelection = best
        return best
    end
    local function questView()
        local playerGui = player:FindFirstChild("PlayerGui")
        local main = playerGui and playerGui:FindFirstChild("Main")
        local quest = main and main:FindFirstChild("Quest")
        local container = quest and quest:FindFirstChild("Container")
        local titleHolder = container and container:FindFirstChild("QuestTitle")
        local title = titleHolder and titleHolder:FindFirstChild("Title")
        if not quest or type(quest.Visible) ~= "boolean" or not title or type(title.Text) ~= "string" then return nil end
        return quest, title.Text
    end
    local function questTitleMatches(title, plan)
        local function words(value) return " " .. tostring(value):lower():gsub("[^%w]+", " "):gsub("^%s+", ""):gsub("%s+$", "") .. " " end
        local text, target = words(title), words(plan.targetName)
        if text:find(target, 1, true) then return true end
        local plural = target:sub(1, #target - 1) .. "s "
        return text:find(plural, 1, true) ~= nil
    end
    local function questSpawnPosition(plan, root)
        if spawnCacheName ~= plan.targetName or clock - spawnCacheAt >= 1 then
            spawnCacheAt, spawnCacheName, spawnCache = clock, plan.targetName, {}
            local origin = Workspace:FindFirstChild("_WorldOrigin")
            local folder = origin and origin:FindFirstChild("EnemySpawns")
            if folder then
                local children = folder:GetChildren()
                for index = 1, math.min(#children, 200) do
                    local object = children[index]
                    if normalizedEnemyName(object.Name) == normalizedEnemyName(plan.targetName) then
                        local position = pivotPosition(object)
                        if position then table.insert(spawnCache, { position = position, object = object }) end
                    end
                end
            end
        end
        local nearest, distance = nil, math.huge
        for _, spawn in ipairs(spawnCache) do
            if spawn.object.Parent and (spawn.position - root.Position).Magnitude < distance then nearest, distance = spawn, (spawn.position - root.Position).Magnitude end
        end
        if nearest then return nearest.position, nearest.object end
        if plan.source == "curated-first-sea-2026" and not plan.positionWarning then return plan.enemyPosition, plan.questId .. ":" .. tostring(plan.stageIndex) .. ":source-spawn" end
        return nil
    end
    local function questAttemptFailed(plan, message)
        pendingQuest = nil
        if plan.source ~= "curated-first-sea-2026" then pauseFeature("quest", message); return end
        questFailures = questFailures + 1
        if questFailures >= 2 then pauseFeature("quest", message .. " Two bounded attempts failed; verify the current quest ID, giver and game version before enabling again.")
        else status = "Quest Farm: first acceptance attempt failed; one bounded retry remains after the request cooldown." end
    end
    local function questStep(character, humanoid, root, token)
        local plan, planError = selectQuest(token)
        if not valid(token, "quest") then return end
        if not plan then pauseFeature("quest", planError or "Quest data is unavailable."); return end
        local failureKey = plan.questId .. ":" .. tostring(plan.stageIndex)
        if questFailureKey ~= failureKey then questFailureKey, questFailures = failureKey, 0 end
        local view, title = questView()
        if not view then pauseFeature("quest", "PlayerGui.Main.Quest and its Container.QuestTitle.Title text are not available."); return end
        if view.Visible then
            if not questTitleMatches(title, plan) then
                pauseFeature("quest", "Another quest is active. Complete or change it before enabling this selected quest; no active quest was abandoned.")
                return
            end
            if pendingQuest then
                progress.questStarts = progress.questStarts + 1
                pendingQuest = nil
                questFailures = 0
                announce("Quest Farm: quest acceptance confirmed by the visible quest UI.")
            end
            local target = selectEnemy("quest", root, plan.targetName)
            if target then combatStep("quest", target, character, humanoid, root, token)
            else
                combat = nil
                local spawnPosition, spawnIdentity = questSpawnPosition(plan, root)
                if spawnPosition then moveToward(root, spawnPosition, 8, "quest", token, spawnIdentity) else cancelMovement() end
                if valid(token, "quest") then status = "Quest Farm: waiting for the exact live quest target " .. plan.targetName:sub(1, 80) .. "; spawn movement is not combat confirmation." end
            end
            return
        end
        combat = nil
        if pendingQuest then
            if clock - pendingQuest.startedAt >= 5 then questAttemptFailed(plan, "StartQuest was sent, but the matching quest UI did not become visible. No quest success was assumed.")
            else status = "Quest Farm: waiting for the quest UI to confirm acceptance." end
            return
        end
        local giverOk, giverError = corroborateFallbackGiver(plan)
        if not giverOk then pauseFeature("quest", giverError); return end
        status = "Quest Farm: moving to the giver from GuideModule.NPCList."
        if not moveToward(root, plan.giverPosition, 8, "quest", token, failureKey .. ":giver") then return end
        if clock - lastQuestCall < 3 or not valid(token, "quest") then return end
        local remotes = ReplicatedStorage:FindFirstChild("Remotes")
        local remote = remotes and remotes:FindFirstChild("CommF_")
        if not remote or not remote:IsA("RemoteFunction") then pauseFeature("quest", "ReplicatedStorage.Remotes.CommF_ is not an available RemoteFunction."); return end
        lastQuestCall = clock
        pendingQuest = { startedAt = clock, questId = plan.questId, stageIndex = plan.stageIndex }
        local ok = pcall(function() remote:InvokeServer("StartQuest", plan.questId, plan.stageIndex) end)
        if not valid(token, "quest") then return end
        if not ok then questAttemptFailed(plan, "StartQuest failed. No quest success was assumed."); return end
        local confirmedView, confirmedTitle = questView()
        if confirmedView and confirmedView.Visible and questTitleMatches(confirmedTitle, plan) then
            progress.questStarts = progress.questStarts + 1
            pendingQuest = nil
            questFailures = 0
            announce("Quest Farm: quest acceptance confirmed by the visible quest UI.")
        else status = "Quest Farm: waiting for the quest UI to confirm acceptance." end
    end
    local function refreshLoot()
        if clock - lootCacheAt < 1 then return end
        lootCacheAt, lootCache = clock, {}
        local seen = {}
        local function chest(object)
            if object and not seen[object] and object.Parent and object:IsDescendantOf(Workspace) and (object:IsA("Model") or object:IsA("BasePart")) and object:GetAttribute("IsDisabled") ~= true then
                seen[object] = true
                local position = pivotPosition(object)
                if position then table.insert(lootCache, { object = object, kind = "chest" }) end
            end
        end
        local function visit(list, limit, cursor, callback)
            local length = #list
            if length == 0 then return 1 end
            local start = (cursor - 1) % length + 1
            local amount = math.min(length, limit)
            for offset = 0, amount - 1 do callback(list[(start + offset - 1) % length + 1]) end
            return (start + amount - 1) % length + 1
        end
        local tagged = CollectionService:GetTagged("_ChestTagged")
        taggedCursor = visit(tagged, 80, taggedCursor, chest)
        local folder = Workspace:FindFirstChild("ChestModels")
        if folder then
            local children = folder:GetChildren()
            chestCursor = visit(children, 40, chestCursor, chest)
        end
        fruitCursor = visit(Workspace:GetChildren(), 80, fruitCursor, function(object)
            if not seen[object] and (object:IsA("Tool") or object.Name:lower():find("fruit", 1, true)) then
                local handle = object:FindFirstChild("Handle")
                if handle and handle:IsA("BasePart") then seen[object] = true; table.insert(lootCache, { object = object, handle = handle, kind = "fruit" }) end
            end
        end)
    end
    local function lootStep(root, token)
        if pendingLoot then
            local item = pendingLoot
            local backpack = player:FindFirstChildOfClass("Backpack") or player:FindFirstChild("Backpack")
            if item.kind == "chest" and (not item.object.Parent or item.object:GetAttribute("IsDisabled") == true) then
                progress.chestsCollected = progress.chestsCollected + 1
                pendingLoot = nil; cancelMovement(); announce("Auto Loot: chest pickup confirmed by removal or its disabled state.")
                return
            end
            if item.kind == "fruit" and backpack and item.object.Parent == backpack then
                progress.fruitsCollected = progress.fruitsCollected + 1
                pendingLoot = nil; cancelMovement(); announce("Auto Loot: fruit pickup confirmed in Backpack.")
                return
            end
            if item.kind == "fruit" and item.object.Parent ~= Workspace then
                pendingLoot = nil; cancelMovement(); status = "Auto Loot: fruit is no longer available; no pickup was confirmed."
                return
            end
            if clock - item.startedAt >= 10 then pauseFeature("loot", "The selected pickup did not change to a confirmed collected state. Check pickup requirements before enabling again."); return end
            local position = item.kind == "chest" and pivotPosition(item.object) or item.handle and item.handle.Parent and item.handle.Position
            if not position then pendingLoot = nil; cancelMovement(); return end
            moveToward(root, position, 1.25, "loot", token, item.object)
            if valid(token, "loot") then status = "Auto Loot: approaching the pickup; waiting for its actual collected state." end
            return
        end
        refreshLoot()
        local nearest, distance = nil, math.huge
        for _, item in ipairs(lootCache) do
            local position = nil
            if item.kind == "chest" and item.object.Parent and item.object:GetAttribute("IsDisabled") ~= true then position = pivotPosition(item.object)
            elseif item.kind == "fruit" and item.object.Parent == Workspace and item.handle and item.handle.Parent then position = item.handle.Position end
            if position and (root.Position - position).Magnitude < distance then nearest, distance = item, (root.Position - position).Magnitude end
        end
        if nearest then
            pendingLoot = { object = nearest.object, handle = nearest.handle, kind = nearest.kind, startedAt = clock }
            local position = nearest.kind == "chest" and pivotPosition(nearest.object) or nearest.handle.Position
            moveToward(root, position, 1.25, "loot", token, nearest.object)
            if valid(token, "loot") then status = "Auto Loot: approaching the selected visible pickup." end
        else cancelMovement(); status = "Auto Loot: waiting for a visible tagged chest or spawned fruit." end
    end
    local function step(feature, token)
        if not valid(token, feature) then return end
        local character, humanoid, root = liveCharacter()
        if not character then resetWork(); status = labels[feature] .. ": waiting for a living character after respawn."; return end
        if feature ~= "loot" then observeCombatHealth(feature) end
        if feature == "quest" then questStep(character, humanoid, root, token)
        elseif feature == "loot" then lootStep(root, token)
        else
            local target = selectEnemy(feature, root)
            if target then combatStep(feature, target, character, humanoid, root, token)
            else cancelMovement(); combat = nil; status = labels[feature] .. ": waiting for a live " .. (feature == "boss" and "IsBoss/RaidBoss enemy." or "normal enemy.") end
        end
    end
    local function dispose()
        if closed then return end
        closed = true
        for key in pairs(enabled) do enabled[key] = false; syncControl(key, false) end
        invalidateWork()
        if heartbeatConnection then pcall(function() heartbeatConnection:Disconnect() end); heartbeatConnection = nil end
        if characterConnection then pcall(function() characterConnection:Disconnect() end); characterConnection = nil end
        active, status = nil, "Hub closed; all automation stopped."
    end
    local function setEnabled(feature, value)
        if labels[feature] == nil then return false end
        if closed then syncControl(feature, false); return false end
        local requested = value == true
        if requested and not seas[game.PlaceId] then
            for key in pairs(enabled) do enabled[key] = false; syncControl(key, false) end
            invalidateWork()
            active = nil
            lastError = "This adapter supports only the three confirmed Blox Fruits sea Place IDs."
            announce(lastError)
            return false
        end
        if enabled[feature] == requested then syncControl(feature, enabled[feature]); return enabled[feature] end
        enabled[feature] = requested
        syncControl(feature, requested)
        invalidateWork()
        active = chooseFeature()
        lastError = nil
        announce(labels[feature] .. (requested and " enabled. Waiting for observed game progress." or " disabled."))
        return enabled[feature]
    end
    local function getState()
        local toggles, observed = {}, {}
        for key, value in pairs(enabled) do toggles[key] = value end
        for key, value in pairs(progress) do observed[key] = value end
        return { enabled = toggles, closed = closed, busy = busy, active = active, status = status, lastError = lastError, progress = observed, pendingLoot = pendingLoot and pendingLoot.kind or false, questSource = questSelection and questSelection.source or false, questFailures = questFailures }
    end
    env.onCleanup(dispose)
    characterConnection = env.own(player.CharacterAdded, function()
        if closed then return end
        invalidateWork()
        enemyCache, lootCache, enemyCacheAt, lootCacheAt = {}, {}, -math.huge, -math.huge
        bossReady, farmReady = false, false
        active = chooseFeature()
        status = active and labels[active] .. ": reacquiring the new character." or "All automation is off."
    end)
    heartbeatConnection = env.own(RunService.Heartbeat, function(dt)
        if closed or type(dt) ~= "number" or dt < 0 or dt ~= dt or dt == math.huge then return end
        clock, accumulated = clock + dt, accumulated + dt
        if accumulated < 0.25 then return end
        accumulated = 0
        if combat and enabled[combat.feature] then observeCombatHealth(combat.feature) end
        if enabled.boss or enabled.farm then refreshArbitration() end
        local feature = chooseFeature()
        if busy then
            if pendingFeature ~= feature then
                invalidateWork()
                active = feature
                return
            end
            if pendingDeadline and clock >= pendingDeadline then
                local feature = pendingFeature
                invalidateWork()
                if feature then pauseFeature(feature, "A game operation did not respond within 6 seconds. Pending work was cancelled.") end
            end
            return
        end
        if not feature then return end
        if active ~= feature then resetWork(); active = feature end
        local token = revision
        busy, pendingFeature, pendingDeadline = true, feature, clock + 6
        local scheduled, thread = pcall(task.spawn, function()
            local ok = pcall(step, feature, token)
            if revision == token then
                pendingThread, pendingDeadline, pendingFeature, busy = nil, nil, nil, false
                if not ok and valid(token, feature) then pauseFeature(feature, "A required game object or normal client action was unavailable. Check the current game version before enabling again.") end
            end
        end)
        if not scheduled then
            busy, pendingFeature, pendingDeadline = false, nil, nil
            pauseFeature(feature, "The game controller could not schedule its next bounded step.")
        elseif busy and revision == token then pendingThread = thread end
    end)
    return { setEnabled = setEnabled, getState = getState, dispose = dispose }
end)`;
