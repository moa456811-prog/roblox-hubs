import { createHash } from "node:crypto";

// Reviewed public scanner, normalized to LF. Unknown upstream code is never served.
const REVIEWED_SCANNER_SHA256 =
  "ab2d1bbb1ad77edceec557bf5a2bae053693402590ab13fe999f345dd252f4f1";

const PRIVACY_HELPERS = String.raw`-- ScriptRush privacy guards: keep identities and private input out of exports.
local privateNames = {}

local function rememberPlayer(player)
    for _, value in ipairs({player.Name, player.DisplayName}) do
        if type(value) == "string" and value ~= "" then
            privateNames[value:lower()] = true
        end
    end
end

local function refreshPrivateNames()
    for _, player in ipairs(Players:GetPlayers()) do rememberPlayer(player) end
end

refreshPrivateNames()
local privacyConnection = Players.PlayerAdded:Connect(rememberPlayer)

local function isSensitiveField(value)
    local key = tostring(value or ""):lower():gsub("[^%w]", "")
    for _, word in ipairs({"password", "passwd", "passcode", "token", "key", "cookie", "secret", "credential", "auth", "userid", "user", "name", "chat", "email", "phone", "account", "session", "owner", "friend", "voice", "playerlist"}) do
        if key:find(word, 1, true) then return true end
    end
    return false
end

local function redactPrivateText(value)
    local text = tostring(value or "")
    for name in pairs(privateNames) do
        -- Plain matching also handles punctuation and names embedded in paths.
        local startAt = 1
        while true do
            local first, last = text:lower():find(name, startAt, true)
            if not first then break end
            text = text:sub(1, first - 1) .. "[player]" .. text:sub(last + 1)
            startAt = first + #"[player]"
        end
    end
    local lower = text:lower()
    for _, word in ipairs({"password", "passwd", "passcode", "cookie", "credential", "bearer ", "api_key", "apikey", "access_token", "authtoken", "secret"}) do
        if lower:find(word, 1, true) then return "[private]" end
    end
    text = text:gsub("[%w%._%%+%-]+@[%w%.%-]+%.%a%a+", "[email]")
    text = text:gsub("sk%-[%w_%-]+", "[credential]")
    text = text:gsub("gh[pousr]_[%w_]+", "[credential]")
    -- Long opaque strings are unnecessary for structural game evidence.
    text = text:gsub("[%w_%-]+", function(part)
        return #part >= 32 and "[opaque]" or part
    end)
    return text
end

local function safeName(value)
    local text = redactPrivateText(value)
    text = text:gsub("[%c]", " ")
    if #text > 120 then text = text:sub(1, 120) end
    return text
end`;

const INSPECTION_GUARD = String.raw`

local function shouldInspect(object)
    local cursor = object
    while cursor and cursor ~= game do
        -- Exclude whole character trees, including tools, values and descendants.
        if cursor:IsA("Model") and isPlayerCharacter(cursor) then return false end
        -- User-entered text is private even outside a conventional chat folder.
        if cursor:IsA("TextBox") then return false end
        if cursor == Workspace or cursor == ReplicatedStorage or cursor == PlayerGui or cursor == Backpack then
            break
        end
        if isSensitiveField(cursor.Name) then return false end
        cursor = cursor.Parent
    end
    return true
end`;

const REPORT_GUARD = String.raw`-- Protocol strings are constants, not player data. A display name such as
-- "Game", "farm" or "high" must never rename the report schema or its enums.
local protocolStrings = {
    ["version"] = {["2.0"] = true},
    ["type"] = {["live-client-read-only"] = true},
    ["scan.mode"] = {quick = true, deep = true},
    ["features[].key"] = {farm = true, quest = true, boss = true, loot = true, fishing = true, sell = true, dungeon = true, skills = true},
    ["features[].label"] = {["Auto Farm"] = true, ["Auto Quest"] = true, ["Auto Boss"] = true, ["Auto Loot"] = true, Fishing = true, ["Auto Sell"] = true, ["Dungeon/Raid"] = true, Skills = true},
    ["features[].confidence"] = {high = true, medium = true, low = true, none = true},
}

local protocolClasses = {
    Model = true, Folder = true, RemoteEvent = true, RemoteFunction = true,
    TextLabel = true, TextButton = true, StringValue = true, BoolValue = true,
    IntValue = true, NumberValue = true, Vector3Value = true, CFrameValue = true,
    Color3Value = true, BrickColorValue = true, DoubleConstrainedValue = true,
    IntConstrainedValue = true, Tool = true, Animation = true, ProximityPrompt = true,
    ClickDetector = true, Part = true, MeshPart = true, ScreenGui = true,
}

local function sanitizeReport(value, path)
    path = path or ""
    if type(value) == "string" then
        local allowed = protocolStrings[path]
        if allowed and allowed[value] then return value end
        if (path == "game.placeId" or path == "game.universeId") and value:match("^%d+$") then
            return value
        end
        if not path:find(".attributes.", 1, true) and path:match("%.class$") and protocolClasses[value] then
            return value
        end
        return redactPrivateText(value)
    end
    if type(value) ~= "table" then return value end
    local clean = {}
    for key, item in pairs(value) do
        local childPath
        if type(key) == "number" then
            childPath = path .. "[]"
        else
            childPath = path == "" and key or path .. "." .. key
        end
        -- Only attribute maps have dynamic keys; schema keys stay unchanged.
        -- Observed paths already pass through safeName before becoming values.
        local cleanKey = key
        if type(key) == "string" and path:match("%.attributes$") then
            cleanKey = redactPrivateText(key)
        end
        clean[cleanKey] = sanitizeReport(item, childPath)
    end
    return clean
end

`;

function replaceOnce(source: string, anchor: string, replacement: string): string {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error("Live scanner privacy review is required: source anchor changed.");
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

/** Server-only, fail-closed adapter for the reviewed live scanner source. */
export function sanitizeScanner(script: string): string {
  if (typeof script !== "string" || script.length > 100_000) {
    throw new Error("Live scanner privacy review is required: invalid source.");
  }
  let source = script.replace(/\r\n/g, "\n");
  if (createHash("sha256").update(source, "utf8").digest("hex") !== REVIEWED_SCANNER_SHA256) {
    throw new Error("Live scanner privacy review is required: upstream source changed.");
  }

  source = replaceOnce(source, String.raw`local function safeName(value)
    local text = tostring(value or "")
    text = text:gsub("[%c]", " ")
    if #text > 120 then text = text:sub(1, 120) end
    return text
end`, PRIVACY_HELPERS);

  source = replaceOnce(source, String.raw`    for key, value in pairs(attributes) do
        local encoded = scalar(value)`, String.raw`    for key, value in pairs(attributes) do
        local encoded = nil
        if not isSensitiveField(key) then encoded = scalar(value) end`);

  source = replaceOnce(source, String.raw`local function push(list, value, limit)`, INSPECTION_GUARD + "\n\nlocal function push(list, value, limit)");
  source = replaceOnce(source, "local function scan(mode)\n", "local function scan(mode)\n    refreshPrivateNames()\n");
  source = replaceOnce(source, "        if object and object.Parent then", "        if object and object.Parent and shouldInspect(object) then");
  source = replaceOnce(source, "                        root = root.Name,", "                        root = safeName(root.Name),");
  source = replaceOnce(source, '            elseif object:IsA("ValueBase") then', '            elseif object:IsA("ValueBase") and not isSensitiveField(object.Name) then');
  source = replaceOnce(source, '            if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then', '            if object:IsA("TextLabel") or object:IsA("TextButton") then');
  source = replaceOnce(source, "        if #state.events >= 180 or not object then return end", "        if #state.events >= 180 or not object or not shouldInspect(object) then return end");
  source = replaceOnce(source, "local function encodeReport()\n", REPORT_GUARD + "local function encodeReport()\n    refreshPrivateNames()\n");
  source = replaceOnce(source, "return HttpService:JSONEncode(report)", "return HttpService:JSONEncode(sanitizeReport(report))");
  source = replaceOnce(source, "gui.Parent = parentForGui()", String.raw`gui.Parent = parentForGui()
gui.Destroying:Connect(function()
    privacyConnection:Disconnect()
    disconnectRecorder()
end)`);
  source = replaceOnce(source, 'setStatus("Action learned • export the report")', 'setStatus("Comparison captured • export the report")');

  return source;
}
