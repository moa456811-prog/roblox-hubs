import { NextResponse } from "next/server";

export async function GET() {
  const script = `-- ScriptRush Studio Profile
-- Use in Roblox Studio Play mode on a game you own.
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local player = Players.LocalPlayer
local MAX_OBJECTS = 50000
local MAX_EXAMPLES = 80

local function add(list, value)
    if #list < MAX_EXAMPLES then
        table.insert(list, value)
    end
end

local function pathOf(instance)
    local parts = {}
    local current = instance
    local depth = 0
    while current and current ~= game and depth < 16 do
        table.insert(parts, 1, current.Name)
        current = current.Parent
        depth += 1
    end
    return table.concat(parts, ".")
end

local function attributesOf(instance)
    local ok, attributes = pcall(instance.GetAttributes, instance)
    if not ok then return nil end
    local result = {}
    local count = 0
    for key, value in pairs(attributes) do
        if count >= 10 then break end
        if type(value) == "string" or type(value) == "number" or type(value) == "boolean" then
            result[key] = value
            count += 1
        end
    end
    return next(result) and result or nil
end

local report = {
    game = {
        placeId = tostring(game.PlaceId),
        universeId = tostring(game.GameId),
    },
    folders = {},
    npcCandidates = {},
    prompts = {},
    tools = {},
    gui = {},
    tags = {},
    counts = {},
}

local roots = { Workspace, ReplicatedStorage }
if player then
    local backpack = player:FindFirstChildOfClass("Backpack")
    local playerGui = player:FindFirstChildOfClass("PlayerGui")
    if backpack then table.insert(roots, backpack) end
    if playerGui then table.insert(roots, playerGui) end
end

local scanned = 0
for _, root in ipairs(roots) do
    local ok, descendants = pcall(root.GetDescendants, root)
    if ok then
        for _, instance in ipairs(descendants) do
            scanned += 1
            if scanned > MAX_OBJECTS then break end
            report.counts[instance.ClassName] = (report.counts[instance.ClassName] or 0) + 1

            if instance:IsA("Folder") then
                add(report.folders, pathOf(instance))
            elseif instance:IsA("Model") then
                local humanoid = instance:FindFirstChildOfClass("Humanoid")
                local rootPart = instance:FindFirstChild("HumanoidRootPart") or instance.PrimaryPart
                if humanoid and rootPart and not Players:GetPlayerFromCharacter(instance) then
                    add(report.npcCandidates, {
                        name = instance.Name,
                        path = pathOf(instance),
                        health = math.floor(humanoid.Health),
                        maxHealth = math.floor(humanoid.MaxHealth),
                        root = rootPart.Name,
                        attributes = attributesOf(instance),
                    })
                end
            elseif instance:IsA("ProximityPrompt") then
                add(report.prompts, {
                    path = pathOf(instance),
                    action = instance.ActionText,
                    object = instance.ObjectText,
                })
            elseif instance:IsA("Tool") then
                add(report.tools, {
                    name = instance.Name,
                    path = pathOf(instance),
                    attributes = attributesOf(instance),
                })
            elseif instance:IsA("TextLabel") or instance:IsA("TextButton") then
                if instance.Text ~= "" then
                    add(report.gui, {
                        path = pathOf(instance),
                        text = instance.Text,
                        visible = instance.Visible,
                    })
                end
            end
        end
    end
    if scanned > MAX_OBJECTS then break end
end

local ok, tags = pcall(CollectionService.GetAllTags, CollectionService)
if ok then
    for _, tag in ipairs(tags) do
        report.tags[tag] = #CollectionService:GetTagged(tag)
    end
end

local encoded = HttpService:JSONEncode(report)
print("[SCRIPTRUSH_STUDIO_PROFILE]" .. encoded)
warn("ScriptRush profile ready. Copy the line above from Output.")`;

  return NextResponse.json({ script, mode: "studio", readOnly: true });
}
