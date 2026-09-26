-- A7DEV HUB - Slayer 2 isolated UI test loader
-- Production loader/main.lua are not modified by this file.

local BASE = "https://rbhasxhkhvldbbsvbmqj.supabase.co/functions/v1/a7dev-loader?game=project-slayer-2"
local UI_TEST = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/test/slayer2-ui-redesign/hubs/project-slayer-2/ui_test_reference_v16.lua"

local function runSource(url, label)
    local okHttp, source = pcall(game.HttpGet, game, url)
    if not okHttp then
        warn("[A7DEV TEST] "..label.." download failed: "..tostring(source))
        return false
    end

    local fn, compileError = loadstring(source)
    if not fn then
        warn("[A7DEV TEST] "..label.." compile failed: "..tostring(compileError))
        return false
    end

    local okRun, runError = pcall(fn)
    if not okRun then
        warn("[A7DEV TEST] "..label.." runtime failed: "..tostring(runError))
        return false
    end

    return true
end

if not runSource(BASE, "Slayer 2 base") then return end

task.spawn(function()
    local player = game:GetService("Players").LocalPlayer
    local pg = player and player:WaitForChild("PlayerGui", 20)

    if pg then
        for _ = 1, 300 do
            if pg:FindFirstChild("A7DEV_ProjectSlayer2") then break end
            task.wait(.1)
        end
    end

    runSource(UI_TEST, "Reference UI V16")
end)
