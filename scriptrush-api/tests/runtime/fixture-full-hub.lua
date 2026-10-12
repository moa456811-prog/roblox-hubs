-- Positive control for the mock, not a generated product result.
local Players=game:GetService("Players")
local UIS=game:GetService("UserInputService")
local Teleport=game:GetService("TeleportService")
local player=Players.LocalPlayer
local gui=Instance.new("ScreenGui")
gui.Name="FixtureFullHub"
gui.Parent=player:WaitForChild("PlayerGui")
local connections={}
local function own(signal,callback) local c=signal:Connect(callback);table.insert(connections,c);return c end
local function make(class,parent,properties)
    local object=Instance.new(class)
    for key,value in pairs(properties) do object[key]=value end
    object.Parent=parent
    return object
end
local navy=Color3.fromRGB(18,24,42)
local cyan=Color3.fromRGB(85,221,255)
local panel=make("Frame",gui,{Name="Panel",Size=UDim2.fromOffset(480,360),Position=UDim2.fromOffset(100,100),BackgroundColor3=navy})
make("UICorner",panel,{CornerRadius=UDim.new(0,12)})
local header=make("Frame",panel,{Name="Header",Size=UDim2.new(1,0,0,40),BackgroundColor3=navy,Active=true})
make("TextLabel",header,{Text="Aurora Hub",Size=UDim2.new(1,-100,0,40),TextColor3=cyan,BackgroundTransparency=1})
local close=make("TextButton",header,{Name="CloseButton",Text="Close",Size=UDim2.fromOffset(45,34),Position=UDim2.new(1,-48,0,3),BackgroundColor3=cyan})
local minimize=make("TextButton",header,{Name="MinimizeButton",Text="Minimize",Size=UDim2.fromOffset(45,34),Position=UDim2.new(1,-96,0,3),BackgroundColor3=cyan})
local restore=make("TextButton",gui,{Name="RestoreButton",Text="Restore",Size=UDim2.fromOffset(100,40),Position=UDim2.fromOffset(10,10),BackgroundColor3=cyan,Visible=false})
local pages={}
local tabs={}
for index,name in ipairs({"Movement","Session","Settings"}) do
    pages[index]=make("Frame",panel,{Name=name.."Page",Size=UDim2.new(1,-20,1,-96),Position=UDim2.fromOffset(10,86),BackgroundColor3=navy,Visible=index==1})
    tabs[index]=make("TextButton",panel,{Name=name.."Tab",Text=name,Size=UDim2.fromOffset(140,32),Position=UDim2.fromOffset(10+(index-1)*150,46),BackgroundColor3=index==1 and cyan or navy})
    own(tabs[index].Activated,function() for n,page in ipairs(pages) do page.Visible=n==index;tabs[n].BackgroundColor3=n==index and cyan or navy end end)
end
local function numeric(id,label,y,min,max,value,callback)
    local row=make("Frame",pages[1],{Name=id.."Row",Position=UDim2.fromOffset(0,y),Size=UDim2.new(1,0,0,50),BackgroundColor3=navy})
    make("TextLabel",row,{Text=label,Size=UDim2.fromOffset(140,40),BackgroundTransparency=1,TextColor3=cyan})
    local input=make("TextBox",row,{Name="input_"..id,Text=tostring(value),PlaceholderText=label,Position=UDim2.fromOffset(150,5),Size=UDim2.fromOffset(140,36),BackgroundColor3=navy,TextColor3=cyan})
    local apply=make("TextButton",row,{Name="apply_"..id,Text="Apply",Position=UDim2.fromOffset(310,5),Size=UDim2.fromOffset(100,36),BackgroundColor3=cyan})
    own(apply.Activated,function()
        local parsed=tonumber(input.Text)
        if not parsed or parsed~=parsed or parsed<min or parsed>max then return end
        callback(parsed)
    end)
end
numeric("walk","Walk Speed",10,8,32,16,function(value) local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid");if humanoid then humanoid.WalkSpeed=value end end)
numeric("jump","Jump Power",70,20,75,50,function(value) local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid");if humanoid then humanoid.UseJumpPower=true;humanoid.JumpPower=value end end)
local rejoin=make("TextButton",pages[2],{Name="RejoinButton",Text="Rejoin",Size=UDim2.fromOffset(150,40),Position=UDim2.fromOffset(20,20),BackgroundColor3=cyan})
own(rejoin.Activated,function() Teleport:Teleport(game.PlaceId,player) end)
local theme=make("TextButton",pages[3],{Name="ThemeButton",Text="Theme",Size=UDim2.fromOffset(150,40),Position=UDim2.fromOffset(20,20),BackgroundColor3=cyan})
local alternate=false
own(theme.Activated,function() alternate=not alternate;panel.BackgroundColor3=alternate and Color3.fromRGB(24,18,34) or navy;theme.BackgroundColor3=alternate and Color3.fromRGB(170,80,255) or cyan end)
local dragging=false
local dragStart
local startPosition
own(header.InputBegan,function(input) if input.UserInputType==Enum.UserInputType.MouseButton1 then dragging=true;dragStart=input.Position;startPosition=panel.Position end end)
own(UIS.InputChanged,function(input) if dragging and input.UserInputType==Enum.UserInputType.MouseMovement then local delta=input.Position-dragStart;panel.Position=UDim2.new(startPosition.X.Scale,startPosition.X.Offset+delta.X,startPosition.Y.Scale,startPosition.Y.Offset+delta.Y) end end)
own(UIS.InputEnded,function(input) if input.UserInputType==Enum.UserInputType.MouseButton1 then dragging=false end end)
own(minimize.Activated,function() panel.Visible=false;restore.Visible=true end)
own(restore.Activated,function() panel.Visible=true;restore.Visible=false end)
own(close.Activated,function() for _,connection in ipairs(connections) do connection:Disconnect() end;gui:Destroy() end)
