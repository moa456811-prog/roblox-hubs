-- A7DEV HUB | Slayers 2 | BlackLight UI TEST V6 NATIVE
-- Rebuilds presentation around the ORIGINAL controls.
-- Native gameplay buttons/toggles are moved, never replaced, so their callbacks stay intact.
-- Test branch only.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TeleportService = game:GetService("TeleportService")

local LocalPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local ENV = (getgenv and getgenv()) or _G

if ENV.A7DEV_PS2_BLACKLIGHT_NATIVE_STOP then
    pcall(ENV.A7DEV_PS2_BLACKLIGHT_NATIVE_STOP)
end

local running = true
local conns = {}
local original = {}
local moved = setmetatable({}, {__mode="k"})
local hiddenText = setmetatable({}, {__mode="k"})

local function on(c)
    if c then conns[#conns+1] = c end
    return c
end

local function mk(className, parent, props)
    local o = Instance.new(className)
    for k,v in pairs(props or {}) do o[k] = v end
    o.Parent = parent
    return o
end

local function corner(parent, radius)
    local c = parent:FindFirstChildOfClass("UICorner")
    if not c then c = mk("UICorner", parent, {}) end
    c.CornerRadius = UDim.new(0, radius or 8)
    return c
end

local function stroke(parent, transparency)
    local s = parent:FindFirstChildOfClass("UIStroke")
    if not s then s = mk("UIStroke", parent, {}) end
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Color = Color3.fromRGB(37,38,44)
    s.Thickness = 1
    s.Transparency = transparency or .1
    return s
end

local C = {
    bg = Color3.fromRGB(5,5,7),
    top = Color3.fromRGB(7,7,9),
    panel = Color3.fromRGB(14,15,18),
    control = Color3.fromRGB(20,21,25),
    active = Color3.fromRGB(38,39,45),
    border = Color3.fromRGB(37,38,44),
    border2 = Color3.fromRGB(29,30,35),
    text = Color3.fromRGB(238,239,243),
    muted = Color3.fromRGB(134,137,145),
    dim = Color3.fromRGB(80,83,91),
    white = Color3.fromRGB(235,236,240),
}

local ENGLISH = {
    ["Paramètres"]="Settings", ["Parametres"]="Settings",
    ["Réglages"]="Settings", ["Reglages"]="Settings",
    ["Pêche"]="Fishing", ["Peche"]="Fishing",
    ["Défense"]="Defence", ["Defense"]="Defence",
    ["Visuels"]="Visuals", ["Mouvement"]="Movement",
    ["Voyage"]="Travel", ["Serveur"]="Server",
    ["Joueur"]="Player", ["Divers"]="Misc",
    ["Quêtes"]="Quests", ["Quetes"]="Quests",
    ["Butin"]="Loot",
}

local function lower(v)
    return string.lower(tostring(v or ""))
end

local function translate(obj)
    if not obj or not obj.Parent then return end
    if not (obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox")) then return end
    pcall(function() obj.AutoLocalize = false end)
    local t = tostring(obj.Text or "")
    local e = ENGLISH[t]
    if e then obj.Text = e end
end

local playerGui = LocalPlayer:WaitForChild("PlayerGui")
local gui

for _=1,600 do
    gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
    if gui then break end
    task.wait(.1)
end

if not gui then
    warn("[A7DEV UI V6] Slayer 2 GUI not found.")
    return
end

local main = gui:FindFirstChild("Main")
if not main then
    warn("[A7DEV UI V6] Main frame not found.")
    return
end

-- Remove older TEST shells if one survived in the same session.
for _, child in ipairs(main:GetChildren()) do
    if string.find(child.Name or "", "A7DEV_PS2_BLACKLIGHT_TEST_", 1, true) == 1 then
        pcall(function() child:Destroy() end)
    end
end
for _, name in ipairs({
    "A7DEV_PS2_BLACKLIGHT_MINI",
    "A7DEV_PS2_BLACKLIGHT_MINI_V2",
    "A7DEV_PS2_NATIVE_MINI",
    "A7DEV_PS2_KEYLIST",
    "A7DEV_PS2_KEYLIST_V2",
}) do
    local old = gui:FindFirstChild(name)
    if old then pcall(function() old:Destroy() end) end
end

-- Capture native sections and the current direct presentation.
local sections = {}
for _, d in ipairs(main:GetDescendants()) do
    if d:IsA("Frame") and string.sub(d.Name,1,8) == "Section_" then
        sections[#sections+1] = d
        original[d] = {
            parent=d.Parent,
            layoutOrder=d.LayoutOrder,
            size=d.Size,
            position=d.Position,
            visible=d.Visible,
            automaticSize=d.AutomaticSize,
        }
    end
end

local directVisibility = {}
for _, child in ipairs(main:GetChildren()) do
    if child:IsA("GuiObject") then
        directVisibility[child] = child.Visible
    end
end

-- -------------------------------------------------------------------------
-- Style ORIGINAL controls IN PLACE first.
-- Any UICorner/UIStroke creation happens before the final reparent operation.
-- -------------------------------------------------------------------------
local USELESS_PATTERNS = {
    "session:", "progress:", "crafting:", "fishing:", "god mode:",
    "selected bosses:", "catalog:", "scan:", "streaming ",
    "boss page ", "waiting for", "recoveries:", "phase=",
}

local function buttonAncestor(obj, stopAt)
    local p = obj.Parent
    while p and p ~= stopAt do
        if p:IsA("TextButton") then return p end
        p = p.Parent
    end
end

local function shouldHideLabel(label, section)
    local text = tostring(label.Text or "")
    local l = lower(text)

    if text == "" then return false end
    if buttonAncestor(label, section) then return false end

    for _, p in ipairs(USELESS_PATTERNS) do
        if string.find(l, p, 1, true) then return true end
    end

    local commaCount = 0
    text:gsub(",", function() commaCount += 1 end)
    if #text > 80 and commaCount >= 4 then return true end

    -- Descriptions/status paragraphs are removed; control names remain.
    if #text > 48 then return true end

    return false
end

local function styleSection(section)
    if not section or not section.Parent then return end

    section.BackgroundColor3 = C.panel
    section.BackgroundTransparency = 0
    section.BorderSizePixel = 0
    section.ClipsDescendants = false
    corner(section, 12)
    stroke(section, .08)

    local firstTitle
    for _, child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and child.Text ~= "" then
            firstTitle = child
            break
        end
    end

    for _, obj in ipairs(section:GetDescendants()) do
        translate(obj)

        if obj:IsA("TextLabel") then
            if obj == firstTitle then
                obj.Font = Enum.Font.GothamBold
                obj.TextSize = 11
                obj.TextColor3 = C.text
                obj.TextXAlignment = Enum.TextXAlignment.Left
                obj.TextWrapped = false
                obj.TextTruncate = Enum.TextTruncate.AtEnd
            elseif shouldHideLabel(obj, section) then
                hiddenText[obj] = true
                obj.Visible = false
            else
                obj.Font = Enum.Font.GothamMedium
                obj.TextSize = math.clamp(obj.TextSize, 9, 11)
                obj.TextColor3 = C.muted
                obj.TextWrapped = false
                obj.TextTruncate = Enum.TextTruncate.AtEnd
            end

        elseif obj:IsA("TextButton") then
            obj.Active = true
            obj.Selectable = true
            obj.AutoButtonColor = false
            obj.BorderSizePixel = 0

            if obj.Text ~= "" then
                obj.Font = Enum.Font.GothamMedium
                obj.TextSize = 10
                obj.TextColor3 = C.text
                obj.TextWrapped = false
                obj.TextTruncate = Enum.TextTruncate.AtEnd
                obj.BackgroundColor3 = C.control
                obj.BackgroundTransparency = 0
                corner(obj, 7)
                stroke(obj, .14)
            else
                obj.BackgroundTransparency = 1
                -- Native toggle row: keep the full row as the click target.
                local label = obj:FindFirstChildWhichIsA("TextLabel")
                if label then
                    label.Font = Enum.Font.GothamMedium
                    label.TextSize = 10
                    label.TextColor3 = C.text
                    label.TextWrapped = false
                    label.TextTruncate = Enum.TextTruncate.AtEnd
                end
            end

        elseif obj:IsA("TextBox") then
            obj.Active = true
            obj.Selectable = true
            obj.BorderSizePixel = 0
            obj.BackgroundColor3 = C.control
            obj.BackgroundTransparency = 0
            obj.Font = Enum.Font.GothamMedium
            obj.TextSize = 10
            obj.TextColor3 = C.text
            obj.PlaceholderColor3 = C.dim
            obj.TextWrapped = false
            corner(obj, 7)
            stroke(obj, .14)

        elseif obj:IsA("ScrollingFrame") then
            obj.BackgroundTransparency = 1
            obj.BorderSizePixel = 0
            obj.ScrollBarThickness = 2
            obj.ScrollBarImageColor3 = C.dim

        elseif obj:IsA("UIStroke") then
            obj.Color = C.border
        elseif obj:IsA("ImageLabel") or obj:IsA("ImageButton") then
            -- Monochrome icon style.
            obj.ImageColor3 = C.muted
        elseif obj:IsA("Frame") then
            local n = obj.Name or ""
            if string.find(n, "SWITCH", 1, true) then
                obj.BackgroundColor3 = C.control
                local knob = obj:FindFirstChildWhichIsA("Frame")
                if knob then knob.BackgroundColor3 = C.white end
            end
        end
    end
end

for _, section in ipairs(sections) do
    styleSection(section)
end

-- Let the production DescendantAdded styling callbacks consume the styling additions.
task.wait(.25)

-- -------------------------------------------------------------------------
-- New shell. It contains only navigation/decorative UI.
-- Native sections will be moved into its columns AFTER styling is complete.
-- -------------------------------------------------------------------------
for child, _ in pairs(directVisibility) do
    if child and child.Parent == main then
        child.Visible = false
    end
end

main.Size = UDim2.fromOffset(960,560)
main.AnchorPoint = Vector2.new(.5,.5)
main.Position = UDim2.fromScale(.5,.5)
main.BackgroundColor3 = C.bg
main.BorderSizePixel = 0
corner(main, 9)
stroke(main, .04)

local scale = main:FindFirstChildOfClass("UIScale")
if not scale then scale = mk("UIScale", main, {Scale=1}) end

local root = mk("Frame", main, {
    Name="A7DEV_PS2_BLACKLIGHT_TEST_V6",
    Size=UDim2.fromScale(1,1),
    BackgroundColor3=C.bg,
    BorderSizePixel=0,
    Active=false,
    ZIndex=100,
})
corner(root, 9)

local function viewport()
    local cam = workspace.CurrentCamera
    return cam and cam.ViewportSize or Vector2.new(1280,720)
end

local maximized=false
local function fit()
    if maximized then return end
    local vp=viewport()
    scale.Scale=math.max(.2,math.min(1,(vp.X-10)/960,(vp.Y-10)/560))
    main.Position=UDim2.fromOffset(vp.X/2,vp.Y/2)
end
fit()

local top = mk("Frame", root, {
    Position=UDim2.fromOffset(0,0),
    Size=UDim2.new(1,0,0,56),
    BackgroundColor3=C.top,
    BorderSizePixel=0,
    Active=true,
    ZIndex=110,
})
mk("Frame", top, {
    Position=UDim2.new(0,0,1,-1),
    Size=UDim2.new(1,0,0,1),
    BackgroundColor3=C.border2,
    BorderSizePixel=0,
    ZIndex=111,
})

local logo=mk("TextLabel",top,{
    Position=UDim2.fromOffset(20,0),Size=UDim2.fromOffset(46,56),
    BackgroundTransparency=1,Text="A7",Font=Enum.Font.GothamBold,TextSize=18,
    TextColor3=C.text,AutoLocalize=false,ZIndex=112,
})

local primaryOrder={"INFO","MAIN","PLAYER","SERVER","SETTINGS"}
local primaryIcons={
    INFO="rbxassetid://7733960981",
    MAIN="rbxassetid://7733674079",
    PLAYER="rbxassetid://7743875962",
    SERVER="rbxassetid://7733992789",
    SETTINGS="rbxassetid://7734053495",
}
local primaryButtons={}
local px={76,154,250,350,446}
local pw={70,84,92,90,104}

for i,key in ipairs(primaryOrder) do
    local b=mk("TextButton",top,{
        Position=UDim2.fromOffset(px[i],9),Size=UDim2.fromOffset(pw[i],38),
        BackgroundColor3=C.active,BackgroundTransparency=1,BorderSizePixel=0,
        AutoButtonColor=false,Text="",Active=true,Selectable=true,ZIndex=112,
    })
    corner(b,9)
    local icon=mk("ImageLabel",b,{
        Position=UDim2.fromOffset(9,10),Size=UDim2.fromOffset(18,18),
        BackgroundTransparency=1,Image=primaryIcons[key],ImageColor3=C.dim,
        ScaleType=Enum.ScaleType.Fit,ZIndex=113,
    })
    local tx=mk("TextLabel",b,{
        Position=UDim2.fromOffset(33,0),Size=UDim2.new(1,-36,1,0),
        BackgroundTransparency=1,Text=key,Font=Enum.Font.GothamBold,TextSize=10,
        TextColor3=C.dim,TextXAlignment=Enum.TextXAlignment.Left,
        AutoLocalize=false,ZIndex=113,
    })
    primaryButtons[key]={button=b,icon=icon,text=tx}
end

local search=mk("TextBox",top,{
    Position=UDim2.new(1,-305,0,10),Size=UDim2.fromOffset(188,36),
    BackgroundColor3=C.control,BorderSizePixel=0,ClearTextOnFocus=false,
    PlaceholderText="Search...",PlaceholderColor3=C.dim,Text="",TextColor3=C.text,
    Font=Enum.Font.GothamMedium,TextSize=10,TextXAlignment=Enum.TextXAlignment.Left,
    AutoLocalize=false,Active=true,Selectable=true,ZIndex=113,
})
corner(search,9);stroke(search,.12)
mk("UIPadding",search,{PaddingLeft=UDim.new(0,12),PaddingRight=UDim.new(0,10)})

local function windowButton(text,right)
    local b=mk("TextButton",top,{
        Position=UDim2.new(1,right,0,11),Size=UDim2.fromOffset(32,32),
        BackgroundColor3=C.control,BorderSizePixel=0,AutoButtonColor=false,
        Text=text,Font=Enum.Font.GothamBold,TextSize=13,TextColor3=C.muted,
        AutoLocalize=false,Active=true,Selectable=true,ZIndex=114,
    })
    corner(b,8);stroke(b,.16)
    return b
end

local minimize=windowButton("−",-111)
local maximize=windowButton("↗",-74)
local close=windowButton("×",-37)

local subbar=mk("Frame",root,{
    Position=UDim2.fromOffset(0,56),Size=UDim2.new(1,0,0,42),
    BackgroundColor3=C.bg,BorderSizePixel=0,Active=false,ZIndex=105,
})
mk("Frame",subbar,{
    Position=UDim2.new(0,0,1,-1),Size=UDim2.new(1,0,0,1),
    BackgroundColor3=C.border2,BorderSizePixel=0,ZIndex=106,
})

local content=mk("Frame",root,{
    Position=UDim2.fromOffset(0,98),Size=UDim2.new(1,0,1,-123),
    BackgroundColor3=C.bg,BorderSizePixel=0,Active=false,
    ClipsDescendants=true,ZIndex=101,
})

local footer=mk("Frame",root,{
    Position=UDim2.new(0,0,1,-25),Size=UDim2.new(1,0,0,25),
    BackgroundColor3=C.top,BorderSizePixel=0,Active=false,ZIndex=108,
})
mk("Frame",footer,{Size=UDim2.new(1,0,0,1),BackgroundColor3=C.border2,BorderSizePixel=0,ZIndex=109})
mk("TextLabel",footer,{
    Position=UDim2.fromOffset(16,1),Size=UDim2.fromOffset(280,23),
    BackgroundTransparency=1,Text="A7DEV HUB · Slayers 2",Font=Enum.Font.GothamMedium,
    TextSize=8,TextColor3=C.dim,TextXAlignment=Enum.TextXAlignment.Left,
    AutoLocalize=false,ZIndex=109,
})
mk("TextLabel",footer,{
    Position=UDim2.new(1,-180,0,1),Size=UDim2.fromOffset(165,23),
    BackgroundTransparency=1,Text="LeftControl · menu",Font=Enum.Font.GothamMedium,
    TextSize=8,TextColor3=C.dim,TextXAlignment=Enum.TextXAlignment.Right,
    AutoLocalize=false,ZIndex=109,
})

local pages={}
local pageColumns={}
local pageSections={}

local pageIds={
    "INFO",
    "MAIN:Settings","MAIN:Farming","MAIN:Dungeon","MAIN:Progression","MAIN:Spin","MAIN:Misc",
    "PLAYER:Combat","PLAYER:Visuals","PLAYER:Movement","PLAYER:Travel",
    "SERVER","SETTINGS",
}

local function createPage(id)
    local page=mk("ScrollingFrame",content,{
        Name="A7DEV_NATIVE_PAGE_"..id:gsub("[^%w]","_"),
        Size=UDim2.fromScale(1,1),BackgroundTransparency=1,BorderSizePixel=0,
        CanvasSize=UDim2.new(),AutomaticCanvasSize=Enum.AutomaticSize.Y,
        ScrollBarThickness=2,ScrollBarImageColor3=C.dim,
        ScrollingDirection=Enum.ScrollingDirection.Y,Visible=false,
        Active=true,ZIndex=102,
    })

    local cols={}
    local positions={
        UDim2.new(0,18,0,17),
        UDim2.new(1/3,7,0,17),
        UDim2.new(2/3,-4,0,17),
    }

    for i=1,3 do
        local col=mk("Frame",page,{
            Position=positions[i],Size=UDim2.new(1/3,-21,0,0),
            AutomaticSize=Enum.AutomaticSize.Y,BackgroundTransparency=1,
            BorderSizePixel=0,Active=false,ZIndex=103,
        })
        mk("UIListLayout",col,{SortOrder=Enum.SortOrder.LayoutOrder,Padding=UDim.new(0,13)})
        cols[i]=col
    end

    pages[id]=page
    pageColumns[id]=cols
    pageSections[id]={}
end

for _,id in ipairs(pageIds) do createPage(id) end

local ROUTE={
    ["Section_Farm Position"]={"MAIN:Settings",1,10,"Farm Config"},
    ["Section_Farm Safety + Session"]={"MAIN:Settings",2,10,"Safety"},
    ["Section_Defense"]={"MAIN:Settings",3,10,"Defence"},

    ["Section_Farm Automation"]={"MAIN:Farming",1,10,"Farming"},
    ["Section_Target Filter"]={"MAIN:Farming",1,20,"Targets"},
    ["Section_Boss Automation"]={"MAIN:Farming",2,10,"Boss Farm"},
    ["Section_Yeti"]={"MAIN:Farming",2,20,"Yeti"},
    ["Section_Boss Actions"]={"MAIN:Farming",2,30,"Boss Actions"},
    ["Section_Boss Selection"]={"MAIN:Farming",3,10,"Boss Selection"},
    ["Section_Boss List"]={"MAIN:Farming",3,20,"Boss List"},

    ["Section_Dungeon + Souls"]={"MAIN:Dungeon",1,10,"Dungeon"},

    ["Section_Quest Assist"]={"MAIN:Progression",1,10,"Quest Assist"},
    ["Section_Slayer Crow"]={"MAIN:Progression",1,20,"Slayer Crow"},
    ["Section_Muzan Quest"]={"MAIN:Progression",1,30,"Muzan Quest"},
    ["Section_Training Quests"]={"MAIN:Progression",2,10,"Training"},
    ["Section_Race Automation"]={"MAIN:Progression",2,20,"Race"},
    ["Section_Winter Lantern"]={"MAIN:Progression",2,30,"Winter Lantern"},
    ["Section_Quest Manager"]={"MAIN:Progression",3,10,"Quest Manager"},
    ["Section_Muzan"]={"MAIN:Progression",3,20,"Muzan"},
    ["Section_Mastery"]={"MAIN:Progression",3,30,"Mastery"},

    ["Section_Clan Spins"]={"MAIN:Spin",1,10,"Clan Spins"},

    ["Section_Chest + Loot"]={"MAIN:Misc",1,10,"Loot"},
    ["Section_Inventory Helper"]={"MAIN:Misc",1,20,"Inventory"},
    ["Section_Crafting / Alchemy"]={"MAIN:Misc",2,10,"Crafting"},
    ["Section_Auto Sell"]={"MAIN:Misc",2,20,"Auto Sell"},
    ["Section_Fishing"]={"MAIN:Misc",3,10,"Fishing"},
    ["Section_Utilities"]={"MAIN:Misc",3,20,"Utilities"},

    ["Section_Native Actions"]={"PLAYER:Combat",1,10,"Combat"},
    ["Section_Player Farm"]={"PLAYER:Combat",2,10,"Player Farm"},
    ["Section_Visuals"]={"PLAYER:Visuals",1,10,"Visuals"},
    ["Section_Movement"]={"PLAYER:Movement",1,10,"Movement"},
    ["Section_Fly"]={"PLAYER:Movement",2,10,"Fly"},
    ["Section_Horse"]={"PLAYER:Movement",3,10,"Horse"},
    ["Section_Regions"]={"PLAYER:Travel",1,10,"Regions"},
    ["Section_NPC / Trainer"]={"PLAYER:Travel",2,10,"NPC / Trainer"},
    ["Section_Game Systems"]={"PLAYER:Travel",2,20,"Game Systems"},
    ["Section_Activities"]={"PLAYER:Travel",3,10,"Activities"},

    ["Section_Config"]={"SETTINGS",1,10,"Configs"},
}

local function setSectionTitle(section,title)
    if not title then return end
    for _,child in ipairs(section:GetChildren()) do
        if child:IsA("TextLabel") and child.Text ~= "" then
            child.Text=title
            child.AutoLocalize=false
            child.Font=Enum.Font.GothamBold
            child.TextSize=11
            child.TextColor3=C.text
            break
        end
    end
end

local function route(section)
    if not section or not section.Parent then return end
    if section.Name=="Section_Diagnostics" or section.Name=="Section_Live Boss Scanner" then
        section.Visible=false
        return
    end

    local info=ROUTE[section.Name] or {"MAIN:Misc",3,900,(section.Name:gsub("^Section_",""))}
    local id,col,order,title=info[1],info[2],info[3],info[4]
    local target=pageColumns[id] and pageColumns[id][col]
    if not target then return end

    section.Parent=target
    section.Position=UDim2.new()
    section.Size=UDim2.new(1,0,section.Size.Y.Scale,section.Size.Y.Offset)
    section.LayoutOrder=order
    section.Visible=true
    section.ClipsDescendants=false
    setSectionTitle(section,title)
    pageSections[id][section]=true
    moved[section]=true
end

-- FINAL reparent. No new descendants are inserted in sections after this point.
for _,section in ipairs(sections) do route(section) end

-- Lightweight custom cards; these are NOT native sections and cannot affect runtime relocation.
local function card(pageId,col,title,height,order)
    local f=mk("Frame",pageColumns[pageId][col],{
        Size=UDim2.new(1,0,0,height),BackgroundColor3=C.panel,BorderSizePixel=0,
        LayoutOrder=order or -1000,Active=false,ZIndex=104,
    })
    corner(f,12);stroke(f,.08)
    mk("TextLabel",f,{
        Position=UDim2.fromOffset(14,7),Size=UDim2.new(1,-28,0,24),
        BackgroundTransparency=1,Text=title,Font=Enum.Font.GothamBold,
        TextSize=11,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left,
        AutoLocalize=false,ZIndex=105,
    })
    return f
end

local function row(card,y,left,right)
    mk("TextLabel",card,{
        Position=UDim2.fromOffset(14,y),Size=UDim2.new(.58,-14,0,22),
        BackgroundTransparency=1,Text=left,Font=Enum.Font.GothamMedium,
        TextSize=10,TextColor3=C.text,TextXAlignment=Enum.TextXAlignment.Left,
        AutoLocalize=false,ZIndex=105,
    })
    mk("TextLabel",card,{
        Position=UDim2.new(.58,0,0,y),Size=UDim2.new(.42,-14,0,22),
        BackgroundTransparency=1,Text=right,Font=Enum.Font.GothamMedium,
        TextSize=9,TextColor3=C.muted,TextXAlignment=Enum.TextXAlignment.Right,
        AutoLocalize=false,ZIndex=105,
    })
end

local info=card("INFO",1,"Information",130)
row(info,42,"Hub","A7DEV HUB")
row(info,67,"Game","Slayers 2")
row(info,92,"UI","BlackLight")

local menu=card("INFO",2,"Menu",130)
row(menu,42,"Menu Bind","LeftControl")
row(menu,67,"Search","Enabled")
row(menu,92,"Build","TEST")

local server=card("SERVER",1,"Server",196)

local function action(parent,y,text,callback)
    local b=mk("TextButton",parent,{
        Position=UDim2.fromOffset(14,y),Size=UDim2.new(1,-28,0,32),
        BackgroundColor3=C.control,BorderSizePixel=0,AutoButtonColor=false,
        Text=text,Font=Enum.Font.GothamMedium,TextSize=10,TextColor3=C.text,
        AutoLocalize=false,Active=true,Selectable=true,ZIndex=106,
    })
    corner(b,7);stroke(b,.14)
    on(b.Activated:Connect(callback))
    return b
end

action(server,39,"Rejoin",function()
    pcall(function()
        if game.JobId~="" then
            TeleportService:TeleportToPlaceInstance(game.PlaceId,game.JobId,LocalPlayer)
        else
            TeleportService:Teleport(game.PlaceId,LocalPlayer)
        end
    end)
end)

action(server,77,"Copy Job ID",function()
    local clip=setclipboard or toclipboard
    if clip then pcall(clip,game.JobId) end
end)

local job=mk("TextBox",server,{
    Position=UDim2.fromOffset(14,115),Size=UDim2.new(1,-28,0,30),
    BackgroundColor3=C.control,BorderSizePixel=0,ClearTextOnFocus=false,
    PlaceholderText="Job ID...",PlaceholderColor3=C.dim,Text="",TextColor3=C.text,
    Font=Enum.Font.GothamMedium,TextSize=10,TextXAlignment=Enum.TextXAlignment.Left,
    AutoLocalize=false,Active=true,Selectable=true,ZIndex=106,
})
corner(job,7);stroke(job,.14)
mk("UIPadding",job,{PaddingLeft=UDim.new(0,10),PaddingRight=UDim.new(0,10)})

action(server,151,"Join Job",function()
    local id=tostring(job.Text or ""):match("^%s*(.-)%s*$")
    if id~="" then
        pcall(function() TeleportService:TeleportToPlaceInstance(game.PlaceId,id,LocalPlayer) end)
    end
end)

local interface=card("SETTINGS",2,"Interface",130)
row(interface,42,"Menu Bind","LeftControl")
row(interface,67,"Theme","BlackLight")
row(interface,92,"Language","English")

-- Navigation.
local SUB={
    MAIN={"Settings","Farming","Dungeon","Progression","Spin","Misc"},
    PLAYER={"Combat","Visuals","Movement","Travel"},
}

local currentPrimary="MAIN"
local currentSub="Settings"
local currentPage="MAIN:Settings"
local subButtons={}

local function pageId(primary,sub)
    if primary=="MAIN" or primary=="PLAYER" then return primary..":"..sub end
    return primary
end

local function sectionMatches(section,q)
    if q=="" then return true end
    if string.find(lower(section.Name),q,1,true) then return true end
    for _,d in ipairs(section:GetDescendants()) do
        if d:IsA("TextLabel") or d:IsA("TextButton") then
            if string.find(lower(d.Text),q,1,true) then return true end
        elseif d:IsA("TextBox") then
            if string.find(lower(d.Text.." "..d.PlaceholderText),q,1,true) then return true end
        end
    end
    return false
end

local function filter()
    local q=lower(search.Text):match("^%s*(.-)%s*$")
    local set=pageSections[currentPage]
    if not set then return end
    for section in pairs(set) do
        if section.Parent then section.Visible=sectionMatches(section,q) end
    end
end

local selectView

local function rebuildSub(primary,selected)
    for _,o in ipairs(subbar:GetChildren()) do
        if o:IsA("TextButton") then o:Destroy() end
    end
    table.clear(subButtons)

    local tabs=SUB[primary]
    if not tabs then return end

    local x=18
    for _,name in ipairs(tabs) do
        local w=math.max(70,#name*7+24)
        local b=mk("TextButton",subbar,{
            Position=UDim2.fromOffset(x,7),Size=UDim2.fromOffset(w,28),
            BackgroundColor3=C.active,BackgroundTransparency=name==selected and 0 or 1,
            BorderSizePixel=0,AutoButtonColor=false,Text=name,
            Font=Enum.Font.GothamMedium,TextSize=9,
            TextColor3=name==selected and C.text or C.muted,
            AutoLocalize=false,Active=true,Selectable=true,ZIndex=107,
        })
        corner(b,8)
        subButtons[name]=b
        x+=w+6
    end

    for name,b in pairs(subButtons) do
        on(b.Activated:Connect(function() selectView(primary,name) end))
    end
end

selectView=function(primary,sub)
    currentPrimary=primary
    local tabs=SUB[primary]
    if tabs then
        local valid=false
        for _,name in ipairs(tabs) do if name==sub then valid=true break end end
        if not valid then sub=tabs[1] end
    else
        sub=nil
    end

    currentSub=sub
    currentPage=pageId(primary,sub)

    local hasSub=tabs~=nil
    subbar.Visible=hasSub
    if hasSub then
        content.Position=UDim2.fromOffset(0,98)
        content.Size=UDim2.new(1,0,1,-123)
        rebuildSub(primary,sub)
    else
        content.Position=UDim2.fromOffset(0,56)
        content.Size=UDim2.new(1,0,1,-81)
        for _,o in ipairs(subbar:GetChildren()) do
            if o:IsA("TextButton") then o:Destroy() end
        end
    end

    for id,page in pairs(pages) do page.Visible=id==currentPage end

    for key,item in pairs(primaryButtons) do
        local active=key==primary
        item.button.BackgroundTransparency=active and 0 or 1
        item.icon.ImageColor3=active and C.text or C.dim
        item.text.TextColor3=active and C.text or C.dim
    end

    filter()
end

for key,item in pairs(primaryButtons) do
    on(item.button.Activated:Connect(function()
        local tabs=SUB[key]
        selectView(key,tabs and tabs[1] or nil)
    end))
end

on(search:GetPropertyChangedSignal("Text"):Connect(filter))

-- Dynamic runtime additions: property-style first, then final route.
-- This runs after the production connection and wins the reparent race without
-- inserting any new descendants into a moved section.
on(gui.DescendantAdded:Connect(function(obj)
    if not running or not obj.Parent then return end

    local section=obj
    while section and section~=gui do
        if section:IsA("Frame") and string.sub(section.Name,1,8)=="Section_" then break end
        section=section.Parent
    end

    if section and section~=gui then
        task.defer(function()
            if running and section.Parent then
                -- Property-only update for new controls.
                translate(obj)
                if obj:IsA("TextLabel") then
                    if shouldHideLabel(obj,section) then obj.Visible=false
                    else
                        obj.Font=Enum.Font.GothamMedium
                        obj.TextSize=math.clamp(obj.TextSize,9,11)
                        obj.TextWrapped=false
                        obj.TextTruncate=Enum.TextTruncate.AtEnd
                    end
                elseif obj:IsA("TextButton") then
                    obj.Active=true
                    obj.Selectable=true
                    obj.AutoButtonColor=false
                    if obj.Text~="" then
                        obj.Font=Enum.Font.GothamMedium
                        obj.TextSize=10
                        obj.TextWrapped=false
                        obj.TextTruncate=Enum.TextTruncate.AtEnd
                    end
                elseif obj:IsA("TextBox") then
                    obj.Active=true
                    obj.Selectable=true
                    obj.Font=Enum.Font.GothamMedium
                    obj.TextSize=10
                    obj.TextWrapped=false
                end
                route(section)
            end
        end)
    elseif obj:IsA("Frame") and string.sub(obj.Name,1,8)=="Section_" then
        task.defer(function()
            if running and obj.Parent then
                styleSection(obj)
                task.wait()
                route(obj)
            end
        end)
    end
end))

-- Drag window.
local dragging,dragStart,startPos
on(top.InputBegan:Connect(function(input)
    if input.UserInputType~=Enum.UserInputType.MouseButton1 and input.UserInputType~=Enum.UserInputType.Touch then return end
    if input.Position.X>=search.AbsolutePosition.X-4 then return end
    dragging=input
    dragStart=input.Position
    startPos=main.Position
end))
on(UserInputService.InputChanged:Connect(function(input)
    if not dragging then return end
    if dragging.UserInputType==Enum.UserInputType.MouseButton1 and input.UserInputType~=Enum.UserInputType.MouseMovement then return end
    if dragging.UserInputType==Enum.UserInputType.Touch and input~=dragging then return end
    local d=input.Position-dragStart
    main.Position=UDim2.new(startPos.X.Scale,startPos.X.Offset+d.X,startPos.Y.Scale,startPos.Y.Offset+d.Y)
end))
on(UserInputService.InputEnded:Connect(function(input)
    if input==dragging or (dragging and dragging.UserInputType==Enum.UserInputType.MouseButton1 and input.UserInputType==Enum.UserInputType.MouseButton1) then
        dragging=nil
    end
end))

local mini=mk("TextButton",gui,{
    Name="A7DEV_PS2_NATIVE_MINI",Position=UDim2.new(1,-58,0,14),
    Size=UDim2.fromOffset(44,36),BackgroundColor3=C.control,BorderSizePixel=0,
    AutoButtonColor=false,Text="A7",Font=Enum.Font.GothamBold,TextSize=11,
    TextColor3=C.text,AutoLocalize=false,Active=true,Selectable=true,
    Visible=false,ZIndex=1000,
})
corner(mini,9);stroke(mini,.1)

local minimized=false
local function setMinimized(v)
    minimized=v==true
    root.Visible=not minimized
    mini.Visible=minimized
end

on(minimize.Activated:Connect(function() setMinimized(true) end))
on(mini.Activated:Connect(function() setMinimized(false) end))

on(maximize.Activated:Connect(function()
    maximized=not maximized
    if maximized then
        local vp=viewport()
        scale.Scale=1
        main.Size=UDim2.fromOffset(math.max(960,vp.X-8),math.max(560,vp.Y-8))
        main.Position=UDim2.fromOffset(vp.X/2,vp.Y/2)
        maximize.Text="↙"
    else
        main.Size=UDim2.fromOffset(960,560)
        maximize.Text="↗"
        fit()
    end
end))

local function restore()
    for section,info in pairs(original) do
        if section and section.Parent and info.parent and info.parent.Parent then
            pcall(function()
                section.Parent=info.parent
                section.LayoutOrder=info.layoutOrder
                section.Size=info.size
                section.Position=info.position
                section.Visible=info.visible
                section.AutomaticSize=info.automaticSize
            end)
        end
    end
    for child,vis in pairs(directVisibility) do
        if child and child.Parent==main then pcall(function() child.Visible=vis end) end
    end
end

local function stopNative(restoreOld)
    if not running then return end
    running=false
    for _,c in ipairs(conns) do pcall(function() c:Disconnect() end) end
    table.clear(conns)
    if mini and mini.Parent then mini:Destroy() end
    if root and root.Parent then root:Destroy() end
    if restoreOld then restore() end
    ENV.A7DEV_PS2_BLACKLIGHT_NATIVE_STOP=nil
end
ENV.A7DEV_PS2_BLACKLIGHT_NATIVE_STOP=function() stopNative(true) end

on(close.Activated:Connect(function()
    local state=ENV.A7DEV_PROJECT_SLAYER_2
    local destroyed=false
    if state and type(state.Destroy)=="function" then
        destroyed=pcall(state.Destroy)
    elseif state and state.Runtime and type(state.Runtime.destroyAll)=="function" then
        destroyed=pcall(state.Runtime.destroyAll)
    end
    if destroyed then stopNative(false)
    else
        stopNative(true)
        pcall(function() gui:Destroy() end)
    end
end))

on(UserInputService.InputBegan:Connect(function(input,processed)
    if processed then return end
    if input.KeyCode==Enum.KeyCode.LeftControl then setMinimized(not minimized) end
end))

if workspace.CurrentCamera then
    on(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
        task.defer(fit)
    end))
end

selectView("MAIN","Settings")
