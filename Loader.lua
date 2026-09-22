--[[
    A7DEV HUB — Premium Loader
    Created by a7med_hub
    Discord: https://discord.gg/UHzMb4pZS

    Loader-only UI. Existing game scripts are never modified here.
]]

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local CoreGui = game:GetService("CoreGui")

local LocalPlayer = Players.LocalPlayer
local SETTINGS_FILE = "A7DEV_loader_settings.json"
local SECURE_SESSION_FILE = "A7DEV_secure_session.json"
local SECURE_ENDPOINT = "https://rbhasxhkhvldbbsvbmqj.supabase.co/functions/v1/a7dev-hub-secure"
local KEY_LINK = "https://linkunlocker.com/l38fg"
local DISCORD_URL = "https://discord.gg/UHzMb4pZS"

local GAMES = {
    {
        name = "Murder Mystery 2",
        short = "MM2",
        subtitle = "Mystery • Survival",
        key = "murder-mystery-2",
        placeIds = {142823291},
        fallbackUniverseId = 66654135,
    },
    {
        name = "Pet Simulator 99",
        short = "PS99",
        subtitle = "Pets • Simulator",
        key = "pet-simulator-99",
        placeIds = {8737899170},
        fallbackUniverseId = 3317771874,
    },
    {
        name = "Project Slayer 2",
        short = "PS2",
        subtitle = "Anime RPG • Combat",
        key = "project-slayer-2",
        -- Main/menu + Ouwland + Final Selection. The latter two are required
        -- so queued race-resume loads still identify Project Slayer 2.
        placeIds = {9093954913, 136406881576517, 17047024836},
        fallbackUniverseId = 3418520589,
    },
    {
        name = "Ride a Pet",
        short = "RAP",
        subtitle = "Pets • Simulation",
        key = "ride-a-pet",
        placeIds = {124216119978534},
        fallbackUniverseId = 10035204815,
    },
    {
        name = "Steal and Hatch Anime Eggs",
        short = "SHAE",
        subtitle = "Anime • Hatch • Tycoon",
        key = "steal-and-hatch-anime-eggs",
        placeIds = {76377501906469},
        fallbackUniverseId = 10747748563,
    },
    {
        name = "Blox Fruits",
        short = "BF",
        subtitle = "RPG • Fruits • Combat",
        key = "blox-fruits",
        placeIds = {2753915549, 4442272183, 7449423635},
        fallbackUniverseId = 994732206,
    },
    {
        name = "Grand Piece Online",
        short = "GPO",
        subtitle = "Pirate RPG • First + Second Sea",
        key = "grand-piece-online",
        placeIds = {1730877806, 3978370137, 7465136166},
        fallbackUniverseId = 648454481,
    },
    {
        name = "+1 Loot To Forge",
        short = "LTF",
        subtitle = "Tower • Loot • Upgrades",
        key = "loot-to-forge",
        placeIds = {118805555015549},
        fallbackUniverseId = 118805555015549,
    },
}

local C = {
    red = Color3.fromRGB(233, 35, 49),
    red2 = Color3.fromRGB(255, 58, 72),
    redDark = Color3.fromRGB(92, 13, 21),
    bg0 = Color3.fromRGB(3, 4, 6),
    bg1 = Color3.fromRGB(6, 7, 10),
    panel = Color3.fromRGB(8, 10, 13),
    panel2 = Color3.fromRGB(12, 14, 18),
    card = Color3.fromRGB(11, 13, 17),
    cardHover = Color3.fromRGB(17, 16, 20),
    line = Color3.fromRGB(48, 53, 62),
    lineHot = Color3.fromRGB(128, 31, 40),
    white = Color3.fromRGB(248, 248, 250),
    text = Color3.fromRGB(222, 225, 232),
    muted = Color3.fromRGB(139, 145, 157),
    faint = Color3.fromRGB(89, 95, 107),
    green = Color3.fromRGB(74, 203, 120),
}

local function New(className, parent, props)
    local obj = Instance.new(className)
    obj.Parent = parent
    for k, v in pairs(props or {}) do
        obj[k] = v
    end
    return obj
end

local function Corner(obj, radius)
    return New("UICorner", obj, {CornerRadius = UDim.new(0, radius)})
end

local function Stroke(obj, color, transparency, thickness)
    return New("UIStroke", obj, {
        Color = color,
        Transparency = transparency or 0,
        Thickness = thickness or 1,
        ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
    })
end

local function Text(parent, text, pos, size, font, textSize, color, z)
    return New("TextLabel", parent, {
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        Position = pos,
        Size = size,
        Text = text,
        Font = font or Enum.Font.Gotham,
        TextSize = textSize or 14,
        TextColor3 = color or C.text,
        TextXAlignment = Enum.TextXAlignment.Left,
        TextYAlignment = Enum.TextYAlignment.Center,
        ZIndex = z or 4,
    })
end

local function Button(parent, text, pos, size, bg, font, textSize, color, z)
    return New("TextButton", parent, {
        BackgroundColor3 = bg,
        BorderSizePixel = 0,
        Position = pos,
        Size = size,
        Text = text,
        Font = font or Enum.Font.Gotham,
        TextSize = textSize or 13,
        TextColor3 = color or C.text,
        AutoButtonColor = false,
        ZIndex = z or 5,
    })
end

local function IsCurrentGame(info)
    for _, id in ipairs(info.placeIds or {}) do
        if game.PlaceId == id then
            return true
        end
    end
    return false
end

local state = {
    closeAfterLaunch = true,
    reduceMotion = false,
    favoriteOnly = false,
    favorites = {},
}

local function LoadState()
    if not (isfile and readfile) then return end
    local ok, result = pcall(function()
        if not isfile(SETTINGS_FILE) then return nil end
        return HttpService:JSONDecode(readfile(SETTINGS_FILE))
    end)
    if ok and type(result) == "table" then
        if type(result.reduceMotion) == "boolean" then
            state.reduceMotion = result.reduceMotion
        end
        if type(result.favorites) == "table" then
            state.favorites = result.favorites
        end
    end
end

local function SaveState()
    if not writefile then return end
    pcall(function()
        writefile(SETTINGS_FILE, HttpService:JSONEncode({
            reduceMotion = state.reduceMotion,
            favorites = state.favorites,
        }))
    end)
end

LoadState()
state.closeAfterLaunch = true

local secureSession = nil

local function LoadSecureSession()
    if not (isfile and readfile) then return end
    local ok, data = pcall(function()
        if not isfile(SECURE_SESSION_FILE) then return nil end
        return HttpService:JSONDecode(readfile(SECURE_SESSION_FILE))
    end)
    if ok and type(data) == "table" and type(data.session) == "string" then
        local expires
        pcall(function()
            expires = data.expires_at and DateTime.fromIsoDate(data.expires_at)
        end)
        if expires and expires.UnixTimestamp > os.time() then
            secureSession = {
                session = data.session,
                expires_at = data.expires_at,
                permanent = data.permanent == true,
            }
        end
    end
end

local function SaveSecureSession()
    if not writefile or not secureSession then return end
    pcall(function()
        writefile(SECURE_SESSION_FILE, HttpService:JSONEncode(secureSession))
    end)
end

local function ClearSecureSession()
    secureSession = nil

    pcall(function()
        local env = (getgenv and getgenv()) or _G
        env.A7DEV_HUB_AUTH = false
        env.A7DEV_HUB_SESSION = nil
        env.A7DEV_HUB_EXPIRES_AT = nil
        env.A7DEV_HUB_SECONDS_LEFT = 0
        env.A7DEV_HUB_PERMANENT = false
    end)

    if delfile and isfile then
        pcall(function()
            if isfile(SECURE_SESSION_FILE) then
                delfile(SECURE_SESSION_FILE)
            end
        end)
    end
end

local function RequestSecure(payload)
    local body = HttpService:JSONEncode(payload)
    local requestFn =
        (syn and syn.request)
        or (http and http.request)
        or http_request
        or request

    if type(requestFn) == "function" then
        local ok, response = pcall(requestFn, {
            Url = SECURE_ENDPOINT,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["Accept"] = "application/json, text/plain",
            },
            Body = body,
        })
        if ok and type(response) == "table" then
            local status = tonumber(response.StatusCode or response.Status or 0) or 0
            return status >= 200 and status < 300, response.Body or response.body or "", status
        end
        return false, tostring(response), 0
    end

    local ok, response = pcall(function()
        return game:HttpPost(
            SECURE_ENDPOINT,
            body,
            Enum.HttpContentType.ApplicationJson,
            false
        )
    end)
    return ok, ok and response or tostring(response), ok and 200 or 0
end

local function SetAuthEnvironment()
    if not secureSession then return end
    pcall(function()
        local env = (getgenv and getgenv()) or _G
        env.A7DEV_HUB_AUTH = true
        env.A7DEV_HUB_SESSION = secureSession.session
        env.A7DEV_HUB_EXPIRES_AT = secureSession.expires_at
        env.A7DEV_HUB_PERMANENT = secureSession.permanent == true
    end)
end

local function GetSessionRemaining()
    if not secureSession or type(secureSession.expires_at) ~= "string" then
        return nil
    end

    local expires
    local ok = pcall(function()
        expires = DateTime.fromIsoDate(secureSession.expires_at)
    end)

    if not ok or not expires then
        return nil
    end

    return math.max(0, expires.UnixTimestamp - os.time())
end

local function FormatSessionRemaining(seconds)
    seconds = math.max(0, math.floor(tonumber(seconds) or 0))
    local hours = math.floor(seconds / 3600)
    local minutes = math.floor((seconds % 3600) / 60)
    local secs = seconds % 60
    return string.format("%02d:%02d:%02d", hours, minutes, secs)
end

local function AuthorizeSecure(key)
    local ok, body, status = RequestSecure({
        action = "authorize",
        key = tostring(key or ""),
        user_id = LocalPlayer.UserId,
    })

    if not ok then
        local message = "Authorization failed"
        pcall(function()
            local decoded = HttpService:JSONDecode(body)
            message = decoded.error or message
        end)
        return false, message, status
    end

    local decodedOk, data = pcall(function()
        return HttpService:JSONDecode(body)
    end)
    if not decodedOk or type(data) ~= "table" or data.ok ~= true or type(data.session) ~= "string" then
        return false, "Invalid security response", status
    end

    secureSession = {
        session = data.session,
        expires_at = data.expires_at,
        permanent = data.permanent == true,
    }
    SaveSecureSession()
    SetAuthEnvironment()
    return true, "Access granted", status
end

local function ClaimManualGrant()
    local ok, body, status = RequestSecure({
        action = "manual_grant",
        user_id = LocalPlayer.UserId,
    })

    if not ok then
        return false, nil, status
    end

    local decodedOk, data = pcall(function()
        return HttpService:JSONDecode(body)
    end)
    if not decodedOk or type(data) ~= "table" or data.ok ~= true or type(data.session) ~= "string" then
        return false, nil, status
    end

    secureSession = {
        session = data.session,
        expires_at = data.expires_at,
        permanent = data.permanent == true,
    }
    SaveSecureSession()
    SetAuthEnvironment()
    return true, data, status
end

local function FetchSecureScript(gameKey)
    if not secureSession or type(secureSession.session) ~= "string" then
        return false, "AUTH_REQUIRED", 401
    end

    local ok, body, status = RequestSecure({
        action = "script",
        session = secureSession.session,
        user_id = LocalPlayer.UserId,
        game = gameKey,
    })

    if not ok and status == 401 then
        ClearSecureSession()
    end

    return ok, body, status
end

LoadSecureSession()
pcall(ClaimManualGrant)
SetAuthEnvironment()

local host
if gethui then pcall(function() host = gethui() end) end
if not host then pcall(function() host = CoreGui end) end
if not host then host = LocalPlayer:WaitForChild("PlayerGui") end

local old = host:FindFirstChild("A7DEV_HUB_LOADER")
if old then old:Destroy() end

local oldStatus = host:FindFirstChild("A7DEV_SESSION_STATUS")
if oldStatus then oldStatus:Destroy() end

local sessionGui = New("ScreenGui", host, {
    Name = "A7DEV_SESSION_STATUS",
    IgnoreGuiInset = true,
    ResetOnSpawn = false,
    ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
})

local sessionPill = New("Frame", sessionGui, {
    AnchorPoint = Vector2.new(1, 0),
    Position = UDim2.new(1, -18, 0, 18),
    Size = UDim2.fromOffset(220, 36),
    BackgroundColor3 = Color3.fromRGB(10, 12, 15),
    BorderSizePixel = 0,
    ZIndex = 100,
})
Corner(sessionPill, 11)
local sessionStroke = Stroke(sessionPill, C.line, .12, 1)

local sessionDot = New("Frame", sessionPill, {
    Position = UDim2.fromOffset(12, 14),
    Size = UDim2.fromOffset(8, 8),
    BackgroundColor3 = C.red,
    BorderSizePixel = 0,
    ZIndex = 101,
})
Corner(sessionDot, 99)

local sessionText = Text(
    sessionPill,
    "A7DEV KEY  •  LOCKED",
    UDim2.fromOffset(29, 0),
    UDim2.new(1, -39, 1, 0),
    Enum.Font.GothamBold,
    10,
    C.muted,
    101
)

task.spawn(function()
    while sessionGui.Parent do
        local remaining = GetSessionRemaining()

        if remaining == nil then
            sessionText.Text = "A7DEV KEY  •  LOCKED"
            sessionText.TextColor3 = C.muted
            sessionDot.BackgroundColor3 = C.red
            sessionStroke.Color = C.line
        elseif remaining <= 0 then
            ClearSecureSession()
            sessionText.Text = "A7DEV KEY  •  EXPIRED"
            sessionText.TextColor3 = C.red2
            sessionDot.BackgroundColor3 = C.red2
            sessionStroke.Color = C.redDark
        else
            if secureSession.permanent == true then
                sessionText.Text = "A7DEV KEY  •  PERM KEY"
                sessionText.TextColor3 = Color3.fromRGB(156, 224, 180)
                sessionDot.BackgroundColor3 = C.green
                sessionStroke.Color = Color3.fromRGB(45, 105, 70)
            else
                sessionText.Text = "A7DEV KEY  •  " .. FormatSessionRemaining(remaining)

                if remaining <= 15 * 60 then
                    sessionText.TextColor3 = C.red2
                    sessionDot.BackgroundColor3 = C.red2
                    sessionStroke.Color = C.redDark
                else
                    sessionText.TextColor3 = Color3.fromRGB(156, 224, 180)
                    sessionDot.BackgroundColor3 = C.green
                    sessionStroke.Color = Color3.fromRGB(45, 105, 70)
                end
            end

            pcall(function()
                local env = (getgenv and getgenv()) or _G
                env.A7DEV_HUB_SECONDS_LEFT = remaining
                env.A7DEV_HUB_EXPIRES_AT = secureSession.expires_at
                env.A7DEV_HUB_PERMANENT = secureSession.permanent == true
            end)
        end

        task.wait(1)
    end
end)

local gui = New("ScreenGui", host, {
    Name = "A7DEV_HUB_LOADER",
    IgnoreGuiInset = true,
    ResetOnSpawn = false,
    ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
})

-- BACKDROP
local backdrop = New("Frame", gui, {
    Size = UDim2.fromScale(1, 1),
    BackgroundColor3 = C.bg0,
    BorderSizePixel = 0,
    ZIndex = 0,
})

New("UIGradient", backdrop, {
    Rotation = 115,
    Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(6, 7, 10)),
        ColorSequenceKeypoint.new(.42, Color3.fromRGB(12, 13, 18)),
        ColorSequenceKeypoint.new(.72, Color3.fromRGB(8, 8, 12)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(3, 3, 5)),
    }),
})

local glowLeft = New("Frame", backdrop, {
    AnchorPoint = Vector2.new(.5, .5),
    Position = UDim2.fromScale(.14, .55),
    Size = UDim2.fromScale(.42, .78),
    BackgroundColor3 = Color3.fromRGB(98, 7, 17),
    BackgroundTransparency = .77,
    BorderSizePixel = 0,
    ZIndex = 0,
})
Corner(glowLeft, 120)

local glowRight = New("Frame", backdrop, {
    AnchorPoint = Vector2.new(.5, .5),
    Position = UDim2.fromScale(.88, .52),
    Size = UDim2.fromScale(.42, .76),
    BackgroundColor3 = Color3.fromRGB(106, 8, 19),
    BackgroundTransparency = .79,
    BorderSizePixel = 0,
    ZIndex = 0,
})
Corner(glowRight, 120)

for i, data in ipairs({
    {x=.04,y=.18,w=.30,h=.007,r=-8,t=.58},
    {x=.12,y=.64,w=.28,h=.006,r=8,t=.68},
    {x=.62,y=.14,w=.27,h=.006,r=-7,t=.72},
    {x=.73,y=.68,w=.30,h=.008,r=-8,t=.61},
}) do
    local strip = New("Frame", backdrop, {
        Position = UDim2.fromScale(data.x, data.y),
        Size = UDim2.fromScale(data.w, data.h),
        Rotation = data.r,
        BackgroundColor3 = C.red,
        BackgroundTransparency = data.t,
        BorderSizePixel = 0,
        ZIndex = 0,
    })
    Corner(strip, 99)
end

-- 1440x900 reference canvas
local canvas = New("Frame", gui, {
    AnchorPoint = Vector2.new(.5, .5),
    Position = UDim2.fromScale(.5, .5),
    Size = UDim2.fromOffset(1440, 900),
    BackgroundTransparency = 1,
    ZIndex = 1,
})
local canvasScale = New("UIScale", canvas, {Scale = 1})

local function UpdateScale()
    local camera = workspace.CurrentCamera
    local v = camera and camera.ViewportSize or Vector2.new(1440, 900)
    canvasScale.Scale = math.min(v.X / 1440, v.Y / 900)
end
UpdateScale()
local camera = workspace.CurrentCamera
if camera then
    camera:GetPropertyChangedSignal("ViewportSize"):Connect(UpdateScale)
end

-- OUTER BRAND
Text(canvas, "A7DEV", UDim2.fromOffset(30, 22), UDim2.fromOffset(138, 40), Enum.Font.GothamBlack, 34, C.white, 2)
Text(canvas, "HUB", UDim2.fromOffset(160, 22), UDim2.fromOffset(82, 40), Enum.Font.GothamBlack, 34, C.red, 2)

local outerRight = Text(canvas, "CREATED BY\na7med_hub", UDim2.fromOffset(1262, 24), UDim2.fromOffset(142, 50), Enum.Font.GothamMedium, 10, Color3.fromRGB(153,158,169), 2)
outerRight.TextXAlignment = Enum.TextXAlignment.Right

local shadow = New("Frame", canvas, {
    Position = UDim2.fromOffset(120, 111),
    Size = UDim2.fromOffset(1200, 700),
    BackgroundColor3 = Color3.new(0,0,0),
    BackgroundTransparency = .45,
    BorderSizePixel = 0,
    ZIndex = 1,
})
Corner(shadow, 30)

local panel = New("Frame", canvas, {
    Position = UDim2.fromOffset(120, 103),
    Size = UDim2.fromOffset(1200, 700),
    BackgroundColor3 = C.panel,
    BackgroundTransparency = 0,
    BorderSizePixel = 0,
    ClipsDescendants = true,
    ZIndex = 2,
})
Corner(panel, 28)
Stroke(panel, Color3.fromRGB(128, 28, 38), .05, 1)

New("UIGradient", panel, {
    Rotation = 90,
    Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.fromRGB(10, 12, 16)),
        ColorSequenceKeypoint.new(.54, Color3.fromRGB(7, 9, 12)),
        ColorSequenceKeypoint.new(1, Color3.fromRGB(8, 8, 11)),
    }),
})

-- TOP BAR
local logoMark = Text(panel, "◆", UDim2.fromOffset(34, 22), UDim2.fromOffset(48, 44), Enum.Font.GothamBlack, 34, C.red, 7)
logoMark.TextXAlignment = Enum.TextXAlignment.Center
Text(panel, "A7DEV", UDim2.fromOffset(88, 23), UDim2.fromOffset(92, 26), Enum.Font.GothamBlack, 20, C.white, 7)
Text(panel, "HUB", UDim2.fromOffset(175, 23), UDim2.fromOffset(60, 26), Enum.Font.GothamBlack, 20, C.red, 7)
Text(panel, "a7med_hub", UDim2.fromOffset(90, 49), UDim2.fromOffset(150, 14), Enum.Font.GothamMedium, 9, C.faint, 7)

local navHost = New("Frame", panel, {
    Position = UDim2.fromOffset(405, 20),
    Size = UDim2.fromOffset(390, 50),
    BackgroundTransparency = 1,
    ZIndex = 7,
})

local pages = {}
local tabs = {}

local function MakeTab(name, icon, x, active)
    local b = Button(
        navHost,
        icon .. "  " .. name,
        UDim2.fromOffset(x, 0),
        UDim2.fromOffset(120, 44),
        active and Color3.fromRGB(29, 14, 18) or C.panel,
        Enum.Font.GothamMedium,
        12,
        active and C.red2 or Color3.fromRGB(174,179,190),
        8
    )
    Corner(b, 13)
    local st = Stroke(b, active and C.redDark or C.line, active and .24 or 1, 1)
    tabs[name] = {button=b, stroke=st}
    return b
end

local gamesTab = MakeTab("Games", "◉", 0, true)
local settingsTab = MakeTab("Settings", "⚙", 132, false)
local aboutTab = MakeTab("About", "ⓘ", 264, false)

local discordButton = Button(panel, "Discord", UDim2.fromOffset(958, 25), UDim2.fromOffset(92, 34), Color3.fromRGB(20, 13, 17), Enum.Font.GothamBold, 11, C.red2, 8)
Corner(discordButton, 10)
Stroke(discordButton, Color3.fromRGB(96, 26, 34), .20, 1)

local minimize = Button(panel, "—", UDim2.fromOffset(1080, 26), UDim2.fromOffset(31, 31), C.panel, Enum.Font.Gotham, 18, Color3.fromRGB(166,171,181), 8)
minimize.BackgroundTransparency = 1

local close = Button(panel, "×", UDim2.fromOffset(1129, 24), UDim2.fromOffset(32, 32), C.panel, Enum.Font.Gotham, 24, Color3.fromRGB(195,199,208), 8)
close.BackgroundTransparency = 1

local topDivider = New("Frame", panel, {
    Position = UDim2.fromOffset(30, 82),
    Size = UDim2.fromOffset(1140, 1),
    BackgroundColor3 = Color3.fromRGB(36, 40, 47),
    BorderSizePixel = 0,
    ZIndex = 5,
})
New("Frame", panel, {
    Position = UDim2.fromOffset(30, 81),
    Size = UDim2.fromOffset(92, 2),
    BackgroundColor3 = C.red,
    BorderSizePixel = 0,
    ZIndex = 6,
})

-- SHARED TOAST
local toast = New("TextLabel", panel, {
    AnchorPoint = Vector2.new(.5, 1),
    Position = UDim2.new(.5, 0, 1, -18),
    Size = UDim2.fromOffset(310, 32),
    BackgroundColor3 = Color3.fromRGB(23, 13, 17),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    Text = "",
    TextTransparency = 1,
    Font = Enum.Font.GothamMedium,
    TextSize = 10,
    TextColor3 = C.white,
    ZIndex = 40,
})
Corner(toast, 10)
Stroke(toast, Color3.fromRGB(94, 25, 33), .28, 1)

local toastToken = 0
local function Notify(message)
    toastToken += 1
    local token = toastToken
    toast.Text = tostring(message)
    TweenService:Create(toast, TweenInfo.new(.12), {
        BackgroundTransparency = .05,
        TextTransparency = 0,
    }):Play()
    task.delay(1.25, function()
        if token ~= toastToken or not toast.Parent then return end
        TweenService:Create(toast, TweenInfo.new(.20), {
            BackgroundTransparency = 1,
            TextTransparency = 1,
        }):Play()
    end)
end


local authOverlay = nil
local authCallback = nil

local function HideAuthModal()
    if authOverlay then
        authOverlay:Destroy()
        authOverlay = nil
    end
    authCallback = nil
end

local function ShowAuthModal(callback)
    if secureSession then
        callback()
        return
    end

    if authOverlay then
        authCallback = callback
        return
    end

    authCallback = callback

    authOverlay = New("Frame", panel, {
        Size = UDim2.fromScale(1, 1),
        BackgroundColor3 = Color3.fromRGB(3, 4, 6),
        BackgroundTransparency = .16,
        BorderSizePixel = 0,
        ZIndex = 60,
    })

    local modal = New("Frame", authOverlay, {
        AnchorPoint = Vector2.new(.5, .5),
        Position = UDim2.fromScale(.5, .5),
        Size = UDim2.fromOffset(470, 286),
        BackgroundColor3 = Color3.fromRGB(10, 12, 16),
        BorderSizePixel = 0,
        ZIndex = 61,
    })
    Corner(modal, 18)
    Stroke(modal, C.redDark, .08, 1.2)

    Text(modal, "Secure Access", UDim2.fromOffset(24, 20), UDim2.fromOffset(270, 34), Enum.Font.GothamBold, 22, C.white, 62)
    Text(modal, "Your source is delivered only after server-side key validation.", UDim2.fromOffset(25, 57), UDim2.fromOffset(410, 32), Enum.Font.Gotham, 10, C.muted, 62)

    local keyBox = New("TextBox", modal, {
        Position = UDim2.fromOffset(24, 105),
        Size = UDim2.fromOffset(422, 43),
        BackgroundColor3 = C.panel2,
        BorderSizePixel = 0,
        ClearTextOnFocus = false,
        Font = Enum.Font.Gotham,
        PlaceholderText = "Paste key / Work.ink token...",
        PlaceholderColor3 = C.faint,
        Text = "",
        TextColor3 = C.text,
        TextSize = 11,
        ZIndex = 63,
    })
    Corner(keyBox, 10)
    Stroke(keyBox, C.line, .15, 1)

    local statusLabel = Text(modal, "8-hour secure session • live countdown enabled", UDim2.fromOffset(25, 155), UDim2.fromOffset(400, 22), Enum.Font.Gotham, 10, C.muted, 63)

    local getKey = Button(modal, "Get Key", UDim2.fromOffset(24, 197), UDim2.fromOffset(128, 42), C.panel2, Enum.Font.GothamBold, 11, C.text, 63)
    Corner(getKey, 10)
    Stroke(getKey, C.line, .15, 1)

    local unlock = Button(modal, "Unlock", UDim2.fromOffset(164, 197), UDim2.fromOffset(178, 42), C.red, Enum.Font.GothamBold, 11, C.white, 63)
    Corner(unlock, 10)

    local cancel = Button(modal, "×", UDim2.fromOffset(405, 18), UDim2.fromOffset(38, 38), C.panel2, Enum.Font.Gotham, 20, C.muted, 63)
    Corner(cancel, 10)

    getKey.Activated:Connect(function()
        local copied = false
        if setclipboard then
            copied = pcall(function() setclipboard(KEY_LINK) end)
        elseif toclipboard then
            copied = pcall(function() toclipboard(KEY_LINK) end)
        end
        statusLabel.Text = copied and "Key link copied" or KEY_LINK
        statusLabel.TextColor3 = copied and C.green or C.muted
    end)

    cancel.Activated:Connect(HideAuthModal)

    unlock.Activated:Connect(function()
        local value = tostring(keyBox.Text or "")
        if value == "" then
            statusLabel.Text = "Enter a key first"
            statusLabel.TextColor3 = C.red2
            return
        end

        unlock.Text = "Checking..."
        unlock.Active = false
        statusLabel.Text = "Validating with A7DEV security..."
        statusLabel.TextColor3 = C.muted

        task.spawn(function()
            local ok, message = AuthorizeSecure(value)
            if not authOverlay or not authOverlay.Parent then return end

            if ok then
                statusLabel.Text = "Access granted"
                statusLabel.TextColor3 = C.green
                local cb = authCallback
                task.wait(.12)
                HideAuthModal()
                if cb then cb() end
            else
                unlock.Text = "Unlock"
                unlock.Active = true
                statusLabel.Text = tostring(message)
                statusLabel.TextColor3 = C.red2
            end
        end)
    end)
end

-- GAMES PAGE
local gamesPage = New("Frame", panel, {
    Position = UDim2.fromOffset(0, 84),
    Size = UDim2.new(1, 0, 1, -84),
    BackgroundTransparency = 1,
    ZIndex = 4,
})
pages.Games = gamesPage

Text(gamesPage, "Games", UDim2.fromOffset(34, 24), UDim2.fromOffset(180, 38), Enum.Font.GothamBold, 28, C.white, 5)

local supportText = Text(
    gamesPage,
    tostring(#GAMES) .. " games  •  select one to launch",
    UDim2.fromOffset(35, 62),
    UDim2.fromOffset(390, 20),
    Enum.Font.Gotham,
    11,
    C.muted,
    5
)

local currentInfo
for _, info in ipairs(GAMES) do
    if IsCurrentGame(info) then
        currentInfo = info
        break
    end
end

if currentInfo then
    local currentPill = New("Frame", gamesPage, {
        Position = UDim2.fromOffset(35, 89),
        Size = UDim2.fromOffset(220, 28),
        BackgroundColor3 = Color3.fromRGB(18, 24, 22),
        BorderSizePixel = 0,
        ZIndex = 5,
    })
    Corner(currentPill, 9)
    Stroke(currentPill, Color3.fromRGB(45, 107, 70), .25, 1)
    local d = New("Frame", currentPill, {
        Position = UDim2.fromOffset(10, 10),
        Size = UDim2.fromOffset(7, 7),
        BackgroundColor3 = C.green,
        BorderSizePixel = 0,
        ZIndex = 6,
    })
    Corner(d, 99)
    Text(currentPill, "Current: " .. currentInfo.name, UDim2.fromOffset(24, 0), UDim2.new(1, -30, 1, 0), Enum.Font.GothamMedium, 10, Color3.fromRGB(173,221,190), 6)
end

local search = New("TextBox", gamesPage, {
    Position = UDim2.fromOffset(721, 32),
    Size = UDim2.fromOffset(300, 43),
    BackgroundColor3 = C.panel2,
    BorderSizePixel = 0,
    Text = "",
    PlaceholderText = "Search games...",
    ClearTextOnFocus = false,
    Font = Enum.Font.Gotham,
    TextSize = 11,
    TextColor3 = C.text,
    PlaceholderColor3 = C.faint,
    TextXAlignment = Enum.TextXAlignment.Left,
    ZIndex = 6,
})
Corner(search, 12)
Stroke(search, C.line, .18, 1)
New("UIPadding", search, {PaddingLeft = UDim.new(0, 15), PaddingRight = UDim.new(0, 12)})

local favoriteFilter = Button(gamesPage, "☆  Favorites", UDim2.fromOffset(1034, 32), UDim2.fromOffset(132, 43), C.panel2, Enum.Font.GothamMedium, 11, Color3.fromRGB(177,181,191), 6)
Corner(favoriteFilter, 12)
local favoriteFilterStroke = Stroke(favoriteFilter, C.line, .18, 1)

local cardsHolder = New("ScrollingFrame", gamesPage, {
    Position = UDim2.fromOffset(31, 132),
    Size = UDim2.fromOffset(1138, 475),
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    CanvasSize = UDim2.fromOffset(0, 730),
    ScrollBarThickness = 3,
    ScrollBarImageColor3 = C.red,
    ScrollingDirection = Enum.ScrollingDirection.Y,
    ZIndex = 5,
})

local cards = {}
local busy = false

local function ResolveIcon(info, imageLabel)
    local fallbackId = info.fallbackUniverseId
    imageLabel.Image = ("rbxthumb://type=GameIcon&id=%s&w=512&h=512"):format(tostring(fallbackId))

    local primaryPlaceId = info.placeIds and info.placeIds[1]
    if not primaryPlaceId then return end

    task.spawn(function()
        local resolvedUniverseId

        local okApi, apiBody = pcall(function()
            return game:HttpGet(
                ("https://apis.roblox.com/universes/v1/places/%s/universe"):format(tostring(primaryPlaceId)),
                true
            )
        end)

        if okApi and type(apiBody) == "string" and #apiBody > 0 then
            local okDecode, decoded = pcall(function()
                return HttpService:JSONDecode(apiBody)
            end)
            if okDecode and type(decoded) == "table" then
                resolvedUniverseId = tonumber(decoded.universeId or decoded.UniverseId)
            end
        end

        if resolvedUniverseId and imageLabel.Parent then
            imageLabel.Image = ("rbxthumb://type=GameIcon&id=%s&w=512&h=512"):format(tostring(resolvedUniverseId))
            return
        end

        local okInfo, productInfo = pcall(function()
            return MarketplaceService:GetProductInfo(primaryPlaceId)
        end)

        if okInfo and type(productInfo) == "table" and tonumber(productInfo.IconImageAssetId) and tonumber(productInfo.IconImageAssetId) > 0 and imageLabel.Parent then
            imageLabel.Image = "rbxassetid://" .. tostring(productInfo.IconImageAssetId)
        end
    end)
end

local function LaunchGame(info, launchButton)
    if busy then return end

    local function runProtected()
        if busy then return end
        busy = true

        launchButton.Text = "Starting..."
        launchButton.BackgroundColor3 = Color3.fromRGB(160, 24, 34)
        Notify("Starting " .. info.name)

        local ok, err = pcall(function()
            assert(type(loadstring) == "function", "loadstring is not supported by this executor")

            local fetched, source, status = FetchSecureScript(info.key)
            if not fetched then
                if status == 401 then
                    error("A7DEV secure session expired")
                end
                error("Secure delivery failed: " .. tostring(source))
            end

            assert(type(source) == "string" and #source > 0, "empty protected script response")

            local fn, compileError = loadstring(source)
            assert(fn, "Compile error: " .. tostring(compileError))

            -- IMPORTANT: some executors lower the current thread capability after
            -- entering another loaded chunk. Any Instance access after fn() may then
            -- fail with "lacking capability Plugin". Destroy the loader BEFORE the
            -- protected chunk starts and never touch loader Instances afterwards.
            if gui and gui.Parent then
                gui:Destroy()
            end

            local function traceError(runErr)
                if debug and type(debug.traceback) == "function" then
                    return debug.traceback(tostring(runErr), 2)
                end
                return tostring(runErr)
            end

            local runOk, runError = xpcall(fn, traceError)
            if not runOk then
                error(runError)
            end
        end)

        busy = false

        if not ok then
            -- Do not access gui/launchButton here. The loaded chunk may have changed
            -- the current thread capability. Warn only; rerunning the loader is safe.
            warn("[A7DEV HUB] " .. tostring(err))
            return
        end
    end

    if secureSession then
        runProtected()
    else
        ShowAuthModal(runProtected)
    end
end

for i, info in ipairs(GAMES) do
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)

    local card = New("Frame", cardsHolder, {
        Name = info.name,
        Position = UDim2.fromOffset(col * 380, row * 242),
        Size = UDim2.fromOffset(362, 224),
        BackgroundColor3 = C.card,
        BorderSizePixel = 0,
        ClipsDescendants = true,
        ZIndex = 6,
    })
    Corner(card, 15)
    local cardStroke = Stroke(card, C.line, .13, 1)

    local accent = New("Frame", card, {
        Position = UDim2.fromOffset(0, 0),
        Size = UDim2.fromOffset(4, 224),
        BackgroundColor3 = IsCurrentGame(info) and C.green or C.red,
        BackgroundTransparency = IsCurrentGame(info) and .12 or .42,
        BorderSizePixel = 0,
        ZIndex = 7,
    })
    Corner(accent, 4)

    local iconWrap = New("Frame", card, {
        Position = UDim2.fromOffset(15, 14),
        Size = UDim2.fromOffset(110, 110),
        BackgroundColor3 = Color3.fromRGB(18,20,24),
        BorderSizePixel = 0,
        ClipsDescendants = true,
        ZIndex = 7,
    })
    Corner(iconWrap, 13)

    local image = New("ImageLabel", iconWrap, {
        Size = UDim2.fromScale(1, 1),
        BackgroundColor3 = Color3.fromRGB(18,20,24),
        BorderSizePixel = 0,
        Image = "",
        ScaleType = Enum.ScaleType.Crop,
        ZIndex = 8,
    })
    Corner(image, 13)

    local imageShade = New("Frame", iconWrap, {
        Position = UDim2.new(0,0,.68,0),
        Size = UDim2.new(1,0,.32,0),
        BackgroundColor3 = Color3.fromRGB(5,6,8),
        BackgroundTransparency = .58,
        BorderSizePixel = 0,
        ZIndex = 9,
    })

    local gameTitle = Text(card, info.name, UDim2.fromOffset(143, 17), UDim2.fromOffset(200, 42), Enum.Font.GothamBold, 14, C.white, 9)
    gameTitle.TextWrapped = true
    gameTitle.TextYAlignment = Enum.TextYAlignment.Top

    Text(card, info.subtitle, UDim2.fromOffset(143, 62), UDim2.fromOffset(200, 20), Enum.Font.Gotham, 10, C.muted, 9)

    local shortBadge = New("Frame", card, {
        Position = UDim2.fromOffset(143, 91),
        Size = UDim2.fromOffset(54, 23),
        BackgroundColor3 = Color3.fromRGB(22, 18, 21),
        BorderSizePixel = 0,
        ZIndex = 9,
    })
    Corner(shortBadge, 7)
    Stroke(shortBadge, Color3.fromRGB(74, 31, 37), .35, 1)
    local shortText = Text(shortBadge, info.short, UDim2.fromScale(0,0), UDim2.fromScale(1,1), Enum.Font.GothamBold, 9, C.red2, 10)
    shortText.TextXAlignment = Enum.TextXAlignment.Center

    if IsCurrentGame(info) then
        local currentBadge = New("Frame", card, {
            Position = UDim2.fromOffset(205, 91),
            Size = UDim2.fromOffset(99, 23),
            BackgroundColor3 = Color3.fromRGB(17, 25, 21),
            BorderSizePixel = 0,
            ZIndex = 9,
        })
        Corner(currentBadge, 7)
        Stroke(currentBadge, Color3.fromRGB(42, 111, 69), .30, 1)
        local currentText = Text(currentBadge, "CURRENT GAME", UDim2.fromScale(0,0), UDim2.fromScale(1,1), Enum.Font.GothamBold, 8, Color3.fromRGB(132, 222, 165), 10)
        currentText.TextXAlignment = Enum.TextXAlignment.Center
    end

    local divider = New("Frame", card, {
        Position = UDim2.fromOffset(15, 137),
        Size = UDim2.fromOffset(332, 1),
        BackgroundColor3 = Color3.fromRGB(37, 40, 47),
        BorderSizePixel = 0,
        ZIndex = 8,
    })

    local launch = Button(card, "Launch   →", UDim2.fromOffset(15, 157), UDim2.fromOffset(145, 43), C.red, Enum.Font.GothamBold, 12, C.white, 11)
    Corner(launch, 11)

    local favorite = Button(card, state.favorites[info.name] and "★" or "☆", UDim2.fromOffset(310, 158), UDim2.fromOffset(38, 38), Color3.fromRGB(16,17,20), Enum.Font.Gotham, 22, state.favorites[info.name] and C.red2 or Color3.fromRGB(182,186,196), 11)
    Corner(favorite, 10)
    Stroke(favorite, C.line, .28, 1)

    card.MouseEnter:Connect(function()
        if state.reduceMotion then
            card.BackgroundColor3 = C.cardHover
        else
            TweenService:Create(card, TweenInfo.new(.12, Enum.EasingStyle.Quad), {
                BackgroundColor3 = C.cardHover,
            }):Play()
        end
        cardStroke.Color = C.lineHot
        cardStroke.Transparency = .02
    end)

    card.MouseLeave:Connect(function()
        if state.reduceMotion then
            card.BackgroundColor3 = C.card
        else
            TweenService:Create(card, TweenInfo.new(.12, Enum.EasingStyle.Quad), {
                BackgroundColor3 = C.card,
            }):Play()
        end
        cardStroke.Color = C.line
        cardStroke.Transparency = .13
    end)

    launch.MouseEnter:Connect(function()
        if state.reduceMotion then
            launch.BackgroundColor3 = C.red2
        else
            TweenService:Create(launch, TweenInfo.new(.10), {
                BackgroundColor3 = C.red2,
            }):Play()
        end
    end)

    launch.MouseLeave:Connect(function()
        if state.reduceMotion then
            launch.BackgroundColor3 = C.red
        else
            TweenService:Create(launch, TweenInfo.new(.10), {
                BackgroundColor3 = C.red,
            }):Play()
        end
    end)

    launch.Activated:Connect(function()
        LaunchGame(info, launch)
    end)

    favorite.Activated:Connect(function()
        state.favorites[info.name] = not state.favorites[info.name]
        favorite.Text = state.favorites[info.name] and "★" or "☆"
        favorite.TextColor3 = state.favorites[info.name] and C.red2 or Color3.fromRGB(182,186,196)
        SaveState()
        Notify(state.favorites[info.name] and "Added to favorites" or "Removed from favorites")
    end)

    cards[#cards + 1] = {
        frame = card,
        info = info,
        name = string.lower(info.name),
        launch = launch,
    }

    ResolveIcon(info, image)
end

local function ApplyFilters()
    local q = string.lower(search.Text or "")
    local visibleIndex = 0

    for _, item in ipairs(cards) do
        local matchesSearch = q == "" or string.find(item.name, q, 1, true) ~= nil
        local matchesFavorite = (not state.favoriteOnly) or state.favorites[item.info.name] == true
        local show = matchesSearch and matchesFavorite

        item.frame.Visible = show

        if show then
            local col = visibleIndex % 3
            local row = math.floor(visibleIndex / 3)
            item.frame.Position = UDim2.fromOffset(col * 380, row * 242)
            visibleIndex += 1
        end
    end

    local rows = math.max(1, math.ceil(visibleIndex / 3))
    cardsHolder.CanvasSize = UDim2.fromOffset(0, rows * 242 + 10)
end

search:GetPropertyChangedSignal("Text"):Connect(ApplyFilters)

favoriteFilter.Activated:Connect(function()
    state.favoriteOnly = not state.favoriteOnly
    favoriteFilter.Text = state.favoriteOnly and "★  Favorites" or "☆  Favorites"
    favoriteFilter.TextColor3 = state.favoriteOnly and C.red2 or Color3.fromRGB(177,181,191)
    favoriteFilter.BackgroundColor3 = state.favoriteOnly and Color3.fromRGB(29,14,18) or C.panel2
    favoriteFilterStroke.Color = state.favoriteOnly and C.redDark or C.line
    favoriteFilterStroke.Transparency = state.favoriteOnly and .20 or .18
    ApplyFilters()
end)

ApplyFilters()

-- SETTINGS PAGE
local settingsPage = New("Frame", panel, {
    Position = UDim2.fromOffset(0, 84),
    Size = UDim2.new(1, 0, 1, -84),
    BackgroundTransparency = 1,
    Visible = false,
    ZIndex = 4,
})
pages.Settings = settingsPage

Text(settingsPage, "Settings", UDim2.fromOffset(36, 30), UDim2.fromOffset(320, 42), Enum.Font.GothamBold, 29, C.white, 5)
Text(settingsPage, "Simple loader preferences.", UDim2.fromOffset(37, 70), UDim2.fromOffset(500, 22), Enum.Font.Gotham, 11, C.muted, 5)

local function MakeSettingCard(y, title, subtitle)
    local card = New("Frame", settingsPage, {
        Position = UDim2.fromOffset(36, y),
        Size = UDim2.fromOffset(1128, 90),
        BackgroundColor3 = C.card,
        BorderSizePixel = 0,
        ZIndex = 5,
    })
    Corner(card, 14)
    Stroke(card, C.line, .18, 1)
    Text(card, title, UDim2.fromOffset(18, 14), UDim2.fromOffset(650, 26), Enum.Font.GothamBold, 14, C.white, 6)
    Text(card, subtitle, UDim2.fromOffset(18, 43), UDim2.fromOffset(760, 22), Enum.Font.Gotham, 11, C.muted, 6)
    return card
end

local motionCard = MakeSettingCard(118, "Reduce motion", "Disable most hover and transition animations.")
local motionToggle = Button(motionCard, "", UDim2.fromOffset(1044, 28), UDim2.fromOffset(60, 34), state.reduceMotion and C.red or Color3.fromRGB(48,51,58), Enum.Font.Gotham, 1, C.white, 7)
Corner(motionToggle, 18)
local motionKnob = New("Frame", motionToggle, {
    Position = state.reduceMotion and UDim2.fromOffset(30,4) or UDim2.fromOffset(4,4),
    Size = UDim2.fromOffset(26,26),
    BackgroundColor3 = C.white,
    BorderSizePixel = 0,
    ZIndex = 8,
})
Corner(motionKnob, 99)

motionToggle.Activated:Connect(function()
    state.reduceMotion = not state.reduceMotion
    SaveState()
    TweenService:Create(motionKnob, TweenInfo.new(.12), {
        Position = state.reduceMotion and UDim2.fromOffset(30,4) or UDim2.fromOffset(4,4),
    }):Play()
    TweenService:Create(motionToggle, TweenInfo.new(.12), {
        BackgroundColor3 = state.reduceMotion and C.red or Color3.fromRGB(48,51,58),
    }):Play()
end)

local favCard = MakeSettingCard(222, "Favorites", writefile and "Saved locally on this executor." or "Available for this session only.")
local favStatus = Text(favCard, writefile and "AVAILABLE" or "SESSION ONLY", UDim2.fromOffset(930, 28), UDim2.fromOffset(174, 34), Enum.Font.GothamBold, 10, writefile and C.green or C.muted, 7)
favStatus.TextXAlignment = Enum.TextXAlignment.Right

-- ABOUT PAGE
local aboutPage = New("Frame", panel, {
    Position = UDim2.fromOffset(0, 84),
    Size = UDim2.new(1, 0, 1, -84),
    BackgroundTransparency = 1,
    Visible = false,
    ZIndex = 4,
})
pages.About = aboutPage

Text(aboutPage, "A7DEV", UDim2.fromOffset(38, 32), UDim2.fromOffset(115, 42), Enum.Font.GothamBlack, 28, C.white, 5)
Text(aboutPage, "HUB", UDim2.fromOffset(151, 32), UDim2.fromOffset(75, 42), Enum.Font.GothamBlack, 28, C.red, 5)
Text(aboutPage, "Roblox script hub", UDim2.fromOffset(39, 78), UDim2.fromOffset(450, 22), Enum.Font.Gotham, 12, C.muted, 5)

local aboutCard = New("Frame", aboutPage, {
    Position = UDim2.fromOffset(38, 125),
    Size = UDim2.fromOffset(1124, 230),
    BackgroundColor3 = C.card,
    BorderSizePixel = 0,
    ZIndex = 5,
})
Corner(aboutCard, 16)
Stroke(aboutCard, C.line, .17, 1)

Text(aboutCard, "Created by", UDim2.fromOffset(24, 24), UDim2.fromOffset(150, 20), Enum.Font.Gotham, 10, C.faint, 6)
Text(aboutCard, "a7med_hub", UDim2.fromOffset(24, 46), UDim2.fromOffset(280, 33), Enum.Font.GothamBold, 20, C.white, 6)

Text(aboutCard, "Supported games", UDim2.fromOffset(24, 102), UDim2.fromOffset(150, 20), Enum.Font.Gotham, 10, C.faint, 6)
Text(aboutCard, tostring(#GAMES), UDim2.fromOffset(24, 123), UDim2.fromOffset(80, 32), Enum.Font.GothamBold, 20, C.red2, 6)

Text(aboutCard, "A7DEV HUB launches the selected script through the secure A7DEV session.", UDim2.fromOffset(300, 34), UDim2.fromOffset(610, 54), Enum.Font.Gotham, 11, C.muted, 6)

local aboutDiscord = Button(aboutCard, "Copy Discord Invite", UDim2.fromOffset(300, 133), UDim2.fromOffset(180, 42), C.red, Enum.Font.GothamBold, 11, C.white, 7)
Corner(aboutDiscord, 11)

local discordText = Text(aboutCard, DISCORD_URL, UDim2.fromOffset(500, 133), UDim2.fromOffset(360, 42), Enum.Font.Gotham, 10, C.muted, 7)

local function CopyDiscord()
    local copied = false
    if setclipboard then
        copied = pcall(function() setclipboard(DISCORD_URL) end)
    elseif toclipboard then
        copied = pcall(function() toclipboard(DISCORD_URL) end)
    end
    Notify(copied and "Discord invite copied" or DISCORD_URL)
end

discordButton.Activated:Connect(CopyDiscord)
aboutDiscord.Activated:Connect(CopyDiscord)

-- PAGE SWITCHING
local function SetPage(name)
    for pageName, page in pairs(pages) do
        page.Visible = pageName == name
    end

    for tabName, data in pairs(tabs) do
        local active = tabName == name
        data.button.BackgroundColor3 = active and Color3.fromRGB(29,14,18) or C.panel
        data.button.TextColor3 = active and C.red2 or Color3.fromRGB(174,179,190)
        data.stroke.Color = active and C.redDark or C.line
        data.stroke.Transparency = active and .24 or 1
    end
end

gamesTab.Activated:Connect(function() SetPage("Games") end)
settingsTab.Activated:Connect(function() SetPage("Settings") end)
aboutTab.Activated:Connect(function() SetPage("About") end)

-- WINDOW CONTROLS
close.Activated:Connect(function()
    gui:Destroy()
end)

local restore = Button(gui, "A7DEV HUB", UDim2.new(1, -176, 1, -60), UDim2.fromOffset(150, 38), Color3.fromRGB(11,12,15), Enum.Font.GothamBold, 11, C.white, 50)
restore.Visible = false
Corner(restore, 11)
Stroke(restore, C.redDark, .10, 1)

minimize.Activated:Connect(function()
    canvas.Visible = false
    restore.Visible = true
end)

restore.Activated:Connect(function()
    restore.Visible = false
    canvas.Visible = true
end)

-- OUTER FOOTER
local footerRight = Text(canvas, "A7DEV HUB  •  a7med_hub", UDim2.fromOffset(1045, 840), UDim2.fromOffset(360, 22), Enum.Font.GothamMedium, 9, Color3.fromRGB(124,130,142), 2)
footerRight.TextXAlignment = Enum.TextXAlignment.Right

-- LEGACY LOADSTRING COMPATIBILITY
do
    local env = (getgenv and getgenv()) or _G
    local legacyGame = tostring(env.A7DEV_COMPAT_GAME or "")
    env.A7DEV_COMPAT_GAME = nil

    if legacyGame ~= "" then
        task.defer(function()
            for _, item in ipairs(cards) do
                if item.info and item.info.key == legacyGame then
                    LaunchGame(item.info, item.launch)
                    return
                end
            end
            Notify("Legacy game route not found")
        end)
    end
end

-- OPENING ANIMATION
if not state.reduceMotion then
    panel.Position = UDim2.fromOffset(120, 114)
    panel.BackgroundTransparency = .16
    TweenService:Create(panel, TweenInfo.new(.30, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
        Position = UDim2.fromOffset(120, 103),
        BackgroundTransparency = .02,
    }):Play()
end
