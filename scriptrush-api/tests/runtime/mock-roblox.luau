-- Pure Roblox substitute for isolated QA, not a Roblox engine emulator.
-- Candidate environment is closed; host capabilities are never exposed.
local __runtimeErrors = {}
local __allInstances = {}
local __allConnections = {}
local __teleports = {}
local __logs = {}
local __deferred = {}
local __viewport = { X = 1440, Y = 900 }
local __MAX_CALLBACKS = 2000
local __callbackCount = 0
local __candidateRunning = false

local function __safeCall(callback, ...)
    __callbackCount += 1
    if __callbackCount > __MAX_CALLBACKS then error("QA callback limit exceeded", 0) end
    local ok, message = pcall(callback, ...)
    if not ok then table.insert(__runtimeErrors, tostring(message)) end
    return ok
end

local function __signal(owner, name)
    local listeners = {}
    local signal = {}
    function signal:Connect(callback)
        assert(type(callback) == "function", "Connect expects a function")
        local state = { Connected = true, callback = callback, owner = owner, name = name }
        local connection = {}
        function connection:Disconnect() state.Connected = false end
        setmetatable(connection, {
            __index = function(_, key)
                if key == "Connected" then return state.Connected end
                error("Unknown connection member: " .. tostring(key), 2)
            end,
            __newindex = function() error("Connection properties are readonly", 2) end,
        })
        state.connection = connection
        table.insert(listeners, state)
        table.insert(__allConnections, state)
        return connection
    end
    function signal:Once(callback)
        local connection
        connection = self:Connect(function(...)
            connection:Disconnect()
            callback(...)
        end)
        return connection
    end
    function signal:Wait() error("Synchronous signal waiting is unavailable in this UI QA mock", 2) end
    rawset(signal, "_fire", function(...)
        local copy = table.clone(listeners)
        for _, listener in ipairs(copy) do
            if listener.Connected then __safeCall(listener.callback, ...) end
        end
    end)
    rawset(signal, "_disconnectAll", function()
        for _, listener in ipairs(listeners) do listener.Connected = false end
    end)
    return signal
end

local __enumValues = {
    UserInputType = { "MouseButton1", "MouseButton2", "MouseMovement", "Touch", "Keyboard", "Gamepad1" },
    UserInputState = { "Begin", "Change", "End", "Cancel" },
    KeyCode = { "Unknown", "Escape", "Return", "KeypadEnter", "RightShift", "LeftShift", "Insert" },
    Font = { "SourceSans", "SourceSansBold", "Gotham", "GothamBold", "GothamMedium", "GothamSemibold", "Arial", "ArialBold", "Code", "Roboto", "RobotoMono", "BuilderSans", "BuilderSansBold", "FredokaOne", "GothamBlack" },
    FontWeight = { "Regular", "Medium", "Bold", "SemiBold" },
    FontStyle = { "Normal", "Italic" },
    TextXAlignment = { "Left", "Center", "Right" },
    TextYAlignment = { "Top", "Center", "Bottom" },
    SortOrder = { "Name", "LayoutOrder", "Custom" },
    FillDirection = { "Horizontal", "Vertical" },
    HorizontalAlignment = { "Left", "Center", "Right" },
    VerticalAlignment = { "Top", "Center", "Bottom" },
    AutomaticSize = { "None", "X", "Y", "XY" },
    ZIndexBehavior = { "Global", "Sibling" },
    ScaleType = { "Stretch", "Slice", "Tile", "Fit", "Crop" },
    EasingStyle = { "Linear", "Quad", "Cubic", "Quart", "Quint", "Sine", "Back", "Bounce", "Elastic", "Exponential", "Circular" },
    EasingDirection = { "In", "Out", "InOut" },
    ApplyStrokeMode = { "Contextual", "Border" },
    LineJoinMode = { "Round", "Bevel", "Miter" },
    ScrollingDirection = { "X", "Y", "XY" },
    ScrollBarInset = { "None", "ScrollBar", "Always" },
    ElasticBehavior = { "WhenScrollable", "Always", "Never" },
    SizeConstraint = { "RelativeXY", "RelativeXX", "RelativeYY" },
    AspectType = { "FitWithinMaxSize", "ScaleWithParentSize" },
    DominantAxis = { "Width", "Height" },
    ScreenInsets = { "None", "DeviceSafeInsets", "CoreUISafeInsets", "TopbarSafeInsets" },
    SafeAreaCompatibility = { "None", "FullscreenExtension" },
    SelectionBehavior = { "Escape", "Stop" },
}
local Enum = {}
for groupName, items in pairs(__enumValues) do
    local group = {}
    for _, name in ipairs(items) do
        group[name] = setmetatable({ Name = name, EnumType = groupName }, {
            __tostring = function() return "Enum." .. groupName .. "." .. name end,
        })
    end
    setmetatable(group, { __index = function(_, key) error("Invalid Enum." .. groupName .. "." .. tostring(key), 2) end })
    Enum[groupName] = group
end
setmetatable(Enum, { __index = function(_, key) error("Unsupported Enum group: " .. tostring(key), 2) end })

local function __vector(x, y, z)
    local value = { X = x or 0, Y = y or 0, Z = z }
    local mt = {}
    mt.__type = z == nil and "Vector2" or "Vector3"
    mt.__add = function(a, b) return __vector(a.X + b.X, a.Y + b.Y, a.Z and a.Z + (b.Z or 0) or nil) end
    mt.__sub = function(a, b) return __vector(a.X - b.X, a.Y - b.Y, a.Z and a.Z - (b.Z or 0) or nil) end
    mt.__mul = function(a, b)
        if type(a) == "number" then return __vector(a * b.X, a * b.Y, b.Z and a * b.Z or nil) end
        return __vector(a.X * b, a.Y * b, a.Z and a.Z * b or nil)
    end
    mt.__div = function(a, b) return __vector(a.X / b, a.Y / b, a.Z and a.Z / b or nil) end
    mt.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
    mt.__index = function(a, key)
        if key == "Magnitude" then return math.sqrt(a.X*a.X + a.Y*a.Y + (a.Z or 0)^2) end
        if key == "Lerp" then return function(self, other, alpha) return self + (other - self) * alpha end end
        error("Unknown vector property: " .. tostring(key), 2)
    end
    return setmetatable(value, mt)
end
local Vector2 = { new = function(x,y) return __vector(x,y,nil) end, zero = __vector(0,0,nil) }
local Vector3 = { new = function(x,y,z) return __vector(x,y,z or 0) end, zero = __vector(0,0,0) }
local UDim = { new = function(scale, offset, ...)
    assert(select("#", ...) == 0, "UDim.new accepts two arguments")
    return setmetatable({ Scale = scale or 0, Offset = offset or 0 }, { __type = "UDim" })
end }
local UDim2 = {}
function UDim2.new(xs, xo, ys, yo)
    if type(xs) == "table" then return setmetatable({ X = xs, Y = xo }, { __type = "UDim2" }) end
    return setmetatable({ X = UDim.new(xs,xo), Y = UDim.new(ys,yo) }, {
        __type = "UDim2",
        __add = function(a,b) return UDim2.new(a.X.Scale+b.X.Scale,a.X.Offset+b.X.Offset,a.Y.Scale+b.Y.Scale,a.Y.Offset+b.Y.Offset) end,
        __sub = function(a,b) return UDim2.new(a.X.Scale-b.X.Scale,a.X.Offset-b.X.Offset,a.Y.Scale-b.Y.Scale,a.Y.Offset-b.Y.Offset) end,
        __eq = function(a,b) return a.X.Scale==b.X.Scale and a.X.Offset==b.X.Offset and a.Y.Scale==b.Y.Scale and a.Y.Offset==b.Y.Offset end,
    })
end
function UDim2.fromOffset(x,y) return UDim2.new(0,x,0,y) end
function UDim2.fromScale(x,y) return UDim2.new(x,0,y,0) end
local __colorMt = { __type = "Color3" }
local Color3 = {}
function Color3.new(r,g,b) return setmetatable({ R=r or 0,G=g or 0,B=b or 0 }, __colorMt) end
function Color3.fromRGB(r,g,b) return Color3.new(r/255,g/255,b/255) end
function Color3.fromHex(hex)
    local clean = string.gsub(hex, "#", "")
    assert(#clean == 6, "Color3.fromHex expects six hex digits")
    return Color3.fromRGB(tonumber(string.sub(clean,1,2),16),tonumber(string.sub(clean,3,4),16),tonumber(string.sub(clean,5,6),16))
end
__colorMt.__eq = function(a,b) return math.abs(a.R-b.R)<1e-8 and math.abs(a.G-b.G)<1e-8 and math.abs(a.B-b.B)<1e-8 end
__colorMt.__index = {
    Lerp = function(a,b,t) return Color3.new(a.R+(b.R-a.R)*t,a.G+(b.G-a.G)*t,a.B+(b.B-a.B)*t) end,
    ToHex = function(a) return string.format("%02X%02X%02X", math.round(a.R*255),math.round(a.G*255),math.round(a.B*255)) end,
}

local __classParents = {
    ScreenGui="LayerCollector", LayerCollector="GuiBase2d", GuiBase2d="Instance",
    Frame="GuiObject", ScrollingFrame="GuiObject", TextLabel="GuiObject", TextButton="GuiButton", ImageButton="GuiButton", ImageLabel="GuiObject", TextBox="GuiObject", GuiButton="GuiObject", GuiObject="GuiBase2d",
    UICorner="UIComponent", UIStroke="UIComponent", UIGradient="UIComponent", UIPadding="UIComponent", UIListLayout="UILayout", UIGridLayout="UILayout", UIPageLayout="UILayout", UILayout="UIComponent", UISizeConstraint="UIComponent", UIAspectRatioConstraint="UIComponent", UIScale="UIComponent", UIComponent="Instance",
    Folder="Instance", PlayerGui="Instance", Player="Instance", Model="Instance", Humanoid="Instance", Workspace="Instance", Camera="Instance", NumberValue="ValueBase", StringValue="ValueBase", BoolValue="ValueBase", Color3Value="ValueBase", ValueBase="Instance",
}
local function __isA(class, wanted)
    while class do
        if class == wanted then return true end
        class = __classParents[class]
    end
    return false
end
local __commonProps = { Name=true, Parent=true, Archivable=true }
local __guiProps = {
    Active=true, Selectable=true, Visible=true, Size=true, Position=true, AnchorPoint=true, BackgroundColor3=true, BackgroundTransparency=true, BorderColor3=true, BorderSizePixel=true,
    ClipsDescendants=true, LayoutOrder=true, ZIndex=true, Rotation=true, AutomaticSize=true, SizeConstraint=true, SelectionOrder=true, SelectionImageObject=true,
    NextSelectionUp=true, NextSelectionDown=true, NextSelectionLeft=true, NextSelectionRight=true, Interactable=true, Draggable=true,
}
local __textProps = {
    Text=true, TextColor3=true, TextSize=true, TextTransparency=true, TextStrokeColor3=true, TextStrokeTransparency=true, TextScaled=true, TextWrapped=true, TextXAlignment=true, TextYAlignment=true, Font=true, FontFace=true, RichText=true, LineHeight=true, MaxVisibleGraphemes=true, OpenTypeFeatures=true,
}
local __classProps = {
    ScreenGui={Enabled=true,ResetOnSpawn=true,IgnoreGuiInset=true,DisplayOrder=true,ZIndexBehavior=true,ScreenInsets=true,SafeAreaCompatibility=true,ClipToDeviceSafeArea=true},
    TextButton={AutoButtonColor=true,Modal=true,Selected=true,Style=true},ImageButton={AutoButtonColor=true,Modal=true,Selected=true,Style=true},
    TextBox={PlaceholderText=true,PlaceholderColor3=true,ClearTextOnFocus=true,MultiLine=true,TextEditable=true,CursorPosition=true,SelectionStart=true,ShowNativeInput=true},
    ScrollingFrame={CanvasSize=true,CanvasPosition=true,AutomaticCanvasSize=true,ScrollingEnabled=true,ScrollingDirection=true,ScrollBarThickness=true,ScrollBarImageColor3=true,ScrollBarImageTransparency=true,VerticalScrollBarInset=true,HorizontalScrollBarInset=true,ElasticBehavior=true,TopImage=true,MidImage=true,BottomImage=true},
    UICorner={CornerRadius=true},UIStroke={Color=true,Thickness=true,Transparency=true,ApplyStrokeMode=true,LineJoinMode=true,Enabled=true},
    UIPadding={PaddingTop=true,PaddingBottom=true,PaddingLeft=true,PaddingRight=true},
    UIListLayout={Padding=true,FillDirection=true,HorizontalAlignment=true,VerticalAlignment=true,SortOrder=true,Wraps=true,ItemLineAlignment=true,HorizontalFlex=true,VerticalFlex=true},
    UIGridLayout={CellPadding=true,CellSize=true,FillDirection=true,FillDirectionMaxCells=true,HorizontalAlignment=true,VerticalAlignment=true,SortOrder=true,StartCorner=true},
    UIPageLayout={Animated=true,Circular=true,EasingDirection=true,EasingStyle=true,Padding=true,TweenTime=true,FillDirection=true,SortOrder=true,TouchInputEnabled=true,GamepadInputEnabled=true,ScrollWheelInputEnabled=true},
    UIGradient={Color=true,Transparency=true,Offset=true,Rotation=true,Enabled=true},
    UISizeConstraint={MinSize=true,MaxSize=true},UIAspectRatioConstraint={AspectRatio=true,AspectType=true,DominantAxis=true},UIScale={Scale=true},
    Humanoid={WalkSpeed=true,JumpPower=true,UseJumpPower=true,JumpHeight=true,Health=true,MaxHealth=true},
    Player={Character=true,UserId=true,DisplayName=true},Camera={ViewportSize=true},
    NumberValue={Value=true},StringValue={Value=true},BoolValue={Value=true},Color3Value={Value=true},
    ImageLabel={Image=true,ImageColor3=true,ImageTransparency=true,ScaleType=true,SliceCenter=true,SliceScale=true,ImageRectOffset=true,ImageRectSize=true,ResampleMode=true},
    ImageButton={Image=true,ImageColor3=true,ImageTransparency=true,ScaleType=true,SliceCenter=true,SliceScale=true,ImageRectOffset=true,ImageRectSize=true,AutoButtonColor=true,Modal=true,Selected=true},
}
local __signalsForClass = {
    Instance={"Changed","Destroying","AncestryChanged","ChildAdded","ChildRemoved","DescendantAdded","DescendantRemoving"},
    GuiObject={"InputBegan","InputChanged","InputEnded","MouseEnter","MouseLeave","SelectionGained","SelectionLost"},
    GuiButton={"Activated","MouseButton1Click","MouseButton1Down","MouseButton1Up","MouseButton2Click"},
    TextBox={"Focused","FocusLost","ReturnPressedFromOnScreenKeyboard"},Player={"CharacterAdded","CharacterRemoving"},Humanoid={"Died"},
}
local __methods = {}
local __rect
local function __getProps(self) return rawget(self, "__props") end
local function __children(self) return rawget(self, "__children") end
local function __signals(self) return rawget(self, "__signals") end
local function __destroyed(self) return rawget(self, "__destroyed") end
function __methods:IsA(wanted) return __isA(rawget(self,"__class"),wanted) end
function __methods:GetChildren() return table.clone(__children(self)) end
function __methods:GetDescendants()
    local all = {}
    local function descend(parent)
        for _, child in ipairs(__children(parent)) do
            table.insert(all,child)
            descend(child)
        end
    end
    descend(self)
    return all
end
function __methods:FindFirstChild(name, recursive)
    for _, child in ipairs(__children(self)) do if child.Name == name then return child end end
    if recursive then for _, child in ipairs(self:GetDescendants()) do if child.Name == name then return child end end end
    return nil
end
function __methods:WaitForChild(name, _timeout)
    local value = self:FindFirstChild(name)
    assert(value, "Mock WaitForChild could not find " .. tostring(name) .. " under " .. self:GetFullName())
    return value
end
function __methods:FindFirstChildOfClass(class)
    for _, child in ipairs(__children(self)) do if child.ClassName == class then return child end end
    return nil
end
function __methods:FindFirstChildWhichIsA(class, recursive)
    for _, child in ipairs(recursive and self:GetDescendants() or self:GetChildren()) do if child:IsA(class) then return child end end
    return nil
end
function __methods:FindFirstAncestor(name)
    local parent = self.Parent
    while parent do if parent.Name == name then return parent end; parent = parent.Parent end
    return nil
end
function __methods:FindFirstAncestorOfClass(class)
    local parent = self.Parent
    while parent do if parent.ClassName == class then return parent end; parent = parent.Parent end
    return nil
end
function __methods:IsDescendantOf(ancestor)
    local parent = self.Parent
    while parent do if parent == ancestor then return true end; parent = parent.Parent end
    return false
end
function __methods:GetFullName()
    local parts = { self.Name }
    local parent = self.Parent
    while parent do table.insert(parts,1,parent.Name); parent = parent.Parent end
    return table.concat(parts,".")
end
function __methods:GetPropertyChangedSignal(property)
    local key = "property:" .. tostring(property)
    if not __signals(self)[key] then __signals(self)[key] = __signal(self,key) end
    return __signals(self)[key]
end
function __methods:GetAttribute(name) return rawget(self,"__attributes")[name] end
function __methods:SetAttribute(name,value) rawget(self,"__attributes")[name]=value end
function __methods:GetAttributeChangedSignal(name) return self:GetPropertyChangedSignal("attribute:" .. name) end
function __methods:Destroy()
    if __destroyed(self) then return end
    __signals(self).Destroying._fire()
    local parent = self.Parent
    for _, child in ipairs(self:GetChildren()) do child:Destroy() end
    for _, sig in pairs(__signals(self)) do sig._disconnectAll() end
    if parent then
        local children = __children(parent)
        local index = table.find(children,self)
        if index then table.remove(children,index) end
    end
    __getProps(self).Parent = nil
    rawset(self,"__destroyed",true)
end
function __methods:ClearAllChildren() for _, child in ipairs(self:GetChildren()) do child:Destroy() end end
function __methods:CaptureFocus() assert(self:IsA("TextBox")); __signals(self).Focused._fire() end
function __methods:ReleaseFocus(submitted) assert(self:IsA("TextBox")); __signals(self).FocusLost._fire(submitted or false) end
function __methods:IsFocused() return false end

local function __allowsProperty(class, key)
    if __commonProps[key] then return true end
    if __isA(class,"GuiObject") and __guiProps[key] then return true end
    if (class == "TextLabel" or class == "TextButton" or class == "TextBox") and __textProps[key] then return true end
    return __classProps[class] and __classProps[class][key] or false
end
local function __defaultProps(class)
    local p = { Name=class, Archivable=true }
    if __isA(class,"GuiObject") then
        p.Visible=true; p.Active=false; p.Selectable=false; p.Interactable=true
        p.Size=UDim2.fromOffset(100,100); p.Position=UDim2.fromOffset(0,0); p.AnchorPoint=Vector2.zero
        p.BackgroundColor3=Color3.fromRGB(163,162,165); p.BackgroundTransparency=0; p.BorderColor3=Color3.fromRGB(27,42,53); p.BorderSizePixel=1
        p.ClipsDescendants=false; p.LayoutOrder=0; p.ZIndex=1; p.Rotation=0; p.AutomaticSize=Enum.AutomaticSize.None; p.Draggable=false
    end
    if class == "TextLabel" or class == "TextButton" or class == "TextBox" then
        p.Text=class == "TextButton" and "Button" or "Label"; p.TextColor3=Color3.new(0,0,0); p.TextSize=8; p.Font=Enum.Font.SourceSans
        p.TextTransparency=0; p.TextStrokeTransparency=1; p.TextStrokeColor3=Color3.new(0,0,0)
        p.TextScaled=false; p.TextWrapped=false; p.TextXAlignment=Enum.TextXAlignment.Center; p.TextYAlignment=Enum.TextYAlignment.Center; p.RichText=false
    end
    if __isA(class,"GuiButton") then p.AutoButtonColor=true; p.Modal=false end
    if class == "TextBox" then p.PlaceholderText=""; p.ClearTextOnFocus=true; p.MultiLine=false; p.TextEditable=true end
    if class == "ScreenGui" then p.Enabled=true; p.ResetOnSpawn=true; p.IgnoreGuiInset=false; p.DisplayOrder=0; p.ZIndexBehavior=Enum.ZIndexBehavior.Sibling end
    if class == "ScrollingFrame" then p.CanvasPosition=Vector2.zero; p.CanvasSize=UDim2.new(0,0,2,0); p.ScrollBarThickness=12; p.AutomaticCanvasSize=Enum.AutomaticSize.None; p.ScrollingEnabled=true end
    if class == "UICorner" then p.CornerRadius=UDim.new(0,8) end
    if class == "UIStroke" then p.Color=Color3.new(0,0,0); p.Thickness=1; p.Transparency=0; p.Enabled=true end
    if class == "UIListLayout" then p.Padding=UDim.new(0,0); p.FillDirection=Enum.FillDirection.Vertical; p.HorizontalAlignment=Enum.HorizontalAlignment.Left; p.VerticalAlignment=Enum.VerticalAlignment.Top; p.SortOrder=Enum.SortOrder.Name end
    if class == "UIPadding" then p.PaddingTop=UDim.new(0,0); p.PaddingBottom=UDim.new(0,0); p.PaddingLeft=UDim.new(0,0); p.PaddingRight=UDim.new(0,0) end
    if class == "Humanoid" then p.WalkSpeed=16; p.JumpPower=50; p.UseJumpPower=false; p.JumpHeight=7.2; p.Health=100; p.MaxHealth=100 end
    return p
end
local __instanceMt = {}
__instanceMt.__index = function(self,key)
    if string.sub(tostring(key),1,1) == "_" then error("Private mock fields are unavailable to generated code",2) end
    if key == "ClassName" then return rawget(self,"__class") end
    if __methods[key] then return __methods[key] end
    if __signals(self)[key] then return __signals(self)[key] end
    if key == "AbsoluteSize" or key == "AbsoluteWindowSize" then local _,_,w,h=__rect(self); return Vector2.new(w,h) end
    if key == "AbsolutePosition" then local x,y=__rect(self); return Vector2.new(x,y) end
    if key == "AbsoluteContentSize" and self:IsA("UILayout") then
        local w,h=0,0
        local parent=self.Parent
        if parent then for _,child in ipairs(parent:GetChildren()) do if child:IsA("GuiObject") then local x,y,cw,ch=__rect(child); local px,py=__rect(parent); w=math.max(w,x-px+cw); h=math.max(h,y-py+ch) end end end
        return Vector2.new(w,h)
    end
    if key == "TextBounds" and (self:IsA("TextLabel") or self:IsA("TextButton") or self:IsA("TextBox")) then return Vector2.new(#self.Text*self.TextSize*0.5,self.TextSize) end
    if __allowsProperty(rawget(self,"__class"),key) then return __getProps(self)[key] end
    for _,child in ipairs(__children(self)) do if child.Name==key then return child end end
    error(tostring(key) .. " is not a valid member of " .. rawget(self,"__class") .. ' "' .. self.Name .. '"',2)
end
__instanceMt.__newindex = function(self,key,value)
    if __destroyed(self) then error("Cannot set property on destroyed instance",2) end
    assert(__allowsProperty(rawget(self,"__class"),key), tostring(key) .. " is not a valid property of " .. self.ClassName)
    local p=__getProps(self)
    if key=="Parent" then
        local old=p.Parent
        if old==value then return end
        if old then local i=table.find(__children(old),self); if i then table.remove(__children(old),i) end; __signals(old).ChildRemoved._fire(self) end
        p.Parent=value
        if value then table.insert(__children(value),self); __signals(value).ChildAdded._fire(self) end
        __signals(self).AncestryChanged._fire(self,value)
    else
        p[key]=value
    end
    __signals(self).Changed._fire(key)
    if __signals(self)["property:"..key] then __signals(self)["property:"..key]._fire() end
end
__instanceMt.__tostring = function(self) return self.Name end
__instanceMt.__type = "Instance"
local Instance = {}
function Instance.new(class,parent)
    assert(__classParents[class], "Unsupported Instance class in closed UI mock: " .. tostring(class))
    local self = setmetatable({ __class=class,__props=__defaultProps(class),__children={},__signals={},__attributes={},__destroyed=false }, __instanceMt)
    for base, names in pairs(__signalsForClass) do
        if __isA(class,base) then for _,name in ipairs(names) do __signals(self)[name]=__signal(self,name) end end
    end
    table.insert(__allInstances,self)
    if parent then self.Parent=parent end
    return self
end

local function __size(instance,parentW,parentH)
    local p=__getProps(instance)
    local width=p.Size.X.Scale*parentW+p.Size.X.Offset
    local height=p.Size.Y.Scale*parentH+p.Size.Y.Offset
    if p.AutomaticSize==Enum.AutomaticSize.Y or p.AutomaticSize==Enum.AutomaticSize.XY then
        if instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("TextBox") then
            -- Approximate text dimensions are explicitly excluded from engine
            -- rendering guarantees. Minimum heights and child flow are real.
            local lines=1
            for _ in string.gmatch(p.Text,"\n") do lines+=1 end
            if p.TextWrapped and width>0 then lines=math.max(lines,math.ceil(#p.Text*p.TextSize*0.5/width)) end
            height=math.max(height,lines*p.TextSize*(p.LineHeight or 1))
        else
            local layout=instance:FindFirstChildOfClass("UIListLayout")
            local total,maxChild,count=0,0,0
            for _,child in ipairs(instance:GetChildren()) do
                if child:IsA("GuiObject") then
                    local cw,ch=__size(child,width,height)
                    count+=1
                    if layout then
                        if layout.FillDirection==Enum.FillDirection.Horizontal then maxChild=math.max(maxChild,ch) else total+=ch end
                    else
                        maxChild=math.max(maxChild,child.Position.Y.Scale*height+child.Position.Y.Offset+ch)
                    end
                end
            end
            if layout and layout.FillDirection==Enum.FillDirection.Vertical then
                height=math.max(height,total+math.max(0,count-1)*(layout.Padding.Scale*height+layout.Padding.Offset))
            else height=math.max(height,maxChild) end
            local padding=instance:FindFirstChildOfClass("UIPadding")
            if padding then height+=padding.PaddingTop.Offset+padding.PaddingBottom.Offset end
        end
    end
    return width,height
end
local function __padding(parent,width,height)
    local padding=parent:FindFirstChildOfClass("UIPadding")
    if not padding then return 0,0,0,0 end
    return padding.PaddingLeft.Scale*width+padding.PaddingLeft.Offset,padding.PaddingTop.Scale*height+padding.PaddingTop.Offset,padding.PaddingRight.Scale*width+padding.PaddingRight.Offset,padding.PaddingBottom.Scale*height+padding.PaddingBottom.Offset
end
__rect = function(instance,depth)
    depth=depth or 0
    assert(depth<60,"UI ancestry/layout depth exceeds QA limit")
    if not instance or not instance:IsA("GuiObject") then return 0,0,__viewport.X,__viewport.Y end
    local parent=instance.Parent
    local px,py,pw,ph=__rect(parent,depth+1)
    local w,h=__size(instance,pw,ph)
    local p=__getProps(instance)
    local x=px+p.Position.X.Scale*pw+p.Position.X.Offset-p.AnchorPoint.X*w
    local y=py+p.Position.Y.Scale*ph+p.Position.Y.Offset-p.AnchorPoint.Y*h
    if parent then
        local layout=parent:FindFirstChildOfClass("UIListLayout")
        if layout then
            local siblings={}
            for _,sibling in ipairs(parent:GetChildren()) do if sibling:IsA("GuiObject") then table.insert(siblings,sibling) end end
            table.sort(siblings,function(a,b)
                if layout.SortOrder==Enum.SortOrder.LayoutOrder then if a.LayoutOrder==b.LayoutOrder then return table.find(__allInstances,a)<table.find(__allInstances,b) end; return a.LayoutOrder<b.LayoutOrder end
                return a.Name<b.Name
            end)
            local left,top,right,bottom=__padding(parent,pw,ph)
            local horizontal=layout.FillDirection==Enum.FillDirection.Horizontal
            local cursor=0
            local total=0
            for i,sibling in ipairs(siblings) do local sw,sh=__size(sibling,pw,ph); total+=horizontal and sw or sh; if i<#siblings then total+=layout.Padding.Scale*(horizontal and pw or ph)+layout.Padding.Offset end end
            for _,sibling in ipairs(siblings) do
                local sw,sh=__size(sibling,pw,ph)
                if sibling==instance then
                    if horizontal then
                        x=px+left+cursor
                        if layout.HorizontalAlignment==Enum.HorizontalAlignment.Center then x=px+left+(pw-left-right-total)/2+cursor elseif layout.HorizontalAlignment==Enum.HorizontalAlignment.Right then x=px+pw-right-total+cursor end
                        y=py+top
                        if layout.VerticalAlignment==Enum.VerticalAlignment.Center then y=py+top+(ph-top-bottom-h)/2 elseif layout.VerticalAlignment==Enum.VerticalAlignment.Bottom then y=py+ph-bottom-h end
                    else
                        y=py+top+cursor
                        if layout.VerticalAlignment==Enum.VerticalAlignment.Center then y=py+top+(ph-top-bottom-total)/2+cursor elseif layout.VerticalAlignment==Enum.VerticalAlignment.Bottom then y=py+ph-bottom-total+cursor end
                        x=px+left
                        if layout.HorizontalAlignment==Enum.HorizontalAlignment.Center then x=px+left+(pw-left-right-w)/2 elseif layout.HorizontalAlignment==Enum.HorizontalAlignment.Right then x=px+pw-right-w end
                    end
                    break
                end
                cursor+=(horizontal and sw or sh)+layout.Padding.Scale*(horizontal and pw or ph)+layout.Padding.Offset
            end
        end
        if parent:IsA("ScrollingFrame") then x-=parent.CanvasPosition.X; y-=parent.CanvasPosition.Y end
    end
    return x,y,w,h
end

local __playerGui=Instance.new("PlayerGui")
local __player=Instance.new("Player"); __player.Name="QAPlayer"; __player.UserId=123; __player.DisplayName="QAPlayer"; __playerGui.Parent=__player
local __character=Instance.new("Model"); __character.Name="Character"
local __humanoid=Instance.new("Humanoid",__character)
__player.Character=__character
local __Players={LocalPlayer=__player}
local __UIS={InputBegan=__signal("UserInputService","InputBegan"),InputChanged=__signal("UserInputService","InputChanged"),InputEnded=__signal("UserInputService","InputEnded"),TouchEnabled=false,MouseEnabled=true,KeyboardEnabled=true}
local __mousePosition=Vector2.new(100,100)
function __UIS:GetMouseLocation() return __mousePosition end
function __UIS:IsKeyDown() return false end
function __UIS:GetFocusedTextBox() return nil end
local __RunService={RenderStepped=__signal("RunService","RenderStepped"),Heartbeat=__signal("RunService","Heartbeat"),Stepped=__signal("RunService","Stepped")}
function __RunService:IsClient() return true end
function __RunService:IsStudio() return false end
local __TeleportService={}
function __TeleportService:Teleport(placeId,player)
    table.insert(__teleports,{method="Teleport",placeId=placeId,player=player})
end
function __TeleportService:TeleportToPlaceInstance(placeId,jobId,player)
    table.insert(__teleports,{method="TeleportToPlaceInstance",placeId=placeId,jobId=jobId,player=player})
end
local __TweenService={}
function __TweenService:Create(object,_info,properties)
    local tween={Completed=__signal("Tween","Completed")}
    function tween:Play() for key,value in pairs(properties) do object[key]=value end; tween.Completed._fire() end
    function tween:Cancel() end
    return tween
end
local __Workspace=Instance.new("Workspace"); __Workspace.Name="Workspace"
local __camera=Instance.new("Camera"); __camera.ViewportSize=Vector2.new(__viewport.X,__viewport.Y)
-- Workspace.CurrentCamera is read-only here, accessed through service wrapper.
local __workspaceProxy={CurrentCamera=__camera}
local __services={Players=__Players,UserInputService=__UIS,TeleportService=__TeleportService,TweenService=__TweenService,RunService=__RunService,Workspace=__workspaceProxy}
local __game={PlaceId=2753915549,JobId="QA-JOB-ID",Loaded=__signal("game","Loaded")}
function __game:GetService(name)
    assert(__services[name],"Service is outside the permitted isolated UI QA API set: "..tostring(name))
    return __services[name]
end
function __game:IsLoaded() return true end
local __task={}
function __task.spawn(callback,...)
    assert(type(callback)=="function","task.spawn expects a function")
    __safeCall(callback,...)
    return coroutine.create(function() end)
end
function __task.defer(callback,...)
    table.insert(__deferred,{callback=callback,args=table.pack(...)})
end
function __task.delay(_seconds,callback,...) __task.defer(callback,...) end
function __task.wait() error("task.wait is unsupported in finite UI acceptance scenarios",2) end
function __task.cancel() end
local function __flush()
    while #__deferred>0 do local work=table.remove(__deferred,1); __safeCall(work.callback,table.unpack(work.args,1,work.args.n)) end
end
local function __typeof(value)
    local mt=type(value)=="table" and getmetatable(value)
    return mt and mt.__type or type(value)
end
local function __pureLibrary(library)
    local copy=table.clone(library)
    return table.freeze(copy)
end
local __sandbox={
    assert=assert,error=error,ipairs=ipairs,pairs=pairs,next=next,select=select,tonumber=tonumber,tostring=tostring,type=type,typeof=__typeof,
    pcall=pcall,xpcall=xpcall,unpack=table.unpack,
    math=__pureLibrary(math),string=__pureLibrary(string),table=__pureLibrary(table),utf8=__pureLibrary(utf8),bit32=__pureLibrary(bit32),
    Enum=Enum,Instance=Instance,Color3=Color3,UDim=UDim,UDim2=UDim2,Vector2=Vector2,Vector3=Vector3,
    TweenInfo={new=function(...) return table.pack(...) end},
    Font={new=function(...) return table.pack(...) end,fromEnum=function(value) return {enum=value} end},
    task=__task,game=__game,workspace=__workspaceProxy,
    print=function(...) table.insert(__logs,table.pack(...)) end,warn=function(...) table.insert(__logs,table.pack(...)) end,
    tick=function() return 100 end,time=function() return 100 end,
}
setmetatable(__sandbox,{__index=function(_,key) error("Global is unavailable in the closed UI QA sandbox: "..tostring(key),2) end})

local function __visible(object)
    if __destroyed(object) then return false end
    local current=object
    while current do
        if current:IsA("GuiObject") and not current.Visible then return false end
        if current:IsA("ScreenGui") and not current.Enabled then return false end
        current=current.Parent
    end
    return object:IsDescendantOf(__playerGui)
end
local function __input(kind,state,x,y)
    return {UserInputType=kind,UserInputState=state,Position=Vector3.new(x,y,0),Delta=Vector3.zero,KeyCode=Enum.KeyCode.Unknown,Changed=__signal("InputObject","Changed")}
end

local function __json(value, seen)
    local kind=type(value)
    if kind=="nil" then return "null" end
    if kind=="boolean" or kind=="number" then return tostring(value) end
    if kind=="string" then
        local escaped=string.gsub(value,'["\\%c]',function(char)
            if char=='"' then return '\\"' end
            if char=='\\' then return '\\\\' end
            if char=='\n' then return '\\n' end
            if char=='\r' then return '\\r' end
            if char=='\t' then return '\\t' end
            return string.format('\\u%04x',string.byte(char))
        end)
        return '"'..escaped..'"'
    end
    if kind=="table" then
        seen=seen or {}
        if seen[value] then return '"[cycle]"' end
        seen[value]=true
        local parts={}
        local array=true
        for key in pairs(value) do if type(key)~="number" then array=false;break end end
        if array then for _,item in ipairs(value) do table.insert(parts,__json(item,seen)) end; seen[value]=nil; return '['..table.concat(parts,',')..']' end
        for key,item in pairs(value) do table.insert(parts,__json(tostring(key),seen)..':'..__json(item,seen)) end
        seen[value]=nil
        return '{'..table.concat(parts,',')..'}'
    end
    return __json(tostring(value),seen)
end
