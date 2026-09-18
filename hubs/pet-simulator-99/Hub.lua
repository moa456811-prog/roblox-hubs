-- =========================================================
-- A7DEV WORK.INK + OWNER ADMIN KEY GATE
-- Created by a7med_hub
-- Publisher link: https://work.ink/2Z5U/a7dev-key-system
-- =========================================================

if not game:IsLoaded() then
    game.Loaded:Wait()
end

local __A7KeyHttp = game:GetService("HttpService")
local __A7KeyPlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")

local __A7KeyConfig = {
    Enabled = true,
    Link = "https://work.ink/2Z5U/a7dev-key-system",
    Destination = "https://work.ink/token",
    UseDestinationOverride = true,
    -- Set this to the real numeric Work.ink linkId once known.
    -- 0 = validate valid + expiry only (source-link binding pending).
    ExpectedLinkId = 0,
    SingleUse = false,

    -- Private owner/admin bypass. The distributed script stores only the hash.
    AdminEnabled = true,
    AdminKeyHash = 969382910, -- DJB2 hash of the owner key
    AdminUserId = 0, -- set to the owner Roblox UserId for account-bound admin access
}

local function __a7Trim(v)
    return tostring(v or ""):match("^%s*(.-)%s*$")
end

local function __a7Request(url)
    local env = (getgenv and getgenv()) or _G
    local candidates = {
        rawget(env, "request"),
        rawget(env, "http_request"),
        rawget(_G, "request"),
        rawget(_G, "http_request"),
    }
    local okSyn, synReq = pcall(function()
        return syn and syn.request
    end)
    if okSyn and type(synReq) == "function" then
        table.insert(candidates, synReq)
    end
    for _, fn in ipairs(candidates) do
        if type(fn) == "function" then
            local ok, res = pcall(fn, {
                Url = url,
                Method = "GET",
                Headers = { ["Accept"] = "application/json" },
            })
            if ok and type(res) == "table" then
                local code = tonumber(res.StatusCode or res.Status or res.status_code) or 0
                local responseBody = res.Body or res.body
                if type(responseBody) == "string" then
                    return code, responseBody
                end
            end
        end
    end
    local ok, responseBody = pcall(function()
        return game:HttpGet(url)
    end)
    if ok and type(responseBody) == "string" then
        return 200, responseBody
    end
    return 0, nil
end

local function __a7AdminHash(value)
    local hash = 5381
    value = tostring(value or "")
    for i = 1, #value do
        hash = (hash * 33 + string.byte(value, i)) % 4294967296
    end
    return hash
end

local function __a7IsOwnerAdminKey(token)
    if __A7KeyConfig.AdminEnabled ~= true then
        return false
    end

    token = __a7Trim(token)
    if token == "" or __a7AdminHash(token) ~= tonumber(__A7KeyConfig.AdminKeyHash) then
        return false
    end

    local expectedUserId = tonumber(__A7KeyConfig.AdminUserId) or 0
    if expectedUserId > 0 then
        local player = game:GetService("Players").LocalPlayer
        return player ~= nil and player.UserId == expectedUserId
    end

    return true
end

local function __a7ValidateToken(token)
    token = __a7Trim(token)
    if token == "" then
        return false, "Enter your key"
    end

    if __a7IsOwnerAdminKey(token) then
        return true, { admin = true, linkId = "OWNER", expiresAfter = 0 }
    end
    local endpoint = "https://work.ink/_api/v2/token/isValid/" .. __A7KeyHttp:UrlEncode(token)
    if __A7KeyConfig.SingleUse then
        endpoint = endpoint .. "?deleteToken=1"
    end
    local statusCode, responseBody = __a7Request(endpoint)
    if statusCode ~= 200 or type(responseBody) ~= "string" then
        return false, "Network / executor HTTP error"
    end
    local ok, data = pcall(function()
        return __A7KeyHttp:JSONDecode(responseBody)
    end)
    if not ok or type(data) ~= "table" then
        return false, "Invalid Work.ink response"
    end
    if data.valid ~= true then
        return false, "Invalid key"
    end
    local info = data.info
    if type(info) ~= "table" then
        return false, "Missing Work.ink token info"
    end
    if tonumber(__A7KeyConfig.ExpectedLinkId) and tonumber(__A7KeyConfig.ExpectedLinkId) > 0 then
        if tonumber(info.linkId) ~= tonumber(__A7KeyConfig.ExpectedLinkId) then
            return false, "Key belongs to another link"
        end
    end
    local expiresAfter = tonumber(info.expiresAfter)
    if expiresAfter and expiresAfter > 0 and DateTime.now().UnixTimestampMillis > expiresAfter then
        return false, "Expired key"
    end
    return true, info
end

local __A7ResolvedWorkInkLink = nil

local function __a7ResolveWorkInkLink()
    if __A7ResolvedWorkInkLink then
        return __A7ResolvedWorkInkLink, true
    end

    local baseLink = tostring(__A7KeyConfig.Link or "")
    local destination = tostring(__A7KeyConfig.Destination or "https://work.ink/token")

    if __A7KeyConfig.UseDestinationOverride ~= true then
        return baseLink, false
    end

    local overrideEndpoint = "https://work.ink/_api/v2/override?destination=" .. __A7KeyHttp:UrlEncode(destination)
    local statusCode, responseBody = __a7Request(overrideEndpoint)
    if statusCode == 200 and type(responseBody) == "string" then
        local ok, data = pcall(function()
            return __A7KeyHttp:JSONDecode(responseBody)
        end)
        if ok and type(data) == "table" then
            local sr = __a7Trim(data.sr)
            if sr ~= "" then
                local separator = string.find(baseLink, "?", 1, true) and "&" or "?"
                __A7ResolvedWorkInkLink = baseLink .. separator .. "sr=" .. __A7KeyHttp:UrlEncode(sr)
                return __A7ResolvedWorkInkLink, true
            end
        end
    end

    -- Fail open only for link delivery: keep the original monetized link if
    -- Work.ink's override endpoint is temporarily unavailable. Token
    -- validation itself still fails closed in __a7ValidateToken().
    return baseLink, false
end

local function __a7GiveLink()
    local resolvedLink, usedOverride = __a7ResolveWorkInkLink()
    local env = (getgenv and getgenv()) or _G
    local clipboard = rawget(env, "setclipboard") or rawget(env, "toclipboard") or rawget(_G, "setclipboard") or rawget(_G, "toclipboard")
    if type(clipboard) == "function" then
        pcall(clipboard, resolvedLink)
        if usedOverride then
            return "Work.ink key link copied -> token page"
        end
        return "Work.ink link copied (override unavailable)"
    end
    return resolvedLink
end

local function __a7RunKeyGate()
    if not __A7KeyConfig.Enabled then
        return true
    end

    -- Compatibility-first UI parent: PlayerGui works in executors/threads
    -- that cannot access CoreGui (for example lacking capability Plugin).
    local parent = __A7KeyPlayerGui

    local old = parent:FindFirstChild("A7DEV_WorkInk_Key")
    if old then old:Destroy() end

    local theme = {
        Window = Color3.fromRGB(7, 8, 8),
        Window2 = Color3.fromRGB(10, 10, 11),
        Panel = Color3.fromRGB(8, 8, 9),
        Panel2 = Color3.fromRGB(12, 12, 13),
        Field = Color3.fromRGB(5, 5, 6),
        Border = Color3.fromRGB(55, 63, 63),
        BorderDark = Color3.fromRGB(29, 31, 31),
        Red = Color3.fromRGB(162, 12, 20),
        RedBright = Color3.fromRGB(194, 20, 28),
        RedDark = Color3.fromRGB(91, 7, 12),
        Text = Color3.fromRGB(214, 214, 214),
        TextDim = Color3.fromRGB(178, 178, 182),
    }
    local font = Enum.Font.Code

    local function stroke(obj, color)
        local s = Instance.new("UIStroke")
        s.Color = color or theme.BorderDark
        s.Thickness = 1
        s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
        s.Parent = obj
        return s
    end

    local gui = Instance.new("ScreenGui")
    gui.Name = "A7DEV_WorkInk_Key"
    gui.ResetOnSpawn = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.Parent = parent

    local main = Instance.new("Frame")
    main.Size = UDim2.fromOffset(500, 280)
    main.Position = UDim2.new(0.5, -250, 0.5, -140)
    main.BackgroundColor3 = theme.Window
    main.BorderSizePixel = 0
    main.Parent = gui
    stroke(main, theme.Border)

    local inner = Instance.new("Frame")
    inner.Position = UDim2.fromOffset(3, 3)
    inner.Size = UDim2.new(1, -6, 1, -6)
    inner.BackgroundTransparency = 1
    inner.BorderSizePixel = 0
    inner.Parent = main
    stroke(inner, Color3.fromRGB(20, 24, 24))

    local top = Instance.new("Frame")
    top.Position = UDim2.fromOffset(6, 6)
    top.Size = UDim2.new(1, -12, 0, 22)
    top.BackgroundColor3 = theme.Window2
    top.BorderSizePixel = 0
    top.Parent = main

    local title = Instance.new("TextLabel")
    title.BackgroundTransparency = 1
    title.Position = UDim2.fromOffset(4, 0)
    title.Size = UDim2.new(1, -34, 1, 0)
    title.Font = font
    title.Text = "A7DEV.hub | Pet Simulator 99"
    title.TextColor3 = theme.Text
    title.TextSize = 12
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.Parent = top

    local close = Instance.new("TextButton")
    close.Size = UDim2.fromOffset(20, 14)
    close.Position = UDim2.new(1, -23, 0, 4)
    close.BackgroundColor3 = theme.Field
    close.BorderSizePixel = 0
    close.Text = "x"
    close.Font = font
    close.TextSize = 10
    close.TextColor3 = theme.TextDim
    close.AutoButtonColor = false
    close.Parent = top
    stroke(close, theme.BorderDark)

    local redLine = Instance.new("Frame")
    redLine.Position = UDim2.fromOffset(7, 29)
    redLine.Size = UDim2.new(1, -14, 0, 1)
    redLine.BackgroundColor3 = theme.Red
    redLine.BorderSizePixel = 0
    redLine.Parent = main

    local panel = Instance.new("Frame")
    panel.Position = UDim2.fromOffset(8, 37)
    panel.Size = UDim2.new(1, -16, 1, -66)
    panel.BackgroundColor3 = theme.Panel
    panel.BorderSizePixel = 0
    panel.Parent = main
    stroke(panel, theme.BorderDark)

    local header = Instance.new("TextLabel")
    header.BackgroundTransparency = 1
    header.Position = UDim2.fromOffset(10, 9)
    header.Size = UDim2.new(1, -20, 0, 16)
    header.Font = font
    header.Text = "Complete the Work.ink access link, then paste the generated token."
    header.TextColor3 = theme.TextDim
    header.TextSize = 10
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.Parent = panel

    local keyBox = Instance.new("TextBox")
    keyBox.Position = UDim2.fromOffset(10, 36)
    keyBox.Size = UDim2.new(1, -20, 0, 30)
    keyBox.BackgroundColor3 = theme.Field
    keyBox.BorderSizePixel = 0
    keyBox.Font = font
    keyBox.PlaceholderText = "paste Work.ink token or owner key here"
    keyBox.PlaceholderColor3 = theme.TextDim
    keyBox.Text = ""
    keyBox.TextColor3 = theme.Text
    keyBox.TextSize = 11
    keyBox.ClearTextOnFocus = false
    keyBox.Parent = panel
    stroke(keyBox, theme.Border)

    local getKey = Instance.new("TextButton")
    getKey.Position = UDim2.fromOffset(10, 78)
    getKey.Size = UDim2.new(0.5, -15, 0, 27)
    getKey.BackgroundColor3 = theme.Field
    getKey.BorderSizePixel = 0
    getKey.Font = font
    getKey.Text = "GET KEY / COPY LINK"
    getKey.TextColor3 = theme.TextDim
    getKey.TextSize = 10
    getKey.AutoButtonColor = false
    getKey.Parent = panel
    stroke(getKey, theme.BorderDark)

    local checkKey = Instance.new("TextButton")
    checkKey.Position = UDim2.new(0.5, 5, 0, 78)
    checkKey.Size = UDim2.new(0.5, -15, 0, 27)
    checkKey.BackgroundColor3 = theme.Field
    checkKey.BorderSizePixel = 0
    checkKey.Font = font
    checkKey.Text = "CHECK KEY"
    checkKey.TextColor3 = theme.TextDim
    checkKey.TextSize = 10
    checkKey.AutoButtonColor = false
    checkKey.Parent = panel
    stroke(checkKey, theme.RedDark)

    local status = Instance.new("TextLabel")
    status.Position = UDim2.fromOffset(10, 118)
    status.Size = UDim2.new(1, -20, 0, 24)
    status.BackgroundColor3 = theme.Panel2
    status.BorderSizePixel = 0
    status.Font = font
    status.Text = "status > waiting for access key"
    status.TextColor3 = theme.TextDim
    status.TextSize = 10
    status.TextXAlignment = Enum.TextXAlignment.Left
    status.Parent = panel
    stroke(status, theme.BorderDark)

    local footer = Instance.new("TextLabel")
    footer.Position = UDim2.new(0, 8, 1, -22)
    footer.Size = UDim2.new(1, -16, 0, 14)
    footer.BackgroundColor3 = theme.Window2
    footer.BorderSizePixel = 0
    footer.Font = font
    footer.Text = "A7DEV • a7med_hub • Protected access"
    footer.TextColor3 = theme.TextDim
    footer.TextSize = 9
    footer.TextXAlignment = Enum.TextXAlignment.Left
    footer.Parent = main
    stroke(footer, theme.BorderDark)

    local resolved = Instance.new("BindableEvent")
    local accepted = false
    local checking = false

    getKey.Activated:Connect(function()
        status.Text = "status > " .. __a7GiveLink()
    end)

    checkKey.Activated:Connect(function()
        if checking then return end
        checking = true
        status.Text = "status > checking key..."
        task.spawn(function()
            local ok, infoOrMessage = __a7ValidateToken(keyBox.Text)
            if ok then
                accepted = true
                if type(infoOrMessage) == "table" and infoOrMessage.admin == true then
                    status.Text = "status > OWNER ADMIN ACCESS GRANTED"
                else
                    local linkId = type(infoOrMessage) == "table" and infoOrMessage.linkId or "?"
                    status.Text = "status > valid key | linkId " .. tostring(linkId)
                end
                task.wait(0.35)
                resolved:Fire(true)
            else
                status.Text = "status > " .. tostring(infoOrMessage)
                checking = false
            end
        end)
    end)

    close.Activated:Connect(function()
        resolved:Fire(false)
    end)

    local drag = false
    local dragStart, startPos
    top.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            drag = true
            dragStart = input.Position
            startPos = main.Position
            input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then drag = false end
            end)
        end
    end)
    game:GetService("UserInputService").InputChanged:Connect(function(input)
        if drag and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - dragStart
            main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
        end
    end)

    local result = resolved.Event:Wait()
    resolved:Destroy()
    gui:Destroy()
    return result == true and accepted == true
end

local __A7KEY_UNLOCKED = __a7RunKeyGate()
if not __A7KEY_UNLOCKED then
    return
end

-- =========================================================
-- END A7DEV WORK.INK + OWNER ADMIN KEY GATE
-- =========================================================

--[[
    A7DEV • PET SIMULATOR 99
    Created by a7med_hub

    Built against the modules/remotes found in the supplied RBXL.
    Uses the game's own client modules when available.

    UI toggle: RightShift
]]

if not game:IsLoaded() then
    game.Loaded:Wait()
end

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local VirtualUser = game:GetService("VirtualUser")
local TeleportService = game:GetService("TeleportService")
local Lighting = game:GetService("Lighting")

local LocalPlayer = Players.LocalPlayer
while not LocalPlayer do
    task.wait()
    LocalPlayer = Players.LocalPlayer
end

local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")

local ENV = _G
pcall(function()
    if getgenv then
        ENV = getgenv()
    end
end)

if ENV.A7DEV_PS99_ARCADE and ENV.A7DEV_PS99_ARCADE.Destroy then
    pcall(ENV.A7DEV_PS99_ARCADE.Destroy)
end

local Hub = {
    Alive = true,
    Connections = {},
    State = {
        NativeAutoFarm = false,
        AutoTap = false,
        AutoOrbs = false,
        AutoLootables = false,
        AutoBuyZones = false,
        AutoHatch = false,
        AutoFreeGifts = false,
        AutoDailyRewards = false,
        AutoRankRewards = false,
        PowerFarm = false,
        UltraFarm = false,
        AutoBestEgg = false,
        AutoTeleportAfterZone = false,
        PerformanceMode = false,

        -- World farm / smart automation
        FarmTargetMode = "Nearest",
        FarmTargetModeIndex = 1,
        FarmRadius = 2500,
        TapBurst = 1,
        AutoPotions = false,
        AutoFruits = false,
        FruitBatch = 3,
        PotionRefreshSeconds = 60,
        AutoDaycareClaim = false,
        AutoSpinWheels = false,
        AutoEquipBest = false,
        AutoRebirth = false,
        UltraSmartHatch = false,
        UltraHatchInterval = 12,
        UltraMaintenanceInterval = 10,
        UltraAutoRebirth = false,

        -- Coin Arcade
        ArcadeGodMode = false,
        ArcadeAutoClaim = false,
        ArcadeAutoZones = false,
        ArcadeAutoMerchants = false,
        ArcadeAutoHatch = false,
        ArcadeAutoStations = false,
        ArcadeAutoBoss = false,
        ArcadeAutoUpgrades = false,
        ArcadeClaimDelay = 2.0,
        ArcadeProgressDelay = 1.2,
        ArcadeStationDelay = 5.0,
        ArcadeUpgradeDelay = 2.5,

        Noclip = false,
        AntiAFK = true,
        EnforceWalkSpeed = false,
        WalkSpeed = 24,
        TapDelay = 0.08,
        HatchAmount = 1,
        HatchDelay = 0.85,
    },
    SelectedEgg = nil,
    SelectedEggIndex = 1,
    SelectedZone = nil,
    SelectedZoneIndex = 1,
    SelectedArcadeZone = 1,
    SelectedArcadeZoneIndex = 1,
    SelectedArcadeMerchant = 1,
    SelectedArcadeMerchantIndex = 1,
    LastStatus = "Loading...",
    Stats = {
        Taps = 0,
        Orbs = 0,
        Lootables = 0,
        FreeGifts = 0,
        DailyRewards = 0,
        RankRewards = 0,
        ZonesBought = 0,
        Hatches = 0,
        SpecialTargets = 0,
        PotionsUsed = 0,
        FruitsUsed = 0,
        DaycareClaims = 0,
        WheelSpins = 0,
        PetOptimizes = 0,
        Rebirths = 0,
        UltraCycles = 0,
        ArcadeClaims = 0,
        ArcadeUnits = 0,
        ArcadeUpgrades = 0,
    },
    PerformanceCache = {},
    UltraPhase = "IDLE",
    CurrentFarmTarget = "none",
}
ENV.A7DEV_PS99_ARCADE = Hub

local function track(connection)
    if connection then
        table.insert(Hub.Connections, connection)
    end
    return connection
end

local unpackArgs = table.unpack or unpack

local function safeCall(fn, ...)
    local args = { ... }
    local ok, a, b, c, d = pcall(function()
        return fn(unpackArgs(args))
    end)
    if not ok then
        return false, a
    end
    return true, a, b, c, d
end

local function safeRequire(instance)
    if not instance then
        return nil
    end
    local ok, result = pcall(require, instance)
    if ok then
        return result
    end
    return nil
end

local Library = ReplicatedStorage:WaitForChild("Library", 30)
local Client = Library and Library:WaitForChild("Client", 30)

local Network = Client and safeRequire(Client:FindFirstChild("Network"))
local Save = Client and safeRequire(Client:FindFirstChild("Save"))
local AutoFarmCmds = Client and safeRequire(Client:FindFirstChild("AutoFarmCmds"))
local EggCmds = Client and safeRequire(Client:FindFirstChild("EggCmds"))
local ZoneCmds = Client and safeRequire(Client:FindFirstChild("ZoneCmds"))
local MapCmds = Client and safeRequire(Client:FindFirstChild("MapCmds"))
local Signal = Library and safeRequire(Library:FindFirstChild("Signal"))
local Directory = Library and safeRequire(Library:FindFirstChild("Directory"))
local RanksUtil = Library and Library:FindFirstChild("Util") and safeRequire(Library.Util:FindFirstChild("RanksUtil"))
local WorldsUtil = Library and Library:FindFirstChild("Util") and safeRequire(Library.Util:FindFirstChild("WorldsUtil"))

-- Confirmed world-farming modules recovered from the supplied place.
Hub.GameModules = {
    BreakableCmds = Client and safeRequire(Client:FindFirstChild("BreakableCmds")),
    InventoryCmds = Client and safeRequire(Client:FindFirstChild("InventoryCmds")),
    PotionCmds = Client and safeRequire(Client:FindFirstChild("PotionCmds")),
    FruitCmds = Client and safeRequire(Client:FindFirstChild("FruitCmds")),
    DaycareCmds = Client and safeRequire(Client:FindFirstChild("DaycareCmds")),
    SpinnyWheelCmds = Client and safeRequire(Client:FindFirstChild("SpinnyWheelCmds")),
    PetCmds = Client and safeRequire(Client:FindFirstChild("PetCmds")),
    RebirthCmds = Client and safeRequire(Client:FindFirstChild("RebirthCmds")),
    HatchingCmds = Client and safeRequire(Client:FindFirstChild("HatchingCmds")),
}
if Library and Library:FindFirstChild("Items") then
    Hub.GameModules.PotionItem = safeRequire(Library.Items:FindFirstChild("PotionItem"))
    Hub.GameModules.FruitItem = safeRequire(Library.Items:FindFirstChild("FruitItem"))
end

-- Coin Arcade modules recovered from the supplied place.
local InstancingCmds = Client and safeRequire(Client:FindFirstChild("InstancingCmds"))
local InstanceZoneCmds = Client and safeRequire(Client:FindFirstChild("InstanceZoneCmds"))
local CoinArcadeCmds = Client and safeRequire(Client:FindFirstChild("CoinArcadeCmds"))
local CoinArcadeZoneCmds = Client and safeRequire(Client:FindFirstChild("CoinArcadeZoneCmds"))
local EventUpgradeCmds = Client and safeRequire(Client:FindFirstChild("EventUpgradeCmds"))
local CoinArcadeCommon = Library and Library:FindFirstChild("Util") and safeRequire(Library.Util:FindFirstChild("CoinArcadeCommon"))
local CoinArcadePlace = Library and safeRequire(Library:FindFirstChild("CoinArcadePlace"))
local ArcadeUnitItem = Library and Library:FindFirstChild("Items") and safeRequire(Library.Items:FindFirstChild("ArcadeUnitItem"))
local EventUpgrades = Directory and Directory.EventUpgrades or nil

local function setStatus(text)
    Hub.LastStatus = tostring(text or "")
    if Hub.StatusLabel then
        Hub.StatusLabel.Text = Hub.LastStatus
    end
end

local function invokeRemote(name, ...)
    if not Network or type(Network.Invoke) ~= "function" then
        return false, "Network.Invoke unavailable"
    end
    local args = { ... }
    local ok, a, b, c, d = pcall(function()
        return Network.Invoke(name, unpackArgs(args))
    end)
    if not ok then
        return false, tostring(a)
    end
    return a, b, c, d
end

local function fireRemote(name, ...)
    if not Network or type(Network.Fire) ~= "function" then
        return false, "Network.Fire unavailable"
    end
    local args = { ... }
    local ok, err = pcall(function()
        Network.Fire(name, unpackArgs(args))
    end)
    if not ok then
        return false, tostring(err)
    end
    return true
end

local function getSave()
    if not Save or type(Save.Get) ~= "function" then
        return nil
    end
    local ok, data = pcall(Save.Get)
    if ok then
        return data
    end
    return nil
end

local function arrayHas(tbl, value)
    if type(tbl) ~= "table" then
        return false
    end
    for _, item in pairs(tbl) do
        if item == value then
            return true
        end
    end
    return false
end

local function getCharacter()
    return LocalPlayer.Character
end

local function getRoot()
    local character = getCharacter()
    if not character then
        return nil
    end
    return character:FindFirstChild("HumanoidRootPart") or character.PrimaryPart
end

local function getHumanoid()
    local character = getCharacter()
    if not character then
        return nil
    end
    return character:FindFirstChildOfClass("Humanoid")
end

local function cacheAndDisableEffect(instance)
    if not instance or Hub.PerformanceCache[instance] ~= nil then
        return
    end

    if instance:IsA("ParticleEmitter") or instance:IsA("Trail") or instance:IsA("Beam")
        or instance:IsA("Smoke") or instance:IsA("Fire") or instance:IsA("Sparkles")
        or instance:IsA("BloomEffect") or instance:IsA("BlurEffect")
        or instance:IsA("ColorCorrectionEffect") or instance:IsA("DepthOfFieldEffect")
        or instance:IsA("SunRaysEffect") then
        local ok, enabled = pcall(function() return instance.Enabled end)
        if ok then
            Hub.PerformanceCache[instance] = enabled
            pcall(function() instance.Enabled = false end)
        end
    end
end

local function applyPerformancePass()
    for _, instance in ipairs(workspace:GetDescendants()) do
        cacheAndDisableEffect(instance)
    end
    for _, instance in ipairs(Lighting:GetChildren()) do
        cacheAndDisableEffect(instance)
    end
end

local function setPerformanceMode(enabled)
    Hub.State.PerformanceMode = enabled and true or false
    if Hub.State.PerformanceMode then
        applyPerformancePass()
        setStatus("FPS Boost enabled")
        return
    end

    for instance, previous in pairs(Hub.PerformanceCache) do
        if instance and instance.Parent then
            pcall(function() instance.Enabled = previous end)
        end
        Hub.PerformanceCache[instance] = nil
    end
    setStatus("FPS Boost disabled")
end

-- ============================================================
-- Game data helpers
-- ============================================================

local EggList = {}
local ZoneList = {}

local function rebuildEggList()
    EggList = {}
    if not Directory or type(Directory.Eggs) ~= "table" then
        return
    end

    for id, data in pairs(Directory.Eggs) do
        if type(data) == "table" and data.eggNumber then
            table.insert(EggList, {
                Id = id,
                Name = data.name or tostring(id),
                Number = tonumber(data.eggNumber) or 999999,
                Data = data,
            })
        end
    end

    table.sort(EggList, function(a, b)
        if a.Number == b.Number then
            return tostring(a.Id) < tostring(b.Id)
        end
        return a.Number < b.Number
    end)

    local bestIndex = 1
    if EggCmds and type(EggCmds.IsEggAvailable) == "function" then
        for i, egg in ipairs(EggList) do
            local ok, available = pcall(EggCmds.IsEggAvailable, egg.Id)
            if ok and available then
                bestIndex = i
            end
        end
    end

    Hub.SelectedEggIndex = math.clamp(bestIndex, 1, math.max(1, #EggList))
    if EggList[Hub.SelectedEggIndex] then
        Hub.SelectedEgg = EggList[Hub.SelectedEggIndex].Id
    end
end

local function getWorldNumber()
    if WorldsUtil and type(WorldsUtil.GetWorldNumber) == "function" then
        local ok, result = pcall(WorldsUtil.GetWorldNumber)
        if ok and type(result) == "number" then
            return result
        end
    end
    return nil
end

local function rebuildZoneList()
    ZoneList = {}
    if not Directory or type(Directory.Zones) ~= "table" then
        return
    end

    local currentWorld = getWorldNumber()
    for id, data in pairs(Directory.Zones) do
        if type(data) == "table" then
            local world = tonumber(data.WorldNumber)
            if not currentWorld or not world or world == currentWorld then
                table.insert(ZoneList, {
                    Id = id,
                    Name = data.ZoneName or tostring(id),
                    Number = tonumber(data.ZoneNumber) or 999999,
                    World = world or 0,
                    Data = data,
                })
            end
        end
    end

    table.sort(ZoneList, function(a, b)
        if a.Number == b.Number then
            return tostring(a.Id) < tostring(b.Id)
        end
        return a.Number < b.Number
    end)

    local save = getSave()
    local bestIndex = 1
    if save and type(save.UnlockedZones) == "table" then
        for i, zone in ipairs(ZoneList) do
            if save.UnlockedZones[zone.Id] == true then
                bestIndex = i
            end
        end
    end

    Hub.SelectedZoneIndex = math.clamp(bestIndex, 1, math.max(1, #ZoneList))
    if ZoneList[Hub.SelectedZoneIndex] then
        Hub.SelectedZone = ZoneList[Hub.SelectedZoneIndex].Id
    end
end

-- Give the game save a short window to finish loading before choosing defaults.
if Save then
    local saveDeadline = os.clock() + 12
    while Hub.Alive and not getSave() and os.clock() < saveDeadline do
        task.wait(0.1)
    end
end

rebuildEggList()
rebuildZoneList()

Hub.FarmTargetModes = {
    "Nearest", "Special First", "Mini Chest", "Boss Chest", "Chest Mimic",
    "Lucky Block", "Pinata", "Comet", "Coin Jar", "Diamonds",
}

function Hub.FarmBreakableText(item)
    if not item then return "" end
    local parts = { tostring(item.Name or "") }
    for _, key in ipairs({"BreakableID", "BreakableId", "BreakableClass", "BreakableType", "Class", "Type", "Name"}) do
        local ok, value = pcall(function() return item:GetAttribute(key) end)
        if ok and value ~= nil then table.insert(parts, tostring(value)) end
    end
    return string.lower(table.concat(parts, " "))
end

function Hub.FarmSpecialPriority(text)
    text = string.lower(tostring(text or ""))
    if text:find("boss chest", 1, true) or text:find("chest mimic", 1, true) then return 1 end
    if text:find("superior", 1, true) or text:find("mini chest", 1, true) then return 2 end
    if text:find("pinata", 1, true) or text:find("piñata", 1, true) or text:find("comet", 1, true) or text:find("lucky block", 1, true) then return 3 end
    if text:find("coin jar", 1, true) or text:find("diamond", 1, true) then return 4 end
    if text:find("chest", 1, true) then return 5 end
    return 50
end

function Hub.FarmModeMatch(mode, text)
    text = string.lower(tostring(text or ""))
    if mode == "Nearest" or mode == "Special First" then return true end
    if mode == "Mini Chest" then return text:find("mini chest", 1, true) ~= nil end
    if mode == "Boss Chest" then return text:find("boss chest", 1, true) ~= nil or text:find("superior", 1, true) ~= nil end
    if mode == "Chest Mimic" then return text:find("chest mimic", 1, true) ~= nil end
    if mode == "Lucky Block" then return text:find("lucky block", 1, true) ~= nil end
    if mode == "Pinata" then return text:find("pinata", 1, true) ~= nil or text:find("piñata", 1, true) ~= nil end
    if mode == "Comet" then return text:find("comet", 1, true) ~= nil end
    if mode == "Coin Jar" then return text:find("coin jar", 1, true) ~= nil end
    if mode == "Diamonds" then return text:find("diamond", 1, true) ~= nil end
    return true
end

function Hub.SmartBreakableTarget(modeOverride)
    local things = workspace:FindFirstChild("__THINGS")
    local folder = things and things:FindFirstChild("Breakables")
    local root = getRoot()
    if not folder or not root then return nil end

    local mode = tostring(modeOverride or Hub.State.FarmTargetMode or "Nearest")
    local radius = tonumber(Hub.State.FarmRadius) or 2500
    local bestUID, bestDistance, bestText, bestPriority = nil, math.huge, "", math.huge

    for _, item in ipairs(folder:GetChildren()) do
        local uid = item:GetAttribute("BreakableUID")
        if uid ~= nil then
            local part = item.PrimaryPart or item:FindFirstChildWhichIsA("BasePart", true)
            if part then
                local distance = (part.Position - root.Position).Magnitude
                if radius <= 0 or distance <= radius then
                    local text = Hub.FarmBreakableText(item)
                    if Hub.FarmModeMatch(mode, text) then
                        local priority = mode == "Special First" and Hub.FarmSpecialPriority(text) or 0
                        if priority < bestPriority or (priority == bestPriority and distance < bestDistance) then
                            bestUID, bestDistance, bestText, bestPriority = tostring(uid), distance, text, priority
                        end
                    end
                end
            end
        end
    end
    return bestUID, bestDistance, bestText, bestPriority
end

local function nearestBreakableUID()
    return Hub.SmartBreakableTarget("Nearest")
end

function Hub.TapFarmTarget()
    if not Signal or type(Signal.Fire) ~= "function" then return false end
    local uid, distance, text, priority = Hub.SmartBreakableTarget()
    if not uid then Hub.CurrentFarmTarget = "none"; return false end
    local burst = math.clamp(math.floor(tonumber(Hub.State.TapBurst) or 1), 1, 8)
    if Hub.State.UltraFarm then burst = math.max(burst, 3) end
    for _ = 1, burst do pcall(Signal.Fire, "AutoClicker_Nearby", uid) end
    Hub.Stats.Taps = Hub.Stats.Taps + burst
    if priority and priority < 50 then Hub.Stats.SpecialTargets = Hub.Stats.SpecialTargets + 1 end
    Hub.CurrentFarmTarget = tostring(text or uid) .. " @ " .. tostring(math.floor(tonumber(distance) or 0)) .. " studs"
    return true
end

local function tapNearest()
    return Hub.TapFarmTarget()
end

local function setNativeAutoFarm(enabled)
    if AutoFarmCmds then
        if enabled and type(AutoFarmCmds.Enable) == "function" then
            local ok = pcall(AutoFarmCmds.Enable)
            if ok then
                setStatus("Native Auto Farm requested")
                return
            end
        elseif not enabled and type(AutoFarmCmds.Disable) == "function" then
            pcall(AutoFarmCmds.Disable)
            setStatus("Native Auto Farm disabled")
            return
        end
    end

    if enabled then
        local success, message = invokeRemote("AutoFarm_Enable")
        if success then
            setStatus("Native Auto Farm enabled")
        else
            setStatus(message or "Auto Farm refused by server")
        end
    else
        invokeRemote("AutoFarm_Disable")
        setStatus("Native Auto Farm disabled")
    end
end

local function collectExistingOrbs()
    local things = workspace:FindFirstChild("__THINGS")
    local folder = things and things:FindFirstChild("Orbs")
    if not folder then
        return 0
    end

    local ids = {}
    for _, item in ipairs(folder:GetChildren()) do
        local id = item:GetAttribute("OrbID") or item:GetAttribute("Id") or item:GetAttribute("ID")
        if id == nil then
            local asNumber = tonumber(item.Name)
            id = asNumber or item.Name
        end
        if id ~= nil then
            table.insert(ids, id)
        end
    end

    if #ids > 0 then
        fireRemote("Orbs: Collect", ids)
        Hub.Stats.Orbs = Hub.Stats.Orbs + #ids
    end
    return #ids
end

local function openExistingLootables()
    local things = workspace:FindFirstChild("__THINGS")
    local folder = things and things:FindFirstChild("Lootables")
    if not folder then
        return 0
    end

    local count = 0
    for _, item in ipairs(folder:GetChildren()) do
        local id = item:GetAttribute("Id") or item:GetAttribute("ID") or tonumber(item.Name) or item.Name
        if id ~= nil then
            invokeRemote("Lootables_Open", id)
            count = count + 1
            task.wait(0.03)
        end
    end
    Hub.Stats.Lootables = Hub.Stats.Lootables + count
    return count
end

local function claimFreeGifts()
    local save = getSave()
    if not save or not Directory or type(Directory.FreeGifts) ~= "table" then
        return 0
    end

    local claimed = 0
    for index, gift in pairs(Directory.FreeGifts) do
        if type(gift) == "table" then
            local id = gift.Id or index
            local waitTime = tonumber(gift.WaitTime) or 0
            local redeemed = arrayHas(save.FreeGiftsRedeemed, id)
            if not redeemed and (tonumber(save.FreeGiftsTime) or 0) >= waitTime then
                local success = invokeRemote("Redeem Free Gift", id)
                if success then
                    claimed = claimed + 1
                end
                task.wait(0.12)
            end
        end
    end
    Hub.Stats.FreeGifts = Hub.Stats.FreeGifts + claimed
    return claimed
end

local function claimDailyRewards()
    local save = getSave()
    if not save or not Directory or type(Directory.TimedRewards) ~= "table" then
        return 0
    end

    local now = workspace:GetServerTimeNow()
    local timestamps = save.TimedRewardTimestamps or {}
    local claimed = 0

    for id, reward in pairs(Directory.TimedRewards) do
        if type(reward) == "table" then
            local cooldown = tonumber(reward.Cooldown) or 0
            local timestamp = timestamps[id]
            local ready = timestamp == nil or (now - timestamp) > cooldown
            if ready then
                local success = invokeRemote("DailyRewards_Redeem", id)
                if success then
                    claimed = claimed + 1
                end
                task.wait(0.12)
            end
        end
    end

    Hub.Stats.DailyRewards = Hub.Stats.DailyRewards + claimed
    return claimed
end

local function claimRankRewards()
    local save = getSave()
    if not save or not Directory or type(Directory.Ranks) ~= "table" then
        return 0
    end

    local rankId = nil
    if RanksUtil and type(RanksUtil.RankIDFromNumber) == "function" then
        local ok, result = pcall(RanksUtil.RankIDFromNumber, save.Rank)
        if ok then
            rankId = result
        end
    end

    local rankDirectory = rankId and Directory.Ranks[rankId] or nil
    if not rankDirectory or type(rankDirectory.Rewards) ~= "table" then
        return 0
    end

    local stars = tonumber(save.RankStars) or 0
    local redeemed = save.RedeemedRankRewards or {}
    local required = 0
    local claimed = 0

    for index, reward in ipairs(rankDirectory.Rewards) do
        required = required + (tonumber(reward.StarsRequired) or 0)
        if stars >= required and redeemed[tostring(index)] == nil then
            fireRemote("Ranks_ClaimReward", index)
            claimed = claimed + 1
            task.wait(0.12)
        end
    end

    Hub.Stats.RankRewards = Hub.Stats.RankRewards + claimed
    return claimed
end

local function getNextLockedZone()
    rebuildZoneList()
    local save = getSave()
    if not save or type(save.UnlockedZones) ~= "table" then
        return nil
    end

    for _, zone in ipairs(ZoneList) do
        if save.UnlockedZones[zone.Id] ~= true then
            return zone
        end
    end
    return nil
end

local function buyNextZone()
    local zone = getNextLockedZone()
    if not zone then
        return false, "No locked zone found in current world"
    end

    local success, message = invokeRemote("Zones_RequestPurchase", zone.Id)
    if success then
        setStatus("Purchased zone: " .. tostring(zone.Name))
        Hub.Stats.ZonesBought = Hub.Stats.ZonesBought + 1
        rebuildZoneList()
        return true
    end
    return false, message or ("Cannot purchase " .. tostring(zone.Name))
end

local function teleportZone(zoneId)
    if not zoneId then
        return false, "No zone selected"
    end
    local success, message = invokeRemote("Teleports_RequestTeleport", zoneId)
    if success then
        setStatus("Teleported: " .. tostring(zoneId))
        return true
    end
    return false, message or "Teleport refused"
end

local function teleportHighestOwned()
    rebuildZoneList()
    local save = getSave()
    if not save or type(save.UnlockedZones) ~= "table" then
        return false, "Save not ready"
    end

    local best = nil
    for _, zone in ipairs(ZoneList) do
        if save.UnlockedZones[zone.Id] == true then
            best = zone
        end
    end

    if not best then
        return false, "No owned zone found"
    end

    Hub.SelectedZone = best.Id
    return teleportZone(best.Id)
end

local function unlockSelectedEgg()
    if not Hub.SelectedEgg then
        return false, "No egg selected"
    end
    return invokeRemote("Eggs_RequestUnlock", Hub.SelectedEgg)
end

local function hatchSelectedEgg()
    if not Hub.SelectedEgg then return false, "No egg selected" end
    local success, message = invokeRemote("Eggs_RequestPurchase", Hub.SelectedEgg, Hub.State.HatchAmount)
    if success then Hub.Stats.Hatches = Hub.Stats.Hatches + (tonumber(Hub.State.HatchAmount) or 1) end
    return success, message
end

Hub.WorldFarm = {}

function Hub.WorldFarm.InventoryAll(classModule)
    local M = Hub.GameModules
    if not M.InventoryCmds or type(M.InventoryCmds.Container) ~= "function" or not classModule then return {} end
    local okContainer, container = pcall(M.InventoryCmds.Container)
    if not okContainer or not container or type(container.All) ~= "function" then return {} end
    local ok, items = pcall(function() return container:All(classModule) end)
    return ok and type(items) == "table" and items or {}
end

function Hub.WorldFarm.ItemMethod(item, methodName, defaultValue)
    if not item then return defaultValue end
    local method = item[methodName]
    if type(method) ~= "function" then return defaultValue end
    local ok, value = pcall(method, item)
    if ok then return value end
    return defaultValue
end

function Hub.WorldFarm.ActivatePotions(force)
    local M = Hub.GameModules
    if not M.PotionCmds or type(M.PotionCmds.Consume) ~= "function" or not M.PotionItem then return 0 end
    local bestById = {}
    for _, item in pairs(Hub.WorldFarm.InventoryAll(M.PotionItem)) do
        local id = Hub.WorldFarm.ItemMethod(item, "GetId")
        local tier = tonumber(Hub.WorldFarm.ItemMethod(item, "GetTier", 0)) or 0
        local amount = tonumber(Hub.WorldFarm.ItemMethod(item, "GetAmount", 0)) or 0
        local uid = Hub.WorldFarm.ItemMethod(item, "GetUID")
        if id and uid and amount > 0 then
            local current = bestById[id]
            if not current or tier > current.tier then bestById[id] = { uid = uid, tier = tier } end
        end
    end
    local used = 0
    local refreshSeconds = tonumber(Hub.State.PotionRefreshSeconds) or 60
    for id, entry in pairs(bestById) do
        local shouldUse = force == true
        if not shouldUse and type(M.PotionCmds.Has) == "function" then
            local ok, active, activeTier, remaining = pcall(M.PotionCmds.Has, id)
            if not ok or not active then shouldUse = true else
                shouldUse = (tonumber(activeTier) or 0) < entry.tier or (tonumber(remaining) or 0) <= refreshSeconds
            end
        elseif not shouldUse then shouldUse = true end
        if shouldUse and pcall(M.PotionCmds.Consume, entry.uid, 1) then used = used + 1; task.wait(0.04) end
    end
    Hub.Stats.PotionsUsed = Hub.Stats.PotionsUsed + used
    return used
end

function Hub.WorldFarm.FillFruits(fullFill)
    local M = Hub.GameModules
    if not M.FruitCmds or type(M.FruitCmds.Consume) ~= "function" or not M.FruitItem then return 0 end
    local used, seen = 0, {}
    local batch = math.clamp(math.floor(tonumber(Hub.State.FruitBatch) or 3), 1, 20)
    for _, item in pairs(Hub.WorldFarm.InventoryAll(M.FruitItem)) do
        local id = Hub.WorldFarm.ItemMethod(item, "GetId")
        local uid = Hub.WorldFarm.ItemMethod(item, "GetUID")
        local amount = tonumber(Hub.WorldFarm.ItemMethod(item, "GetAmount", 0)) or 0
        if id and uid and amount > 0 and not seen[id] then
            seen[id] = true
            local room = 0
            if type(M.FruitCmds.GetMaxConsume) == "function" then
                local ok, result = pcall(M.FruitCmds.GetMaxConsume, uid)
                if ok then room = tonumber(result) or 0 end
            end
            local quantity = room > 0 and math.min(room, amount, fullFill and room or batch) or 0
            if quantity > 0 and pcall(M.FruitCmds.Consume, uid, quantity) then used = used + quantity; task.wait(0.04) end
        end
    end
    Hub.Stats.FruitsUsed = Hub.Stats.FruitsUsed + used
    return used
end

function Hub.WorldFarm.ClaimDaycare()
    local D = Hub.GameModules.DaycareCmds
    if not D or type(D.GetActive) ~= "function" or type(D.Claim) ~= "function" then return 0 end
    local okActive, active = pcall(D.GetActive)
    if not okActive or type(active) ~= "table" then return 0 end
    local claimed = 0
    for uid in pairs(active) do
        local remaining = math.huge
        if type(D.ComputeRemainingTime) == "function" then local ok, v = pcall(D.ComputeRemainingTime, uid); if ok then remaining = tonumber(v) or math.huge end end
        if remaining <= 0 then local ok, success = pcall(D.Claim, uid); if ok and success ~= false then claimed = claimed + 1 end; task.wait(0.08) end
    end
    Hub.Stats.DaycareClaims = Hub.Stats.DaycareClaims + claimed
    return claimed
end

function Hub.WorldFarm.SpinWheels()
    local W = Hub.GameModules.SpinnyWheelCmds
    if not W or type(W.RequestSpin) ~= "function" or not Directory or type(Directory.SpinnyWheels) ~= "table" then return 0 end
    local spun = 0
    for id, dir in pairs(Directory.SpinnyWheels) do
        local wheelId = type(dir) == "table" and (dir._id or dir.Id or dir.id) or nil
        local ok, success = pcall(W.RequestSpin, tostring(wheelId or id))
        if ok and success then spun = spun + 1; break end
        task.wait(0.10)
    end
    Hub.Stats.WheelSpins = Hub.Stats.WheelSpins + spun
    return spun
end

function Hub.WorldFarm.EquipBestPets()
    local P = Hub.GameModules.PetCmds
    if not P or type(P.EquipBest) ~= "function" then return false end
    local ok = pcall(P.EquipBest)
    if ok then Hub.Stats.PetOptimizes = Hub.Stats.PetOptimizes + 1 end
    return ok
end
function Hub.WorldFarm.RestorePets()
    local P = Hub.GameModules.PetCmds
    return P and type(P.Restore) == "function" and pcall(P.Restore) or false
end
function Hub.WorldFarm.RespawnPets()
    local P = Hub.GameModules.PetCmds
    return P and type(P.Respawn) == "function" and pcall(P.Respawn) or false
end
function Hub.WorldFarm.DaycareStatus()
    local D = Hub.GameModules.DaycareCmds
    if not D then return "Daycare module unavailable" end
    local used, maximum = "?", "?"
    if type(D.GetUsedSlots) == "function" then local ok, v = pcall(D.GetUsedSlots); if ok then used = v end end
    if type(D.GetMaxSlots) == "function" then local ok, v = pcall(D.GetMaxSlots); if ok then maximum = v end end
    return "Daycare slots: " .. tostring(used) .. "/" .. tostring(maximum)
end
function Hub.WorldFarm.RebirthDirectoryId(entry)
    if type(entry) ~= "table" then return nil end
    if entry._id then return tostring(entry._id) end
    if Directory and type(Directory.Rebirths) == "table" then for id, v in pairs(Directory.Rebirths) do if v == entry then return tostring(id) end end end
    return nil
end
function Hub.WorldFarm.TryRebirth()
    local R = Hub.GameModules.RebirthCmds
    if not R or type(R.GetNextRebirth) ~= "function" or type(R.Rebirth) ~= "function" then return false, "Rebirth module unavailable" end
    local okNext, nextDir = pcall(R.GetNextRebirth)
    if not okNext or not nextDir then return false, "No next rebirth" end
    local id = Hub.WorldFarm.RebirthDirectoryId(nextDir)
    if not id then return false, "Rebirth id unavailable" end
    local ok, success, message = pcall(R.Rebirth, id)
    if not ok then return false, tostring(success) end
    if success then
        Hub.Stats.Rebirths = Hub.Stats.Rebirths + 1
        task.defer(function() task.wait(1); pcall(rebuildZoneList); pcall(rebuildEggList) end)
        return true, message or ("Rebirth requested: " .. id)
    end
    return false, message or "Rebirth requirements not met"
end
function Hub.WorldFarm.InventoryCount(classModule)
    local count = 0
    for _, item in pairs(Hub.WorldFarm.InventoryAll(classModule)) do count = count + (tonumber(Hub.WorldFarm.ItemMethod(item, "GetAmount", 0)) or 0) end
    return count
end

-- ============================================================
-- Coin Arcade helpers (all names/API recovered from supplied RBXL)
-- ============================================================

local ArcadeZoneList = {}
local ArcadeMerchantList = {}

local function rebuildArcadeLists()
    ArcadeZoneList = {}
    ArcadeMerchantList = {}

    local count = CoinArcadeCommon and tonumber(CoinArcadeCommon.CABINET_COUNT) or 8
    local names = CoinArcadeCommon and CoinArcadeCommon.CABINET_NAMES or {}
    for i = 1, count do
        table.insert(ArcadeZoneList, {
            Id = i,
            Name = (type(names) == "table" and names[i]) or ("Cabinet " .. tostring(i)),
        })
    end

    local merchantCount = CoinArcadeCommon and tonumber(CoinArcadeCommon.MERCHANT_COUNT) or 8
    for i = 1, merchantCount do
        table.insert(ArcadeMerchantList, {
            Id = i,
            Name = "Merchant " .. tostring(i),
        })
    end

    Hub.SelectedArcadeZoneIndex = math.clamp(Hub.SelectedArcadeZoneIndex or 1, 1, math.max(1, #ArcadeZoneList))
    Hub.SelectedArcadeMerchantIndex = math.clamp(Hub.SelectedArcadeMerchantIndex or 1, 1, math.max(1, #ArcadeMerchantList))
    Hub.SelectedArcadeZone = ArcadeZoneList[Hub.SelectedArcadeZoneIndex] and ArcadeZoneList[Hub.SelectedArcadeZoneIndex].Id or 1
    Hub.SelectedArcadeMerchant = ArcadeMerchantList[Hub.SelectedArcadeMerchantIndex] and ArcadeMerchantList[Hub.SelectedArcadeMerchantIndex].Id or 1
end
rebuildArcadeLists()

local function isInArcade()
    if not InstancingCmds or not CoinArcadeCommon or type(InstancingCmds.IsInInstance) ~= "function" then
        return false
    end
    local ok, result = pcall(InstancingCmds.IsInInstance, CoinArcadeCommon.INSTANCE_ID)
    return ok and result == true
end

local function enterArcade()
    if isInArcade() then
        return true, "Already in Coin Arcade"
    end
    if not InstancingCmds or not CoinArcadeCommon or type(InstancingCmds.Enter) ~= "function" then
        return false, "InstancingCmds.Enter unavailable"
    end
    local ok, a, b = pcall(InstancingCmds.Enter, CoinArcadeCommon.INSTANCE_ID, nil, true, "Entering Coin Arcade!")
    if not ok then
        return false, tostring(a)
    end
    setStatus("Coin Arcade entry requested")
    return a ~= false, b
end

local function returnArcadeHub()
    if not InstancingCmds or not CoinArcadeCommon or type(InstancingCmds.FireCustom) ~= "function" then
        return false, "Arcade return unavailable"
    end
    local ok, err = pcall(InstancingCmds.FireCustom, CoinArcadeCommon.RETURN_TO_HUB)
    if not ok then
        return false, tostring(err)
    end
    setStatus("Returning to Coin Arcade hub")
    return true
end

local function arcadeInvoke(rpc, ...)
    if not InstancingCmds or type(InstancingCmds.InvokeCustom) ~= "function" then
        return false, "Instancing RPC unavailable"
    end
    local args = { ... }
    local ok, a, b, c = pcall(function()
        return InstancingCmds.InvokeCustom(rpc, unpackArgs(args))
    end)
    if not ok then
        return false, tostring(a)
    end
    return a, b, c
end

local function arcadeClaimAll()
    if not isInArcade() then
        return false, "Not in Coin Arcade"
    end
    if CoinArcadeCmds and type(CoinArcadeCmds.Claim) == "function" and CoinArcadeCommon then
        local ok, a, b = pcall(CoinArcadeCmds.Claim, CoinArcadeCommon.CLAIM_ALL)
        if ok then
            if a ~= false then Hub.Stats.ArcadeClaims = Hub.Stats.ArcadeClaims + 1 end
            return a, b
        end
    end
    if CoinArcadeCommon and CoinArcadeCommon.RPC then
        return arcadeInvoke(CoinArcadeCommon.RPC.Claim, CoinArcadeCommon.CLAIM_ALL)
    end
    return false, "Arcade claim API unavailable"
end

local function arcadeCurrentZone()
    if CoinArcadeCmds and type(CoinArcadeCmds.CurrentZone) == "function" then
        local ok, result = pcall(CoinArcadeCmds.CurrentZone)
        if ok and type(result) == "number" then
            return result
        end
    end
    return nil
end

local function arcadeHighestUnlockedZone()
    local count = CoinArcadeCommon and tonumber(CoinArcadeCommon.CABINET_COUNT) or 8
    local best = 1
    if not InstanceZoneCmds or type(InstanceZoneCmds.IsUnlocked) ~= "function" then
        return best
    end
    for i = 2, count do
        local ok, unlocked = pcall(InstanceZoneCmds.IsUnlocked, i)
        if ok and unlocked then
            best = i
        else
            break
        end
    end
    return best
end

local function arcadeUnlockNextZone()
    if not isInArcade() then
        return false, "Not in Coin Arcade"
    end
    local count = CoinArcadeCommon and tonumber(CoinArcadeCommon.CABINET_COUNT) or 8
    local highest = arcadeHighestUnlockedZone()
    local nextZone = highest + 1
    if nextZone > count then
        return false, "All Arcade zones unlocked"
    end
    if not CoinArcadeCommon or not CoinArcadeCommon.RPC then
        return false, "Arcade zone RPC unavailable"
    end
    local success, message = arcadeInvoke(CoinArcadeCommon.RPC.Zone, nextZone)
    if success then
        setStatus("Arcade zone " .. tostring(nextZone) .. " requested")
    end
    return success, message
end

local function arcadeUnlockedMerchant()
    if not CoinArcadeCommon then
        return 1
    end
    local save = getSave()
    local value = save and tonumber(save[CoinArcadeCommon.MERCHANT_UNLOCK_SAVE_KEY]) or 1
    return math.max(1, value or 1)
end

local function arcadeUnlockNextMerchant()
    if not isInArcade() then
        return false, "Not in Coin Arcade"
    end
    local count = CoinArcadeCommon and tonumber(CoinArcadeCommon.MERCHANT_COUNT) or 8
    local current = arcadeUnlockedMerchant()
    local nextMerchant = current + 1
    if nextMerchant > count then
        return false, "All Arcade merchants unlocked"
    end
    if not CoinArcadeCommon or not CoinArcadeCommon.RPC then
        return false, "Merchant unlock RPC unavailable"
    end
    local success, message = arcadeInvoke(CoinArcadeCommon.RPC.Unlock, nextMerchant)
    if success then
        Hub.SelectedArcadeMerchant = nextMerchant
        Hub.SelectedArcadeMerchantIndex = nextMerchant
        if Hub.State.ArcadeAutoHatch and CoinArcadeCmds and type(CoinArcadeCmds.SetHatchMerchant) == "function" then
            pcall(CoinArcadeCmds.SetHatchMerchant, nextMerchant)
        end
        setStatus("Arcade merchant " .. tostring(nextMerchant) .. " requested")
    end
    return success, message
end

local function setArcadeAutoHatch(enabled)
    Hub.State.ArcadeAutoHatch = enabled and true or false
    if not CoinArcadeCmds or type(CoinArcadeCmds.SetHatchMerchant) ~= "function" then
        return false, "CoinArcadeCmds.SetHatchMerchant unavailable"
    end

    -- Start() is idempotent in the recovered module and owns the game's native hatch pump.
    if enabled and type(CoinArcadeCmds.Start) == "function" then
        pcall(CoinArcadeCmds.Start)
    end

    local merchant = enabled and (tonumber(Hub.SelectedArcadeMerchant) or 1) or nil
    local ok, err = pcall(CoinArcadeCmds.SetHatchMerchant, merchant)
    if not ok then
        return false, tostring(err)
    end
    setStatus(enabled and ("Arcade hatch locked to Merchant " .. tostring(merchant)) or "Arcade auto hatch released")
    return true
end

local function refreshArcadeHatchMerchant()
    if Hub.State.ArcadeAutoHatch and CoinArcadeCmds and type(CoinArcadeCmds.SetHatchMerchant) == "function" then
        pcall(CoinArcadeCmds.SetHatchMerchant, tonumber(Hub.SelectedArcadeMerchant) or 1)
    end
end

local function arcadeUnitUID(item, fallback)
    if type(fallback) == "string" and fallback ~= "" then
        return fallback
    end
    if type(item) == "table" then
        if type(item._uid) == "string" then
            return item._uid
        end
        if type(item.GetOptionalUID) == "function" then
            local ok, uid = pcall(item.GetOptionalUID, item)
            if ok and type(uid) == "string" then
                return uid
            end
        end
    end
    return nil
end

local function arcadeUnitPower(item, zone)
    if CoinArcadeCmds and type(CoinArcadeCmds.DisplayPower) == "function" then
        local ok, power = pcall(CoinArcadeCmds.DisplayPower, zone, item)
        if ok and type(power) == "number" then
            return power
        end
        ok, power = pcall(CoinArcadeCmds.DisplayPower, nil, item)
        if ok and type(power) == "number" then
            return power
        end
    end
    return 0
end

local function arcadeUnitsSorted(zone)
    local result = {}
    if not ArcadeUnitItem or type(ArcadeUnitItem.All) ~= "function" then
        return result
    end
    local ok, all = pcall(ArcadeUnitItem.All, ArcadeUnitItem)
    if not ok or type(all) ~= "table" then
        return result
    end
    for uid, item in pairs(all) do
        local realUID = arcadeUnitUID(item, uid)
        if realUID then
            table.insert(result, {
                UID = realUID,
                Item = item,
                Power = arcadeUnitPower(item, zone),
            })
        end
    end
    table.sort(result, function(a, b)
        if a.Power == b.Power then
            return tostring(a.UID) < tostring(b.UID)
        end
        return a.Power > b.Power
    end)
    return result
end

local function arcadeUsedUIDs()
    local used = {}
    if not CoinArcadeCmds or not CoinArcadeCommon then
        return used
    end
    local zones = tonumber(CoinArcadeCommon.CABINET_COUNT) or 8
    for zone = 1, zones do
        local slots = 1
        if type(CoinArcadeCmds.MaxSlots) == "function" then
            local ok, value = pcall(CoinArcadeCmds.MaxSlots, zone)
            if ok and type(value) == "number" then
                slots = math.max(1, math.floor(value))
            end
        end
        for slot = 1, slots do
            local slotKey = CoinArcadeCommon.SlotKey and CoinArcadeCommon.SlotKey(slot) or tostring(slot)
            if type(CoinArcadeCmds.UnitAt) == "function" then
                local ok, item = pcall(CoinArcadeCmds.UnitAt, zone, slotKey)
                if ok and item then
                    local uid = arcadeUnitUID(item)
                    if uid then used[uid] = true end
                end
            end
        end
    end

    if type(CoinArcadeCmds.BossSlots) == "function" and type(CoinArcadeCmds.BossUnitAt) == "function" then
        local ok, slots = pcall(CoinArcadeCmds.BossSlots)
        if ok and type(slots) == "number" then
            for slot = 1, math.max(0, math.floor(slots)) do
                local slotKey = CoinArcadeCommon.SlotKey and CoinArcadeCommon.SlotKey(slot) or tostring(slot)
                local okItem, item = pcall(CoinArcadeCmds.BossUnitAt, slotKey)
                if okItem and item then
                    local uid = arcadeUnitUID(item)
                    if uid then used[uid] = true end
                end
            end
        end
    end
    return used
end

local function firstUnusedArcadeUnit(units, used)
    for _, entry in ipairs(units) do
        if not used[entry.UID] then
            return entry
        end
    end
    return nil
end

local function fillArcadeZone(zone, used)
    if not isInArcade() or not CoinArcadeCmds or not CoinArcadeCommon then
        return 0
    end
    used = used or arcadeUsedUIDs()
    local units = arcadeUnitsSorted(zone)
    local slots = 1
    if type(CoinArcadeCmds.MaxSlots) == "function" then
        local ok, value = pcall(CoinArcadeCmds.MaxSlots, zone)
        if ok and type(value) == "number" then
            slots = math.max(1, math.floor(value))
        end
    end

    local placed = 0
    for slot = 1, slots do
        local slotKey = CoinArcadeCommon.SlotKey and CoinArcadeCommon.SlotKey(slot) or tostring(slot)
        local occupied = nil
        if type(CoinArcadeCmds.UnitAt) == "function" then
            local ok, item = pcall(CoinArcadeCmds.UnitAt, zone, slotKey)
            if ok then occupied = item end
        end
        if not occupied then
            local entry = firstUnusedArcadeUnit(units, used)
            if not entry then break end
            local ok, success = pcall(CoinArcadeCmds.Station, zone, slot, entry.UID)
            if ok and success ~= false then
                used[entry.UID] = true
                placed = placed + 1
                task.wait(0.10)
            else
                -- Avoid hammering the same rejected unit/slot during this pass.
                used[entry.UID] = true
            end
        end
    end
    return placed
end

local function fillAllArcadeZones()
    if not CoinArcadeCommon then return 0 end
    local used = arcadeUsedUIDs()
    local placed = 0
    local count = tonumber(CoinArcadeCommon.CABINET_COUNT) or 8
    -- Highest cabinet first: strongest free units go where recommended power is highest.
    for zone = count, 1, -1 do
        placed = placed + fillArcadeZone(zone, used)
    end
    Hub.Stats.ArcadeUnits = Hub.Stats.ArcadeUnits + placed
    return placed
end

local function fillArcadeBoss()
    if not isInArcade() or not CoinArcadeCmds or not CoinArcadeCommon then
        return 0
    end
    if type(CoinArcadeCmds.BossSlots) ~= "function" or type(CoinArcadeCmds.BossStation) ~= "function" then
        return 0
    end
    local ok, slots = pcall(CoinArcadeCmds.BossSlots)
    if not ok or type(slots) ~= "number" then return 0 end

    local used = arcadeUsedUIDs()
    local units = arcadeUnitsSorted(nil)
    local placed = 0
    for slot = 1, math.max(0, math.floor(slots)) do
        local slotKey = CoinArcadeCommon.SlotKey and CoinArcadeCommon.SlotKey(slot) or tostring(slot)
        local occupied = nil
        if type(CoinArcadeCmds.BossUnitAt) == "function" then
            local okItem, item = pcall(CoinArcadeCmds.BossUnitAt, slotKey)
            if okItem then occupied = item end
        end
        if not occupied then
            local entry = firstUnusedArcadeUnit(units, used)
            if not entry then break end
            local okPlace, success = pcall(CoinArcadeCmds.BossStation, slot, entry.UID)
            if okPlace and success ~= false then
                used[entry.UID] = true
                placed = placed + 1
                task.wait(0.10)
            else
                used[entry.UID] = true
            end
        end
    end
    Hub.Stats.ArcadeUnits = Hub.Stats.ArcadeUnits + placed
    return placed
end

local function arcadeUpgradePass(limit)
    if not isInArcade() or not EventUpgradeCmds then
        return 0
    end
    local upgrades = EventUpgrades or (Directory and Directory.EventUpgrades)
    if type(upgrades) ~= "table" then
        return 0
    end

    local names = {}
    for name, data in pairs(upgrades) do
        local id = type(data) == "table" and (data._id or name) or name
        if type(id) == "string" and string.sub(id, 1, 10) == "CoinArcade" then
            table.insert(names, { Name = name, Data = data })
        end
    end
    table.sort(names, function(a, b) return tostring(a.Name) < tostring(b.Name) end)

    local purchased = 0
    local maxPerPass = tonumber(limit) or 10
    for _, entry in ipairs(names) do
        if purchased >= maxPerPass then break end
        local data = entry.Data
        local name = entry.Name
        if type(data) == "table" and type(data.TierCosts) == "table" and type(EventUpgradeCmds.GetTier) == "function" and type(EventUpgradeCmds.Purchase) == "function" then
            local okTier, tier = pcall(EventUpgradeCmds.GetTier, name)
            if okTier and type(tier) == "number" and tier < #data.TierCosts then
                local cost = data.TierCosts[tier + 1]
                local affordable = true
                if cost and type(cost.FindExact) == "function" then
                    local okCost, found = pcall(cost.FindExact, cost)
                    affordable = okCost and found and true or false
                end
                if affordable then
                    local okBuy, success = pcall(EventUpgradeCmds.Purchase, name)
                    if okBuy and success ~= false then
                        purchased = purchased + 1
                        task.wait(0.08)
                    end
                end
            end
        end
    end
    Hub.Stats.ArcadeUpgrades = Hub.Stats.ArcadeUpgrades + purchased
    return purchased
end

local function objectCFrame(object)
    if typeof(object) ~= "Instance" then return nil end
    if object:IsA("BasePart") then return object.CFrame end
    if object:IsA("Model") then
        local ok, cf = pcall(object.GetPivot, object)
        if ok then return cf end
    end
    local part = object:FindFirstChildWhichIsA("BasePart", true)
    return part and part.CFrame or nil
end

local function arcadeTeleportTo(kind, id)
    if not isInArcade() then return false, "Not in Coin Arcade" end
    if not CoinArcadeCmds or not CoinArcadePlace then return false, "Arcade place modules unavailable" end
    local model = nil
    if type(CoinArcadeCmds.GetModel) == "function" then
        local ok, result = pcall(CoinArcadeCmds.GetModel)
        if ok then model = result end
    end
    if not model then return false, "Arcade model not ready" end

    local target = nil
    if kind == "zone" and type(CoinArcadePlace.ZoneSpawn) == "function" then
        local ok, result = pcall(CoinArcadePlace.ZoneSpawn, model, id)
        if ok then target = result end
    elseif kind == "merchant" and type(CoinArcadePlace.MerchantPad) == "function" then
        local ok, result = pcall(CoinArcadePlace.MerchantPad, model, id)
        if ok then target = result end
    elseif kind == "hub" and type(CoinArcadePlace.HubSpawn) == "function" then
        local ok, result = pcall(CoinArcadePlace.HubSpawn, model)
        if ok then target = result end
    elseif kind == "boss" and type(CoinArcadePlace.BossSpawn) == "function" then
        local ok, result = pcall(CoinArcadePlace.BossSpawn, model)
        if ok then target = result end
    end

    local cf = objectCFrame(target)
    if not cf then return false, "Arcade teleport target not found" end
    cf = cf + Vector3.new(0, 3, 0)

    if CoinArcadeZoneCmds and type(CoinArcadeZoneCmds.Teleport) == "function" then
        local ok, err = pcall(CoinArcadeZoneCmds.Teleport, cf)
        if ok then return true end
        return false, tostring(err)
    end

    local root = getRoot()
    if root then
        root.CFrame = cf
        return true
    end
    return false, "Character root unavailable"
end

local function setPowerFarm(enabled)
    local value = enabled and true or false
    Hub.State.PowerFarm = value
    Hub.State.NativeAutoFarm = value
    Hub.State.AutoTap = value
    Hub.State.AutoOrbs = value
    Hub.State.AutoLootables = value
    setNativeAutoFarm(value)
    if Hub.RepaintPowerFarm then pcall(Hub.RepaintPowerFarm, value) end
    if value then pcall(collectExistingOrbs); pcall(openExistingLootables); setStatus("POWER FARM: breakables + taps + orbs + lootables")
    else setStatus("POWER FARM disabled") end
end

local setArcadeGodMode

local function setUltraFarm(enabled)
    local value = enabled and true or false
    Hub.State.UltraFarm = value
    Hub.State.UltraSmartHatch = value
    setPowerFarm(value)
    Hub.State.AutoBuyZones = value
    Hub.State.AutoTeleportAfterZone = value
    Hub.State.AutoBestEgg = value
    Hub.State.AutoFreeGifts = value
    Hub.State.AutoDailyRewards = value
    Hub.State.AutoRankRewards = value
    Hub.State.AutoPotions = value
    Hub.State.AutoFruits = value
    Hub.State.AutoDaycareClaim = value
    Hub.State.AutoSpinWheels = value
    Hub.State.AutoEquipBest = value
    Hub.State.AntiAFK = true
    if value then
        Hub.State.FarmTargetMode, Hub.State.FarmTargetModeIndex = "Special First", 2
        if Hub.RefreshFarmTargetMode then pcall(Hub.RefreshFarmTargetMode) end
        Hub.UltraPhase = "PROGRESSION"
        pcall(Hub.WorldFarm.EquipBestPets); pcall(Hub.WorldFarm.ActivatePotions, false); pcall(Hub.WorldFarm.FillFruits, false); pcall(Hub.WorldFarm.ClaimDaycare)
        setStatus("ULTRA FARM: smart progression + special targets + buffs + services")
    else
        if Hub.State.UltraAutoRebirth then Hub.State.AutoRebirth = false end
        Hub.UltraPhase = "IDLE"
        setStatus("ULTRA FARM disabled")
    end
    if Hub.RepaintUltraFarm then pcall(Hub.RepaintUltraFarm, value) end
end

local function stopAllAutomation()
    for _, key in ipairs({"UltraFarm","UltraSmartHatch","PowerFarm","AutoBestEgg","AutoTeleportAfterZone","AutoHatch","AutoBuyZones","AutoPotions","AutoFruits","AutoDaycareClaim","AutoSpinWheels","AutoEquipBest","AutoRebirth","AutoFreeGifts","AutoDailyRewards","AutoRankRewards"}) do Hub.State[key] = false end
    setPowerFarm(false)
    if setArcadeGodMode then setArcadeGodMode(false) end
    Hub.State.Noclip, Hub.State.EnforceWalkSpeed, Hub.UltraPhase = false, false, "IDLE"
    local humanoid = getHumanoid(); if humanoid then humanoid.WalkSpeed = 16 end
    if Hub.RepaintPowerFarm then pcall(Hub.RepaintPowerFarm, false) end
    if Hub.RepaintUltraFarm then pcall(Hub.RepaintUltraFarm, false) end
    setStatus("All automation stopped")
end

local function copyToClipboard(text)
    local env = (getgenv and getgenv()) or _G
    local clip = rawget(env, "setclipboard") or rawget(env, "toclipboard") or rawget(_G, "setclipboard") or rawget(_G, "toclipboard")
    if type(clip) == "function" then
        local ok = pcall(clip, tostring(text or ""))
        return ok
    end
    return false
end

local function joinLowestPlayerServer()
    local url = "https://games.roblox.com/v1/games/" .. tostring(game.PlaceId) .. "/servers/Public?sortOrder=Asc&limit=100"
    local statusCode, body = __a7Request(url)
    if statusCode ~= 200 or type(body) ~= "string" then
        return false, "Server list unavailable"
    end

    local ok, data = pcall(function() return __A7KeyHttp:JSONDecode(body) end)
    if not ok or type(data) ~= "table" or type(data.data) ~= "table" then
        return false, "Invalid server list"
    end

    local best = nil
    for _, server in ipairs(data.data) do
        if type(server) == "table" and server.id and server.id ~= game.JobId then
            local playing = tonumber(server.playing) or math.huge
            local maxPlayers = tonumber(server.maxPlayers) or 0
            if maxPlayers > playing and (not best or playing < (tonumber(best.playing) or math.huge)) then
                best = server
            end
        end
    end

    if not best then
        return false, "No alternate public server found"
    end

    TeleportService:TeleportToPlaceInstance(game.PlaceId, best.id, LocalPlayer)
    return true, "Joining low-player server..."
end

setArcadeGodMode = function(enabled)
    local value = enabled and true or false
    if value then
        local bestMerchant = arcadeUnlockedMerchant()
        Hub.SelectedArcadeMerchant = bestMerchant
        Hub.SelectedArcadeMerchantIndex = bestMerchant
    end
    Hub.State.ArcadeGodMode = value
    Hub.State.ArcadeAutoClaim = value
    Hub.State.ArcadeAutoZones = value
    Hub.State.ArcadeAutoMerchants = value
    Hub.State.ArcadeAutoStations = value
    Hub.State.ArcadeAutoBoss = value
    Hub.State.ArcadeAutoUpgrades = value
    setArcadeAutoHatch(value)
    setStatus(value and "ARCADE GOD MODE enabled" or "ARCADE GOD MODE disabled")
end

-- ============================================================
-- Event-based collection hooks
-- ============================================================

if Network and type(Network.Fired) == "function" then
    local okOrbs, orbSignal = pcall(Network.Fired, "Orbs: Create")
    if okOrbs and orbSignal and type(orbSignal.Connect) == "function" then
        track(orbSignal:Connect(function(packetList)
            if not Hub.Alive or not Hub.State.AutoOrbs or type(packetList) ~= "table" then
                return
            end
            local ids = {}
            for _, packet in ipairs(packetList) do
                if type(packet) == "table" and packet.id ~= nil then
                    table.insert(ids, packet.id)
                end
            end
            if #ids > 0 then
                task.defer(function()
                    if Hub.Alive and Hub.State.AutoOrbs then
                        fireRemote("Orbs: Collect", ids)
                    end
                end)
            end
        end))
    end

    local okLoot, lootSignal = pcall(Network.Fired, "Lootables")
    if okLoot and lootSignal and type(lootSignal.Connect) == "function" then
        track(lootSignal:Connect(function(packetList)
            if not Hub.Alive or not Hub.State.AutoLootables or type(packetList) ~= "table" then
                return
            end
            for _, packet in ipairs(packetList) do
                if type(packet) == "table" and packet.Id ~= nil then
                    task.defer(function()
                        if Hub.Alive and Hub.State.AutoLootables then
                            invokeRemote("Lootables_Open", packet.Id)
                        end
                    end)
                end
            end
        end))
    end
end

-- ============================================================
-- Background workers
-- ============================================================

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoTap then
            pcall(tapNearest)
        end
        task.wait(math.max(0.03, tonumber(Hub.State.TapDelay) or 0.08))
    end
end)

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoOrbs then
            pcall(collectExistingOrbs)
        end
        task.wait(1.5)
    end
end)

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoLootables then
            pcall(openExistingLootables)
        end
        task.wait(2.2)
    end
end)

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoBuyZones then
            local ok, purchased = pcall(buyNextZone)
            if not ok then
                setStatus("Zone loop: " .. tostring(purchased))
            elseif purchased and Hub.State.AutoTeleportAfterZone then
                task.wait(0.25)
                pcall(teleportHighestOwned)
            end
        end
        task.wait(1.4)
    end
end)

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoHatch then
            if Hub.State.AutoBestEgg then
                pcall(rebuildEggList)
            end
            if Hub.SelectedEgg then
                local success, message = hatchSelectedEgg()
                if not success and message then
                    if tostring(message):find("too quickly") then
                        task.wait(2.5)
                    else
                        setStatus("Hatch: " .. tostring(message))
                    end
                end
            end
        end
        task.wait(math.max(0.25, tonumber(Hub.State.HatchDelay) or 0.85))
    end
end)

task.spawn(function()
    while Hub.Alive do
        if Hub.State.AutoFreeGifts then pcall(claimFreeGifts) end
        if Hub.State.AutoDailyRewards then pcall(claimDailyRewards) end
        if Hub.State.AutoRankRewards then pcall(claimRankRewards) end
        task.wait(5)
    end
end)

task.spawn(function()
    local lastPotions, lastFruits, lastDaycare, lastWheels, lastPets, lastRebirth = 0, 0, 0, 0, 0, 0
    while Hub.Alive do
        local now = os.clock()
        if Hub.State.AutoPotions and now - lastPotions >= 15 then lastPotions = now; pcall(Hub.WorldFarm.ActivatePotions, false) end
        if Hub.State.AutoFruits and now - lastFruits >= 15 then lastFruits = now; pcall(Hub.WorldFarm.FillFruits, false) end
        if Hub.State.AutoDaycareClaim and now - lastDaycare >= 10 then lastDaycare = now; pcall(Hub.WorldFarm.ClaimDaycare) end
        if Hub.State.AutoSpinWheels and now - lastWheels >= 8 then lastWheels = now; pcall(Hub.WorldFarm.SpinWheels) end
        if Hub.State.AutoEquipBest and now - lastPets >= 45 then lastPets = now; pcall(Hub.WorldFarm.EquipBestPets) end
        if Hub.State.AutoRebirth and now - lastRebirth >= 12 then lastRebirth = now; pcall(Hub.WorldFarm.TryRebirth) end
        task.wait(0.5)
    end
end)

task.spawn(function()
    local lastMaintenance, lastHatch = 0, 0
    while Hub.Alive do
        if Hub.State.UltraFarm then
            local now = os.clock()
            local okNext, nextLocked = pcall(getNextLockedZone)
            if okNext and nextLocked then
                Hub.UltraPhase = "PROGRESSION -> " .. tostring(nextLocked.Name or nextLocked.Id)
            else
                Hub.UltraPhase = "MAX ZONE -> SMART HATCH"
                if Hub.State.UltraSmartHatch and now - lastHatch >= (tonumber(Hub.State.UltraHatchInterval) or 12) then
                    lastHatch = now; pcall(rebuildEggList); if Hub.SelectedEgg then pcall(hatchSelectedEgg) end
                end
                if Hub.State.UltraAutoRebirth then Hub.State.AutoRebirth = true end
            end
            if now - lastMaintenance >= (tonumber(Hub.State.UltraMaintenanceInterval) or 10) then
                lastMaintenance = now; Hub.Stats.UltraCycles = Hub.Stats.UltraCycles + 1
                pcall(Hub.WorldFarm.EquipBestPets); pcall(Hub.WorldFarm.ActivatePotions, false); pcall(Hub.WorldFarm.FillFruits, false); pcall(Hub.WorldFarm.ClaimDaycare)
                pcall(claimFreeGifts); pcall(claimDailyRewards); pcall(claimRankRewards)
            end
        else Hub.UltraPhase = "IDLE" end
        task.wait(0.5)
    end
end)


task.spawn(function()
    while Hub.Alive do
        if Hub.State.PerformanceMode then
            pcall(applyPerformancePass)
        end
        task.wait(3)
    end
end)



task.spawn(function()
    local lastClaim = 0
    local lastProgress = 0
    local lastStations = 0
    local lastUpgrades = 0
    local lastWasInArcade = false

    while Hub.Alive do
        local now = os.clock()
        local inArcade = isInArcade()

        if inArcade and not lastWasInArcade then
            if CoinArcadeCmds and type(CoinArcadeCmds.Start) == "function" then pcall(CoinArcadeCmds.Start) end
            if CoinArcadeZoneCmds and type(CoinArcadeZoneCmds.Start) == "function" then pcall(CoinArcadeZoneCmds.Start) end
            refreshArcadeHatchMerchant()
            setStatus("Coin Arcade detected • automations ready")
        end
        lastWasInArcade = inArcade

        if inArcade then
            if Hub.State.ArcadeAutoClaim and now - lastClaim >= (tonumber(Hub.State.ArcadeClaimDelay) or 2) then
                lastClaim = now
                pcall(arcadeClaimAll)
            end

            if now - lastProgress >= (tonumber(Hub.State.ArcadeProgressDelay) or 1.2) then
                lastProgress = now
                if Hub.State.ArcadeAutoZones then pcall(arcadeUnlockNextZone) end
                if Hub.State.ArcadeAutoMerchants then pcall(arcadeUnlockNextMerchant) end
            end

            if now - lastStations >= (tonumber(Hub.State.ArcadeStationDelay) or 5) then
                lastStations = now
                -- Boss gets first pick of free high-power units, then cabinets consume the rest.
                if Hub.State.ArcadeAutoBoss then pcall(fillArcadeBoss) end
                if Hub.State.ArcadeAutoStations then pcall(fillAllArcadeZones) end
            end

            if Hub.State.ArcadeAutoUpgrades and now - lastUpgrades >= (tonumber(Hub.State.ArcadeUpgradeDelay) or 2.5) then
                lastUpgrades = now
                pcall(arcadeUpgradePass, 10)
            end
        end

        task.wait(0.20)
    end
end)

track(RunService.Stepped:Connect(function()
    if not Hub.Alive then
        return
    end

    if Hub.State.Noclip then
        local character = getCharacter()
        if character then
            for _, item in ipairs(character:GetDescendants()) do
                if item:IsA("BasePart") then
                    item.CanCollide = false
                end
            end
        end
    end

    if Hub.State.EnforceWalkSpeed then
        local humanoid = getHumanoid()
        if humanoid and humanoid.WalkSpeed ~= Hub.State.WalkSpeed then
            humanoid.WalkSpeed = Hub.State.WalkSpeed
        end
    end
end))

track(LocalPlayer.Idled:Connect(function()
    if Hub.Alive and Hub.State.AntiAFK then
        pcall(function()
            VirtualUser:Button2Down(Vector2.new(0, 0), workspace.CurrentCamera.CFrame)
            task.wait(0.1)
            VirtualUser:Button2Up(Vector2.new(0, 0), workspace.CurrentCamera.CFrame)
        end)
    end
end))

-- ============================================================
-- UI — A7DEV COMPACT CONSOLE
-- compact double-border window, horizontal tabs, two columns,
-- square checkboxes, thin red section lines, readable mono text.
-- ============================================================

local OldGui = PlayerGui:FindFirstChild("A7DEV_PS99_ARCADE")
if OldGui then
    OldGui:Destroy()
end

-- Compatibility-first UI parent. Do not promote to gethui/CoreGui here:
-- some executors return CoreGui from gethui but deny parenting to it.
local UIParent = PlayerGui

local Theme = {
    Window = Color3.fromRGB(7, 8, 8),
    Window2 = Color3.fromRGB(10, 10, 11),
    Panel = Color3.fromRGB(8, 8, 9),
    Panel2 = Color3.fromRGB(12, 12, 13),
    Field = Color3.fromRGB(5, 5, 6),
    Border = Color3.fromRGB(55, 63, 63),
    BorderDark = Color3.fromRGB(29, 31, 31),
    Red = Color3.fromRGB(162, 12, 20),
    RedBright = Color3.fromRGB(194, 20, 28),
    RedDark = Color3.fromRGB(91, 7, 12),
    Text = Color3.fromRGB(214, 214, 214),
    TextDim = Color3.fromRGB(178, 178, 182),
    TextFaint = Color3.fromRGB(115, 115, 120),
}
local UIFont = Enum.Font.Code

local function uiStroke(obj, color, thickness)
    local s = Instance.new("UIStroke")
    s.Color = color or Theme.BorderDark
    s.Thickness = thickness or 1
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = obj
    return s
end

local Gui = Instance.new("ScreenGui")
Gui.Name = "A7DEV_PS99_ARCADE"
Gui.ResetOnSpawn = false
Gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
Gui.Parent = UIParent
Hub.Gui = Gui

local Main = Instance.new("Frame")
Main.Name = "Main"
Main.Size = UDim2.fromOffset(760, 520)
Main.AnchorPoint = Vector2.new(0.5, 0.5)
Main.Position = UDim2.fromScale(0.5, 0.5)
Main.BackgroundColor3 = Theme.Window
Main.BorderSizePixel = 0
Main.Parent = Gui
uiStroke(Main, Theme.Border, 1)

local MainScale = Instance.new("UIScale")
MainScale.Name = "ResponsiveScale"
MainScale.Scale = 1
MainScale.Parent = Main
local function refreshMainScale()
    local camera = workspace.CurrentCamera
    if not camera then return end
    local viewport = camera.ViewportSize
    local scale = math.min(1, (viewport.X - 24) / 760, (viewport.Y - 24) / 520)
    MainScale.Scale = math.max(0.72, scale)
end
refreshMainScale()
if workspace.CurrentCamera then
    track(workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(refreshMainScale))
end

local Inner = Instance.new("Frame")
Inner.Position = UDim2.fromOffset(3, 3)
Inner.Size = UDim2.new(1, -6, 1, -6)
Inner.BackgroundTransparency = 1
Inner.BorderSizePixel = 0
Inner.Parent = Main
uiStroke(Inner, Color3.fromRGB(20, 24, 24), 1)

local Header = Instance.new("Frame")
Header.Position = UDim2.fromOffset(6, 6)
Header.Size = UDim2.new(1, -12, 0, 26)
Header.BackgroundColor3 = Theme.Window2
Header.BorderSizePixel = 0
Header.Parent = Main

local Title = Instance.new("TextLabel")
Title.BackgroundTransparency = 1
Title.Position = UDim2.fromOffset(4, 0)
Title.Size = UDim2.new(0.65, 0, 1, 0)
Title.Font = UIFont
Title.Text = "A7DEV.hub | Pet Simulator 99"
Title.TextColor3 = Theme.Text
Title.TextSize = 12
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.Parent = Header

local TinyStatus = Instance.new("TextLabel")
TinyStatus.BackgroundTransparency = 1
TinyStatus.Position = UDim2.new(0.64, 0, 0, 0)
TinyStatus.Size = UDim2.new(0.28, 0, 1, 0)
TinyStatus.Font = UIFont
TinyStatus.Text = "ARCADE • a7med_hub"
TinyStatus.TextColor3 = Theme.TextDim
TinyStatus.TextSize = 10
TinyStatus.TextXAlignment = Enum.TextXAlignment.Right
TinyStatus.Parent = Header

local CloseButton = Instance.new("TextButton")
CloseButton.Size = UDim2.fromOffset(22, 16)
CloseButton.Position = UDim2.new(1, -25, 0, 5)
CloseButton.BackgroundColor3 = Theme.Field
CloseButton.BorderSizePixel = 0
CloseButton.Text = "x"
CloseButton.Font = UIFont
CloseButton.TextSize = 10
CloseButton.TextColor3 = Theme.TextDim
CloseButton.AutoButtonColor = false
CloseButton.Parent = Header
local closeStroke = uiStroke(CloseButton, Theme.BorderDark, 1)
CloseButton.MouseEnter:Connect(function()
    closeStroke.Color = Theme.RedBright
    CloseButton.TextColor3 = Theme.Text
end)
CloseButton.MouseLeave:Connect(function()
    closeStroke.Color = Theme.BorderDark
    CloseButton.TextColor3 = Theme.TextDim
end)

local TopRedLine = Instance.new("Frame")
TopRedLine.Position = UDim2.fromOffset(7, 33)
TopRedLine.Size = UDim2.new(1, -14, 0, 1)
TopRedLine.BackgroundColor3 = Theme.Red
TopRedLine.BorderSizePixel = 0
TopRedLine.Parent = Main

local TabBar = Instance.new("Frame")
TabBar.Position = UDim2.fromOffset(8, 35)
TabBar.Size = UDim2.new(1, -16, 0, 28)
TabBar.BackgroundColor3 = Theme.Panel
TabBar.BorderSizePixel = 0
TabBar.Parent = Main
uiStroke(TabBar, Theme.BorderDark, 1)

local Body = Instance.new("Frame")
Body.Position = UDim2.fromOffset(8, 67)
Body.Size = UDim2.new(1, -16, 1, -97)
Body.BackgroundColor3 = Theme.Panel
Body.BorderSizePixel = 0
Body.ClipsDescendants = true
Body.Parent = Main
uiStroke(Body, Theme.BorderDark, 1)

local Footer = Instance.new("Frame")
Footer.Position = UDim2.new(0, 8, 1, -24)
Footer.Size = UDim2.new(1, -16, 0, 16)
Footer.BackgroundColor3 = Theme.Window2
Footer.BorderSizePixel = 0
Footer.Parent = Main
uiStroke(Footer, Theme.BorderDark, 1)

local StatusLabel = Instance.new("TextLabel")
StatusLabel.BackgroundTransparency = 1
StatusLabel.Position = UDim2.fromOffset(4, 0)
StatusLabel.Size = UDim2.new(1, -8, 1, 0)
StatusLabel.Font = UIFont
StatusLabel.Text = Hub.LastStatus or "Ready"
StatusLabel.TextColor3 = Theme.TextDim
StatusLabel.TextSize = 10
StatusLabel.TextXAlignment = Enum.TextXAlignment.Left
StatusLabel.Parent = Footer
Hub.StatusLabel = StatusLabel

local Pages = {}
local TabButtons = {}
local ActiveTab = "FARM"

local function makePage(name)
    local page = Instance.new("Frame")
    page.Name = name
    page.Size = UDim2.fromScale(1, 1)
    page.BackgroundTransparency = 1
    page.Visible = false
    page.Parent = Body

    local left = Instance.new("ScrollingFrame")
    left.Name = "Left"
    left.Position = UDim2.fromOffset(7, 7)
    left.Size = UDim2.new(0.5, -10, 1, -14)
    left.BackgroundTransparency = 1
    left.BorderSizePixel = 0
    left.ScrollBarThickness = 2
    left.ScrollBarImageColor3 = Theme.RedDark
    left.CanvasSize = UDim2.fromOffset(0, 0)
    left.Parent = page
    local ll = Instance.new("UIListLayout")
    ll.Padding = UDim.new(0, 7)
    ll.SortOrder = Enum.SortOrder.LayoutOrder
    ll.Parent = left
    ll:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        left.CanvasSize = UDim2.fromOffset(0, ll.AbsoluteContentSize.Y + 6)
    end)

    local right = Instance.new("ScrollingFrame")
    right.Name = "Right"
    right.Position = UDim2.new(0.5, 3, 0, 7)
    right.Size = UDim2.new(0.5, -10, 1, -14)
    right.BackgroundTransparency = 1
    right.BorderSizePixel = 0
    right.ScrollBarThickness = 2
    right.ScrollBarImageColor3 = Theme.RedDark
    right.CanvasSize = UDim2.fromOffset(0, 0)
    right.Parent = page
    local rl = Instance.new("UIListLayout")
    rl.Padding = UDim.new(0, 7)
    rl.SortOrder = Enum.SortOrder.LayoutOrder
    rl.Parent = right
    rl:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        right.CanvasSize = UDim2.fromOffset(0, rl.AbsoluteContentSize.Y + 6)
    end)

    Pages[name] = {Frame = page, Left = left, Right = right}
    return Pages[name]
end

local function selectTab(name)
    ActiveTab = name
    for n, pageInfo in pairs(Pages) do
        pageInfo.Frame.Visible = (n == name)
    end
    for n, button in pairs(TabButtons) do
        local active = n == name
        button.TextColor3 = active and Theme.Text or Theme.TextDim
        button.BackgroundColor3 = active and Color3.fromRGB(13, 8, 9) or Theme.Panel
        local line = button:FindFirstChild("Line")
        if line then
            line.Visible = active
        end
    end
end

local function addTopTab(name, index)
    local button = Instance.new("TextButton")
    button.Name = name
    button.Size = UDim2.fromOffset(90, 24)
    button.Position = UDim2.fromOffset(4 + ((index - 1) * 92), 2)
    button.BackgroundColor3 = Theme.Panel
    button.BorderSizePixel = 0
    button.Text = name
    button.Font = UIFont
    button.TextSize = 10
    button.TextColor3 = Theme.TextDim
    button.AutoButtonColor = false
    button.Parent = TabBar

    local line = Instance.new("Frame")
    line.Name = "Line"
    line.Position = UDim2.new(0, 3, 1, -1)
    line.Size = UDim2.new(1, -6, 0, 1)
    line.BackgroundColor3 = Theme.RedBright
    line.BorderSizePixel = 0
    line.Visible = false
    line.Parent = button

    button.MouseEnter:Connect(function()
        if ActiveTab ~= name then
            button.TextColor3 = Theme.Text
        end
    end)
    button.MouseLeave:Connect(function()
        if ActiveTab ~= name then
            button.TextColor3 = Theme.TextDim
        end
    end)
    button.Activated:Connect(function()
        selectTab(name)
    end)
    TabButtons[name] = button
end

local function makeGroup(parent, title)
    local box = Instance.new("Frame")
    box.Size = UDim2.new(1, -4, 0, 35)
    box.BackgroundColor3 = Theme.Panel
    box.BorderSizePixel = 0
    box.Parent = parent
    uiStroke(box, Theme.BorderDark, 1)

    local redLine = Instance.new("Frame")
    redLine.Position = UDim2.fromOffset(5, 9)
    redLine.Size = UDim2.new(1, -10, 0, 1)
    redLine.BackgroundColor3 = Theme.Red
    redLine.BorderSizePixel = 0
    redLine.Parent = box

    local header = Instance.new("TextLabel")
    header.BackgroundColor3 = Theme.Panel
    header.BorderSizePixel = 0
    header.Position = UDim2.fromOffset(7, 2)
    header.Size = UDim2.fromOffset(math.max(50, #title * 7 + 12), 16)
    header.Font = UIFont
    header.Text = title
    header.TextColor3 = Theme.Text
    header.TextSize = 10
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.Parent = box

    local content = Instance.new("Frame")
    content.Position = UDim2.fromOffset(5, 22)
    content.Size = UDim2.new(1, -10, 0, 10)
    content.BackgroundTransparency = 1
    content.BorderSizePixel = 0
    content.Parent = box

    local list = Instance.new("UIListLayout")
    list.Padding = UDim.new(0, 2)
    list.SortOrder = Enum.SortOrder.LayoutOrder
    list.Parent = content
    local function resize()
        local h = list.AbsoluteContentSize.Y
        content.Size = UDim2.new(1, -10, 0, h)
        box.Size = UDim2.new(1, -4, 0, h + 29)
    end
    list:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(resize)
    task.defer(resize)
    return content, box
end

local function compactRow(parent, height)
    local row = Instance.new("Frame")
    row.Size = UDim2.new(1, 0, 0, height or 24)
    row.BackgroundColor3 = Theme.Panel2
    row.BorderSizePixel = 0
    row.Parent = parent
    uiStroke(row, Color3.fromRGB(25, 25, 26), 1)
    return row
end

local function tinyLabel(parent, textValue, x, width)
    local label = Instance.new("TextLabel")
    label.BackgroundTransparency = 1
    label.Position = UDim2.fromOffset(x or 5, 0)
    label.Size = UDim2.new(0, width or 160, 1, 0)
    label.Font = UIFont
    label.Text = tostring(textValue or "")
    label.TextColor3 = Theme.TextDim
    label.TextSize = 10
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.TextTruncate = Enum.TextTruncate.AtEnd
    label.Parent = parent
    return label
end

local function makeCheckbox(parent, initial, setter)
    local state = initial == true
    local button = Instance.new("TextButton")
    button.Size = UDim2.fromOffset(12, 12)
    button.Position = UDim2.fromOffset(6, 6)
    button.BackgroundColor3 = Theme.Field
    button.BorderSizePixel = 0
    button.Font = UIFont
    button.TextSize = 10
    button.AutoButtonColor = false
    button.Parent = parent
    local border = uiStroke(button, Theme.Border, 1)

    local function paint()
        button.BackgroundColor3 = state and Theme.RedBright or Theme.Field
        button.Text = state and "x" or ""
        button.TextColor3 = Theme.Text
        border.Color = state and Theme.RedBright or Theme.Border
    end

    button.Activated:Connect(function()
        state = not state
        paint()
        local ok, err = pcall(setter, state)
        if not ok then
            setStatus("Error: " .. tostring(err))
        end
    end)
    paint()
    return button, function(value)
        if value ~= nil then
            state = value == true
        end
        paint()
    end
end

local function addToggle(parent, label, initial, callback)
    local row = compactRow(parent, 24)
    tinyLabel(row, label, 24, 285)
    local _, repaint = makeCheckbox(row, initial, function(value)
        callback(value)
        setStatus(label .. ": " .. (value and "ON" or "OFF"))
    end)
    return repaint
end

local function addButton(parent, label, callback)
    local button = Instance.new("TextButton")
    button.Size = UDim2.new(1, 0, 0, 24)
    button.BackgroundColor3 = Theme.Field
    button.BorderSizePixel = 0
    button.Font = UIFont
    button.Text = label
    button.TextColor3 = Theme.TextDim
    button.TextSize = 10
    button.AutoButtonColor = false
    button.Parent = parent
    local border = uiStroke(button, Theme.BorderDark, 1)
    button.MouseEnter:Connect(function()
        border.Color = Theme.RedDark
        button.TextColor3 = Theme.Text
    end)
    button.MouseLeave:Connect(function()
        border.Color = Theme.BorderDark
        button.TextColor3 = Theme.TextDim
    end)
    button.Activated:Connect(function()
        local ok, result = pcall(callback)
        if not ok then
            setStatus("Error: " .. tostring(result))
        elseif result ~= nil then
            setStatus(tostring(result))
        end
    end)
    return button
end

local function addStepper(parent, label, initial, minimum, maximum, increment, callback)
    local value = tonumber(initial) or 0
    local row = compactRow(parent, 24)
    tinyLabel(row, label, 5, 175)

    local minus = Instance.new("TextButton")
    minus.Size = UDim2.fromOffset(28, 18)
    minus.Position = UDim2.new(1, -104, 0, 3)
    minus.BackgroundColor3 = Theme.Field
    minus.BorderSizePixel = 0
    minus.Font = UIFont
    minus.Text = "-"
    minus.TextSize = 10
    minus.TextColor3 = Theme.TextDim
    minus.AutoButtonColor = false
    minus.Parent = row
    uiStroke(minus, Theme.BorderDark, 1)

    local valueLabel = Instance.new("TextLabel")
    valueLabel.Size = UDim2.fromOffset(42, 18)
    valueLabel.Position = UDim2.new(1, -73, 0, 3)
    valueLabel.BackgroundTransparency = 1
    valueLabel.Font = UIFont
    valueLabel.TextColor3 = Theme.Text
    valueLabel.TextSize = 10
    valueLabel.Parent = row

    local plus = Instance.new("TextButton")
    plus.Size = UDim2.fromOffset(28, 18)
    plus.Position = UDim2.new(1, -29, 0, 3)
    plus.BackgroundColor3 = Theme.Field
    plus.BorderSizePixel = 0
    plus.Font = UIFont
    plus.Text = "+"
    plus.TextSize = 10
    plus.TextColor3 = Theme.TextDim
    plus.AutoButtonColor = false
    plus.Parent = row
    uiStroke(plus, Theme.BorderDark, 1)

    local function redraw()
        if math.floor(value) == value then
            valueLabel.Text = tostring(math.floor(value))
        else
            valueLabel.Text = string.format("%.2f", value)
        end
    end
    local function change(delta)
        value = math.clamp(value + delta, minimum, maximum)
        value = math.floor((value / increment) + 0.5) * increment
        redraw()
        callback(value)
        setStatus(label .. ": " .. tostring(value))
    end
    minus.Activated:Connect(function() change(-increment) end)
    plus.Activated:Connect(function() change(increment) end)
    redraw()
    return function(newValue)
        if tonumber(newValue) then
            value = math.clamp(tonumber(newValue), minimum, maximum)
            redraw()
        end
    end
end

local function addSelector(parent, label, listGetter, indexGetter, indexSetter, formatter)
    local row = compactRow(parent, 24)
    tinyLabel(row, label, 5, 125)

    local prev = Instance.new("TextButton")
    prev.Size = UDim2.fromOffset(22, 18)
    prev.Position = UDim2.fromOffset(132, 3)
    prev.BackgroundColor3 = Theme.Field
    prev.BorderSizePixel = 0
    prev.Font = UIFont
    prev.Text = "<"
    prev.TextColor3 = Theme.TextDim
    prev.TextSize = 10
    prev.AutoButtonColor = false
    prev.Parent = row
    uiStroke(prev, Theme.BorderDark, 1)

    local valueButton = Instance.new("TextButton")
    valueButton.Size = UDim2.new(1, -184, 0, 18)
    valueButton.Position = UDim2.fromOffset(157, 3)
    valueButton.BackgroundColor3 = Theme.Field
    valueButton.BorderSizePixel = 0
    valueButton.Font = UIFont
    valueButton.TextColor3 = Theme.TextDim
    valueButton.TextSize = 10
    valueButton.TextXAlignment = Enum.TextXAlignment.Left
    valueButton.TextTruncate = Enum.TextTruncate.AtEnd
    valueButton.AutoButtonColor = false
    valueButton.Parent = row
    uiStroke(valueButton, Theme.BorderDark, 1)

    local nextButton = Instance.new("TextButton")
    nextButton.Size = UDim2.fromOffset(22, 18)
    nextButton.Position = UDim2.new(1, -24, 0, 3)
    nextButton.BackgroundColor3 = Theme.Field
    nextButton.BorderSizePixel = 0
    nextButton.Font = UIFont
    nextButton.Text = ">"
    nextButton.TextColor3 = Theme.TextDim
    nextButton.TextSize = 10
    nextButton.AutoButtonColor = false
    nextButton.Parent = row
    uiStroke(nextButton, Theme.BorderDark, 1)

    local function refresh()
        local items = listGetter() or {}
        if #items == 0 then
            valueButton.Text = "  none"
            return
        end
        local index = tonumber(indexGetter()) or 1
        if index < 1 then index = 1 end
        if index > #items then index = #items end
        indexSetter(index)
        local item = items[index]
        valueButton.Text = "  " .. tostring(formatter and formatter(item) or item)
    end

    local function shift(delta)
        local items = listGetter() or {}
        if #items == 0 then
            refresh()
            return
        end
        local index = (tonumber(indexGetter()) or 1) + delta
        if index < 1 then index = #items end
        if index > #items then index = 1 end
        indexSetter(index)
        refresh()
    end

    prev.Activated:Connect(function() shift(-1) end)
    nextButton.Activated:Connect(function() shift(1) end)
    valueButton.Activated:Connect(function() shift(1) end)
    refresh()
    return refresh
end

local function addTextBlock(parent, height)
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 0, height or 200)
    label.BackgroundColor3 = Theme.Field
    label.BorderSizePixel = 0
    label.Font = UIFont
    label.Text = ""
    label.TextColor3 = Theme.TextDim
    label.TextSize = 10
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.TextYAlignment = Enum.TextYAlignment.Top
    label.TextWrapped = true
    label.Parent = parent
    uiStroke(label, Theme.BorderDark, 1)
    local pad = Instance.new("UIPadding")
    pad.PaddingTop = UDim.new(0, 6)
    pad.PaddingBottom = UDim.new(0, 6)
    pad.PaddingLeft = UDim.new(0, 6)
    pad.PaddingRight = UDim.new(0, 6)
    pad.Parent = label
    return label
end

-- Pages / horizontal tabs
local FarmPage = makePage("FARM")
local ArcadePage = makePage("ARCADE")
local EggsPage = makePage("EGGS")
local RewardsPage = makePage("REWARDS")
local ZonesPage = makePage("ZONES")
local PlayerPage = makePage("PLAYER")
local ToolsPage = makePage("TOOLS")
local InfoPage = makePage("INFO")

addTopTab("FARM", 1)
addTopTab("ARCADE", 2)
addTopTab("EGGS", 3)
addTopTab("REWARDS", 4)
addTopTab("ZONES", 5)
addTopTab("PLAYER", 6)
addTopTab("TOOLS", 7)
addTopTab("INFO", 8)

-- FARM / LEFT + RIGHT
do
    local g = makeGroup(FarmPage.Left, "Farm Modes")
    Hub.RepaintPowerFarm = addToggle(g, "POWER FARM — CORE", false, function(value) setPowerFarm(value) end)
    Hub.RepaintUltraFarm = addToggle(g, "ULTRA FARM — SMART", false, function(value) setUltraFarm(value) end)
    local info = addTextBlock(g, 72)
    info.Text = "POWER = breakables + tap + orbs + lootables only.\nULTRA = POWER + zones + special targets + buffs + pets + rewards\n        + daycare + wheels + smart hatch at max zone."

    g = makeGroup(FarmPage.Left, "Core Farming")
    addToggle(g, "Native Auto Farm", false, function(value) Hub.State.NativeAutoFarm = value; setNativeAutoFarm(value) end)
    addToggle(g, "Auto Tap Target", false, function(value) Hub.State.AutoTap = value end)
    addToggle(g, "Auto Collect Orbs", false, function(value) Hub.State.AutoOrbs = value; if value then collectExistingOrbs() end end)
    addToggle(g, "Auto Open Lootables", false, function(value) Hub.State.AutoLootables = value; if value then openExistingLootables() end end)
    addStepper(g, "Tap interval", 0.08, 0.03, 0.5, 0.01, function(value) Hub.State.TapDelay = value end)
    addStepper(g, "Tap burst", 1, 1, 8, 1, function(value) Hub.State.TapBurst = value end)

    g = makeGroup(FarmPage.Left, "Breakable Targeting")
    Hub.RefreshFarmTargetMode = addSelector(g, "Target", function() return Hub.FarmTargetModes end, function() return Hub.State.FarmTargetModeIndex end,
        function(index) Hub.State.FarmTargetModeIndex = index; Hub.State.FarmTargetMode = Hub.FarmTargetModes[index] or "Nearest" end,
        function(item) return tostring(item) end)
    addStepper(g, "Farm radius", 2500, 100, 5000, 100, function(value) Hub.State.FarmRadius = value end)
    addButton(g, "HIT SELECTED TARGET NOW", function() return Hub.TapFarmTarget() and ("Target: " .. tostring(Hub.CurrentFarmTarget)) or "No matching breakable found" end)

    g = makeGroup(FarmPage.Right, "Buff Farming")
    addToggle(g, "Keep Best Potions Active", false, function(value) Hub.State.AutoPotions = value; if value then Hub.WorldFarm.ActivatePotions(false) end end)
    addToggle(g, "Keep Fruits Filled", false, function(value) Hub.State.AutoFruits = value; if value then Hub.WorldFarm.FillFruits(false) end end)
    addToggle(g, "Keep Best Pets Equipped", false, function(value) Hub.State.AutoEquipBest = value; if value then Hub.WorldFarm.EquipBestPets() end end)
    addStepper(g, "Fruit batch", 3, 1, 20, 1, function(value) Hub.State.FruitBatch = value end)
    addStepper(g, "Potion refresh", 60, 15, 300, 15, function(value) Hub.State.PotionRefreshSeconds = value end)
    addButton(g, "ACTIVATE BEST POTIONS NOW", function() return "Potions used: " .. tostring(Hub.WorldFarm.ActivatePotions(true)) end)
    addButton(g, "FILL FRUIT QUEUES NOW", function() return "Fruits used: " .. tostring(Hub.WorldFarm.FillFruits(true)) end)

    g = makeGroup(FarmPage.Right, "Progression & Services")
    addToggle(g, "Auto Buy Next Zone", false, function(value) Hub.State.AutoBuyZones = value end)
    addToggle(g, "Auto Teleport After Purchase", false, function(value) Hub.State.AutoTeleportAfterZone = value end)
    addToggle(g, "Auto Claim Daycare", false, function(value) Hub.State.AutoDaycareClaim = value; if value then Hub.WorldFarm.ClaimDaycare() end end)
    addToggle(g, "Auto Spin Available Wheels", false, function(value) Hub.State.AutoSpinWheels = value end)
    addToggle(g, "Auto Rebirth When Ready", false, function(value) Hub.State.AutoRebirth = value end)
    addButton(g, "BUY NEXT ZONE ONCE", function() local ok, m = buyNextZone(); return ok and "Next zone purchase requested" or (m or "Zone purchase failed") end)
    addButton(g, "CLAIM READY DAYCARE NOW", function() return "Daycare claimed: " .. tostring(Hub.WorldFarm.ClaimDaycare()) end)
    addButton(g, "SPIN AVAILABLE WHEELS NOW", function() return "Wheels spun: " .. tostring(Hub.WorldFarm.SpinWheels()) end)

    g = makeGroup(FarmPage.Right, "Ultra Strategy")
    addToggle(g, "Rebirth At World Ceiling", false, function(value) Hub.State.UltraAutoRebirth = value end)
    addStepper(g, "Smart hatch delay", 12, 3, 60, 1, function(value) Hub.State.UltraHatchInterval = value end)
    addStepper(g, "Maintenance delay", 10, 5, 60, 1, function(value) Hub.State.UltraMaintenanceInterval = value end)
    addButton(g, "EQUIP BEST PETS NOW", function() return Hub.WorldFarm.EquipBestPets() and "Best pets optimize requested" or "Pet module unavailable" end)
    addButton(g, "TRY REBIRTH NOW", function() local ok, m = Hub.WorldFarm.TryRebirth(); return m or (ok and "Rebirth requested" or "Rebirth unavailable") end)

    g = makeGroup(FarmPage.Right, "Fast Rewards")
    addButton(g, "CLAIM FREE GIFTS", function() return "Free gifts claimed: " .. tostring(claimFreeGifts()) end)
    addButton(g, "CLAIM DAILY REWARDS", function() return "Daily rewards claimed: " .. tostring(claimDailyRewards()) end)
    addButton(g, "CLAIM RANK REWARDS", function() return "Rank rewards requested: " .. tostring(claimRankRewards()) end)
end

-- ARCADE / LEFT
local ArcadePower = makeGroup(ArcadePage.Left, "Coin Arcade Power")
addToggle(ArcadePower, "ARCADE GOD MODE", false, function(value)
    setArcadeGodMode(value)
end)
addButton(ArcadePower, "ENTER COIN ARCADE", function()
    local success, message = enterArcade()
    return success and "Entering Coin Arcade" or (message or "Arcade entry failed")
end)
addButton(ArcadePower, "RETURN TO ARCADE HUB", function()
    local success, message = returnArcadeHub()
    return success and "Returning to Arcade Hub" or (message or "Return failed")
end)

local ArcadeProgress = makeGroup(ArcadePage.Left, "Progression")
addToggle(ArcadeProgress, "Auto Claim All Cabinets", false, function(value)
    Hub.State.ArcadeAutoClaim = value
end)
addToggle(ArcadeProgress, "Auto Unlock Next Zone", false, function(value)
    Hub.State.ArcadeAutoZones = value
end)
addToggle(ArcadeProgress, "Auto Unlock Merchants", false, function(value)
    Hub.State.ArcadeAutoMerchants = value
end)
addToggle(ArcadeProgress, "Auto Buy Arcade Upgrades", false, function(value)
    Hub.State.ArcadeAutoUpgrades = value
end)
addButton(ArcadeProgress, "CLAIM ALL NOW", function()
    local success, message = arcadeClaimAll()
    return success and "Arcade claim-all requested" or (message or "Claim failed")
end)
addButton(ArcadeProgress, "BUY UPGRADES PASS", function()
    return "Arcade upgrades bought: " .. tostring(arcadeUpgradePass(20))
end)

local ArcadeHatch = makeGroup(ArcadePage.Left, "Merchant Hatch")
local refreshArcadeMerchantSelector = addSelector(ArcadeHatch, "Merchant", function()
    return ArcadeMerchantList
end, function()
    return Hub.SelectedArcadeMerchantIndex
end, function(index)
    Hub.SelectedArcadeMerchantIndex = index
    Hub.SelectedArcadeMerchant = ArcadeMerchantList[index] and ArcadeMerchantList[index].Id or 1
    refreshArcadeHatchMerchant()
end, function(item)
    return tostring(item.Name)
end)
addToggle(ArcadeHatch, "Native Auto Hatch", false, function(value)
    local success, message = setArcadeAutoHatch(value)
    if not success then setStatus(message or "Arcade hatch unavailable") end
end)
addButton(ArcadeHatch, "UNLOCK NEXT MERCHANT", function()
    local success, message = arcadeUnlockNextMerchant()
    return success and "Merchant unlock requested" or (message or "Merchant unlock failed")
end)

-- ARCADE / RIGHT
local ArcadeUnits = makeGroup(ArcadePage.Right, "Units & Boss")
addToggle(ArcadeUnits, "Auto Fill Cabinets", false, function(value)
    Hub.State.ArcadeAutoStations = value
end)
addToggle(ArcadeUnits, "Auto Fill Boss", false, function(value)
    Hub.State.ArcadeAutoBoss = value
end)
addButton(ArcadeUnits, "FILL ALL CABINETS NOW", function()
    return "Arcade units placed: " .. tostring(fillAllArcadeZones())
end)
addButton(ArcadeUnits, "FILL BOSS NOW", function()
    return "Boss units placed: " .. tostring(fillArcadeBoss())
end)

local ArcadeTeleport = makeGroup(ArcadePage.Right, "Arcade Teleports")
local refreshArcadeZoneSelector = addSelector(ArcadeTeleport, "Cabinet", function()
    return ArcadeZoneList
end, function()
    return Hub.SelectedArcadeZoneIndex
end, function(index)
    Hub.SelectedArcadeZoneIndex = index
    Hub.SelectedArcadeZone = ArcadeZoneList[index] and ArcadeZoneList[index].Id or 1
end, function(item)
    return "#" .. tostring(item.Id) .. " " .. tostring(item.Name)
end)
addButton(ArcadeTeleport, "TELEPORT TO CABINET", function()
    local success, message = arcadeTeleportTo("zone", Hub.SelectedArcadeZone)
    return success and ("Arcade cabinet " .. tostring(Hub.SelectedArcadeZone)) or (message or "Teleport failed")
end)
addButton(ArcadeTeleport, "TELEPORT TO MERCHANT", function()
    local success, message = arcadeTeleportTo("merchant", Hub.SelectedArcadeMerchant)
    return success and ("Arcade merchant " .. tostring(Hub.SelectedArcadeMerchant)) or (message or "Teleport failed")
end)
addButton(ArcadeTeleport, "TELEPORT TO BOSS", function()
    local success, message = arcadeTeleportTo("boss", 0)
    return success and "Arcade boss teleport" or (message or "Teleport failed")
end)
addButton(ArcadeTeleport, "TELEPORT TO HUB SPAWN", function()
    local success, message = arcadeTeleportTo("hub", 0)
    return success and "Arcade hub teleport" or (message or "Teleport failed")
end)

local ArcadeTuning = makeGroup(ArcadePage.Right, "Power Tuning")
addStepper(ArcadeTuning, "Claim interval", 2.0, 0.5, 10, 0.5, function(value)
    Hub.State.ArcadeClaimDelay = value
end)
addStepper(ArcadeTuning, "Station refresh", 5.0, 1, 20, 1, function(value)
    Hub.State.ArcadeStationDelay = value
end)

-- EGGS / LEFT
local EggAutomation = makeGroup(EggsPage.Left, "Egg Automation")
local refreshEggSelector = addSelector(EggAutomation, "Selected egg", function()
    return EggList
end, function()
    return Hub.SelectedEggIndex
end, function(index)
    Hub.SelectedEggIndex = index
    Hub.SelectedEgg = EggList[index] and EggList[index].Id or nil
end, function(egg)
    return "#" .. tostring(egg.Number) .. " " .. tostring(egg.Name)
end)
addStepper(EggAutomation, "Hatch amount", 1, 1, 100, 1, function(value)
    Hub.State.HatchAmount = value
end)
addStepper(EggAutomation, "Hatch interval", 0.85, 0.25, 5, 0.05, function(value)
    Hub.State.HatchDelay = value
end)
addToggle(EggAutomation, "Auto Hatch", false, function(value)
    Hub.State.AutoHatch = value
end)
addToggle(EggAutomation, "Auto Select Best Egg", false, function(value)
    Hub.State.AutoBestEgg = value
    if value then rebuildEggList() end
end)

-- EGGS / RIGHT
local EggActions = makeGroup(EggsPage.Right, "Quick Actions")
addButton(EggActions, "SELECT HIGHEST AVAILABLE EGG", function()
    rebuildEggList()
    refreshEggSelector()
    return "Selected highest available egg"
end)
addButton(EggActions, "HATCH ONCE", function()
    local success, message = hatchSelectedEgg()
    return success and "Hatch request sent" or (message or "Hatch failed")
end)
addButton(EggActions, "UNLOCK SELECTED EGG", function()
    local success, message = unlockSelectedEgg()
    return success and "Egg unlock requested" or (message or "Unlock failed")
end)

-- REWARDS
local RewardAuto = makeGroup(RewardsPage.Left, "Automatic Rewards")
addToggle(RewardAuto, "Auto Free Gifts", false, function(value)
    Hub.State.AutoFreeGifts = value
end)
addToggle(RewardAuto, "Auto Daily Rewards", false, function(value)
    Hub.State.AutoDailyRewards = value
end)
addToggle(RewardAuto, "Auto Rank Rewards", false, function(value)
    Hub.State.AutoRankRewards = value
end)

local RewardOnce = makeGroup(RewardsPage.Right, "Claim Once")
addButton(RewardOnce, "CLAIM READY FREE GIFTS", function()
    return "Free gifts claimed: " .. tostring(claimFreeGifts())
end)
addButton(RewardOnce, "CLAIM READY DAILY REWARDS", function()
    return "Daily rewards claimed: " .. tostring(claimDailyRewards())
end)
addButton(RewardOnce, "CLAIM READY RANK REWARDS", function()
    return "Rank rewards requested: " .. tostring(claimRankRewards())
end)

-- ZONES
local ZoneTeleport = makeGroup(ZonesPage.Left, "Teleport")
local refreshZoneSelector = addSelector(ZoneTeleport, "Selected zone", function()
    return ZoneList
end, function()
    return Hub.SelectedZoneIndex
end, function(index)
    Hub.SelectedZoneIndex = index
    Hub.SelectedZone = ZoneList[index] and ZoneList[index].Id or nil
end, function(zone)
    return "Area " .. tostring(zone.Number) .. " " .. tostring(zone.Name)
end)
addButton(ZoneTeleport, "REFRESH ZONE LIST", function()
    rebuildZoneList()
    refreshZoneSelector()
    return "Zone list refreshed"
end)

local ZoneActions = makeGroup(ZonesPage.Right, "Quick Travel")
addButton(ZoneActions, "TELEPORT TO SELECTED", function()
    local success, message = teleportZone(Hub.SelectedZone)
    return success and "Teleported to selected zone" or (message or "Teleport failed")
end)
addButton(ZoneActions, "TELEPORT TO HIGHEST OWNED", function()
    local success, message = teleportHighestOwned()
    return success and "Teleported to highest owned zone" or (message or "Teleport failed")
end)
addToggle(ZoneActions, "Auto Buy Next Zone", false, function(value)
    Hub.State.AutoBuyZones = value
end)

-- PLAYER
local MoveSection = makeGroup(PlayerPage.Left, "Movement")
addToggle(MoveSection, "Enforce WalkSpeed", false, function(value)
    Hub.State.EnforceWalkSpeed = value
    if not value then
        local humanoid = getHumanoid()
        if humanoid then humanoid.WalkSpeed = 16 end
    end
end)
addStepper(MoveSection, "WalkSpeed", 24, 16, 120, 4, function(value)
    Hub.State.WalkSpeed = value
end)
addToggle(MoveSection, "Noclip", false, function(value)
    Hub.State.Noclip = value
end)
addToggle(MoveSection, "Anti AFK", true, function(value)
    Hub.State.AntiAFK = value
end)
addToggle(MoveSection, "FPS Boost", false, function(value)
    setPerformanceMode(value)
end)

local SessionSection = makeGroup(PlayerPage.Right, "Session")
addButton(SessionSection, "REJOIN CURRENT SERVER", function()
    TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
    return "Rejoining server..."
end)
addButton(SessionSection, "STOP NORMAL FARM", function()
    setPowerFarm(false)
    return "Power Farm stopped"
end)
addButton(SessionSection, "STOP ARCADE GOD MODE", function()
    setArcadeGodMode(false)
    return "Arcade God Mode stopped"
end)
addButton(SessionSection, "JOIN LOW PLAYER SERVER", function()
    local success, message = joinLowestPlayerServer()
    return message or (success and "Teleporting..." or "Server hop failed")
end)

-- TOOLS
do
    local g = makeGroup(ToolsPage.Left, "Automation Presets")
    addButton(g, "ENABLE POWER FARM", function() setPowerFarm(true); return "Power Farm enabled: core farming only" end)
    addButton(g, "ENABLE ULTRA FARM", function() setUltraFarm(true); return "Ultra Farm enabled: smart progression stack" end)
    addButton(g, "CLAIM EVERYTHING NOW", function()
        return "Reward/service claims: " .. tostring(claimFreeGifts() + claimDailyRewards() + claimRankRewards() + Hub.WorldFarm.ClaimDaycare())
    end)
    addButton(g, "STOP ALL AUTOMATION", function() stopAllAutomation(); return "All automation stopped" end)

    g = makeGroup(ToolsPage.Left, "Farm Actions")
    addButton(g, "COLLECT ALL ORBS NOW", function() return "Orbs collected: " .. tostring(collectExistingOrbs()) end)
    addButton(g, "OPEN ALL LOOTABLES NOW", function() return "Lootables opened: " .. tostring(openExistingLootables()) end)
    addButton(g, "HIT SMART BREAKABLE NOW", function() return Hub.TapFarmTarget() and ("Target: " .. tostring(Hub.CurrentFarmTarget)) or "No target" end)
    addButton(g, "HATCH BEST EGG ONCE", function() rebuildEggList(); local ok, m = hatchSelectedEgg(); return ok and "Best egg hatch requested" or (m or "Hatch failed") end)
    addButton(g, "BUY + TELEPORT NEXT ZONE", function() local ok, m = buyNextZone(); if ok then task.wait(0.25); teleportHighestOwned() end; return ok and "Zone progressed" or (m or "Zone progress failed") end)

    g = makeGroup(ToolsPage.Left, "Inventory & Buffs")
    addButton(g, "ACTIVATE BEST POTIONS", function() return "Potions used: " .. tostring(Hub.WorldFarm.ActivatePotions(true)) end)
    addButton(g, "FILL ALL FRUIT QUEUES", function() return "Fruits used: " .. tostring(Hub.WorldFarm.FillFruits(true)) end)
    addButton(g, "BUFF INVENTORY SNAPSHOT", function() return "Potions: " .. tostring(Hub.WorldFarm.InventoryCount(Hub.GameModules.PotionItem)) .. " | Fruits: " .. tostring(Hub.WorldFarm.InventoryCount(Hub.GameModules.FruitItem)) end)

    g = makeGroup(ToolsPage.Right, "Pets")
    addButton(g, "EQUIP BEST PETS", function() return Hub.WorldFarm.EquipBestPets() and "Equip Best requested" or "Pet module unavailable" end)
    addButton(g, "RESTORE PETS", function() return Hub.WorldFarm.RestorePets() and "Pet recall requested" or "Pet restore unavailable" end)
    addButton(g, "RESPAWN PETS", function() return Hub.WorldFarm.RespawnPets() and "Pet respawn requested" or "Pet respawn unavailable" end)
    addToggle(g, "Auto Keep Best Equipped", false, function(value) Hub.State.AutoEquipBest = value; if value then Hub.WorldFarm.EquipBestPets() end end)

    g = makeGroup(ToolsPage.Right, "Daycare & Wheels")
    addButton(g, "DAYCARE STATUS", function() return Hub.WorldFarm.DaycareStatus() end)
    addButton(g, "CLAIM READY DAYCARE", function() return "Daycare claimed: " .. tostring(Hub.WorldFarm.ClaimDaycare()) end)
    addButton(g, "SPIN AVAILABLE WHEELS", function() return "Wheels spun: " .. tostring(Hub.WorldFarm.SpinWheels()) end)
    addToggle(g, "Auto Daycare Claim", false, function(value) Hub.State.AutoDaycareClaim = value end)
    addToggle(g, "Auto Wheel Spin", false, function(value) Hub.State.AutoSpinWheels = value end)

    g = makeGroup(ToolsPage.Right, "Progression")
    addButton(g, "TRY REBIRTH NOW", function() local ok, m = Hub.WorldFarm.TryRebirth(); return m or (ok and "Rebirth requested" or "Rebirth unavailable") end)
    addToggle(g, "Auto Rebirth", false, function(value) Hub.State.AutoRebirth = value end)
    addButton(g, "TELEPORT HIGHEST OWNED ZONE", function() local ok, m = teleportHighestOwned(); return ok and "Teleported to highest owned zone" or (m or "Teleport failed") end)

    g = makeGroup(ToolsPage.Right, "Performance")
    addToggle(g, "FPS Boost", false, function(value) setPerformanceMode(value) end)
    addButton(g, "APPLY PERFORMANCE PASS", function() applyPerformancePass(); return "Performance pass applied" end)

    g = makeGroup(ToolsPage.Right, "Server & Data")
    addButton(g, "JOIN LOW PLAYER SERVER", function() local ok, m = joinLowestPlayerServer(); return m or (ok and "Teleporting..." or "Server hop failed") end)
    addButton(g, "REFRESH GAME DATA", function() rebuildEggList(); rebuildZoneList(); rebuildArcadeLists(); return "Game data refreshed" end)
    addButton(g, "COPY SERVER JOB ID", function() return copyToClipboard(game.JobId) and "JobId copied" or "Clipboard unsupported" end)
    addButton(g, "COPY PLACE ID", function() return copyToClipboard(tostring(game.PlaceId)) and "PlaceId copied" or "Clipboard unsupported" end)
end

-- INFO
local RuntimeGroup = makeGroup(InfoPage.Left, "Runtime")
local InfoText = addTextBlock(RuntimeGroup, 272)
local CreditsGroup = makeGroup(InfoPage.Right, "Credits")
local creditRow1 = compactRow(CreditsGroup, 24)
local cr1 = tinyLabel(creditRow1, "Owner / Developer", 5, 135)
cr1.TextColor3 = Theme.TextDim
local cr1v = tinyLabel(creditRow1, "a7med_hub", 145, 170)
cr1v.TextColor3 = Theme.Text
local creditRow2 = compactRow(CreditsGroup, 24)
local cr2 = tinyLabel(creditRow2, "Discord", 5, 135)
cr2.TextColor3 = Theme.TextDim
local cr2v = tinyLabel(creditRow2, "discord.gg/5MmsD6gZN", 145, 190)
cr2v.TextColor3 = Theme.Text
local creditRow3 = compactRow(CreditsGroup, 24)
local cr3 = tinyLabel(creditRow3, "Community", 5, 135)
cr3.TextColor3 = Theme.TextDim
local cr3v = tinyLabel(creditRow3, "A7DEV Hub", 145, 170)
cr3v.TextColor3 = Theme.Text

local ControlGroup = makeGroup(InfoPage.Right, "Controls")
addButton(ControlGroup, "REFRESH RUNTIME INFO", function()
    if updateInfo then updateInfo() end
    return "Runtime info refreshed"
end)
addButton(ControlGroup, "COPY DISCORD INVITE", function()
    if copyToClipboard("https://discord.gg/5MmsD6gZN") then
        return "Discord invite copied"
    end
    return "Clipboard unsupported"
end)
addButton(ControlGroup, "COPY WORK.INK LINK", function()
    if copyToClipboard("https://work.ink/2Z5U/a7dev-key-system") then
        return "Work.ink link copied"
    end
    return "Clipboard unsupported"
end)

local function moduleState(value)
    return value and "OK" or "MISSING"
end

function updateInfo()
    local save = getSave()
    local rank = save and save.Rank or "?"
    local rebirth = save and (save.Rebirths or save.Rebirth) or "?"
    InfoText.Text = table.concat({
        "PlaceId: " .. tostring(game.PlaceId),
        "JobId: " .. tostring(game.JobId),
        "Network: " .. moduleState(Network),
        "Save: " .. moduleState(Save),
        "Signal: " .. moduleState(Signal),
        "Directory: " .. moduleState(Directory),
        "AutoFarmCmds: " .. moduleState(AutoFarmCmds),
        "BreakableCmds: " .. moduleState(Hub.GameModules.BreakableCmds),
        "PotionCmds: " .. moduleState(Hub.GameModules.PotionCmds),
        "FruitCmds: " .. moduleState(Hub.GameModules.FruitCmds),
        "DaycareCmds: " .. moduleState(Hub.GameModules.DaycareCmds),
        "SpinnyWheelCmds: " .. moduleState(Hub.GameModules.SpinnyWheelCmds),
        "PetCmds: " .. moduleState(Hub.GameModules.PetCmds),
        "RebirthCmds: " .. moduleState(Hub.GameModules.RebirthCmds),
        "EggCmds: " .. moduleState(EggCmds),
        "InstancingCmds: " .. moduleState(InstancingCmds),
        "CoinArcadeCommon: " .. moduleState(CoinArcadeCommon),
        "CoinArcadeCmds: " .. moduleState(CoinArcadeCmds),
        "CoinArcadeZoneCmds: " .. moduleState(CoinArcadeZoneCmds),
        "ArcadeUnitItem: " .. moduleState(ArcadeUnitItem),
        "EventUpgradeCmds: " .. moduleState(EventUpgradeCmds),
        "In Coin Arcade: " .. tostring(isInArcade()),
        "Arcade zone: " .. tostring(arcadeCurrentZone() or "?") .. " / " .. tostring(arcadeHighestUnlockedZone()),
        "Merchant unlocked: " .. tostring(arcadeUnlockedMerchant()),
        "World: " .. tostring(getWorldNumber() or "?"),
        "Rank: " .. tostring(rank) .. "  Rebirth: " .. tostring(rebirth),
        "Egg entries: " .. tostring(#EggList),
        "Zone entries: " .. tostring(#ZoneList),
        "Selected egg: " .. tostring(Hub.SelectedEgg or "none"),
        "Selected zone: " .. tostring(Hub.SelectedZone or "none"),
        "Farm target mode: " .. tostring(Hub.State.FarmTargetMode),
        "Current target: " .. tostring(Hub.CurrentFarmTarget),
        "Ultra phase: " .. tostring(Hub.UltraPhase),
        "Potions/Fruits inventory: " .. tostring(Hub.WorldFarm.InventoryCount(Hub.GameModules.PotionItem)) .. "/" .. tostring(Hub.WorldFarm.InventoryCount(Hub.GameModules.FruitItem)),
        Hub.WorldFarm.DaycareStatus(),
        "",
        "SESSION STATS",
        "Taps: " .. tostring(Hub.Stats.Taps),
        "Orbs: " .. tostring(Hub.Stats.Orbs),
        "Lootables: " .. tostring(Hub.Stats.Lootables),
        "Hatches: " .. tostring(Hub.Stats.Hatches),
        "Special targets: " .. tostring(Hub.Stats.SpecialTargets),
        "Potions used: " .. tostring(Hub.Stats.PotionsUsed),
        "Fruits used: " .. tostring(Hub.Stats.FruitsUsed),
        "Daycare claims: " .. tostring(Hub.Stats.DaycareClaims),
        "Wheel spins: " .. tostring(Hub.Stats.WheelSpins),
        "Pet optimize passes: " .. tostring(Hub.Stats.PetOptimizes),
        "Rebirths: " .. tostring(Hub.Stats.Rebirths),
        "Ultra cycles: " .. tostring(Hub.Stats.UltraCycles),
        "Zones bought: " .. tostring(Hub.Stats.ZonesBought),
        "Rewards: " .. tostring(Hub.Stats.FreeGifts + Hub.Stats.DailyRewards + Hub.Stats.RankRewards),
        "Arcade claims: " .. tostring(Hub.Stats.ArcadeClaims),
        "Arcade units: " .. tostring(Hub.Stats.ArcadeUnits),
        "Arcade upgrades: " .. tostring(Hub.Stats.ArcadeUpgrades),
        "Ultra Farm: " .. (Hub.State.UltraFarm and "ON" or "OFF"),
        "FPS Boost: " .. (Hub.State.PerformanceMode and "ON" or "OFF"),
    }, "\n")
end

updateInfo()
selectTab("FARM")

-- drag from title bar
local dragging = false
local dragStart = nil
local startPosition = nil
track(Header.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPosition = Main.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then
                dragging = false
            end
        end)
    end
end))

track(UserInputService.InputChanged:Connect(function(input)
    if dragging and dragStart and startPosition and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        Main.Position = UDim2.new(startPosition.X.Scale, startPosition.X.Offset + delta.X, startPosition.Y.Scale, startPosition.Y.Offset + delta.Y)
    end
end))

track(UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Enum.KeyCode.RightShift then
        Gui.Enabled = not Gui.Enabled
    end
end))


local function destroyHub()
    if not Hub.Alive then
        return
    end
    Hub.Alive = false

    pcall(function()
        if Hub.State.NativeAutoFarm then
            setNativeAutoFarm(false)
        end
    end)
    pcall(function()
        if CoinArcadeCmds and type(CoinArcadeCmds.SetHatchMerchant) == "function" then
            CoinArcadeCmds.SetHatchMerchant(nil)
        end
    end)

    for _, connection in ipairs(Hub.Connections) do
        pcall(function()
            connection:Disconnect()
        end)
    end
    Hub.Connections = {}

    if Hub.Gui then
        pcall(function()
            Hub.Gui:Destroy()
        end)
    end

    if ENV.A7DEV_PS99_ARCADE == Hub then
        ENV.A7DEV_PS99_ARCADE = nil
    end
end
Hub.Destroy = destroyHub

track(CloseButton.MouseButton1Click:Connect(destroyHub))

setStatus("Ready • Pet Simulator 99 loaded")

print("[A7DEV] Pet Simulator 99 loaded")
print("[A7DEV] Eggs:", #EggList, "Zones:", #ZoneList, "ArcadeZones:", #ArcadeZoneList)