local __checks, __failures = {}, {}
local function check(name, condition, detail)
    table.insert(__checks,{name=name,passed=condition==true,detail=detail or ""})
    if not condition then table.insert(__failures,name..(detail and ": "..detail or "")) end
end
local function near(a,b) return type(a)=="number" and type(b)=="number" and math.abs(a-b)<0.01 end
local function rgb(value) return Color3.fromRGB(value[1],value[2],value[3]) end
local function live(class)
    local found={}
    for index=__beforeInstances+1,#__allInstances do
        local object=__allInstances[index]
        if not __destroyed(object) and object:IsA(class) then table.insert(found,object) end
    end
    return found
end
local function named(name,class)
    for _,object in ipairs(live(class or "Instance")) do if object.Name==name then return object end end
end
local function click(object)
    if not object or not __visible(object) or not object:IsA("GuiButton") or object.Interactable==false then return false end
    local wired=false
    for _,connection in ipairs(__allConnections) do
        if connection.Connected and connection.owner==object and connection.name=="Activated" then wired=true end
    end
    if not wired then return false end
    object.Activated._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,100,100),1)
    __flush()
    return true
end
local function overlap(a,b)
    local ax,ay,aw,ah=__rect(a)
    local bx,by,bw,bh=__rect(b)
    return math.min(ax+aw,bx+bw)-math.max(ax,bx)>1 and math.min(ay+ah,by+bh)-math.max(ay,by)>1
end
local function selectPage(id)
    local button=named("nav_"..tostring(id),"TextButton")
    return click(button)
end
local function guarded(name, callback)
    local ok,message=pcall(callback)
    if not ok then check(name.." completed",false,tostring(message)) end
end
local initialized,message=pcall(__candidate)
if not initialized then table.insert(__runtimeErrors,tostring(message)) end
__flush()
check("initialization has no runtime errors",#__runtimeErrors==0,table.concat(__runtimeErrors," | "))
local guis=live("ScreenGui")
check("one new hub ScreenGui",#guis==1,"Count="..#guis)
local gui=guis[1]
local panel=named("Panel","Frame")
local w=__expected.window
check("requested window exists",panel~=nil)
check("requested exact window dimensions",panel~=nil and near(panel.AbsoluteSize.X,w.width) and near(panel.AbsoluteSize.Y,w.height))
check("requested exact background",panel~=nil and panel.BackgroundColor3==rgb(w.palette.background))
local corner=panel and panel:FindFirstChildOfClass("UICorner")
check("requested exact corner radius",corner~=nil and near(corner.CornerRadius.Scale,0) and near(corner.CornerRadius.Offset,w.radius))
local title=named("Title","TextLabel")
check("requested exact title or absence",w.title=="" and title==nil or w.title~="" and title~=nil and title.Text==w.title)
local allFonts=true
for _,object in ipairs(live("GuiObject")) do
    if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
        if not object.Font or object.Font.Name~=w.font or object.TextSize~=w.textSize then allFonts=false end
    end
end
check("every rendered text uses requested font and size",allFonts)
local nav=named("Navigation","ScrollingFrame")
local navLayout=nav and nav:FindFirstChildOfClass("UIListLayout")
check("requested navigation orientation",w.navigation=="none" and nav==nil or navLayout~=nil and navLayout.FillDirection==(w.navigation=="top" and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical))
check("exact requested number of pages",#live("ScrollingFrame")==#__expectedPages+(w.navigation=="none" and 0 or 1))
local navButtons={}
for index,page in ipairs(__expectedPages) do
    local button=page.id and named("nav_"..page.id,"TextButton")
    local content=page.id and named("page_"..page.id,"ScrollingFrame")
    navButtons[index]=button
    check("tab "..page.label.." exact label and order",button~=nil and button.Text==page.label and button.LayoutOrder==index)
    check("tab "..page.label.." is actionable",click(button))
    check("tab "..page.label.." reveals its page",content~=nil and __visible(content))
    local exclusive=true
    for otherIndex,other in ipairs(__expectedPages) do
        if otherIndex~=index then local otherPage=other.id and named("page_"..other.id,"ScrollingFrame");if not otherPage or __visible(otherPage) then exclusive=false end end
    end
    check("tab "..page.label.." hides every other page",exclusive)
    check("tab "..page.label.." applies requested active accent",button~=nil and button.BackgroundColor3==rgb(w.palette.accent) and button.TextColor3==rgb(w.palette.background))
end
for index=1,#__expectedPages do for other=index+1,#__expectedPages do
    check("tabs "..index.." and "..other.." do not overlap",navButtons[index]~=nil and navButtons[other]~=nil and not overlap(navButtons[index],navButtons[other]))
end end
check("no teleport during initialization or tab selection",#__teleports==0)

local function binding(feature)
    local record=__bindings[feature]
    check(feature.." has exactly one independent control",record~=nil and record.count==1)
    if not record or record.count~=1 then return nil,nil,nil end
    check(feature.." control is on its requested category page",record.pageLabel~=nil and (function()
        for _,page in ipairs(__expectedPages) do if page.label==record.pageLabel then return page.id==record.pageId end end
        return false
    end)())
    check(feature.." page is reachable",selectPage(record.pageId))
    local prefix=record.expected.kind=="number" and "apply_" or "c_"
    local button=named(prefix..record.itemId,"TextButton")
    local input=record.expected.kind=="number" and named("input_"..record.itemId,"TextBox") or nil
    check(feature.." visible active button",button~=nil and __visible(button) and button.Interactable~=false)
    check(feature.." applies requested control colors",button~=nil and button.BackgroundColor3==rgb(w.palette.control) and button.TextColor3==rgb(w.palette.foreground))
    local row=named("row_"..record.itemId,"Frame")
    local label=row and row:FindFirstChild("Label")
    check(feature.." has exact requested English label",label~=nil and label.Text==record.expected.label)
    local expectedButtonText=record.expected.kind=="number" and record.expected.applyLabel or record.expected.kind=="toggle" and (record.expected.initial and record.expected.onLabel or record.expected.offLabel) or record.expected.label
    check(feature.." has exact requested initial button text",button~=nil and button.Text==expectedButtonText)
    return record,button,input
end
local function landmark()
    for path,object in pairs(__fixtureObjects) do if string.sub(path,1,10)=="workspace." and object:IsA("BasePart") then return object end end
end
local function hud()
    for _,object in pairs(__fixtureObjects) do if object:IsA("ScreenGui") then return object end end
end
local function journal()
    for _,object in pairs(__fixtureObjects) do if object:IsA("Frame") then return object end end
end
local function status() local value=named("Status","TextLabel");return value and value.Text or "" end
local function setNumber(feature, expectedProperty, object)
    local record,button,input=binding(feature)
    if not record then return end
    local item=record.expected
    check(feature.." input has requested initial value",input~=nil and input.Text==tostring(item.initial))
    if not input or not button then return end
    local chosen=math.floor((item.min+item.max)/2)
    input.Text=tostring(chosen)
    check(feature.." Apply executes a real handler",click(button))
    check(feature.." changes current target property",object[expectedProperty]==chosen)
    if feature=="jump-power" then check("jump-power enables UseJumpPower",object.UseJumpPower==true) end
    for _,invalid in ipairs({"bad","",tostring(item.min-1),tostring(item.max+1)}) do
        local previous=object[expectedProperty]
        input.Text=invalid;click(button)
        check(feature.." rejects invalid input "..invalid,object[expectedProperty]==previous)
    end
    for _,value in ipairs({item.min,item.max}) do
        input.Text=tostring(value);click(button)
        check(feature.." accepts boundary "..value,object[expectedProperty]==value)
    end
    if feature=="walk-speed" or feature=="jump-power" then
        local oldCharacter=__player.Character
        local previousValue=object[expectedProperty]
        __signals(__player).CharacterRemoving._fire(oldCharacter)
        oldCharacter:Destroy()
        local newCharacter=Instance.new("Model")
        newCharacter.Name="RespawnedCharacter_"..feature
        local currentHumanoid=Instance.new("Humanoid",newCharacter)
        __player.Character=newCharacter
        __humanoid=currentHumanoid
        __signals(__player).CharacterAdded._fire(newCharacter)
        input.Text=tostring(chosen)
        check(feature.." Apply still executes after character replacement",click(button))
        check(feature.." updates the current respawned Humanoid",currentHumanoid[expectedProperty]==chosen)
        check(feature.." does not write to the stale destroyed Humanoid",object[expectedProperty]==previousValue)
        if feature=="jump-power" then check("jump-power enables UseJumpPower after respawn",currentHumanoid.UseJumpPower==true) end
    end
end
local handlers={}
handlers["walk-speed"]=function() setNumber("walk-speed","WalkSpeed",__humanoid) end
handlers["jump-power"]=function() setNumber("jump-power","JumpPower",__humanoid) end
handlers["camera-fov"]=function() setNumber("camera-fov","FieldOfView",__camera) end
handlers["night-vision"]=function()
    local record,button=binding("night-vision");if not record then return end
    check("night-vision starts in requested state",__lighting.Brightness==(record.expected.initial and 3 or __initialBrightness))
    if record.expected.initial then click(button) end
    check("night-vision turns on",click(button) and __lighting.Brightness==3)
    check("night-vision restores actual varied original brightness when off",click(button) and __lighting.Brightness==__initialBrightness)
    click(button) -- leave active to verify close restoration
end
handlers["world-marker"]=function()
    local record,button=binding("world-marker");if not record then return end
    if record.expected.initial then click(button) end
    check("world-marker starts without an enabled highlight",#live("Highlight")==0)
    check("world-marker toggle executes",click(button))
    local values=live("Highlight")
    check("world-marker creates exactly one highlight",#values==1)
    local highlight=values[1]
    check("world-marker targets evidenced landmark",highlight~=nil and highlight.Adornee==landmark())
    check("world-marker applies requested fill and outline",highlight~=nil and highlight.FillColor==Color3.fromRGB(70,210,235) and highlight.OutlineColor==Color3.fromRGB(255,255,255))
    check("world-marker removes highlight on off",click(button) and #live("Highlight")==0)
    click(button) -- leave active to verify close destruction
end
handlers["focus-landmark"]=function()
    local record,button=binding("focus-landmark");if not record then return end
    local position=__camera.CFrame.Position
    local target=landmark()
    check("focus-landmark click executes",click(button))
    local expectedDirection=target and (target.Position-position)/(target.Position-position).Magnitude
    check("focus-landmark preserves camera position and aims at evidence",target~=nil and __camera.CFrame.Position==position and (__camera.CFrame.LookVector-expectedDirection).Magnitude<0.0001)
    if target then target.Position=Vector3.new(-15,23,37) end
    __camera.CFrame=CFrame.new(9,13,-7)
    local currentPosition=__camera.CFrame.Position
    check("focus-landmark subsequent click executes",click(button))
    local movedDirection=target and (target.Position-currentPosition)/(target.Position-currentPosition).Magnitude
    check("focus-landmark uses current moved landmark and camera origin",target~=nil and __camera.CFrame.Position==currentPosition and (__camera.CFrame.LookVector-movedDirection).Magnitude<0.0001)
end
handlers["read-coins"]=function()
    local record,button=binding("read-coins");if not record then return end
    local attribute=__fixture.attributes[1]
    check("read-coins click executes",click(button))
    check("read-coins shows current evidenced value in English",status()=="Coins: 137")
    if attribute then __player:SetAttribute(attribute.name,274) end
    click(button)
    check("read-coins reads live value on each click",status()=="Coins: 274")
end
handlers["open-journal"]=function()
    local record,button=binding("open-journal");if not record then return end
    local target=journal()
    check("open-journal evidence is initially closed",target~=nil and target.Visible==false)
    check("open-journal opens existing evidenced panel",click(button) and target~=nil and target.Visible==true)
    if target then target.Visible=false end
    check("open-journal works on subsequent click",click(button) and target~=nil and target.Visible==true)
end
handlers["hud-visible"]=function()
    local record,button=binding("hud-visible");if not record then return end
    local target=hud()
    check("hud-visible initial state is applied",target~=nil and target.Enabled==record.expected.initial)
    if not record.expected.initial then click(button) end
    check("hud-visible hides actual evidenced HUD",click(button) and target~=nil and target.Enabled==false)
    check("hud-visible restores HUD on toggle",click(button) and target~=nil and target.Enabled==true)
    click(button) -- leave hidden to verify close restoration
end
handlers.rejoin=function()
    local record,button=binding("rejoin");if not record then return end
    local previous=#__teleports
    check("rejoin click executes",click(button))
    local event=__teleports[previous+1]
    check("rejoin requests current place and local player exactly once",#__teleports==previous+1 and event~=nil and event.method=="Teleport" and event.placeId==__game.PlaceId and event.player==__player)
end
handlers.theme=function()
    local record,button=binding("theme");if not record then return end
    if record.expected.initial then click(button) end
    check("theme toggles through actual callback",click(button))
    local palette=w.alternatePalette
    check("theme applies exact alternate window and control colors",palette~=nil and panel~=nil and panel.BackgroundColor3==rgb(palette.background) and button.BackgroundColor3==rgb(palette.control) and button.TextColor3==rgb(palette.foreground))
    click(button)
    check("theme returns to exact primary colors",panel~=nil and panel.BackgroundColor3==rgb(w.palette.background) and button.BackgroundColor3==rgb(w.palette.control) and button.TextColor3==rgb(w.palette.foreground))
end
-- Stable order tests effects independently. A feature cannot pass by merely
-- declaring its ID; every applicable handler must change an observed property.
for _,feature in ipairs({"walk-speed","jump-power","camera-fov","night-vision","world-marker","focus-landmark","read-coins","open-journal","hud-visible","rejoin","theme"}) do
    if __bindings[feature] then guarded(feature,handlers[feature]) end
end
for feature in pairs(__bindings) do check(feature.." has a runtime assessor",handlers[feature]~=nil) end

guarded("drag",function()
    local header=named("Header","Frame")
    if not panel or not header then check("drag header exists",false);return end
    local before=panel.Position
    local down=__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.Begin,100,100)
    header.InputBegan._fire(down)
    __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,123,117),false)
    __flush()
    check("requested drag behavior",w.draggable and near(panel.Position.X.Offset-before.X.Offset,23) and near(panel.Position.Y.Offset-before.Y.Offset,17) or not w.draggable and panel.Position==before)
    __UIS.InputEnded._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,123,117),false)
    local stopped=panel.Position
    __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,160,155),false)
    check("drag stops on release",panel.Position==stopped)
end)
local minimize=named("MinimizeButton","TextButton")
local restore=named("RestoreButton","TextButton")
check("requested minimize and restore labels",minimize~=nil and minimize.Text==w.minimizeLabel and restore~=nil and restore.Text==w.restoreLabel)
check("minimize hides panel and reveals restore",click(minimize) and panel~=nil and not __visible(panel) and restore~=nil and __visible(restore))
check("restore returns full panel",click(restore) and panel~=nil and __visible(panel) and not __visible(restore))
local close=named("CloseButton","TextButton")
check("requested exact close label",close~=nil and close.Text==w.closeLabel)
check("close handler executes",click(close))
check("close destroys full hub GUI",gui~=nil and __destroyed(gui) and #live("ScreenGui")==0)
check("close destroys active landmark markers",#live("Highlight")==0)
if __bindings["night-vision"] then check("close restores actual varied original brightness",__lighting.Brightness==__initialBrightness) end
if __bindings["hud-visible"] then local target=hud();check("close restores original HUD state",target~=nil and target.Enabled==true) end
local remaining=0
for index=__beforeConnections+1,#__allConnections do if __allConnections[index].Connected then remaining+=1 end end
check("close disconnects all owned and global connections",remaining==0,"Remaining="..remaining)
check("all real interactions are free from runtime errors",#__runtimeErrors==0,table.concat(__runtimeErrors," | "))
print("SPECIALIST_RUNTIME "..__json({passed=#__failures==0,checks=__checks,failures=__failures,runtimeErrors=__runtimeErrors,observations={executedCallbacks=__callbackCount,teleportCalls=#__teleports,connectionsRemaining=remaining,createdInstances=#__allInstances-__beforeInstances,initialBrightness=__initialBrightness}}))
