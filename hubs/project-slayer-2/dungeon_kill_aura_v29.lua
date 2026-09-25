-- A7DEV Dungeon Kill Aura V29: inserted after DungeonOps.inRun/inQueue.
-- User confirmed the isolated ownership + Dead-state test on 2026-09-25.
-- Local death is not an independent confirmation of server rewards.
State.Flags.DungeonKillAura = false
State.DungeonOps.killAuraAttempts = setmetatable({}, {__mode="k"})
State.DungeonOps.killAuraLastTick = 0
State.DungeonOps.killAuraTick = function()
    if State.Destroyed or State.Flags.DungeonKillAura ~= true then return end
    if not State.DungeonOps.inRun() then return end
    local now = os.clock()
    if now - State.DungeonOps.killAuraLastTick < 0.35 then return end
    State.DungeonOps.killAuraLastTick = now
    local _, myHum, myRoot = getCharacter()
    if not myHum or myHum.Health <= 0 or not myRoot then return end
    local ownerCheck = ENV.isnetworkowner or isnetworkowner
    if type(ownerCheck) ~= "function" then return end
    for _, model in ipairs(collectHostiles("", true)) do
        -- Recheck eligibility even if the general FarmableOnly toggle is off.
        local okFarmable, farmable = pcall(isFarmableNPC, model)
        if okFarmable and farmable == true and model:IsDescendantOf(workspace)
            and not isPlayerCharacter(model) and not isCivilianNPC(model)
            and not insideNamedAncestor(model, "StationaryNpcs")
            and not ancestryHasNonFarmRole(model) then
            local hum = model:FindFirstChildOfClass("Humanoid")
            local root = hum and (hum.RootPart or model:FindFirstChild("HumanoidRootPart"))
            if hum and root and root:IsA("BasePart") and hum.Health > 0
                and hum.MaxHealth > 0 and hum.Health / hum.MaxHealth <= 0.80
                and not State.DungeonOps.killAuraAttempts[hum]
                and (root.Position - myRoot.Position).Magnitude <= 30 then
                local okOwner, owned = pcall(ownerCheck, root)
                if okOwner and owned == true then
                    local okDead, deadEnabled = pcall(hum.GetStateEnabled, hum, Enum.HumanoidStateType.Dead)
                    if okDead and deadEnabled == true then
                        State.DungeonOps.killAuraAttempts[hum] = true
                        pcall(hum.ChangeState, hum, Enum.HumanoidStateType.Dead)
                    end
                end
            end
        end
    end
end
