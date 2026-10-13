-- ScriptRush opt-in diagnostic snapshot (READ-ONLY).
-- Does not send HTTP, invoke remotes, modify game objects, or inspect private server code.
-- Only execute in a game/session where you have permission to run diagnostics.
-- Output may include names and paths: inspect it before sharing.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local HttpService = game:GetService("HttpService")

local localPlayer = Players.LocalPlayer
local character = localPlayer and localPlayer.Character
local humanoid = character and character:FindFirstChildOfClass("Humanoid")
local remotes = {}
local maxRemotes = 35

for _, instance in ipairs(ReplicatedStorage:GetDescendants()) do
    if instance:IsA("RemoteEvent") or instance:IsA("RemoteFunction") then
        if #remotes >= maxRemotes then break end
        table.insert(remotes, {
            path = instance:GetFullName(),
            kind = instance.ClassName,
        })
    end
end

local guiNames = {}
local playerGui = localPlayer and localPlayer:FindFirstChildOfClass("PlayerGui")
if playerGui then
    for _, child in ipairs(playerGui:GetChildren()) do
        if #guiNames >= 20 then break end
        if child:IsA("ScreenGui") then table.insert(guiNames, child.Name) end
    end
end

local snapshot = {
    schema = "scriptrush_read_only_v2",
    placeId = tostring(game.PlaceId),
    universeId = tostring(game.GameId),
    observed = {
        health = humanoid and humanoid.Health or nil,
        maxHealth = humanoid and humanoid.MaxHealth or nil,
        workspaceTopLevelChildren = #Workspace:GetChildren(),
        remoteInstancesVisible = remotes,
        screenGuiNamesVisible = guiNames,
    },
    warnings = {
        "A remote's name never proves its arguments or server implementation.",
        "This diagnostic sees only replicated client-accessible state.",
    },
}
print("SCRIPTRUSH_PROBE_JSON=" .. HttpService:JSONEncode(snapshot))
