local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local sessionStarted=os.clock()
local discordUrl="https://discord.gg/WZDy4DrGV"
local localPlayer = Players.LocalPlayer or Players.PlayerAdded:Wait()
local playerGui = localPlayer:WaitForChild("PlayerGui")
local ENV=(getgenv and getgenv()) or _G

-- Find the live Slayer 2 GUI BEFORE stopping any previous visual shell.
local slayerGui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
if not slayerGui then
 for _=1,300 do
  slayerGui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
  if slayerGui then break end
  task.wait(.1)
 end
end
if not slayerGui then
 warn("[A7DEV REFERENCE V17] Slayer 2 GUI not found")
 return
end

local legacyMain=slayerGui:FindFirstChild("Main")
if not legacyMain then
 warn("[A7DEV REFERENCE V17] Slayer 2 Main frame not found")
 return
end

-- IMPORTANT:
-- Older BlackLight shells physically re-parent the real native Section_* controls.
-- Their stop routine destroys its shell before restoring those sections. If we call it
-- directly, the gameplay controls can be destroyed with the old shell.
-- Evacuate every live native section first so callbacks/instances survive cleanup.
local evac=Instance.new("Frame")
evac.Name="A7DEV_PS2_REFERENCE_V17_EVAC"
evac.BackgroundTransparency=1
evac.Size=UDim2.fromOffset(1,1)
evac.Visible=false
evac.Parent=slayerGui

local evacuated={}
for _,object in ipairs(slayerGui:GetDescendants()) do
 if object:IsA("Frame") and string.sub(object.Name or "",1,8)=="Section_" then
  evacuated[#evacuated+1]=object
 end
end
for _,section in ipairs(evacuated) do
 if section and section.Parent then
  pcall(function() section.Parent=evac end)
 end
end

-- Now previous visual layers can be stopped safely.
for _,key in ipairs({
 "A7DEV_PS2_REFERENCE_V17_STOP",
 "A7DEV_PS2_REFERENCE_V16_STOP",
 "A7DEV_PS2_REFERENCE_V15_STOP",
 "A7DEV_PS2_REFERENCE_V14_STOP",
 "A7DEV_PS2_REFERENCE_V13_STOP",
 "A7DEV_PS2_REFERENCE_V12_STOP",
 "A7DEV_PS2_REFERENCE_V11_STOP",
 "A7DEV_PS2_REFERENCE_V10_STOP",
 "A7DEV_PS2_REFERENCE_V9_STOP",
 "A7DEV_PS2_REFERENCE_V8_STOP",
 "A7DEV_PS2_REFERENCE_V7_STOP",
 "A7DEV_PS2_REFERENCE_V6_STOP",
 "A7DEV_PS2_REFERENCE_V5_STOP",
 "A7DEV_PS2_REFERENCE_V4_STOP",
 "A7DEV_PS2_REFERENCE_V3_STOP",
 "A7DEV_PS2_BLUE_TEST_V1_STOP",
 "A7DEV_PS2_A7BLUE_FULL_V2_STOP",
 "A7DEV_PS2_REF_V18_STOP",
 "A7DEV_PS2_BLACKLIGHT_V7_STOP",
 "A7DEV_PS2_BLACKLIGHT_TEST_STOP",
}) do
 if type(ENV[key])=="function" then pcall(ENV[key]) end
end
task.wait(.12)

-- A failed older TEST may have created its shell before reaching STOP registration.
-- Native Section_* instances are already safe in evac, so stale visual roots can be removed.
for _,child in ipairs(slayerGui:GetChildren()) do
 if child~=evac and child~=legacyMain then
  local n=tostring(child.Name or "")
  if string.sub(n,1,23)=="A7DEV_PS2_REFERENCE_V" then
   pcall(function() child:Destroy() end)
  end
 end
end

local legacyMainVisible=legacyMain.Visible
local nativeState={}
local nativeSections={}
local nativeContentState=setmetatable({}, {__mode="k"})
local seenSections=setmetatable({}, {__mode="k"})

local function captureSection(section)
 if not section or seenSections[section] then return end
 seenSections[section]=true

 local parent=section.Parent
 if parent==evac or not parent then
  parent=legacyMain
 end

 nativeState[section]={
  parent=parent,
  position=section.Position,
  size=section.Size,
  layoutOrder=section.LayoutOrder,
  automaticSize=section.AutomaticSize,
  visible=section.Visible,
  zindex=section.ZIndex,
 }
 nativeSections[#nativeSections+1]=section
end

-- Prefer the original/native hierarchy after old-shell restore.
for _,object in ipairs(legacyMain:GetDescendants()) do
 if object:IsA("Frame") and string.sub(object.Name or "",1,8)=="Section_" then
  captureSection(object)
 end
end
-- Keep any section an older shell failed to restore.
for _,section in ipairs(evacuated) do
 if section and section.Parent then captureSection(section) end
end
-- Catch sections that may live elsewhere in the ScreenGui.
for _,object in ipairs(slayerGui:GetDescendants()) do
 if object:IsA("Frame") and string.sub(object.Name or "",1,8)=="Section_" then
  captureSection(object)
 end
end

if #nativeSections==0 then
 warn("[A7DEV REFERENCE V17] No native Slayer 2 sections were recovered")
 if evac and evac.Parent then evac:Destroy() end
 return
end

-- Remove stale reference-only shells after controls are safe.
for _,name in ipairs({
 "A7DEV_PS2_REFERENCE_V17","A7DEV_PS2_REFERENCE_V17_REOPEN",
 "A7DEV_PS2_REFERENCE_V3","A7DEV_PS2_REFERENCE_V3_REOPEN",
}) do
 local old=slayerGui:FindFirstChild(name)
 if old then pcall(function() old:Destroy() end) end
end
for i=1,4 do
 for _,prefixName in ipairs({"A7DEV_PS2_REFERENCE_V17_SHADOW","A7DEV_PS2_REFERENCE_V3_SHADOW"}) do
  local old=slayerGui:FindFirstChild(prefixName..i)
  if old then pcall(function() old:Destroy() end) end
 end
end

local C = {
 background = Color3.fromRGB(6,11,18), panel = Color3.fromRGB(8,15,25),
 row = Color3.fromRGB(11,21,35), stroke = Color3.fromRGB(25,46,75),
 blue = Color3.fromRGB(0,110,255), bright = Color3.fromRGB(57,158,255),
 text = Color3.fromRGB(228,239,255), muted = Color3.fromRGB(145,178,220),
 icon = Color3.fromRGB(122,180,255),
}
local function create(class, parent, props)
 local o = Instance.new(class)
 for key, value in pairs(props or {}) do o[key] = value end
 o.Parent = parent
 return o
end
local function round(o, r) create("UICorner", o, {CornerRadius = UDim.new(0, r)}) end
local function border(o, color, transparency)
 return create("UIStroke", o, {Color = color or C.stroke, Thickness = 1.3, Transparency = transparency or 0, ApplyStrokeMode = Enum.ApplyStrokeMode.Border})
end
local function gradient(o, a, b, rotation)
 create("UIGradient", o, {Color = ColorSequence.new(a, b), Rotation = rotation or 90})
end
local function frame(parent, name, x, y, w, h, color, radius)
 local o = create("Frame", parent, {Name = name, Position = UDim2.fromOffset(x,y), Size = UDim2.fromOffset(w,h), BackgroundColor3 = color or C.panel, BorderSizePixel = 0})
 if radius then round(o, radius) end
 return o
end
local function transparent(parent, name, x,y,w,h)
 local o = frame(parent,name,x,y,w,h)
 o.BackgroundTransparency = 1
 return o
end
local function label(parent, text, x,y,w,h,size,color,bold)
 return create("TextLabel",parent,{BackgroundTransparency=1,Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),Text=text,TextColor3=color or C.text,TextSize=size,Font=bold and Enum.Font.GothamMedium or Enum.Font.Gotham,TextXAlignment=Enum.TextXAlignment.Left,BorderSizePixel=0})
end
local function button(parent,name,x,y,w,h)
 return create("TextButton",parent,{Name=name,Text="",AutoButtonColor=false,BackgroundTransparency=1,Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h)})
end
local function tween(o, props)
 return TweenService:Create(o,TweenInfo.new(0.18,Enum.EasingStyle.Quad,Enum.EasingDirection.Out),props)
end
local function line(parent,x1,y1,x2,y2,color,width,alpha)
 local dx,dy=x2-x1,y2-y1
 local o=frame(parent,"Line",(x1+x2)/2,(y1+y2)/2,math.sqrt(dx*dx+dy*dy),width or 2,color)
 o.AnchorPoint=Vector2.new(.5,.5)
 o.Rotation=math.deg(math.atan2(dy,dx))
 o.BackgroundTransparency=alpha or 0
 round(o,2)
 return o
end
local function path(parent,points,color,width,closed)
 for i=1,#points-1 do line(parent,points[i][1],points[i][2],points[i+1][1],points[i+1][2],color,width) end
 if closed then line(parent,points[#points][1],points[#points][2],points[1][1],points[1][2],color,width) end
end
local function ring(parent,x,y,d,color,width)
 local o=transparent(parent,"Ring",x,y,d,d)
 round(o,d/2)
 local s=border(o,color)
 s.Thickness=width or 2
 return o
end
local function polygon(parent,points,top,bottom,step)
 local minY,maxY=math.huge,-math.huge
 for _,p in ipairs(points) do minY=math.min(minY,p[2]);maxY=math.max(maxY,p[2]) end
 step=step or 2
 for y=minY,maxY-step/2,step do
  local intersections={}
  local sample=y+step/2
  for i,a in ipairs(points) do
   local b=points[i%#points+1]
   if (a[2]<=sample and b[2]>sample) or (b[2]<=sample and a[2]>sample) then
    table.insert(intersections,a[1]+(sample-a[2])*(b[1]-a[1])/(b[2]-a[2]))
   end
  end
  table.sort(intersections)
  for i=1,#intersections-1,2 do
   frame(parent,"Vector",intersections[i],y,intersections[i+1]-intersections[i],step+.25,top:Lerp(bottom,(y-minY)/math.max(1,maxY-minY)))
  end
 end
end
local function logo(parent,x,y,w,h,dim)
 local box=transparent(parent,"A7Logo",x,y,w,h)
 local function poly(points,top,bottom)
  local p={}
  for _,v in ipairs(points) do table.insert(p,{v[1]*w/200,v[2]*h/150}) end
  polygon(box,p,top or (dim and Color3.fromRGB(23,40,68) or Color3.fromRGB(242,249,255)),bottom or (dim and C.panel or Color3.fromRGB(61,128,245)),math.max(.75,h/160))
 end
 if not dim then
  for _,glow in ipairs({{10,.96},{6,.92},{3,.8}}) do
   line(box,80*w/200,146*h/150,197*w/200,13*h/150,C.blue,glow[1]*w/200,glow[2])
  end
 end
 poly({{0,115},{87,12},{104,89},{91,111},{78,90},{43,91},{33,104}})
 local hole={{57*w/200,70*h/150},{70*w/200,50*h/150},{75*w/200,70*h/150}}
 polygon(box,hole,C.panel,C.panel,1)
 poly({{114,13},{197,13},{80,146},{151,34},{112,34},{103,40},{94,30}})
 if not dim then
  poly({{114,13},{197,13},{190,17},{111,17}},Color3.fromRGB(250,253,255),Color3.fromRGB(173,214,255))
  poly({{0,115},{87,12},{82,24},{7,110}},Color3.fromRGB(211,235,255),Color3.fromRGB(111,171,255))
  line(box,80*w/200,146*h/150,191*w/200,20*h/150,Color3.fromRGB(111,185,255),.8)
 end
 return box
end

local ICONS={
 external={16898613353,257,820},
 home={16898613509,820,147},
 user={16898613869,967,563},
 tools={16898613777,967,759},
 settings={16898613777,771,257},
 cube={16898612819,771,196},
 crown={16898613044,404,918},
 bolt={16898613869,918,906},
 target={16898613044,453,869},
 eye={16898613353,771,563},
 shield={16898613777,869,0},
 gauge={16898613353,771,955},
 search={16898613699,918,857},
 minus={16898613613,771,196},
 square={16898613777,869,710},
 close={16898613869,869,906},
}
local iconImages={}
local function icon(parent,kind,x,y,size,color)
 local asset=assert(ICONS[kind],"Unknown icon: "..kind)
 local image=create("ImageLabel",parent,{
  Name=kind,BackgroundTransparency=1,BorderSizePixel=0,
  Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(size,size),
  Image="rbxassetid://"..tostring(asset[1]),
  ImageRectOffset=Vector2.new(asset[2],asset[3]),
  ImageRectSize=Vector2.new(48,48),
  ImageColor3=color or C.icon,
  ScaleType=Enum.ScaleType.Fit,
  ResampleMode=Enum.ResamplerMode.Default,
 })
 table.insert(iconImages,image)
 return image
end
local gui=slayerGui
pcall(function()
 gui.IgnoreGuiInset=true
 gui.DisplayOrder=30
 gui.ZIndexBehavior=Enum.ZIndexBehavior.Sibling
end)
local shadows={}
for i=1,4 do
 local shadow=frame(gui,"A7DEV_PS2_REFERENCE_V17_SHADOW"..i,0,0,1404,824,Color3.new(0,0,0),24+i*3)
 shadow.BackgroundTransparency=.91
 shadow.ZIndex=1
 table.insert(shadows,shadow)
end
local root=frame(gui,"A7DEV_PS2_REFERENCE_V17",0,0,1404,824,C.background,24)
root.ZIndex=2
root.Active=true
root.BackgroundTransparency=1
gradient(root,Color3.fromRGB(8,15,25),Color3.fromRGB(5,10,17),65)
local uiScale=create("UIScale",root,{Scale=1})
local connections={}
local alive=true
local function connect(signal,fn)
 local c=signal:Connect(fn);table.insert(connections,c);return c
end
local collapsed=false
local compact=false
local initialized=false
local function viewport()
 return workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280,720)
end
local function place(x,y)
 local v=viewport()
 local w=1404*uiScale.Scale
 local h=(collapsed and 94 or 824)*uiScale.Scale
 local margin=10
 root.Position=UDim2.fromOffset(math.clamp(x,margin,math.max(margin,v.X-w-margin)),math.clamp(y,margin,math.max(margin,v.Y-h-margin)))
 for i,shadow in ipairs(shadows) do
  local spread=i*4*uiScale.Scale
  shadow.Position=UDim2.fromOffset(root.Position.X.Offset-spread,root.Position.Y.Offset+7-spread)
  shadow.Size=UDim2.fromOffset(w+spread*2,h+spread*2)
 end
end
local function fit()
 local v=viewport()
 uiScale.Scale=math.max(.1,math.min(compact and .58 or .72,(v.X-32)/1404,(v.Y-32)/824))
 if not initialized then
  initialized=true
  place((v.X-1404*uiScale.Scale)/2,(v.Y-824*uiScale.Scale)/2)
 else
  place(root.Position.X.Offset,root.Position.Y.Offset)
 end
end
local cameraConnection
local function bindCamera()
 if cameraConnection then cameraConnection:Disconnect() end
 if workspace.CurrentCamera then cameraConnection=workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(fit) end
 fit()
end
connect(workspace:GetPropertyChangedSignal("CurrentCamera"),bindCamera)
bindCamera()

local header=frame(root,"TitleBar",0,0,1404,94,C.background,36);border(header)
logo(header,50,8,115,82)
line(header,25,1,74,1,C.blue,2)
local dragHandle=button(header,"DragHandle",0,0,1404,94)

local minimize=button(header,"Minimize",1214,20,48,48)
icon(minimize,"minus",14,14,20,C.icon)
local resize=button(header,"CompactSize",1272,20,48,48)
icon(resize,"square",14,14,20,C.icon)
local close=button(header,"Close",1328,20,48,48)
icon(close,"close",13,13,22,C.icon)
for _,b in ipairs({minimize,resize,close}) do
 b.BackgroundColor3=C.row;round(b,10)
 connect(b.MouseEnter,function() tween(b,{BackgroundTransparency=.1}):Play() end)
 connect(b.MouseLeave,function() tween(b,{BackgroundTransparency=1}):Play() end)
end
local dragging=false
local dragTouch=nil
local startPointer,startWindow
connect(dragHandle.InputBegan,function(input)
 if input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch then
  if dragging then return end
  dragging=true
  dragTouch=input.UserInputType==Enum.UserInputType.Touch and input or nil
  startPointer=Vector2.new(input.Position.X,input.Position.Y)
  startWindow=Vector2.new(root.Position.X.Offset,root.Position.Y.Offset)
 end
end)
connect(UserInputService.InputChanged,function(input)
 if not dragging then return end
 if (dragTouch and input==dragTouch) or (not dragTouch and input.UserInputType==Enum.UserInputType.MouseMovement) then
  local delta=Vector2.new(input.Position.X,input.Position.Y)-startPointer
  place(startWindow.X+delta.X,startWindow.Y+delta.Y)
 end
end)
connect(UserInputService.InputEnded,function(input)
 if input==dragTouch or (not dragTouch and input.UserInputType==Enum.UserInputType.MouseButton1) then dragging=false;dragTouch=nil end
end)
connect(UserInputService.WindowFocusReleased,function() dragging=false;dragTouch=nil end)

local body=transparent(root,"Body",0,116,1404,708)
body.ZIndex=20
local switchCategory
local nav=transparent(header,"Navigation",224,16,472,62)
local active=frame(nav,"ActiveTab",2,59,66,5,C.blue,3)
local navNames={"home","user","tools","settings","cube"}
local navIcons={}
for i,name in ipairs(navNames) do
 local b=button(nav,name,(i-1)*98,0,70,62)
 local glyph=icon(b,name,20,14,30,i==1 and C.bright or C.icon)
 navIcons[i]=glyph
 connect(b.Activated,function()
  tween(active,{Position=UDim2.fromOffset(2+(i-1)*98,59)}):Play()
  gui:SetAttribute("SelectedTab",name)
  for index,glyph in ipairs(navIcons) do tween(glyph,{ImageColor3=index==i and C.bright or C.icon}):Play() end
  if switchCategory then switchCategory(name) end
 end)
end
local searchPanel=frame(header,"Search",934,20,250,49,C.row,25)
border(searchPanel,C.stroke,.2)
icon(searchPanel,"search",18,12,26,C.icon)
local search=create("TextBox",searchPanel,{Name="SearchInput",Position=UDim2.fromOffset(57,0),Size=UDim2.fromOffset(178,49),BackgroundTransparency=1,Text="",PlaceholderText="Search...",PlaceholderColor3=C.muted,TextColor3=C.text,TextSize=17,Font=Enum.Font.Gotham,ClearTextOnFocus=false,TextXAlignment=Enum.TextXAlignment.Left})

local banner=frame(body,"Banner",0,0,1404,230,C.panel,30)
border(banner,C.stroke)
banner.ClipsDescendants=true
gradient(banner,Color3.fromRGB(10,19,33),Color3.fromRGB(5,11,21),20)
polygon(banner,{{904,0},{1008,0},{793,230},{729,230}},Color3.fromRGB(18,35,63),Color3.fromRGB(9,20,39),1)
polygon(banner,{{984,0},{1012,0},{887,134},{875,145}},C.blue,Color3.fromRGB(1,75,198),1)
line(banner,880,230,1010,77,C.blue,2)
logo(banner,1030,29,318,197,true)
logo(banner,44,56,198,145)
line(banner,99,229,282,19,C.blue,.7)
label(banner,"A7",272,89,80,52,43,C.text,true)
label(banner,"HUB",352,89,220,52,43,C.blue,true)
local discord=button(banner,"Discord",1244,174,252,60)
discord.AnchorPoint=Vector2.new(.5,.5)
discord.BackgroundTransparency=0
discord.BackgroundColor3=Color3.fromRGB(13,20,33)
round(discord,14)
local discordScale=create("UIScale",discord,{Scale=1})
local discordBorder=border(discord,Color3.fromRGB(40,50,70),.12)
local discordBadge=frame(discord,"DiscordBadge",10,10,40,40,Color3.fromRGB(88,101,242),10)
local discordFallback=label(discordBadge,"D",0,0,40,40,20,Color3.new(1,1,1),true)
discordFallback.TextXAlignment=Enum.TextXAlignment.Center
local discordLogo=create("ImageLabel",discordBadge,{Name="DiscordLogo",BackgroundTransparency=1,Size=UDim2.fromScale(1,1),Image="",ScaleType=Enum.ScaleType.Fit})
round(discordLogo,10)
local discordText=label(discord,"Discord",64,0,146,60,21,C.text,true)
local discordArrow=icon(discord,"external",222,22,16,C.muted)
local discordStatus=label(banner,"",870,208,500,20,16,C.muted)
discordStatus.TextXAlignment=Enum.TextXAlignment.Right
local discordHovered=false
local discordFocused=false
local discordPressed=false
local function styleDiscord()
 local active=discordHovered or discordFocused
 tween(discord,{BackgroundColor3=active and Color3.fromRGB(20,20,38) or Color3.fromRGB(13,20,33)}):Play()
 tween(discordBorder,{Color=active and Color3.fromRGB(112,124,245) or Color3.fromRGB(40,50,70)}):Play()
 tween(discordText,{TextColor3=active and Color3.fromRGB(255,255,255) or C.text}):Play()
 tween(discordArrow,{ImageColor3=active and Color3.fromRGB(172,180,255) or C.muted}):Play()
 tween(discordScale,{Scale=discordPressed and .97 or 1}):Play()
end
connect(discord.MouseEnter,function() discordHovered=true;styleDiscord() end)
connect(discord.MouseLeave,function() discordHovered=false;discordPressed=false;styleDiscord() end)
connect(discord.SelectionGained,function() discordFocused=true;styleDiscord() end)
connect(discord.SelectionLost,function() discordFocused=false;discordPressed=false;styleDiscord() end)
connect(discord.InputBegan,function(input)
 if input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch then
  discordPressed=true;styleDiscord()
 end
end)
connect(UserInputService.InputEnded,function(input)
 if discordPressed and (input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch) then
  discordPressed=false;styleDiscord()
 end
end)
task.spawn(function()
 local assetPath="a7-discord-brand-v1.png"
 local ok,asset=pcall(function()
  assert(type(getcustomasset)=="function" and type(writefile)=="function")
  if type(isfile)~="function" or not isfile(assetPath) then
   local fetch=request or http_request or (http and http.request)
   assert(type(fetch)=="function")
   local response=fetch({Url="https://cdn.discordapp.com/embed/avatars/0.png",Method="GET",Timeout=8})
   assert(type(response)=="table" and tonumber(response.StatusCode)==200)
   assert(type(response.Body)=="string" and response.Body:sub(1,8)=="\137PNG\r\n\26\n")
   writefile(assetPath,response.Body)
  end
  return getcustomasset(assetPath)
 end)
 if alive and ok then discordLogo.Image=asset;discordFallback.Visible=false end
end)
local discordBusy=false
connect(discord.Activated,function()
 if discordBusy then return end
 discordBusy=true
 discordText.Text="Opening..."
 discordStatus.Text=""
 local completed=false
 local function finish(opened)
  if completed or not alive then return end
  completed=true
  if opened then
   discordText.Text="Discord"
   discordStatus.Text="Sent to your browser"
  else
   local copy=setclipboard or toclipboard
   local copied=false
   if type(copy)=="function" then copied=pcall(copy,discordUrl) end
   discordText.Text=copied and "Link copied" or "Copy failed"
   discordStatus.Text=copied and "Paste into your browser" or discordUrl
  end
  task.delay(3,function()
   if not alive then return end
   discordBusy=false
   discordText.Text="Discord"
   discordStatus.Text=""
  end)
 end
 task.delay(6,function() finish(false) end)
 task.spawn(function()
  local ok,opened=pcall(function()
   local httpRequest=request or http_request or (http and http.request)
   if type(httpRequest)~="function" then return false end
   local response=httpRequest({
    Url="http://127.0.0.1:38479/open-discord",
    Method="POST",
    Headers={ ["X-A7-Token"]="afed9f54519a4531bc69beb9a3ac02e268fcc1436b9243fe952ca0d37fefb3de" },
    Body="",
    Timeout=5,
   })
   if type(response)~="table" or tonumber(response.StatusCode)~=200 then return false end
   local result=game:GetService("HttpService"):JSONDecode(response.Body)
   return type(result)=="table" and result.launched==true
  end)
  finish(ok and opened==true)
 end)
end)
local main=frame(body,"MainFeatures",0,248,925,460,C.panel,28)
main.ZIndex=40
border(main)
local mainIcon=icon(main,"crown",35,28,40,C.bright)
line(main,96,27,96,69,C.stroke,2)
local mainTitle=label(main,"Main Features",115,27,700,40,23,C.text,true)

local subNav=transparent(main,"SubNavigation",31,88,863,76)
local contentStage=frame(main,"ActiveFeatureStage",31,172,863,263,Color3.fromRGB(7,14,24),20)
border(contentStage,C.stroke,.18)
gradient(contentStage,Color3.fromRGB(10,20,34),Color3.fromRGB(6,12,21),20)
local stageAccent=frame(contentStage,"Accent",0,0,863,3,C.blue,2)
local stageTitle=label(contentStage,"",20,11,560,24,14,C.text,true)
local stageHint=label(contentStage,"SLAYER 2  •  ACTIVE SECTION",20,34,560,18,10,C.muted,false)
local contentHost=transparent(contentStage,"FeaturePages",16,59,831,188)
contentHost.Size=UDim2.new(1,-32,1,-75)
contentHost.ClipsDescendants=true

local categoryMeta={
 home={title="Main Features",icon="crown"},
 user={title="Player",icon="user"},
 tools={title="Progression & Dungeon",icon="tools"},
 settings={title="Misc & Config",icon="settings"},
 cube={title="Travel & Visuals",icon="cube"},
}
local route={
 ["Section_Farm Position"]={"home",10},
 ["Section_Farm Safety + Session"]={"home",20},
 ["Section_Defense"]={"home",30},
 ["Section_Farm Automation"]={"home",40},
 ["Section_Target Filter"]={"home",50},
 ["Section_Boss Automation"]={"home",60},
 ["Section_Yeti"]={"home",70},
 ["Section_Boss Actions"]={"home",80},
 ["Section_Boss Selection"]={"home",90},
 ["Section_Boss List"]={"home",100},

 ["Section_Native Actions"]={"user",10},
 ["Section_Player Farm"]={"user",20},
 ["Section_Movement"]={"user",30},
 ["Section_Fly"]={"user",40},
 ["Section_Horse"]={"user",50},

 ["Section_Dungeon + Souls"]={"tools",10},
 ["Section_Quest Assist"]={"tools",20},
 ["Section_Slayer Crow"]={"tools",30},
 ["Section_Muzan Quest"]={"tools",40},
 ["Section_Training Quests"]={"tools",50},
 ["Section_Race Automation"]={"tools",60},
 ["Section_Winter Lantern"]={"tools",70},
 ["Section_Quest Manager"]={"tools",80},
 ["Section_Muzan"]={"tools",90},
 ["Section_Mastery"]={"tools",100},
 ["Section_Clan Spins"]={"tools",110},

 ["Section_Chest + Loot"]={"settings",10},
 ["Section_Inventory Helper"]={"settings",20},
 ["Section_Crafting / Alchemy"]={"settings",30},
 ["Section_Auto Sell"]={"settings",40},
 ["Section_Fishing"]={"settings",50},
 ["Section_Utilities"]={"settings",60},
 ["Section_Config"]={"settings",70},

 ["Section_Visuals"]={"cube",10},
 ["Section_Regions"]={"cube",20},
 ["Section_NPC / Trainer"]={"cube",30},
 ["Section_Game Systems"]={"cube",40},
 ["Section_Activities"]={"cube",50},
}

local pages={}
local sectionCategory=setmetatable({}, {__mode="k"})
local sectionName=setmetatable({}, {__mode="k"})
local contentOwner=setmetatable({}, {__mode="k"})
local searchRows=setmetatable({}, {__mode="k"})
local categorySections={}
local selectedSub={}
local subButtons={}

local SUB_LABELS={
 ["Section_Farm Position"]="Position",
 ["Section_Farm Safety + Session"]="Safety",
 ["Section_Defense"]="Defence",
 ["Section_Farm Automation"]="Auto Farm",
 ["Section_Target Filter"]="Targets",
 ["Section_Boss Automation"]="Auto Boss",
 ["Section_Yeti"]="Yeti",
 ["Section_Boss Actions"]="Boss Actions",
 ["Section_Boss Selection"]="Boss Select",
 ["Section_Boss List"]="Boss List",

 ["Section_Native Actions"]="Combat",
 ["Section_Player Farm"]="Player Farm",
 ["Section_Movement"]="Movement",
 ["Section_Fly"]="Fly",
 ["Section_Horse"]="Horse",

 ["Section_Dungeon + Souls"]="Dungeon",
 ["Section_Quest Assist"]="Quest Assist",
 ["Section_Slayer Crow"]="Crow",
 ["Section_Muzan Quest"]="Muzan Quest",
 ["Section_Training Quests"]="Training",
 ["Section_Race Automation"]="Race",
 ["Section_Winter Lantern"]="Lantern",
 ["Section_Quest Manager"]="Quest Manager",
 ["Section_Muzan"]="Muzan",
 ["Section_Mastery"]="Mastery",
 ["Section_Clan Spins"]="Clan",

 ["Section_Chest + Loot"]="Loot",
 ["Section_Inventory Helper"]="Inventory",
 ["Section_Crafting / Alchemy"]="Crafting",
 ["Section_Auto Sell"]="Auto Sell",
 ["Section_Fishing"]="Fishing",
 ["Section_Utilities"]="Utilities",
 ["Section_Config"]="Config",

 ["Section_Visuals"]="Visuals",
 ["Section_Regions"]="Regions",
 ["Section_NPC / Trainer"]="NPC / Trainer",
 ["Section_Game Systems"]="Systems",
 ["Section_Activities"]="Activities",
}

for _,name in ipairs(navNames) do
 local page=create("ScrollingFrame",contentHost,{
  Name="Page_"..name,
  Size=UDim2.fromScale(1,1),
  ZIndex=150,
  BackgroundTransparency=1,
  BorderSizePixel=0,
  CanvasSize=UDim2.new(),
  AutomaticCanvasSize=Enum.AutomaticSize.Y,
  ScrollBarThickness=3,
  ScrollBarImageColor3=C.muted,
  ScrollingDirection=Enum.ScrollingDirection.Y,
  ClipsDescendants=true,
  Visible=name=="home",
  Active=true,
 })
 pages[name]=page
 categorySections[name]={}
end

local function isRed(color)
 return typeof(color)=="Color3"
  and color.R>.24
  and color.R>color.G*1.28
  and color.R>color.B*1.12
end

local function ensureCorner(object,radius)
 local c=object:FindFirstChildOfClass("UICorner")
 if not c then c=create("UICorner",object,{}) end
 c.CornerRadius=UDim.new(0,radius)
end

local function ensureStroke(object,color,transparency)
 local s=object:FindFirstChildOfClass("UIStroke")
 if not s then s=create("UIStroke",object,{}) end
 s.Color=color
 s.Thickness=1
 s.Transparency=transparency or 0
 s.ApplyStrokeMode=Enum.ApplyStrokeMode.Border
end

local function sectionText(section)
 local parts={string.lower(tostring(section.Name or ""))}
 for _,object in ipairs(section:GetDescendants()) do
  if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
   local t=tostring(object.Text or "")
   if t~="" then parts[#parts+1]=string.lower(t) end
   if object:IsA("TextBox") then
    local p=tostring(object.PlaceholderText or "")
    if p~="" then parts[#parts+1]=string.lower(p) end
   end
  end
 end
 return table.concat(parts," ")
end

local function getSectionHolder(section)
 if not section then return nil end
 local named=section:FindFirstChild("Items")
 if named and named:IsA("Frame") then return named end
 for _,child in ipairs(section:GetChildren()) do
  if child:IsA("Frame") and child:FindFirstChildOfClass("UIListLayout") then
   return child
  end
 end
 return nil
end

local function contentText(holder,sectionNameValue)
 local parts={string.lower(tostring(sectionNameValue or ""))}
 if holder then
  for _,object in ipairs(holder:GetDescendants()) do
   if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
    local t=tostring(object.Text or "")
    if t~="" then parts[#parts+1]=string.lower(t) end
    if object:IsA("TextBox") then
     local p=tostring(object.PlaceholderText or "")
     if p~="" then parts[#parts+1]=string.lower(p) end
    end
   end
  end
 end
 return table.concat(parts," ")
end

local function styleHolder(holder)
 if not holder or not holder.Parent then return end
 holder.BackgroundTransparency=1
 holder.BorderSizePixel=0
 holder.Visible=true
 holder.ZIndex=155

 local layout=holder:FindFirstChildOfClass("UIListLayout")
 if layout then layout.Padding=UDim.new(0,10) end

 for _,child in ipairs(holder:GetChildren()) do
  if child:IsA("TextButton") then
   child.Visible=true
   child.ZIndex=156
   child.AutoButtonColor=false
   child.BorderSizePixel=0
   child.TextSize=math.max(14,child.TextSize)
   child.Font=Enum.Font.GothamMedium
   if child.Text~="" then
    child.BackgroundColor3=C.background
    child.TextColor3=C.text
    child.Size=UDim2.new(1,0,0,40)
    ensureCorner(child,10)
    ensureStroke(child,C.stroke,.22)
   else
    child.BackgroundTransparency=1
    child.Size=UDim2.new(1,0,0,46)
    local lab=child:FindFirstChildWhichIsA("TextLabel")
    if lab then
     lab.Visible=true
     lab.TextSize=15
     lab.TextColor3=C.text
     lab.Font=Enum.Font.GothamMedium
    end
   end
  elseif child:IsA("Frame") then
   child.Visible=true
   child.ZIndex=156
   local box=child:FindFirstChildWhichIsA("TextBox")
   if box then
    child.Size=UDim2.new(1,0,0,42)
    box.Visible=true
    box.TextSize=14
    box.TextColor3=C.text
    box.PlaceholderColor3=C.muted
    box.BackgroundColor3=C.background
    box.ZIndex=157
    ensureCorner(box,10)
    ensureStroke(box,C.stroke,.22)
    for _,lab in ipairs(child:GetChildren()) do
     if lab:IsA("TextLabel") then
      lab.Visible=true
      lab.TextSize=14
      lab.TextColor3=C.muted
      lab.Font=Enum.Font.GothamMedium
      lab.ZIndex=157
     end
    end
   end
  elseif child:IsA("TextLabel") then
   child.Visible=true
   child.TextSize=math.max(13,child.TextSize)
   child.TextColor3=C.muted
   child.ZIndex=156
  elseif child:IsA("ScrollingFrame") then
   child.Visible=true
   child.ScrollBarImageColor3=C.muted
   child.ZIndex=156
  end
 end

 for _,desc in ipairs(holder:GetDescendants()) do
  if desc:IsA("GuiObject") then
   desc.ZIndex=math.max(156,desc.ZIndex)
  end
 end
end

local function sizeHolder(holder,page)
 if not holder then return end
 local layout=holder:FindFirstChildOfClass("UIListLayout")
 local needed=170
 if layout then
  needed=math.max(170,layout.AbsoluteContentSize.Y+10)
 else
  for _,child in ipairs(holder:GetChildren()) do
   if child:IsA("GuiObject") and child.Visible then
    local h=child.AbsoluteSize.Y>0 and child.AbsoluteSize.Y or child.Size.Y.Offset
    needed=math.max(needed,child.Position.Y.Offset+h+8)
   end
  end
 end
 holder.Size=UDim2.new(1,0,0,needed)
 if page and page:IsA("ScrollingFrame") then
  page.CanvasSize=UDim2.fromOffset(0,needed+4)
 end
end

local function styleSection(section)
 if not section or not section.Parent then return end
 section.BackgroundColor3=Color3.fromRGB(9,18,30)
 section.BackgroundTransparency=0
 section.BorderSizePixel=0
 section.ClipsDescendants=false
 ensureCorner(section,16)
 ensureStroke(section,C.stroke,.12)

 local h=section.AbsoluteSize.Y
 if h<=1 then h=section.Size.Y.Offset end
 h=math.max(96,h)
 section.Size=UDim2.new(1,0,0,h)

 local firstTitle=nil
 local bestY=math.huge
 for _,child in ipairs(section:GetChildren()) do
  if child:IsA("TextLabel") and tostring(child.Text or "")~="" and child.Position.Y.Offset<bestY then
   firstTitle=child
   bestY=child.Position.Y.Offset
  end
 end

 for _,object in ipairs(section:GetDescendants()) do
  if object:IsA("TextLabel") then
   object.Font=object==firstTitle and Enum.Font.GothamMedium or Enum.Font.Gotham
   object.TextColor3=object==firstTitle and C.text or C.muted
   object.TextWrapped=false
   object.TextTruncate=Enum.TextTruncate.AtEnd
   if object==firstTitle then
    object.TextSize=math.max(18,math.min(21,object.TextSize))
   else
    object.TextSize=math.max(13,object.TextSize)
   end
  elseif object:IsA("TextBox") then
   object.BackgroundColor3=C.background
   object.TextColor3=C.text
   object.PlaceholderColor3=C.muted
   object.TextSize=math.max(13,object.TextSize)
   object.BorderSizePixel=0
   if object.Size.Y.Offset>0 and object.Size.Y.Offset<36 then
    object.Size=UDim2.new(object.Size.X.Scale,object.Size.X.Offset,object.Size.Y.Scale,36)
   end
   ensureCorner(object,10)
   ensureStroke(object,C.stroke,.24)
  elseif object:IsA("TextButton") then
   object.AutoButtonColor=false
   object.BorderSizePixel=0
   if object.Text~="" then
    object.TextSize=math.max(13,object.TextSize)
    object.TextColor3=C.text
    object.BackgroundColor3=isRed(object.BackgroundColor3) and C.blue or C.background
    if object.Size.Y.Offset>0 and object.Size.Y.Offset<38 then
     object.Size=UDim2.new(object.Size.X.Scale,object.Size.X.Offset,object.Size.Y.Scale,38)
    end
    ensureCorner(object,10)
    ensureStroke(object,C.stroke,.24)
   else
    local childLabel=object:FindFirstChildWhichIsA("TextLabel")
    if childLabel then
     childLabel.TextSize=math.max(14,childLabel.TextSize)
     childLabel.TextColor3=C.text
    end
   end
  elseif object:IsA("Frame") then
   local n=string.lower(tostring(object.Name or ""))
   local w=object.AbsoluteSize.X>0 and object.AbsoluteSize.X or object.Size.X.Offset
   local hh=object.AbsoluteSize.Y>0 and object.AbsoluteSize.Y or object.Size.Y.Offset
   if string.find(n,"switch",1,true) or string.find(n,"track",1,true) then
    if object.BackgroundTransparency<1 then object.BackgroundColor3=C.blue end
   elseif string.find(n,"knob",1,true) then
    if object.BackgroundTransparency<1 then object.BackgroundColor3=C.text end
   elseif isRed(object.BackgroundColor3) then
    if hh>0 and hh<=9 then object.BackgroundColor3=C.blue
    elseif w>0 and w<=70 and hh>0 and hh<=36 then object.BackgroundColor3=C.blue
    else object.BackgroundColor3=C.background end
   end
  elseif object:IsA("UIStroke") then
   if isRed(object.Color) then object.Color=C.stroke end
  elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
   if isRed(object.ImageColor3) then object.ImageColor3=C.icon end
  elseif object:IsA("ScrollingFrame") then
   object.ScrollBarImageColor3=C.muted
  end
 end
 searchRows[section]=sectionText(section)
end

local unknownOrder=500

local function categoryHas(category,section)
 for _,item in ipairs(categorySections[category] or {}) do
  if item.section==section then return true end
 end
 return false
end

local function routeSection(section)
 if not section or not section.Parent then return end
 captureSection(section)
 local r=route[section.Name]
 local category=r and r[1] or "settings"
 local order=r and r[2] or unknownOrder
 if not r then unknownOrder+=10 end
 local page=pages[category]
 if not page then return end

 local holder=getSectionHolder(section)
 if holder and not nativeContentState[holder] then
  nativeContentState[holder]={
   parent=holder.Parent,
   position=holder.Position,
   size=holder.Size,
   automaticSize=holder.AutomaticSize,
   visible=holder.Visible,
   zindex=holder.ZIndex,
  }
 end

 section.Visible=false
 sectionCategory[section]=category
 sectionName[section]=section.Name

 local content=holder or section
 contentOwner[content]=section
 content.Parent=page
 content.Position=UDim2.fromOffset(0,0)
 content.Size=UDim2.new(1,0,0,0)
 content.AutomaticSize=Enum.AutomaticSize.None
 content.Visible=false
 content.ZIndex=155
 styleHolder(content)
 content.Visible=false
 searchRows[section]=contentText(content,section.Name)

 if not categoryHas(category,section) then
  categorySections[category][#categorySections[category]+1]={
   section=section,
   content=content,
   name=section.Name,
   order=order,
  }
  table.sort(categorySections[category],function(a,b)
   if a.order==b.order then return a.name<b.name end
   return a.order<b.order
  end)
 else
  for _,item in ipairs(categorySections[category]) do
   if item.section==section then item.content=content end
  end
 end
end

for _,section in ipairs(nativeSections) do
 routeSection(section)
end
if evac and evac.Parent then pcall(function() evac:Destroy() end) end
legacyMain.Visible=false
local legacyVisibilityGuard=false
connect(legacyMain:GetPropertyChangedSignal("Visible"),function()
 if not alive or legacyVisibilityGuard then return end
 if legacyMain.Visible then
  legacyVisibilityGuard=true
  legacyMain.Visible=false
  legacyVisibilityGuard=false
 end
end)

-- Runtime/UI layers can recreate a frame named Main later. Keep every legacy Main hidden.
connect(slayerGui.ChildAdded,function(child)
 task.defer(function()
  if not alive or not child.Parent then return end
  if child:IsA("Frame") and child.Name=="Main" and child~=root then
   child.Visible=false
   connect(child:GetPropertyChangedSignal("Visible"),function()
    if alive and child.Parent and child.Visible then child.Visible=false end
   end)
  end
 end)
end)

-- =========================================================
-- V15 READABILITY + BLUE TOGGLE LAYER
-- Keeps native callbacks/state, changes presentation only.
-- =========================================================
local syncRuntimeToggles=function() end
local enlargeRuntimeInputs=function() end
do
 local State=ENV.A7DEV_PROJECT_SLAYER_2
 local runtime=State and State.Runtime
 local toggleControls=runtime and runtime.ToggleControls
 local inputControls=runtime and runtime.InputControls
 local toggleGuards=setmetatable({}, {__mode="k"})
 local setGuards=setmetatable({}, {__mode="k"})
 local colorGuards=setmetatable({}, {__mode="k"})

 -- Prevent native controls created/updated later from reintroducing the red theme.
 if runtime and runtime.Theme then
  runtime.Theme.Red=C.blue
  runtime.Theme.RedDark=Color3.fromRGB(0,65,160)
  if runtime.Theme.Accent then runtime.Theme.Accent=C.bright end
 end

 local function findSectionFrom(object)
  local p=object
  while p and p~=gui do
   if p:IsA("Frame") and string.sub(p.Name or "",1,8)=="Section_" then return p end
   p=p.Parent
  end
 end

 local function hideNativeToggleBox(row)
  for _,child in ipairs(row:GetChildren()) do
   if child:IsA("Frame") and child.Name~="A7DEV_BLUE_SWITCH_V17" then
    local w=child.AbsoluteSize.X>0 and child.AbsoluteSize.X or child.Size.X.Offset
    local h=child.AbsoluteSize.Y>0 and child.AbsoluteSize.Y or child.Size.Y.Offset
    if w>0 and w<=34 and h>0 and h<=34 then
     child.Visible=false
    end
   end
  end
 end

 local function ensureBlueSwitch(row)
  local track=row:FindFirstChild("A7DEV_BLUE_SWITCH_V17")
  if not track then
   track=create("Frame",row,{
    Name="A7DEV_BLUE_SWITCH_V17",
    AnchorPoint=Vector2.new(1,.5),
    Position=UDim2.new(1,-10,.5,0),
    Size=UDim2.fromOffset(56,30),
    BackgroundColor3=Color3.fromRGB(27,42,61),
    BorderSizePixel=0,
    Active=false,
    ZIndex=row.ZIndex+8,
   })
   round(track,14)
   border(track,C.stroke,.12)

   local knob=create("Frame",track,{
    Name="Knob",
    Position=UDim2.fromOffset(3,3),
    Size=UDim2.fromOffset(22,22),
    BackgroundColor3=C.text,
    BorderSizePixel=0,
    Active=false,
    ZIndex=track.ZIndex+1,
   })
   round(knob,11)
  end
  return track
 end

 local function syncToggle(label,control)
  if not control or not control.Row or not control.Row.Parent then return end
  local row=control.Row
  row.Visible=true
  row.Active=true
  row.Selectable=true
  row.AutoButtonColor=false
  row.BackgroundTransparency=1
  row.BorderSizePixel=0
  row.Size=UDim2.new(1,0,0,44)

  local enabled=false
  if type(control.Get)=="function" then
   local ok,value=pcall(control.Get)
   if ok then enabled=value==true end
  end

  hideNativeToggleBox(row)

  local text=row:FindFirstChildWhichIsA("TextLabel")
  if text then
   text.Visible=true
   text.Font=Enum.Font.GothamMedium
   text.TextSize=15
   text.TextColor3=enabled and C.text or C.muted
   text.TextWrapped=false
   text.TextTruncate=Enum.TextTruncate.AtEnd
   text.Position=UDim2.fromOffset(2,0)
   text.Size=UDim2.new(1,-86,1,0)
  end

  local track=ensureBlueSwitch(row)
  track.Visible=true
  track.BackgroundColor3=enabled and C.blue or Color3.fromRGB(27,42,61)
  local stroke=track:FindFirstChildOfClass("UIStroke")
  if stroke then
   stroke.Color=enabled and C.bright or C.stroke
   stroke.Transparency=enabled and .15 or .28
  end
  local knob=track:FindFirstChild("Knob")
  if knob then
   knob.BackgroundColor3=C.white or C.text
   knob.Position=UDim2.fromOffset(enabled and 29 or 3,3)
  end

  if not toggleGuards[row] then
   toggleGuards[row]=true
   connect(row.Activated,function()
    task.defer(function()
     if alive and row.Parent then syncToggle(label,control) end
    end)
   end)
  end

  if type(control.Set)=="function" and not setGuards[control] then
   setGuards[control]=true
   local originalSet=control.Set
   control.Set=function(value)
    local packed=table.pack(originalSet(value))
    task.defer(function()
     if alive and row.Parent then syncToggle(label,control) end
    end)
    return table.unpack(packed,1,packed.n)
   end
  end
 end

 local function syncAllToggles()
  if type(toggleControls)~="table" then return end
  for label,control in pairs(toggleControls) do
   syncToggle(label,control)
  end
 end

 local function enlargeInputs()
  if type(inputControls)~="table" then return end
  for _,control in pairs(inputControls) do
   local box=control and control.Box
   if box and box.Parent then
    box.TextSize=math.max(13,box.TextSize)
    if box.Size.Y.Offset>0 and box.Size.Y.Offset<38 then
     box.Size=UDim2.new(box.Size.X.Scale,box.Size.X.Offset,box.Size.Y.Scale,38)
    end
    box.BackgroundColor3=C.background
    box.TextColor3=C.text
    box.PlaceholderColor3=C.muted
    ensureCorner(box,10)
    ensureStroke(box,C.stroke,.24)
   end
  end
 end

 syncRuntimeToggles=syncAllToggles
 enlargeRuntimeInputs=enlargeInputs

 local function guardColor(object)
  if colorGuards[object] or not object.Parent then return end
  colorGuards[object]=true

  if object:IsA("TextButton") then
   connect(object:GetPropertyChangedSignal("BackgroundColor3"),function()
    if not alive or not object.Parent or colorGuards[object]=="busy" then return end
    if isRed(object.BackgroundColor3) then
     colorGuards[object]="busy"
     object.BackgroundColor3=C.blue
     colorGuards[object]=true
    end
   end)
   connect(object:GetPropertyChangedSignal("TextColor3"),function()
    if alive and object.Parent and isRed(object.TextColor3) then object.TextColor3=C.text end
   end)
  elseif object:IsA("Frame") then
   connect(object:GetPropertyChangedSignal("BackgroundColor3"),function()
    if not alive or not object.Parent or colorGuards[object]=="busy" then return end
    if isRed(object.BackgroundColor3) then
     local n=string.lower(tostring(object.Name or ""))
     colorGuards[object]="busy"
     if string.find(n,"knob",1,true) then
      object.BackgroundColor3=C.text
     elseif string.find(n,"switch",1,true) or string.find(n,"track",1,true) then
      object.BackgroundColor3=C.blue
     else
      object.BackgroundColor3=C.background
     end
     colorGuards[object]=true
    end
   end)
  elseif object:IsA("UIStroke") then
   connect(object:GetPropertyChangedSignal("Color"),function()
    if alive and object.Parent and isRed(object.Color) then object.Color=C.stroke end
   end)
  end
 end

 local function readabilityPass(section)
  if not section or not section.Parent then return end
  styleSection(section)

  local title=nil
  local titleY=math.huge
  for _,child in ipairs(section:GetChildren()) do
   if child:IsA("TextLabel") and tostring(child.Text or "")~="" and child.Position.Y.Offset<titleY then
    title=child
    titleY=child.Position.Y.Offset
   end
  end

  for _,object in ipairs(section:GetDescendants()) do
   if object:IsA("TextLabel") then
    if object==title then
     object.TextSize=math.max(18,object.TextSize)
     object.TextColor3=C.text
     object.Font=Enum.Font.GothamMedium
    else
     object.TextSize=math.max(14,object.TextSize)
     if object.Parent and object.Parent:IsA("TextButton") then
      object.TextColor3=C.text
      object.Font=Enum.Font.GothamMedium
     elseif object.TextColor3~=C.text then
      object.TextColor3=C.muted
     end
    end
   elseif object:IsA("TextButton") and object.Text~="" then
    object.TextSize=math.max(14,object.TextSize)
    object.TextColor3=C.text
    object.Font=Enum.Font.GothamMedium
    if object.Size.Y.Offset>0 and object.Size.Y.Offset<40 then
     object.Size=UDim2.new(object.Size.X.Scale,object.Size.X.Offset,object.Size.Y.Scale,40)
    end
    guardColor(object)
   elseif object:IsA("TextBox") then
    object.TextSize=math.max(14,object.TextSize)
    if object.Size.Y.Offset>0 and object.Size.Y.Offset<40 then
     object.Size=UDim2.new(object.Size.X.Scale,object.Size.X.Offset,object.Size.Y.Scale,40)
    end
   elseif object:IsA("Frame") or object:IsA("UIStroke") then
    guardColor(object)
   end
  end

  local layout=section:FindFirstChildOfClass("UIListLayout")
  if layout then
   task.defer(function()
    if alive and section.Parent and layout.Parent==section then
     local needed=math.max(96,layout.AbsoluteContentSize.Y+24)
     section.Size=UDim2.new(1,0,0,needed)
    end
   end)
  end
 end

 for _,section in ipairs(nativeSections) do readabilityPass(section) end
 syncAllToggles()
 enlargeInputs()

 connect(gui.DescendantAdded,function(object)
  task.delay(.04,function()
   if not alive or not object.Parent then return end
   local section=findSectionFrom(object)
   if section then
      searchRows[section]=sectionText(section)
   end
   if object:IsA("TextButton") or object:IsA("Frame") or object:IsA("UIStroke") then
    guardColor(object)
   end
   syncAllToggles()
   enlargeInputs()
  end)
 end)

 -- A lightweight state refresh handles changes performed by config loading or code,
 -- not only direct clicks, without altering gameplay timing.
 task.spawn(function()
  while alive and gui.Parent do
   task.wait(.75)
   if root.Visible and not collapsed then syncAllToggles() end
  end
 end)
end

local function ownerSection(object)
 local p=object
 while p and p~=gui do
  if contentOwner[p] then return contentOwner[p],p end
  if p:IsA("Frame") and string.sub(p.Name or "",1,8)=="Section_" then return p,getSectionHolder(p) end
  p=p.Parent
 end
 return nil,nil
end

local selectedCategory="home"
local selectedSection=nil
local visibleGuards=setmetatable({}, {__mode="k"})

local function insideSection(object,section)
 if not object or not section then return false end
 local p=object
 while p and p~=gui do
  if p==section then return true end
  p=p.Parent
 end
 return false
end

local function revealAncestorChain(object,section)
 local p=object
 while p and p~=section do
  if p:IsA("GuiObject") then
   local n=string.lower(tostring(p.Name or ""))
   local looksPopup=string.find(n,"popup",1,true)
    or string.find(n,"dropdownlist",1,true)
    or string.find(n,"options",1,true)
   if not looksPopup then p.Visible=true end
  end
  p=p.Parent
 end
end

local function meaningfulText(object)
 if not (object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox")) then return false end
 local text=tostring(object.Text or "")
 if object:IsA("TextBox") and text=="" then text=tostring(object.PlaceholderText or "") end
 if text=="" then return false end
 local low=string.lower(text)
 if string.find(low,"scan:",1,true)
  or string.find(low,"catalog:",1,true)
  or string.find(low,"phase=",1,true)
  or string.find(low,"streaming ",1,true) then
  return false
 end
 return true
end

local function restoreRegisteredControls(section)
 local state=ENV.A7DEV_PROJECT_SLAYER_2
 local runtime=state and state.Runtime
 if not runtime then return 0 end
 local restored=0

 for _,control in pairs(type(runtime.ToggleControls)=="table" and runtime.ToggleControls or {}) do
  local row=control and control.Row
  if row and row.Parent and insideSection(row,section) then
   row.Visible=true
   revealAncestorChain(row,section)
   restored+=1
  end
 end

 for _,control in pairs(type(runtime.InputControls)=="table" and runtime.InputControls or {}) do
  local box=control and control.Box
  if box and box.Parent and insideSection(box,section) then
   box.Visible=true
   revealAncestorChain(box,section)
   restored+=1
  end
 end

 return restored
end

local function restoreNativeRows(section)
 local restored=0
 for _,child in ipairs(section:GetChildren()) do
  if child:IsA("TextButton") then
   child.Visible=true
   restored+=1
  elseif child:IsA("TextBox") then
   child.Visible=true
   restored+=1
  elseif child:IsA("TextLabel") and meaningfulText(child) then
   child.Visible=true
  elseif child:IsA("ScrollingFrame") then
   local hasUseful=false
   for _,d in ipairs(child:GetDescendants()) do
    if (d:IsA("TextButton") or d:IsA("TextBox")) and meaningfulText(d) then
     hasUseful=true
     break
    end
   end
   if hasUseful then
    child.Visible=true
    restored+=1
   end
  elseif child:IsA("Frame") then
   local name=string.lower(tostring(child.Name or ""))
   local skip=string.find(name,"switch",1,true)
    or string.find(name,"knob",1,true)
    or string.find(name,"track",1,true)
    or string.find(name,"popup",1,true)
    or string.find(name,"dropdownlist",1,true)
   if not skip then
    local hasUseful=false
    for _,d in ipairs(child:GetDescendants()) do
     if d:IsA("TextButton") or d:IsA("TextBox") then
      hasUseful=true
      break
     end
    end
    if hasUseful then
     child.Visible=true
     restored+=1
     for _,d in ipairs(child:GetDescendants()) do
      if d:IsA("TextButton") or d:IsA("TextBox") then
       local n=string.lower(tostring(d.Name or ""))
       if not string.find(n,"option",1,true) then d.Visible=true end
      elseif d:IsA("TextLabel") and meaningfulText(d) then
       d.Visible=true
      end
     end
    end
   end
  end
 end
 return restored
end

local function recalcActiveSection(section)
 if not section or not section.Parent then return end
 local layout=section:FindFirstChildOfClass("UIListLayout")
 if layout then
  task.defer(function()
   if alive and section.Parent and layout.Parent==section then
    local needed=math.max(110,layout.AbsoluteContentSize.Y+26)
    section.Size=UDim2.new(1,0,0,needed)
    local page=section.Parent
    if page:IsA("ScrollingFrame") then
     page.CanvasSize=UDim2.fromOffset(0,needed+6)
    end
   end
  end)
 else
  local bottom=96
  for _,child in ipairs(section:GetChildren()) do
   if child:IsA("GuiObject") and child.Visible then
    local y=child.Position.Y.Offset
    local h=child.AbsoluteSize.Y>0 and child.AbsoluteSize.Y or child.Size.Y.Offset
    bottom=math.max(bottom,y+h+18)
   end
  end
  section.Size=UDim2.new(1,0,0,bottom)
  local page=section.Parent
  if page:IsA("ScrollingFrame") then
   page.CanvasSize=UDim2.fromOffset(0,bottom+6)
  end
 end
end

local function reviveSectionControls(section)
 if not section or not section.Parent then return end
 section.ZIndex=155

 restoreRegisteredControls(section)
 restoreNativeRows(section)

 for _,child in ipairs(section:GetChildren()) do
  if child:IsA("TextButton") or child:IsA("TextBox") or child:IsA("TextLabel") then
   child.ZIndex=math.max(156,child.ZIndex)
  elseif child:IsA("ScrollingFrame") and child.Visible then
   child.ZIndex=math.max(156,child.ZIndex)
  end
 end
 for _,desc in ipairs(section:GetDescendants()) do
  if desc:IsA("GuiObject") then
   desc.ZIndex=math.max(156,desc.ZIndex)
  end
 end

 recalcActiveSection(section)
end

local function guardSelectedVisibility(section)
 if not section or visibleGuards[section] then return end
 visibleGuards[section]=true
 connect(section:GetPropertyChangedSignal("Visible"),function()
  if alive and selectedSection==section and section.Parent and not section.Visible then
   section.Visible=true
  end
 end)
end

local function clearSubNav()
 for _,object in ipairs(subNav:GetChildren()) do
  if object:IsA("TextButton") then object:Destroy() end
 end
 table.clear(subButtons)
end

local function findItem(category,name)
 for _,item in ipairs(categorySections[category] or {}) do
  if item.name==name then return item end
 end
end

local function sectionAnyEnabled(item)
 local state=ENV.A7DEV_PROJECT_SLAYER_2
 local runtime=state and state.Runtime
 local controls=runtime and runtime.ToggleControls
 if type(controls)~="table" or not item or not item.content then return false end
 for _,control in pairs(controls) do
  local row=control and control.Row
  if row and row.Parent and insideSection(row,item.content) and type(control.Get)=="function" then
   local ok,value=pcall(control.Get)
   if ok and value==true then return true end
  end
 end
 return false
end

local function updateSubVisuals()
 for name,record in pairs(subButtons) do
  local buttonObject=record.button
  local active=selectedSub[selectedCategory]==name
  local enabled=sectionAnyEnabled(record.item)
  buttonObject.BackgroundColor3=active and Color3.fromRGB(12,48,88) or C.row
  buttonObject.TextColor3=active and C.bright or C.muted
  local stroke=buttonObject:FindFirstChildOfClass("UIStroke")
  if stroke then
   stroke.Color=active and C.blue or C.stroke
   stroke.Transparency=active and .05 or .35
  end
  local dot=buttonObject:FindFirstChild("StatusDot")
  if dot then
   dot.Visible=enabled
   dot.BackgroundColor3=enabled and C.bright or C.dim
  end
 end
end

local function showSub(name)
 local items=categorySections[selectedCategory] or {}
 local selected=findItem(selectedCategory,name) or items[1]
 if not selected then return end

 selectedSub[selectedCategory]=selected.name
 selectedSection=selected.section

 local currentPage=pages[selectedCategory]
 if currentPage and currentPage:IsA("ScrollingFrame") then
  currentPage.CanvasPosition=Vector2.zero
 end

 for _,item in ipairs(items) do
  if item.section and item.section.Parent then item.section.Visible=false end
  if item.content and item.content.Parent then item.content.Visible=(item==selected) end
 end

 local content=selected.content
 if content and content.Parent then
  content.Position=UDim2.fromOffset(0,0)
  content.Visible=true
  styleHolder(content)
  syncRuntimeToggles()
  enlargeRuntimeInputs()

  stageTitle.Text=SUB_LABELS[selected.name] or selected.name:gsub("^Section_","")
  local meta=categoryMeta[selectedCategory] or categoryMeta.home
  stageHint.Text=string.upper(meta.title).."  •  SLAYER 2"

  local function reassert()
   if alive and selectedSection==selected.section and content.Parent then
    content.Visible=true
    styleHolder(content)
    syncRuntimeToggles()
    enlargeRuntimeInputs()
    sizeHolder(content,currentPage)
   end
  end

  task.defer(reassert)
  task.delay(.08,reassert)
  task.delay(.25,reassert)
 end

 updateSubVisuals()
end
local function rebuildSubNav(category)
 clearSubNav()
 local items=categorySections[category] or {}
 if #items==0 then return end

 local vp=viewport()
 local maxCols=(UserInputService.TouchEnabled or vp.X<900) and 3 or 5
 local columns=math.min(maxCols,math.max(1,#items))
 local rows=math.ceil(#items/columns)
 local gap=8
 local rowHeight=(UserInputService.TouchEnabled or vp.X<900) and 34 or 30
 local rowGap=7
 local width=(863-gap*(columns-1))/columns
 local navHeight=rows*(rowHeight+rowGap)-rowGap
 subNav.Size=UDim2.fromOffset(863,math.max(38,navHeight))
 local stageY=96+math.max(38,navHeight)
 contentStage.Position=UDim2.fromOffset(31,stageY)
 contentStage.Size=UDim2.fromOffset(863,435-stageY)

 for index,item in ipairs(items) do
  local col=(index-1)%columns
  local rowIndex=math.floor((index-1)/columns)
  local b=create("TextButton",subNav,{
   Name="Sub_"..item.name:gsub("[^%w]","_"),
   Position=UDim2.fromOffset(math.floor(col*(width+gap)),rowIndex*(rowHeight+rowGap)),
   Size=UDim2.fromOffset(math.floor(width),rowHeight),
   BackgroundColor3=C.row,
   BorderSizePixel=0,
   AutoButtonColor=false,
   Text=SUB_LABELS[item.name] or item.name:gsub("^Section_",""),
   TextColor3=C.muted,
   Font=Enum.Font.GothamMedium,
   TextSize=12,
   TextTruncate=Enum.TextTruncate.AtEnd,
   ZIndex=145,
  })
  round(b,10)
  border(b,C.stroke,.25)
  subButtons[item.name]={button=b,item=item}
 local dot=create("Frame",b,{
  Name="StatusDot",
  AnchorPoint=Vector2.new(1,.5),
  Position=UDim2.new(1,-8,.5,0),
  Size=UDim2.fromOffset(7,7),
  BackgroundColor3=C.dim,
  BorderSizePixel=0,
  Visible=false,
  ZIndex=b.ZIndex+2,
 })
 round(dot,4)
  connect(b.Activated,function() showSub(item.name) end)
  connect(b.MouseEnter,function()
   if selectedSub[selectedCategory]~=item.name then
    tween(b,{BackgroundColor3=Color3.fromRGB(14,28,46),TextColor3=C.text}):Play()
   end
  end)
  connect(b.MouseLeave,function() updateSubVisuals() end)
 end

 local remembered=selectedSub[category]
 if not remembered or not findItem(category,remembered) then
  remembered=items[1].name
 end
 showSub(remembered)
end

local searchBusy=false
local function applySearch()
 if searchBusy then return end
 local query=string.lower(tostring(search.Text or "")):match("^%s*(.-)%s*$")
 if query=="" then
  local current=selectedSub[selectedCategory]
  if current then showSub(current) end
  return
 end

 -- Current category first.
 for _,item in ipairs(categorySections[selectedCategory] or {}) do
  if item.section and string.find(searchRows[item.section] or "",query,1,true)~=nil then
   showSub(item.name)
   return
  end
 end

 -- Global search across every category. Jump directly to the matching section.
 for _,category in ipairs(navNames) do
  if category~=selectedCategory then
   for _,item in ipairs(categorySections[category] or {}) do
    if item.section and string.find(searchRows[item.section] or "",query,1,true)~=nil then
     searchBusy=true
     switchCategory(category)
     showSub(item.name)
     searchBusy=false
     return
    end
   end
 end
end

switchCategory=function(name)
 if not pages[name] then return end
 selectedCategory=name
 for key,page in pairs(pages) do page.Visible=key==name end
 local meta=categoryMeta[name] or categoryMeta.home
 mainTitle.Text=meta.title
 mainIcon.Image=""
 mainIcon:Destroy()
 mainIcon=icon(main,meta.icon,35,28,40,C.bright)
 rebuildSubNav(name)
 applySearch()
end

connect(search:GetPropertyChangedSignal("Text"),applySearch)

connect(gui.DescendantAdded,function(object)
 if not alive or not object.Parent then return end
 if object:IsA("Frame") and string.sub(object.Name or "",1,8)=="Section_" then
  task.delay(.05,function()
   if alive and object.Parent then
    routeSection(object)
    searchRows[object]=sectionText(object)
    if sectionCategory[object]==selectedCategory then
     rebuildSubNav(selectedCategory)
     if selectedSub[selectedCategory]==object.Name then showSub(object.Name) end
    end
    applySearch()
   end
  end)
  return
 end
 local section,holder=ownerSection(object)
 if section then
  task.delay(.05,function()
   if alive and holder and holder.Parent then
    searchRows[section]=contentText(holder,section.Name)
    if selectedSection==section then
     holder.Visible=true
     styleHolder(holder)
     syncRuntimeToggles()
     enlargeRuntimeInputs()
     sizeHolder(holder,pages[selectedCategory])
    end
    applySearch()
   end
  end)
 end
end)

switchCategory("home")

-- =========================================================
-- V17 ADVANCED TEST UX
-- Favorites, global navigation, quick actions, live status, profiles,
-- notifications, rollback and non-destructive UI watchdog.
-- =========================================================
do
 local HttpService=game:GetService("HttpService")
 local State=ENV.A7DEV_PROJECT_SLAYER_2
 local runtime=State and State.Runtime

 local function safeText(value,fallback)
  local t=tostring(value or fallback or "")
  t=t:gsub("[\r\n]+"," "):match("^%s*(.-)%s*$") or ""
  if #t>42 then t=t:sub(1,39).."..." end
  return t
 end

 local function findToggle(candidates)
  local controls=runtime and runtime.ToggleControls
  if type(controls)~="table" then return nil,nil end
  for _,name in ipairs(candidates) do
   if controls[name] then return name,controls[name] end
  end
  for label,control in pairs(controls) do
   local low=string.lower(tostring(label))
   for _,name in ipairs(candidates) do
    local needle=string.lower(name)
    if string.find(low,needle,1,true) then return label,control end
   end
  end
  return nil,nil
 end

 local function toggleValue(control)
  if not control or type(control.Get)~="function" then return false end
  local ok,value=pcall(control.Get)
  return ok and value==true
 end

 -- Compact live status pill in active card.
 local statusPill=frame(contentStage,"LiveStatus",650,12,190,31,Color3.fromRGB(10,25,43),15)
 statusPill.ZIndex=180
 local statusDot=frame(statusPill,"Dot",11,11,9,9,C.dim,5)
 statusDot.ZIndex=181
 local statusText=label(statusPill,"READY",28,0,151,31,11,C.muted,true)
 statusText.ZIndex=181
 statusText.TextXAlignment=Enum.TextXAlignment.Right

 local function getField(...)
  if not State then return nil end
  for i=1,select("#",...) do
   local key=select(i,...)
   local v=State[key]
   if v~=nil and tostring(v)~="" then return v end
  end
 end

 local function selectedStatus()
  if not State then return "WAITING",false end
  local name=selectedSection and tostring(selectedSection.Name or "") or ""
  local flags=State.Flags or {}

  if name=="Section_Farm Automation" or name=="Section_Target Filter"
      or name=="Section_Farm Position" or name=="Section_Farm Safety + Session" then
   if flags.AutoFarm then
    local target=State.CurrentTarget
    if target and target.Parent then return "FARM · "..safeText(target.Name),true end
    return safeText(State.FarmQuestPhase or State.FarmQuestStatus,"WAITING"),true
   end
   return "FARM OFF",false
  elseif string.find(name,"Boss",1,true) or name=="Section_Yeti" then
   local bossOn=flags.AutoBoss or flags.AutoYeti or flags.AutoHeartYeti
   if bossOn then
    local target=State.CurrentBoss
    if target and target.Parent then return "BOSS · "..safeText(target.Name),true end
    return safeText(getField("BossCycleStatus","BossStatus","AutoBossStatus","YetiStatus"),"SEARCHING"),true
   end
   return "BOSS OFF",false
  elseif name=="Section_Dungeon + Souls" then
   local on=flags.AutoDungeon or flags.AutoDungeonClear or flags.AutoCollectSouls or flags.AutoDungeonCards
   return on and safeText(getField("DungeonStatus","DungeonPhase","DungeonRuntimeStatus"),"DUNGEON RUNNING") or "DUNGEON OFF",on
  elseif name=="Section_Fishing" then
   local on=flags.AutoFish or flags.AutoFishing
   return on and safeText(getField("FishingStatus","FishStatus"),"FISHING") or "FISHING OFF",on
  elseif name=="Section_Chest + Loot" then
   local on=flags.AutoChestLoot or flags.AutoLootDrops
   return on and safeText(State.ChestRoutePhase or State.ChestStatus,"LOOTING") or "LOOT OFF",on
  elseif name=="Section_Auto Sell" then
   local on=flags.AutoSell
   return on and safeText(getField("SellStatus","AutoSellStatus"),"SELLING") or "SELL OFF",on
  elseif name=="Section_Muzan Quest" then
   local on=flags.AutoMuzanQuest
   return on and safeText(State.MuzanQuestStatus,"MUZAN") or "MUZAN OFF",on
  elseif name=="Section_Slayer Crow" then
   local on=flags.AutoCrowQuest
   return on and safeText(State.CrowQuestStatus,"CROW") or "CROW OFF",on
  elseif name=="Section_Training Quests" then
   local on=flags.AutoTrainingQuests
   return on and safeText(State.TrainingQuestStatus,"TRAINING") or "TRAINING OFF",on
  end

  -- Generic: any toggle inside the selected content is enough to show ON.
  local currentItem=selectedSub[selectedCategory] and findItem(selectedCategory,selectedSub[selectedCategory])
  local enabled=currentItem and sectionAnyEnabled(currentItem) or false
  return enabled and "ACTIVE" or "READY",enabled
 end

 -- Toast notifications.
 local toastHost=transparent(root,"ToastHost",1015,105,360,230)
 toastHost.ZIndex=1000
 local toastOrder=0
 local function toast(message)
  if not alive or not root.Parent then return end
  toastOrder+=1
  local holder=frame(toastHost,"Toast",0,0,350,54,Color3.fromRGB(9,19,32),14)
  holder.AnchorPoint=Vector2.new(0,0)
  holder.Position=UDim2.fromOffset(0,(toastOrder-1)%4*58)
  holder.ZIndex=1001
  border(holder,C.stroke,.12)
  local accent=frame(holder,"Accent",0,0,4,54,C.blue,2);accent.ZIndex=1002
  local textLabel=label(holder,safeText(message),16,0,320,54,12,C.text,true);textLabel.ZIndex=1002
  holder.BackgroundTransparency=1
  tween(holder,{BackgroundTransparency=0})
  task.delay(2.6,function()
   if holder and holder.Parent then
    tween(holder,{BackgroundTransparency=1})
    task.delay(.2,function() if holder and holder.Parent then holder:Destroy() end end)
   end
  end)
 end

 -- Favorite persistence.
 local favFile="A7DEV/ProjectSlayer2_ui_favorites.json"
 local favorites={}
 local function ensureFolder()
  if type(makefolder)=="function" and type(isfolder)=="function" then
   pcall(function() if not isfolder("A7DEV") then makefolder("A7DEV") end end)
  end
 end
 local function loadFavorites()
  if type(isfile)~="function" or type(readfile)~="function" then return end
  local ok,data=pcall(function()
   if not isfile(favFile) then return nil end
   return HttpService:JSONDecode(readfile(favFile))
  end)
  if ok and type(data)=="table" then
   for _,name in ipairs(data) do favorites[tostring(name)]=true end
  end
 end
 local function saveFavorites()
  if type(writefile)~="function" then return end
  ensureFolder()
  local out={}
  for name,v in pairs(favorites) do if v then out[#out+1]=name end end
  table.sort(out)
  pcall(function() writefile(favFile,HttpService:JSONEncode(out)) end)
 end
 loadFavorites()

 local favButton=create("TextButton",contentStage,{
  Name="FavoriteCurrent",
  Position=UDim2.new(1,-250,0,12),
  Size=UDim2.fromOffset(44,31),
  BackgroundColor3=C.row,
  BorderSizePixel=0,
  AutoButtonColor=false,
  Text="☆",
  Font=Enum.Font.GothamBold,
  TextSize=18,
  TextColor3=C.muted,
  ZIndex=182,
 })
 round(favButton,12);border(favButton,C.stroke,.18)

 local favListButton=create("TextButton",main,{
  Name="Favorites",
  Position=UDim2.new(1,-222,0,24),
  Size=UDim2.fromOffset(92,34),
  BackgroundColor3=C.row,
  BorderSizePixel=0,
  AutoButtonColor=false,
  Text="★ Favorites",
  Font=Enum.Font.GothamMedium,
  TextSize=11,
  TextColor3=C.muted,
  ZIndex=170,
 })
 round(favListButton,11);border(favListButton,C.stroke,.20)

 local profilesButton=create("TextButton",main,{
  Name="Profiles",
  Position=UDim2.new(1,-122,0,24),
  Size=UDim2.fromOffset(92,34),
  BackgroundColor3=C.row,
  BorderSizePixel=0,
  AutoButtonColor=false,
  Text="Profiles",
  Font=Enum.Font.GothamMedium,
  TextSize=11,
  TextColor3=C.muted,
  ZIndex=170,
 })
 round(profilesButton,11);border(profilesButton,C.stroke,.20)

 local overlay=frame(main,"AdvancedOverlay",31,88,863,347,Color3.fromRGB(7,14,24),18)
 overlay.ZIndex=500
 overlay.Visible=false
 border(overlay,C.stroke,.08)
 gradient(overlay,Color3.fromRGB(10,20,34),Color3.fromRGB(6,12,21),25)
 local overlayTitle=label(overlay,"Favorites",20,14,600,28,18,C.text,true);overlayTitle.ZIndex=501
 local overlayClose=create("TextButton",overlay,{
  Position=UDim2.new(1,-48,0,10),Size=UDim2.fromOffset(36,36),
  BackgroundColor3=C.row,BorderSizePixel=0,AutoButtonColor=false,Text="×",
  Font=Enum.Font.GothamBold,TextSize=18,TextColor3=C.muted,ZIndex=502,
 })
 round(overlayClose,10);border(overlayClose,C.stroke,.22)
 local overlayBody=transparent(overlay,"Body",20,56,823,274);overlayBody.ZIndex=501

 local function navigateToSection(sectionName)
  for _,category in ipairs(navNames) do
   for _,item in ipairs(categorySections[category] or {}) do
    if item.name==sectionName then
     switchCategory(category)
     showSub(sectionName)
     overlay.Visible=false
     return true
    end
   end
  end
  return false
 end

 local function rebuildFavoritesOverlay()
  for _,child in ipairs(overlayBody:GetChildren()) do child:Destroy() end
  overlayTitle.Text="Favorites"
  local names={}
  for name,v in pairs(favorites) do if v then names[#names+1]=name end end
  table.sort(names)
  if #names==0 then
   local empty=label(overlayBody,"No favorites yet. Open a section and press ☆.",0,20,823,30,13,C.muted,false)
   empty.TextXAlignment=Enum.TextXAlignment.Center
   return
  end
  local cols=2
  local gap=10
  local w=(823-gap)/2
  for i,name in ipairs(names) do
   local col=(i-1)%cols
   local rowIndex=math.floor((i-1)/cols)
   local b=create("TextButton",overlayBody,{
    Position=UDim2.fromOffset(col*(w+gap),rowIndex*48),
    Size=UDim2.fromOffset(w,40),BackgroundColor3=C.row,BorderSizePixel=0,
    AutoButtonColor=false,Text="★  "..(SUB_LABELS[name] or name:gsub("^Section_","")),
    Font=Enum.Font.GothamMedium,TextSize=12,TextColor3=C.text,ZIndex=502,
   })
   round(b,10);border(b,C.stroke,.20)
   connect(b.Activated,function() navigateToSection(name) end)
  end
 end

 local function refreshFavoriteButton()
  local name=selectedSection and selectedSection.Name
  local on=name and favorites[name] or false
  favButton.Text=on and "★" or "☆"
  favButton.TextColor3=on and C.bright or C.muted
  favButton.BackgroundColor3=on and Color3.fromRGB(12,48,88) or C.row
 end

 connect(favButton.Activated,function()
  local name=selectedSection and selectedSection.Name
  if not name then return end
  favorites[name]=not favorites[name]
  saveFavorites()
  refreshFavoriteButton()
 end)
 connect(favListButton.Activated,function()
  rebuildFavoritesOverlay()
  overlay.Visible=true
 end)
 connect(overlayClose.Activated,function() overlay.Visible=false end)

 -- Multi-profile config slots.
 local profileFile="A7DEV/ProjectSlayer2_ui_profiles.json"
 local profiles={}
 local profileNames={"Farm","Boss","Dungeon","Fishing"}
 local function loadProfiles()
  if type(isfile)~="function" or type(readfile)~="function" then return end
  local ok,data=pcall(function()
   if not isfile(profileFile) then return nil end
   return HttpService:JSONDecode(readfile(profileFile))
  end)
  if ok and type(data)=="table" then profiles=data end
 end
 local function writeProfiles()
  if type(writefile)~="function" then return false end
  ensureFolder()
  return pcall(function() writefile(profileFile,HttpService:JSONEncode(profiles)) end)
 end
 loadProfiles()

 local function captureProfile()
  local data={controls={},inputs={},farmStyle=State and State.FarmStyle or nil}
  if runtime then
   for labelName,control in pairs(runtime.ToggleControls or {}) do
    if control and type(control.Get)=="function" then
     local ok,v=pcall(control.Get)
     if ok then data.controls[labelName]=v==true end
    end
   end
   for labelName,control in pairs(runtime.InputControls or {}) do
    local box=control and control.Box
    if box and box.Parent then data.inputs[labelName]=box.Text end
   end
  end
  return data
 end
 local function applyProfile(data)
  if type(data)~="table" or not runtime then return false end
  for labelName,value in pairs(type(data.controls)=="table" and data.controls or {}) do
   local control=(runtime.ToggleControls or {})[labelName]
   if control and type(control.Set)=="function" then
    local ok,current=pcall(control.Get)
    if not ok or current~=value then pcall(control.Set,value) end
   end
  end
  for labelName,value in pairs(type(data.inputs)=="table" and data.inputs or {}) do
   local control=(runtime.InputControls or {})[labelName]
   local box=control and control.Box
   if box and box.Parent then
    box.Text=tostring(value)
    if type(control.Apply)=="function" then pcall(control.Apply,box.Text) end
   end
  end
  if State and (data.farmStyle=="Behind" or data.farmStyle=="Above" or data.farmStyle=="Under") then
   State.FarmStyle=data.farmStyle
  end
  syncRuntimeToggles()
  enlargeRuntimeInputs()
  return true
 end

 local function rebuildProfilesOverlay()
  for _,child in ipairs(overlayBody:GetChildren()) do child:Destroy() end
  overlayTitle.Text="Config Profiles"
  for i,name in ipairs(profileNames) do
   local y=(i-1)*56
   local card=frame(overlayBody,"Profile_"..name,0,y,823,46,C.row,11);card.ZIndex=502
   border(card,C.stroke,.20)
   local n=label(card,name,14,0,190,46,13,C.text,true);n.ZIndex=503
   local save=create("TextButton",card,{
    Position=UDim2.new(1,-214,0,7),Size=UDim2.fromOffset(92,32),
    BackgroundColor3=Color3.fromRGB(12,48,88),BorderSizePixel=0,AutoButtonColor=false,
    Text="Save",Font=Enum.Font.GothamMedium,TextSize=11,TextColor3=C.bright,ZIndex=503,
   })
   round(save,9);border(save,C.blue,.18)
   local load=create("TextButton",card,{
    Position=UDim2.new(1,-112,0,7),Size=UDim2.fromOffset(92,32),
    BackgroundColor3=C.background,BorderSizePixel=0,AutoButtonColor=false,
    Text=profiles[name] and "Load" or "Empty",Font=Enum.Font.GothamMedium,TextSize=11,
    TextColor3=profiles[name] and C.text or C.dim,ZIndex=503,
   })
   round(load,9);border(load,C.stroke,.22)
   connect(save.Activated,function()
    profiles[name]=captureProfile()
    writeProfiles()
    toast(name.." profile saved")
    rebuildProfilesOverlay()
   end)
   connect(load.Activated,function()
    if profiles[name] and applyProfile(profiles[name]) then
     toast(name.." profile loaded")
    end
   end)
  end

  local restore=create("TextButton",overlayBody,{
   Position=UDim2.fromOffset(0,234),Size=UDim2.fromOffset(823,38),
   BackgroundColor3=Color3.fromRGB(24,28,38),BorderSizePixel=0,AutoButtonColor=false,
   Text="Restore last working TEST UI (V16)",Font=Enum.Font.GothamMedium,TextSize=11,
   TextColor3=C.muted,ZIndex=502,
  })
  round(restore,10);border(restore,C.stroke,.20)
  connect(restore.Activated,function()
   toast("Restoring V16 UI")
   task.defer(function()
    local ok,src=pcall(game.HttpGet,game,"https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/hubs/project-slayer-2/ui_reference_v16.lua")
    if not ok then toast("V16 download failed") return end
    local fn=loadstring(src)
    if not fn then toast("V16 compile failed") return end
    local stop=ENV.A7DEV_PS2_REFERENCE_V17_STOP
    if type(stop)=="function" then pcall(stop) end
    task.wait(.08)
    pcall(fn)
   end)
  end)
 end

 connect(profilesButton.Activated,function()
  rebuildProfilesOverlay()
  overlay.Visible=true
 end)

 -- Quick toggle actions bound directly to existing runtime controls.
 local quickDefs={
  {text="Farm",names={"Auto Farm"}},
  {text="Boss",names={"Auto Boss"}},
  {text="Dungeon",names={"Auto Dungeon","Auto Dungeon Clear","Dungeon Auto Clear"}},
  {text="Fishing",names={"Auto Fish","Auto Fishing"}},
 }
 local quickButtons={}
 for i,def in ipairs(quickDefs) do
  local b=create("TextButton",main,{
   Name="Quick_"..def.text,
   Position=UDim2.fromOffset(500+(i-1)*96,28),
   Size=UDim2.fromOffset(86,28),
   BackgroundColor3=C.row,BorderSizePixel=0,AutoButtonColor=false,
   Text=def.text,Font=Enum.Font.GothamMedium,TextSize=10,TextColor3=C.muted,ZIndex=171,
  })
  round(b,9);border(b,C.stroke,.25)
  quickButtons[#quickButtons+1]={button=b,def=def}
  connect(b.Activated,function()
   local _,control=findToggle(def.names)
   if control and type(control.Set)=="function" then
    control.Set(not toggleValue(control))
    syncRuntimeToggles()
   else
    toast(def.text.." control unavailable")
   end
  end)
 end

 local function refreshQuick()
  for _,entry in ipairs(quickButtons) do
   local _,control=findToggle(entry.def.names)
   local on=toggleValue(control)
   entry.button.BackgroundColor3=on and Color3.fromRGB(12,48,88) or C.row
   entry.button.TextColor3=on and C.bright or C.muted
   local stroke=entry.button:FindFirstChildOfClass("UIStroke")
   if stroke then stroke.Color=on and C.blue or C.stroke end
  end
 end

 -- Wrap navigation to refresh Favorite state and status immediately.
 local baseShowSub=showSub
 showSub=function(name)
  baseShowSub(name)
  refreshFavoriteButton()
 end

 -- State-change notifications and compact subsystem status.
 local last={
  chest=State and tonumber(State.ChestOpened) or 0,
  loot=State and tonumber(State.LootCollected) or 0,
  kills=State and tonumber(State.SessionKills) or 0,
  boss=nil,
  quest=State and tostring(State.FarmQuestStatus or "") or "",
  recoveries=State and tonumber(State.QuestRecoveries) or 0,
 }
 task.spawn(function()
  while alive and root.Parent do
   if root.Visible and not collapsed then
    State=ENV.A7DEV_PROJECT_SLAYER_2
    runtime=State and State.Runtime
    local status,on=selectedStatus()
    statusText.Text=string.upper(safeText(status,"READY"))
    statusText.TextColor3=on and C.text or C.muted
    statusDot.BackgroundColor3=on and C.bright or C.dim

    refreshQuick()
    updateSubVisuals()

    if State then
     local chest=tonumber(State.ChestOpened) or 0
     local loot=tonumber(State.LootCollected) or 0
     local kills=tonumber(State.SessionKills) or 0
     local recoveries=tonumber(State.QuestRecoveries) or 0
     if chest>last.chest then toast("Chest opened  •  "..chest) end
     if loot>last.loot then toast("Loot collected  •  "..loot) end
     if kills>last.kills and (State.Flags and State.Flags.AutoFarm) then toast("Farm kill  •  "..kills) end
     if recoveries>last.recoveries then toast("Quest watchdog recovery  •  "..recoveries) end
     last.chest,last.loot,last.kills,last.recoveries=chest,loot,kills,recoveries

     local boss=State.CurrentBoss
     local bossName=boss and boss.Parent and tostring(boss.Name) or nil
     if bossName and bossName~=last.boss and State.Flags and State.Flags.AutoBoss then
      toast("Boss target  •  "..bossName)
     end
     last.boss=bossName

     local quest=tostring(State.FarmQuestStatus or "")
     if quest~=last.quest and (
       string.find(string.lower(quest),"complete",1,true)
       or string.find(string.lower(quest),"watchdog",1,true)
       or string.find(string.lower(quest),"lv.",1,true)
      ) then
      toast(quest)
     end
     last.quest=quest
    end

    -- UI watchdog only: reassert selected content and keep legacy UI hidden.
    local item=selectedSub[selectedCategory] and findItem(selectedCategory,selectedSub[selectedCategory])
    if item and item.content and item.content.Parent then
     if not item.content.Visible then item.content.Visible=true end
     sizeHolder(item.content,pages[selectedCategory])
    end
    if legacyMain and legacyMain.Parent and legacyMain.Visible then legacyMain.Visible=false end
   end
   task.wait(.65)
  end
 end)

 -- Keep layout responsive when viewport/touch changes.
 local function refreshResponsive()
  if alive and selectedCategory then rebuildSubNav(selectedCategory) end
 end
 connect(UserInputService:GetPropertyChangedSignal("TouchEnabled"),function() task.defer(refreshResponsive) end)
 if workspace.CurrentCamera then
  connect(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"),function()
   task.delay(.05,refreshResponsive)
  end)
 end

 refreshFavoriteButton()
 refreshQuick()
end

local profile=frame(body,"Profile",952,248,450,130,C.panel,25)
profile.ZIndex=240
profile.Visible=true
border(profile)
local avatar=frame(profile,"Avatar",28,20,93,93,Color3.fromRGB(8,19,36),47)
border(avatar,Color3.fromRGB(33,67,116))
local avatarFallback=logo(avatar,15,23,64,51)
local avatarImage=create("ImageLabel",avatar,{Name="PlayerPortrait",BackgroundTransparency=1,Size=UDim2.fromScale(1,1),Image=""})
round(avatarImage,47)
local thumbnailGeneration=0
local function refreshAvatar()
 thumbnailGeneration=thumbnailGeneration+1
 local generation=thumbnailGeneration
 task.spawn(function()
  for attempt=1,3 do
   if not alive or generation~=thumbnailGeneration then return end
   local ok,url,ready=pcall(function()
    return Players:GetUserThumbnailAsync(localPlayer.UserId,Enum.ThumbnailType.HeadShot,Enum.ThumbnailSize.Size180x180)
   end)
   if not alive or generation~=thumbnailGeneration then return end
   if ok and ready then avatarImage.Image=url;avatarFallback.Visible=false;return end
   if attempt<3 then task.wait(2) end
  end
 end)
end
refreshAvatar()
connect(localPlayer.CharacterAppearanceLoaded,refreshAvatar)
local online=frame(profile,"Online",102,93,17,17,Color3.fromRGB(0,218,161),9)
border(online,C.background)
local displayName=label(profile,localPlayer.DisplayName,145,36,275,32,22,C.text,true)
displayName.TextTruncate=Enum.TextTruncate.AtEnd
local username=label(profile,"@"..localPlayer.Name,145,71,275,27,18,C.blue,true)
username.TextTruncate=Enum.TextTruncate.AtEnd
connect(localPlayer:GetPropertyChangedSignal("DisplayName"),function() displayName.Text=localPlayer.DisplayName end)

local performance=frame(body,"Performance",952,394,450,139,C.panel,25)
performance.ZIndex=240
performance.Visible=true
border(performance)
local gauge=frame(performance,"Gauge",28,23,58,58,C.row,29)
border(gauge)
icon(gauge,"gauge",10,10,38,C.bright)
label(performance,"Performance",106,24,300,30,21,C.text,true)
local bar=frame(performance,"ProgressTrack",28,99,394,14,Color3.fromRGB(16,29,49),7)
local fill=frame(bar,"Progress",0,0,0,14,C.blue,7)
gradient(fill,C.blue,C.bright,0)
local fpsLabel=label(performance,"-- FPS",106,55,150,24,16,C.text,true)
local pingLabel=label(performance,"-- ms",274,55,150,24,16,C.muted)
local fpsTime,frameCount,pingTime=0,0,0
connect(RunService.RenderStepped,function(dt)
 fpsTime=fpsTime+dt;frameCount=frameCount+1
 if fpsTime>=.5 then
  local fps=frameCount/fpsTime
  if root.Visible and not collapsed then
   fpsLabel.Text=string.format("%d FPS",math.floor(fps+.5))
   tween(fill,{Size=UDim2.fromOffset(394*math.clamp(fps/60,0,1),14)}):Play()
  end
  fpsTime=0;frameCount=0
 end
end)
connect(RunService.Heartbeat,function(dt)
 pingTime=pingTime+dt
 if pingTime<1 then return end
 pingTime=0
 if not root.Visible or collapsed then return end
 local ok,seconds=pcall(function() return localPlayer:GetNetworkPing() end)
 pingLabel.Text=ok and string.format("Ping  %d ms",math.floor(seconds*1000+.5)) or "Ping  -- ms"
end)

local session=frame(body,"Session",952,551,450,157,C.panel,25)
session.ZIndex=240
session.Visible=true
border(session)
icon(session,"user",28,23,26,C.bright)
label(session,"Session",68,19,340,32,21,C.text,true)
line(session,224,65,224,131,C.stroke,1)
label(session,"Players",28,65,178,24,16,C.muted)
label(session,"Elapsed time",248,65,178,24,16,C.muted)
local playerCount=label(session,"",28,94,178,36,26,C.text,true)
local elapsedLabel=label(session,"00:00:00",248,94,178,36,25,C.text,true)
local function updatePlayerCount(leaving)
 local count=0
 for _,player in ipairs(Players:GetPlayers()) do
  if player~=leaving then count=count+1 end
 end
 playerCount.Text=tostring(count)
end
connect(Players.PlayerAdded,function() updatePlayerCount() end)
connect(Players.PlayerRemoving,updatePlayerCount)
updatePlayerCount()
local lastSecond=-1
connect(RunService.Heartbeat,function()
 local elapsed=math.floor(os.clock()-sessionStarted)
 if elapsed==lastSecond then return end
 lastSecond=elapsed
 elapsedLabel.Text=string.format("%02d:%02d:%02d",math.floor(elapsed/3600),math.floor(elapsed/60)%60,elapsed%60)
end)

local function liftRightCard(card)
 card.Visible=true
 card.ZIndex=240
 for _,d in ipairs(card:GetDescendants()) do
  if d:IsA("GuiObject") then d.ZIndex=math.max(241,d.ZIndex) end
 end
end
liftRightCard(profile)
liftRightCard(performance)
liftRightCard(session)

task.spawn(function()
 while alive and root.Parent do
  if not collapsed and body.Visible then
   if not profile.Visible then profile.Visible=true end
   if not performance.Visible then performance.Visible=true end
   if not session.Visible then session.Visible=true end
  end
  if legacyMain and legacyMain.Parent and legacyMain.Visible then legacyMain.Visible=false end
  task.wait(.25)
 end
end)
local reopen=button(gui,"A7DEV_PS2_REFERENCE_V17_REOPEN",14,120,48,48)
reopen.BackgroundColor3=C.background;reopen.BackgroundTransparency=0
round(reopen,14);border(reopen,C.blue)
local reopenText=label(reopen,"A7",0,0,48,48,18,C.text,true);reopenText.TextXAlignment=Enum.TextXAlignment.Center
reopen.Visible=false
local function setVisible(visible)
 root.Visible=visible
 for _,shadow in ipairs(shadows) do shadow.Visible=visible end
 reopen.Visible=not visible
 dragging=false;dragTouch=nil
end
connect(minimize.Activated,function()
 collapsed=not collapsed
 body.Visible=not collapsed
 root.Size=UDim2.fromOffset(1404,collapsed and 94 or 824)
 place(root.Position.X.Offset,root.Position.Y.Offset)
end)
connect(resize.Activated,function() compact=not compact;fit() end)
connect(close.Activated,function() setVisible(false) end)
connect(reopen.Activated,function() setVisible(true) end)
connect(UserInputService.InputBegan,function(input,processed)
 if not processed and input.KeyCode==Enum.KeyCode.RightShift then setVisible(not root.Visible) end
end)
connect(gui.Destroying,function()
 alive=false
 if cameraConnection then cameraConnection:Disconnect() end
end)

task.spawn(function()
 local ok,message=pcall(function()
  game:GetService("ContentProvider"):PreloadAsync(iconImages,function(contentId,status)
   if alive and status==Enum.AssetFetchStatus.Failure then
    warn("A7: icon texture unavailable: "..contentId)
   end
  end)
 end)
 if not ok and alive then warn("A7: icon preload failed: "..tostring(message)) end
end)

local function stopReferenceV5()
 if not alive then return end
 alive=false
 if cameraConnection then pcall(function() cameraConnection:Disconnect() end) end
 for _,c in ipairs(connections) do pcall(function() c:Disconnect() end) end
 for section,state in pairs(nativeState) do
  if section and state and state.parent and state.parent.Parent then
   pcall(function()
    section.Parent=state.parent
    section.Position=state.position
    section.Size=state.size
    section.LayoutOrder=state.layoutOrder
    section.AutomaticSize=state.automaticSize
    section.Visible=state.visible
    section.ZIndex=state.zindex
   end)
  end
 end
 for holder,state in pairs(nativeContentState) do
  if holder and state and state.parent and state.parent.Parent then
   pcall(function()
    holder.Parent=state.parent
    holder.Position=state.position
    holder.Size=state.size
    holder.AutomaticSize=state.automaticSize
    holder.Visible=state.visible
    holder.ZIndex=state.zindex
   end)
  end
 end
 if legacyMain and legacyMain.Parent then legacyMain.Visible=false end
 if reopen and reopen.Parent then pcall(function() reopen:Destroy() end) end
 for _,shadow in ipairs(shadows) do
  if shadow and shadow.Parent then pcall(function() shadow:Destroy() end) end
 end
 if root and root.Parent then pcall(function() root:Destroy() end) end
 ENV.A7DEV_PS2_REFERENCE_V17_STOP=nil
end
ENV.A7DEV_PS2_REFERENCE_V17_STOP=stopReferenceV5
