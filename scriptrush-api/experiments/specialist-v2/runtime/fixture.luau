-- Host-side extension of the existing closed Roblox mock for owned fixtures.
-- No fixture data or expected answers are injected into the candidate globals.
__classParents.BasePart = "Instance"
__classParents.Part = "BasePart"
__classParents.Highlight = "Instance"
__classParents.Lighting = "Instance"
__classProps.BasePart = { Position=true, Anchored=true }
__classProps.Part = __classProps.BasePart
__classProps.Highlight = { Adornee=true, FillColor=true, OutlineColor=true, Enabled=true }
__classProps.Lighting = { Brightness=true }
__classProps.Camera.FieldOfView = true
__classProps.Camera.CFrame = true
Enum.Font.Ubuntu = { Name="Ubuntu", EnumType="Font" }

local CFrame = {}
function CFrame.lookAt(position, target)
    assert(__typeof(position)=="Vector3" and __typeof(target)=="Vector3", "lookAt needs vectors")
    return setmetatable({ Position=position, LookVector=(target-position)/(target-position).Magnitude, _target=target }, { __type="CFrame" })
end
function CFrame.new(x,y,z)
    if __typeof(x)=="Vector3" then
        assert(z==nil and (y==nil or __typeof(y)=="Vector3"), "Unsupported CFrame constructor overload")
        return CFrame.lookAt(x,y or x+Vector3.new(0,0,-1))
    end
    assert(x==nil and y==nil and z==nil or type(x)=="number" and type(y)=="number" and type(z)=="number", "Unsupported CFrame constructor overload")
    local position=Vector3.new(x or 0,y or 0,z or 0)
    return CFrame.lookAt(position,position+Vector3.new(0,0,-1))
end
__camera.FieldOfView = 70
__camera.CFrame = CFrame.new(2,5,7)
__sandbox.CFrame = table.freeze(CFrame)
-- The verified renderer creates a service lookup table with __index. Restrict
-- metatable creation to fresh plain tables, so mock objects cannot be altered.
__sandbox.setmetatable = function(value, meta)
    assert(type(value)=="table" and getmetatable(value)==nil, "Only plain tables may receive a metatable")
    assert(type(meta)=="table", "Expected a metatable")
    return setmetatable(value, meta)
end
local function __assertPlainAccess(value)
    assert(type(value)~="table" or getmetatable(value)~=__instanceMt, "Raw iteration/mutation of mock Instances is unavailable")
end
__instanceMt.__iter=function() error("Raw iteration/mutation of mock Instances is unavailable",2) end
__sandbox.pairs=function(value) __assertPlainAccess(value);return pairs(value) end
__sandbox.ipairs=function(value) __assertPlainAccess(value);return ipairs(value) end
__sandbox.next=function(value,key) __assertPlainAccess(value);return next(value,key) end
local __safeTable=table.clone(table)
for key,callback in pairs(__safeTable) do
    if type(callback)=="function" then
        __safeTable[key]=function(...)
            if key~="pack" and key~="create" then __assertPlainAccess(select(1,...)) end
            if key=="move" and select("#",...)>=5 then __assertPlainAccess(select(5,...)) end
            return callback(...)
        end
    end
end
__sandbox.table=table.freeze(__safeTable)
local __lighting = Instance.new("Lighting")
__lighting.Name = "Lighting"
__lighting.Brightness = 1.5
__services.Lighting = __lighting
-- Match valid Roblox service aliases and Instance child access. The admitted
-- service set stays closed; this does not add HttpService or any network API.
setmetatable(__game,{__index=function(_,name)
    local service=__services[name]
    assert(service~=nil,"Service is outside the permitted isolated UI QA API set: "..tostring(name))
    return service
end})
__classProps.Workspace={CurrentCamera=true}
__Workspace.CurrentCamera=__camera
__services.Workspace=__Workspace
__sandbox.workspace=__Workspace

local __fixtureObjects = {}
local function __fixturePath(path, finalClass)
    local parts = string.split(path,".")
    local current
    local first
    if parts[1]=="workspace" or parts[1]=="Workspace" then current=__Workspace;first=2
    elseif parts[1]=="Players" and parts[2]=="LocalPlayer" then current=__player;first=3
    elseif path=="Lighting" then return __lighting
    else error("Unsupported owned fixture path: "..path) end
    for index=first,#parts do
        if parts[index]=="CurrentCamera" and current==__Workspace then current=__camera
        else
            local child=current:FindFirstChild(parts[index])
            if not child then child=Instance.new(index==#parts and finalClass or "Folder",current);child.Name=parts[index] end
            current=child
        end
    end
    return current
end
for _, record in ipairs(__fixture.objects or {}) do
    local object=__fixturePath(record.path,record.className)
    for key,value in pairs(record.properties or {}) do
        if key=="Position" then object.Position=Vector3.new(31,8,-19)
        elseif key=="CFrame" then object.CFrame=CFrame.new(2,5,7)
        else object[key]=value end
    end
    __fixtureObjects[record.path]=object
end
for _, record in ipairs(__fixture.attributes or {}) do
    assert(record.type=="number", "Only numeric currency is used by these owned fixtures")
    __fixturePath(record.path,"Player"):SetAttribute(record.name,137)
end
-- The evidence describes a snapshot, while local world state can change before
-- the generated callback is used. Vary the actual brightness after that
-- snapshot so restoring a memorized 1.5 cannot pass as "restore original".
local __brightnessSeed=0
for index=1,#(__fixture.game or "owned-fixture") do __brightnessSeed+=string.byte(__fixture.game or "owned-fixture",index) end
local __initialBrightness=0.7+(__brightnessSeed%7)/10
__lighting.Brightness=__initialBrightness
local __beforeInstances = #__allInstances
local __beforeConnections = #__allConnections
