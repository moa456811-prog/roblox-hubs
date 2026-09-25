-- A7DEV Project Slayer 2 | Runtime V14

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
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
    red=Color3.fromRGB(188,63,78), red2=Color3.fromRGB(83,52,61),
    dark=Color3.fromRGB(20,23,29), card=Color3.fromRGB(13,27,41),
    line=Color3.fromRGB(27,48,65), text=Color3.fromRGB(235,242,249),
    muted=Color3.fromRGB(126,150,171), dim=Color3.fromRGB(72,95,116)
}

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
    local rawText=tostring(row.Text or "")
    local prefixed=rawText:match("^%[[xX ]%]%s*")~=nil
    if row.Name~="SellItemRow"
        and row.Name~="BossSelectRow"
        and not (row.Parent and row.Parent.Name=="SellItemList")
        and not prefixed then return end
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
    mk("ImageLabel",tile,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(5,5),Size=UDim2.fromOffset(18,18),
        Image=row.Name=="BossSelectRow" and "rbxassetid://7733765398" or "rbxassetid://7734021469",
        ImageColor3=C.muted,ScaleType=Enum.ScaleType.Fit
    })

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
        local s,n,a=parseRow(row.Text)
        selected=s
        name.Text=n~="" and n or "Unknown item"
        qtxt.Text=a and ("x"..a) or ""
        qty.Visible=a~=nil
        name.Size=a and UDim2.new(1,-133,1,0) or UDim2.new(1,-91,1,0)
        paint()
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
            if x.Text=="Select All" then x.LayoutOrder=-300 end
            if x.Text=="Clear Selection" then x.LayoutOrder=-299 end
            if x.Text=="Refresh Items" then x.LayoutOrder=-298 end
            if x.Text=="Sell Selected" then x.LayoutOrder=900 end
            if x.Text=="Sell Selected" or x.Text=="Unlock Seller" then
                x.BackgroundColor3=C.red2; x.Font=Enum.Font.GothamBold; x.TextSize=10
            end
        end
    end
end


local cleanedText=setmetatable({}, {__mode="k"})

local function cleanVisibleObject(o)
    if not o or not o.Parent then return end

    if o:IsA("Frame") then
        if o.Name=="Section_Live Boss Scanner" or o.Name=="Section_Diagnostics" then
            o.Visible=false
            return
        end
    end

    if o:IsA("TextButton") then
        local t=tostring(o.Text or "")
        if t=="Refresh boss choices"
            or t=="Full map boss scan"
            or t=="Previous detected boss"
            or t=="Next detected boss"
            or t=="Refresh boss list" then
            o.Visible=false
            return
        end
        if t=="Select All" then o.LayoutOrder=-300 end
        if t=="Clear Selection" then o.LayoutOrder=-299 end
        if t=="Refresh Items" then o.LayoutOrder=-298 end
    end

    if not (o:IsA("TextLabel") or o:IsA("TextButton")) then return end
    if cleanedText[o] then return end
    cleanedText[o]=true

    local changing=false
    local function apply()
        if changing or not o.Parent then return end
        changing=true
        local t=tostring(o.Text or "")
        local new=t
        new=new:gsub(" • ","")
        new=new:gsub(" UI","")
        new=new:gsub("premium UI","")

        local scanPos=string.find(new,"\nScan:",1,true)
        if scanPos then new=string.sub(new,1,scanPos-1) end

        if new~=t then o.Text=new end

        if o:IsA("TextLabel") then
            local l=low(new)
            if l=="scanning..."
                or string.find(l,"boss page ",1,true)==1
                or string.find(l,"selected bosses:",1,true)==1
                or string.find(l,"catalog:",1,true)
                or string.find(l,"full map scan",1,true)
                or string.find(l,"streaming ",1,true) then
                o.Visible=false
            end
        end
        changing=false
    end

    apply()
    on(o:GetPropertyChangedSignal("Text"):Connect(apply))
end

local function cleanUi(root)
    if not root then return end
    cleanVisibleObject(root)
    for _,o in ipairs(root:GetDescendants()) do
        cleanVisibleObject(o)
        if o:IsA("TextButton") then sellRow(o) end
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
    local Client=CAM and CAM:FindFirstChild("Client")
    local sub=G and G:FindFirstChild("Subsets")
    local gp=sub and sub:FindFirstChild("Gameplay")
    local modules=Client and Client:FindFirstChild("Modules")
    local gameplayModules=modules and modules:FindFirstChild("GamePlay")
    local comm=ReplicatedStorage:FindFirstChild("Communication")
    local sc=comm and comm:FindFirstChild("ServerAndClient")
    local sig=sc and sc:FindFirstChild("Signals")
    N.Utility=G and req(G:FindFirstChild("Utility"))
    N.Quests=gp and req(gp:FindFirstChild("Quests"))
    N.Dialogue=gameplayModules and req(gameplayModules:FindFirstChild("Dialogue"))
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

local function questHolder()
    local d=data()
    local qs=d and d:FindFirstChild("Quests")
    return qs and qs:FindFirstChild("Holder")
end

local function questObjectName(q)
    if not q then return "" end
    local s=q:FindFirstChild("QuestString")
    return (s and tostring(s.Value)~="" and tostring(s.Value)) or tostring(q.Name or "")
end

local function valueMentionsMuzan(value,depth,seen)
    depth=depth or 0
    if depth>2 then return false end
    local kind=typeof(value)

    if kind=="string" then
        return string.find(low(value),"muzan",1,true)~=nil
    end

    if type(value)=="table" then
        seen=seen or {}
        if seen[value] then return false end
        seen[value]=true
        local count=0
        for k,v in pairs(value) do
            count=count+1
            if count>80 then break end
            if valueMentionsMuzan(k,depth+1,seen) or valueMentionsMuzan(v,depth+1,seen) then
                return true
            end
        end
    end

    return false
end

local function questMentionsMuzan(q)
    if not q then return false end
    local qn=questObjectName(q)
    if string.find(low(qn),"muzan",1,true) then return true end

    local okAttrs,attrs=pcall(q.GetAttributes,q)
    if okAttrs and type(attrs)=="table" then
        for k,v in pairs(attrs) do
            if string.find(low(k),"muzan",1,true) or string.find(low(v),"muzan",1,true) then
                return true
            end
        end
    end

    local scanned=0
    for _,child in ipairs(q:GetDescendants()) do
        scanned=scanned+1
        if scanned>100 then break end
        if child:IsA("StringValue") then
            if string.find(low(child.Name.." "..tostring(child.Value)),"muzan",1,true) then return true end
        end
    end

    native()
    if N.Quests and type(N.Quests.GetQuestInfo)=="function" then
        local ok,info=pcall(N.Quests.GetQuestInfo,qn)
        if ok and valueMentionsMuzan(info,0,{}) then return true end
    end

    return false
end

local function findMuzanQuest()
    local h=questHolder()
    if not h then return nil end

    local tracked=State.MuzanAcceptedQuestName
    if tracked and tracked~="" then
        for _,q in ipairs(h:GetChildren()) do
            if low(questObjectName(q))==low(tracked) then return q end
        end
        State.MuzanAcceptedQuestName=""
    end

    local baseline=State.MuzanQuestBaseline
    if type(baseline)=="table" then
        for _,q in ipairs(h:GetChildren()) do
            local qn=questObjectName(q)
            if qn~="" and baseline[qn]~=true then
                State.MuzanAcceptedQuestName=qn
                return q
            end
        end
    end

    local genericCandidates={}
    for _,q in ipairs(h:GetChildren()) do
        if questMentionsMuzan(q) then
            State.MuzanAcceptedQuestName=questObjectName(q)
            return q
        end

        local tasks=q:FindFirstChild("Tasks")
        if tasks then
            for _,taskObj in ipairs(tasks:GetChildren()) do
                local v=taskObj:FindFirstChild("Value")
                local m=taskObj:FindFirstChild("Max")
                if v and m and tonumber(v.Value) and tonumber(m.Value) and v.Value<m.Value then
                    local n=low(taskObj.Name)
                    if string.find(n,"kill",1,true)
                        or string.find(n,"defeat",1,true)
                        or string.find(n,"eliminate",1,true)
                        or string.find(n,"slay",1,true)
                        or string.find(n,"hunt",1,true) then
                        genericCandidates[#genericCandidates+1]=q
                        break
                    end
                end
            end
        end
    end

    if #genericCandidates==1 then
        local q=genericCandidates[1]
        State.MuzanAcceptedQuestName=questObjectName(q)
        return q
    end
end

local function questState()
    local q=findMuzanQuest()
    if q then return "Doing" end

    native()
    if N.Quests and type(N.Quests.GetPlayerQuestState)=="function" then
        local ok,v=pcall(N.Quests.GetPlayerQuestState,LocalPlayer,"Muzan Quest")
        if ok and v~=nil then return tostring(v) end
    end
    return "None"
end

local function objective()
    local q=findMuzanQuest()
    if not q then return nil end

    local qn=questObjectName(q)
    native()

    local info
    if N.Quests and type(N.Quests.GetQuestInfo)=="function" then
        pcall(function() info=N.Quests.GetQuestInfo(qn) end)
    end

    local tasks=q:FindFirstChild("Tasks")
    if not tasks then return nil end

    local doctor,lilies,kill,fallback
    for _,t in ipairs(tasks:GetChildren()) do
        local v=t:FindFirstChild("Value")
        local m=t:FindFirstChild("Max")
        if v and m and tonumber(v.Value) and tonumber(m.Value) and v.Value<m.Value then
            local marker
            if info and N.Quests and type(N.Quests.GetTaskMarker)=="function" then
                pcall(function() marker=N.Quests.GetTaskMarker(info,t) end)
            end

            local candidate
            if type(info)=="table" then
                local spec
                for _,holder in ipairs({info.TaskSpec,info.TaskSpecs,info.Tasks}) do
                    if type(holder)=="table" then
                        local byName=holder[t.Name]
                        if type(byName)=="table" then
                            spec=byName
                            break
                        end
                        if holder.Target~=nil or holder.TargetNpc~=nil or holder.Npc~=nil
                            or holder.Enemy~=nil or holder.Mob~=nil then
                            spec=holder
                            break
                        end
                    end
                end
                if type(spec)=="table" then
                    for _,key in ipairs({
                        "TargetNpc","TargetNPC","EnemyNpc","EnemyNPC","Enemy",
                        "Mob","TargetMob","Npc","NPC","Target"
                    }) do
                        local value=spec[key]
                        if typeof(value)=="Instance" then
                            candidate=value:IsA("ValueBase") and tostring(value.Value) or value.Name
                        elseif value~=nil then
                            local text=tostring(value)
                            if text~="" then candidate=text end
                        end
                        if candidate and candidate~="" then break end
                    end
                end
            end

            if not candidate and type(marker)=="table" then
                candidate=marker.Npc or marker.npc or marker.useName
            end

            local codeObj=t:FindFirstChild("Code")
            if not candidate and codeObj and codeObj:IsA("ValueBase") then
                candidate=tostring(codeObj.Value)
            end

            local o={
                Quest=q,QuestName=qn,Name=t.Name,
                Value=tonumber(v.Value) or 0,
                Max=tonumber(m.Value) or 0,
                Marker=marker,
                Candidate=candidate
            }

            local n=low(t.Name)
            if string.find(n,"higoshima",1,true) then
                doctor=o
            elseif string.find(n,"spider",1,true) and string.find(n,"lil",1,true) then
                lilies=o
            elseif string.find(n,"kill",1,true)
                or string.find(n,"defeat",1,true)
                or string.find(n,"eliminate",1,true)
                or string.find(n,"slay",1,true)
                or string.find(n,"hunt",1,true) then
                kill=kill or o
            else
                fallback=fallback or o
            end
        end
    end

    return doctor or lilies or kill or fallback
end

local function questSnapshot()
    local out={}
    local h=questHolder()
    if h then
        for _,q in ipairs(h:GetChildren()) do out[questObjectName(q)]=true end
    end
    return out
end

local function captureMuzanQuest(before)
    local h=questHolder()
    if not h then return nil end

    for _,q in ipairs(h:GetChildren()) do
        local qn=questObjectName(q)
        if questMentionsMuzan(q) or (before and not before[qn]) then
            State.MuzanAcceptedQuestName=qn
            return q
        end
    end
end

local function clickMuzanAcceptGui()
    local pg=LocalPlayer:FindFirstChild("PlayerGui")
    if not pg then return false end

    local roots={}
    for _,label in ipairs(pg:GetDescendants()) do
        if label:IsA("TextLabel") then
            local text=low(label.Text)
            if string.find(text,"muzan",1,true)
                or string.find(text,"quest",1,true) then
                local root=label.Parent
                for _=1,5 do
                    if not root or root==pg then break end
                    roots[root]=true
                    root=root.Parent
                end
            end
        end
    end

    local buttons={}
    for root in pairs(roots) do
        for _,b in ipairs(root:GetDescendants()) do
            if b:IsA("GuiButton") and b.Visible and b.Active then
                local t=low((b:IsA("TextButton") and b.Text or "").." "..b.Name)
                local score=0
                if string.find(t,"accept",1,true) then score=100
                elseif string.find(t,"take",1,true) then score=90
                elseif string.find(t,"yes",1,true) then score=80
                elseif string.find(t,"quest",1,true) then score=60
                elseif string.find(t,"continue",1,true) then score=35
                elseif string.find(t,"next",1,true) then score=30 end
                if score>0 then buttons[#buttons+1]={Button=b,Score=score} end
            end
        end
    end

    table.sort(buttons,function(a,b) return a.Score>b.Score end)
    local entry=buttons[1]
    if not entry then return false end

    local b=entry.Button
    local ok=false
    if type(firesignal)=="function" then
        ok=pcall(firesignal,b.Activated)
        if not ok and b:IsA("TextButton") then ok=pcall(firesignal,b.MouseButton1Click) end
    end
    if not ok then pcall(function() b:Activate() end) end
    return true
end

local function requestMuzanQuestNative()
    native()

    local attempted=false

    if N.Dialogue
        and type(N.Dialogue)=="table"
        and type(N.Dialogue.Functions)=="table"
        and type(N.Dialogue.Functions.AddQuest)=="function" then
        attempted=true
        pcall(N.Dialogue.Functions.AddQuest,"Muzan Quest")
        pcall(N.Dialogue.Functions.AddQuest,LocalPlayer,"Muzan Quest")
    end

    if N.Quests and type(N.Quests.AddQuest)=="function" then
        attempted=true
        pcall(N.Quests.AddQuest,LocalPlayer,"Muzan Quest")
        pcall(N.Quests.AddQuest,"Muzan Quest")
    end

    if send("AddQuest","Muzan Quest") then attempted=true end

    if N.SignalFunction and type(N.SignalFunction.ToServer)=="function" then
        attempted=true
        pcall(N.SignalFunction.ToServer,"AddQuest","Muzan Quest")
    end

    return attempted
end

local function waitMuzanQuest(before,seconds)
    local deadline=os.clock()+(seconds or 1)
    repeat
        local q=findMuzanQuest() or captureMuzanQuest(before)
        if q then return q end
        task.wait(.10)
    until os.clock()>=deadline
    return findMuzanQuest() or captureMuzanQuest(before)
end

local function take(State)
    local existing=findMuzanQuest()
    if existing then
        return true,"Muzan Quest active"
    end

    if not isDemon() then
        return false,"Demon race required"
    end

    local before=State.MuzanQuestBaseline
    if type(before)~="table" then
        before=questSnapshot()
        State.MuzanQuestBaseline=before
    end

    local inLair=LocalPlayer:GetAttribute("IsInMuzanLayor")==true
        or LocalPlayer:GetAttribute("IsInMuzanLair")==true

    if inLair then
        if os.clock()-(State.MuzanLairAssignAt or 0)>=1.0 then
            State.MuzanLairAssignAt=os.clock()
            fxEvent("MuzanLairAssign")
        end

        local q=waitMuzanQuest(before,1.10)
        if q then
            State.MuzanQuestBaseline=nil
            return true,"Muzan Quest accepted"
        end
        return false,"Inside Muzan Lair | waiting for quest"
    end

    local bell=fxInventory() and fxInventory():FindFirstChild("Biwa Bell")
    if bell then
        if os.clock()-(State.MuzanBellUseAt or 0)>=1.25 then
            State.MuzanBellUseAt=os.clock()
            local ok,reason=fxUseInventoryTool("Biwa Bell")
            if ok then
                return false,"Entering Muzan Lair"
            end
            return false,tostring(reason or "Biwa Bell retry")
        end
        return false,"Waiting for Muzan Lair"
    end

    -- Bell is missing. The native game flow obtains it from Muzan first.
    if os.clock()-(State.MuzanGiveBellAt or 0)>=1.5 then
        State.MuzanGiveBellAt=os.clock()

        if State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then
            local reached,msg=State.GameOps.verifiedNpcAction("Muzan")
            if not reached then
                return false,tostring(msg or "Muzan unavailable")
            end
        end

        fxEvent("MuzanGiveBell")
    end

    return false,"Getting Biwa Bell"
end

local function busy(State)
    local f=State.Flags or {}
    if f.AutoBecomeDemon then return true,"Auto Demon" end
    if f.AutoBoss or f.AutoAllBoss then return true,"Auto Boss" end
    if f.AutoDungeon then return true,"Auto Dungeon" end
    if f.AutoYeti or f.AutoHeartYeti then return true,"Yeti" end
    if f.AutoFishingReel then return true,"Auto Fish" end
    if State.PlayerOps and type(State.PlayerOps.wantsRoute)=="function" then
        local ok,v=pcall(State.PlayerOps.wantsRoute); if ok and v then return true,"Player Farm" end
    end
    return false
end

local function markerTargetName(marker)
    if type(marker)=="table" then
        for _,key in ipairs({"Npc","npc","useName","Target","target","Enemy","enemy","Mob","mob","Model","model","Name","name"}) do
            local value=marker[key]
            if type(value)=="string" and value~="" then
                return value:gsub("%-AddedByAreaLocator$","")
            elseif typeof(value)=="Instance" then
                return value.Name
            end
        end
    elseif typeof(marker)=="Instance" then
        for _,key in ipairs({"Npc","npc","useName","Target","Enemy","Mob"}) do
            local ok,v=pcall(marker.GetAttribute,marker,key)
            if ok and type(v)=="string" and v~="" then return v end
        end
    end
end

local function taskMobName(taskName)
    local text=tostring(taskName or "")
    text=text:gsub("%b[]"," ")
    text=text:gsub("%d+"," ")
    text=text:gsub("[Kk]ill"," ")
    text=text:gsub("[Dd]efeat"," ")
    text=text:gsub("[Ee]liminate"," ")
    text=text:gsub("[Ss]lay"," ")
    text=text:gsub("[Hh]unt"," ")
    text=text:gsub("[Mm]obs?"," ")
    text=text:gsub("%s+"," ")
    return text:match("^%s*(.-)%s*$")
end

local function mobMatchScore(model,query)
    query=low(query)
    if query=="" or not model then return 0 end

    local name=low(model.Name)
    local title=low(model:GetAttribute("Title"))
    if name==query or title==query then return 100 end
    if string.find(name,query,1,true) or string.find(query,name,1,true) then return 85 end
    if title~="" and (string.find(title,query,1,true) or string.find(query,title,1,true)) then return 75 end

    local score=0
    for token in string.gmatch(query,"%S+") do
        if #token>=3 and (string.find(name,token,1,true) or string.find(title,token,1,true)) then
            score=score+15
        end
    end
    return score
end

local function findQuestMob(query)
    query=tostring(query or "")
    if query=="" then return nil end

    local root=fxRoot()
    local best,bestScore,bestDist
    for _,m in ipairs(workspace:GetDescendants()) do
        if m:IsA("Model") and fxAlive(m) and Players:GetPlayerFromCharacter(m)==nil then
            local score=mobMatchScore(m,query)
            if score>=30 then
                local mr=m:FindFirstChild("HumanoidRootPart") or m.PrimaryPart
                local d=(root and mr) and (root.Position-mr.Position).Magnitude or 999999
                if not bestScore or score>bestScore or (score==bestScore and d<bestDist) then
                    best,bestScore,bestDist=m,score,d
                end
            end
        end
    end
    return best
end

local function objectiveLooksCombat(o,targetName)
    local n=low(o and o.Name or "")
    if targetName and targetName~="" then return true end
    return string.find(n,"kill",1,true)
        or string.find(n,"defeat",1,true)
        or string.find(n,"eliminate",1,true)
        or string.find(n,"slay",1,true)
        or string.find(n,"hunt",1,true)
end

local function drive(State,o)
    if not o then return false end
    local n=low(o.Name)
    local mp=markerPos(o.Marker)

    if string.find(n,"spider",1,true) and string.find(n,"lil",1,true) then
        if mp then
            if not fxMove(mp,2) then
                pcall(function() LocalPlayer:RequestStreamAroundAsync(mp,.25) end)
                return true
            end
            local p=nearPrompt(mp,"lil") or nearPrompt(mp,"spider")
            if p then fire(p) end
        else
            local lily=workspace:FindFirstChild("Spider Lily",true)
            local lp=pos(lily)
            if lp and fxMove(lp,2) then
                local p=lily:FindFirstChildWhichIsA("ProximityPrompt",true) or nearPrompt(lp,"lil")
                if p then fire(p) end
            end
        end
        return true
    end

    if string.find(n,"higoshima",1,true) then
        local doctor=workspace:FindFirstChild("Dr. Higoshima",true) or workspace:FindFirstChild("Higoshima",true)
        if doctor and os.clock()-P.doctorAt>2 and State.GameOps and type(State.GameOps.verifiedNpcAction)=="function" then
            local ok=State.GameOps.verifiedNpcAction("Dr. Higoshima")
            if ok then P.doctorAt=os.clock(); return true end
        end
        if mp and fxMove(mp,2) then
            local p=nearPrompt(mp,"deliver") or nearPrompt(mp,"higoshima")
            if p then fire(p) end
        end
        return true
    end

    local targetName=tostring(o.Candidate or "")
    if targetName=="" then targetName=markerTargetName(o.Marker) end
    if not targetName or targetName=="" then targetName=taskMobName(o.Name) end

    local target=targetName and findQuestMob(targetName) or nil
    local combatObjective=objectiveLooksCombat(o,nil) or target~=nil

    if combatObjective then
        if target then
            State.MuzanQuestStatus="Farming "..tostring(target.Name)
            fxCombat(State,target,"MuzanQuest")
            return true
        end

        if mp then
            State.MuzanQuestStatus="Finding "..tostring(targetName~="" and targetName or o.Name)
            pcall(function() LocalPlayer:RequestStreamAroundAsync(mp,.30) end)
            fxMove(mp,3)
            return true
        end

        State.MuzanQuestStatus="Waiting for "..tostring(targetName~="" and targetName or o.Name)
        return false
    end

    if mp then
        if not fxMove(mp,2) then
            pcall(function() LocalPlayer:RequestStreamAroundAsync(mp,.25) end)
            return true
        end
        local p=nearPrompt(mp,"")
        if p then fire(p) end
        return true
    end

    return false
end


local function installMuzan(State,gui)
    State.Flags=State.Flags or {}
    State.Flags.AutoMuzanQuest=State.Flags.AutoMuzanQuest==true
    State.MuzanQuestStatus=State.MuzanQuestStatus or "Disabled"

    local page=gui:FindFirstChild("Page_QUEST",true)
    if not page or page:FindFirstChild("Section_Muzan Quest",true) then return end

    local cols={}
    for _,x in ipairs(page:GetChildren()) do
        if x:IsA("ScrollingFrame") then cols[#cols+1]=x end
    end
    table.sort(cols,function(a,b) return a.AbsolutePosition.X<b.AbsolutePosition.X end)
    local left=cols[1]
    if not left or not State.Runtime or type(State.Runtime.createSection)~="function" then return end

    local sec=State.Runtime.createSection(left,"Muzan Quest")
    local info=State.Runtime.makeLabel(
        sec,
        tostring(State.MuzanQuestStatus),
        UDim2.new(1,0,0,30),
        UDim2.new(),
        10,
        State.Runtime.Theme.Sub
    )
    info.TextWrapped=true

    local function runExact()
        local ex=State.A7DEVExports
        if ex and type(ex.muzanQuestTick)=="function" then
            local ok,handled,msg=pcall(ex.muzanQuestTick)
            if ok then
                State.MuzanPriorityActive=handled==true
                State.MuzanQuestStatus=tostring(msg or (handled and "Active" or "Idle"))
                return true
            end
            State.MuzanQuestStatus="Muzan retry"
            return true
        end
        return false
    end

    State.Runtime.addToggle(sec,"Auto Muzan Quest",State.Flags.AutoMuzanQuest,function(v)
        State.Flags.AutoMuzanQuest=v
        State.MuzanPriorityActive=false
        State.MuzanQuestStatus=v and "Starting..." or "Disabled"
        if v then
            task.spawn(function()
                if not runExact() then
                    local _,msg=take(State)
                    State.MuzanQuestStatus=tostring(msg)
                end
            end)
        end
    end)

    State.Runtime.addButton(sec,"Take Muzan Quest Now",function()
        State.Flags.AutoMuzanQuest=true
        if not runExact() then
            local _,msg=take(State)
            State.MuzanQuestStatus=tostring(msg)
        end
    end)

    task.spawn(function()
        local nextFallback=0
        while P.alive and gui.Parent and not State.Destroyed do
            task.wait(.28)

            if State.Flags.AutoMuzanQuest then
                if not runExact() and os.clock()>=nextFallback then
                    nextFallback=os.clock()+.9

                    if not isDemon() then
                        State.MuzanPriorityActive=false
                        State.MuzanQuestStatus="Demon race required"
                    else
                        local currentObjective=objective()
                        local currentQuest=findMuzanQuest()

                        if currentObjective then
                            State.MuzanPriorityActive=true
                            State.MuzanQuestStatus=string.format(
                                "%s | %d/%d",
                                currentObjective.Name,
                                currentObjective.Value,
                                currentObjective.Max
                            )
                            pcall(drive,State,currentObjective)
                        elseif currentQuest then
                            State.MuzanPriorityActive=true
                            State.MuzanQuestStatus="Completing Muzan Quest"
                            fxEvent("MuzanLairAssign")
                        else
                            local okTake,msg=take(State)
                            State.MuzanPriorityActive=true
                            State.MuzanQuestStatus=okTake and "Active" or tostring(msg)
                        end
                    end
                end
            else
                State.MuzanPriorityActive=false
            end

            info.Text=tostring(State.MuzanQuestStatus or "Idle")
        end
    end)
end

-- A7DEV PS2 LAYOUT V14
local function installLayout(gui, State)
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

    if nativeHeader then
        nativeHeader.Visible = false
    end

    local header = mk("Frame", main, {
        Position = UDim2.fromOffset(8,8),
        Size = UDim2.new(1,-16,0,38),
        BackgroundColor3 = Color3.fromRGB(5,13,21),
        BorderSizePixel = 0,
        Active = true,
        ZIndex = 20,
    })
    round(header,8); line(header,Color3.fromRGB(34,48,61),.10)

    mk("Frame", header, {
        Position = UDim2.fromOffset(0,0),
        Size = UDim2.fromOffset(3,38),
        BackgroundColor3 = Color3.fromRGB(188,63,78),
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
        TextColor3 = C.muted,
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


    local minimizeButton = mk("TextButton", header, {
        Position = UDim2.new(1,-72,0,4),
        Size = UDim2.fromOffset(30,30),
        BackgroundColor3 = Color3.fromRGB(11,22,32),
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "-",
        Font = Enum.Font.GothamBold,
        TextSize = 15,
        TextColor3 = C.muted,
        ZIndex = 26,
    })
    round(minimizeButton,7); line(minimizeButton,C.line,.16)

    local closeButton = mk("TextButton", header, {
        Position = UDim2.new(1,-37,0,4),
        Size = UDim2.fromOffset(30,30),
        BackgroundColor3 = Color3.fromRGB(11,22,32),
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "X",
        Font = Enum.Font.GothamBold,
        TextSize = 11,
        TextColor3 = Color3.fromRGB(190,86,96),
        ZIndex = 26,
    })
    round(closeButton,7); line(closeButton,C.line,.16)

    local miniButton = mk("TextButton", main, {
        Position = UDim2.fromOffset(0,0),
        Size = UDim2.fromScale(1,1),
        BackgroundColor3 = Color3.fromRGB(5,13,21),
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "A7",
        Font = Enum.Font.GothamBold,
        TextSize = 16,
        TextColor3 = C.text,
        Visible = false,
        ZIndex = 100,
    })
    round(miniButton,10); line(miniButton,Color3.fromRGB(45,62,77),.04)

    local minimized=false
    local restoreVisible={}
    local restoreSize=main.Size
    local restorePosition=main.Position

    local function setMinimized(value)
        value=value==true
        if value==minimized then return end
        minimized=value

        if value then
            restoreSize=main.Size
            restorePosition=main.Position
            restoreVisible={}
            for _,child in ipairs(main:GetChildren()) do
                if child:IsA("GuiObject") and child~=miniButton then
                    restoreVisible[child]=child.Visible
                    child.Visible=false
                end
            end
            main.Size=UDim2.fromOffset(52,52)
            miniButton.Visible=true
        else
            miniButton.Visible=false
            main.Size=restoreSize
            main.Position=restorePosition
            for child,wasVisible in pairs(restoreVisible) do
                if child and child.Parent==main then child.Visible=wasVisible end
            end
            restoreVisible={}
        end
    end

    on(minimizeButton.Activated:Connect(function()
        setMinimized(true)
    end))
    on(miniButton.Activated:Connect(function()
        setMinimized(false)
    end))
    on(closeButton.Activated:Connect(function()
        task.defer(function()
            pcall(function()
                if State and type(State.Destroy)=="function" then
                    State.Destroy()
                elseif State and State.Runtime and type(State.Runtime.destroyAll)=="function" then
                    State.Runtime.destroyAll()
                elseif gui and gui.Parent then
                    gui:Destroy()
                end
            end)
            stop()
        end)
    end))

    local dragging=false
    local dragStart
    local dragPosition
    on(header.InputBegan:Connect(function(input)
        if minimized then return end
        if input.UserInputType==Enum.UserInputType.MouseButton1 then
            dragging=true
            dragStart=input.Position
            dragPosition=main.Position
        end
    end))
    on(UserInputService.InputChanged:Connect(function(input)
        if dragging and input.UserInputType==Enum.UserInputType.MouseMovement then
            local delta=input.Position-dragStart
            main.Position=UDim2.new(
                dragPosition.X.Scale,dragPosition.X.Offset+delta.X,
                dragPosition.Y.Scale,dragPosition.Y.Offset+delta.Y
            )
        end
    end))
    on(UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType==Enum.UserInputType.MouseButton1 then dragging=false end
    end))

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
        BackgroundColor3 = C.line,
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
    -- Dedicated pages for systems that were previously grouped inside MISC.
    -- Only GUI containers are moved; the original callbacks/automation stay untouched.
    local specialColumns = {}

    local function makeSpecialPage(key)
        local page = mk("Frame", pageHost, {
            Name = "Page_"..key,
            Size = UDim2.fromScale(1,1),
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            Visible = false,
            ZIndex = 8,
        })

        local function column(xScale, xOffset)
            local sf = mk("ScrollingFrame", page, {
                Position = UDim2.new(xScale, xOffset, 0, 0),
                Size = UDim2.new(.5, -6, 1, 0),
                BackgroundTransparency = 1,
                BorderSizePixel = 0,
                CanvasSize = UDim2.new(),
                AutomaticCanvasSize = Enum.AutomaticSize.Y,
                ScrollBarThickness = 2,
                ScrollBarImageColor3 = C.line,
                ScrollingDirection = Enum.ScrollingDirection.Y,
                ZIndex = 9,
            })
            mk("UIListLayout", sf, {
                SortOrder = Enum.SortOrder.LayoutOrder,
                Padding = UDim.new(0, 7),
            })
            mk("UIPadding", sf, {
                PaddingTop = UDim.new(0, 1),
                PaddingBottom = UDim.new(0, 8),
                PaddingLeft = UDim.new(0, 1),
                PaddingRight = UDim.new(0, 1),
            })
            return sf
        end

        local left = column(0, 0)
        local right = column(.5, 6)
        pages[key] = page
        specialColumns[key] = {left=left, right=right}
        return page
    end

    makeSpecialPage("LOOT")
    makeSpecialPage("FISHING")
    makeSpecialPage("DUNGEON")
    makeSpecialPage("CLAN")

    local specialTargets = {
        ["Section_Visuals"] = {key="LOOT", side="left"},
        ["Section_Chest + Loot"] = {key="LOOT", side="left"},
        ["Section_Native Actions"] = {key="LOOT", side="right"},
        ["Section_Auto Sell"] = {key="LOOT", side="right"},
        ["Section_Fishing"] = {key="FISHING", side="left"},
        ["Section_Dungeon + Souls"] = {key="DUNGEON", side="left"},
        ["Section_Clan Spins"] = {key="CLAN", side="left"},
    }

    local function relocateSection(section)
        if not section or not section:IsA("Frame") then return false end
        local targetInfo = specialTargets[section.Name]
        if not targetInfo then return false end
        local cols = specialColumns[targetInfo.key]
        local target = cols and cols[targetInfo.side]
        if not target then return false end
        if section.Parent ~= target then
            section.Parent = target
        end
        return true
    end

    for _, d in ipairs(pages.MISC:GetDescendants()) do
        if d:IsA("Frame") and string.sub(d.Name,1,8)=="Section_" then
            relocateSection(d)
        end
    end

    local navMeta = {
        HOME = {"Home","Overview and quick access.","rbxassetid://7733960981"},
        FARM = {"Farm","Quest-aware farming and movement controls.","rbxassetid://7733674079"},
        BOSS = {"Boss","Boss farming, Yeti and boss selection.","rbxassetid://7733765398"},
        QUEST = {"Quest","Quest automation, training, Lantern and Muzan.","rbxassetid://7733687281"},
        TELEPORT = {"Teleport","Regions, trainers, NPCs and locations.","rbxassetid://7733992789"},
        PLAYER = {"Player","Movement, race and Player Farm.","rbxassetid://7743875962"},
        LOOT = {"Loot","ESP, chest/loot, native actions and Auto Sell.","rbxassetid://8997386448"},
        FISHING = {"Fishing","Auto Fish, rod, bait and fishing rewards.","rbxassetid://7733911490"},
        DUNGEON = {"Dungeon","Dungeon automation, cards, safe mode and souls.","rbxassetid://7733917120"},
        CLAN = {"Clan","Clan spins and clan automation.","rbxassetid://7733765398"},
        MISC = {"Misc","Crafting, alchemy, utilities and diagnostics.","rbxassetid://7734053495"},
    }

    local navButtons = {}
    local selected = "HOME"

    local function navButton(key, y)
        local meta = navMeta[key]
        local b = mk("TextButton", sidebar, {
            Position = UDim2.fromOffset(8,y),
            Size = UDim2.new(1,-16,0,32),
            BackgroundColor3 = Color3.fromRGB(7,16,25),
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = "",
            ZIndex = 14,
        })
        round(b,7)
        local activeLine = mk("Frame",b,{
            Position=UDim2.fromOffset(0,5),Size=UDim2.fromOffset(2,22),
            BackgroundColor3=Color3.fromRGB(188,63,78),BorderSizePixel=0,Visible=false,ZIndex=15
        })
        round(activeLine,2)
        local icon = mk("ImageLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(12,7),Size=UDim2.fromOffset(18,18),
            Image=meta[3],ImageColor3=C.muted,ScaleType=Enum.ScaleType.Fit,ZIndex=15
        })
        local tx = mk("TextLabel",b,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(40,0),Size=UDim2.new(1,-48,1,0),
            Text=meta[1],Font=Enum.Font.GothamMedium,TextSize=9,TextColor3=C.muted,
            TextXAlignment=Enum.TextXAlignment.Left,ZIndex=15
        })
        navButtons[key]={button=b,line=activeLine,icon=icon,text=tx}
        return b
    end

    local order={"HOME","FARM","BOSS","QUEST","TELEPORT","PLAYER","LOOT","FISHING","DUNGEON","CLAN","MISC"}
    for i,key in ipairs(order) do navButton(key,29+(i-1)*35) end

    local community = mk("Frame",sidebar,{
        Position=UDim2.fromOffset(8,421),Size=UDim2.new(1,-16,0,69),
        BackgroundColor3=Color3.fromRGB(8,17,27),BorderSizePixel=0,ZIndex=13
    })
    round(community,8); line(community,C.line,.12)
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(10,7),Size=UDim2.new(1,-20,0,15),
        Text="A7DEV",Font=Enum.Font.GothamBold,TextSize=10,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left
    })
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(10,24),Size=UDim2.new(1,-20,0,17),
        Text="Project Slayer 2",Font=Enum.Font.Gotham,TextSize=7,TextColor3=C.muted,TextXAlignment=Enum.TextXAlignment.Left
    })
    mk("TextLabel",community,{
        BackgroundTransparency=1,Position=UDim2.fromOffset(10,44),Size=UDim2.new(1,-20,0,14),
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
            pill.BackgroundColor3=on and Color3.fromRGB(154,54,70) or Color3.fromRGB(27,45,61)
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
                d.ScrollBarThickness=2; d.ScrollBarImageColor3=C.line
            elseif d:IsA("Frame") and string.sub(d.Name,1,8)=="Section_" then
                d.BackgroundColor3=Color3.fromRGB(7,17,27); d.BorderSizePixel=0
                local s=d:FindFirstChildOfClass("UIStroke")
                if s then s.Color=C.line; s.Transparency=.08 end
                if not d:FindFirstChildOfClass("UICorner") then round(d,8) end
                for _,ch in ipairs(d:GetChildren()) do
                    if ch:IsA("TextLabel") then
                        ch.Font=Enum.Font.GothamBold; ch.TextSize=10; ch.TextColor3=C.text
                    elseif ch:IsA("Frame") and ch.Size.Y.Offset<=2 then
                        ch.BackgroundColor3=C.line; ch.BackgroundTransparency=.10
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
    for _,cols in pairs(specialColumns) do
        if cols.left then stylePage(cols.left.Parent) end
    end

    local function installBossSelector()
        if not State or not State.Runtime or not State.BossOps then return end

        local oldList=pages.BOSS:FindFirstChild("Section_Boss List",true)
        local oldScan=pages.BOSS:FindFirstChild("Section_Live Boss Scanner",true)
        if oldList then oldList.Visible=false end
        if oldScan then oldScan.Visible=false end

        for _,o in ipairs(pages.BOSS:GetDescendants()) do
            if o:IsA("TextButton") then
                local t=tostring(o.Text or "")
                if t=="Previous detected boss"
                    or t=="Next detected boss"
                    or t=="Refresh boss choices"
                    or t=="Full map boss scan" then
                    o.Visible=false
                end
            elseif o:IsA("TextLabel") then
                local t=low(o.Text)
                if string.find(t,"selected bosses:",1,true)==1
                    or string.find(t,"boss page ",1,true)==1 then
                    o.Visible=false
                end
            elseif o:IsA("TextBox") then
                local parent=o.Parent
                if parent and parent:IsA("Frame") then
                    local label=parent:FindFirstChildWhichIsA("TextLabel")
                    if label and low(label.Text)=="boss names" then parent.Visible=false end
                end
            end
        end

        local cols={}
        for _,x in ipairs(pages.BOSS:GetChildren()) do
            if x:IsA("ScrollingFrame") then cols[#cols+1]=x end
        end
        table.sort(cols,function(a,b) return a.AbsolutePosition.X<b.AbsolutePosition.X end)
        local right=cols[2] or cols[1]
        if not right then return end

        local holder=State.Runtime.createSection(right,"Boss Selection")
        if holder and holder.Parent then holder.Parent.LayoutOrder=-200 end

        local search=""
        local list=Instance.new("Frame")
        list.Name="BossSelectionList"
        list.BackgroundTransparency=1
        list.Size=UDim2.new(1,0,0,0)
        list.AutomaticSize=Enum.AutomaticSize.Y
        list.LayoutOrder=10
        list.Parent=holder
        local listLayout=Instance.new("UIListLayout")
        listLayout.SortOrder=Enum.SortOrder.LayoutOrder
        listLayout.Padding=UDim.new(0,4)
        listLayout.Parent=list

        local function refreshBossRows()
            for _,child in ipairs(list:GetChildren()) do
                if child:IsA("TextButton") then child:Destroy() end
            end

            local names=State.BossOps.refreshChoices()
            local order=0
            for _,name in ipairs(names) do
                if search=="" or string.find(low(name),search,1,true) then
                    order=order+1
                    local row=Instance.new("TextButton")
                    row.Name="BossSelectRow"
                    row.AutoButtonColor=false
                    row.BackgroundColor3=C.card
                    row.BorderSizePixel=0
                    row.Size=UDim2.new(1,0,0,42)
                    row.LayoutOrder=order
                    row.Text=(State.BossOps.isSelected(name) and "[x] " or "[ ] ")..name
                    row.Parent=list
                    on(row.Activated:Connect(function()
                        State.BossOps.toggle(name)
                        refreshBossRows()
                    end))
                    sellRow(row)
                end
            end
        end

        local selectAll=State.Runtime.addButton(holder,"Select All",function()
            local names=State.BossOps.refreshChoices()
            State.BossOps.setSelection(table.concat(names,", "))
            refreshBossRows()
        end)
        selectAll.LayoutOrder=-300

        local clearAll=State.Runtime.addButton(holder,"Clear Selection",function()
            State.BossOps.setSelection("")
            refreshBossRows()
        end)
        clearAll.LayoutOrder=-299

        local searchBox=State.Runtime.addInput(holder,"Search","",function(t)
            search=low(t)
            refreshBossRows()
        end,"boss name")
        if searchBox and searchBox.Parent then searchBox.Parent.LayoutOrder=-298 end

        refreshBossRows()

        local oldRefresh=State.Runtime.refreshBossChoiceButtons
        if type(oldRefresh)=="function" then
            State.Runtime.refreshBossChoiceButtons=function(...)
                local result=oldRefresh(...)
                task.defer(refreshBossRows)
                return result
            end
        end
    end

    pcall(installBossSelector)
    stylePage(pages.BOSS)


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
        round(tile,8); line(tile,C.line,.18)
        mk("ImageLabel",tile,{
            BackgroundTransparency=1,Position=UDim2.fromOffset(7,7),Size=UDim2.fromOffset(18,18),
            Image=meta[3],ImageColor3=C.muted,ScaleType=Enum.ScaleType.Fit
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
            v.icon.ImageColor3=onState and C.text or C.muted
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
                relocateSection(sec)
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

local function fxNative(force)
    if FXN.Ready and force~=true then return end
    local CAM=ReplicatedStorage:FindFirstChild("CAM")
    local Global=CAM and CAM:FindFirstChild("Global")
    local Client=CAM and CAM:FindFirstChild("Client")
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
    FXN.CharacterInfo=Global and fxReq(Global:FindFirstChild("Character_info_provider"))
        or (Global and fxReq(Global:FindFirstChild("CharacterInfoProvider")))
    FXN.PlayerProfile=Global and fxReq(Global:FindFirstChild("PlayerProfile"))
    FXN.SkillsModule=Global and fxReq(Global:FindFirstChild("Skills_Module"))
    local modules=Client and Client:FindFirstChild("Modules")
    local gameplayModules=modules and modules:FindFirstChild("GamePlay")
    FXN.Dialogue=gameplayModules and fxReq(gameplayModules:FindFirstChild("Dialogue"))
    local controllers=Client and Client:FindFirstChild("Controllers")
    FXN.SkillController=controllers and fxReq(controllers:FindFirstChild("Skill_Controller"))
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


local FX_TOOLBAR_KEYS={"One","Two","Three","Four","Five"}

local function fxInventoryData()
    local d=fxData()
    local inv=d and d:FindFirstChild("Inventory")
    local items=inv and inv:FindFirstChild("Inventory")
    local toolbar=inv and inv:FindFirstChild("Toolbar")
    return d,items,toolbar
end

local function fxItemId(item)
    if not item then return nil end
    local obj=item:FindFirstChild("Id") or item:FindFirstChild("ID") or item:FindFirstChild("ItemId")
    if obj and obj:IsA("ValueBase") then return tonumber(obj.Value) end
    for _,key in ipairs({"Id","ID","ItemId"}) do
        local ok,v=pcall(item.GetAttribute,item,key)
        if ok and tonumber(v) then return tonumber(v) end
    end
    if item:IsA("ValueBase") and tonumber(item.Value) then return tonumber(item.Value) end
end

local function fxFindToolbarSlot(data,itemName,itemId)
    local inv=data and data:FindFirstChild("Inventory")
    local toolbar=inv and inv:FindFirstChild("Toolbar")
    if not toolbar then return nil end

    fxNative()
    if FXN.CharacterInfo and type(FXN.CharacterInfo.GetItemFromId)=="function" then
        for index,key in ipairs(FX_TOOLBAR_KEYS) do
            local slot=toolbar:FindFirstChild(key)
            local id=slot and tonumber(slot.Value)
            if id and id~=0 then
                local ok,item=pcall(FXN.CharacterInfo.GetItemFromId,LocalPlayer,id)
                if ok and item and item.Name==itemName then
                    return index,key,slot,id
                end
            end
        end
    end

    if itemId then
        for index,key in ipairs(FX_TOOLBAR_KEYS) do
            local slot=toolbar:FindFirstChild(key)
            if slot and tonumber(slot.Value)==tonumber(itemId) then
                return index,key,slot,itemId
            end
        end
        for index,key in ipairs(FX_TOOLBAR_KEYS) do
            local slot=toolbar:FindFirstChild(key)
            if slot and (tonumber(slot.Value) or 0)==0 then
                return index,key,slot,itemId
            end
        end
        local slot=toolbar:FindFirstChild("Five")
        if slot then return 5,"Five",slot,itemId end
    end
end

local function fxUseInventoryTool(itemName)
    local data,items=fxInventoryData()
    local item=items and items:FindFirstChild(itemName)
    if not item then return false,"missing "..itemName end

    fxNative(true)
    if not FXN.SignalEvent or type(FXN.SignalEvent.ToServer)~="function" then
        return false,"SignalEvent unavailable"
    end

    local itemId=fxItemId(item)
    local slotIndex,slotKey,slotObj,useId=fxFindToolbarSlot(data,itemName,itemId)
    if not slotIndex then return false,itemName.." toolbar slot unavailable" end

    if tonumber(slotObj.Value)~=tonumber(useId) then
        pcall(FXN.SignalEvent.ToServer,"Toolbar_Equip",slotKey,useId)
        pcall(function() slotObj.Value=useId end)
        task.wait(.15)
    end

    local itemsConfig=LocalPlayer:FindFirstChild("Items_Config")
    local equipped=itemsConfig and itemsConfig:FindFirstChild("Equipped")
    if equipped and equipped:IsA("IntValue") then
        pcall(function() equipped.Value=slotIndex end)
    end

    pcall(FXN.SignalEvent.ToServer,"Item_Equip",slotIndex)
    task.wait(.10)

    local toolScripts=ReplicatedStorage:FindFirstChild("ToolScripts")
    local folder=toolScripts and toolScripts:FindFirstChild(itemName)
    local clientModule=folder and folder:FindFirstChild(itemName)
    if clientModule and clientModule:IsA("ModuleScript") then
        local okModule,module=pcall(require,clientModule)
        if okModule and type(module)=="table" and type(module.MouseDown)=="function" then
            task.spawn(module.MouseDown,LocalPlayer.Character,itemName)
        end
    end

    local okDown=pcall(FXN.SignalEvent.ToServer,"Tool_Mouse","Down",nil)
    if not okDown then return false,itemName.." Tool_Mouse failed" end
    task.delay(.30,function()
        if FXN.SignalEvent and type(FXN.SignalEvent.ToServer)=="function" then
            pcall(FXN.SignalEvent.ToServer,"Tool_Mouse","Up",nil)
        end
    end)
    return true
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
    if State.SellKeepAmount==nil then
        State.SellKeepAmount=1
    else
        State.SellKeepAmount=math.max(0,math.floor(tonumber(State.SellKeepAmount) or 1))
    end
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
                    State.TrainingPriorityActive=false
                    State.TrainingStatus="No active training objective"
                else
                    State.TrainingPriorityActive=true
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
            else
                State.TrainingPriorityActive=false
            end
        end
    end)
end


local function installCrowQuest(State,gui)
    if State.CrowQuestOps and State.CrowQuestOps.A7DEV_V14 then return end

    State.Flags.AutoCrowQuest=State.Flags.AutoCrowQuest==true
    State.CrowQuestName=State.CrowQuestName or ""
    State.CrowQuestStatus=State.CrowQuestStatus or "Idle"
    State.CrowPriorityActive=false

    local Ops={A7DEV_V14=true,NextTry=0,PendingUntil=0}
    State.CrowQuestOps=Ops

    local function slayerRace()
        local r=low(race())
        return string.find(r,"slayer",1,true)~=nil or string.find(r,"hybrid",1,true)~=nil
    end

    local function holder()
        local d=fxData()
        local qs=d and d:FindFirstChild("Quests")
        return qs and qs:FindFirstChild("Holder")
    end

    local function questName(q)
        local s=q and q:FindFirstChild("QuestString")
        return q and ((s and tostring(s.Value)~="" and tostring(s.Value)) or q.Name) or ""
    end

    local function questSnapshot()
        local out={}
        local h=holder()
        if h then
            for _,q in ipairs(h:GetChildren()) do out[questName(q)]=true end
        end
        return out
    end

    local function findQuestByName(name)
        if not name or name=="" then return nil end
        local h=holder()
        if not h then return nil end
        for _,q in ipairs(h:GetChildren()) do
            if low(questName(q))==low(name) then return q end
        end
    end

    local function crowTaggedQuest()
        local h=holder()
        if not h then return nil end
        for _,q in ipairs(h:GetChildren()) do
            local tagged=false
            for _,key in ipairs({"Crow","CrowTask","FromCrow","Kasugai"}) do
                local ok,v=pcall(q.GetAttribute,q,key)
                if ok and v then tagged=true break end
                if q:FindFirstChild(key,true) then tagged=true break end
            end
            if tagged then return q end
        end
    end

    local function currentQuest()
        local q=findQuestByName(State.CrowQuestName)
        if q then return q end
        q=crowTaggedQuest()
        if q then
            State.CrowQuestName=questName(q)
            return q
        end
        return nil
    end

    local function objectiveFor(q)
        if not q then return nil end
        fxNative()
        local qn=questName(q)
        local info
        if FXN.Quests and type(FXN.Quests.GetQuestInfo)=="function" then
            pcall(function() info=FXN.Quests.GetQuestInfo(qn) end)
        end
        local tasks=q:FindFirstChild("Tasks")
        if not tasks then return nil end

        for _,taskObj in ipairs(tasks:GetChildren()) do
            local v=taskObj:FindFirstChild("Value")
            local m=taskObj:FindFirstChild("Max")
            if v and m and tonumber(v.Value) and tonumber(m.Value) and v.Value<m.Value then
                local marker
                if info and FXN.Quests and type(FXN.Quests.GetTaskMarker)=="function" then
                    pcall(function() marker=FXN.Quests.GetTaskMarker(info,taskObj) end)
                end
                return {
                    Quest=q,QuestName=qn,TaskName=taskObj.Name,
                    Value=tonumber(v.Value) or 0,Max=tonumber(m.Value) or 0,Marker=marker
                }
            end
        end
    end

    local function markerTarget(marker)
        if type(marker)=="table" then
            for _,key in ipairs({"Npc","npc","useName","Name","Target","target"}) do
                local value=marker[key]
                if type(value)=="string" and value~="" then
                    return value:gsub("%-AddedByAreaLocator$","")
                end
            end
        elseif typeof(marker)=="Instance" then
            for _,key in ipairs({"Npc","npc","useName","Target"}) do
                local ok,v=pcall(marker.GetAttribute,marker,key)
                if ok and type(v)=="string" and v~="" then return v end
            end
        end
    end

    local function taskTarget(taskName)
        local t=tostring(taskName or "")
        t=t:gsub("%d+"," ")
        t=t:gsub("[Kk]ill"," ")
        t=t:gsub("[Dd]efeat"," ")
        t=t:gsub("[Ss]lay"," ")
        t=t:gsub("[Hh]unt"," ")
        t=t:gsub("%s+"," ")
        return t:match("^%s*(.-)%s*$")
    end

    local function findMob(name)
        name=low(name)
        if name=="" then return nil end
        local best,bestDist
        local root=fxRoot()
        for _,m in ipairs(workspace:GetDescendants()) do
            if m:IsA("Model") and fxAlive(m) and Players:GetPlayerFromCharacter(m)==nil then
                local title=low(m:GetAttribute("Title"))
                local mn=low(m.Name)
                if string.find(mn,name,1,true) or string.find(name,mn,1,true)
                    or (title~="" and string.find(title,name,1,true)) then
                    local mr=m:FindFirstChild("HumanoidRootPart") or m.PrimaryPart
                    local d=(root and mr) and (root.Position-mr.Position).Magnitude or 999999
                    if not bestDist or d<bestDist then best,bestDist=m,d end
                end
            end
        end
        return best
    end

    local function driveObjective(o)
        if not o then return false end
        local targetName=markerTarget(o.Marker)
        if not targetName or targetName=="" then targetName=taskTarget(o.TaskName) end

        local target=targetName and findMob(targetName) or nil
        if target then
            State.CrowQuestStatus=o.TaskName
            fxCombat(State,target,"Quest")
            return true
        end

        local mp=markerPos(o.Marker)
        if mp then
            State.CrowQuestStatus=o.TaskName
            if not fxMove(mp,2) then
                pcall(function() LocalPlayer:RequestStreamAroundAsync(mp,.25) end)
                return true
            end
            local prompt=fxFindPrompt({},16)
            if prompt then fire(prompt) end
            return true
        end

        return false
    end

    local function findCrowTool()
        local char=LocalPlayer.Character
        local bag=LocalPlayer:FindFirstChildOfClass("Backpack")
        for _,container in ipairs({char,bag}) do
            if container then
                for _,tool in ipairs(container:GetChildren()) do
                    if tool:IsA("Tool") then
                        local n=low(tool.Name)
                        if string.find(n,"crow",1,true) or string.find(n,"kasugai",1,true) then
                            return tool
                        end
                    end
                end
            end
        end
    end

    local function useCrowTool()
        local tool=findCrowTool()
        if tool then
            local char=LocalPlayer.Character
            local hum=char and char:FindFirstChildOfClass("Humanoid")
            if hum and tool.Parent~=char then pcall(function() hum:EquipTool(tool) end) end
            if pcall(function() tool:Activate() end) then return true end
        end

        local pg=LocalPlayer:FindFirstChild("PlayerGui")
        if pg then
            for _,b in ipairs(pg:GetDescendants()) do
                if b:IsA("GuiButton") and b.Visible and b.Active then
                    local text=low((b:IsA("TextButton") and b.Text or "").." "..b.Name)
                    if string.find(text,"kasugai",1,true) or string.find(text,"crow",1,true) then
                        local ok=false
                        if type(firesignal)=="function" then
                            ok=pcall(firesignal,b.Activated)
                            if not ok and b:IsA("TextButton") then ok=pcall(firesignal,b.MouseButton1Click) end
                        end
                        if not ok then pcall(function() b:Activate() end) end
                        return true
                    end
                end
            end
        end
        return false
    end

    local function crowModel()
        local best,bestDist
        local root=fxRoot()
        local myName=low(LocalPlayer.Name)
        for _,m in ipairs(workspace:GetDescendants()) do
            if m:IsA("Model") and string.find(low(m.Name),"crow",1,true) then
                local mr=m:FindFirstChildWhichIsA("BasePart",true)
                if mr then
                    local d=root and (root.Position-mr.Position).Magnitude or 0
                    local personal=string.find(low(m.Name),myName,1,true) and -10000 or 0
                    d=d+personal
                    if not bestDist or d<bestDist then best,bestDist=m,d end
                end
            end
        end
        return best
    end

    local function interactCrow()
        local crow=crowModel()
        if not crow then return false end
        local part=crow:FindFirstChildWhichIsA("BasePart",true)
        if part and not fxMove(part.Position,2) then return true end
        local prompt=crow:FindFirstChildWhichIsA("ProximityPrompt",true)
        if prompt and prompt.Enabled then return fire(prompt) end
        return true
    end

    local function activateCrowBoard()
        local pg=LocalPlayer:FindFirstChild("PlayerGui")
        if not pg then return false end
        local root
        for _,o in ipairs(pg:GetDescendants()) do
            local n=low(o.Name)
            if string.find(n,"crowtask",1,true) or n=="crowtasks" then
                root=o
                break
            end
        end
        if not root then
            for _,o in ipairs(pg:GetDescendants()) do
                if o:IsA("TextLabel") and string.find(low(o.Text),"crow",1,true) then
                    root=o.Parent
                    break
                end
            end
        end
        if not root then return false end

        local buttons={}
        for _,b in ipairs(root:GetDescendants()) do
            if b:IsA("GuiButton") and b.Visible and b.Active then
                local t=low(b:IsA("TextButton") and b.Text or b.Name)
                if t~="" and t~="x"
                    and not string.find(t,"close",1,true)
                    and not string.find(t,"back",1,true)
                    and not string.find(t,"dismiss",1,true)
                    and not string.find(t,"cancel",1,true) then
                    buttons[#buttons+1]=b
                end
            end
        end

        table.sort(buttons,function(a,b)
            local function score(x)
                local t=low((x:IsA("TextButton") and x.Text or "").." "..x.Name)
                if string.find(t,"accept",1,true) then return 100 end
                if string.find(t,"take",1,true) then return 90 end
                if string.find(t,"hunt",1,true) then return 80 end
                if string.find(t,"quest",1,true) or string.find(t,"task",1,true) then return 70 end
                if string.find(t,"next",1,true) then return 30 end
                return 0
            end
            return score(a)>score(b)
        end)

        for _,b in ipairs(buttons) do
            local ok=false
            if type(firesignal)=="function" then
                ok=pcall(firesignal,b.Activated)
                if not ok and b:IsA("TextButton") then ok=pcall(firesignal,b.MouseButton1Click) end
            end
            if not ok then pcall(function() b:Activate() end) end
            task.wait(.15)
            return true
        end
        return false
    end

    function Ops.request()
        if not slayerRace() then
            State.CrowQuestStatus="Slayer only"
            State.CrowPriorityActive=false
            return false
        end

        local before=questSnapshot()
        State.CrowPriorityActive=true
        Ops.PendingUntil=os.clock()+3

        useCrowTool()
        task.wait(.18)
        interactCrow()
        task.wait(.20)
        activateCrowBoard()

        local deadline=os.clock()+2.2
        repeat
            local h=holder()
            if h then
                for _,q in ipairs(h:GetChildren()) do
                    local qn=questName(q)
                    if qn~="" and not before[qn] then
                        State.CrowQuestName=qn
                        State.CrowQuestStatus=qn
                        State.CrowPriorityActive=true
                        return true
                    end
                end
            end
            local tagged=crowTaggedQuest()
            if tagged then
                State.CrowQuestName=questName(tagged)
                State.CrowQuestStatus=State.CrowQuestName
                State.CrowPriorityActive=true
                return true
            end
            task.wait(.10)
        until os.clock()>=deadline

        State.CrowPriorityActive=false
        State.CrowQuestStatus="Waiting"
        return false
    end

    function Ops.tick(force)
        if State.Flags.AutoCrowQuest~=true and force~=true then
            State.CrowPriorityActive=false
            return
        end
        if not slayerRace() then
            State.CrowPriorityActive=false
            State.CrowQuestStatus="Slayer only"
            return
        end

        local q=currentQuest()
        if q then
            local o=objectiveFor(q)
            if o then
                State.CrowPriorityActive=true
                driveObjective(o)
                return
            end

            -- Completed/turn-in phase: call the crow once, then release the farm.
            State.CrowPriorityActive=true
            useCrowTool()
            interactCrow()
            task.wait(.12)
            State.CrowQuestName=""
            State.CrowPriorityActive=false
            Ops.NextTry=os.clock()+4
            return
        end

        if os.clock()<(Ops.PendingUntil or 0) then
            State.CrowPriorityActive=true
            return
        end

        State.CrowPriorityActive=false
        if force==true or os.clock()>=(Ops.NextTry or 0) then
            Ops.NextTry=os.clock()+8
            Ops.request()
        end
    end

    local left,right=fxColumns(gui,"QUEST")
    local col=right or left
    if col and State.Runtime and type(State.Runtime.createSection)=="function" then
        local sec=State.Runtime.createSection(col,"Slayer Crow")
        if sec and sec.Parent then sec.Parent.LayoutOrder=-120 end

        State.Runtime.addToggle(sec,"Auto Crow Quest",State.Flags.AutoCrowQuest,function(v)
            State.Flags.AutoCrowQuest=v
            if not v then
                State.CrowPriorityActive=false
                State.CrowQuestStatus="Idle"
            else
                Ops.NextTry=0
            end
        end)

        State.Runtime.addButton(sec,"Get Crow Quest Now",function()
            State.Flags.AutoCrowQuest=true
            Ops.NextTry=0
            task.spawn(function() Ops.tick(true) end)
        end)
    end

    task.spawn(function()
        while P.alive and gui.Parent and not State.Destroyed do
            task.wait(.35)
            Ops.tick(false)
        end
    end)
end

local function installQuestPriority(State)
    if not State or not State.Runtime or type(State.Runtime.mainHeartbeat)~="function" then return end

    if State.A7DEVMainHeartbeatOriginal and type(State.A7DEVMainHeartbeatOriginal)=="function" then
        State.Runtime.mainHeartbeat=State.A7DEVMainHeartbeatOriginal
    end

    local original=State.Runtime.mainHeartbeat
    State.A7DEVMainHeartbeatOriginal=original

    State.Runtime.mainHeartbeat=function()
        local priority=State.MuzanPriorityActive==true
            or State.CrowPriorityActive==true
            or State.TrainingPriorityActive==true

        if State.Flags and State.Flags.AutoFarm==true and priority then
            return
        end

        return original()
    end
end

local function setNativeToggle(gui,label,wanted)
    if not gui then return false end
    wanted=wanted==true

    for _,row in ipairs(gui:GetDescendants()) do
        if row:IsA("TextButton") and row.Text=="" then
            local labelObj=row:FindFirstChildWhichIsA("TextLabel")
            if labelObj and low(labelObj.Text)==low(label) then
                local oldBox
                for _,child in ipairs(row:GetChildren()) do
                    if child:IsA("Frame") and child.Size.X.Offset<=22 and child.Size.Y.Offset<=22 then
                        oldBox=child
                        break
                    end
                end
                local fill=oldBox and oldBox:FindFirstChildWhichIsA("Frame")
                local current=fill and fill.Visible==true or false
                if current~=wanted then
                    local ok=false
                    if type(firesignal)=="function" then
                        ok=pcall(firesignal,row.MouseButton1Click)
                        if not ok then ok=pcall(firesignal,row.Activated) end
                    end
                    if not ok then pcall(function() row:Activate() end) end
                end
                return true
            end
        end
    end
    return false
end

local function installNativeSkillWatchdog(State,gui)
    if State.NativeSkillWatchdog and State.NativeSkillWatchdog.A7DEV_V14 then return end
    local Ops={A7DEV_V14=true,LastWarmup=0}
    State.NativeSkillWatchdog=Ops
    State.Flags.AutoSkills=true

    local function combatActive()
        local f=State.Flags or {}
        if f.AutoFarm or f.AutoBoss or f.AutoDungeon or f.AutoYeti
            or f.AutoHeartYeti or f.AutoFarmPlayers then return true end
        if State.MuzanPriorityActive or State.CrowPriorityActive or State.TrainingPriorityActive then return true end
        local target=State.CurrentTarget
        return target and fxAlive(target) or false
    end

    local function warmup(force)
        local ex=State.A7DEVExports
        if not ex or type(ex.skillWarmup)~="function" then return false end
        if not force and os.clock()-(Ops.LastWarmup or 0)<1.5 then return false end
        Ops.LastWarmup=os.clock()
        local ok,used=pcall(ex.skillWarmup)
        return ok and used==true
    end

    local function nativeTick()
        local ex=State.A7DEVExports
        if ex and type(ex.autoSkillTick)=="function" then
            pcall(ex.autoSkillTick)
        end
    end

    task.spawn(function()
        task.wait(.40)
        warmup(true)

        while P.alive and gui.Parent and not State.Destroyed do
            task.wait(.14)
            if State.Flags.AutoSkills and combatActive() then
                if (State.LastSkill or 0)<=0 or os.clock()-(State.LastSkill or 0)>2.5 then
                    warmup(false)
                end
                nativeTick()
            end
        end
    end)

    on(LocalPlayer.CharacterAdded:Connect(function()
        task.delay(.9,function()
            if P.alive and gui.Parent and State.Flags.AutoSkills then
                State.LastSkill=0
                warmup(true)
            end
        end)
    end))
end


local function installConfig(State,gui)
    if State.ConfigOps and State.ConfigOps.A7DEV_V14 then return end
    local Ops={A7DEV_V14=true}
    State.ConfigOps=Ops

    local HttpService=game:GetService("HttpService")
    local folder="A7DEV"
    local path=folder.."/ProjectSlayer2_config.json"

    local flagKeys={
        "AutoFarmQuest","StrictFarmQuest","AutoQuestProgression",
        "AutoAttack","AutoEquip","AutoSkills",
        "AutoLootDrops","AutoChestLoot","ChestInterruptFarm",
        "AutoCollectSouls","AutoDungeonCards","DungeonSafeMode",
        "AutoLantern","AutoCrowQuest","AutoMuzanQuest",
        "AutoSell","AutoSellUnlock","AutoYeti","AutoHeartYeti",
        "AutoTrainingQuests"
    }

    local function ensureFolder()
        if type(makefolder)=="function" and type(isfolder)=="function" then
            pcall(function()
                if not isfolder(folder) then makefolder(folder) end
            end)
        end
    end

    function Ops.save()
        if type(writefile)~="function" then return false,"writefile unavailable" end
        ensureFolder()

        local flags={}
        for _,key in ipairs(flagKeys) do flags[key]=State.Flags[key]==true end

        local bossSelected={}
        for i,name in ipairs(State.BossSelectedNames or {}) do bossSelected[i]=name end

        local sellSelected={}
        for name,v in pairs(State.SellSelected or {}) do
            if v==true then sellSelected[name]=true end
        end

        local payload={
            version=1,
            flags=flags,
            farmStyle=tostring(State.FarmStyle or "Behind"),
            sellKeepAmount=tonumber(State.SellKeepAmount) or 1,
            sellSelected=sellSelected,
            bossSelected=bossSelected,
            yetiHeartTarget=tonumber(State.YetiHeartTarget) or 1,
            playerTargetName=tostring(State.PlayerTargetName or ""),
            spinTargetClans=tostring(State.SpinTargetClans or ""),
            spinStopRarity=tostring(State.SpinStopRarity or "Legendary")
        }

        local ok,json=pcall(HttpService.JSONEncode,HttpService,payload)
        if not ok then return false,"encode failed" end
        local wrote=pcall(writefile,path,json)
        return wrote,wrote and "Config saved" or "Save failed"
    end

    function Ops.load()
        if type(readfile)~="function" or type(isfile)~="function" then
            return false,"readfile unavailable"
        end
        local okExists,exists=pcall(isfile,path)
        if not okExists or not exists then return false,"No saved config" end

        local okRead,raw=pcall(readfile,path)
        if not okRead or type(raw)~="string" then return false,"Read failed" end

        local okDecode,data=pcall(HttpService.JSONDecode,HttpService,raw)
        if not okDecode or type(data)~="table" then return false,"Invalid config" end

        if type(data.flags)=="table" then
            for _,key in ipairs(flagKeys) do
                if data.flags[key]~=nil then State.Flags[key]=data.flags[key]==true end
            end
        end

        if data.farmStyle=="Behind" or data.farmStyle=="Above" or data.farmStyle=="Under" then
            State.FarmStyle=data.farmStyle
        end

        State.SellKeepAmount=math.max(0,math.floor(tonumber(data.sellKeepAmount) or 1))
        if type(data.sellSelected)=="table" then State.SellSelected=data.sellSelected end
        State.YetiHeartTarget=math.max(1,math.floor(tonumber(data.yetiHeartTarget) or 1))
        State.PlayerTargetName=tostring(data.playerTargetName or State.PlayerTargetName or "")
        State.SpinTargetClans=tostring(data.spinTargetClans or State.SpinTargetClans or "")
        State.SpinStopRarity=tostring(data.spinStopRarity or State.SpinStopRarity or "Legendary")

        if type(data.bossSelected)=="table" and State.BossOps and type(State.BossOps.setSelection)=="function" then
            State.BossOps.setSelection(table.concat(data.bossSelected,", "))
        end

        task.defer(function()
            setNativeToggle(gui,"Auto Skills",State.Flags.AutoSkills==true)
            setNativeToggle(gui,"Auto Loot Drops",State.Flags.AutoLootDrops==true)
            setNativeToggle(gui,"Auto Chest Loot",State.Flags.AutoChestLoot==true)
            setNativeToggle(gui,"Allow loot/chest route to interrupt farm",State.Flags.ChestInterruptFarm==true)
        end)

        return true,"Config loaded"
    end

    local left,right=fxColumns(gui,"MISC")
    local col=right or left
    if col and State.Runtime and type(State.Runtime.createSection)=="function" then
        local sec=State.Runtime.createSection(col,"Config")
        State.Runtime.addButton(sec,"Save Config",function()
            local _,msg=Ops.save()
            if State.StatusLabel then State.StatusLabel.Text="STATUS  "..tostring(msg) end
        end)
        State.Runtime.addButton(sec,"Load Config",function()
            local _,msg=Ops.load()
            if State.StatusLabel then State.StatusLabel.Text="STATUS  "..tostring(msg) end
        end)
    end
end

local function installRestoredFeatures(State,gui)
    if not State or not gui then return end
    State.Flags=State.Flags or {}
    State.Flags.AutoSkills=true
    State.Flags.AutoLootDrops=true
    State.Flags.AutoChestLoot=true
    State.Flags.ChestInterruptFarm=true
    State.Flags.AutoFarmQuest=true
    State.Flags.StrictFarmQuest=true
    State.Flags.AutoQuestProgression=true
    if State.FarmStyle=="Under" or not State.FarmStyle then State.FarmStyle="Behind" end
    pcall(installAutoSell,State,gui)
    pcall(installYeti,State,gui)
    pcall(installLantern,State,gui)
    pcall(installPlayerFarm,State,gui)
    pcall(installTraining,State,gui)
    pcall(installCrowQuest,State,gui)
    pcall(installQuestPriority,State)
    pcall(installNativeSkillWatchdog,State,gui)
    pcall(installConfig,State,gui)

    task.defer(function()
        setNativeToggle(gui,"Auto Skills",true)
        setNativeToggle(gui,"Auto Loot Drops",true)
        setNativeToggle(gui,"Auto Chest Loot",true)
        setNativeToggle(gui,"Allow loot/chest route to interrupt farm",true)
    end)
end

local State
for _=1,1200 do
    if not P.alive then return end
    State=ENV.A7DEV_PROJECT_SLAYER_2
    if State then break end
    task.wait(.25)
end
if not State then return end

if State.Runtime and State.Runtime.Theme then
    State.Runtime.Theme.Bg = Color3.fromRGB(4, 9, 15)
    State.Runtime.Theme.Panel = Color3.fromRGB(8, 17, 27)
    State.Runtime.Theme.Panel2 = Color3.fromRGB(11, 23, 35)
    State.Runtime.Theme.Panel3 = Color3.fromRGB(14, 28, 41)
    State.Runtime.Theme.Red = Color3.fromRGB(188, 63, 78)
    State.Runtime.Theme.RedDark = Color3.fromRGB(39, 48, 59)
    State.Runtime.Theme.Border = Color3.fromRGB(34, 48, 61)
    State.Runtime.Theme.Sub = Color3.fromRGB(126, 146, 164)
end

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
pcall(installLayout, gui, State)
pcall(installRestoredFeatures, State, gui)
native()
for _,x in ipairs(gui:GetDescendants()) do
    renameBoss(x)
    cleanVisibleObject(x)
    if x:IsA("TextButton") then sellRow(x) end
end
sellActions(gui)
cleanUi(gui)
installMuzan(State,gui)

on(gui.DescendantAdded:Connect(function(x)
    task.defer(function()
        if not P.alive or not x.Parent then return end
        renameBoss(x)
        cleanVisibleObject(x)
        if x:IsA("TextButton") then sellRow(x) end
        if x.Name=="Section_Auto Sell" or (x.Parent and x.Parent.Name=="Section_Auto Sell") then sellActions(gui) end
    end)
end))

task.delay(1.5,function()
    if P.alive and gui.Parent then
        for _,x in ipairs(gui:GetDescendants()) do
            renameBoss(x)
            cleanVisibleObject(x)
            if x:IsA("TextButton") then sellRow(x) end
        end
        sellActions(gui)
        cleanUi(gui)
        installMuzan(State,gui)
    end
end)
