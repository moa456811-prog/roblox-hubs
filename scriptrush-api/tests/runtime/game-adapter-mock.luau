-- Test-only extension of the existing closed UI mock. No engine, network,
-- executor, file IO or arbitrary require capability is exposed to candidates.
local __adapterEvents = {}
local __adapterTweens = {}
local __adapterClock = 0
local __adapterTags = {}
local __adapterRemoteHook = nil
local __adapterTweenHook = nil
local __adapterQueueTasks = false
local __adapterTaskQueue = {}
local __adapterCancelledTasks = {}
local __adapterScans = {}
local __adapterFreezeMovement = false
local __oldGetChildren=__methods.GetChildren
__methods.GetChildren=function(self)
    if self.Name=="Enemies" or self.ClassName=="Workspace" then __adapterScans[self.Name]=(__adapterScans[self.Name] or 0)+1 end
    return __oldGetChildren(self)
end
local __oldSpawn=__task.spawn
__task.spawn=function(callback,...)
    if not __adapterQueueTasks then return __oldSpawn(callback,...) end
    local thread=coroutine.create(function() end)
    table.insert(__adapterTaskQueue,{thread=thread,callback=callback,args=table.pack(...)})
    return thread
end
__task.cancel=function(thread) __adapterCancelledTasks[thread]=true end
local function __flushAdapterTasks()
    local queued=__adapterTaskQueue; __adapterTaskQueue={}
    for _,work in ipairs(queued) do
        if not __adapterCancelledTasks[work.thread] then __safeCall(work.callback,table.unpack(work.args,1,work.args.n)) end
    end
end

for class, parent in pairs({ BasePart="Instance", Part="BasePart", MeshPart="BasePart", Tool="Instance", ModuleScript="Instance", RemoteFunction="Instance", RemoteEvent="Instance", IntValue="ValueBase" }) do
    __classParents[class] = parent
end
__classProps.BasePart = { Position=true, CFrame=true, Anchored=true, CanCollide=true, Size=true }
__classProps.Part = __classProps.BasePart
__classProps.MeshPart = __classProps.BasePart
__classProps.Model = { PrimaryPart=true }
__classProps.Tool = { Enabled=true, ToolTip=true }
__classProps.IntValue = { Value=true }
__classProps.Workspace = { CurrentCamera=true }
local __oldDefaultProps = __defaultProps
__defaultProps = function(class)
    local props = __oldDefaultProps(class)
    if __isA(class,"BasePart") then props.Position=Vector3.zero; props.Anchored=false; props.CanCollide=true end
    if class == "Tool" then props.Enabled=true; props.ToolTip="Melee" end
    return props
end

local CFrame = {}
local __cframeMt = { __type="CFrame" }
function CFrame.new(x,y,z)
    local position = type(x)=="table" and x or Vector3.new(x or 0,y or 0,z or 0)
    return setmetatable({ Position=position, p=position },__cframeMt)
end
__cframeMt.__add = function(value,offset) return CFrame.new(value.Position+offset) end
__cframeMt.__sub = function(value,offset) return CFrame.new(value.Position-offset) end
__cframeMt.__mul = function(a,b) return CFrame.new(a.Position+b.Position) end
__cframeMt.__index = { Lerp=function(a,b,t) return CFrame.new(a.Position:Lerp(b.Position,t)) end }
__sandbox.CFrame=CFrame
__classProps.Camera.CFrame=true
__camera.CFrame=CFrame.new()
__sandbox.setmetatable=function(value,mt)
    assert(type(value)=="table" and __typeof(value)~="Instance","Candidate cannot replace an admitted Instance metatable")
    return setmetatable(value,mt)
end

-- CFrame and Position stay synchronized as they do for Roblox BaseParts.
local __oldInstanceNewIndex=__instanceMt.__newindex
__instanceMt.__newindex=function(self,key,value)
    __oldInstanceNewIndex(self,key,value)
    if self:IsA("BasePart") then
        if key=="CFrame" then __getProps(self).Position=value.Position end
        if key=="Position" then __getProps(self).CFrame=CFrame.new(value) end
    end
end
function __methods:GetPivot()
    if self:IsA("BasePart") then return self.CFrame or CFrame.new(self.Position) end
    local part=self.PrimaryPart or self:FindFirstChildWhichIsA("BasePart",true)
    return part and part.CFrame or CFrame.new()
end
function __methods:MoveTo(position)
    table.insert(__adapterEvents,{ kind="move",time=__adapterClock,object=self.Name,position=position })
    if self:IsA("Humanoid") then
        local root=self.Parent and self.Parent:FindFirstChild("HumanoidRootPart")
        if root then root.Position=position end
    elseif self:IsA("Model") then
        local root=self.PrimaryPart
        if root then root.Position=position end
    end
end
function __methods:EquipTool(tool)
    assert(self:IsA("Humanoid") and tool:IsA("Tool"),"EquipTool fixture type mismatch")
    tool.Parent=self.Parent
    table.insert(__adapterEvents,{kind="equip",time=__adapterClock,object=tool.Name})
end
function __methods:Activate()
    assert(self:IsA("Tool"),"Activate only available for fixture Tool")
    table.insert(__adapterEvents,{kind="attack",time=__adapterClock,object=self.Name})
end
function __methods:InvokeServer(...)
    assert(self:IsA("RemoteFunction"),"InvokeServer only available on closed fixture remotes")
    local args=table.pack(...)
    table.insert(__adapterEvents,{kind="remote",time=__adapterClock,object=self.Name,args=args})
    if __adapterRemoteHook then return __adapterRemoteHook(self,table.unpack(args,1,args.n)) end
    return nil
end
function __methods:FireServer(...)
    assert(self:IsA("RemoteEvent"),"FireServer only available on closed fixture remotes")
    table.insert(__adapterEvents,{kind="remote-event",time=__adapterClock,object=self.Name,args=table.pack(...)})
end
__sandbox.require=function(module)
    assert(__typeof(module)=="Instance" and module:IsA("ModuleScript"),"Only explicit fixture ModuleScripts can be required")
    local data=rawget(module,"__moduleData")
    assert(data~=nil,"ModuleScript has no admitted fixture data")
    return data
end

local __CollectionService={}
function __CollectionService:GetTagged(tag) return table.clone(__adapterTags[tag] or {}) end
function __CollectionService:HasTag(object,tag) return table.find(__adapterTags[tag] or {},object)~=nil end
__services.CollectionService=__CollectionService
__services.ReplicatedStorage=Instance.new("Folder")
__services.ReplicatedStorage.Name="ReplicatedStorage"
__services.Workspace=__Workspace
__sandbox.workspace=__Workspace
__Workspace.CurrentCamera=__camera -- permitted below as a test-owned property

__TweenService.Create=function(_,object,info,properties)
    local tween={Completed=__signal("GameTween","Completed"),playing=false,cancelled=false,object=object,properties=properties}
    function tween:Play()
        self.playing=true
        table.insert(__adapterEvents,{kind="tween",time=__adapterClock,object=object.Name})
        if not __adapterFreezeMovement then for key,value in pairs(properties) do object[key]=value end end
        if __adapterTweenHook then __adapterTweenHook(self) end
    end
    function tween:Cancel()
        self.cancelled=true; self.playing=false
        table.insert(__adapterEvents,{kind="cancel",time=__adapterClock,object=object.Name})
    end
    table.insert(__adapterTweens,tween)
    return tween
end
local __VirtualUser={}
function __VirtualUser:CaptureController() table.insert(__adapterEvents,{kind="capture",time=__adapterClock}) end
function __VirtualUser:Button1Down(...) table.insert(__adapterEvents,{kind="attack",time=__adapterClock,route="VirtualUser",args=table.pack(...)}) end
function __VirtualUser:Button1Up(...) table.insert(__adapterEvents,{kind="release",time=__adapterClock,route="VirtualUser",args=table.pack(...)}) end
__services.VirtualUser=__VirtualUser
__services.VirtualInputManager={SendMouseButtonEvent=function(_,x,y,button,down)
    table.insert(__adapterEvents,{kind=down and "attack" or "release",time=__adapterClock,route="VirtualInputManager"})
end}

local function __gameMake(class,name,parent)
    local object=Instance.new(class,parent); object.Name=name
    if object:IsA("BasePart") then object.CFrame=CFrame.new() end
    return object
end
local function __gamePart(name,parent,x,y,z)
    local object=__gameMake("Part",name,parent); object.Position=Vector3.new(x or 0,y or 0,z or 0); return object
end
local function __gameModule(name,parent,data)
    local object=__gameMake("ModuleScript",name,parent); rawset(object,"__moduleData",data); return object
end
local function __gameCharacter(name,position)
    local character=__gameMake("Model",name,__Workspace)
    local root=__gamePart("HumanoidRootPart",character,0,0,0); root.Position=position or Vector3.zero
    character.PrimaryPart=root
    local humanoid=__gameMake("Humanoid","Humanoid",character)
    local tool=__gameMake("Tool","QA Sword",character); tool.ToolTip="Sword"
    return character,root,humanoid,tool
end
local function __gameEnemy(name,x,boss)
    local model=__gameMake("Model",name,__Workspace:FindFirstChild("Enemies"))
    local root=__gamePart("HumanoidRootPart",model,x or 5,0,0); model.PrimaryPart=root
    local humanoid=__gameMake("Humanoid","Humanoid",model)
    if boss then model:SetAttribute("IsBoss",true) end
    return model,root,humanoid
end
local function __adapterFixture(options)
    options=options or {}
    __Workspace:ClearAllChildren()
    __services.ReplicatedStorage:ClearAllChildren()
    for _,child in ipairs(__player:GetChildren()) do if child~=__playerGui then child:Destroy() end end
    __playerGui:ClearAllChildren()
    __adapterEvents={}; __adapterTweens={}; __adapterClock=0; __adapterTags={}; __adapterRemoteHook=nil; __adapterTweenHook=nil
    __adapterQueueTasks=false; __adapterTaskQueue={}; __adapterCancelledTasks={}
    __adapterScans={}
    __adapterFreezeMovement=false
    __game.PlaceId=options.placeId or 2753915549
    local character,root,humanoid,tool=__gameCharacter("Character")
    __player.Character=character
    local backpack=__gameMake("Folder","Backpack",__player)
    local data=__gameMake("Folder","Data",__player)
    local level=__gameMake("IntValue","Level",data); level.Value=options.level or 12
    local enemies=__gameMake("Folder","Enemies",__Workspace)
    local npcs=__gameMake("Folder","NPCs",__Workspace)
    local npc=__gameMake("Model","Adventurer",npcs); npc.PrimaryPart=__gamePart("HumanoidRootPart",npc,4,0,0)
    local worldOrigin=__gameMake("Folder","_WorldOrigin",__Workspace)
    local spawns=__gameMake("Folder","EnemySpawns",worldOrigin)
    __gamePart("Monkey",spawns,5,0,0)
    local chestModels=__gameMake("Folder","ChestModels",__Workspace)
    local chest=__gameMake("Model","QA Chest",chestModels); chest.PrimaryPart=__gamePart("Chest",chest,3,0,0)
    chest:SetAttribute("IsDisabled",false); __adapterTags._ChestTagged={chest}
    local fruit=__gameMake("Tool","Rocket Fruit",__Workspace); __gamePart("Handle",fruit,4,0,0)
    local main=__gameMake("Frame","Main",__playerGui)
    local questUI=__gameMake("Frame","Quest",main); questUI.Visible=false
    local container=__gameMake("Frame","Container",questUI)
    local titleContainer=__gameMake("Frame","QuestTitle",container)
    local title=__gameMake("TextLabel","Title",titleContainer); title.Text="Defeat 6 Monkeys"
    local rs=__services.ReplicatedStorage
    local remotes=__gameMake("Folder","Remotes",rs)
    local comm=__gameMake("RemoteFunction","CommF_",remotes)
    local quests=not options.missingModules and __gameModule("Quests",rs,{
        JungleQuest={
            {LevelReq=10,Name="Monkey",Task={Monkey=6}},
            {LevelReq=15,Name="Gorilla",Task={Gorilla=8}},
            {LevelReq=20,Name="The Gorilla King",Task={["The Gorilla King"]=1}},
        },
        BartiloQuest={{LevelReq=1,Name="Distracting Special",Task={Bandit=99}}},
    }) or nil
    local guide=not options.missingModules and __gameModule("GuideModule",rs,{
        Data={NPCList={[npc]={NPCName="Adventurer",Position=npc.PrimaryPart.Position,Levels={10,15,20}}}},
    }) or nil
    local gui=__gameMake("ScreenGui","GeneratedHub",__playerGui)
    local owned,cleanup,controlStates={},{},{}
    local env={player=__player,gui=gui,own=function(signal,callback)
        local connection=signal:Connect(callback); table.insert(owned,connection); return connection
    end,onCleanup=function(callback) table.insert(cleanup,callback) end,notify=function(message)
        table.insert(__adapterEvents,{kind="notify",time=__adapterClock,message=tostring(message)})
    end,controlState=function(id,value) controlStates[id]=value end}
    local fixture={env=env,character=character,root=root,humanoid=humanoid,tool=tool,backpack=backpack,enemies=enemies,npc=npc,questUI=questUI,questTitle=title,comm=comm,quests=quests,guide=guide,chest=chest,fruit=fruit,gui=gui,owned=owned,controlStates=controlStates}
    function fixture:cleanup()
        for _,callback in ipairs(cleanup) do callback() end
        for _,connection in ipairs(owned) do connection:Disconnect() end
        gui:Destroy()
    end
    return fixture
end
local function __advance(seconds,step)
    step=step or 0.25
    local count=math.ceil(seconds/step)
    for _=1,count do __adapterClock+=step; __RunService.Heartbeat._fire(step); __flush() end
end
local function __eventCount(kind,command)
    local count=0
    for _,event in ipairs(__adapterEvents) do
        if event.kind==kind and (not command or event.args and event.args[1]==command) then count+=1 end
    end
    return count
end
