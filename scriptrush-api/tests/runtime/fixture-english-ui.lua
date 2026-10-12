-- Positive control for the English UI requirement; not a generated result.
local Players=game:GetService("Players")
local gui=Instance.new("ScreenGui")
gui.Name="FixtureEnglish"
gui.Parent=Players.LocalPlayer:WaitForChild("PlayerGui")
local function make(class,parent,properties)
    local object=Instance.new(class)
    for key,value in pairs(properties) do object[key]=value end
    object.Parent=parent
    return object
end
local navy=Color3.fromRGB(18,24,42)
local cyan=Color3.fromRGB(85,221,255)
local panel=make("Frame",gui,{Size=UDim2.fromOffset(420,280),Position=UDim2.fromOffset(100,100),BackgroundColor3=navy})
make("TextLabel",panel,{Name="Title",Text="Aurora Panel",Size=UDim2.new(1,-100,0,40),TextColor3=cyan,BackgroundTransparency=1})
local close=make("TextButton",panel,{Name="CloseButton",Text="Close",Size=UDim2.fromOffset(90,34),Position=UDim2.new(1,-95,0,3),BackgroundColor3=cyan})
local home=make("TextButton",panel,{Name="HomeTab",Text="Home",Size=UDim2.fromOffset(140,32),Position=UDim2.fromOffset(10,46),BackgroundColor3=cyan})
local settings=make("TextButton",panel,{Name="SettingsTab",Text="Settings",Size=UDim2.fromOffset(140,32),Position=UDim2.fromOffset(160,46),BackgroundColor3=navy})
local homePage=make("Frame",panel,{Name="HomePage",Position=UDim2.fromOffset(10,86),Size=UDim2.new(1,-20,1,-96),BackgroundColor3=navy})
local settingsPage=make("Frame",panel,{Name="SettingsPage",Position=UDim2.fromOffset(10,86),Size=UDim2.new(1,-20,1,-96),BackgroundColor3=navy,Visible=false})
make("TextLabel",homePage,{Text="Welcome",Size=UDim2.fromOffset(200,40),TextColor3=cyan,BackgroundTransparency=1})
make("TextLabel",settingsPage,{Text="Preferences",Size=UDim2.fromOffset(200,40),TextColor3=cyan,BackgroundTransparency=1})
home.Activated:Connect(function() homePage.Visible=true;settingsPage.Visible=false;home.BackgroundColor3=cyan;settings.BackgroundColor3=navy end)
settings.Activated:Connect(function() homePage.Visible=false;settingsPage.Visible=true;home.BackgroundColor3=navy;settings.BackgroundColor3=cyan end)
close.Activated:Connect(function() gui:Destroy() end)
