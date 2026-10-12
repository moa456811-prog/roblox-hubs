local __checks={}
local __failures={}
local __observations={}
local function check(name,condition,detail)
    table.insert(__checks,{name=name,passed=condition==true,detail=detail or ""})
    if not condition then table.insert(__failures,name..(detail and ": "..detail or "")) end
    return condition
end
local function near(a,b) return math.abs(a-b)<0.01 end
local function live(class,visibleOnly)
    local found={}
    for _,object in ipairs(__allInstances) do
        if not __destroyed(object) and object:IsA(class) and object:IsDescendantOf(__playerGui) and (not visibleOnly or __visible(object)) then table.insert(found,object) end
    end
    return found
end
local function textOf(object)
    if object:IsA("TextButton") or object:IsA("TextLabel") or object:IsA("TextBox") then return object.Text end
    return ""
end
local function findText(text,class,visibleOnly)
    for _,object in ipairs(live(class or "GuiObject",visibleOnly)) do if textOf(object)==text then return object end end
    return nil
end
local function findPattern(pattern,class,visibleOnly)
    for _,object in ipairs(live(class or "GuiObject",visibleOnly)) do
        if string.find(string.lower(object.Name.." "..textOf(object)),pattern) then return object end
    end
    return nil
end
local function colorEvidence(color,visibleOnly)
    for _,object in ipairs(live("GuiObject",visibleOnly)) do
        if object.BackgroundColor3==color then return object.Name..".BackgroundColor3" end
        if (object:IsA("TextButton") or object:IsA("TextLabel") or object:IsA("TextBox")) and object.TextColor3==color then return object.Name..".TextColor3" end
    end
    return nil
end
local function click(object)
    if not object or not __visible(object) or not object:IsA("GuiButton") then return false end
    if object.Interactable==false then return false end
    local activationConnections=0
    for _,connection in ipairs(__allConnections) do
        if connection.Connected and connection.owner==object and (connection.name=="Activated" or connection.name=="MouseButton1Click") then activationConnections+=1 end
    end
    if activationConnections==0 then return false end
    object.Activated._fire(__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.End,100,100),1)
    object.MouseButton1Click._fire()
    __flush()
    return true
end
local function overlaps(a,b)
    local ax,ay,aw,ah=__rect(a)
    local bx,by,bw,bh=__rect(b)
    return math.min(ax+aw,bx+bw)-math.max(ax,bx)>1 and math.min(ay+ah,by+bh)-math.max(ay,by)>1
end
local function rectString(object)
    local x,y,w,h=__rect(object)
    return string.format("%s: %.1f,%.1f %.1fx%.1f",object.Name,x,y,w,h)
end
local function statusAfterTab(button,expected,hidden)
    check("tab "..button.Text.." has an active callback",click(button))
    check("tab "..button.Text.." shows its own content",expected and __visible(expected) or false, expected and expected.Name or "Expected content could not be found")
    if hidden then check("tab "..button.Text.." hides the other content",not __visible(hidden),hidden.Name) end
end
local function findActionAndInput(kind)
    local term=kind=="walk" and "walk" or "jump"
    local inputs=live("TextBox",true)
    local chosen
    for _,input in ipairs(inputs) do
        local haystack=string.lower(input.Name.." "..input.PlaceholderText)
        if string.find(haystack,term) or (kind=="walk" and string.find(haystack,"speed")) then chosen=input;break end
        local parent=input.Parent
        if parent then
            for _,sibling in ipairs(parent:GetChildren()) do
                if string.find(string.lower(sibling.Name.." "..textOf(sibling)),term) or (kind=="walk" and string.find(string.lower(textOf(sibling)),"speed")) then chosen=input;break end
            end
        end
        if chosen then break end
    end
    if not chosen and #inputs==2 then
        table.sort(inputs,function(a,b) local _,ay=__rect(a);local _,by=__rect(b);return ay<by end)
        chosen=kind=="walk" and inputs[1] or inputs[2]
    end
    if not chosen then return nil,nil end
    local buttons=live("GuiButton",true)
    local nearest,score
    local ix,iy,iw,ih=__rect(chosen)
    for _,button in ipairs(buttons) do
        local text=string.lower(textOf(button).." "..button.Name)
        if string.find(text,"apply") or string.find(text,"appliquer") then
            local bx,by,bw,bh=__rect(button)
            local candidateScore=math.abs((iy+ih/2)-(by+bh/2))*10+math.abs((ix+iw/2)-(bx+bw/2))
            if chosen.Parent==button.Parent then candidateScore-=10000 end
            if not score or candidateScore<score then nearest=button;score=candidateScore end
        end
    end
    return nearest,chosen
end
local function activeGlobalConnections()
    local count=0
    local names={}
    for _,connection in ipairs(__allConnections) do
        if connection.Connected then
            count+=1
            table.insert(names,type(connection.owner)=="table" and tostring(connection.owner).."."..connection.name or tostring(connection.owner).."."..connection.name)
        end
    end
    return count,names
end
local function visibleButtonSummary()
    local summary={}
    for _,button in ipairs(live("GuiButton",true)) do table.insert(summary,{name=button.Name,text=textOf(button),rect=rectString(button)}) end
    return summary
end

local startOK,startError=pcall(__candidate)
if not startOK then table.insert(__runtimeErrors,tostring(startError)) end
__flush()
check("script initializes without runtime errors",# __runtimeErrors==0, table.concat(__runtimeErrors," | "))
local guis=live("ScreenGui",false)
check("exactly one ScreenGui is parented to PlayerGui",#guis==1,"Found "..#guis)
local gui=guis[1]
local expectedWidth=__scenario=="full-hub" and 480 or 420
local expectedHeight=__scenario=="full-hub" and 360 or 280
local titleText=__scenario=="full-hub" and "Aurora Hub" or "Aurora Panel"
local title=findText(titleText,"TextLabel",true)
check("requested exact title is visible",title~=nil,titleText)
local panel
for _,object in ipairs(live("GuiObject",true)) do
    local _,_,w,h=__rect(object)
    if near(w,expectedWidth) and near(h,expectedHeight) and object:IsA("Frame") then panel=object;break end
end
check("requested exact window size is applied to a visible panel",panel~=nil,expectedWidth.."x"..expectedHeight)
local navy=Color3.fromRGB(18,24,42)
local cyan=Color3.fromRGB(85,221,255)
check("requested navy is applied to the window",panel~=nil and panel.BackgroundColor3==navy)
check("requested cyan accent is visibly applied",colorEvidence(cyan,true)~=nil,colorEvidence(cyan,true))
__observations.initialVisibleButtons=visibleButtonSummary()

if __scenario=="french-ui" then
    local home=findText("Accueil","TextButton",true)
    local settings=findText("Réglages","TextButton",true)
    local welcome=findText("Bienvenue","TextLabel",false)
    local parameters=findText("Paramètres","TextLabel",false)
    local close=findText("Fermer","TextButton",true)
    check("both requested tab buttons exist",home~=nil and settings~=nil)
    check("both requested page contents exist",welcome~=nil and parameters~=nil)
    check("exact requested close button exists",close~=nil)
    if home and settings then
        check("tabs do not overlap each other",not overlaps(home,settings),rectString(home).." | "..rectString(settings))
        if title then check("tabs are laid out below the header",not overlaps(home,title) and not overlaps(settings,title)) end
        local initialHomeBackground=home.BackgroundColor3
        local initialSettingsBackground=settings.BackgroundColor3
        local initialHomeText=home.TextColor3
        local initialSettingsText=settings.TextColor3
        statusAfterTab(settings,parameters,welcome)
        local appearanceChanged=home.BackgroundColor3~=initialHomeBackground or settings.BackgroundColor3~=initialSettingsBackground or home.TextColor3~=initialHomeText or settings.TextColor3~=initialSettingsText
        check("changing tab changes active tab appearance",appearanceChanged)
        statusAfterTab(home,welcome,parameters)
    end
    check("no teleport is attempted in UI-only mode",#__teleports==0)
    check("close button has an active callback",click(close))
else
    check("panel is rounded",panel~=nil and panel:FindFirstChildOfClass("UICorner")~=nil)
    local movement=findText("Movement","TextButton",true)
    local session=findText("Session","TextButton",true)
    local settings=findText("Settings","TextButton",true)
    check("all three requested tabs exist",movement~=nil and session~=nil and settings~=nil)
    if movement and session and settings then
        check("three tab buttons do not overlap",not overlaps(movement,session) and not overlaps(session,settings) and not overlaps(movement,settings))
        if title then check("tabs are laid out below the header",not overlaps(movement,title) and not overlaps(session,title) and not overlaps(settings,title)) end
    end
    check("no teleport occurs during initialization",#__teleports==0)
    if movement then check("Movement tab has an active callback",click(movement)) end
    local walkApply,walkInput=findActionAndInput("walk")
    local jumpApply,jumpInput=findActionAndInput("jump")
    check("Movement exposes independent speed and jump inputs",walkInput~=nil and jumpInput~=nil and walkInput~=jumpInput)
    check("Movement exposes independent speed and jump apply controls",walkApply~=nil and jumpApply~=nil and walkApply~=jumpApply)
    if walkInput and jumpInput and walkApply and jumpApply then
        check("Movement input rows do not overlap",not overlaps(walkInput,jumpInput) and not overlaps(walkApply,jumpApply))
        check("Movement inputs and apply controls do not overlap",not overlaps(walkInput,walkApply) and not overlaps(jumpInput,jumpApply))
    end
    if walkInput and walkApply then
        walkInput.Text="24"
        check("speed Apply has an active callback",click(walkApply))
        check("speed Apply immediately changes the current Humanoid",__humanoid.WalkSpeed==24,"WalkSpeed="..tostring(__humanoid.WalkSpeed))
        for _,invalid in ipairs({"abc","7","33",""}) do
            local previous=__humanoid.WalkSpeed
            walkInput.Text=invalid;click(walkApply)
            check("speed rejects invalid value "..string.format("%q",invalid),__humanoid.WalkSpeed==previous)
        end
        for _,valid in ipairs({8,32}) do walkInput.Text=tostring(valid);click(walkApply);check("speed accepts boundary "..valid,__humanoid.WalkSpeed==valid) end
    end
    if jumpInput and jumpApply then
        jumpInput.Text="65"
        check("jump Apply has an active callback",click(jumpApply))
        check("jump Apply enables power and immediately changes the current Humanoid",__humanoid.UseJumpPower==true and __humanoid.JumpPower==65,"UseJumpPower="..tostring(__humanoid.UseJumpPower)..", JumpPower="..tostring(__humanoid.JumpPower))
        for _,invalid in ipairs({"abc","19","76",""}) do local previous=__humanoid.JumpPower;jumpInput.Text=invalid;click(jumpApply);check("jump rejects invalid value "..string.format("%q",invalid),__humanoid.JumpPower==previous) end
        for _,valid in ipairs({20,75}) do jumpInput.Text=tostring(valid);click(jumpApply);check("jump accepts boundary "..valid,__humanoid.JumpPower==valid) end
    end
    if session then check("Session tab has an active callback",click(session)) end
    local rejoin=findPattern("rejoin","TextButton",true)
    check("Session displays Rejoin control",rejoin~=nil)
    if walkInput then check("Session hides Movement content",not __visible(walkInput)) end
    check("no unrelated control triggers a teleport",#__teleports==0)
    check("Rejoin has an active callback",click(rejoin))
    check("Rejoin calls Teleport exactly once with PlaceId and LocalPlayer",#__teleports==1 and __teleports[1].method=="Teleport" and __teleports[1].placeId==__game.PlaceId and __teleports[1].player==__player,"Teleport calls="..#__teleports)
    if settings then check("Settings tab has an active callback",click(settings)) end
    local theme=findPattern("theme","TextButton",true)
    check("Settings displays Theme control",theme~=nil)
    if rejoin then check("Settings hides Session content",not __visible(rejoin)) end
    local oldColor=panel and panel.BackgroundColor3
    local oldThemeControl=theme and theme.BackgroundColor3
    check("Theme has an active callback",click(theme))
    check("Theme visibly changes panel and control colors",panel~=nil and panel.BackgroundColor3~=oldColor and theme~=nil and theme.BackgroundColor3~=oldThemeControl)
    local purple=false
    for _,object in ipairs(live("GuiObject",true)) do
        local color=object.BackgroundColor3
        if color.R>color.G+0.1 and color.B>color.G+0.1 then purple=true end
        if object:IsA("TextButton") or object:IsA("TextLabel") or object:IsA("TextBox") then color=object.TextColor3;if color.R>color.G+0.1 and color.B>color.G+0.1 then purple=true end end
    end
    check("alternate theme visibly includes a purple accent",purple)
    click(theme)
    check("Theme toggle returns to requested initial navy",panel~=nil and panel.BackgroundColor3==navy)
    local draggableCandidates={}
    for _,connection in ipairs(__allConnections) do if connection.Connected and connection.name=="InputBegan" and type(connection.owner)=="table" and rawget(connection.owner,"__class") and __visible(connection.owner) then table.insert(draggableCandidates,connection.owner) end end
    local dragged=false
    if panel then
        for _,handle in ipairs(draggableCandidates) do
            local initial=panel.Position
            local px,py=__rect(panel)
            local down=__input(Enum.UserInputType.MouseButton1,Enum.UserInputState.Begin,100,100)
            handle.InputBegan._fire(down)
            local movementInput=__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,145,130)
            handle.InputChanged._fire(movementInput)
            __mousePosition=Vector2.new(145,130)
            __UIS.InputChanged._fire(movementInput,false)
            __flush()
            local nx,ny=__rect(panel)
            if near(nx-px,45) and near(ny-py,30) then dragged=true end
            down.UserInputState=Enum.UserInputState.End;down.Changed._fire("UserInputState")
            handle.InputEnded._fire(down);__UIS.InputEnded._fire(down,false)
            local stopX,stopY=__rect(panel)
            local after=__input(Enum.UserInputType.MouseMovement,Enum.UserInputState.Change,185,160)
            __UIS.InputChanged._fire(after,false)
            local endX,endY=__rect(panel)
            if dragged then check("dragging stops after the mouse is released",near(stopX,endX) and near(stopY,endY));break end
            panel.Position=initial
        end
    end
    check("panel drags by the mouse movement delta",dragged)
    local minimize=findPattern("minimi","TextButton",true) or findText("_","TextButton",true) or findText("−","TextButton",true) or findText("-","TextButton",true)
    check("Minimize has an active callback",click(minimize))
    local restore=findPattern("restore","TextButton",true) or findPattern("restaur","TextButton",true) or findText("Aurora Hub","TextButton",true)
    check("minimized UI exposes a visible Restore control",restore~=nil)
    check("minimization preserves the live ScreenGui",gui~=nil and not __destroyed(gui))
    check("Restore has an active callback",click(restore))
    check("restoring shows the full sized panel",panel~=nil and __visible(panel) and near(panel.AbsoluteSize.X,480) and near(panel.AbsoluteSize.Y,360))
    local close=findPattern("close","TextButton",true) or findText("X","TextButton",true) or findText("×","TextButton",true) or findText("✕","TextButton",true)
    check("Close has an active callback",click(close))
end

check("Close destroys the complete ScreenGui",gui~=nil and __destroyed(gui))
check("Close leaves no visible UI or restore button",#live("GuiObject",true)==0,"Visible GUI objects="..#live("GuiObject",true))
local connections,connectionNames=activeGlobalConnections()
check("Close disconnects all owned connections",connections==0,table.concat(connectionNames,", "))
check("all interactions complete without runtime errors",#__runtimeErrors==0,table.concat(__runtimeErrors," | "))
__observations.createdInstances=#__allInstances
__observations.executedCallbacks=__callbackCount
__observations.teleportCalls=#__teleports
__observations.connectionsRemaining=connections
print("QA_RESULT "..__json({passed=#__failures==0,checks=__checks,failures=__failures,runtimeErrors=__runtimeErrors,observations=__observations}))
