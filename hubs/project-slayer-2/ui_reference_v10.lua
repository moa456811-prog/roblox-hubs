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
 warn("[A7DEV REFERENCE V10] Slayer 2 GUI not found")
 return
end

local legacyMain=slayerGui:FindFirstChild("Main")
if not legacyMain then
 warn("[A7DEV REFERENCE V10] Slayer 2 Main frame not found")
 return
end

-- IMPORTANT:
-- Older BlackLight shells physically re-parent the real native Section_* controls.
-- Their stop routine destroys its shell before restoring those sections. If we call it
-- directly, the gameplay controls can be destroyed with the old shell.
-- Evacuate every live native section first so callbacks/instances survive cleanup.
local evac=Instance.new("Frame")
evac.Name="A7DEV_PS2_REFERENCE_V10_EVAC"
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
 "A7DEV_PS2_REFERENCE_V10_STOP",
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

local legacyMainVisible=legacyMain.Visible
local nativeState={}
local nativeSections={}
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
 warn("[A7DEV REFERENCE V10] No native Slayer 2 sections were recovered")
 if evac and evac.Parent then evac:Destroy() end
 return
end

-- Remove stale reference-only shells after controls are safe.
for _,name in ipairs({
 "A7DEV_PS2_REFERENCE_V10","A7DEV_PS2_REFERENCE_V10_REOPEN",
 "A7DEV_PS2_REFERENCE_V3","A7DEV_PS2_REFERENCE_V3_REOPEN",
}) do
 local old=slayerGui:FindFirstChild(name)
 if old then pcall(function() old:Destroy() end) end
end
for i=1,4 do
 for _,prefixName in ipairs({"A7DEV_PS2_REFERENCE_V10_SHADOW","A7DEV_PS2_REFERENCE_V3_SHADOW"}) do
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
 local shadow=frame(gui,"A7DEV_PS2_REFERENCE_V10_SHADOW"..i,0,0,1404,824,Color3.new(0,0,0),24+i*3)
 shadow.BackgroundTransparency=.91
 shadow.ZIndex=1
 table.insert(shadows,shadow)
end
local root=frame(gui,"A7DEV_PS2_REFERENCE_V10",0,0,1404,824,C.background,24)
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

 section.Parent=page
 section.Position=UDim2.fromOffset(0,0)
 section.LayoutOrder=order
 section.ZIndex=155
 section.Visible=false
 for _,desc in ipairs(section:GetDescendants()) do
  if desc:IsA("GuiObject") then
   desc.ZIndex=math.max(156,desc.ZIndex)
  end
 end
 sectionCategory[section]=category
 sectionName[section]=section.Name

 if not categoryHas(category,section) then
  categorySections[category][#categorySections[category]+1]={section=section,name=section.Name,order=order}
  table.sort(categorySections[category],function(a,b)
   if a.order==b.order then return a.name<b.name end
   return a.order<b.order
  end)
 end

 styleSection(section)
end

for _,section in ipairs(nativeSections) do
 routeSection(section)
end
if evac and evac.Parent then pcall(function() evac:Destroy() end) end
legacyMain.Visible=false

-- =========================================================
-- V6 READABILITY + BLUE TOGGLE LAYER
-- Keeps native callbacks/state, changes presentation only.
-- =========================================================
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
   if child:IsA("Frame") and child.Name~="A7DEV_BLUE_SWITCH_V10" then
    local w=child.AbsoluteSize.X>0 and child.AbsoluteSize.X or child.Size.X.Offset
    local h=child.AbsoluteSize.Y>0 and child.AbsoluteSize.Y or child.Size.Y.Offset
    if w>0 and w<=34 and h>0 and h<=34 then
     child.Visible=false
    end
   end
  end
 end

 local function ensureBlueSwitch(row)
  local track=row:FindFirstChild("A7DEV_BLUE_SWITCH_V10")
  if not track then
   track=create("Frame",row,{
    Name="A7DEV_BLUE_SWITCH_V10",
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
   task.wait(.35)
   syncAllToggles()
  end
 end)
end

local selectedCategory="home"
local selectedSection=nil
local visibleGuards=setmetatable({}, {__mode="k"})

local function reviveSectionControls(section)
 if not section or not section.Parent then return end
 section.ZIndex=155
 for _,child in ipairs(section:GetChildren()) do
  if child:IsA("TextButton") or child:IsA("TextBox") or child:IsA("TextLabel") then
   child.Visible=true
   child.ZIndex=math.max(156,child.ZIndex)
  elseif child:IsA("ScrollingFrame") then
   child.Visible=true
   child.ZIndex=math.max(156,child.ZIndex)
  end
 end
 for _,desc in ipairs(section:GetDescendants()) do
  if desc:IsA("GuiObject") then
   desc.ZIndex=math.max(156,desc.ZIndex)
  end
 end
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

local function updateSubVisuals()
 for name,buttonObject in pairs(subButtons) do
  local active=selectedSub[selectedCategory]==name
  buttonObject.BackgroundColor3=active and Color3.fromRGB(12,48,88) or C.row
  buttonObject.TextColor3=active and C.bright or C.muted
  local stroke=buttonObject:FindFirstChildOfClass("UIStroke")
  if stroke then
   stroke.Color=active and C.blue or C.stroke
   stroke.Transparency=active and .05 or .35
  end
 end
end

local function showSub(name)
 local items=categorySections[selectedCategory] or {}
 local selected=findItem(selectedCategory,name) or items[1]
 if not selected or not selected.section then return end

 selectedSub[selectedCategory]=selected.name
 selectedSection=selected.section

 local currentPage=pages[selectedCategory]
 if currentPage and currentPage:IsA("ScrollingFrame") then
  currentPage.CanvasPosition=Vector2.zero
 end

 for _,item in ipairs(items) do
  if item.section and item.section.Parent then
   item.section.Visible=(item==selected)
  end
 end

 local section=selected.section
 if section and section.Parent then
  section.Position=UDim2.fromOffset(0,0)
  section.Size=UDim2.new(1,0,0,math.max(96,section.Size.Y.Offset))
  section.Visible=true
  styleSection(section)
  reviveSectionControls(section)
  guardSelectedVisibility(section)

  stageTitle.Text=SUB_LABELS[selected.name] or selected.name:gsub("^Section_","")
  local meta=categoryMeta[selectedCategory] or categoryMeta.home
  stageHint.Text=string.upper(meta.title).."  •  SLAYER 2"

  -- Some native presentation handlers finish one frame after a re-parent.
  -- Reassert only the selected section; do not touch gameplay callbacks.
  task.defer(function()
   if alive and selectedSection==section and section.Parent then
    section.Visible=true
    reviveSectionControls(section)
   end
  end)
  task.delay(.10,function()
   if alive and selectedSection==section and section.Parent then
    section.Visible=true
    reviveSectionControls(section)
   end
  end)
 end

 updateSubVisuals()
end

local function rebuildSubNav(category)
 clearSubNav()
 local items=categorySections[category] or {}
 if #items==0 then return end

 local columns=math.min(5,math.max(1,#items))
 local rows=math.ceil(#items/columns)
 local gap=8
 local rowHeight=30
 local width=(863-gap*(columns-1))/columns

 for index,item in ipairs(items) do
  local col=(index-1)%columns
  local rowIndex=math.floor((index-1)/columns)
  local b=create("TextButton",subNav,{
   Name="Sub_"..item.name:gsub("[^%w]","_"),
   Position=UDim2.fromOffset(math.floor(col*(width+gap)),rowIndex*(rowHeight+7)),
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
  subButtons[item.name]=b
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

local function applySearch()
 local query=string.lower(tostring(search.Text or "")):match("^%s*(.-)%s*$")
 if query=="" then
  local current=selectedSub[selectedCategory]
  if current then showSub(current) end
  return
 end

 for _,item in ipairs(categorySections[selectedCategory] or {}) do
  if item.section and string.find(searchRows[item.section] or "",query,1,true)~=nil then
   showSub(item.name)
   return
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
 local p=object.Parent
 while p and p~=gui do
  if p:IsA("Frame") and string.sub(p.Name or "",1,8)=="Section_" then
   local section=p
   task.delay(.05,function()
    if alive and section.Parent then
     styleSection(section)
     searchRows[section]=sectionText(section)
     applySearch()
    end
   end)
   break
  end
  p=p.Parent
 end
end)

switchCategory("home")

local profile=frame(body,"Profile",952,248,450,130,C.panel,25)
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
local reopen=button(gui,"A7DEV_PS2_REFERENCE_V10_REOPEN",14,120,48,48)
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
 if legacyMain and legacyMain.Parent then legacyMain.Visible=legacyMainVisible end
 if reopen and reopen.Parent then pcall(function() reopen:Destroy() end) end
 for _,shadow in ipairs(shadows) do
  if shadow and shadow.Parent then pcall(function() shadow:Destroy() end) end
 end
 if root and root.Parent then pcall(function() root:Destroy() end) end
 ENV.A7DEV_PS2_REFERENCE_V10_STOP=nil
end
ENV.A7DEV_PS2_REFERENCE_V10_STOP=stopReferenceV5
