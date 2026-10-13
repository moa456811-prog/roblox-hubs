local __checks,__failures={},{}
local function check(name,condition,detail)
    table.insert(__checks,{name=name,passed=condition==true,detail=detail or ""})
    if not condition then table.insert(__failures,name..(detail and ": "..detail or "")) end
end
local function near(a,b) return type(a)=="number" and type(b)=="number" and math.abs(a-b)<0.01 end
local function rgb(value) return Color3.fromRGB(value[1],value[2],value[3]) end
local function countActions() return __eventCount("attack")+__eventCount("remote")+__eventCount("remote-event")+__eventCount("tween")+__eventCount("move") end
local function countConnections() local count=0;for _,state in ipairs(__allConnections) do if state.Connected then count+=1 end end;return count end
local function runCase(name,callback)
    local before=#__runtimeErrors
    local ok,message=pcall(callback)
    check(name.." completes without test or candidate errors",ok and #__runtimeErrors==before,tostring(message or table.concat(__runtimeErrors," | ")))
end
local function fixture()
    local minimum=__placeId==4442272183 and 700 or __placeId==7449423635 and 1500 or 0
    local f=__adapterFixture({placeId=__placeId,level=minimum+12})
    -- Inert typed module data is supplied for the appropriate sea-level range.
    -- This is a schema fixture, never a claim about a live server's quests.
    local quests=rawget(f.quests,"__moduleData")
    for index,stage in ipairs(quests.JungleQuest) do stage.LevelReq=minimum+5+index*5 end
    rawget(f.guide,"__moduleData").Data.NPCList[f.npc].Levels={minimum+10,minimum+15,minimum+20}
    f.gui:Destroy()
    return f
end
local function hubs()
    local values={}
    for _,object in ipairs(__allInstances) do if not __destroyed(object) and object:IsA("ScreenGui") and object:IsDescendantOf(__playerGui) then table.insert(values,object) end end
    return values
end
local function named(gui,name,class)
    local object=gui and gui:FindFirstChild(name,true)
    return object and (not class or object:IsA(class)) and object or nil
end
local function click(button)
    if not button or not __visible(button) or not button:IsA("GuiButton") or button.Interactable==false then return false end
    local wired=false
    for _,connection in ipairs(__allConnections) do if connection.Connected and connection.owner==button and connection.name=="Activated" then wired=true end end
    if not wired then return false end
    button.Activated._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,100,100),1)
    __flush()
    return true
end
local function open(gui,pageId) return click(named(gui,"nav_"..tostring(pageId),"TextButton")) end
local function overlap(a,b)
    local ax,ay,aw,ah=__rect(a);local bx,by,bw,bh=__rect(b)
    return math.min(ax+aw,bx+bw)-math.max(ax,bx)>1 and math.min(ay+ah,by+bh)-math.max(ay,by)>1
end
local function getControl(gui,feature,initialCheck)
    local record=__bindings[feature]
    check(feature.." has exactly one independent feature control",record~=nil and record.count==1)
    if not record or record.count~=1 then return nil,nil,nil end
    check(feature.." is on the requested page",record.pageLabel==record.expectedPage)
    check(feature.." requested page opens",open(gui,record.pageId))
    local wanted=record.expected
    local row=named(gui,"row_"..record.itemId,"Frame")
    local label=row and row:FindFirstChild("Label")
    local button=named(gui,(wanted.kind=="number" and "apply_" or "c_")..record.itemId,"TextButton")
    local input=wanted.kind=="number" and named(gui,"input_"..record.itemId,"TextBox") or nil
    check(feature.." requested visible English label",label~=nil and label.Text==wanted.label and __visible(label))
    check(feature.." has a visible enabled control",button~=nil and __visible(button) and button.Interactable~=false)
    if initialCheck then
        local text=wanted.kind=="number" and wanted.applyLabel or wanted.kind=="toggle" and (wanted.initial and wanted.onLabel or wanted.offLabel) or wanted.label
        check(feature.." exact initial control text",button~=nil and button.Text==text)
        if input then check(feature.." exact numeric initial value",input.Text==tostring(wanted.initial)) end
    end
    return button,input,wanted
end
local function start()
    local f=fixture()
    local ok,message=pcall(__candidate)
    check("actual generated hub initializes",ok,tostring(message or ""));__flush()
    local values=hubs()
    check("actual generated hub creates exactly one ScreenGui",#values==1)
    return f,values[1]
end
local function close(gui)
    local button=named(gui,"CloseButton","TextButton")
    check("requested Close is actionable",click(button))
    local actions=countActions();__advance(1)
    check("Close stops every actual game operation",countActions()==actions)
    check("Close destroys the whole hub",gui~=nil and __destroyed(gui) and #hubs()==0)
    check("Close disconnects every runtime connection",countConnections()==0,"Remaining="..countConnections())
end

runCase("custom UI and generated gameplay dispatch",function()
    local f,gui=start()
    local w=__expected.window
    local panel=named(gui,"Panel","Frame")
    local header=named(gui,"Header","Frame")
    check("exact requested custom window dimensions",panel~=nil and panel.Size.X.Scale==0 and panel.Size.Y.Scale==0 and panel.Size.X.Offset==w.width and panel.Size.Y.Offset==w.height)
    check("exact requested primary background",panel~=nil and panel.BackgroundColor3==rgb(w.palette.background))
    local corner=panel and panel:FindFirstChildOfClass("UICorner")
    check("exact requested corner radius",corner~=nil and corner.CornerRadius.Scale==0 and corner.CornerRadius.Offset==w.radius)
    local title=named(gui,"Title","TextLabel")
    check("exact custom title or complete absence",w.title=="" and title==nil or w.title~="" and title~=nil and title.Text==w.title)
    local fonts,branding=true,false
    local pageCount=0
    for _,object in ipairs(gui:GetDescendants()) do
        if object:IsA("ScrollingFrame") and string.sub(object.Name,1,5)=="page_" then pageCount+=1 end
        if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
            if object.Font.Name~=w.font or object.TextSize~=w.textSize then fonts=false end
            local value=string.lower(object.Text)
            if string.find(value,"a7dev",1,true) or string.find(value,"a7med",1,true) or string.find(value,"created by",1,true) then branding=true end
        end
    end
    check("all rendered text uses requested font and size",fonts)
    check("no unrequested private branding or author credit",not branding)
    check("exact requested number of pages",pageCount==#__expectedPages)
    local navigation=named(gui,"Navigation","ScrollingFrame")
    local layout=navigation and navigation:FindFirstChildOfClass("UIListLayout")
    check("exact requested top or left navigation",layout~=nil and layout.FillDirection==(w.navigation=="top" and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical))
    local buttons={}
    for index,page in ipairs(__expectedPages) do
        local tab=page.id and named(gui,"nav_"..page.id,"TextButton")
        local content=page.id and named(gui,"page_"..page.id,"ScrollingFrame")
        buttons[index]=tab
        check(page.label.." tab has exact label and order",tab~=nil and tab.Text==page.label and tab.LayoutOrder==index)
        check(page.label.." tab opens actual content",click(tab) and content~=nil and __visible(content))
        local visible=0
        for _,object in ipairs(gui:GetDescendants()) do if object:IsA("ScrollingFrame") and string.sub(object.Name,1,5)=="page_" and __visible(object) then visible+=1 end end
        check(page.label.." tab leaves exactly one page visible",visible==1)
        check(page.label.." active tab applies exact requested palette",tab~=nil and tab.BackgroundColor3==rgb(w.palette.accent) and tab.TextColor3==rgb(w.palette.background))
        for _,expectedPage in ipairs(__expected.pages) do if expectedPage.label==page.label then
            for _,item in ipairs(expectedPage.items) do if item.kind=="text" then
                local found=false
                for _,object in ipairs(content:GetDescendants()) do if object:IsA("TextLabel") and object.Text==item.text and __visible(object) then found=true end end
                check(page.label.." displays exact requested scope text",found)
            end end
        end end
    end
    for index=1,#__expectedPages do for other=index+1,#__expectedPages do
        check("requested tabs "..index.."/"..other.." do not overlap",buttons[index]~=nil and buttons[other]~=nil and not overlap(buttons[index],buttons[other]))
    end end
    for feature in pairs(__bindings) do getControl(gui,feature,true) end
    __advance(1)
    check("no game action happens before explicit activation",countActions()==0)
    check("no automatic rejoin",#__teleports==0)

    local enemy,enemyRoot,enemyHealth=__gameEnemy("Monkey",5,false)
    local boss,bossRoot,bossHealth=__gameEnemy("The Gorilla King",25,true)
    for _,operation in ipairs({{feature="auto-farm",kind="farm",target=enemyRoot,health=enemyHealth},{feature="auto-boss",kind="boss",target=bossRoot,health=bossHealth}}) do
        local button=getControl(gui,operation.feature)
        f.root.Position=Vector3.zero
        local before=__eventCount("attack")
        check(operation.feature.." starts through generated toggle",click(button))
        __advance(1)
        check(operation.feature.." dispatches ordinary attack input",__eventCount("attack")>before)
        check(operation.feature.." uses its actual intended target",(f.root.Position-operation.target.Position).Magnitude<=6)
        operation.health.Health=75;__advance(0.5)
        check(operation.feature.." does not invent hit or pickup remotes",__eventCount("remote-event")==0 and __eventCount("remote")==0)
        check(operation.feature.." generated Stop callback runs",click(button))
        local stopped=countActions();__advance(0.5)
        check(operation.feature.." Stop prevents further game operations",countActions()==stopped)
    end
    local quest=getControl(gui,"quest-farm")
    f.root.Position=Vector3.zero
    local attacks=__eventCount("attack")
    check("quest-farm starts through generated toggle",click(quest));__advance(1)
    local request
    for _,event in ipairs(__adapterEvents) do if event.kind=="remote" and event.args[1]=="StartQuest" then request=event end end
    check("quest-farm dispatches actual module-derived StartQuest arguments",request~=nil and request.args[2]=="JungleQuest" and request.args[3]==1)
    check("quest-farm waits for matching visible quest acknowledgment",__eventCount("attack")==attacks)
    f.questTitle.Text="Defeat 6 Monkeys";f.questUI.Visible=true;__advance(1)
    check("quest-farm attacks after matching UI acknowledgment",__eventCount("attack")>attacks)
    local status=named(gui,"Status","TextLabel")
    check("quest-farm shows actual quest acceptance confirmation",status~=nil and string.find(status.Text,"quest acceptance confirmed",1,true)~=nil)
    click(quest);local stopped=countActions();__advance(0.5)
    check("quest-farm Stop prevents further operations",countActions()==stopped)

    local loot=getControl(gui,"auto-loot")
    f.root.Position=Vector3.zero
    local movements=__eventCount("tween")
    check("auto-loot starts through generated toggle",click(loot));__advance(1)
    check("auto-loot dispatches physical movement",__eventCount("tween")>movements)
    check("auto-loot does not report pickup before observed collection",status~=nil and not string.find(status.Text,"pickup confirmed",1,true))
    f.chest:SetAttribute("IsDisabled",true);__advance(1)
    check("auto-loot shows actual chest-state confirmation",status~=nil and string.find(status.Text,"chest pickup confirmed",1,true)~=nil)
    f.fruit.Parent=f.backpack;__advance(1)
    check("auto-loot shows actual fruit inventory confirmation",status~=nil and string.find(status.Text,"fruit pickup confirmed",1,true)~=nil)
    check("auto-loot never invents pickup remote calls",__eventCount("remote-event")==0 and __eventCount("remote")==__eventCount("remote","StartQuest"))
    click(loot);stopped=countActions();__advance(0.5)
    check("auto-loot Stop prevents further operations",countActions()==stopped)

    local farm=getControl(gui,"auto-farm")
    click(farm);__advance(14)
    check("generated farm toggle turns Off after bounded progress failure",farm~=nil and farm.Text==__bindings["auto-farm"].expected.offLabel)
    check("generated UI shows the actual health-progress pause reason",status~=nil and string.find(status.Text,"health",1,true)~=nil)
    for _,entry in ipairs({{feature="walk-speed",property="WalkSpeed"},{feature="jump-power",property="JumpPower"}}) do
        local button,input,wanted=getControl(gui,entry.feature)
        check(entry.feature.." has an independent numeric input",input~=nil)
        if input and button then
            local value=math.floor((wanted.min+wanted.max)/2)
            input.Text=tostring(value);check(entry.feature.." Apply executes",click(button))
            check(entry.feature.." changes current Humanoid",f.humanoid[entry.property]==value)
            if entry.feature=="jump-power" then check("jump-power enables UseJumpPower",f.humanoid.UseJumpPower==true) end
            for _,invalid in ipairs({"abc","",tostring(wanted.min-1),tostring(wanted.max+1),"1e309"}) do
                input.Text=invalid;click(button)
                check(entry.feature.." rejects invalid "..invalid,f.humanoid[entry.property]==value)
            end
            for _,boundary in ipairs({wanted.min,wanted.max}) do input.Text=tostring(boundary);click(button);check(entry.feature.." accepts boundary "..boundary,f.humanoid[entry.property]==boundary) end
            local previous=f.humanoid
            local character,root,humanoid=__gameCharacter("RespawnedFor"..entry.feature,Vector3.new(2,0,0))
            __player.Character=character;__signals(__player).CharacterAdded._fire(character)
            input.Text=tostring(value);click(button)
            check(entry.feature.." Apply uses new Humanoid after respawn",humanoid[entry.property]==value and previous[entry.property]==wanted.max)
            if entry.feature=="jump-power" then check("jump-power re-enables power after respawn",humanoid.UseJumpPower==true) end
            f.character=character;f.root=root;f.humanoid=humanoid
        end
    end
    local rejoin=getControl(gui,"rejoin")
    local teleports=#__teleports
    check("generated Rejoin executes",click(rejoin))
    check("generated Rejoin uses exact profile place and local player",#__teleports==teleports+1 and __teleports[#__teleports].method=="Teleport" and __teleports[#__teleports].placeId==__placeId and __teleports[#__teleports].player==__player)
    local theme=getControl(gui,"theme")
    check("generated Theme executes",click(theme))
    local alternate=w.alternatePalette
    check("Theme applies exact alternate panel and control colors",alternate~=nil and panel.BackgroundColor3==rgb(alternate.background) and theme.BackgroundColor3==rgb(alternate.control) and theme.TextColor3==rgb(alternate.foreground))
    local themeTab=named(gui,"nav_"..__bindings.theme.pageId,"TextButton")
    check("Theme applies exact alternate navigation accent",themeTab~=nil and themeTab.BackgroundColor3==rgb(alternate.accent) and themeTab.TextColor3==rgb(alternate.background))
    click(theme)
    check("Theme restores exact primary palette",panel.BackgroundColor3==rgb(w.palette.background) and theme.BackgroundColor3==rgb(w.palette.control) and theme.TextColor3==rgb(w.palette.foreground))
    local startPosition=panel.Position
    header.InputBegan._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.Begin,100,100))
    __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,140,135))
    check("requested draggable header moves window",near(panel.Position.X.Offset-startPosition.X.Offset,40) and near(panel.Position.Y.Offset-startPosition.Y.Offset,35))
    __UIS.InputEnded._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,140,135))
    local dragStopped=panel.Position
    __UIS.InputChanged._fire(__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,180,180))
    check("drag stops after release",panel.Position==dragStopped)
    local minimize=named(gui,"MinimizeButton","TextButton")
    local restore=named(gui,"RestoreButton","TextButton")
    local closeButton=named(gui,"CloseButton","TextButton")
    check("exact requested lifecycle labels",minimize~=nil and minimize.Text==w.minimizeLabel and restore~=nil and restore.Text==w.restoreLabel and closeButton~=nil and closeButton.Text==w.closeLabel)
    check("Minimize hides panel and exposes Restore",click(minimize) and not panel.Visible and __visible(restore))
    check("Restore returns complete original panel",click(restore) and panel.Visible and not __visible(restore))
    close(gui)
end)

runCase("actual generated availability-aware arbitration",function()
    local f,gui=start()
    __gameEnemy("Monkey",5,false)
    local farm=getControl(gui,"auto-farm")
    click(farm)
    local boss=getControl(gui,"auto-boss")
    click(boss);__advance(1)
    check("actual Boss and Farm toggles farm when no boss exists",__eventCount("attack")>0)
    check("waiting Boss and active Farm controls preserve enabled intent",farm.Text==__bindings["auto-farm"].expected.onLabel and boss.Text==__bindings["auto-boss"].expected.onLabel)
    getControl(gui,"auto-farm");click(farm)
    getControl(gui,"auto-boss");click(boss)
    f.enemies:ClearAllChildren();f.root.Position=Vector3.zero
    getControl(gui,"auto-farm");click(farm)
    local loot=getControl(gui,"auto-loot");click(loot)
    local moves=__eventCount("tween");__advance(1.5)
    check("actual Farm and Loot controls collect when no farm target exists",__eventCount("tween")>moves)
    check("waiting Farm and active Loot controls preserve enabled intent",farm.Text==__bindings["auto-farm"].expected.onLabel and loot.Text==__bindings["auto-loot"].expected.onLabel)
    f.chest:SetAttribute("IsDisabled",true);__advance(0.5)
    local status=named(gui,"Status","TextLabel")
    check("actual Loot shows confirmed collection despite waiting Farm",status~=nil and string.find(status.Text,"confirmed",1,true)~=nil)
    close(gui)
end)
check("all actual generated callbacks are free of runtime errors",#__runtimeErrors==0,table.concat(__runtimeErrors," | "))
print("PRODUCTION_RUNTIME "..__json({passed=#__failures==0,checks=__checks,failures=__failures,runtimeErrors=__runtimeErrors,observations={remainingConnections=countConnections(),executedCallbacks=__callbackCount}}))
