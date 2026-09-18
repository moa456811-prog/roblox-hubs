--[[
    A7DEV | Ride A Pet V6
    Created by a7med_hub

    Game profile generated from:
    Ride A Pet place dump / PlaceId 124216119978534

    Adapter is specific to this game. It does not reuse paths/remotes from another place.
]]

local ENV = (getgenv and getgenv()) or _G
if ENV.__A7DEV_RIDE_A_PET then
    ENV.__A7DEV_RIDE_A_PET.Running = false
    pcall(function()
        if ENV.__A7DEV_RIDE_A_PET.Gui then
            ENV.__A7DEV_RIDE_A_PET.Gui:Destroy()
        end
    end)
end

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local CoreGui = game:GetService("CoreGui")
local TweenService = game:GetService("TweenService")
local GuiService = game:GetService("GuiService")
local StarterGui = game:GetService("StarterGui")
local HttpService = game:GetService("HttpService")

local LocalPlayer = Players.LocalPlayer
local Backpack = LocalPlayer:WaitForChild("Backpack")
local GameRemotes = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Game")

local PROFILE = {
    Name = "Ride A Pet",
    PlaceId = 124216119978534,
    Remotes = {
        EggPickup = "EggPickup",
        BasketDrop = "BasketDrop",
        EggPlaced = "EggPlaced",
        PetCollect = "PetCollect",
        FeedPet = "FeedPet",
        Rebirth = "Rebirth",
        BuyWithCash = "BuyWithCash",
        Autobuy = "Autobuy",
        PickupPet = "PickupPet",
        Mounting = "Mounting",
    }
}

local State = {
    Running = true,
    Gui = nil,
    ActiveTab = "Main",
    SelectedFood = "Grass",
    SelectedGear = "Advanced Radar",
    MoveSpeed = 250,
    ApproachSpeed = 75,
    TargetMode = "Highest Rarity",
    MaxEggDistance = "Unlimited",
    MoveBusy = false,
    Paused = false,
    CollisionCache = {},
    Counters = {
        EggsPicked = 0,
        PickupFails = 0,
        BasketDrops = 0,
        EggsPlaced = 0,
        Hatches = 0,
        CashCollects = 0,
        Feeds = 0,
        Rebirths = 0,
    },
    SelectedRarities = {
        Common = false,
        Rare = false,
        Epic = false,
        Legendary = true,
        Mythic = true,
        Divine = true,
        Ethereal = true,
    },
    Toggles = {
        AutoEggPickup = false,
        AutoBasketDrop = false,
        AutoPlaceEggs = false,
        AutoHatch = false,
        AutoCash = false,
        TeleportCash = true,
        AutoFeed = false,
        AutoBuyFood = false,
        AutoRebirth = false,
        ReturnAfterEggFarm = false,
        Noclip = false,
    },
    Speed = 16,
    LastStatus = "Ready",
    WarnedNoFirePrompt = false,
}
ENV.__A7DEV_RIDE_A_PET = State

local DISCORD_INVITE = "https://discord.gg/5MmsD6gZN"

-- Opens the Discord invite URL when the script is executed. Joining the server still
-- requires the normal Discord confirmation. Clipboard is kept as a fallback.
local function openDiscordInvite(showNotification)
    local copied = false
    local opened = false

    local clipboard = rawget(ENV, "setclipboard") or rawget(ENV, "toclipboard")
    if not clipboard then
        local ok1, value1 = pcall(function() return setclipboard end)
        if ok1 and type(value1) == "function" then clipboard = value1 end
    end

    local opener = rawget(ENV, "openurl")
        or rawget(ENV, "open_url")
        or rawget(ENV, "openbrowser")
        or rawget(ENV, "open_browser")

    if type(opener) == "function" then
        opened = pcall(function()
            opener(DISCORD_INVITE)
        end)
    end

    -- Roblox/executor fallback. Some environments expose this, others block it.
    if not opened then
        opened = pcall(function()
            GuiService:OpenBrowserWindow(DISCORD_INVITE)
        end)
    end

    if not opened then
        opened = pcall(function()
            StarterGui:SetCore("OpenBrowserWindow", DISCORD_INVITE)
        end)
    end

    if not opened and type(clipboard) == "function" then
        copied = pcall(function()
            clipboard(DISCORD_INVITE)
        end)
    end

    if showNotification then
        pcall(function()
            local text
            if opened then
                text = "Discord invite opened • discord.gg/5MmsD6gZN"
            elseif copied then
                text = "URL opener unavailable • invite copied"
            else
                text = "Discord: discord.gg/5MmsD6gZN"
            end
            StarterGui:SetCore("SendNotification", {
                Title = "A7DEV • Discord",
                Text = text,
                Duration = 8,
            })
        end)
    end

    return copied, opened
end

-- Execute the invite URL once this script has initialized.
task.defer(function()
    task.wait(1)
    openDiscordInvite(true)
end)

local function remote(name)
    return GameRemotes:FindFirstChild(PROFILE.Remotes[name] or name)
end

local function fire(name, ...)
    local r = remote(name)
    if not r or not r:IsA("RemoteEvent") then
        return false, "missing remote: " .. tostring(name)
    end
    local args = table.pack(...)
    return pcall(function()
        r:FireServer(table.unpack(args, 1, args.n))
    end)
end

local function getCharacter()
    local character = LocalPlayer.Character
    if not character then return nil end
    return character
end

local function getRoot()
    local character = getCharacter()
    return character and character:FindFirstChild("HumanoidRootPart") or nil
end

local function getHumanoid()
    local character = getCharacter()
    return character and character:FindFirstChildOfClass("Humanoid") or nil
end

local function restoreCollisions()
    for part, oldValue in pairs(State.CollisionCache) do
        if part and part.Parent then
            pcall(function() part.CanCollide = oldValue end)
        end
        State.CollisionCache[part] = nil
    end
end

local function formatNumber(n)
    n = tonumber(n) or 0
    local abs = math.abs(n)
    if abs >= 1e15 then return string.format("%.2fQ", n / 1e15) end
    if abs >= 1e12 then return string.format("%.2fT", n / 1e12) end
    if abs >= 1e9 then return string.format("%.2fB", n / 1e9) end
    if abs >= 1e6 then return string.format("%.2fM", n / 1e6) end
    if abs >= 1e3 then return string.format("%.2fK", n / 1e3) end
    return tostring(math.floor(n))
end

local function getSavedValue(name)
    local saved = LocalPlayer:FindFirstChild("SavedData")
    local value = saved and saved:FindFirstChild(name)
    return value and value.Value or nil
end

local function getActiveEggs()
    local serverData = ReplicatedStorage:FindFirstChild("ServerData")
    return (serverData and serverData:FindFirstChild("ActiveEggs")) or ReplicatedStorage:FindFirstChild("ActiveEggs")
end

local function getPlots()
    return workspace:FindFirstChild("Plots")
end

local function getMyPlot()
    local plots = getPlots()
    if not plots then return nil end

    for _, plot in ipairs(plots:GetChildren()) do
        local data = plot:FindFirstChild("Data")
        local owner = data and data:FindFirstChild("Owner")
        if owner and owner.Value == LocalPlayer then
            return plot
        end
    end

    return nil
end

local function getOwnPets()
    local list = {}
    for _, pet in ipairs(CollectionService:GetTagged("Pet")) do
        if pet and pet.Parent and pet:GetAttribute("OwnerUserId") == LocalPlayer.UserId then
            local key = pet:GetAttribute("PetKey")
            if key then
                table.insert(list, pet)
            end
        end
    end
    return list
end

local function getFreeNest()
    local plot = getMyPlot()
    local nests = plot and plot:FindFirstChild("Nests")
    if not plot or not nests then return nil end

    -- The original client only enables placement when this attribute matches us.
    local loadedFor = plot:GetAttribute("NestsOwnerLoaded")
    if loadedFor ~= nil and loadedFor ~= LocalPlayer.UserId then
        return nil
    end

    local free = {}
    for _, nest in ipairs(nests:GetChildren()) do
        if nest:GetAttribute("Unlocked") == true and nest:GetAttribute("Occupied") ~= true then
            table.insert(free, nest)
        end
    end

    table.sort(free, function(a, b)
        local an, bn = tonumber(a.Name), tonumber(b.Name)
        if an and bn then return an < bn end
        return a.Name < b.Name
    end)

    return free[1]
end

local function isEggTool(tool)
    if not tool or not tool:IsA("Tool") then return false end
    if tool:GetAttribute("Egg") then return true end
    local ok, tagged = pcall(function()
        return CollectionService:HasTag(tool, "Egg")
    end)
    return ok and tagged or false
end

local function findEggTool()
    local character = getCharacter()
    if character then
        for _, child in ipairs(character:GetChildren()) do
            if isEggTool(child) then return child end
        end
    end
    for _, child in ipairs(Backpack:GetChildren()) do
        if isEggTool(child) then return child end
    end
    return nil
end

local Foods = nil
local Shop = nil
local RebirthsData = nil
local GeneralData = nil
local EggsData = nil
pcall(function()
    Foods = require(ReplicatedStorage:WaitForChild("GameData"):WaitForChild("Foods"))
    Shop = require(ReplicatedStorage.GameData:WaitForChild("Shop"))
    RebirthsData = require(ReplicatedStorage.GameData:WaitForChild("Rebirths"))
    GeneralData = require(ReplicatedStorage.GameData:WaitForChild("General"))
    EggsData = require(ReplicatedStorage.GameData:WaitForChild("Eggs"))
end)

local FOOD_OPTIONS = {"Grass", "Bone", "Meat", "Magic Apple", "Dragonfruit"}
local GEAR_OPTIONS = {"Advanced Radar", "Jewel Radar", "Royal Radar", "Magic Radar", "Angelic Radar", "Eternal Radar", "Basic Lantern", "Cool Lantern", "Royal Lantern", "Magic Lantern", "Eternal Lantern"}
local SPEED_OPTIONS = {16, 24, 32, 50, 75, 100}
local TWEEN_SPEED_OPTIONS = {75, 125, 175, 250, 350, 500, 700}
local TARGET_MODE_OPTIONS = {"Highest Rarity", "Nearest"}
local MAX_EGG_DISTANCE_OPTIONS = {"50", "100", "250", "500", "1000", "2500", "Unlimited"}
local RARITY_OPTIONS = {"Common", "Rare", "Epic", "Legendary", "Mythic", "Divine", "Ethereal"}
local RARITY_RANK = {
    Common = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
    Mythic = 5,
    Divine = 6,
    Ethereal = 7,
}

local function getEggRarity(eggName)
    local data = EggsData and EggsData[eggName]
    return (data and data.Rarity) or "Unknown"
end

local function isRaritySelected(rarity)
    return rarity and State.SelectedRarities[rarity] == true
end

local function isEggSelected(eggName)
    return isRaritySelected(getEggRarity(eggName))
end

local function maxEggDistanceValue()
    if State.MaxEggDistance == "Unlimited" then
        return math.huge
    end
    return tonumber(State.MaxEggDistance) or math.huge
end

local function candidateComesFirst(a, b)
    if State.TargetMode == "Nearest" then
        return a.Distance < b.Distance
    end

    local ar = RARITY_RANK[a.Rarity] or 0
    local br = RARITY_RANK[b.Rarity] or 0
    if ar ~= br then
        return ar > br
    end
    return a.Distance < b.Distance
end

local function getSelectedBasketCount()
    local basket = LocalPlayer:FindFirstChild("Basket")
    if not basket then return 0 end
    local count = 0
    for _, item in ipairs(basket:GetChildren()) do
        local eggName = item:GetAttribute("Egg")
        if eggName and isEggSelected(eggName) then
            count = count + 1
        end
    end
    return count
end

local function selectedRarityText()
    local out = {}
    for _, rarity in ipairs(RARITY_OPTIONS) do
        if State.SelectedRarities[rarity] then
            table.insert(out, rarity)
        end
    end
    return #out > 0 and table.concat(out, ", ") or "NONE"
end

local function eggNameFromTool(tool)
    if not tool or not tool:IsA("Tool") then return nil end
    local attr = tool:GetAttribute("Egg")
    if attr and EggsData and EggsData[attr] then return attr end
    if EggsData and EggsData[tool.Name] then return tool.Name end
    return attr or tool.Name
end

local function findSelectedEggTool()
    local function scan(container)
        if not container then return nil end
        for _, tool in ipairs(container:GetChildren()) do
            if isEggTool(tool) then
                local eggName = eggNameFromTool(tool)
                if eggName and isEggSelected(eggName) then
                    return tool
                end
            end
        end
        return nil
    end
    return scan(getCharacter()) or scan(Backpack)
end

local function ownsRequiredPet(requiredName)
    if not requiredName then return true end

    for _, pet in ipairs(getOwnPets()) do
        local petName = pet:GetAttribute("PetName") or pet.Name
        if petName == requiredName then return true end
    end

    local function scanTools(container)
        if not container then return false end
        for _, tool in ipairs(container:GetChildren()) do
            if tool:IsA("Tool") and tool:GetAttribute("PetKey") then
                local base = string.match(tool.Name, "^(.-) %[") or tool.Name
                if base == requiredName then return true end
            end
        end
        return false
    end

    if scanTools(Backpack) or scanTools(getCharacter()) then return true end

    local root = getRoot()
    local joint = root and root:FindFirstChild("PetMountJoint")
    local mounted = joint and joint.Part1 and joint.Part1.Parent
    if mounted and mounted:GetAttribute("PetName") == requiredName then
        return true
    end

    return false
end

local function findFoodTool(foodName)
    local function scan(container)
        if not container then return nil end
        for _, tool in ipairs(container:GetChildren()) do
            if tool:IsA("Tool") and tool.Name == foodName then
                return tool
            end
        end
        return nil
    end
    return scan(getCharacter()) or scan(Backpack)
end

local function equipTool(tool)
    if not tool then return false end
    local humanoid = getHumanoid()
    if not humanoid then return false end
    if tool.Parent ~= getCharacter() then
        pcall(function() humanoid:EquipTool(tool) end)
        task.wait(0.08)
    end
    return tool.Parent == getCharacter()
end

local function worldPositionOf(instance)
    if not instance then return nil end
    if instance:IsA("BasePart") then return instance.Position end
    if instance:IsA("Model") then return instance:GetPivot().Position end
    local part = instance:FindFirstChildWhichIsA("BasePart", true)
    return part and part.Position or nil
end

local StatusLabel = nil
local StatsLabel = nil
local function setStatus(text)
    State.LastStatus = tostring(text)
    if StatusLabel then
        StatusLabel.Text = "STATUS  •  " .. State.LastStatus
    end
end

local function toVector3(pos)
    if typeof(pos) == "CFrame" then return pos.Position end
    if typeof(pos) == "Vector3" then return pos end
    return nil
end

local function tweenMoveTo(pos, stopDistance, yOffset)
    local root = getRoot()
    local humanoid = getHumanoid()
    local target = toVector3(pos)
    if not root or not target then return false end

    stopDistance = stopDistance or 7
    local targetPos = target + Vector3.new(0, yOffset or 3, 0)
    local firstDistance = (root.Position - targetPos).Magnitude
    if firstDistance <= stopDistance then return true end

    -- V6: still 100% Tween movement, but long trips no longer crawl at 75 studs/s.
    -- Cruise uses the selected speed (250 by default). The final approach is fixed
    -- to 75 studs/s to keep proximity/remotes more reliable near the target.
    local cruiseSpeed = math.max(75, tonumber(State.MoveSpeed) or 250)
    local approachSpeed = math.max(40, tonumber(State.ApproachSpeed) or 75)
    local approachRadius = 42
    local segmentLength = 160
    local maxTravelTime = math.clamp((firstDistance / math.max(cruiseSpeed, 1)) * 2.2 + 5, 4, 35)
    local travelStarted = os.clock()

    local character = getCharacter()
    local originalCharacter = character
    local oldCollisions = {}
    if character then
        for _, obj in ipairs(character:GetDescendants()) do
            if obj:IsA("BasePart") then
                oldCollisions[obj] = obj.CanCollide
                obj.CanCollide = false
            end
        end
    end

    local oldAutoRotate = humanoid and humanoid.AutoRotate
    if humanoid then humanoid.AutoRotate = false end

    local function restoreMovementState()
        for part, value in pairs(oldCollisions) do
            if part and part.Parent then
                pcall(function() part.CanCollide = value end)
            end
        end
        if humanoid and humanoid.Parent and oldAutoRotate ~= nil then
            pcall(function() humanoid.AutoRotate = oldAutoRotate end)
        end
    end

    local function runSegment(segmentTarget, speed)
        root = getRoot()
        if not root or getCharacter() ~= originalCharacter then return false end

        local distance = (root.Position - segmentTarget).Magnitude
        if distance <= 1.25 then return true end

        pcall(function()
            root.AssemblyLinearVelocity = Vector3.zero
            root.AssemblyAngularVelocity = Vector3.zero
        end)

        local rotation = root.CFrame - root.Position
        local duration = math.clamp(distance / math.max(speed, 1), 0.045, 1.85)
        local tween = TweenService:Create(
            root,
            TweenInfo.new(duration, Enum.EasingStyle.Linear, Enum.EasingDirection.Out),
            {CFrame = CFrame.new(segmentTarget) * rotation}
        )

        local finished = false
        local state = nil
        local conn = tween.Completed:Connect(function(playbackState)
            state = playbackState
            finished = true
        end)

        local ok = pcall(function() tween:Play() end)
        if not ok then
            conn:Disconnect()
            return false
        end

        local deadline = os.clock() + duration + 0.85
        while State.Running and not State.Paused and not finished and os.clock() < deadline do
            root = getRoot()
            if not root or getCharacter() ~= originalCharacter then break end
            pcall(function()
                root.AssemblyLinearVelocity = Vector3.zero
                root.AssemblyAngularVelocity = Vector3.zero
            end)
            task.wait(0.03)
        end

        if not finished then
            pcall(function() tween:Cancel() end)
        end
        conn:Disconnect()

        root = getRoot()
        if not root then return false end
        if finished and (state == Enum.PlaybackState.Completed or state == nil) then
            return true
        end
        return (root.Position - segmentTarget).Magnitude <= 12
    end

    local success = false
    while State.Running and not State.Paused and os.clock() - travelStarted <= maxTravelTime do
        root = getRoot()
        if not root or getCharacter() ~= originalCharacter then break end

        local delta = targetPos - root.Position
        local distance = delta.Magnitude
        if distance <= stopDistance then
            success = true
            break
        end

        local speed = distance <= approachRadius and approachSpeed or cruiseSpeed
        local stepDistance
        if distance <= approachRadius then
            stepDistance = math.max(1, distance - math.max(stopDistance * 0.35, 1))
        else
            -- Stop just before the final-approach radius, then let the 75-speed
            -- segment handle the server-sensitive last meters.
            local maxCruiseStep = math.max(8, distance - approachRadius + 4)
            stepDistance = math.min(segmentLength, maxCruiseStep)
        end

        local segmentTarget = root.Position + delta.Unit * math.min(stepDistance, distance)
        if not runSegment(segmentTarget, speed) then
            -- Recalculate once from the actual replicated position instead of
            -- waiting on one long broken tween.
            task.wait(0.05)
            root = getRoot()
            if not root then break end
            if (root.Position - targetPos).Magnitude > distance + 20 then break end
        end
    end

    root = getRoot()
    if root and (root.Position - targetPos).Magnitude <= math.max(stopDistance + 5, 12) then
        success = true
    end

    restoreMovementState()
    return success
end

local function moveTo(pos, stopDistance, yOffset)
    if State.MoveBusy or State.Paused then return false end
    State.MoveBusy = true

    local ok, result = pcall(function()
        return tweenMoveTo(pos, stopDistance, yOffset)
    end)

    State.MoveBusy = false
    if not ok then
        setStatus("Tween error: " .. tostring(result))
        return false
    end
    return result == true
end

local function tpTo(pos, yOffset)
    return moveTo(pos, 7, yOffset)
end

local Adapter = {}

function Adapter.CollectEggsPass()
    local active = getActiveEggs()
    local root = getRoot()
    if not active or not root then return 0 end

    local candidates = {}
    for _, eggState in ipairs(active:GetChildren()) do
        local privateTo = eggState:GetAttribute("PrivateTo")
        local eggName = eggState:GetAttribute("Egg")
        local pos = eggState:GetAttribute("Position")
        local spawnCF = eggState:GetAttribute("SpawnCFrame")
        local target = toVector3(pos or spawnCF)

        if eggName
            and isEggSelected(eggName)
            and (not privateTo or privateTo == LocalPlayer.UserId)
            and target then
            local distance = (target - root.Position).Magnitude
            if distance <= maxEggDistanceValue() then
                table.insert(candidates, {
                    State = eggState,
                    Egg = eggName,
                    Rarity = getEggRarity(eggName),
                    Position = target,
                    Distance = distance,
                })
            end
        end
    end

    table.sort(candidates, candidateComesFirst)

    local targetInfo = candidates[1]
    if not targetInfo then return 0 end
    if not State.Running or State.Paused or not State.Toggles.AutoEggPickup then return 0 end

    setStatus("Moving to " .. targetInfo.Egg .. " [" .. targetInfo.Rarity .. "]")
    local moved = moveTo(targetInfo.Position, 8, 3)
    if not moved then
        setStatus("Tween failed: " .. targetInfo.Egg .. " • try cruise 125/175")
        return 0
    end

    task.wait(0.12)
    root = getRoot()
    if root and (root.Position - targetInfo.Position).Magnitude <= 18 then
        local activeBefore = targetInfo.State.Parent ~= nil
        local basket = LocalPlayer:FindFirstChild("Basket")
        local basketBefore = basket and #basket:GetChildren() or 0
        local ok = fire("EggPickup", targetInfo.State.Name)
        if ok then
            local accepted = false
            local started = os.clock()
            while os.clock() - started < 1.2 do
                basket = LocalPlayer:FindFirstChild("Basket")
                local basketNow = basket and #basket:GetChildren() or 0
                if targetInfo.State.Parent == nil or basketNow > basketBefore then
                    accepted = true
                    break
                end
                task.wait(0.06)
            end
            if accepted or not activeBefore then
                State.Counters.EggsPicked = State.Counters.EggsPicked + 1
                if State.Toggles.ReturnAfterEggFarm and State.Running and not State.Paused then
                    Adapter.TeleportToPlot()
                end
                return 1
            end
            State.Counters.PickupFails = State.Counters.PickupFails + 1
            setStatus("Pickup rejected/server distance check • final approach 75 active")
        end
    end

    return 0
end

function Adapter.DropBasketPass()
    local basket = LocalPlayer:FindFirstChild("Basket")
    if not basket then return 0 end
    local dropped = 0

    for _, item in ipairs(basket:GetChildren()) do
        if not State.Running or State.Paused or not State.Toggles.AutoBasketDrop then break end
        local eggName = item:GetAttribute("Egg")
        if eggName and isEggSelected(eggName) then
            local ok = fire("BasketDrop", eggName)
            if ok then
                dropped = dropped + 1
                State.Counters.BasketDrops = State.Counters.BasketDrops + 1
            end
            task.wait(0.18)
        end
    end
    return dropped
end

function Adapter.PlaceEggPass()
    local nest = getFreeNest()
    local tool = findSelectedEggTool()

    if not nest then
        setStatus("Auto Place: no free unlocked nest")
        return false
    end
    if not tool then
        setStatus("Auto Place: no selected egg tool")
        return false
    end

    if not equipTool(tool) then
        setStatus("Auto Place: could not equip egg")
        return false
    end

    -- Let the game's EggPlacing LocalScript create its PlacePromptAnchor.
    task.wait(0.16)

    local function findPlacePrompt()
        for _, d in ipairs(nest:GetDescendants()) do
            if d:IsA("ProximityPrompt") and d.Enabled then
                local parentName = d.Parent and d.Parent.Name or ""
                if d.Name == "Place" or parentName == "PlacePromptAnchor" then
                    return d
                end
            end
        end
        return nil
    end

    local placePrompt = findPlacePrompt()
    local model = nest:FindFirstChild("Model")
    local targetObject = (placePrompt and placePrompt.Parent) or model or nest
    local nestPos = worldPositionOf(targetObject)

    if nestPos then
        setStatus("Auto Place: Tween to nest " .. tostring(nest.Name))
        if not moveTo(nestPos, 8, 3) then
            setStatus("Auto Place: Tween to nest failed")
            return false
        end
    end

    -- Re-equip after the Tween if needed and give the prompt one more refresh.
    tool = findSelectedEggTool() or tool
    if tool and tool.Parent ~= getCharacter() then
        equipTool(tool)
    end
    task.wait(0.18)
    placePrompt = findPlacePrompt() or placePrompt

    local function accepted()
        return nest.Parent ~= nil and nest:GetAttribute("Occupied") == true
    end

    local function waitAccepted(seconds)
        local started = os.clock()
        while State.Running and not State.Paused and os.clock() - started < seconds do
            if accepted() then return true end
            task.wait(0.06)
        end
        return accepted()
    end

    -- Prefer the exact Place prompt used by the original game client.
    local firePrompt = rawget(ENV, "fireproximityprompt")
    if not firePrompt then
        local okGlobal, globalValue = pcall(function() return fireproximityprompt end)
        if okGlobal then firePrompt = globalValue end
    end

    if placePrompt and type(firePrompt) == "function" then
        local requested = pcall(function() firePrompt(placePrompt) end)
        if requested and waitAccepted(1.0) then
            State.Counters.EggsPlaced = State.Counters.EggsPlaced + 1
            return true
        end
    end

    -- Fallback: exact remote and payload used by that Place prompt, now from the correct distance.
    local ok = fire("EggPlaced", {NestId = nest.Name})
    if ok and waitAccepted(1.35) then
        State.Counters.EggsPlaced = State.Counters.EggsPlaced + 1
        return true
    end

    setStatus("Auto Place rejected • no server confirmation")
    return false
end

function Adapter.HatchPass()
    local plot = getMyPlot()
    if not plot then return 0 end

    local fired = 0
    local firePrompt = rawget(ENV, "fireproximityprompt") or fireproximityprompt
    if type(firePrompt) ~= "function" then
        if not State.WarnedNoFirePrompt then
            State.WarnedNoFirePrompt = true
            setStatus("Auto Hatch needs fireproximityprompt support")
        end
        return 0
    end

    for _, descendant in ipairs(plot:GetDescendants()) do
        if not State.Running or State.Paused or not State.Toggles.AutoHatch then break end
        if descendant:IsA("ProximityPrompt") and descendant.Name == "Hatch" and descendant.Enabled then
            local pos = worldPositionOf(descendant.Parent)
            if pos then tpTo(pos, 3) end
            task.wait(0.08)
            local ok = pcall(function() firePrompt(descendant) end)
            if ok then
                fired = fired + 1
                State.Counters.Hatches = State.Counters.Hatches + 1
            end
            task.wait(0.25)
        end
    end
    return fired
end

function Adapter.CollectCashPass()
    local pets = getOwnPets()
    if #pets == 0 then return 0 end

    local root = getRoot()
    local origin = root and root.CFrame or nil
    local collected = 0

    for _, pet in ipairs(pets) do
        if not State.Running or not State.Toggles.AutoCash then break end
        local key = pet:GetAttribute("PetKey")
        if key then
            if State.Toggles.TeleportCash then
                local pos = worldPositionOf(pet)
                if pos then
                    tpTo(pos, 3)
                    task.wait(0.08)
                end
            end
            local ok = fire("PetCollect", key)
            if ok then
                collected = collected + 1
                State.Counters.CashCollects = State.Counters.CashCollects + 1
            end
            task.wait(0.12)
        end
    end

    if State.Toggles.TeleportCash and origin and State.Running and not State.Paused then
        moveTo(origin.Position, 10, 3)
    end

    return collected
end

function Adapter.FeedOnePet()
    local pets = getOwnPets()
    if #pets == 0 then return false, "No pet" end

    local tool = findFoodTool(State.SelectedFood)
    if not tool then return false, "No " .. State.SelectedFood end
    equipTool(tool)

    local pet = pets[1]
    local key = pet:GetAttribute("PetKey")
    if not key then return false, "No PetKey" end

    local ok = fire("FeedPet", key, State.SelectedFood)
    if ok then State.Counters.Feeds = State.Counters.Feeds + 1 end
    return ok, ok and "Fed " .. tostring(pet:GetAttribute("PetName") or pet.Name) or "Feed failed"
end

function Adapter.BuyFood()
    local item = State.SelectedFood
    return fire("BuyWithCash", "Food", item)
end

function Adapter.BuyGear()
    return fire("BuyWithCash", "Gears", State.SelectedGear)
end

function Adapter.TryRebirth()
    local rebirths = tonumber(getSavedValue("Rebirths")) or 0
    local cash = tonumber(getSavedValue("Cash")) or 0

    if RebirthsData and RebirthsData.Cap and rebirths >= RebirthsData.Cap then
        return false, "Rebirth cap"
    end

    local cost = RebirthsData and RebirthsData.GetCost and RebirthsData.GetCost(rebirths) or 0
    if cash < cost then
        return false, "Need $" .. formatNumber(cost)
    end

    if GeneralData and GeneralData.RebirthRequirements then
        local required = GeneralData.RebirthRequirements[rebirths + 1]
        if required and not ownsRequiredPet(required) then
            return false, "Need pet: " .. required
        end
    end

    local ok = fire("Rebirth")
    if ok then State.Counters.Rebirths = State.Counters.Rebirths + 1 end
    return ok, ok and "Rebirth request sent" or "Rebirth failed"
end

function Adapter.TeleportToPlot()
    local plot = getMyPlot()
    local baseplate = plot and plot:FindFirstChild("Baseplate")
    local plotPos = baseplate and baseplate.Position or (plot and worldPositionOf(plot))
    if not plotPos then return false end
    setStatus("Tweening to my plot")
    return moveTo(plotPos, 12, 6)
end

function Adapter.TeleportToNearestEgg()
    local active = getActiveEggs()
    local root = getRoot()
    if not active or not root then return false end

    local candidates = {}
    for _, egg in ipairs(active:GetChildren()) do
        local privateTo = egg:GetAttribute("PrivateTo")
        local eggName = egg:GetAttribute("Egg")
        local pos = egg:GetAttribute("Position")        local spawnCF = egg:GetAttribute("SpawnCFrame")
        local p = toVector3(pos or spawnCF)
        if p and eggName and isEggSelected(eggName) and (not privateTo or privateTo == LocalPlayer.UserId) then
            local d = (p - root.Position).Magnitude
            if d <= maxEggDistanceValue() then
                table.insert(candidates, {
                    Egg = eggName,
                    Rarity = getEggRarity(eggName),
                    Position = p,
                    Distance = d,
                })
            end
        end
    end

    table.sort(candidates, candidateComesFirst)
    local best = candidates[1]
    if not best then return false end
    setStatus("Moving to " .. tostring(best.Egg) .. " [" .. tostring(best.Rarity) .. "] • " .. math.floor(best.Distance) .. " studs")
    return moveTo(best.Position, 8, 3)
end

-- UI -----------------------------------------------------------------------
-- V6 layout follows the supplied Informant-style reference more closely:
-- compact double-border window, horizontal top tabs, two-column groupboxes,
-- square checkboxes, tiny fields/buttons, thin red section lines, mono text.
local old = CoreGui:FindFirstChild("A7DEV_RideAPet")
if old then old:Destroy() end

local parent = CoreGui
do
    local ok, hui = pcall(function()
        return gethui and gethui() or nil
    end)
    if ok and hui then parent = hui end
end

local Theme = {
    Window = Color3.fromRGB(7, 8, 8),
    Window2 = Color3.fromRGB(10, 10, 11),
    Panel = Color3.fromRGB(8, 8, 9),
    Panel2 = Color3.fromRGB(12, 12, 13),
    Field = Color3.fromRGB(5, 5, 6),
    Border = Color3.fromRGB(55, 63, 63),
    BorderDark = Color3.fromRGB(29, 31, 31),
    Red = Color3.fromRGB(162, 12, 20),
    RedBright = Color3.fromRGB(194, 20, 28),
    RedDark = Color3.fromRGB(91, 7, 12),
    Text = Color3.fromRGB(214, 214, 214),
    TextDim = Color3.fromRGB(133, 133, 133),
    TextFaint = Color3.fromRGB(83, 83, 83),
}
local UIFont = Enum.Font.Code

local function stroke(obj, color, thickness)
    local s = Instance.new("UIStroke")
    s.Color = color or Theme.BorderDark
    s.Thickness = thickness or 1
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = obj
    return s
end

local Gui = Instance.new("ScreenGui")
Gui.Name = "A7DEV_RideAPet"
Gui.ResetOnSpawn = false
Gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
Gui.Parent = parent
State.Gui = Gui

local Main = Instance.new("Frame")
Main.Name = "Main"
Main.Size = UDim2.fromOffset(626, 446)
Main.Position = UDim2.new(0.5, -313, 0.5, -223)
Main.BackgroundColor3 = Theme.Window
Main.BorderSizePixel = 0
Main.Parent = Gui
stroke(Main, Theme.Border, 1)

local Inner = Instance.new("Frame")
Inner.Position = UDim2.fromOffset(3, 3)
Inner.Size = UDim2.new(1, -6, 1, -6)
Inner.BackgroundTransparency = 1
Inner.BorderSizePixel = 0
Inner.Parent = Main
stroke(Inner, Color3.fromRGB(20, 24, 24), 1)

local Top = Instance.new("Frame")
Top.Position = UDim2.fromOffset(6, 6)
Top.Size = UDim2.new(1, -12, 0, 22)
Top.BackgroundColor3 = Theme.Window2
Top.BorderSizePixel = 0
Top.Parent = Main

local Title = Instance.new("TextLabel")
Title.BackgroundTransparency = 1
Title.Position = UDim2.fromOffset(4, 0)
Title.Size = UDim2.new(0.62, 0, 1, 0)
Title.Font = UIFont
Title.Text = "A7DEV.hub | Ride A Pet V6"
Title.TextColor3 = Theme.Text
Title.TextSize = 10
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.Parent = Top

local TinyStatus = Instance.new("TextLabel")
TinyStatus.BackgroundTransparency = 1
TinyStatus.Position = UDim2.new(0.62, 0, 0, 0)
TinyStatus.Size = UDim2.new(0.30, 0, 1, 0)
TinyStatus.Font = UIFont
TinyStatus.Text = "a7med_hub"
TinyStatus.TextColor3 = Theme.TextDim
TinyStatus.TextSize = 9
TinyStatus.TextXAlignment = Enum.TextXAlignment.Right
TinyStatus.Parent = Top

local Close = Instance.new("TextButton")
Close.Size = UDim2.fromOffset(20, 14)
Close.Position = UDim2.new(1, -23, 0, 4)
Close.BackgroundColor3 = Theme.Field
Close.BorderSizePixel = 0
Close.Text = "x"
Close.Font = UIFont
Close.TextSize = 9
Close.TextColor3 = Theme.TextDim
Close.AutoButtonColor = false
Close.Parent = Top
local closeStroke = stroke(Close, Theme.BorderDark, 1)
Close.MouseEnter:Connect(function() closeStroke.Color = Theme.RedBright; Close.TextColor3 = Theme.Text end)
Close.MouseLeave:Connect(function() closeStroke.Color = Theme.BorderDark; Close.TextColor3 = Theme.TextDim end)

local TopRedLine = Instance.new("Frame")
TopRedLine.Position = UDim2.fromOffset(7, 29)
TopRedLine.Size = UDim2.new(1, -14, 0, 1)
TopRedLine.BackgroundColor3 = Theme.Red
TopRedLine.BorderSizePixel = 0
TopRedLine.Parent = Main

local TabBar = Instance.new("Frame")
TabBar.Position = UDim2.fromOffset(8, 31)
TabBar.Size = UDim2.new(1, -16, 0, 24)
TabBar.BackgroundColor3 = Theme.Panel
TabBar.BorderSizePixel = 0
TabBar.Parent = Main
stroke(TabBar, Theme.BorderDark, 1)

local Pages = {}
local TabButtons = {}
local toggleRows = {}
local rarityRows = {}

local Body = Instance.new("Frame")
Body.Position = UDim2.fromOffset(8, 59)
Body.Size = UDim2.new(1, -16, 1, -85)
Body.BackgroundColor3 = Theme.Panel
Body.BorderSizePixel = 0
Body.ClipsDescendants = true
Body.Parent = Main
stroke(Body, Theme.BorderDark, 1)

local Footer = Instance.new("Frame")
Footer.Position = UDim2.new(0, 8, 1, -22)
Footer.Size = UDim2.new(1, -16, 0, 14)
Footer.BackgroundColor3 = Theme.Window2
Footer.BorderSizePixel = 0
Footer.Parent = Main
stroke(Footer, Theme.BorderDark, 1)

StatusLabel = Instance.new("TextLabel")
StatusLabel.BackgroundTransparency = 1
StatusLabel.Position = UDim2.fromOffset(4, 0)
StatusLabel.Size = UDim2.new(1, -8, 1, 0)
StatusLabel.Font = UIFont
StatusLabel.Text = "status > ready"
StatusLabel.TextColor3 = Theme.TextDim
StatusLabel.TextSize = 8
StatusLabel.TextXAlignment = Enum.TextXAlignment.Left
StatusLabel.Parent = Footer

local function makePage(name)
    local page = Instance.new("Frame")
    page.Name = name
    page.Size = UDim2.fromScale(1, 1)
    page.BackgroundTransparency = 1
    page.Visible = false
    page.Parent = Body

    local left = Instance.new("ScrollingFrame")
    left.Name = "Left"
    left.Position = UDim2.fromOffset(7, 7)
    left.Size = UDim2.new(0.5, -10, 1, -14)
    left.BackgroundTransparency = 1
    left.BorderSizePixel = 0
    left.ScrollBarThickness = 2
    left.ScrollBarImageColor3 = Theme.RedDark
    left.CanvasSize = UDim2.fromOffset(0, 0)
    left.Parent = page
    local ll = Instance.new("UIListLayout")
    ll.Padding = UDim.new(0, 7)
    ll.SortOrder = Enum.SortOrder.LayoutOrder
    ll.Parent = left
    ll:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        left.CanvasSize = UDim2.fromOffset(0, ll.AbsoluteContentSize.Y + 6)
    end)

    local right = Instance.new("ScrollingFrame")
    right.Name = "Right"
    right.Position = UDim2.new(0.5, 3, 0, 7)
    right.Size = UDim2.new(0.5, -10, 1, -14)
    right.BackgroundTransparency = 1
    right.BorderSizePixel = 0
    right.ScrollBarThickness = 2
    right.ScrollBarImageColor3 = Theme.RedDark
    right.CanvasSize = UDim2.fromOffset(0, 0)
    right.Parent = page
    local rl = Instance.new("UIListLayout")
    rl.Padding = UDim.new(0, 7)
    rl.SortOrder = Enum.SortOrder.LayoutOrder
    rl.Parent = right
    rl:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        right.CanvasSize = UDim2.fromOffset(0, rl.AbsoluteContentSize.Y + 6)
    end)

    Pages[name] = {Frame = page, Left = left, Right = right}
    return Pages[name]
end

local function selectTab(name)
    State.ActiveTab = name
    for n, pageInfo in pairs(Pages) do
        pageInfo.Frame.Visible = (n == name)
    end
    for n, b in pairs(TabButtons) do
        local active = n == name
        b.TextColor3 = active and Theme.Text or Theme.TextDim
        b.BackgroundColor3 = active and Color3.fromRGB(13, 8, 9) or Theme.Panel
        local line = b:FindFirstChild("Line")
        if line then line.Visible = active end
    end
end

local function addTopTab(name, index)
    local b = Instance.new("TextButton")
    b.Name = name
    b.Size = UDim2.fromOffset(86, 20)
    b.Position = UDim2.fromOffset(4 + ((index - 1) * 88), 2)
    b.BackgroundColor3 = Theme.Panel
    b.BorderSizePixel = 0
    b.Text = name
    b.Font = UIFont
    b.TextSize = 9
    b.TextColor3 = Theme.TextDim
    b.AutoButtonColor = false
    b.Parent = TabBar

    local line = Instance.new("Frame")
    line.Name = "Line"
    line.Position = UDim2.new(0, 3, 1, -1)
    line.Size = UDim2.new(1, -6, 0, 1)
    line.BackgroundColor3 = Theme.RedBright
    line.BorderSizePixel = 0
    line.Visible = false
    line.Parent = b

    b.MouseEnter:Connect(function()
        if State.ActiveTab ~= name then b.TextColor3 = Theme.Text end
    end)
    b.MouseLeave:Connect(function()
        if State.ActiveTab ~= name then b.TextColor3 = Theme.TextDim end
    end)
    b.Activated:Connect(function() selectTab(name) end)
    TabButtons[name] = b
end

local function makeGroup(parent, title)
    local box = Instance.new("Frame")
    box.Size = UDim2.new(1, -4, 0, 35)
    box.BackgroundColor3 = Theme.Panel
    box.BorderSizePixel = 0
    box.Parent = parent
    stroke(box, Theme.BorderDark, 1)

    local redLine = Instance.new("Frame")
    redLine.Position = UDim2.fromOffset(5, 9)
    redLine.Size = UDim2.new(1, -10, 0, 1)
    redLine.BackgroundColor3 = Theme.Red
    redLine.BorderSizePixel = 0
    redLine.Parent = box

    local header = Instance.new("TextLabel")
    header.BackgroundColor3 = Theme.Panel
    header.BorderSizePixel = 0
    header.Position = UDim2.fromOffset(7, 2)
    header.Size = UDim2.fromOffset(math.max(42, #title * 6 + 10), 14)
    header.Font = UIFont
    header.Text = title
    header.TextColor3 = Theme.TextDim
    header.TextSize = 8
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.Parent = box

    local content = Instance.new("Frame")
    content.Position = UDim2.fromOffset(5, 19)
    content.Size = UDim2.new(1, -10, 0, 10)
    content.BackgroundTransparency = 1
    content.BorderSizePixel = 0
    content.Parent = box

    local list = Instance.new("UIListLayout")
    list.Padding = UDim.new(0, 2)
    list.SortOrder = Enum.SortOrder.LayoutOrder
    list.Parent = content
    local function resize()
        local h = list.AbsoluteContentSize.Y
        content.Size = UDim2.new(1, -10, 0, h)
        box.Size = UDim2.new(1, -4, 0, h + 25)
    end
    list:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(resize)
    task.defer(resize)

    return content, box
end

local function compactRow(parent, height)
    local f = Instance.new("Frame")
    f.Size = UDim2.new(1, 0, 0, height or 20)
    f.BackgroundColor3 = Theme.Panel2
    f.BorderSizePixel = 0
    f.Parent = parent
    stroke(f, Color3.fromRGB(25, 25, 26), 1)
    return f
end

local function tinyLabel(parent, text, x, width)
    local l = Instance.new("TextLabel")
    l.BackgroundTransparency = 1
    l.Position = UDim2.fromOffset(x or 5, 0)
    l.Size = UDim2.new(0, width or 160, 1, 0)
    l.Font = UIFont
    l.Text = text
    l.TextColor3 = Theme.TextDim
    l.TextSize = 8
    l.TextXAlignment = Enum.TextXAlignment.Left
    l.TextTruncate = Enum.TextTruncate.AtEnd
    l.Parent = parent
    return l
end

local function makeCheckbox(parent, getter, setter)
    local b = Instance.new("TextButton")
    b.Size = UDim2.fromOffset(10, 10)
    b.Position = UDim2.fromOffset(5, 5)
    b.BackgroundColor3 = Theme.Field
    b.BorderSizePixel = 0
    b.Font = UIFont
    b.TextSize = 8
    b.AutoButtonColor = false
    b.Parent = parent
    local s = stroke(b, Theme.Border, 1)

    local function paint()
        local on = getter() == true
        b.BackgroundColor3 = on and Theme.RedBright or Theme.Field
        b.Text = on and "x" or ""
        b.TextColor3 = Theme.Text
        s.Color = on and Theme.RedBright or Theme.Border
    end
    b.Activated:Connect(function()
        setter(not getter())
        paint()
    end)
    paint()
    return b, paint
end

local function addToggle(parent, label, key)
    local f = compactRow(parent, 20)
    tinyLabel(f, label, 20, 210)
    local _, paint = makeCheckbox(f, function() return State.Toggles[key] end, function(v)
        State.Toggles[key] = v
        if key == "Noclip" and not v then restoreCollisions() end
        setStatus(label .. ": " .. (v and "ON" or "OFF"))
    end)
    toggleRows[key] = {Frame = f, Paint = paint}
    return toggleRows[key]
end

local function addSelectionToggle(parent, label, tableRef, key)
    local f = compactRow(parent, 20)
    tinyLabel(f, label, 20, 210)
    local _, paint = makeCheckbox(f, function() return tableRef[key] end, function(v)
        tableRef[key] = v
        setStatus(label .. ": " .. (v and "ON" or "OFF"))
    end)
    return {Frame = f, Paint = paint}
end

local function addButton(parent, label, callback)
    local b = Instance.new("TextButton")
    b.Size = UDim2.new(1, 0, 0, 20)
    b.BackgroundColor3 = Theme.Field
    b.BorderSizePixel = 0
    b.Font = UIFont
    b.Text = label
    b.TextColor3 = Theme.TextDim
    b.TextSize = 8
    b.AutoButtonColor = false
    b.Parent = parent
    local s = stroke(b, Theme.BorderDark, 1)
    b.MouseEnter:Connect(function() s.Color = Theme.RedDark; b.TextColor3 = Theme.Text end)
    b.MouseLeave:Connect(function() s.Color = Theme.BorderDark; b.TextColor3 = Theme.TextDim end)
    b.Activated:Connect(function()
        local ok, result = pcall(callback)
        if not ok then
            setStatus("Error: " .. tostring(result))
        elseif result ~= nil then
            setStatus(tostring(result))
        end
    end)
    return b
end

local function addCycle(parent, label, values, getter, setter)
    local f = compactRow(parent, 20)
    tinyLabel(f, label, 5, 135)

    local b = Instance.new("TextButton")
    b.Size = UDim2.new(1, -146, 0, 14)
    b.Position = UDim2.fromOffset(141, 3)
    b.BackgroundColor3 = Theme.Field
    b.BorderSizePixel = 0
    b.Font = UIFont
    b.TextColor3 = Theme.TextDim
    b.TextSize = 8
    b.TextXAlignment = Enum.TextXAlignment.Left
    b.AutoButtonColor = false
    b.Parent = f
    local s = stroke(b, Theme.BorderDark, 1)

    local function redraw()
        b.Text = "  " .. tostring(getter()) .. "                         +"
    end
    redraw()
    b.MouseEnter:Connect(function() s.Color = Theme.RedDark end)
    b.MouseLeave:Connect(function() s.Color = Theme.BorderDark end)
    b.Activated:Connect(function()
        local current = getter()
        local idx = table.find(values, current) or 0
        idx = idx + 1
        if idx > #values then idx = 1 end
        setter(values[idx])
        redraw()
        setStatus(label .. ": " .. tostring(values[idx]))
    end)
    return f
end

local function addValue(parent, label, getter)
    local f = compactRow(parent, 20)
    tinyLabel(f, label, 5, 120)
    local v = Instance.new("TextLabel")
    v.BackgroundTransparency = 1
    v.Position = UDim2.fromOffset(126, 0)
    v.Size = UDim2.new(1, -131, 1, 0)
    v.Font = UIFont
    v.TextColor3 = Theme.Text
    v.TextSize = 8
    v.TextXAlignment = Enum.TextXAlignment.Right
    v.Parent = f
    local function refresh() v.Text = tostring(getter()) end
    refresh()
    return {Refresh = refresh, Label = v}
end

local MainPage = makePage("Main")
local SettingsPage = makePage("Settings")
local InfoPage = makePage("Info")
addTopTab("Main", 1)
addTopTab("Settings", 2)
addTopTab("Info", 3)

-- MAIN / LEFT --------------------------------------------------------------
local automation = makeGroup(MainPage.Left, "Automation")
addToggle(automation, "Auto Egg Pickup", "AutoEggPickup")
addToggle(automation, "Auto Drop Basket", "AutoBasketDrop")
addToggle(automation, "Auto Place Eggs", "AutoPlaceEggs")
addToggle(automation, "Auto Hatch Ready", "AutoHatch")
addToggle(automation, "Auto Collect Cash", "AutoCash")
addToggle(automation, "Auto Feed", "AutoFeed")
addToggle(automation, "Auto Rebirth", "AutoRebirth")

local rarityGroup = makeGroup(MainPage.Left, "Egg rarity")
for _, rarity in ipairs(RARITY_OPTIONS) do
    rarityRows[rarity] = addSelectionToggle(rarityGroup, rarity, State.SelectedRarities, rarity)
end

-- MAIN / RIGHT -------------------------------------------------------------
local targetGroup = makeGroup(MainPage.Right, "Targeting")
addCycle(targetGroup, "Priority", TARGET_MODE_OPTIONS, function() return State.TargetMode end, function(v) State.TargetMode = v end)
addCycle(targetGroup, "Max distance", MAX_EGG_DISTANCE_OPTIONS, function() return State.MaxEggDistance end, function(v) State.MaxEggDistance = v end)
addCycle(targetGroup, "Cruise tween", TWEEN_SPEED_OPTIONS, function() return State.MoveSpeed end, function(v) State.MoveSpeed = v end)
local approachInfo = compactRow(targetGroup, 20)
tinyLabel(approachInfo, "Final approach", 5, 135)
local approachText = tinyLabel(approachInfo, "75 studs/s [recommended]", 141, 135)
approachText.TextColor3 = Theme.Text

local quickGroup = makeGroup(MainPage.Right, "Quick actions")
addButton(quickGroup, "Tween to BEST selected egg", function()
    return Adapter.TeleportToNearestEgg() and "Reached selected egg" or "No eligible egg / tween failed"
end)
addButton(quickGroup, "Tween to my plot", function()
    return Adapter.TeleportToPlot() and "Reached my plot" or "Plot not found / tween failed"
end)
addButton(quickGroup, "Feed one pet now", function()
    local ok, msg = Adapter.FeedOnePet(); return msg or tostring(ok)
end)
addButton(quickGroup, "Try rebirth now", function()
    local ok, msg = Adapter.TryRebirth(); return msg or tostring(ok)
end)

local presetGroup = makeGroup(MainPage.Right, "Rarity presets")
addButton(presetGroup, "Select ALL", function()
    for _, rarity in ipairs(RARITY_OPTIONS) do State.SelectedRarities[rarity] = true end
    for _, info in pairs(rarityRows) do info.Paint() end
    return "Egg rarities: ALL"
end)
addButton(presetGroup, "Select NONE", function()
    for _, rarity in ipairs(RARITY_OPTIONS) do State.SelectedRarities[rarity] = false end
    for _, info in pairs(rarityRows) do info.Paint() end
    return "Egg rarities: NONE"
end)
addButton(presetGroup, "Preset MYTHIC+", function()
    for _, rarity in ipairs(RARITY_OPTIONS) do
        State.SelectedRarities[rarity] = (rarity == "Mythic" or rarity == "Divine" or rarity == "Ethereal")
    end
    for _, info in pairs(rarityRows) do info.Paint() end
    return "Preset Mythic+"
end)
addButton(presetGroup, "Preset DIVINE+", function()
    for _, rarity in ipairs(RARITY_OPTIONS) do
        State.SelectedRarities[rarity] = (rarity == "Divine" or rarity == "Ethereal")
    end
    for _, info in pairs(rarityRows) do info.Paint() end
    return "Preset Divine+"
end)

-- SETTINGS / LEFT ----------------------------------------------------------
local movementGroup = makeGroup(SettingsPage.Left, "Movement")
addCycle(movementGroup, "Cruise tween", TWEEN_SPEED_OPTIONS, function() return State.MoveSpeed end, function(v) State.MoveSpeed = v end)
addToggle(movementGroup, "Return Plot After Pickup", "ReturnAfterEggFarm")
addToggle(movementGroup, "Tween for Pet Cash", "TeleportCash")
addCycle(movementGroup, "WalkSpeed", SPEED_OPTIONS, function() return State.Speed end, function(v)
    State.Speed = v
    local hum = getHumanoid(); if hum then hum.WalkSpeed = v end
end)
addToggle(movementGroup, "Noclip", "Noclip")
addButton(movementGroup, "Apply WalkSpeed", function()
    local hum = getHumanoid()
    if hum then hum.WalkSpeed = State.Speed; return "WalkSpeed = " .. tostring(State.Speed) end
    return "Humanoid not found"
end)
addButton(movementGroup, "Reset movement", function()
    State.Speed = 16
    local hum = getHumanoid(); if hum then hum.WalkSpeed = 16 end
    State.Toggles.Noclip = false
    restoreCollisions()
    if toggleRows.Noclip then toggleRows.Noclip.Paint() end
    return "Movement reset"
end)

local shopGroup = makeGroup(SettingsPage.Left, "Shop")
addCycle(shopGroup, "Food", FOOD_OPTIONS, function() return State.SelectedFood end, function(v) State.SelectedFood = v end)
addToggle(shopGroup, "Auto Buy Food", "AutoBuyFood")
addButton(shopGroup, "Buy selected food", function()
    local ok = Adapter.BuyFood(); return ok and ("Buy request: " .. State.SelectedFood) or "Buy failed"
end)
addCycle(shopGroup, "Gear", GEAR_OPTIONS, function() return State.SelectedGear end, function(v) State.SelectedGear = v end)
addButton(shopGroup, "Buy selected gear", function()
    local ok = Adapter.BuyGear(); return ok and ("Buy request: " .. State.SelectedGear) or "Buy failed"
end)

-- SETTINGS / RIGHT ---------------------------------------------------------
local controlGroup = makeGroup(SettingsPage.Right, "Controls")
addButton(controlGroup, "PAUSE / RESUME automation", function()
    State.Paused = not State.Paused
    return State.Paused and "Automation PAUSED" or "Automation RESUMED"
end)
addButton(controlGroup, "STOP ALL automation", function()
    State.Paused = false
    for key in pairs(State.Toggles) do State.Toggles[key] = false end
    restoreCollisions()
    for _, info in pairs(toggleRows) do if info.Paint then info.Paint() end end
    return "All automation stopped"
end)

local CONFIG_FILE = "A7DEV_RideAPet_V6_Config.json"
local function executorFn(name)
    local f = rawget(ENV, name)
    if type(f) == "function" then return f end
    local ok, value = pcall(function()
        if name == "writefile" then return writefile end
        if name == "readfile" then return readfile end
        if name == "isfile" then return isfile end
    end)
    if ok and type(value) == "function" then return value end
    return nil
end

local function configSnapshot()
    local rarities = {}
    local toggles = {}
    for k, v in pairs(State.SelectedRarities) do rarities[k] = v end
    for k, v in pairs(State.Toggles) do toggles[k] = v end
    return {
        MoveSpeed = State.MoveSpeed,
        TargetMode = State.TargetMode,
        MaxEggDistance = State.MaxEggDistance,
        SelectedFood = State.SelectedFood,
        SelectedGear = State.SelectedGear,
        Speed = State.Speed,
        SelectedRarities = rarities,
        Toggles = toggles,
    }
end

local function refreshAllTogglePaints()
    for _, info in pairs(toggleRows) do if info.Paint then info.Paint() end end
    for _, info in pairs(rarityRows) do if info.Paint then info.Paint() end end
end

local configGroup = makeGroup(SettingsPage.Right, "Config")
addButton(configGroup, "Save config", function()
    local wf = executorFn("writefile")
    if not wf then return "writefile unsupported" end
    local ok, encoded = pcall(function() return HttpService:JSONEncode(configSnapshot()) end)
    if not ok then return "Config encode failed" end
    local wrote = pcall(function() wf(CONFIG_FILE, encoded) end)
    return wrote and ("Saved " .. CONFIG_FILE) or "Config save failed"
end)
addButton(configGroup, "Load config", function()
    local rf = executorFn("readfile")
    local iff = executorFn("isfile")
    if not rf then return "readfile unsupported" end
    if iff then
        local exists = false
        pcall(function() exists = iff(CONFIG_FILE) end)
        if not exists then return "No saved config" end
    end
    local ok, raw = pcall(function() return rf(CONFIG_FILE) end)
    if not ok then return "Config read failed" end
    local parsedOk, data = pcall(function() return HttpService:JSONDecode(raw) end)
    if not parsedOk or type(data) ~= "table" then return "Config invalid" end
    if data.MoveSpeed then State.MoveSpeed = tonumber(data.MoveSpeed) or State.MoveSpeed end
    if data.TargetMode then State.TargetMode = data.TargetMode end
    if data.MaxEggDistance then State.MaxEggDistance = data.MaxEggDistance end
    if data.SelectedFood then State.SelectedFood = data.SelectedFood end
    if data.SelectedGear then State.SelectedGear = data.SelectedGear end
    if data.Speed then State.Speed = tonumber(data.Speed) or State.Speed end
    if type(data.SelectedRarities) == "table" then
        for k, v in pairs(data.SelectedRarities) do if State.SelectedRarities[k] ~= nil then State.SelectedRarities[k] = v == true end end
    end
    if type(data.Toggles) == "table" then
        for k, v in pairs(data.Toggles) do if State.Toggles[k] ~= nil then State.Toggles[k] = v == true end end
    end
    refreshAllTogglePaints()
    local hum = getHumanoid(); if hum then hum.WalkSpeed = State.Speed end
    return "Config loaded"
end)

local discordGroup = makeGroup(SettingsPage.Right, "Discord")
addButton(discordGroup, "Open Discord Invite", function()
    local copied, opened = openDiscordInvite(true)
    if opened then return "Discord URL executed" end
    return copied and "Invite copied" or DISCORD_INVITE
end)
local discordRow = compactRow(discordGroup, 20)
local discordText = tinyLabel(discordRow, "discord.gg/5MmsD6gZN", 5, 250)
discordText.TextColor3 = Theme.Text

-- INFO ---------------------------------------------------------------------
local liveGroup = makeGroup(InfoPage.Left, "Live profile")
StatsLabel = Instance.new("TextLabel")
StatsLabel.Size = UDim2.new(1, 0, 0, 188)
StatsLabel.BackgroundColor3 = Theme.Field
StatsLabel.BorderSizePixel = 0
StatsLabel.Font = UIFont
StatsLabel.TextColor3 = Theme.Text
StatsLabel.TextSize = 8
StatsLabel.TextXAlignment = Enum.TextXAlignment.Left
StatsLabel.TextYAlignment = Enum.TextYAlignment.Top
StatsLabel.TextWrapped = true
StatsLabel.Text = "loading stats..."
StatsLabel.Parent = liveGroup
stroke(StatsLabel, Theme.BorderDark, 1)
local statsPad = Instance.new("UIPadding")
statsPad.PaddingTop = UDim.new(0, 6)
statsPad.PaddingLeft = UDim.new(0, 6)
statsPad.Parent = StatsLabel

local creditsGroup = makeGroup(InfoPage.Right, "Credits")
local creditRow1 = compactRow(creditsGroup, 20); local cr1 = tinyLabel(creditRow1, "Owner/Developer", 5, 110); cr1.TextColor3 = Theme.TextDim
local cr1v = tinyLabel(creditRow1, "a7med_hub", 120, 145); cr1v.TextColor3 = Theme.Text
local creditRow2 = compactRow(creditsGroup, 20); local cr2 = tinyLabel(creditRow2, "Discord", 5, 110); cr2.TextColor3 = Theme.TextDim
local cr2v = tinyLabel(creditRow2, "5MmsD6gZN", 120, 145); cr2v.TextColor3 = Theme.Text
addButton(creditsGroup, "Open / copy invitation", function()
    local copied, opened = openDiscordInvite(true)
    return opened and "Discord URL executed" or (copied and "Invite copied" or DISCORD_INVITE)
end)

local profileGroup = makeGroup(InfoPage.Right, "Game adapter")
local RemoteInfo = Instance.new("TextLabel")
RemoteInfo.Size = UDim2.new(1, 0, 0, 176)
RemoteInfo.BackgroundColor3 = Theme.Field
RemoteInfo.BorderSizePixel = 0
RemoteInfo.Font = UIFont
RemoteInfo.TextColor3 = Theme.TextDim
RemoteInfo.TextSize = 8
RemoteInfo.TextXAlignment = Enum.TextXAlignment.Left
RemoteInfo.TextYAlignment = Enum.TextYAlignment.Top
RemoteInfo.TextWrapped = true
RemoteInfo.Text = table.concat({
    "Ride A Pet / " .. tostring(PROFILE.PlaceId),
    "EggPickup(name)",
    "BasketDrop(eggName)",
    "EggPlaced({NestId=...})",
    "PetCollect(petKey)",
    "FeedPet(petKey, foodName)",
    "BuyWithCash(category,item)",
    "Rebirth()",
    "Movement: Tween only",
    "Cruise: selected speed",
    "Final approach: 75 studs/s"
}, "\n")
RemoteInfo.Parent = profileGroup
stroke(RemoteInfo, Theme.BorderDark, 1)
local remotePad = Instance.new("UIPadding")
remotePad.PaddingTop = UDim.new(0, 6)
remotePad.PaddingLeft = UDim.new(0, 6)
remotePad.Parent = RemoteInfo

-- drag from title bar --------------------------------------------------------
local dragging = false
local dragStart, startPos
Top.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPos = Main.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then dragging = false end
        end)
    end
end)
UserInputService.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        Main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
    end
end)
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    if input.KeyCode == Enum.KeyCode.RightShift then Main.Visible = not Main.Visible end
end)
Close.Activated:Connect(function()
    State.Running = false
    restoreCollisions()
    Gui:Destroy()
end)

selectTab("Main")

-- runtime ------------------------------------------------------------------
RunService.Stepped:Connect(function()
    if not State.Running then return end
    if State.Toggles.Noclip then
        local character = getCharacter()
        if character then
            for _, obj in ipairs(character:GetDescendants()) do
                if obj:IsA("BasePart") then
                    if State.CollisionCache[obj] == nil then
                        State.CollisionCache[obj] = obj.CanCollide
                    end
                    obj.CanCollide = false
                end
            end
        end
    elseif next(State.CollisionCache) ~= nil then
        restoreCollisions()
    end
end)

LocalPlayer.CharacterAdded:Connect(function()
    State.CollisionCache = {}
    State.MoveBusy = false
    task.wait(1)
    local hum = getHumanoid()
    if hum then hum.WalkSpeed = State.Speed end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoEggPickup then
            local count = Adapter.CollectEggsPass()
            if count > 0 then setStatus("Eggs collected: " .. count) end
        end
        task.wait(0.8)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoBasketDrop then
            local count = Adapter.DropBasketPass()
            if count > 0 then setStatus("Basket dropped: " .. count) end
        end
        task.wait(0.8)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoPlaceEggs then
            local ok = Adapter.PlaceEggPass()
            if ok then setStatus("Egg placed in a free nest") end
        end
        task.wait(0.9)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoHatch then
            local count = Adapter.HatchPass()
            if count > 0 then setStatus("Hatched prompts: " .. count) end
        end
        task.wait(1.2)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoCash then
            local count = Adapter.CollectCashPass()
            if count > 0 then setStatus("Pet collect requests: " .. count) end
        end
        task.wait(1.6)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoFeed then
            local ok, msg = Adapter.FeedOnePet()
            if ok then setStatus(msg) end
        end
        task.wait(2.5)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoBuyFood then
            local tool = findFoodTool(State.SelectedFood)
            if not tool then
                Adapter.BuyFood()
                setStatus("Buying " .. State.SelectedFood)
            end
        end
        task.wait(3.0)
    end
end)

task.spawn(function()
    while State.Running do
        if not State.Paused and State.Toggles.AutoRebirth then
            local ok, msg = Adapter.TryRebirth()
            if ok then setStatus(msg) end
        end
        task.wait(2.5)
    end
end)

task.spawn(function()
    while State.Running do
        local active = getActiveEggs()
        local basket = LocalPlayer:FindFirstChild("Basket")
        local cash = getSavedValue("Cash") or 0
        local rebirths = getSavedValue("Rebirths") or 0
        local petCount = #getOwnPets()
        local eggCount = active and #active:GetChildren() or 0
        local basketCount = basket and #basket:GetChildren() or 0
        local placeMatch = game.PlaceId == PROFILE.PlaceId

        if StatsLabel then
            StatsLabel.Text = table.concat({
                "  Place check : " .. (placeMatch and "MATCH" or ("OTHER (" .. tostring(game.PlaceId) .. ")")),
                "  Cash        : $" .. formatNumber(cash),
                "  Rebirths    : " .. tostring(rebirths),
                "  Own pets    : " .. tostring(petCount),
                "  Active eggs : " .. tostring(eggCount),
                "  Basket      : " .. tostring(basketCount),
                "  Movement    : Tween cruise " .. tostring(State.MoveSpeed) .. " / final " .. tostring(State.ApproachSpeed) .. (State.MoveBusy and " [BUSY]" or ""),
                "  Target mode : " .. tostring(State.TargetMode) .. " / max " .. tostring(State.MaxEggDistance),
                "  Rarities    : " .. selectedRarityText(),
                "  Session     : eggs " .. State.Counters.EggsPicked .. " | fails " .. State.Counters.PickupFails .. " | hatch " .. State.Counters.Hatches,
                "  Pet actions : cash " .. State.Counters.CashCollects .. " | feed " .. State.Counters.Feeds .. " | rebirth " .. State.Counters.Rebirths,
                "  State       : " .. (State.Paused and "PAUSED" or "RUNNING") .. " | RightShift = hide/show UI",
            }, "\n")
        end

        task.wait(1)
    end
end)

setStatus("A7DEV V6 • cruise 250 / final 75 • rarities: " .. selectedRarityText())
