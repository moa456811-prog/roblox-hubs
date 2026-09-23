-- A7DEV Project Slayer 2 - one-shot, read-only runtime report.
-- No UI, attacks, teleports, remote calls, module loading or automation changes.
-- The report stays local: clipboard when available, otherwise the client console.
local started = os.clock()
local function attempt(fn, fallback)
    local ok, value = pcall(fn)
    if ok then return value end
    return fallback
end
local function scalar(value)
    local kind = type(value)
    if kind == "boolean" then return value end
    if kind == "number" and value == value and math.abs(value) < math.huge then return value end
    if kind == "string" then return string.sub(value, 1, 240) end
    return nil
end
local function fields(source, names)
    local out = {}
    if type(source) ~= "table" then return out end
    for _, name in ipairs(names) do out[name] = scalar(rawget(source, name)) end
    return out
end
local env = attempt(function() return getgenv() end, _G)
if type(env) ~= "table" then env = _G end
local state = rawget(env, "A7DEV_PROJECT_SLAYER_2") or rawget(_G, "A7DEV_PROJECT_SLAYER_2")
if type(state) ~= "table" then state = nil end
local players = attempt(function() return game:GetService("Players") end)
local me = players and players.LocalPlayer
local world = workspace
local report = {
    schema = "A7DEV_Slayer2_readonly_20260923_2",
    placeId = attempt(function() return game.PlaceId end),
    loaded = state ~= nil,
    snapshots = {}, world = {}, limits = {}, errors = {},
}
local function pause()
    if task and type(task.wait) == "function" then task.wait() end
end
local function path(object)
    local text = attempt(function() return object:GetFullName() end, "Unavailable")
    if me and type(me.Name) == "string" then
        local escaped = me.Name:gsub("(%W)", "%%%1")
        text = text:gsub(escaped, "<self>")
    end
    return string.sub(text, 1, 220)
end
local function position(object)
    return attempt(function()
        if not object then return nil end
        local value
        if typeof(object) == "Vector3" then value = object
        elseif typeof(object) == "CFrame" then value = object.Position
        elseif object:IsA("Attachment") then value = object.WorldPosition
        elseif object:IsA("BasePart") then value = object.Position
        elseif object:IsA("Model") then
            local root = object:FindFirstChild("HumanoidRootPart") or object.PrimaryPart
            if root then value = root.Position else value = object:GetPivot().Position end
        end
        if value then
            return {x=scalar(value.X), y=scalar(value.Y), z=scalar(value.Z)}
        end
    end)
end
local function relativeDistance(a, b)
    if not a or not b or not a.x or not a.y or not a.z or not b.x or not b.y or not b.z then return nil end
    local dx, dy, dz = a.x-b.x, a.y-b.y, a.z-b.z
    return math.floor(math.sqrt(dx*dx + dy*dy + dz*dz))
end
local function attributes(object)
    local out = {}
    for _, name in ipairs({"Title","NpcCode","NPCCode","DisplayName","EnemyType","MobType",
        "Boss","Invulnerable","Invincible","PvP","PVP","PvpEnabled","InSafeZone","Frozen"}) do
        out[name] = scalar(attempt(function() return object:GetAttribute(name) end))
    end
    return out
end
local function describe(object)
    if not object then return {present=false} end
    return attempt(function()
        local hum = object:FindFirstChildOfClass("Humanoid")
        local root = object:FindFirstChild("HumanoidRootPart")
        return {
            present=true, class=object.ClassName, path=path(object),
            parent=object.Parent~=nil, position=position(object), attributes=attributes(object),
            health=hum and scalar(hum.Health), maxHealth=hum and scalar(hum.MaxHealth),
            anchored=root and root.Anchored, forceField=object:FindFirstChildOfClass("ForceField")~=nil,
        }
    end, {present=true, unreadable=true})
end
local function snapshot()
    local s = state or {}
    local r = type(s.Runtime)=="table" and s.Runtime or {}
    local y = type(s.YetiOps)=="table" and s.YetiOps or {}
    local p = type(s.PlayerOps)=="table" and s.PlayerOps or {}
    local l = type(s.LanternOps)=="table" and s.LanternOps or {}
    local n = type(s.YetiSummonResolver)=="table" and s.YetiSummonResolver or {}
    local h = type(r.YetiPlayerRecovery)=="table" and r.YetiPlayerRecovery or {}
    local out = {
        elapsed=math.floor((os.clock()-started)*1000)/1000,
        core=fields(s,{"Destroyed","CombatReady","NativeMissingCombat","NativeMissingOptional",
            "NativeInitRetries","Status","AutoEquipStatus","FarmPlanSource","FarmQuestStatus",
            "FarmStyle","LowHPPaused","InstantKillInFlight","BossFullScanRunning","BossStreamBusy"}),
        flags=fields(s.Flags,{"AutoFarm","AutoBoss","AutoQuest","AutoYeti","AutoHeartYeti","AutoLantern",
            "AutoFarmPlayers","AutoAttack","AutoEquip","AutoSkills","AutoDungeon","AutoFishingReel",
            "AutoBecomeSlayer","AutoBecomeDemon","Fly","PauseLowHP","Noclip","FarmNoclip"}),
        modules={
            yeti=type(s.YetiOps)=="table", player=type(s.PlayerOps)=="table",
            lantern=type(s.LanternOps)=="table", resolver=type(s.YetiSummonResolver)=="table",
            recovery=type(r.YetiPlayerRecovery)=="table",
            main=type(r.mainHeartbeat)=="function", misc=type(r.miscHeartbeat)=="function",
        },
        yeti=fields(y,{"status","epoch","busy","wasOwner","hearts","goal","done","attackAt","damageAt"}),
        player=fields(p,{"status","enabled","mode","busy","claimed","manualHold","selectedName","epoch","closed"}),
        lantern=fields(l,{"active","generation","status"}),
        resolver=fields(n,{"epoch","attempts","travelAttempts","spentWait"}),
        preferred=scalar(h.preferred), character=describe(me and me.Character),
    }
    out.yeti.target=describe(y.target)
    out.yeti.cached=describe(y.liveCache)
    out.player.target=describe(p.character)
    local roster=players and attempt(function() return players:GetPlayers() end, {}) or {}
    out.player.serverPlayerCount=#roster
    out.player.selectedPresent=false
    for _, player in ipairs(roster) do
        if player.UserId==p.selectedId then
            out.player.selectedPresent=true
            out.player.selectedCharacter=describe(player.Character)
            out.player.distance=relativeDistance(position(me and me.Character),position(player.Character))
        end
    end
    out.player.pending=type(p.pending)=="table"
    out.player.lastTeleport=fields(p.lastTeleport,{"state","reason","at","age","distance","epoch","missingFor"})
    out.player.pendingState=fields(p.pending,{"epoch","createdAt","missingSince","untilAt"})
    out.resolver.hasDestination=n.dest~=nil
    out.resolver.hasInteraction=n.prompt~=nil
    out.resolver.confirmationRemaining=math.max(0,(tonumber(n.confirmUntil) or 0)-os.clock())
    out.yeti.lootRemaining=math.max(0,(tonumber(y.lootUntil) or 0)-os.clock())
    out.resolver.destination=position(n.dest)
    out.resolver.lastFailure=fields(n.lastFailure,{"time","attempts","hasDestination","hasInteraction"})
    out.localPlayerAttributes=me and attributes(me) or {}
    if n.prompt then
        out.resolver.interaction=attempt(function()
            return {path=path(n.prompt),class=n.prompt.ClassName,enabled=n.prompt.Enabled,
                action=n.prompt.ActionText,object=n.prompt.ObjectText,duration=n.prompt.HoldDuration,
                range=n.prompt.MaxActivationDistance,key=tostring(n.prompt.KeyboardKeyCode)}
        end,{unreadable=true})
    end
    out.equippedTools={}
    local children=me and me.Character and attempt(function() return me.Character:GetChildren() end,{}) or {}
    for _, child in ipairs(children) do
        if child:IsA("Tool") then out.equippedTools[#out.equippedTools+1]=child.Name end
    end
    return out
end
report.snapshots[1]=snapshot()
local function relevant(text)
    text=tostring(text or ""):lower():gsub("[^%w]","")
    return text:find("yeti",1,true) or text:find("whiteterror",1,true)
        or text:find("frozenheart",1,true) or text:find("emberheart",1,true)
end
local function interactionContext(object)
    local texts={object.Name}
    if object:IsA("ProximityPrompt") then
        texts[#texts+1]=object.ActionText
        texts[#texts+1]=object.ObjectText
    end
    local owner=object.Parent
    for _=1,4 do
        if not owner or owner==world then break end
        texts[#texts+1]=owner.Name
        owner=owner.Parent
    end
    return table.concat(texts," ")
end
-- Locate the exact geometry container observed in the previous report.
-- Bounds are diagnostic hints, never interpreted as a teleport destination.
local function roofGeometry()
    local map=world:FindFirstChild("Map")
    map=map and map:FindFirstChild("Map")
    local roof=map and map:FindFirstChild("YetiRoof")
    if not roof then return {present=false} end
    local out={present=true,path=path(roof),parts=0,visited=0,partial=false,samples={}}
    local minx,miny,minz,maxx,maxy,maxz
    local queue={roof}
    local head=1
    while head<=#queue and head<=1000 do
        local object=queue[head]
        head=head+1
        out.visited=out.visited+1
        if object:IsA("BasePart") then
            local pos=position(object)
            if pos and pos.x and pos.y and pos.z then
                out.parts=out.parts+1
                minx,miny,minz=math.min(minx or pos.x,pos.x),math.min(miny or pos.y,pos.y),math.min(minz or pos.z,pos.z)
                maxx,maxy,maxz=math.max(maxx or pos.x,pos.x),math.max(maxy or pos.y,pos.y),math.max(maxz or pos.z,pos.z)
                if #out.samples<5 then
                    out.samples[#out.samples+1]={path=path(object),position=pos,anchored=object.Anchored,canCollide=object.CanCollide}
                end
            end
        end
        for _,child in ipairs(object:GetChildren()) do
            if #queue<1000 then queue[#queue+1]=child else out.partial=true end
        end
        if head%200==0 then pause() end
    end
    if minx then
        out.partCenterMin={x=minx,y=miny,z=minz}
        out.partCenterMax={x=maxx,y=maxy,z=maxz}
    end
    return out
end
report.world.yetiRoof=attempt(roofGeometry,{unreadable=true})
report.world.totalBossCatalogEntries=state and type(state.BossCatalog)=="table" and #state.BossCatalog or 0
report.world.bossCatalog={}
if state and type(state.BossCatalog)=="table" then
    for _, entry in ipairs(state.BossCatalog) do
        if type(entry)=="table" and (relevant(entry.Name) or relevant(entry.Code)) then
            if #report.world.bossCatalog>=16 then report.limits.catalog=true break end
            local item=fields(entry,{"Name","Code"})
            item.position=position(entry.Position)
            report.world.bossCatalog[#report.world.bossCatalog+1]=item
        end
    end
end
report.world.objects={}
report.world.interactions={}
local playerCharacters={}
for _, player in ipairs(players and attempt(function() return players:GetPlayers() end,{}) or {}) do
    if player.Character then playerCharacters[player.Character]=true end
end
local function scan()
    local queue={world}
    local head, visited=1,0
    local deadline=os.clock()+4
    while head<=#queue do
        if visited>=30000 or os.clock()>deadline then
            report.limits.worldScanPartial=true break
        end
        local object=queue[head]
        head=head+1
        visited=visited+1
        if object and not playerCharacters[object] then
            attempt(function()
                if #report.world.objects<24 and relevant(object.Name)
                    and (object:IsA("Model") or object:IsA("BasePart") or object:IsA("Folder")) then
                    report.world.objects[#report.world.objects+1]=describe(object)
                end
                if object:IsA("ProximityPrompt") and relevant(interactionContext(object)) then
                    if #report.world.interactions<20 then
                        report.world.interactions[#report.world.interactions+1]={
                            path=path(object),action=object.ActionText,object=object.ObjectText,
                            enabled=object.Enabled,duration=object.HoldDuration,range=object.MaxActivationDistance,
                            key=tostring(object.KeyboardKeyCode),position=position(object.Parent),
                        }
                    else report.limits.interactions=true end
                end
                for _, child in ipairs(object:GetChildren()) do
                    if #queue<30000 then queue[#queue+1]=child else report.limits.worldScanPartial=true end
                end
            end)
        end
        if visited%250==0 then pause() end
    end
    report.limits.worldNodesVisited=visited
end
report.world.scanAvailable=pcall(scan)
report.gameUI={}
attempt(function()
    local gui=me and me:FindFirstChildOfClass("PlayerGui")
    if not gui then return end
    local queue={gui}
    local head=1
    while head<=#queue and head<=5000 and #report.gameUI<12 do
        local object=queue[head]
        head=head+1
        local skip=object:IsA("ScreenGui") and object.Name:lower():find("a7dev",1,true)
        if not skip then
            if object:IsA("TextLabel") or object:IsA("TextButton") then
                local text=tostring(object.Text or "")
                if #text<=180 and (relevant(text) or object.Name:lower():find("pvp",1,true)) then
                    report.gameUI[#report.gameUI+1]={path=path(object),text=text,visible=object.Visible}
                end
            end
            for _,child in ipairs(object:GetChildren()) do
                if #queue<5000 then queue[#queue+1]=child end
            end
        end
        if head%250==0 then pause() end
    end
    report.limits.gameUIVisited=head-1
end)
local function recentErrors()
    local logService=game:GetService("LogService")
    local history=logService:GetLogHistory()
    for i=#history,math.max(1,#history-250),-1 do
        local text=tostring(history[i].message or "")
        local lower=text:lower()
        local allowed=lower:find("a7dev",1,true)~=nil and #text<1500
        for _, sensitive in ipairs({"key","token","session","auth","grant","receipt","password","secret","license"}) do
            if lower:find(sensitive,1,true) then allowed=false break end
        end
        if allowed and (lower:find("error",1,true) or lower:find("fail",1,true)
            or lower:find("missing",1,true) or lower:find("unavailable",1,true)
            or lower:find("stopped",1,true) or lower:find("retained",1,true)) then
            text=text:gsub("https?://%S+","<url>")
            report.errors[#report.errors+1]=string.sub(text,1,400)
            if #report.errors>=12 then break end
        end
    end
end
local logsOK=pcall(recentErrors)
report.logsAvailable=logsOK
local remaining=0.7-(os.clock()-started)
if remaining>0 and task and type(task.wait)=="function" then task.wait(remaining) else pause() end
report.snapshots[2]=snapshot()
for _=1,2 do
    if task and type(task.wait)=="function" then task.wait(0.6) end
    report.snapshots[#report.snapshots+1]=snapshot()
end
report.activeDuringCapture={yeti=false,lantern=false,player=false}
for _,sample in ipairs(report.snapshots) do
    local flags=sample.flags or {}
    report.activeDuringCapture.yeti=report.activeDuringCapture.yeti or flags.AutoYeti==true or flags.AutoHeartYeti==true
    report.activeDuringCapture.lantern=report.activeDuringCapture.lantern or flags.AutoLantern==true
    report.activeDuringCapture.player=report.activeDuringCapture.player or flags.AutoFarmPlayers==true or sample.player.pending==true or sample.player.manualHold==true
end
report.elapsedSeconds=math.floor((os.clock()-started)*1000)/1000
local encoder=attempt(function() return game:GetService("HttpService") end)
local ok,payload=pcall(function() return encoder:JSONEncode(report) end)
if not ok then
    warn("[A7DEV Diagnostic] Report encoding failed. No gameplay settings were changed.")
    return report
end
local copy=rawget(env,"setclipboard") or rawget(env,"toclipboard") or setclipboard or toclipboard
local copied=false
if type(copy)=="function" then copied=pcall(copy,payload) end
if copied then
    print("[A7DEV Diagnostic] Report copied. Paste it in your support conversation.")
else
    print("A7DEV_DIAGNOSTIC_BEGIN\n"..payload.."\nA7DEV_DIAGNOSTIC_END")
end
return payload
