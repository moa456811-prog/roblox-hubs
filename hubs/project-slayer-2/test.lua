-- A7DEV HUB | Slayer 2 TEST bootstrap
-- MAIN remains untouched. This launches the normal protected Slayer 2 runtime,
-- then fully replaces the visible UI with the supplied A7 reference layout for this execution path.

local MAIN_BOOTSTRAP = "https://rbhasxhkhvldbbsvbmqj.supabase.co/functions/v1/a7dev-loader?game=project-slayer-2"
local TEST_UI = "https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/hubs/project-slayer-2/ui_reference_v3.lua"

local okSource, source = pcall(game.HttpGet, game, MAIN_BOOTSTRAP)
if not okSource then
    error("[A7DEV TEST] Bootstrap download failed: " .. tostring(source))
end

local fn, compileError = loadstring(source)
if not fn then
    error("[A7DEV TEST] Bootstrap compile failed: " .. tostring(compileError))
end

local result = fn()

task.spawn(function()
    local Players = game:GetService("Players")
    local player = Players.LocalPlayer or Players.PlayerAdded:Wait()
    local playerGui = player:WaitForChild("PlayerGui")
    local deadline = os.clock() + 180

    while os.clock() < deadline do
        local gui = playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
        local main = gui and gui:FindFirstChild("Main")
        local root = main and (
            main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V18")
            or main:FindFirstChild("A7DEV_PS2_BLACKLIGHT_TEST_V7")
            or main:FindFirstChild("A7DEV_PS2_A7BLUE_TEST_V1")
        )

        if root then
            local previousVisible = main.Visible
            main.Visible = false
            task.wait(.08)

            local okUiSource, uiSource = pcall(game.HttpGet, game, TEST_UI)
            if not okUiSource then
                main.Visible = previousVisible
                warn("[A7DEV TEST] UI download failed: " .. tostring(uiSource))
                return
            end

            local uiFn, uiCompileError = loadstring(uiSource)
            if not uiFn then
                main.Visible = previousVisible
                warn("[A7DEV TEST] UI compile failed: " .. tostring(uiCompileError))
                return
            end

            local okRun, runError = pcall(uiFn)
            if not okRun then
                main.Visible = previousVisible
                warn("[A7DEV TEST] UI runtime failed: " .. tostring(runError))
            end
            return
        end

        task.wait(.10)
    end

    warn("[A7DEV TEST] Slayer 2 UI did not appear before timeout.")
end)

return result
