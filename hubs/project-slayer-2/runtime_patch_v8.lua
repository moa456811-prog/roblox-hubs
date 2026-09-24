-- A7DEV Project Slayer 2 | Runtime Patch V6
-- Visual-only polish + isolated Auto Muzan Quest. Existing working systems stay untouched.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_RUNTIME_V6_STOP then pcall(ENV.A7DEV_PS2_RUNTIME_V6_STOP) end

local P = {alive=true, conns={}, styled=setmetatable({}, {__mode="k"}), tween=nil, doctorAt=0}
local function on(c) if c then P.conns[#P.conns+1]=c end return c end
local function stop()
    if not P.alive then return end
    P.alive=false
    if P.tween then pcall(function() P.tween:Cancel() end) end
    for _,c in ipairs(P.conns) do pcall(function() c:Disconnect() end) end
    ENV.A7DEV_PS2_RUNTIME_V6_STOP=nil
end
ENV.A7DEV_PS2_RUNTIME_V6_STOP=stop

local function low(v) return string.lower(tostring(v or "")) end
local function own(o) return string.sub(tostring(o.Name or ""),1,16)=="A7DEV_REF3_V6_" end
local function mk(class,parent,props)
    local o=Instance.new(class); o.Name="A7DEV_REF3_V6_"..class
    for k,v in pairs(props or {}) do o[k]=v end
    o.Parent=parent
    return o
end
local function round(o,r) return mk("UICorner",o,{CornerRadius=UDim.new(0,r or 7)}) end
local function line(o,c,t)
    return mk("UIStroke",o,{Color=c,Transparency=t or 0,Thickness=1,ApplyStrokeMode=Enum.ApplyStrokeMode.Border})
end

local C={
    red=Color3.fromRGB(204,54,74), red2=Color3.fromRGB(139,43,58),
    dark=Color3.fromRGB(20,23,29), card=Color3.fromRGB(13,27,41),
    line=Color3.fromRGB(27,48,65), text=Color3.fromRGB(235,242,249),
    muted=Color3.fromRGB(126,150,171), dim=Color3.fromRGB(72,95,116)
}

local ICON={
    H="rbxassetid://7733960981",
    F="rbxassetid://7733674079",
    C="rbxassetid://7733765398",
    Q="rbxassetid://7733687281",
    TP="rbxassetid://7733992789",
    P="rbxassetid://7743875962",
    L="rbxassetid://7734056747",
    FI="rbxassetid://7733911490",
    D="rbxassetid://7733965184",
    ["••"]="rbxassetid://7734053495",
}

local function replaceSymbol(frame)
    if P.styled[frame] or not frame:IsA("Frame") then return end
    if frame.AbsoluteSize.X>44 or frame.AbsoluteSize.Y>44 then return end
    local codeLabel
    for _,x in ipairs(frame:GetChildren()) do
        if x:IsA("TextLabel") and ICON[x.Text] then codeLabel=x break end
    end
    if not codeLabel then return end
    P.styled[frame]=true
    codeLabel.Visible=false
    frame.BackgroundColor3=Color3.fromRGB(10,18,28)
    frame.BackgroundTransparency=0
    local s=frame:FindFirstChildOfClass("UIStroke")
    if s then s.Color=C.red2; s.Transparency=.42 else line(frame,C.red2,.42) end
    mk("ImageLabel",frame,{
        BackgroundTransparency=1,AnchorPoint=Vector2.new(.5,.5),Position=UDim2.fromScale(.5,.5),
        Size=UDim2.fromOffset(18,18),Image=ICON[codeLabel.Text],ImageColor3=C.red,ScaleType=Enum.ScaleType.Fit
    })
end

local function renameBoss(o)
    if not (o:IsA("TextLabel") or o:IsA("TextButton")) then return end
    local busy=false
    local function fix()
        if busy then return end
        local t=tostring(o.Text or "")
        local n
        if t=="Combat" then n="Boss"
        elseif t=="Auto Combat" then n="Auto Boss"
        elseif t=="Auto attack, bosses and combat helpers." then n="Boss farming, boss list and Yeti automation."
        elseif t=="Auto attack, bosses and skills." then n="Boss farming, Yeti and boss selection."
        end
        if n then busy=true; o.Text=n; busy=false end
    end
    fix(); on(o:GetPropertyChangedSignal("Text"):Connect(fix))
end

local function parseRow(text)
    text=tostring(text or "")
    local selected=text:match("^%[[xX]%]")~=nil
    local name=text:gsub("^%[[xX ]%]%s*","")
    local amount=name:match("%s+x(%d+)%s*$")
    if amount then name=name:gsub("%s+x%d+%s*$","") end
    return selected,name,amount
end

local function sellRow(row)
    if P.styled[row] or not row:IsA("TextButton") then return end
    if row.Name~="SellItemRow" and not (row.Parent and row.Parent.Name=="SellItemList") then return end
    P.styled[row]=true
    row.TextTransparency=1; row.BorderSizePixel=0; row.Size=UDim2.new(1,0,0,42); row.BackgroundColor3=C.card
    for _,x in ipairs(row:GetDescendants()) do
        if not own(x) then
            if x:IsA("UIStroke") then x.Transparency=1
            elseif string.sub(x.Name or "",1,12)=="A7DEV_REF3_" and x:IsA("GuiObject") then x.Visible=false end
        end
    end
    round(row,8); local rs=line(row,C.line,.1)

    local tile=mk("Frame",row,{Position=UDim2.fromOffset(8,7),Size=UDim2.fromOffset(28,28),BackgroundColor3=Color3.fromRGB(12,23,35),BorderSizePixel=0})
    round(tile,7); line(tile,C.line,.22)
    mk("ImageLabel",tile,{BackgroundTransparency=1,Position=UDim2.fromOffset(5,5),Size=UDim2.fromOffset(18,18),Image="rbxassetid://7734021469",ImageColor3=C.muted,ScaleType=Enum.ScaleType.Fit})

    local name=mk("TextLabel",row,{BackgroundTransparency=1,Position=UDim2.fromOffset(45,0),Size=UDim2.new(1,-133,1,0),Font=Enum.Font.GothamSemibold,Text="",TextSize=10,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left,TextTruncate=Enum.TextTruncate.AtEnd})
    local qty=mk("Frame",row,{Position=UDim2.new(1,-82,.5,-10),Size=UDim2.fromOffset(43,20),BackgroundColor3=Color3.fromRGB(14,28,42),BorderSizePixel=0})
    round(qty,7); line(qty,C.line,.2)
    local qtxt=mk("TextLabel",qty,{BackgroundTransparency=1,Size=UDim2.fromScale(1,1),Font=Enum.Font.GothamBold,Text="",TextSize=8,TextColor3=C.muted,TextXAlignment=Enum.TextXAlignment.Center})

    local check=mk("Frame",row,{Position=UDim2.new(1,-31,.5,-11),Size=UDim2.fromOffset(22,22),BackgroundColor3=Color3.fromRGB(12,23,35),BorderSizePixel=0})
    round(check,7); local cs=line(check,C.line,.02)
    local circle=mk("ImageLabel",check,{BackgroundTransparency=1,Position=UDim2.fromOffset(4,4),Size=UDim2.fromOffset(14,14),Image="rbxassetid://7733919881",ImageColor3=C.dim,ScaleType=Enum.ScaleType.Fit})
    local tick=mk("ImageLabel",check,{BackgroundTransparency=1,Position=UDim2.fromOffset(4,4),Size=UDim2.fromOffset(14,14),Image="rbxassetid://7733715400",ImageColor3=Color3.new(1,1,1),Visible=false,ScaleType=Enum.ScaleType.Fit})

    local selected=false
    local hover=false
    local function paint()
        row.BackgroundColor3=selected and (hover and Color3.fromRGB(25,29,36) or C.dark) or (hover and Color3.fromRGB(20,34,49) or C.card)
        rs.Color=selected and C.red2 or C.line; rs.Transparency=selected and .02 or .1
        check.BackgroundColor3=selected and C.red or Color3.fromRGB(12,23,35)
        cs.Color=selected and C.red or C.line
        circle.Visible=not selected; tick.Visible=selected
        qty.BackgroundColor3=selected and Color3.fromRGB(22,25,31) or Color3.fromRGB(14,28,42)
        qtxt.TextColor3=selected and C.red or C.muted
    end
    local function refresh()
        local s,n,a=parseRow(row.Text); selected=s; name.Text=n~="" and n or "Unknown item"; qtxt.Text=a and ("x"..a) or ""; paint()
    end
    refresh()
    on(row:GetPropertyChangedSignal("Text"):Connect(refresh))
    on(row.MouseEnter:Connect(function() hover=true; paint() end))
    on(row.MouseLeave:Connect(function() hover=false; paint() end))
end

local function sellActions(gui)
    local sec=gui:FindFirstChild("Section_Auto Sell",true)
    if not sec then return end
    local map={
        ["Refresh sellable items"]="Refresh Items",["Select All Sellable"]="Select All",
        ["Clear selected items"]="Clear Selection",["Sell selected now"]="Sell Selected",
        ["Unlock Ginzo Seller now"]="Unlock Seller"
    }
    for _,x in ipairs(sec:GetDescendants()) do
        if x:IsA("TextButton") then
            if map[x.Text] then x.Text=map[x.Text] end
            if x.Text=="Sell Selected" or x.Text=="Unlock Seller" then
                x.BackgroundColor3=C.red2; x.Font=Enum.Font.GothamBold; x.TextSize=10
            end
        end
    end
end

local function req(x)
    if not x then return nil end
    local ok,v=pcall(require,x); if ok then return v end
end

local N={}
local function native()
    local CAM=ReplicatedStorage:FindFirstChild("CAM")
    local G=CAM and CAM:FindFirstChild("Global")
    local sub=G and G:FindFirstChild("Subsets")
    local gp=sub and sub:FindFirstChild("Gameplay")
    local comm=ReplicatedStorage:FindFirstChild("Communication")
    local sc=comm and comm:FindFirstChild("ServerAndClient")
    local sig=sc and sc:FindFirstChild("Signals")
    N.Utility=G and req(G:FindFirstChild("Utility"))
    N.Quests=gp and req(gp:FindFirstChild("Quests"))
    N.SignalEvent=sig and req(sig:FindFirstChild("SignalEvent"))
end

local function data()
    if not N.Utility then native() end
    if N.Utility and type(N.Utility.GetData)=="function" then
        local ok,v=pcall(N.Utility.GetData,LocalPlayer); if ok then return v end
    end
end
local function send(...)
    if not N.SignalEvent then native() end
    if N.SignalEvent and type(N.SignalEvent.ToServer)=="function" then return pcall(N.SignalEvent.ToServer,...) end
    return false
end
local function race()
    local d=data()
    local r=d and d:FindFirstChild("Race",true)
    if r and r:IsA("ValueBase") then return tostring(r.Value) end
    for _,o in ipairs({LocalPlayer,LocalPlayer.Character,d}) do
        if o then local ok,v=pcall(o.GetAttribute,o,"Race"); if ok and v~=nil then return tostring(v) end end
    end
    return "Unknown"
end
local function isDemon() return string.find(low(race()),"demon",1,true)~=nil end

local function pos(v)
    if typeof(v)=="Vector3" then return v end
    if typeof(v)=="CFrame" then return v.Position end
    if typeof(v)=="Instance" then
        if v:IsA("BasePart") then return v.Position end
        local p=v:IsA("Model") and (v:FindFirstChild("HumanoidRootPart") or v.PrimaryPart) or v:FindFirstChildWhichIsA("BasePart",true)
        return p and p.Position
    end
end
local function markerPos(m) return m and pos(m.Position or m.position or m) end
local function move(p)
    if typeof(p)~="Vector3" then return false end
    local ch=LocalPlayer.Character; local h=ch and ch:FindFirstChildOfClass("Humanoid"); local r=ch and ch:FindFirstChild("HumanoidRootPart")
    if not h or h.Health<=0 or not r then return false end
    local goal=p+Vector3.new(0,2,0); local dist=(r.Position-goal).Magnitude
    if dist<=7 then return true end
    if P.tween then pcall(function() P.tween:Cancel() end) end
    P.tween=TweenService:Create(r,TweenInfo.new(math.clamp(dist/40,.08,6),Enum.EasingStyle.Linear),{CFrame=CFrame.new(goal)})
    P.tween:Play(); return false
end
local function nearPrompt(p,q)
    local best,bd; q=low(q)
    for _,x in ipairs(workspace:GetDescendants()) do
        if x:IsA("ProximityPrompt") and x.Enabled then
            local part=x.Parent
            if part and not part:IsA("BasePart") then part=part:FindFirstChildWhichIsA("BasePart",true) end
            if part then
                local text=low((x.ObjectText or "").." "..(x.ActionText or "").." "..tostring(x.Parent and x.Parent.Name or ""))
                local d=(part.Position-p).Magnitude
                if d<=18 and (q=="" or string.find(text,q,1,true)) and (not bd or d<bd) then best,bd=x,d end
            end
        end
    end
    return best
end
local function fire(p)
    if not p or not p.Enabled then return false end
    if type(fireproximityprompt)=="function" then return pcall(fireproximityprompt,p) end
    return pcall(function() p:InputHoldBegin(); task.wait(math.max(.05,tonumber(p.HoldDuration) or 0)); p:InputHoldEnd() end)
end

local function questState()
    if not N.Quests then native() end
    if N.Quests and type(N.Quests.GetPlayerQuestState)=="function" then
        local ok,v=pcall(N.Quests.GetPlayerQuestState,LocalPlayer,"Muzan Quest"); if ok and v~=nil then return tostring(v) end
    end
    return "None"
end

local function objective()
    local d=data(); local qs=d and d:FindFirstChild("Quests"); local holder=qs and qs:FindFirstChild("Holder")
    if not holder then return nil end
    for _,q in ipairs(holder:GetChildren()) do
        local s=q:FindFirstChild("QuestString"); local qn=s and tostring(s.Value)~="" and tostring(s.Value) or q.Name
        if qn=="Muzan Quest" or q.Name=="Muzan Quest" then
            local info
            if N.Quests and type(N.Quests.GetQuestInfo)=="function" then pcall(function() info=N.Quests.GetQuestInfo(qn) end) end
            local tasks=q:FindFirstChild("Tasks"); local fallback
            if tasks then
                for _,t in ipairs(tasks:GetChildren()) do
                    local v=t:FindFirstChild("Value"); local m=t:FindFirstChild("Max")
                    if v and m and tonumber(v.Value) and tonumber(m.Value) and v.Value<m.Value then
                        local marker
                        if info and N.Quests and type(N.Quests.GetTaskMarker)=="function" then pcall(function() marker=N.Quests.GetTaskMarker(info,t) end) end
                        local o={Name=t.Name,Value=tonumber(v.Value) or 0,Max=tonumber(m.Value) or 0,Marker=marker}
                        local n=low(t.Name)
                        if string.find(n,"higoshima",1,true) then return o end
                        if not fallback then fallback=o end
                    end
                end
            end
            return fallback
        end
    end
end

local function take(State)
    if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then
        local ok,msg=State.GameOps.verifiedNpcAction("Muzan"); if not ok then return false,tostring(msg or "Muzan unavailable") end
    end
    if N.Quests and type(N.Quests.CanAddQuest)=="function" then
        local ok,can=pcall(N.Quests.CanAddQuest,LocalPlayer,"Muzan Quest")
        if ok and can~=true then return false,"Muzan Quest not available yet" end
    end
    local ok=send("AddQuest","Muzan Quest")
    return ok, ok and "Muzan Quest requested" or "AddQuest failed"
end

local function busy(State)
    local f=State.Flags or {}
    if f.AutoBecomeDemon then return true,"Auto Demon" end
    if f.AutoFarm then return true,"Auto Farm" end
    if f.AutoBoss or f.AutoAllBoss then return true,"Auto Boss" end
    if f.AutoDungeon then return true,"Auto Dungeon" end
    if f.AutoYeti or f.AutoHeartYeti then return true,"Yeti" end
    if f.AutoFishingReel then return true,"Auto Fish" end
    if State.PlayerOps and type(State.PlayerOps.wantsRoute)=="function" then
        local ok,v=pcall(State.PlayerOps.wantsRoute); if ok and v then return true,"Player Farm" end
    end
    return false
end

local function drive(State,o)
    local n=low(o.Name); local mp=markerPos(o.Marker)
    if string.find(n,"spider",1,true) and string.find(n,"lil",1,true) then
        if mp then
            if not move(mp) then return end
            local p=nearPrompt(mp,"lil") or nearPrompt(mp,"spider"); if p then fire(p) end
        else
            local lily=workspace:FindFirstChild("Spider Lily",true); local lp=pos(lily)
            if lp and move(lp) then local p=lily:FindFirstChildWhichIsA("ProximityPrompt",true) or nearPrompt(lp,"lil"); if p then fire(p) end end
        end
        return
    end
    if string.find(n,"higoshima",1,true) then
        local doctor=workspace:FindFirstChild("Dr. Higoshima",true) or workspace:FindFirstChild("Higoshima",true)
        if doctor and os.clock()-P.doctorAt>2 and State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then
            local ok=State.GameOps.verifiedNpcAction("Dr. Higoshima"); if ok then P.doctorAt=os.clock(); return end
        end
        if mp and move(mp) then local p=nearPrompt(mp,"deliver") or nearPrompt(mp,"higoshima"); if p then fire(p) end end
        return
    end
    if mp and move(mp) then local p=nearPrompt(mp,""); if p then fire(p) end end
end

local function installMuzan(State,gui)
    State.Flags=State.Flags or {}; State.Flags.AutoMuzanQuest=State.Flags.AutoMuzanQuest==true
    State.MuzanQuestStatus=State.MuzanQuestStatus or "Disabled"
    local page=gui:FindFirstChild("Page_QUEST",true)
    if not page or page:FindFirstChild("Section_Muzan Quest",true) then return end
    local cols={}
    for _,x in ipairs(page:GetChildren()) do if x:IsA("ScrollingFrame") then cols[#cols+1]=x end end
    table.sort(cols,function(a,b) return a.AbsolutePosition.X<b.AbsolutePosition.X end)
    local left=cols[1]
    if not left or not State.Runtime or type(State.Runtime.createSection)~="function" then return end
    local sec=State.Runtime.createSection(left,"Muzan Quest")
    local info=State.Runtime.makeLabel(sec,"Demon only | "..State.MuzanQuestStatus,UDim2.new(1,0,0,32),UDim2.new(),10,State.Runtime.Theme.Sub)
    info.TextWrapped=true
    State.Runtime.addToggle(sec,"Auto Muzan Quest",State.Flags.AutoMuzanQuest,function(v)
        State.Flags.AutoMuzanQuest=v; State.MuzanQuestStatus=v and "Starting..." or "Disabled"
    end)
    State.Runtime.addButton(sec,"Take Muzan Quest Now",function()
        State.Flags.AutoMuzanQuest=true
        local _,msg=take(State); State.MuzanQuestStatus=tostring(msg)
    end)

    task.spawn(function()
        local nextAction=0
        while P.alive and gui.Parent and not State.Destroyed do
            task.wait(.3)
            if State.Flags.AutoMuzanQuest then
                if not isDemon() then State.MuzanQuestStatus="Demon race required | current: "..race()
                else
                    local b,r=busy(State)
                    if b then State.MuzanQuestStatus="Waiting for "..r
                    elseif os.clock()>=nextAction then
                        nextAction=os.clock()+.55
                        local o=objective()
                        if o then
                            State.MuzanQuestStatus=string.format("%s | %d/%d",o.Name,o.Value,o.Max)
                            pcall(drive,State,o)
                        elseif questState()=="Doing" then
                            State.MuzanQuestStatus="Returning Muzan Quest"
                            if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then pcall(State.GameOps.verifiedNpcAction,"Muzan") end
                        else
                            local _,msg=take(State); State.MuzanQuestStatus=tostring(msg)
                        end
                    end
                end
            end
            info.Text="Demon only | "..tostring(State.MuzanQuestStatus or "Idle")
        end
    end)
end


-- A7DEV PS2 PREMIUM LAYOUT V7
local function installPremiumLayout(gui)
    local main = gui and gui:FindFirstChild("Main")
    if not main or main:FindFirstChild("A7DEV_REF3_V7_ROOT") then return end

    local pages = {}
    for _, key in ipairs({"FARM","BOSS","QUEST","TELEPORT","PLAYER","MISC"}) do
        pages[key] = main:FindFirstChild("Page_"..key, true)
    end
    if not pages.FARM or not pages.BOSS then return end

    local pageHost = pages.FARM.Parent
    local nativeTabs
    for _, d in ipairs(main:GetDescendants()) do
        if d:IsA("TextButton") and d.Text == "FARM" and d.Parent then
            nativeTabs = d.Parent
            break
        end
    end
    if nativeTabs then nativeTabs.Visible = false end

    local nativeTitle
    for _, d in ipairs(main:GetDescendants()) do
        if d:IsA("TextLabel") and string.find(low(d.Text), "project slayer 2", 1, true) then
            nativeTitle = d
            break
        end
    end
    local nativeHeader = nativeTitle and nativeTitle.Parent
    if nativeTitle then nativeTitle.Visible = false end

    local statusLabel
    for _, d in ipairs(main:GetDescendants()) do
        if d:IsA("TextLabel") and string.find(low(d.Text), "status", 1, true) then
            statusLabel = d
            break
        end
    end
    local nativeFooter = statusLabel and statusLabel.Parent

    main.Name = "Main"
    main.Size = UDim2.fromOffset(820, 560)
    main.Position = UDim2.new(.5, -410, .5, -280)
    main.BackgroundColor3 = Color3.fromRGB(3, 8, 14)
    main.BorderSizePixel = 0
    local oldMainStroke = main:FindFirstChildOfClass("UIStroke")
    if oldMainStroke then
        oldMainStroke.Color = C.line
        oldMainStroke.Transparency = .05
    end
    if not main:FindFirstChildOfClass("UICorner") then round(main, 10) end

    local rootMark = mk("Frame", main, {
        Name = "A7DEV_REF3_V7_ROOT",
        BackgroundTransparency = 1,
        Size = UDim2.fromScale(1,1),
        ZIndex = 1,
    })

    local uiScale = mk("UIScale", main, {Scale = 1})
    local function fit()
        local cam = workspace.CurrentCamera
        local vp = cam and cam.ViewportSize or Vector2.new(1280,720)
        uiScale.Scale = math.clamp(math.min(vp.X / 900, vp.Y / 630), .62, 1)
    end
    fit()
    if workspace.CurrentCamera then
        on(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit))
    end

    -- Native header becomes only a host for its original close/minimize controls.
    if nativeHeader then
        nativeHeader.Position = UDim2.fromOffset(8,8)
        nativeHeader.Size = UDim2.new(1,-16,0,38)
        nativeHeader.BackgroundColor3 = Color3.fromRGB(5,13,21)
        for _, b in ipairs(nativeHeader:GetChildren()) do
            if b:IsA("TextButton") then
                b.Font = Enum.Font.GothamBold
                b.BackgroundTransparency = 1
                b.TextSize = 13
            end
        end
    end

    local header = mk("Frame", main, {
        Position = UDim2.fromOffset(8,8),
        Size = UDim2.new(1,-16,0,38),
        BackgroundColor3 = Color3.fromRGB(5,13,21),
        BorderSizePixel = 0,
        ZIndex = 20,
    })
    round(header,8); line(header,C.line,.08)

    mk("Frame", header, {
        Position = UDim2.fromOffset(0,0),
        Size = UDim2.fromOffset(3,38),
        BackgroundColor3 = C.red,
        BorderSizePixel = 0,
        ZIndex = 21,
    })

    local brand = mk("TextLabel", header, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(14,0),
        Size = UDim2.fromOffset(92,38),
        Text = "A7DEV",
        Font = Enum.Font.GothamBold,
        TextSize = 14,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 22,
    })
    local slash = mk("TextLabel", header, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(94,0),
        Size = UDim2.fromOffset(28,38),
        Text = "//",
        Font = Enum.Font.GothamBold,
        TextSize = 13,
        TextColor3 = C.red,
        ZIndex = 22,
    })
    mk("TextLabel", header, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(120,0),
        Size = UDim2.fromOffset(240,38),
        Text = "PROJECT SLAYER 2",
        Font = Enum.Font.GothamMedium,
        TextSize = 12,
        TextColor3 = C.muted,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 22,
    })

    local ready = mk("Frame", header, {
        Position = UDim2.new(1,-190,.5,-11),
        Size = UDim2.fromOffset(105,22),
        BackgroundColor3 = Color3.fromRGB(10,19,28),
        BorderSizePixel = 0,
        ZIndex = 22,
    })
    round(ready,12); line(ready,C.red2,.35)
    mk("Frame", ready, {
        Position = UDim2.fromOffset(9,8),
        Size = UDim2.fromOffset(6,6),
        BackgroundColor3 = C.red,
        BorderSizePixel = 0,
        ZIndex = 23,
    })
    mk("TextLabel", ready, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(22,0),
        Size = UDim2.new(1,-25,1,0),
        Text = "SCRIPT READY",
        Font = Enum.Font.GothamBold,
        TextSize = 8,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 23,
    })

    local sidebar = mk("Frame", main, {
        Position = UDim2.fromOffset(8,52),
        Size = UDim2.fromOffset(150,500),
        BackgroundColor3 = Color3.fromRGB(5,13,21),
        BorderSizePixel = 0,
        ZIndex = 12,
    })
    round(sidebar,8); line(sidebar,C.line,.08)

    local sideTitle = mk("TextLabel", sidebar, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(12,8),
        Size = UDim2.new(1,-24,0,18),
        Text = "NAVIGATION",
        Font = Enum.Font.GothamBold,
        TextSize = 8,
        TextColor3 = C.dim,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 14,
    })

    local banner = mk("Frame", main, {
        Position = UDim2.fromOffset(170,52),
        Size = UDim2.new(1,-178,0,58),
        BackgroundColor3 = Color3.fromRGB(8,18,29),
        BorderSizePixel = 0,
        ZIndex = 10,
    })
    round(banner,8); line(banner,C.line,.08)
    mk("UIGradient", banner, {
        Color = ColorSequence.new({
            ColorSequenceKeypoint.new(0, Color3.fromRGB(8,18,29)),
            ColorSequenceKeypoint.new(.68, Color3.fromRGB(14,18,29)),
            ColorSequenceKeypoint.new(1, Color3.fromRGB(15,22,31)),
        }),
        Rotation = 0,
    })
    mk("Frame", banner, {
        Position = UDim2.fromOffset(0,8),
        Size = UDim2.fromOffset(3,42),
        BackgroundColor3 = C.red,
        BorderSizePixel = 0,
        ZIndex = 11,
    })

    local bannerTitle = mk("TextLabel", banner, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(15,7),
        Size = UDim2.new(1,-30,0,22),
        Text = "Farm",
        Font = Enum.Font.GothamBold,
        TextSize = 17,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 12,
    })
    local bannerSub = mk("TextLabel", banner, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(15,29),
        Size = UDim2.new(1,-30,0,18),
        Text = "Quest-aware farming and movement controls.",
        Font = Enum.Font.Gotham,
        TextSize = 9,
        TextColor3 = C.muted,
        TextXAlignment = Enum.TextXAlignment.Left,
        ZIndex = 12,
    })

    pageHost.Position = UDim2.fromOffset(170,118)
    pageHost.Size = UDim2.new(1,-178,1,-160)
    pageHost.BackgroundTransparency = 1

    if nativeFooter then
        nativeFooter.Position = UDim2.fromOffset(170,518)
        nativeFooter.Size = UDim2.new(1,-178,0,34)
        nativeFooter.BackgroundColor3 = Color3.fromRGB(5,13,21)
        local fs = nativeFooter:FindFirstChildOfClass("UIStroke")
        if fs then fs.Color = C.line; fs.Transparency=.15 end
        for _, d in ipairs(nativeFooter:GetDescendants()) do
            if d:IsA("TextLabel") then
                d.Font = Enum.Font.GothamMedium
                d.TextSize = math.min(d.TextSize,9)
                d.TextColor3 = C.muted
            end
        end
    end

    local home = mk("Frame", main, {
        Position = pageHost.Position,
        Size = pageHost.Size,
        BackgroundTransparency = 1,
        Visible = false,
        ZIndex = 9,
    })

    local hero = mk("Frame", home, {
        Position = UDim2.fromOffset(0,0),
        Size = UDim2.new(1,0,0,102),
        BackgroundColor3 = Color3.fromRGB(7,17,28),
        BorderSizePixel = 0,
    })
    round(hero,9); line(hero,C.line,.08)
    mk("UIGradient", hero, {
        Color = ColorSequence.new({
            ColorSequenceKeypoint.new(0, Color3.fromRGB(8,19,31)),
            ColorSequenceKeypoint.new(1, Color3.fromRGB(13,21,31)),
        }),
        Rotation = 0,
    })
    mk("TextLabel", hero, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(18,14),
        Size = UDim2.new(1,-36,0,24),
        Text = "Welcome to A7DEV",
        Font = Enum.Font.GothamBold,
        TextSize = 19,
        TextColor3 = C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
    })
    mk("TextLabel", hero, {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(18,40),
        Size = UDim2.new(1,-36,0,20),
        Text = "Project Slayer 2 automation hub",
        Font = Enum.Font.Gotham,
        TextSize = 10,
        TextColor3 = C.muted,
        TextXAlignment = Enum.TextXAlignment.Left,
    })
    local statusCard = mk("Frame", hero, {
        Position = UDim2.new(1,-150,0,17),
        Size = UDim2.fromOffset(130,68),
        BackgroundColor3 = Color3.fromRGB(9,18,28),
        BorderSizePixel = 0,
    })
    round(statusCard,8); line(statusCard,C.red2,.30)
    mk("TextLabel",statusCard,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(12,8),Size=UDim2.new(1,-24,0,16),
        Text="SCRIPT READY",Font=Enum.Font.GothamBold,TextSize=9,TextColor3=C.red,TextXAlignment=Enum.TextXAlignment.Left
    })
    mk("TextLabel",statusCard,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(12,27),Size=UDim2.new(1,-24,0,28),
        Text="All native controls\nremain connected.",Font=Enum.Font.Gotham,TextSize=8,TextColor3=C.muted,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left
    })

    local navMeta = {
        HOME = {"Home","Overview and quick access.","rbxassetid://7733960981"},
        FARM = {"Farm","Quest-aware farming and movement controls.","rbxassetid://7733674079"},
        BOSS = {"Boss","Boss farming, Yeti and boss selection.","rbxassetid://7733765398"},
        QUEST = {"Quest","Quest automation, progression and Muzan.","rbxassetid://7733687281"},
        TELEPORT = {"Teleport","Regions, trainers, NPCs and locations.","rbxassetid://7733992789"},
        PLAYER = {"Player","Movement, race and equipment controls.","rbxassetid://7743875962"},
        MISC = {"Misc","Loot, fishing, dungeon and utilities.","rbxassetid://7734053495"},
    }

    local navButtons = {}
    local selected = "HOME"

    local function navButton(key, y)
        local meta = navMeta[key]
        local b = mk("TextButton", sidebar, {
            Position = UDim2.fromOffset(8,y),
            Size = UDim2.new(1,-16,0,39),
            BackgroundColor3 = Color3.fromRGB(7,16,25),
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = "",
            ZIndex = 14,
        })
        round(b,7)
        local activeLine = mk("Frame",b,{
            Position=UDim2.fromOffset(0,6),Size=UDim2.fromOffset(3,27),
            BackgroundColor3=C.red,BorderSizePixel=0,Visible=false,ZIndex=15
        })
        round(activeLine,2)
        local icon = mk("ImageLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(12,10),Size=UDim2.fromOffset(18,18),
            Image=meta[3],ImageColor3=C.muted,ScaleType=Enum.ScaleType.Fit,ZIndex=15
        })
        local tx = mk("TextLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(40,0),Size=UDim2.new(1,-48,1,0),
            Text=meta[1],Font=Enum.Font.GothamMedium,TextSize=10,TextColor3=C.muted,
            TextXAlignment=Enum.TextXAlignment.Left,ZIndex=15
        })
        navButtons[key]={button=b,line=activeLine,icon=icon,text=tx}
        return b
    end

    local order={"HOME","FARM","BOSS","QUEST","TELEPORT","PLAYER","MISC"}
    for i,key in ipairs(order) do navButton(key,31+(i-1)*45) end

    local community = mk("Frame",sidebar,{
        Position=UDim2.new(0,8,1,-106),Size=UDim2.new(1,-16,0,96),
        BackgroundColor3=Color3.fromRGB(8,17,27),BorderSizePixel=0,ZIndex=13
    })
    round(community,8); line(community,C.line,.12)
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(11,8),Size=UDim2.new(1,-22,0,17),
        Text="A7DEV",Font=Enum.Font.GothamBold,TextSize=11,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left
    })
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(11,27),Size=UDim2.new(1,-22,0,30),
        Text="Project Slayer 2\nPremium UI",Font=Enum.Font.Gotham,TextSize=8,TextColor3=C.muted,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left
    })
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(11,64),Size=UDim2.new(1,-22,0,18),
        Text="created by a7med_hub",Font=Enum.Font.GothamMedium,TextSize=7,TextColor3=C.dim,TextXAlignment=Enum.TextXAlignment.Left
    })

    local function styleToggleRow(row)
        if row:FindFirstChild("A7DEV_REF3_V7_SWITCH") then return end
        local labelObj = row:FindFirstChildWhichIsA("TextLabel")
        local oldBox
        for _,c in ipairs(row:GetChildren()) do
            if c:IsA("Frame") and c.AbsoluteSize.X <= 22 and c.AbsoluteSize.Y <= 22 then
                oldBox=c; break
            end
        end
        if not labelObj or not oldBox then return end
        local fill = oldBox:FindFirstChildWhichIsA("Frame")
        oldBox.Visible=false
        row.BackgroundColor3=Color3.fromRGB(10,22,34)
        row.BorderSizePixel=0
        local rs=row:FindFirstChildOfClass("UIStroke")
        if rs then rs.Color=C.line; rs.Transparency=.18 else line(row,C.line,.18) end
        if not row:FindFirstChildOfClass("UICorner") then round(row,6) end
        labelObj.Font=Enum.Font.GothamMedium; labelObj.TextSize=10; labelObj.TextColor3=C.text
        labelObj.Position=UDim2.fromOffset(11,0); labelObj.Size=UDim2.new(1,-60,1,0)

        local pill=mk("Frame",row,{
            Name="A7DEV_REF3_V7_SWITCH",Position=UDim2.new(1,-43,.5,-9),Size=UDim2.fromOffset(34,18),
            BackgroundColor3=Color3.fromRGB(27,45,61),BorderSizePixel=0
        })
        round(pill,10)
        local knob=mk("Frame",pill,{
            Position=UDim2.fromOffset(2,2),Size=UDim2.fromOffset(14,14),
            BackgroundColor3=C.text,BorderSizePixel=0
        })
        round(knob,8)
        local function sync()
            local on=fill and fill.Visible==true
            pill.BackgroundColor3=on and C.red or Color3.fromRGB(27,45,61)
            knob.Position=UDim2.fromOffset(on and 18 or 2,2)
        end
        sync()
        if fill then on(fill:GetPropertyChangedSignal("Visible"):Connect(sync)) end
    end

    local function stylePage(page)
        if not page then return end
        page.BackgroundTransparency=1
        for _,d in ipairs(page:GetDescendants()) do
            if own(d) then continue end
            if d:IsA("ScrollingFrame") then
                d.BackgroundTransparency=1; d.BorderSizePixel=0
                d.ScrollBarThickness=2; d.ScrollBarImageColor3=C.red
            elseif d:IsA("Frame") and string.sub(d.Name,1,8)=="Section_" then
                d.BackgroundColor3=Color3.fromRGB(7,17,27); d.BorderSizePixel=0
                local s=d:FindFirstChildOfClass("UIStroke")
                if s then s.Color=C.line; s.Transparency=.08 end
                if not d:FindFirstChildOfClass("UICorner") then round(d,8) end
                for _,ch in ipairs(d:GetChildren()) do
                    if ch:IsA("TextLabel") then
                        ch.Font=Enum.Font.GothamBold; ch.TextSize=10; ch.TextColor3=C.text
                    elseif ch:IsA("Frame") and ch.Size.Y.Offset<=2 then
                        ch.BackgroundColor3=C.red; ch.BackgroundTransparency=.22
                    end
                end
            elseif d:IsA("TextButton") then
                if d.Text=="" then
                    styleToggleRow(d)
                else
                    d.Font=Enum.Font.GothamMedium; d.TextSize=10; d.TextColor3=C.text
                    d.BackgroundColor3=Color3.fromRGB(11,24,37); d.BorderSizePixel=0
                    local s=d:FindFirstChildOfClass("UIStroke")
                    if s then s.Color=C.line; s.Transparency=.16 end
                    if not d:FindFirstChildOfClass("UICorner") then round(d,6) end
                end
            elseif d:IsA("TextBox") then
                d.Font=Enum.Font.GothamMedium; d.TextSize=10; d.TextColor3=C.text
                d.PlaceholderColor3=C.dim; d.BackgroundColor3=Color3.fromRGB(10,24,38)
                d.BorderSizePixel=0
                local s=d:FindFirstChildOfClass("UIStroke")
                if s then s.Color=C.line; s.Transparency=.14 end
                if not d:FindFirstChildOfClass("UICorner") then round(d,6) end
            elseif d:IsA("TextLabel") then
                if d.Text~="" then
                    d.Font=Enum.Font.Gotham
                    if d.TextSize>12 then d.TextSize=11 end
                    if d.TextColor3~=C.red then d.TextColor3=C.muted end
                end
            end
        end
    end

    for _,page in pairs(pages) do stylePage(page) end

    local function homeCard(key,title,sub,x,y,w)
        local meta=navMeta[key]
        local b=mk("TextButton",home,{
            Position=UDim2.new(x,0,0,y),Size=UDim2.new(w,-6,0,92),
            BackgroundColor3=Color3.fromRGB(7,17,27),BorderSizePixel=0,
            AutoButtonColor=false,Text=""
        })
        round(b,8); line(b,C.line,.08)
        local tile=mk("Frame",b,{
            Position=UDim2.fromOffset(12,12),Size=UDim2.fromOffset(32,32),
            BackgroundColor3=Color3.fromRGB(16,17,27),BorderSizePixel=0
        })
        round(tile,8); line(tile,C.red2,.32)
        mk("ImageLabel",tile,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(7,7),Size=UDim2.fromOffset(18,18),
            Image=meta[3],ImageColor3=C.red,ScaleType=Enum.ScaleType.Fit
        })
        mk("TextLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(54,10),Size=UDim2.new(1,-66,0,20),
            Text=title,Font=Enum.Font.GothamBold,TextSize=11,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left
        })
        mk("TextLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(54,31),Size=UDim2.new(1,-66,0,37),
            Text=sub,Font=Enum.Font.Gotham,TextSize=8,TextColor3=C.muted,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top
        })
        on(b.MouseEnter:Connect(function() b.BackgroundColor3=Color3.fromRGB(13,25,38) end))
        on(b.MouseLeave:Connect(function() b.BackgroundColor3=Color3.fromRGB(7,17,27) end))
        return b
    end

    local c1=homeCard("FARM","Farm","Quest-aware farming and movement.",0,112,.5)
    local c2=homeCard("BOSS","Boss","Boss farming and boss utilities.",.5,112,.5)
    local c3=homeCard("QUEST","Quest","Quest progression and Muzan.",0,212,.5)
    local c4=homeCard("TELEPORT","Teleport","Regions, NPCs and trainers.",.5,212,.5)

    local function selectView(key)
        selected=key
        home.Visible=key=="HOME"
        for pageKey,page in pairs(pages) do
            page.Visible=(key==pageKey)
        end
        local meta=navMeta[key] or navMeta.HOME
        bannerTitle.Text=meta[1]
        bannerSub.Text=meta[2]
        for k,v in pairs(navButtons) do
            local onState=k==key
            v.button.BackgroundTransparency=onState and 0 or 1
            v.button.BackgroundColor3=onState and Color3.fromRGB(15,24,34) or Color3.fromRGB(7,16,25)
            v.line.Visible=onState
            v.icon.ImageColor3=onState and C.red or C.muted
            v.text.TextColor3=onState and C.text or C.muted
        end
    end

    for key,v in pairs(navButtons) do
        on(v.button.Activated:Connect(function() selectView(key) end))
    end
    on(c1.Activated:Connect(function() selectView("FARM") end))
    on(c2.Activated:Connect(function() selectView("BOSS") end))
    on(c3.Activated:Connect(function() selectView("QUEST") end))
    on(c4.Activated:Connect(function() selectView("TELEPORT") end))

    selectView("HOME")

    on(gui.DescendantAdded:Connect(function(d)
        task.defer(function()
            if not P.alive or own(d) or not d.Parent then return end
            if d:IsA("TextButton") and d.Text=="" then styleToggleRow(d) end
            local sec=d:IsA("Frame") and string.sub(d.Name,1,8)=="Section_" and d or d:FindFirstAncestorWhichIsA("Frame")
            if sec and string.sub(sec.Name or "",1,8)=="Section_" then
                local page=sec:FindFirstAncestorWhichIsA("Frame")
                if page then stylePage(page) end
            end
        end)
    end))
end


-- A7DEV PS2 RESTORED FEATURES V8
local FXN = {}
local function fxReq(obj)
    if not obj then return nil end
    local ok,v=pcall(require,obj)
    return ok and v or nil
end

local function fxNative()
    if FXN.Ready then return end
    local CAM=ReplicatedStorage:FindFirstChild("CAM")
    local Global=CAM and CAM:FindFirstChild("Global")
    local subsets=Global and Global:FindFirstChild("Subsets")
    local gameplay=subsets and subsets:FindFirstChild("Gameplay")
    local collectibles=Global and Global:FindFirstChild("Collectibles")
    local comm=ReplicatedStorage:FindFirstChild("Communication")
    local sc=comm and comm:FindFirstChild("ServerAndClient")
    local sig=sc and sc:FindFirstChild("Signals")
    FXN.Utility=Global and fxReq(Global:FindFirstChild("Utility"))
    FXN.Quests=gameplay and fxReq(gameplay:FindFirstChild("Quests"))
    FXN.Items=collectibles and fxReq(collectibles:FindFirstChild("Items"))
    FXN.Shop=Global and fxReq(Global:FindFirstChild("Shop"))
    FXN.SignalEvent=sig and fxReq(sig:FindFirstChild("SignalEvent"))
    FXN.SignalFunction=sig and fxReq(sig:FindFirstChild("SignalFunction"))
    FXN.Ready=true
end

local function fxData()
    fxNative()
    if FXN.Utility and type(FXN.Utility.GetData)=="function" then
        local ok,v=pcall(FXN.Utility.GetData,LocalPlayer)
        if ok then return v end
    end
end

local function fxEvent(...)
    fxNative()
    if FXN.SignalEvent and type(FXN.SignalEvent.ToServer)=="function" then
        return pcall(FXN.SignalEvent.ToServer,...)
    end
    return false
end

local function fxCall(...)
    fxNative()
    if FXN.SignalFunction and type(FXN.SignalFunction.ToServer)=="function" then
        return pcall(FXN.SignalFunction.ToServer,...)
    end
    return false
end

local function fxInventory()
    local d=fxData()
    local inv=d and d:FindFirstChild("Inventory")
    return inv and inv:FindFirstChild("Inventory")
end

local function fxItemAmount(name)
    local inv=fxInventory()
    if not inv then return 0 end
    local total=0
    for _,item in ipairs(inv:GetChildren()) do
        if low(item.Name)==low(name) then
            local amount=item:FindFirstChild("Amount")
            total=total+math.max(1,tonumber(amount and amount.Value) or 1)
        end
    end
    return total
end

local function fxRoot()
    local ch=LocalPlayer.Character
    return ch and ch:FindFirstChild("HumanoidRootPart")
end

local function fxMove(p,offset)
    if typeof(p)=="CFrame" then p=p.Position end
    if typeof(p)~="Vector3" then return false end
    local r=fxRoot()
    if not r then return false end
    local goal=p+Vector3.new(0,tonumber(offset) or 3,0)
    local dist=(r.Position-goal).Magnitude
    if dist<=7 then return true end
    if P.tween then pcall(function() P.tween:Cancel() end) end
    P.tween=TweenService:Create(r,TweenInfo.new(math.clamp(dist/40,.08,6),Enum.EasingStyle.Linear),{CFrame=CFrame.new(goal)})
    P.tween:Play()
    return false
end

local function fxPromptPosition(prompt)
    if not prompt then return nil end
    local p=prompt.Parent
    if p and p:IsA("BasePart") then return p.Position end
    local part=p and p:FindFirstChildWhichIsA("BasePart",true)
    if not part and p then
        local model=p:FindFirstAncestorOfClass("Model")
        part=model and (model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart",true))
    end
    return part and part.Position or nil
end

local function fxFindPrompt(words,maxDistance)
    words=words or {}
    local root=fxRoot()
    local best,bd
    for _,obj in ipairs(workspace:GetDescendants()) do
        if obj:IsA("ProximityPrompt") and obj.Enabled then
            local text=low((obj.ObjectText or "").." "..(obj.ActionText or "").." "..tostring(obj.Parent and obj.Parent.Name or ""))
            local matched=#words==0
            for _,word in ipairs(words) do
                if string.find(text,low(word),1,true) then matched=true break end
            end
            if matched then
                local pp=fxPromptPosition(obj)
                if pp then
                    local d=root and (root.Position-pp).Magnitude or 0
                    if (not maxDistance or d<=maxDistance) and (not bd or d<bd) then
                        best,bd=obj,d
                    end
                end
            end
        end
    end
    return best,bd
end

local function fxColumns(gui,pageName)
    local page=gui:FindFirstChild("Page_"..pageName,true)
    if not page then return nil,nil end
    local cols={}
    for _,x in ipairs(page:GetChildren()) do
        if x:IsA("ScrollingFrame") then cols[#cols+1]=x end
    end
    table.sort(cols,function(a,b) return a.AbsolutePosition.X<b.AbsolutePosition.X end)
    return cols[1],cols[2] or cols[1]
end

local function fxAlive(model)
    local h=model and model:FindFirstChildOfClass("Humanoid")
    return model and model.Parent and h and h.Health>0
end

local function fxCombat(State,target,source)
    if not State or not State.Runtime or type(State.Runtime.farmCombatTick)~="function" or not fxAlive(target) then return false end
    local prevFarmable=State.Flags.FarmableOnly
    local prevQuest=State.Flags.AutoFarmQuest
    State.Flags.FarmableOnly=false
    State.Flags.AutoFarmQuest=false
    State.FarmPlanTarget=target
    State.FarmPlanSource=source or "Boss"
    local ok,res=pcall(State.Runtime.farmCombatTick,os.clock())
    State.Flags.FarmableOnly=prevFarmable
    State.Flags.AutoFarmQuest=prevQuest
    return ok and res==true
end

local function fxRouteBusy(State,allowPlayer)
    local f=State.Flags or {}
    if f.AutoFarm then return true,"Auto Farm" end
    if f.AutoBoss then return true,"Auto Boss" end
    if f.AutoDungeon then return true,"Auto Dungeon" end
    if f.AutoQuest then return true,"Auto Quest" end
    if f.AutoFishingReel then return true,"Auto Fish" end
    if not allowPlayer and f.AutoFarmPlayers then return true,"Player Farm" end
    return false
end

local function installAutoSell(State,gui)
    if State.SellOps and State.SellOps.A7DEV_V8 then return end
    fxNative()
    State.Flags.AutoSell=State.Flags.AutoSell==true
    State.Flags.AutoSellUnlock=State.Flags.AutoSellUnlock~=false
    State.SellSelected=State.SellSelected or {}
    State.SellKeepAmount=math.max(0,math.floor(tonumber(State.SellKeepAmount) or 0))
    State.SellStatus=State.SellStatus or "Idle"

    local Ops={A7DEV_V8=true,Busy=false,Last=0}
    State.SellOps=Ops
    local SELLER_QUEST="Ill find the jewelry box(Lv 45)"
    local SELLER_ITEM="Jewelry Box"
    local PICKUP=Vector3.new(1869.092,687.835,-734.628)

    function Ops.sellerState()
        fxNative()
        if FXN.Quests and type(FXN.Quests.GetPlayerQuestState)=="function" then
            local ok,v=pcall(FXN.Quests.GetPlayerQuestState,LocalPlayer,SELLER_QUEST)
            if ok and v~=nil then return tostring(v) end
        end
        return "None"
    end

    function Ops.isSellable(name)
        fxNative()
        local cfg=FXN.Items and FXN.Items[name]
        if type(cfg)~="table" then return false end
        if cfg.NoDelete==true or cfg.NoSell==true then return false end
        if cfg.Requirements~=nil or cfg.NoSaveRequirements~=nil then return false end
        local shopListed=FXN.Shop and type(FXN.Shop.itemsforsale)=="table" and FXN.Shop.itemsforsale[name]~=nil
        return cfg.Price~=nil or shopListed==true
    end

    function Ops.gather()
        local inv=fxInventory()
        local counts,blocked,out={},{},{}
        if not inv then return out end
        for _,item in ipairs(inv:GetChildren()) do
            local name=tostring(item.Name or "")
            if name~="" then
                if item:FindFirstChild("NoSave") or item:FindFirstChild("QuestGrant") then blocked[name]=true end
                if Ops.isSellable(name) then
                    local amount=item:FindFirstChild("Amount")
                    counts[name]=(counts[name] or 0)+math.max(1,math.floor(tonumber(amount and amount.Value) or 1))
                end
            end
        end
        for name,n in pairs(counts) do
            if not blocked[name] and n>0 then out[#out+1]={Name=name,Owned=n} end
        end
        table.sort(out,function(a,b) return low(a.Name)<low(b.Name) end)
        return out
    end

    function Ops.selection()
        local keep=math.max(0,math.floor(tonumber(State.SellKeepAmount) or 0))
        local sel,count,units={},0,0
        for _,e in ipairs(Ops.gather()) do
            if State.SellSelected[e.Name]==true then
                local n=math.max(0,e.Owned-keep)
                if n>0 then sel[e.Name]=n; count=count+1; units=units+n end
            end
        end
        return sel,count,units
    end

    function Ops.unlockTick()
        if Ops.sellerState()=="Done" then return true end
        local inv=fxInventory()
        if inv and inv:FindFirstChild(SELLER_ITEM) then
            if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then pcall(State.GameOps.verifiedNpcAction,"Ginzo") end
            fxEvent("QuestProgress",SELLER_QUEST,"Return to Ginzo")
            State.SellStatus="Returning Jewelry Box to Ginzo"
            return false
        end
        local prompt=fxFindPrompt({"jewelry box"},nil)
        if prompt then
            local p=fxPromptPosition(prompt)
            if p and fxMove(p,2) then fire(prompt) end
            State.SellStatus="Getting Jewelry Box"
            return false
        end
        local root=fxRoot()
        if root and (root.Position-PICKUP).Magnitude>9 then
            fxMove(PICKUP,2)
            State.SellStatus="Moving to Jewelry Box"
            return false
        end
        if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then pcall(State.GameOps.verifiedNpcAction,"Ginzo") end
        fxEvent("AddQuest",SELLER_QUEST)
        State.SellStatus="Unlocking Ginzo seller"
        return false
    end

    function Ops.sell()
        if Ops.Busy then return false end
        if Ops.sellerState()~="Done" then
            if State.Flags.AutoSellUnlock then Ops.unlockTick() end
            return false
        end
        local sel,count,units=Ops.selection()
        if count<1 then State.SellStatus="No selected sellable items"; return false end
        Ops.Busy=true
        local ok,res=fxCall("SellItems",sel)
        Ops.Busy=false
        Ops.Last=os.clock()
        if ok and res~=false then
            State.SellStatus=string.format("Sold %d item(s)",units)
            return true
        end
        State.SellStatus="SellItems refused | retrying at Ginzo"
        if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then
            pcall(State.GameOps.verifiedNpcAction,"Ginzo")
        end
        return false
    end

    local left,right=fxColumns(gui,"MISC")
    local col=right or left
    if col and State.Runtime and type(State.Runtime.createSection)=="function" then
        local sec=State.Runtime.createSection(col,"Auto Sell")
        local info=State.Runtime.addInfo(sec,"Auto Sell | "..State.SellStatus)
        State.Runtime.addToggle(sec,"Auto Sell",State.Flags.AutoSell,function(v) State.Flags.AutoSell=v end)
        State.Runtime.addToggle(sec,"Auto Unlock Ginzo",State.Flags.AutoSellUnlock,function(v) State.Flags.AutoSellUnlock=v end)
        State.Runtime.addInput(sec,"Keep each item",State.SellKeepAmount,function(t) State.SellKeepAmount=math.max(0,math.floor(tonumber(t) or 0)) end,"0")
        local search=""
        State.Runtime.addInput(sec,"Search","",function(t) search=low(t) end,"item name")
        local holder=Instance.new("Frame")
        holder.Name="SellItemList"; holder.BackgroundTransparency=1
        holder.Size=UDim2.new(1,0,0,0); holder.AutomaticSize=Enum.AutomaticSize.Y; holder.Parent=sec
        local layout=Instance.new("UIListLayout"); layout.Padding=UDim.new(0,4); layout.Parent=holder

        local function refresh()
            for _,x in ipairs(holder:GetChildren()) do if x:IsA("TextButton") then x:Destroy() end end
            for _,e in ipairs(Ops.gather()) do
                if search=="" or string.find(low(e.Name),search,1,true) then
                    local row=Instance.new("TextButton")
                    row.Name="SellItemRow"; row.AutoButtonColor=false; row.Size=UDim2.new(1,0,0,38)
                    row.BackgroundColor3=Color3.fromRGB(12,23,35); row.BorderSizePixel=0
                    local function sync() row.Text=(State.SellSelected[e.Name] and "[x] " or "[ ] ")..e.Name.." x"..tostring(e.Owned) end
                    sync(); row.Parent=holder
                    row.MouseButton1Click:Connect(function() State.SellSelected[e.Name]=not State.SellSelected[e.Name]; sync() end)
                end
            end
        end
        State.Runtime.addButton(sec,"Refresh Items",refresh)
        State.Runtime.addButton(sec,"Select All",function() for _,e in ipairs(Ops.gather()) do State.SellSelected[e.Name]=true end refresh() end)
        State.Runtime.addButton(sec,"Clear Selection",function() State.SellSelected={} refresh() end)
        State.Runtime.addButton(sec,"Sell Selected",function() Ops.sell(); refresh() end)
        refresh()
        task.spawn(function()
            while P.alive and gui.Parent do
                info.Text="Auto Sell | "..tostring(State.SellStatus)
                task.wait(.5)
            end
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent do
            task.wait(.45)
            if State.Flags.AutoSell and not Ops.Busy then
                if Ops.sellerState()~="Done" then
                    if State.Flags.AutoSellUnlock then Ops.unlockTick() end
                elseif os.clock()-(Ops.Last or 0)>=2.5 then
                    Ops.sell()
                end
            end
        end
    end)
end

local function installYeti(State,gui)
    if State.YetiOps and State.YetiOps.A7DEV_V8 then return end
    State.Flags.AutoYeti=State.Flags.AutoYeti==true
    State.Flags.AutoHeartYeti=State.Flags.AutoHeartYeti==true
    State.YetiHeartTarget=math.max(1,math.floor(tonumber(State.YetiHeartTarget) or 1))
    State.YetiStatus=State.YetiStatus or "Ready"
    local Ops={A7DEV_V8=true,lastTarget=nil,lastDeath=0}
    State.YetiOps=Ops

    local function findTarget()
        local root=fxRoot()
        local candidates={}
        for _,m in ipairs(workspace:GetDescendants()) do
            if m:IsA("Model") and fxAlive(m) and string.find(low(m.Name),"yeti",1,true) then
                local mr=m:FindFirstChild("HumanoidRootPart") or m.PrimaryPart
                local d=(root and mr) and (root.Position-mr.Position).Magnitude or 999999
                local small=(string.find(low(m.Name),"small",1,true) or string.find(low(m.Name),"mini",1,true) or string.find(low(m.Name),"summon",1,true)) and 0 or 1
                candidates[#candidates+1]={m=m,small=small,d=d}
            end
        end
        table.sort(candidates,function(a,b) if a.small~=b.small then return a.small<b.small end return a.d<b.d end)
        return candidates[1] and candidates[1].m
    end

    local function loot()
        local prompt=fxFindPrompt({"chest","loot","heart","drop"},160)
        if prompt then
            local p=fxPromptPosition(prompt)
            if p and fxMove(p,2) then fire(prompt) end
            return true
        end
        return false
    end

    local left,right=fxColumns(gui,"BOSS")
    local col=right or left
    if col and State.Runtime then
        local sec=State.Runtime.createSection(col,"Yeti")
        local info=State.Runtime.addInfo(sec,"Yeti | "..State.YetiStatus)
        State.Runtime.addToggle(sec,"Auto Yeti",State.Flags.AutoYeti,function(v) State.Flags.AutoYeti=v end)
        State.Runtime.addToggle(sec,"Auto Heart Yeti",State.Flags.AutoHeartYeti,function(v) State.Flags.AutoHeartYeti=v end)
        State.Runtime.addInput(sec,"Frozen Heart target",State.YetiHeartTarget,function(t) State.YetiHeartTarget=math.max(1,math.floor(tonumber(t) or 1)) end,"1")
        task.spawn(function()
            while P.alive and gui.Parent do info.Text="Yeti | "..tostring(State.YetiStatus); task.wait(.45) end
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent do
            task.wait(.22)
            if State.Flags.AutoYeti or State.Flags.AutoHeartYeti then
                local busy,why=fxRouteBusy(State,true)
                if busy then State.YetiStatus="Waiting for "..why
                elseif State.Flags.AutoHeartYeti and fxItemAmount("Frozen Heart")>=State.YetiHeartTarget then
                    State.YetiStatus="Frozen Heart target reached"
                else
                    local target=findTarget()
                    if target then
                        Ops.lastTarget=target
                        Ops.lastDeath=0
                        State.YetiStatus="Fighting "..target.Name
                        fxCombat(State,target,"Boss")
                    else
                        if Ops.lastTarget and not fxAlive(Ops.lastTarget) and Ops.lastDeath==0 then Ops.lastDeath=os.clock() end
                        if Ops.lastDeath>0 and os.clock()-Ops.lastDeath>=2.4 then
                            if loot() then State.YetiStatus="Collecting Yeti loot"; task.wait(.3)
                            else Ops.lastTarget=nil; Ops.lastDeath=0 end
                        else
                            local prompt=fxFindPrompt({"yeti","heart"},nil)
                            if prompt then
                                local p=fxPromptPosition(prompt)
                                if p and fxMove(p,3) then fire(prompt) end
                                State.YetiStatus="Summoning / interacting with Yeti"
                            else
                                State.YetiStatus="Waiting for Yeti"
                            end
                        end
                    end
                end
            end
        end
    end)
end

local function installLantern(State,gui)
    if State.LanternOps and State.LanternOps.A7DEV_V8 then return end
    State.Flags.AutoLantern=State.Flags.AutoLantern==true
    State.LanternStatus=State.LanternStatus or "Ready"
    State.LanternOps={A7DEV_V8=true}

    local left,right=fxColumns(gui,"QUEST")
    local col=right or left
    if col and State.Runtime then
        local sec=State.Runtime.createSection(col,"Winter Lantern")
        local info=State.Runtime.addInfo(sec,"Lantern | "..State.LanternStatus)
        State.Runtime.addToggle(sec,"Auto Lantern",State.Flags.AutoLantern,function(v) State.Flags.AutoLantern=v end)
        task.spawn(function()
            while P.alive and gui.Parent do info.Text="Lantern | "..tostring(State.LanternStatus); task.wait(.5) end
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent do
            task.wait(.55)
            if State.Flags.AutoLantern then
                local ch=LocalPlayer.Character
                local bag=LocalPlayer:FindFirstChildOfClass("Backpack")
                local tool=(ch and ch:FindFirstChild("Lantern")) or (bag and bag:FindFirstChild("Lantern"))
                if tool and tool:IsA("Tool") then
                    local hum=ch and ch:FindFirstChildOfClass("Humanoid")
                    if hum and tool.Parent~=ch then pcall(function() hum:EquipTool(tool) end) end
                    State.LanternStatus="Lantern equipped"
                elseif fxItemAmount("Lantern")>0 then
                    State.LanternStatus="Lantern ready"
                else
                    local prompt=fxFindPrompt({"lantern","lamplighter"},nil)
                    if prompt then
                        local p=fxPromptPosition(prompt)
                        if p and fxMove(p,2) then fire(prompt) end
                        State.LanternStatus="Getting winter lantern"
                    else
                        State.LanternStatus="Waiting for lantern objective"
                    end
                end
            end
        end
    end)
end

local function installPlayerFarm(State,gui)
    if State.PlayerOps and State.PlayerOps.A7DEV_V8 then return end
    State.Flags.AutoFarmPlayers=State.Flags.AutoFarmPlayers==true
    State.PlayerTargetName=State.PlayerTargetName or ""
    State.PlayerStatus=State.PlayerStatus or "Ready"
    local Ops={A7DEV_V8=true}
    State.PlayerOps=Ops

    function Ops.wantsRoute() return State.Flags.AutoFarmPlayers==true end
    local function resolve()
        local q=low(State.PlayerTargetName)
        if q=="" then return nil end
        local partial
        for _,p in ipairs(Players:GetPlayers()) do
            if p~=LocalPlayer then
                if low(p.Name)==q or low(p.DisplayName)==q then return p end
                if not partial and (string.find(low(p.Name),q,1,true) or string.find(low(p.DisplayName),q,1,true)) then partial=p end
            end
        end
        return partial
    end

    local left,right=fxColumns(gui,"PLAYER")
    local col=right or left
    if col and State.Runtime then
        local sec=State.Runtime.createSection(col,"Player Farm")
        local info=State.Runtime.addInfo(sec,"Player | "..State.PlayerStatus)
        State.Runtime.addInput(sec,"Target player",State.PlayerTargetName,function(t) State.PlayerTargetName=t end,"username")
        State.Runtime.addToggle(sec,"Auto Farm Player",State.Flags.AutoFarmPlayers,function(v) State.Flags.AutoFarmPlayers=v end)
        task.spawn(function()
            while P.alive and gui.Parent do info.Text="Player | "..tostring(State.PlayerStatus); task.wait(.4) end
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent do
            task.wait(.20)
            if State.Flags.AutoFarmPlayers then
                local f=State.Flags
                if f.AutoFarm or f.AutoBoss or f.AutoDungeon or f.AutoQuest or f.AutoYeti or f.AutoHeartYeti then
                    State.PlayerStatus="Waiting for current automation"
                else
                    local p=resolve()
                    local ch=p and p.Character
                    if ch and fxAlive(ch) then
                        State.PlayerStatus="Target: "..p.Name
                        fxCombat(State,ch,"Player")
                    else
                        State.PlayerStatus=p and ("Waiting for "..p.Name.." respawn") or "Player not found"
                    end
                end
            end
        end
    end)
end

local TRAINING_HINTS={
    "meditate","boulder split","underwater rock","sea crystal","mizunoto",
    "push up","push-up","squat","target shooting","cup game","break rock",
    "pushing rock","training course","underwater crystal","final combat"
}

local function installTraining(State,gui)
    if State.TrainingOps and State.TrainingOps.A7DEV_V8 then return end
    State.Flags.AutoTrainingQuests=State.Flags.AutoTrainingQuests==true
    State.TrainingStatus=State.TrainingStatus or "Quest: All Active"
    local Ops={A7DEV_V8=true}
    State.TrainingOps=Ops

    local function isTraining(name)
        name=low(name)
        for _,h in ipairs(TRAINING_HINTS) do if string.find(name,h,1,true) then return true end end
        return false
    end

    local function active()
        fxNative()
        local d=fxData()
        local qs=d and d:FindFirstChild("Quests")
        local holder=qs and qs:FindFirstChild("Holder")
        if not holder then return nil end
        for _,q in ipairs(holder:GetChildren()) do
            local qstr=q:FindFirstChild("QuestString")
            local qn=qstr and tostring(qstr.Value)~="" and tostring(qstr.Value) or q.Name
            local info
            if FXN.Quests and type(FXN.Quests.GetQuestInfo)=="function" then pcall(function() info=FXN.Quests.GetQuestInfo(qn) end) end
            local tasks=q:FindFirstChild("Tasks")
            if tasks then
                for _,t in ipairs(tasks:GetChildren()) do
                    local v=t:FindFirstChild("Value"); local m=t:FindFirstChild("Max")
                    if v and m and tonumber(v.Value) and tonumber(m.Value) and v.Value<m.Value and isTraining(t.Name) then
                        local marker
                        if info and FXN.Quests and type(FXN.Quests.GetTaskMarker)=="function" then pcall(function() marker=FXN.Quests.GetTaskMarker(info,t) end) end
                        return {Quest=qn,Task=t.Name,Value=v.Value,Max=m.Value,Marker=marker}
                    end
                end
            end
        end
    end

    local left,right=fxColumns(gui,"QUEST")
    local col=left or right
    if col and State.Runtime then
        local sec=State.Runtime.createSection(col,"Training Quests")
        local info=State.Runtime.addInfo(sec,"Training | "..State.TrainingStatus)
        State.Runtime.addToggle(sec,"Auto Training Quests",State.Flags.AutoTrainingQuests,function(v) State.Flags.AutoTrainingQuests=v end)
        State.Runtime.addButton(sec,"Quest: All Active",function() State.TrainingStatus="Quest: All Active" end)
        task.spawn(function()
            while P.alive and gui.Parent do info.Text="Training | "..tostring(State.TrainingStatus); task.wait(.45) end
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent do
            task.wait(.30)
            if State.Flags.AutoTrainingQuests then
                local o=active()
                if not o then
                    State.TrainingStatus="No active training objective"
                else
                    State.TrainingStatus=string.format("%s | %s/%s",o.Task,tostring(o.Value),tostring(o.Max))
                    local n=low(o.Task)
                    if string.find(n,"underwater",1,true) or string.find(n,"sea crystal",1,true) then
                        local best
                        for i=1,5 do
                            local obj=workspace:FindFirstChild("Sea Crystal"..tostring(i),true)
                            if obj then best=obj break end
                        end
                        local pp=best and best:FindFirstChildWhichIsA("ProximityPrompt",true)
                        local bp=best and (best:IsA("BasePart") and best.Position or (best:FindFirstChildWhichIsA("BasePart",true) and best:FindFirstChildWhichIsA("BasePart",true).Position))
                        if bp and fxMove(bp,2) and pp then fire(pp) end
                    elseif string.find(n,"mizunoto",1,true) or string.find(n,"final combat",1,true) then
                        local target
                        for _,m in ipairs(workspace:GetDescendants()) do
                            if m:IsA("Model") and fxAlive(m) and string.find(low(m.Name),"mizunoto",1,true) then target=m break end
                        end
                        if target then fxCombat(State,target,"Training") end
                    else
                        local mp=markerPos(o.Marker)
                        if mp then
                            if fxMove(mp,2) then
                                local pp=fxFindPrompt({},16)
                                if pp then fire(pp) end
                            end
                        else
                            local pp=fxFindPrompt({o.Task},nil)
                            if pp then local p=fxPromptPosition(pp); if p and fxMove(p,2) then fire(pp) end end
                        end
                    end
                end
            end
        end
    end)
end

local function installRestoredFeatures(State,gui)
    if not State or not gui then return end
    State.Flags=State.Flags or {}
    State.Flags.AutoSkills=true
    if State.FarmStyle=="Under" or not State.FarmStyle then State.FarmStyle="Behind" end
    pcall(installAutoSell,State,gui)
    pcall(installYeti,State,gui)
    pcall(installLantern,State,gui)
    pcall(installPlayerFarm,State,gui)
    pcall(installTraining,State,gui)
end

local State
for _=1,1200 do
    if not P.alive then return end
    State=ENV.A7DEV_PROJECT_SLAYER_2
    if State then break end
    task.wait(.25)
end
if not State then return end

local gui
local pg=LocalPlayer:WaitForChild("PlayerGui")
for _=1,1200 do
    if not P.alive then return end
    gui=pg:FindFirstChild("A7DEV_ProjectSlayer2")
    if gui then break end
    task.wait(.25)
end
if not gui then return end

task.wait(.35)
pcall(installPremiumLayout, gui)
pcall(installRestoredFeatures, State, gui)
native()
for _,x in ipairs(gui:GetDescendants()) do
    renameBoss(x)
    if x:IsA("Frame") then replaceSymbol(x) end
    if x:IsA("TextButton") then sellRow(x) end
end
sellActions(gui)
installMuzan(State,gui)

on(gui.DescendantAdded:Connect(function(x)
    task.defer(function()
        if not P.alive or not x.Parent then return end
        renameBoss(x)
        if x:IsA("Frame") then replaceSymbol(x) end
        if x:IsA("TextButton") then sellRow(x) end
        if x.Name=="Section_Auto Sell" or (x.Parent and x.Parent.Name=="Section_Auto Sell") then sellActions(gui) end
    end)
end))

task.delay(1.5,function()
    if P.alive and gui.Parent then
        for _,x in ipairs(gui:GetDescendants()) do
            renameBoss(x)
            if x:IsA("Frame") then replaceSymbol(x) end
            if x:IsA("TextButton") then sellRow(x) end
        end
        sellActions(gui); installMuzan(State,gui)
    end
end)
