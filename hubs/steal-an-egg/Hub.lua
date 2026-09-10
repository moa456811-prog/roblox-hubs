--!nonstrict
-- Roblox Hub Factory: public profile and authorized client tools.

-- ===== profile =====
local Profile = {["confidence"]=0,["entities"]={},["game"]={["created_date"]="2026-07-25T07:50:51.492Z",["creator"]="and Collect Rare Pets",["creator_id"]=825735094,["description"]="\240\159\165\154 Welcome to Steal An Egg!\010\010How to Play:\010\240\159\165\154 Steal eggs from pets\010\240\159\144\163 Hatch eggs to collect rare pets\010\240\159\146\176 Earn money from your pets\010\226\172\134\239\184\143 Upgrade your treadmill and base\010\240\159\143\131 Train on the treadmill to gain Speed\010\240\159\165\183 Steal eggs from other players\010\226\156\168 Discover rarer eggs, pets, sizes, and mutations!\010\010\240\159\142\174 Supports Desktop, Console, Mobile, and Tablet players",["fixture"]=false,["genre"]="All",["icon"]="https://tr.rbxcdn.com/180DAY-856231c847a8d9709e23979c56c38c3a/150/150/Image/Png/noFilter",["identification_confidence"]=0.99,["known_places"]={107778070777162},["name"]="Steal An Egg",["official_links"]={},["place_id"]=107778070777162,["thumbnail"]="https://tr.rbxcdn.com/180DAY-875b2a6dc156ce6dd64eb637e73238ce/768/432/Image/Png/noFilter",["universe_id"]=10563114921,["updated_date"]="2026-09-10T19:06:52.2807062Z",["visits"]=2498787796},["integration"]={["actions"]=0,["runtime"]="NOT_VERIFIED",["scripts"]=3},["research_date"]="2026-09-10T21:39:31.902974+00:00",["sources"]={{["confidence"]=0.345,["freshness"]="unknown",["id"]="f49847a106065ae0-9be593d913",["name"]="roblox-hubs",["source_type"]="public_code_reference",["url"]="https://api.github.com/repos/moa456811-prog/roblox-hubs/readme"},{["confidence"]=0.3,["freshness"]="unknown",["id"]="75f4bfd02171c69e-944debdf0a",["name"]="StealAnEgg",["source_type"]="public_code_reference",["url"]="https://api.github.com/repos/ShortcakeMaker/StealAnEgg/readme"},{["confidence"]=0.345,["freshness"]="unknown",["id"]="041585a85e0c80a2-b143138906",["name"]="roblox-steal-an-egg",["source_type"]="public_code_reference",["url"]="https://api.github.com/repos/sw4gi/roblox-steal-an-egg/readme"},{["confidence"]=0.821,["freshness"]="unknown",["id"]="20aa6e6d15caad86",["name"]="Roblox public metadata",["source_type"]="official_roblox",["url"]="https://apis.roblox.com/universes/v1/places/107778070777162/universe"},{["confidence"]=0.821,["freshness"]="unknown",["id"]="3ad7afeab0bf53b3",["name"]="Roblox public metadata",["source_type"]="official_roblox",["url"]="https://games.roblox.com/v1/games?universeIds=10563114921"},{["confidence"]=0.821,["freshness"]="unknown",["id"]="f733c9b1bd1d430a",["name"]="Roblox public metadata",["source_type"]="official_roblox",["url"]="https://thumbnails.roblox.com/v1/games/icons?universeIds=10563114921&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false"},{["confidence"]=0.821,["freshness"]="unknown",["id"]="e40a946b9232b9a2",["name"]="Roblox public metadata",["source_type"]="official_roblox",["url"]="https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=10563114921&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false"}},["version"]=2}


-- ===== features =====
local FeatureDefinitions = {}


-- ===== theme =====
local HubBrand = "a7med_hub"
local InitialTheme = "blue"


-- ===== Core =====
local Core = {
	Players = game:GetService("Players"),
	Input = game:GetService("UserInputService"),
	Run = game:GetService("RunService"),
	Http = game:GetService("HttpService"),
	Workspace = game:GetService("Workspace"),
	Connections = {},
	Alive = true,
	Started = os.clock(),
}
Core.Player = Core.Players.LocalPlayer
if not Core.Player then
	return
end
Core.PlayerGui = Core.Player:WaitForChild("PlayerGui", 10)
if not Core.PlayerGui then
	warn("Hub: PlayerGui unavailable")
	return
end
local previous = Core.PlayerGui:FindFirstChild("RobloxHubFactory")
if previous then
	local shutdown = previous:FindFirstChild("Shutdown")
	if shutdown and shutdown:IsA("BindableEvent") then
		shutdown:Fire()
	end
	previous:Destroy()
end
function Core.Connect(signal, callback, list)
	local connection = signal:Connect(function(...)
		if not Core.Alive then
			return
		end
		local ok, err = pcall(callback, ...)
		if not ok then
			warn("Hub callback: " .. tostring(err))
		end
	end)
	table.insert(list or Core.Connections, connection)
	return connection
end
function Core.Disconnect(list)
	for _, connection in ipairs(list) do
		connection:Disconnect()
	end
	table.clear(list)
end
local Settings = { Theme = InitialTheme, FontSize = 16, Keybind = "RightShift", Verbose = false }
function Settings.Export()
	return Core.Http:JSONEncode({
		version = 1,
		theme = Settings.Theme,
		fontSize = Settings.FontSize,
		keybind = Settings.Keybind,
		verbose = Settings.Verbose,
	})
end
function Settings.Import(text)
	if type(text) ~= "string" or #text > 4000 then
		return false
	end
	local ok, data = pcall(function()
		return Core.Http:JSONDecode(text)
	end)
	if not ok or type(data) ~= "table" or data.version ~= 1 then
		return false
	end
	if data.theme == "blue" or data.theme == "purple" then
		Settings.Theme = data.theme
	end
	if type(data.fontSize) == "number" and data.fontSize == data.fontSize then
		Settings.FontSize = math.clamp(data.fontSize, 12, 22)
	end
	if data.keybind == "RightShift" or data.keybind == "F6" or data.keybind == "F8" then
		Settings.Keybind = data.keybind
	end
	Settings.Verbose = data.verbose == true
	return true
end
local stored = Core.Player:GetAttribute("RobloxHubFactorySettings")
if type(stored) == "string" then
	Settings.Import(stored)
end


-- ===== Logger =====
local Logger = { Entries = {}, LastError = "None", Listener = nil }
function Logger.Write(level, message)
	local entry = { time = os.clock() - Core.Started, level = level, text = tostring(message):sub(1, 1000) }
	table.insert(Logger.Entries, entry)
	if #Logger.Entries > 150 then
		table.remove(Logger.Entries, 1)
	end
	if level == "ERROR" then
		Logger.LastError = entry.text
	end
	if Settings.Verbose or level == "ERROR" then
		print("[Hub][" .. level .. "] " .. entry.text)
	end
	if Logger.Listener then
		pcall(Logger.Listener, entry)
	end
end
function Logger.Text()
	local lines = {}
	for i = math.max(1, #Logger.Entries - 30), #Logger.Entries do
		local entry = Logger.Entries[i]
		table.insert(lines, string.format("%.1fs [%s] %s", entry.time, entry.level, entry.text))
	end
	return table.concat(lines, "\n")
end


-- ===== TaskManager =====
local function CreateTaskManager(scheduler, clock, log)
	local manager = { Tasks = {}, Generation = 0 }
	local function cleanup(token)
		if token.cleaned then
			return
		end
		token.cleaned = true
		for index = #token.cleanups, 1, -1 do
			local ok, err = pcall(token.cleanups[index])
			if not ok then
				log("ERROR", "Cleanup: " .. tostring(err))
			end
		end
		table.clear(token.cleanups)
	end
	function manager:IsRunning(id)
		return self.Tasks[id] ~= nil
	end
	function manager:RegisterCleanup(id, callback)
		local token = self.Tasks[id]
		if not token or token.cancelled or token.cleaned then
			pcall(callback)
			return false
		end
		table.insert(token.cleanups, callback)
		return true
	end
	function manager:Stop(id)
		local token = self.Tasks[id]
		if not token then
			return
		end
		self.Tasks[id] = nil
		token.cancelled = true
		cleanup(token)
		if token.thread and token.thread ~= coroutine.running() then
			pcall(scheduler.cancel, token.thread)
		end
		log("INFO", "Stopped " .. id)
	end
	function manager:StopAll()
		self.Generation += 1
		local names = {}
		for id in pairs(self.Tasks) do
			table.insert(names, id)
		end
		for _, id in ipairs(names) do
			self:Stop(id)
		end
	end
	function manager:Start(id, callback, timeout)
		if self:IsRunning(id) then
			return false
		end
		local token = {
			cancelled = false,
			cleanups = {},
			generation = self.Generation,
			deadline = clock() + math.clamp(timeout or 300, 1, 3600),
		}
		self.Tasks[id] = token
		local context = {}
		function context.Active()
			return not token.cancelled and token.generation == manager.Generation and clock() < token.deadline
		end
		function context.Wait(seconds)
			local finish = clock() + math.max(0, seconds)
			repeat
				if not context.Active() then
					error("Cancelled or timed out", 0)
				end
				scheduler.wait(math.min(0.05, math.max(0, finish - clock())))
			until clock() >= finish
			if not context.Active() then
				error("Cancelled or timed out", 0)
			end
		end
		function context.Cleanup(callback)
			if token.cancelled or token.cleaned then
				pcall(callback)
			else
				table.insert(token.cleanups, callback)
			end
		end
		token.thread = coroutine.create(function()
			local ok, err = pcall(callback, context)
			cleanup(token)
			if manager.Tasks[id] == token then
				manager.Tasks[id] = nil
			end
			if not ok and not token.cancelled then
				log("ERROR", id .. ": " .. tostring(err))
			elseif ok and not token.cancelled then
				log("SUCCESS", "Completed " .. id)
			end
		end)
		log("INFO", "Started " .. id)
		scheduler.spawn(token.thread)
		return true
	end
	return manager
end
local TaskManager = CreateTaskManager(task, os.clock, Logger.Write)


-- ===== GameAdapter =====
local GameAdapter = { Metadata = Profile.game, Index = {}, Groups = {}, Sources = {} }
for _, source in ipairs(Profile.sources) do
	GameAdapter.Sources[source.id] = source
end
for _, entity in ipairs(Profile.entities) do
	GameAdapter.Index[entity.id] = entity
	GameAdapter.Groups[entity.category] = GameAdapter.Groups[entity.category] or {}
	table.insert(GameAdapter.Groups[entity.category], entity)
end
function GameAdapter:Get(category)
	return self.Groups[category] or {}
end
function GameAdapter:Find(category, name)
	for _, entity in ipairs(self:Get(category)) do
		if string.lower(entity.name) == string.lower(name) or entity.id == name then
			return entity
		end
		for _, alias in ipairs(entity.aliases) do
			if string.lower(alias) == string.lower(name) then
				return entity
			end
		end
	end
	return nil
end
function GameAdapter:GetBosses()
	return self:Get("bosses")
end
function GameAdapter:GetBoss(name)
	return self:Find("bosses", name)
end
function GameAdapter:GetEnemies()
	return self:Get("enemies")
end
function GameAdapter:GetEnemy(name)
	return self:Find("enemies", name)
end
function GameAdapter:GetQuests()
	return self:Get("quests")
end
function GameAdapter:GetQuest(name)
	return self:Find("quests", name)
end
function GameAdapter:GetZones()
	return self:Get("zones")
end
function GameAdapter:GetItems()
	return self:Get("items")
end
function GameAdapter:GetSkills()
	return self:Get("skills")
end
function GameAdapter:GetCurrencies()
	return self:Get("currencies")
end
function GameAdapter:Describe(entity)
	local lines =
		{ entity.name .. "  ·  " .. math.floor(entity.confidence * 100) .. "% · " .. entity.confidence_label }
	for _, field in ipairs({
		"world",
		"location",
		"hp",
		"level_requirement",
		"respawn_seconds",
		"cooldown_seconds",
		"drops",
		"summon_requirements",
	}) do
		local value = entity[field]
		if type(value) == "table" then
			value = table.concat(value, ", ")
		end
		local evidence = entity.field_evidence[field]
		local confidence = evidence and string.format(" (%.0f%%)", evidence.confidence * 100) or ""
		table.insert(
			lines,
			field:gsub("_", " ") .. ": " .. (value ~= nil and tostring(value) or "unknown") .. confidence
		)
	end
	table.insert(lines, "Coordinates / internal triggers: unknown")
	for _, id in ipairs(entity.sources) do
		local source = self.Sources[id]
		if source then
			table.insert(lines, "Source: " .. source.url)
		end
	end
	return table.concat(lines, "\n")
end


-- ===== FeatureRegistry =====
local FeatureRegistry = { Entries = {}, Order = {}, Samples = 0, Stopwatch = 0 }
function FeatureRegistry:Register(feature)
	assert(not self.Entries[feature.Id], "Duplicate feature")
	self.Entries[feature.Id] = feature
	table.insert(self.Order, feature.Id)
end
for _, definition in ipairs(FeatureDefinitions) do
	FeatureRegistry:Register({
		Id = definition.id,
		Name = definition.name,
		Category = definition.category,
		Available = definition.available,
		Confidence = definition.confidence,
		Kind = "database",
	})
end
FeatureRegistry:Register({
	Id = "stat_sampler",
	Name = "Monitor player state",
	Category = "tools",
	Available = true,
	Confidence = 1,
	Kind = "toggle",
	Start = function()
		TaskManager:Start("stat_sampler", function(context)
			for _ = 1, 300 do
				context.Wait(1)
				FeatureRegistry.Samples += 1
			end
		end, 305)
	end,
	Stop = function()
		TaskManager:Stop("stat_sampler")
	end,
})
FeatureRegistry:Register({
	Id = "stopwatch",
	Name = "Stopwatch",
	Category = "tools",
	Available = true,
	Confidence = 1,
	Kind = "toggle",
	Start = function()
		TaskManager:Start("stopwatch", function(context)
			local started = os.clock()
			for _ = 1, 600 do
				context.Wait(1)
				FeatureRegistry.Stopwatch = os.clock() - started
			end
		end, 605)
	end,
	Stop = function()
		TaskManager:Stop("stopwatch")
	end,
})
function FeatureRegistry:Timer(entity)
	local evidence = entity.field_evidence.respawn_seconds
	if not entity.respawn_seconds or not evidence or evidence.confidence < 0.75 then
		return false
	end
	local seconds = math.clamp(entity.respawn_seconds, 1, 3500)
	return TaskManager:Start("timer:" .. entity.id, function(context)
		context.Wait(seconds)
		Logger.Write("SUCCESS", entity.name .. ": reference interval elapsed; actual spawn is not observed")
	end, seconds + 1)
end


-- ===== UI =====
local UI = {
	Page = "HOME",
	Query = "",
	PageConnections = {},
	NavigationConnections = {},
	Toggles = {},
	Minimized = false,
	NoticeUntil = 0,
}
local function accent()
	return Settings.Theme == "purple" and Color3.fromRGB(155, 111, 255) or Color3.fromRGB(41, 218, 200)
end
local colors = {
	background = Color3.fromRGB(9, 13, 22),
	card = Color3.fromRGB(22, 30, 43),
	text = Color3.fromRGB(238, 242, 250),
	muted = Color3.fromRGB(157, 171, 190),
}
local function create(className, properties, parent)
	local object = Instance.new(className)
	for key, value in pairs(properties) do
		object[key] = value
	end
	object.Parent = parent
	return object
end
local function round(object, radius)
	create("UICorner", { CornerRadius = UDim.new(0, radius or 12) }, object)
end
local function label(text, height, parent)
	return create("TextLabel", {
		Size = UDim2.new(1, 0, 0, height),
		BackgroundTransparency = 1,
		Text = text,
		TextColor3 = colors.text,
		TextSize = Settings.FontSize,
		Font = Enum.Font.Gotham,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		RichText = false,
	}, parent or UI.Content)
end
function UI.Notify(text)
	UI.Notice.Text = tostring(text)
	UI.Notice.Visible = true
	UI.NoticeUntil = os.clock() + 5
end
local function button(text, callback, parent, list, tooltip)
	local object = create("TextButton", {
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundColor3 = colors.card,
		BorderSizePixel = 0,
		Text = text,
		TextColor3 = colors.text,
		TextSize = Settings.FontSize,
		Font = Enum.Font.GothamMedium,
	}, parent or UI.Content)
	round(object)
	Core.Connect(object.Activated, function()
		local ok, err = pcall(callback)
		if not ok then
			Logger.Write("ERROR", err)
		end
	end, list or UI.PageConnections)
	if tooltip then
		Core.Connect(object.MouseEnter, function()
			UI.Tooltip.Text = tooltip
			UI.Tooltip.Visible = true
		end, list or UI.PageConnections)
		Core.Connect(object.MouseLeave, function()
			UI.Tooltip.Visible = false
		end, list or UI.PageConnections)
	end
	return object
end
local function card(title, text, height)
	local frame = create(
		"Frame",
		{ Size = UDim2.new(1, 0, 0, height), BackgroundColor3 = colors.card, BorderSizePixel = 0 },
		UI.Content
	)
	round(frame, 12)
	local heading = label(title, 30, frame)
	heading.Position = UDim2.fromOffset(16, 12)
	heading.Size = UDim2.new(1, -32, 0, 30)
	heading.Font = Enum.Font.GothamBold
	heading.TextColor3 = accent()
	local body = label(text, height - 50, frame)
	body.Position = UDim2.fromOffset(16, 48)
	body.Size = UDim2.new(1, -32, 1, -58)
	return frame
end
local function toggle(feature)
	local row = create(
		"Frame",
		{ Size = UDim2.new(1, 0, 0, 70), BackgroundColor3 = colors.card, BorderSizePixel = 0 },
		UI.Content
	)
	round(row, 14)
	local title = label(feature.Name, 32, row)
	title.Position = UDim2.fromOffset(18, 22)
	title.Size = UDim2.new(1, -130, 0, 35)
	title.Font = Enum.Font.GothamBold
	local switch = button("OFF", function()
		if TaskManager:IsRunning(feature.Id) then
			feature.Stop()
		else
			feature.Start()
		end
	end, row, nil, "Bounded task; STOP ALL also disables this switch.")
	switch.Position = UDim2.new(1, -104, 0, 16)
	switch.Size = UDim2.fromOffset(86, 38)
	table.insert(UI.Toggles, { button = switch, id = feature.Id })
end
local function textbox(text, parent, multiline)
	local object = create("TextBox", {
		Size = UDim2.new(1, 0, 0, multiline and 110 or 40),
		BackgroundColor3 = colors.card,
		BorderSizePixel = 0,
		Text = text,
		PlaceholderText = "Search…",
		TextColor3 = colors.text,
		TextSize = 14,
		Font = Enum.Font.Code,
		ClearTextOnFocus = false,
		MultiLine = multiline or false,
		TextWrapped = multiline or false,
	}, parent or UI.Content)
	round(object, 8)
	return object
end
function UI.Clear()
	Core.Disconnect(UI.PageConnections)
	table.clear(UI.Toggles)
	UI.Debug = nil
	UI.ToolStatus = nil
	UI.Content.CanvasPosition = Vector2.new(0, 0)
	UI.Tooltip.Visible = false
	for _, child in ipairs(UI.Content:GetChildren()) do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
end
local function match(text)
	return UI.Query == "" or string.lower(text):find(UI.Query, 1, true) ~= nil
end
function UI.Render()
	UI.Clear()
	if UI.Page == "HOME" then
		card(
			HubBrand .. " / " .. Profile.game.name,
			"Creator: "
				.. tostring(Profile.game.creator or "unknown")
				.. "\nProfile v"
				.. Profile.version
				.. " · "
				.. Profile.research_date:sub(1, 10)
				.. "\nData confidence: "
				.. math.floor(Profile.confidence * 100)
				.. "% · "
				.. #Profile.entities
				.. " entities",
			158
		)
		card(
			"Your game profile",
			"Browse the tabs to inspect bosses, quests, items and other discovered systems. Each record retains confidence and sources. Internal paths and actions are never inferred from a public guide.",
			145
		)
		card(
			"Client tools",
			"Timers and player-state monitoring live in TOOLS. They are bounded and can all be stopped using the red STOP ALL button.",
			122
		)
		card(
			"Gameplay integration",
			tostring(Profile.integration.scripts)
				.. " source scripts analyzed / "
				.. tostring(Profile.integration.actions)
				.. " actions translated.\n"
				.. (
					Profile.integration.actions == 0 and "No gameplay automation integrated for this profile."
					or "Actions are available under AUTOMATION; runtime is not verified."
				),
			110
		)
	elseif UI.Page == "GAME INFO" then
		card(
			"Experience",
			"PlaceId: "
				.. tostring(Profile.game.place_id)
				.. "\nUniverseId: "
				.. tostring(Profile.game.universe_id)
				.. "\nGenre: "
				.. tostring(Profile.game.genre or "unknown")
				.. "\nUpdated: "
				.. tostring(Profile.game.updated_date or "unknown")
				.. "\nIdentity confidence: "
				.. math.floor(Profile.game.identification_confidence * 100)
				.. "%",
			190
		)
		for _, source in ipairs(Profile.sources) do
			if match(source.name .. source.url) then
				card(source.source_type, source.name .. "\n" .. source.url .. "\nFreshness: " .. source.freshness, 140)
			end
		end
	elseif UI.Page == "AUTOMATION" then
		card(
			"Actions adapted from source",
			"Not runtime verified. Exact game and instance checks run before each task. STOP ALL cancels repetition.",
			110
		)
		for _, id in ipairs(FeatureRegistry.Order) do
			local feature = FeatureRegistry.Entries[id]
			if feature.Kind == "automation" then
				if feature.Available then
					toggle(feature)
				else
					card(feature.Name, "Unavailable in this experience", 90)
				end
			end
		end
	elseif UI.Page == "TOOLS" then
		for _, id in ipairs(FeatureRegistry.Order) do
			local feature = FeatureRegistry.Entries[id]
			if feature.Kind == "toggle" then
				toggle(feature)
			end
		end
		UI.ToolStatus = label("", 100)
	elseif UI.Page == "DEBUG" then
		UI.Debug = label(Logger.Text(), 680)
		UI.Debug.Font = Enum.Font.Code
		UI.Debug.TextSize = 12
	elseif UI.Page == "SETTINGS" then
		button("Blue tabs / Purple sidebar", function()
			Settings.Theme = Settings.Theme == "blue" and "purple" or "blue"
			UI.Layout()
			UI.Navigation()
			UI.Render()
		end)
		-- Discrete accessible slider: each press steps the supported font-size range.
		local sizeText = label("Text size: " .. Settings.FontSize, 30)
		local slider = create(
			"TextButton",
			{ Size = UDim2.new(1, 0, 0, 18), Text = "", BackgroundColor3 = colors.card, BorderSizePixel = 0 },
			UI.Content
		)
		round(slider, 8)
		local fill = create("Frame", {
			Size = UDim2.new((Settings.FontSize - 12) / 10, 0, 1, 0),
			BackgroundColor3 = accent(),
			BorderSizePixel = 0,
		}, slider)
		round(fill, 8)
		Core.Connect(slider.InputBegan, function(input)
			if
				input.UserInputType == Enum.UserInputType.MouseButton1
				or input.UserInputType == Enum.UserInputType.Touch
			then
				local fraction = math.clamp(
					(input.Position.X - slider.AbsolutePosition.X) / math.max(1, slider.AbsoluteSize.X),
					0,
					1
				)
				Settings.FontSize = math.floor(12 + fraction * 10 + 0.5)
				fill.Size = UDim2.new((Settings.FontSize - 12) / 10, 0, 1, 0)
				sizeText.Text = "Text size: " .. Settings.FontSize
			end
		end, UI.PageConnections)
		local dropdown = button("Visibility key: " .. Settings.Keybind .. "  ▾", function() end)
		local options =
			create("Frame", { Size = UDim2.new(1, 0, 0, 144), Visible = false, BackgroundTransparency = 1 }, UI.Content)
		create("UIListLayout", { Padding = UDim.new(0, 2) }, options)
		Core.Connect(dropdown.Activated, function()
			options.Visible = not options.Visible
		end, UI.PageConnections)
		for _, key in ipairs({ "RightShift", "F6", "F8" }) do
			button(key, function()
				Settings.Keybind = key
				dropdown.Text = "Visibility key: " .. key .. "  ▾"
				options.Visible = false
			end, options)
		end
		local config = textbox(Settings.Export(), nil, true)
		button("Export settings", function()
			config.Text = Settings.Export()
			config:CaptureFocus()
		end)
		button("Import settings", function()
			if Settings.Import(config.Text) then
				UI.Layout()
				UI.Navigation()
				UI.Render()
				UI.Notify("Settings applied")
			else
				UI.Notify("Invalid settings JSON")
			end
		end)
		button("Save for this session", function()
			Core.Player:SetAttribute("RobloxHubFactorySettings", Settings.Export())
			UI.Notify("Saved for this play session")
		end)
	else
		local entries = GameAdapter:Get(string.lower(tostring(UI.Page)))
		local count = 0
		for _, entity in ipairs(entries) do
			if match(entity.name .. " " .. tostring(entity.location or "")) and count < 80 then
				count += 1
				card(entity.name, GameAdapter:Describe(entity), 430)
				local evidence = entity.field_evidence.respawn_seconds
				if entity.respawn_seconds and evidence and evidence.confidence >= 0.75 then
					button("Start reference respawn timer", function()
						FeatureRegistry:Timer(entity)
					end)
				end
			end
		end
		if count == 0 then
			label("No matching verified records. Try another search.", 60)
		end
		if #entries > 80 then
			label("Showing up to 80 matches. Narrow the search to inspect additional records.", 55)
		end
	end
end
function UI.Navigation()
	Core.Disconnect(UI.NavigationConnections)
	for _, child in ipairs(UI.Nav:GetChildren()) do
		child:Destroy()
	end
	create("UIListLayout", {
		FillDirection = Settings.Theme == "blue" and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, UI.Nav)
	local names = { "HOME" }
	for _, id in ipairs(FeatureRegistry.Order) do
		if FeatureRegistry.Entries[id].Kind == "automation" then
			table.insert(names, "AUTOMATION")
			break
		end
	end
	for _, definition in ipairs(FeatureDefinitions) do
		table.insert(names, string.upper(definition.category))
	end
	for _, name in ipairs({ "GAME INFO", "TOOLS", "DEBUG", "SETTINGS" }) do
		table.insert(names, name)
	end
	for _, name in ipairs(names) do
		local b = button(name:gsub("_", " "), function()
			UI.Page = name
			UI.Navigation()
			UI.Render()
		end, UI.Nav, UI.NavigationConnections)
		b.Size = Settings.Theme == "blue" and UDim2.fromOffset(math.max(104, #name * 11), 48) or UDim2.new(1, -8, 0, 42)
		b.TextSize = 14
		if UI.Page == name then
			b.TextColor3 = Settings.Theme == "blue" and accent() or colors.text
			if Settings.Theme == "purple" then
				b.BackgroundColor3 = accent()
			else
				create("Frame", {
					Size = UDim2.new(1, -8, 0, 3),
					Position = UDim2.new(0, 4, 1, -3),
					BackgroundColor3 = accent(),
					BorderSizePixel = 0,
				}, b)
			end
		end
	end
end
function UI.Layout()
	local camera = Core.Workspace.CurrentCamera
	local view = camera and camera.ViewportSize or Vector2.new(1024, 768)
	local width = math.min(UI.DesiredSize.X, math.max(280, view.X - 20))
	local height = math.min(UI.DesiredSize.Y, math.max(220, view.Y - 60))
	UI.Window.Size = UDim2.fromOffset(width, UI.Minimized and 68 or height)
	UI.Window.Position = UDim2.fromOffset(
		math.clamp(UI.Window.Position.X.Offset, 0, math.max(0, view.X - width)),
		math.clamp(UI.Window.Position.Y.Offset, 0, math.max(0, view.Y - height - 35))
	)
	UI.Nav.Visible = not UI.Minimized
	UI.Search.Visible = not UI.Minimized
	UI.Content.Visible = not UI.Minimized
	UI.Resize.Visible = not UI.Minimized
	UI.Stroke.Color = accent()
	if Settings.Theme == "blue" then
		UI.Nav.Position = UDim2.fromOffset(14, 80)
		UI.Nav.Size = UDim2.new(1, -28, 0, 54)
		UI.Nav.AutomaticCanvasSize = Enum.AutomaticSize.X
		UI.Search.Position = UDim2.fromOffset(14, 143)
		UI.Search.Size = UDim2.new(1, -28, 0, 36)
		UI.Content.Position = UDim2.fromOffset(14, 192)
		UI.Content.Size = UDim2.new(1, -28, 1, -209)
	else
		local side = width < 500 and 94 or 146
		UI.Nav.Position = UDim2.fromOffset(12, 80)
		UI.Nav.Size = UDim2.new(0, side, 1, -96)
		UI.Nav.AutomaticCanvasSize = Enum.AutomaticSize.Y
		UI.Search.Position = UDim2.fromOffset(side + 24, 80)
		UI.Search.Size = UDim2.new(1, -side - 40, 0, 36)
		UI.Content.Position = UDim2.fromOffset(side + 24, 130)
		UI.Content.Size = UDim2.new(1, -side - 40, 1, -145)
	end
	UI.Title.TextSize = width < 600 and 17 or 25
	local titleLeft = width < 500 and 12 or 62
	UI.Badge.Visible = width >= 500
	UI.Badge.BackgroundColor3 = accent()
	UI.Title.Position = UDim2.fromOffset(titleLeft, 9)
	UI.GameTitle.Position = UDim2.fromOffset(titleLeft, 39)
	UI.Title.Size = UDim2.new(1, -titleLeft - 208, 0, 28)
	UI.GameTitle.Size = UDim2.new(1, -titleLeft - 208, 0, 18)
end
Core.Gui = create(
	"ScreenGui",
	{ Name = "RobloxHubFactory", ResetOnSpawn = false, DisplayOrder = 70, ZIndexBehavior = Enum.ZIndexBehavior.Sibling },
	Core.PlayerGui
)
local shutdown = create("BindableEvent", { Name = "Shutdown" }, Core.Gui)
UI.Window = create("Frame", {
	Size = UDim2.fromOffset(850, 610),
	Position = UDim2.fromOffset(30, 30),
	BackgroundColor3 = colors.background,
	BorderSizePixel = 0,
}, Core.Gui)
round(UI.Window, 16)
UI.Stroke = create("UIStroke", { Thickness = 2, Color = accent() }, UI.Window)
local header = create(
	"Frame",
	{ Name = "Header", Size = UDim2.new(1, 0, 0, 68), BackgroundTransparency = 1, Active = true },
	UI.Window
)
UI.Title = label(HubBrand, 38, header)
UI.Title.Position = UDim2.fromOffset(62, 9)
UI.Title.Size = UDim2.new(1, -275, 0, 28)
UI.Title.TextScaled = true
UI.Title.Font = Enum.Font.GothamBold
UI.Badge = label("a7", 32, header)
UI.Badge.Position = UDim2.fromOffset(16, 16)
UI.Badge.Size = UDim2.fromOffset(36, 36)
UI.Badge.BackgroundTransparency = 0
UI.Badge.BackgroundColor3 = accent()
UI.Badge.TextColor3 = colors.background
UI.Badge.Font = Enum.Font.GothamBold
round(UI.Badge, 10)
UI.GameTitle = label(Profile.game.name, 16, header)
UI.GameTitle.Position = UDim2.fromOffset(62, 39)
UI.GameTitle.Size = UDim2.new(1, -275, 0, 18)
UI.GameTitle.TextScaled = true
UI.GameTitle.TextColor3 = colors.muted
UI.Stop = button("STOP ALL", function()
	TaskManager:StopAll()
	UI.Notify("All tasks stopped")
end, header, Core.Connections)
UI.Stop.Position = UDim2.new(1, -199, 0, 16)
UI.Stop.Size = UDim2.fromOffset(100, 36)
UI.Stop.TextSize = 12
UI.Stop.BackgroundColor3 = Color3.fromRGB(190, 55, 76)
local min = button("—", function()
	UI.Minimized = not UI.Minimized
	UI.Layout()
end, header, Core.Connections)
min.Position = UDim2.new(1, -90, 0, 16)
min.Size = UDim2.fromOffset(36, 36)
local close = button("×", function()
	shutdown:Fire()
end, header, Core.Connections)
close.Position = UDim2.new(1, -47, 0, 16)
close.Size = UDim2.fromOffset(36, 36)
UI.Nav = create(
	"ScrollingFrame",
	{ BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 3, CanvasSize = UDim2.new() },
	UI.Window
)
UI.Search = textbox("", UI.Window)
UI.Content = create("ScrollingFrame", {
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ScrollBarThickness = 4,
	CanvasSize = UDim2.new(),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
}, UI.Window)
create("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, UI.Content)
create("UIPadding", { PaddingRight = UDim.new(0, 8), PaddingBottom = UDim.new(0, 12) }, UI.Content)
UI.Resize = button("◢", function() end, UI.Window, Core.Connections)
UI.Resize.Position = UDim2.new(1, -24, 1, -24)
UI.Resize.Size = UDim2.fromOffset(24, 24)
UI.Resize.BackgroundTransparency = 1
UI.Notice = create("TextLabel", {
	Position = UDim2.new(0.5, -140, 1, -65),
	Size = UDim2.fromOffset(280, 52),
	BackgroundColor3 = colors.card,
	TextColor3 = colors.text,
	TextWrapped = true,
	TextSize = 14,
	Font = Enum.Font.Gotham,
	Visible = false,
	ZIndex = 15,
}, Core.Gui)
round(UI.Notice)
UI.Tooltip = create("TextLabel", {
	Position = UDim2.new(0, 10, 1, -38),
	Size = UDim2.new(1, -20, 0, 30),
	BackgroundColor3 = colors.card,
	TextColor3 = colors.muted,
	TextWrapped = true,
	TextSize = 12,
	Font = Enum.Font.Gotham,
	Visible = false,
	ZIndex = 20,
}, Core.Gui)
UI.DesiredSize = Vector2.new(850, 610)
local gesture, startPoint, startPosition, startSize, resizing
local function begin(input, resize)
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then
		return
	end
	gesture = input
	startPoint = input.Position
	startPosition = UI.Window.Position
	startSize = UI.DesiredSize
	resizing = resize
end
Core.Connect(header.InputBegan, function(input)
	begin(input, false)
end)
Core.Connect(UI.Resize.InputBegan, function(input)
	begin(input, true)
end)
Core.Connect(Core.Input.InputChanged, function(input)
	if gesture and (input == gesture or input.UserInputType == Enum.UserInputType.MouseMovement) then
		local delta = input.Position - startPoint
		if resizing then
			UI.DesiredSize =
				Vector2.new(math.clamp(startSize.X + delta.X, 320, 1400), math.clamp(startSize.Y + delta.Y, 320, 1000))
		else
			UI.Window.Position = UDim2.fromOffset(startPosition.X.Offset + delta.X, startPosition.Y.Offset + delta.Y)
		end
		UI.Layout()
	end
end)
Core.Connect(Core.Input.InputEnded, function(input)
	if input == gesture or input.UserInputType == Enum.UserInputType.MouseButton1 then
		gesture = nil
	end
end)
Core.Connect(Core.Input.InputBegan, function(input, processed)
	if not processed and not Core.Input:GetFocusedTextBox() and input.KeyCode.Name == Settings.Keybind then
		UI.Window.Visible = not UI.Window.Visible
	end
end)
Core.Connect(UI.Search:GetPropertyChangedSignal("Text"), function()
	UI.Query = string.lower(UI.Search.Text):sub(1, 180)
	UI.Render()
end)
local function cleanup()
	if not Core.Alive then
		return
	end
	TaskManager:StopAll()
	Logger.Listener = nil
	Core.Disconnect(UI.PageConnections)
	Core.Disconnect(UI.NavigationConnections)
	Core.Disconnect(Core.Connections)
	Core.Alive = false
end
Core.Connect(shutdown.Event, function()
	cleanup()
	Core.Gui:Destroy()
end)
Core.Connect(Core.Gui.Destroying, cleanup)
Core.Connect(Core.Player.CharacterRemoving, function()
	TaskManager:StopAll()
	Logger.Write("INFO", "Character changed; tools stopped")
end)
local elapsed = 0
Core.Connect(Core.Run.Heartbeat, function(delta)
	elapsed += delta
	if elapsed < 0.25 then
		return
	end
	elapsed = 0
	for _, toggleState in ipairs(UI.Toggles) do
		local running = TaskManager:IsRunning(toggleState.id)
		toggleState.button.Text = running and "ON" or "OFF"
		toggleState.button.BackgroundColor3 = running and accent() or Color3.fromRGB(65, 73, 86)
	end
	if UI.Debug then
		UI.Debug.Text = Logger.Text()
	end
	if UI.ToolStatus then
		local character = Core.Player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		UI.ToolStatus.Text = string.format(
			"Samples: %d  |  Stopwatch: %.1fs\nCharacter: %s  |  Health: %s\nLast error: %s",
			FeatureRegistry.Samples,
			FeatureRegistry.Stopwatch,
			character and character.Name or "unavailable",
			humanoid and tostring(humanoid.Health) or "unknown",
			Logger.LastError
		)
	end
	if os.clock() > UI.NoticeUntil then
		UI.Notice.Visible = false
	end
	UI.Layout()
end)
Logger.Listener = function(entry)
	if entry.level == "ERROR" or entry.level == "SUCCESS" then
		UI.Notify(entry.text)
	end
end
UI.Layout()
UI.Navigation()
UI.Render()
Logger.Write(
	"SUCCESS",
	HubBrand .. " / " .. Profile.game.name .. " ready · " .. #Profile.entities .. " public records"
)

