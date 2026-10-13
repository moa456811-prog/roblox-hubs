local __checks,__failures={},{}
local function check(name,condition,detail)
    table.insert(__checks,{name=name,passed=condition==true,detail=detail or ""})
    if not condition then table.insert(__failures,name..(detail and ": "..detail or "")) end
end
local function countConnections()
    local count=0
    for _,state in ipairs(__allConnections) do if state.Connected then count+=1 end end
    return count
end
local function countActions() return __eventCount("attack")+__eventCount("remote")+__eventCount("remote-event")+__eventCount("tween")+__eventCount("move") end
local function lastState(api) return api.getState() end
local function progress(api,key) return lastState(api).progress[key] end
local function runCase(name,callback)
    local before=# __runtimeErrors
    local ok,message=pcall(callback)
    check(name.." completes without test or candidate errors",ok and # __runtimeErrors==before,tostring(message or table.concat(__runtimeErrors," | ")))
end
local function initialize(factory,options)
    local f=__adapterFixture(options)
    local api=factory(f.env)
    assert(type(api)=="table" and type(api.setEnabled)=="function" and type(api.getState)=="function" and type(api.dispose)=="function","Factory API is incomplete")
    f.api=api
    function f:finish() api.dispose(); self:cleanup() end
    return f,api
end

if __mode=="factory" then
    local ok,factory=pcall(__candidate)
    check("candidate exports a callable factory",ok and type(factory)=="function",ok and type(factory) or tostring(factory))
    if ok and type(factory)=="function" then
        runCase("initialization and toggle validation",function()
            local f,api=initialize(factory)
            check("factory owns one Heartbeat and one CharacterAdded connection",#f.owned==2,"Found "..#f.owned)
            __gameEnemy("Monkey",5,false)
            __advance(3)
            check("no game actions occur before explicit activation",countActions()==0)
            for _,id in ipairs({"farm","boss","quest","loot"}) do check(id.." is initially disabled",lastState(api).enabled[id]==false) end
            local snapshot=lastState(api); snapshot.enabled.farm=true; snapshot.progress.farmDamage=999
            check("getState enabled flags are independent copies",not lastState(api).enabled.farm)
            check("getState progress is an independent copy",progress(api,"farmDamage")==0)
            api.setEnabled("unknown",true); api.setEnabled("farm","yes")
            check("unknown ids and nonboolean activation do not enable actions",not lastState(api).enabled.farm)
            api.setEnabled("farm",true); api.setEnabled("farm",true)
            check("repeated enable does not create duplicate connections",#f.owned==2)
            check("activation reports the actual toggle state to the UI",f.controlStates.farm==true)
            api.setEnabled("farm",false); __advance(1)
            check("switching off before a tick prevents all actions",countActions()==0)
            f:finish()
            check("cleanup disconnects all factory-owned connections",countConnections()==0)
        end)
        runCase("ordinary farm and confirmed damage",function()
            local f,api=initialize(factory)
            local _,_,dead=__gameEnemy("Dead Monkey",1,false); dead.Health=0
            __gameEnemy("The Gorilla King",1,true)
            local _,_,target=__gameEnemy("Monkey [Lv. 14]",5,false)
            api.setEnabled("farm",true); __advance(0.24,0.01)
            check("farm waits for its bounded tick interval",__eventCount("attack")==0)
            __advance(0.02,0.01)
            check("farm dispatches an actual ordinary attack",__eventCount("attack")>0)
            check("farm priority excludes nearby bosses",lastState(api).active=="farm")
            check("attack alone is not counted as damage",progress(api,"farmDamage")==0)
            target.Health=75; __advance(0.5)
            check("farm damage is confirmed by enemy health decrease",progress(api,"farmDamage")>0)
            local start=__eventCount("attack"); __advance(4)
            check("farm attack rate is bounded to four per second",__eventCount("attack")-start<=16)
            check("combat never sends invented hit or pickup remotes",__eventCount("remote-event")==0 and __eventCount("remote")==0)
            check("ordinary input down events are paired with release",__eventCount("release")==__eventCount("attack"))
            api.setEnabled("farm",false); local stopped=countActions(); __advance(2)
            check("farm stops producing actions when disabled",countActions()==stopped)
            f:finish()
        end)
        runCase("boss isolation and scheduler priority",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",1,false)
            local _,_,boss=__gameEnemy("The Gorilla King",5,true)
            for _,id in ipairs({"farm","quest","loot","boss"}) do api.setEnabled(id,true) end
            __advance(0.5)
            check("boss takes priority over quest farm and loot",lastState(api).active=="boss")
            check("boss dispatches ordinary combat",__eventCount("attack")>0)
            check("boss attack alone does not claim damage",progress(api,"bossDamage")==0)
            boss.Health=60; __advance(0.5)
            check("boss health reduction confirms boss damage",progress(api,"bossDamage")>0)
            check("boss execution does not start unrelated quests",__eventCount("remote","StartQuest")==0)
            api.setEnabled("boss",false); __advance(0.5)
            check("quest takes priority over farm and loot after boss stops",lastState(api).active=="quest")
            api.setEnabled("quest",false); __advance(0.5)
            check("farm takes priority over loot after quest stops",lastState(api).active=="farm")
            api.setEnabled("farm",false); __advance(0.5)
            check("loot runs after higher-priority features stop",lastState(api).active=="loot")
            f:finish()
        end)
        runCase("source-backed quest acceptance and exact target",function()
            local f,api=initialize(factory)
            local _,_,wrong=__gameEnemy("Monkey Pirate",1,false)
            local _,_,target=__gameEnemy("Monkey [Lv. 14]",5,false)
            api.setEnabled("quest",true); __advance(1)
            check("quest sends the real StartQuest command",__eventCount("remote","StartQuest")==1)
            local event
            for _,candidate in ipairs(__adapterEvents) do if candidate.kind=="remote" and candidate.args[1]=="StartQuest" then event=candidate;break end end
            check("quest uses module-derived quest id and stage",event and event.args[2]=="JungleQuest" and event.args[3]==1 or false)
            check("quest start requires game UI acknowledgment",progress(api,"questStarts")==0)
            check("quest does not attack before its quest is acknowledged",__eventCount("attack")==0)
            f.questTitle.Text="Defeat 6 Monkeys"; f.questUI.Visible=true; __advance(1)
            check("matching visible quest confirms a quest start",progress(api,"questStarts")==1)
            check("acknowledged quest dispatches real combat",__eventCount("attack")>0)
            target.Health=80; wrong.Health=50; __advance(0.5)
            check("quest damage follows only its exact normalized target",progress(api,"questDamage")==20)
            local starts=__eventCount("remote","StartQuest"); __advance(4)
            check("active matching quest does not spam acceptance",__eventCount("remote","StartQuest")==starts)
            check("quest never invents a reward claim command",__eventCount("remote")==__eventCount("remote","StartQuest"))
            f:finish()
        end)
        runCase("loot arrival versus verified collection",function()
            local f,api=initialize(factory)
            api.setEnabled("loot",true); __advance(1)
            check("loot selects source-backed physical collectibles",lastState(api).active=="loot")
            check("moving to a chest does not claim collection",progress(api,"chestsCollected")==0)
            check("moving near a fruit does not claim collection",progress(api,"fruitsCollected")==0)
            check("loot does not call invented pickup or storage remotes",__eventCount("remote")==0 and __eventCount("remote-event")==0)
            f.chest:SetAttribute("IsDisabled",true); __advance(1)
            check("chest server-state change confirms one collection",progress(api,"chestsCollected")==1)
            __advance(1)
            check("disabled chest cannot be counted repeatedly",progress(api,"chestsCollected")==1)
            check("fruit remains unconfirmed while still in workspace",progress(api,"fruitsCollected")==0)
            f.fruit.Parent=f.backpack; __advance(1)
            check("same fruit entering player Backpack confirms collection",progress(api,"fruitsCollected")==1)
            __advance(1)
            check("collected fruit cannot be counted repeatedly",progress(api,"fruitsCollected")==1)
            f:finish()
        end)
        runCase("game and evidence admission guards",function()
            local f,api=initialize(factory,{placeId=12345})
            __gameEnemy("Monkey",5,false)
            for _,id in ipairs({"farm","boss","quest","loot"}) do api.setEnabled(id,true) end
            __advance(1)
            check("wrong game blocks every adapter action",countActions()==0)
            f:finish()
            f,api=initialize(factory,{missingModules=true})
            api.setEnabled("quest",true); __advance(2)
            check("missing quest modules block quest remotes and combat",countActions()==0)
            check("missing quest evidence has an explicit status",type(lastState(api).status)=="string" and #lastState(api).status>0)
            f:finish()
            f,api=initialize(factory)
            rawget(f.guide,"__moduleData").Data.IsFakeData=true
            api.setEnabled("quest",true); __advance(1)
            check("fake GuideModule data cannot authorize a quest",__eventCount("remote")==0 and __eventCount("attack")==0)
            f:finish()
        end)
        runCase("character lifecycle and missing weapon",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            f.tool.Parent=f.backpack; f.tool:Destroy()
            api.setEnabled("farm",true); __advance(1)
            check("combat requires an actual equipped or equipable weapon",__eventCount("attack")==0)
            f:finish()
            f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            api.setEnabled("farm",true); __advance(0.5)
            local beforeRespawn=__eventCount("attack")
            local nextCharacter,nextRoot,nextHumanoid=__gameCharacter("Respawned",Vector3.new(2,0,0))
            local oldRoot=f.root; local previousPosition=oldRoot.Position
            __player.Character=nextCharacter; __player.CharacterAdded._fire(nextCharacter); __advance(1)
            check("farm resumes using the current respawned character",__eventCount("attack")>beforeRespawn)
            check("respawn never moves the stale character root",oldRoot.Position==previousPosition)
            nextHumanoid.Health=0; local before=__eventCount("attack"); __advance(1)
            check("dead current character cannot attack",__eventCount("attack")==before)
            f:finish()
        end)
        runCase("queued cancellation busy guard and disposal",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            __adapterQueueTasks=true
            api.setEnabled("farm",true); __advance(0.25)
            check("first activation queues one bounded unit of work",# __adapterTaskQueue==1)
            __advance(1)
            check("busy guard prevents overlapping queued work",# __adapterTaskQueue==1)
            api.setEnabled("farm",false); __flushAdapterTasks()
            check("work completing after Stop cannot issue stale actions",countActions()==0)
            api.setEnabled("farm",true); __advance(0.25)
            api.dispose(); __flushAdapterTasks(); __advance(1)
            check("dispose closes adapter state",lastState(api).closed==true)
            check("dispose cancels queued work before effects",countActions()==0)
            api.setEnabled("farm",true); __advance(1); __flushAdapterTasks()
            check("disposed adapter cannot be reactivated",not lastState(api).enabled.farm and countActions()==0)
            f:finish()
        end)
        runCase("quest callback revision guard",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            __adapterRemoteHook=function(_,command)
                if command=="StartQuest" then api.setEnabled("quest",false); f.questUI.Visible=true end
                return true
            end
            api.setEnabled("quest",true); __advance(2)
            check("stopping while quest remote returns prevents resumed combat",__eventCount("attack")==0)
            check("cancelled quest cannot claim accepted quest success",progress(api,"questStarts")==0)
            f:finish()
        end)
        runCase("bounded retries and stalled work",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            api.setEnabled("farm",true); __advance(14)
            check("combat pauses after bounded time without health progress",lastState(api).enabled.farm==false)
            check("combat timeout explains its missing health confirmation",string.find(lastState(api).status,"health",1,true)~=nil)
            check("automatic combat pause reports Off to the UI",f.controlStates.farm==false)
            f:finish()
            f,api=initialize(factory)
            api.setEnabled("quest",true); __advance(12)
            check("unacknowledged quest acceptance has bounded retries",__eventCount("remote","StartQuest")>=1 and __eventCount("remote","StartQuest")<=2)
            check("unacknowledged quest pauses without claiming success",not lastState(api).enabled.quest and progress(api,"questStarts")==0)
            f:finish()
            f,api=initialize(factory)
            api.setEnabled("loot",true); __advance(12)
            check("unchanged pickup eventually pauses instead of endless movement",not lastState(api).enabled.loot)
            check("pickup timeout never fabricates a collected item",progress(api,"chestsCollected")==0 and progress(api,"fruitsCollected")==0)
            f:finish()
            f,api=initialize(factory)
            __gameEnemy("Monkey",5,false); __adapterQueueTasks=true
            api.setEnabled("farm",true); __advance(7)
            check("unresponsive work is cancelled after a bounded deadline",not lastState(api).busy and not lastState(api).enabled.farm)
            __flushAdapterTasks()
            check("timed-out queued work cannot produce later effects",countActions()==0)
            f:finish()
        end)
        runCase("conflicting quest and fruit ownership",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            f.questUI.Visible=true; f.questTitle.Text="Defeat 8 Gorillas"
            api.setEnabled("quest",true); __advance(1)
            check("another active quest is preserved without abandonment",__eventCount("remote")==0 and f.questUI.Visible and f.questTitle.Text=="Defeat 8 Gorillas")
            check("conflicting active quest pauses the selected action",not lastState(api).enabled.quest and __eventCount("attack")==0)
            f:finish()
            f,api=initialize(factory)
            f.chest:SetAttribute("IsDisabled",true)
            api.setEnabled("loot",true); __advance(0.5)
            local other=__gameMake("Folder","OtherInventory",__Workspace)
            f.fruit.Parent=other; __advance(1)
            check("fruit reparented outside player inventory is not claimed",progress(api,"fruitsCollected")==0)
            f:finish()
            f,api=initialize(factory)
            f.chest:SetAttribute("IsDisabled",true); f.fruit:Destroy()
            local template=__gameMake("Model","Chest Template",__services.ReplicatedStorage)
            template.PrimaryPart=__gamePart("Chest",template,1,0,0)
            __adapterTags._ChestTagged={template}
            api.setEnabled("loot",true); __advance(1)
            check("tagged chest templates outside Workspace are not collectible targets",countActions()==0 and progress(api,"chestsCollected")==0)
            f:finish()
        end)
        runCase("enemy scan bounds and invalid heartbeat values",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            api.setEnabled("farm",true)
            for _,dt in ipairs({-1,math.huge,0/0}) do __RunService.Heartbeat._fire(dt) end
            check("invalid heartbeat values cannot trigger actions",countActions()==0)
            __advance(4)
            check("enemy discovery scans are cached for one second",(__adapterScans.Enemies or 0)<=5)
            f:finish()
            f,api=initialize(factory)
            for index=1,200 do local _,_,dead=__gameEnemy("Dead "..index,1,false); dead.Health=0 end
            __gameEnemy("Monkey",5,false)
            api.setEnabled("farm",true); __advance(1)
            check("enemy discovery respects its first-200 inspection bound",__eventCount("attack")==0)
            __advance(1.5)
            check("rotating bounded enemy scans eventually discover later targets",__eventCount("attack")>0)
            f:finish()
        end)
        runCase("factual first-sea quest fallback admission",function()
            local f,api=initialize(factory,{missingModules=true,level=12})
            local giverPosition=Vector3.new(-1598.08911,35.5501175,153.377838)
            f.npc.PrimaryPart.Position=giverPosition
            f.root.Position=giverPosition+Vector3.new(0,0,5)
            local _,enemyRoot=__gameEnemy("Monkey",5,false); enemyRoot.Position=giverPosition+Vector3.new(0,0,4)
            api.setEnabled("quest",true); __advance(1)
            check("first-sea fallback uses the pinned Monkey quest facts",__eventCount("remote","StartQuest")==1)
            local start
            for _,event in ipairs(__adapterEvents) do if event.kind=="remote" and event.args[1]=="StartQuest" then start=event end end
            check("fallback quest command retains the factual id and tier",start and start.args[2]=="JungleQuest" and start.args[3]==1 or false)
            check("fallback invocation alone is not acceptance success",progress(api,"questStarts")==0)
            f.questUI.Visible=true; __advance(0.5)
            check("fallback quest acceptance still requires matching live UI",progress(api,"questStarts")==1)
            check("fallback acknowledged target uses ordinary combat",__eventCount("attack")>0)
            f:finish()
            f,api=initialize(factory,{missingModules=true,placeId=4442272183,level=725})
            api.setEnabled("quest",true); __advance(1)
            check("first-sea facts never authorize a second-sea quest",__eventCount("remote")==0 and countActions()==0)
            f:finish()
            f,api=initialize(factory,{missingModules=true,level=525})
            f.npc.PrimaryPart.Position=Vector3.new(-7903,5636,-1411)
            api.setEnabled("quest",true); __advance(1)
            check("conflicting SkyExp2 coordinates require a corroborating live giver",__eventCount("remote")==0 and __eventCount("tween")==0)
            f:finish()
        end)
        runCase("movement cancellation and bounded stall",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",50,false)
            __adapterFreezeMovement=true
            api.setEnabled("farm",true); __advance(0.25)
            check("distant combat target starts one real movement tween",# __adapterTweens==1 and __adapterTweens[1].playing)
            api.setEnabled("farm",false)
            check("Stop cancels the owned movement tween",__adapterTweens[1].cancelled==true)
            local stopped=countActions(); __advance(2)
            check("cancelled movement is not restarted after Stop",countActions()==stopped)
            f:finish()
            f,api=initialize(factory)
            __gameEnemy("Monkey",50,false)
            __adapterFreezeMovement=true
            api.setEnabled("farm",true); __advance(14)
            check("stalled movement pauses instead of endlessly recreating tweens",not lastState(api).enabled.farm)
            check("movement stall cannot claim damage or attack at range",progress(api,"farmDamage")==0 and __eventCount("attack")==0)
            check("movement stall cancels its remaining tween",# __adapterTweens==1 and __adapterTweens[1].cancelled==true)
            f:finish()
        end)
        runCase("fair collectible discovery and boss attributes",function()
            local f,api=initialize(factory)
            f.chest:SetAttribute("IsDisabled",true)
            local folder=__Workspace:FindFirstChild("ChestModels")
            local disabled={}
            for index=1,200 do
                local chest=__gameMake("Model","Disabled "..index,folder)
                chest.PrimaryPart=__gamePart("Chest",chest,1,0,0); chest:SetAttribute("IsDisabled",true)
                table.insert(disabled,chest)
            end
            __adapterTags._ChestTagged=disabled
            api.setEnabled("loot",true); __advance(1)
            check("two hundred disabled chests cannot starve a live fruit",lastState(api).pendingLoot=="fruit")
            f.fruit.Parent=f.backpack; __advance(0.5)
            check("fruit after a disabled-chest backlog can be confirmed",progress(api,"fruitsCollected")==1)
            f:finish()
            f,api=initialize(factory)
            f.chest:SetAttribute("IsDisabled",true)
            f.fruit.Parent=nil
            for index=1,200 do __gameMake("Folder","World Decor "..index,__Workspace) end
            f.fruit.Parent=__Workspace
            api.setEnabled("loot",true); __advance(4)
            check("rotating bounded world scans eventually discover later fruits",lastState(api).pendingLoot=="fruit")
            f:finish()
            f,api=initialize(factory)
            __gameEnemy("Misleading Name [Boss]",1,false)
            local raid,_,health=__gameEnemy("Actual Raid Enemy",5,false); raid:SetAttribute("RaidBoss",true)
            api.setEnabled("boss",true); __advance(0.5)
            check("RaidBoss attribute authorizes actual boss combat",__eventCount("attack")>0)
            health.Health=0; __advance(0.25)
            check("boss death health delta is observed before target rescan",progress(api,"bossDamage")==100)
            f:finish()
        end)
        runCase("availability-aware arbitration",function()
            local f,api=initialize(factory)
            __gameEnemy("Monkey",5,false)
            api.setEnabled("boss",true); api.setEnabled("farm",true); __advance(1)
            check("absent bosses do not starve an enabled farm",lastState(api).active=="farm" and __eventCount("attack")>0)
            check("waiting boss keeps its enabled intent while farm runs",lastState(api).enabled.boss and lastState(api).enabled.farm)
            __gameEnemy("The Gorilla King",5,true)
            local attacks=__eventCount("attack"); __advance(1.5)
            check("a newly available live boss regains priority",lastState(api).active=="boss" and __eventCount("attack")>attacks)
            f:finish()
            f,api=initialize(factory)
            api.setEnabled("farm",true); api.setEnabled("loot",true); __advance(0.5)
            check("no live farm enemy cannot starve available loot",lastState(api).active=="loot" and lastState(api).pendingLoot=="chest")
            check("waiting farm keeps its enabled intent while loot runs",lastState(api).enabled.farm and lastState(api).enabled.loot)
            f.chest:SetAttribute("IsDisabled",true); __advance(0.5)
            check("loot can confirm collection while enabled farm has no target",progress(api,"chestsCollected")==1)
            __gameEnemy("Monkey",5,false); __advance(1.5)
            check("a newly available farm target regains priority over loot",lastState(api).active=="farm" and __eventCount("attack")>0)
            f:finish()
            f,api=initialize(factory)
            local _,_,targetHealth=__gameEnemy("Monkey",5,false)
            api.setEnabled("farm",true); api.setEnabled("loot",true); __advance(0.5)
            targetHealth.Health=0; __advance(0.25)
            check("farm death damage is preserved before arbitration switches to loot",progress(api,"farmDamage")==100)
            check("dead farm target allows enabled loot to take over",lastState(api).active=="loot")
            f:finish()
        end)
    end
else
    -- Exercise the real generated script's visible controls against the same
    -- fixtures. This is separate from, and cannot weaken, old UI scenarios.
    runCase("generated Full Hub dispatch",function()
        local f=__adapterFixture()
        f.gui:Destroy()
        local _,_,enemy=__gameEnemy("Monkey",5,false)
        local _,_,boss=__gameEnemy("The Gorilla King",5,true)
        local ok,message=pcall(__candidate)
        check("full generated hub initializes",ok,tostring(message or "")); __flush()
        local function find(text,class)
            for _,object in ipairs(__allInstances) do
                if not __destroyed(object) and object:IsDescendantOf(__playerGui) and object:IsA(class or "TextButton") and object.Text==text then return object end
            end
        end
        local function click(button)
            if not button or not __visible(button) or button.Interactable==false then return false end
            button.Activated._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,100,100),1)
            button.MouseButton1Click._fire(); __flush(); return true
        end
        local guis={}
        local private=false
        for _,object in ipairs(__allInstances) do
            if not __destroyed(object) and object:IsDescendantOf(__playerGui) then
                if object:IsA("ScreenGui") then
                    table.insert(guis,object)
                    local identity=string.lower(object.Name)
                    if string.find(identity,"a7dev",1,true) or string.find(identity,"a7med",1,true) then private=true end
                end
                if object:IsA("GuiObject") then
                    local text=(object:IsA("TextLabel") or object:IsA("TextButton")) and object.Text or ""
                    local haystack=string.lower(object.Name.." "..text)
                    if string.find(haystack,"a7dev",1,true) or string.find(haystack,"a7med",1,true) or string.find(haystack,"created by",1,true) then private=true end
                end
            end
        end
        check("generated Blox hub creates exactly one ScreenGui",#guis==1)
        check("generated Blox hub contains no private branding or credits",not private)
        local gui=guis[1]
        local panel=gui and gui:FindFirstChild("Panel",true)
        local header=gui and gui:FindFirstChild("Header",true)
        check("generated hub has the requested 680 by 460 window",panel and panel.Size.X.Scale==0 and panel.Size.Y.Scale==0 and panel.Size.X.Offset==680 and panel.Size.Y.Offset==460 or false)
        check("generated hub uses the neutral charcoal base palette",panel and panel.BackgroundColor3==Color3.fromRGB(22,24,29) or false)
        local corner=panel and panel:FindFirstChildOfClass("UICorner")
        check("generated hub uses the requested 12 pixel radius",corner and corner.CornerRadius.Offset==12 or false)
        check("generated hub has no automatic Title object",gui and gui:FindFirstChild("Title",true)==nil or false)
        local previousY
        for _,name in ipairs({"Home","Farm","Boss","Quests","Loot","Movement","Session","Settings"}) do
            local tab=find(name)
            check("generated hub exposes "..name.." tab",tab~=nil)
            if tab then
                local x,y,w,h=__rect(tab)
                check(name.." is in the nonoverlapping left navigation",panel and x<panel.AbsolutePosition.X+180 and (not previousY or y>=previousY+30) or false)
                previousY=y
                check(name.." tab opens its own page",click(tab) and gui:FindFirstChild("page_"..string.lower(name),true).Visible)
                local visiblePages=0
                for _,object in ipairs(gui:GetDescendants()) do if object:IsA("ScrollingFrame") and string.sub(object.Name,1,5)=="page_" and __visible(object) then visiblePages+=1 end end
                check(name.." tab leaves exactly one page visible",visiblePages==1)
            end
        end
        __advance(1)
        check("generated hub performs no game actions before a click",countActions()==0)
        check("generated hub does not rejoin automatically",# __teleports==0)
        for _,item in ipairs({{tab="Farm",label="Auto Farm",id="farm"},{tab="Boss",label="Auto Boss",id="boss"},{tab="Quests",label="Quest Farm",id="quest"},{tab="Loot",label="Auto Loot",id="loot"}}) do
            check(item.label.." page opens through the real UI",click(find(item.tab)))
            local label=find(item.label,"TextLabel") or find(item.label)
            local button=label and label.Parent and label.Parent:FindFirstChildWhichIsA("GuiButton",true)
            if label and label:IsA("GuiButton") then button=label end
            check(item.label.." has an enabled visible action control",button and __visible(button) and button.Interactable~=false or false)
            f.root.Position=Vector3.zero
            local before=countActions()
            click(button); __advance(1)
            check(item.label.." dispatches its actual game-specific operation",countActions()>before)
            if item.id=="quest" then
                f.questUI.Visible=true; __advance(1)
                check("generated Quest Farm dispatches the real StartQuest remote",__eventCount("remote","StartQuest")>0)
            end
            click(button); local stopped=countActions(); __advance(0.5)
            check(item.label.." Stop prevents further game operations",countActions()==stopped)
        end
        click(find("Farm"))
        local farmLabel=find("Auto Farm","TextLabel")
        local farmButton=farmLabel and farmLabel.Parent:FindFirstChildWhichIsA("GuiButton",true)
        click(farmButton); __advance(14)
        check("generated farm toggle visibly turns Off after an automatic pause",farmButton and farmButton.Text=="Off" or false)
        local status=gui:FindFirstChild("Status",true)
        check("generated hub shows the actual automatic-pause reason",status and string.find(status.Text,"health",1,true)~=nil or false)
        click(find("Movement"))
        for _,entry in ipairs({{id="walk-speed",property="WalkSpeed",value=25,min=8,max=32},{id="jump-power",property="JumpPower",value=61,min=20,max=75}}) do
            local input=gui and gui:FindFirstChild("input_"..entry.id,true)
            local apply=gui and gui:FindFirstChild("apply_"..entry.id,true)
            check(entry.id.." has a visible numeric input and Apply",input and apply and __visible(input) and __visible(apply) or false)
            if input and apply then
                input.Text=tostring(entry.value); click(apply)
                check(entry.id.." Apply changes the current Humanoid",f.humanoid[entry.property]==entry.value)
                if entry.id=="jump-power" then check("Jump Power Apply enables UseJumpPower",f.humanoid.UseJumpPower==true) end
                for _,value in ipairs({"abc","",tostring(entry.min-1),tostring(entry.max+1),"1e309"}) do
                    input.Text=value; click(apply)
                    check(entry.id.." rejects invalid value "..value,f.humanoid[entry.property]==entry.value)
                end
                for _,value in ipairs({entry.min,entry.max}) do
                    input.Text=tostring(value); click(apply)
                    check(entry.id.." accepts boundary "..value,f.humanoid[entry.property]==value)
                end
            end
        end
        click(find("Session")); local teleports=# __teleports
        check("generated Rejoin control runs when clicked",click(find("Rejoin")))
        check("generated Rejoin requests exactly the current place",# __teleports==teleports+1 and __teleports[# __teleports].placeId==2753915549)
        click(find("Settings"))
        local theme=find("Theme","TextLabel")
        local themeButton=theme and theme.Parent:FindFirstChildWhichIsA("GuiButton",true)
        check("generated theme has a working control",click(themeButton))
        local settingsTab=find("Settings")
        check("generated alternate theme applies navy and cyan",panel.BackgroundColor3==Color3.fromRGB(18,24,42) and settingsTab.BackgroundColor3==Color3.fromRGB(85,221,255) and themeButton.BackgroundColor3==Color3.fromRGB(30,43,68))
        click(themeButton)
        check("generated theme restores the neutral base palette",panel.BackgroundColor3==Color3.fromRGB(22,24,29))
        local start=panel.Position
        header.InputBegan._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.Begin,100,100))
        __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,140,135))
        check("generated header drag moves the window",panel.Position.X.Offset==start.X.Offset+40 and panel.Position.Y.Offset==start.Y.Offset+35)
        __UIS.InputEnded._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,140,135))
        __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,180,180))
        check("generated drag stops after release",panel.Position.X.Offset==start.X.Offset+40 and panel.Position.Y.Offset==start.Y.Offset+35)
        check("generated Minimize hides the panel",click(find("Minimize")) and not panel.Visible)
        check("generated Restore restores the complete panel",click(find("Restore")) and panel.Visible)
        local close=find("Close") or find("×") or find("X")
        if not close and guis[1] then close=guis[1]:FindFirstChild("Close",true) end
        check("generated hub has a usable Close control",click(close))
        local stopped=countActions(); __advance(1)
        check("closing generated hub stops every adapter operation",countActions()==stopped)
        check("closing generated hub disconnects owned runtime connections",countConnections()==0)
    end)
    runCase("generated Full Hub availability-aware arbitration",function()
        local function find(text,class)
            for _,object in ipairs(__allInstances) do
                if not __destroyed(object) and object:IsDescendantOf(__playerGui) and object:IsA(class or "TextButton") and object.Text==text then return object end
            end
        end
        local function click(button)
            assert(button and __visible(button) and button.Interactable~=false,"Expected visible real generated control")
            button.Activated._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,100,100),1)
            button.MouseButton1Click._fire(); __flush()
        end
        local function toggle(tab,label)
            click(find(tab))
            local text=find(label,"TextLabel")
            local control=text and text.Parent:FindFirstChildWhichIsA("GuiButton",true)
            click(control); return control
        end
        local f=__adapterFixture(); f.gui:Destroy()
        __gameEnemy("Monkey",5,false)
        assert(pcall(__candidate),"Generated hub must initialize for arbitration scenario")
        local farm=toggle("Farm","Auto Farm")
        local boss=toggle("Boss","Auto Boss")
        __advance(1)
        check("real Boss and Farm toggles allow farming when no boss exists",__eventCount("attack")>0)
        check("real waiting Boss and active Farm controls remain On",boss.Text=="On" and farm.Text=="On")
        toggle("Farm","Auto Farm"); toggle("Boss","Auto Boss")
        f.enemies:ClearAllChildren()
        f.root.Position=Vector3.zero
        farm=toggle("Farm","Auto Farm")
        local loot=toggle("Loot","Auto Loot")
        local moves=__eventCount("tween"); __advance(1.5)
        check("real Farm and Loot toggles allow collection when no enemy exists",__eventCount("tween")>moves)
        check("real waiting Farm and active Loot controls remain On",farm.Text=="On" and loot.Text=="On")
        f.chest:SetAttribute("IsDisabled",true); __advance(0.25)
        local status
        for _,object in ipairs(__allInstances) do if not __destroyed(object) and object:IsDescendantOf(__playerGui) and object.Name=="Status" then status=object;break end end
        check("real loot reports confirmed chest progress despite waiting Farm",status and string.find(status.Text,"confirmed",1,true)~=nil or false)
        click(find("Close")); local stopped=countActions(); __advance(0.5)
        check("arbitration scenario closes without pending actions or leaks",countActions()==stopped and countConnections()==0)
    end)
end
check("all candidate callbacks completed without runtime errors",# __runtimeErrors==0,table.concat(__runtimeErrors," | "))
print("GAME_ADAPTER_QA_RESULT "..__json({passed=# __failures==0,checks=__checks,failures=__failures,runtimeErrors=__runtimeErrors,remainingConnections=countConnections()}))
