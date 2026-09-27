-- A7DEV HUB | Slayer 2 TEST ALL V2
local Players=game:GetService("Players")
local player=Players.LocalPlayer or Players.PlayerAdded:Wait()
local playerGui=player:WaitForChild("PlayerGui")
local MAIN_BOOTSTRAP="https://rbhasxhkhvldbbsvbmqj.supabase.co/functions/v1/a7dev-loader?game=project-slayer-2"
local TEST_UI="https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/hubs/project-slayer-2/ui_reference_v18.lua"

local hiding=true
task.spawn(function()
 while hiding do
  local gui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
  local main=gui and gui:FindFirstChild("Main")
  if main then main.Visible=false end
  task.wait(.03)
 end
end)

local okSource,source=pcall(game.HttpGet,game,MAIN_BOOTSTRAP)
if not okSource then hiding=false error("[A7DEV TEST ALL V2] Bootstrap download failed: "..tostring(source)) end
local fn,compileError=loadstring(source)
if not fn then hiding=false error("[A7DEV TEST ALL V2] Bootstrap compile failed: "..tostring(compileError)) end
local result=fn()

task.spawn(function()
 local deadline=os.clock()+180
 while os.clock()<deadline do
  local gui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
  local main=gui and gui:FindFirstChild("Main")
  if main then
   main.Visible=false
   local ready=false
   for _,object in ipairs(main:GetDescendants()) do
    if object:IsA("Frame") and string.sub(object.Name or "",1,8)=="Section_" then ready=true break end
   end
   if ready then
    local okUiSource,uiSource=pcall(game.HttpGet,game,TEST_UI)
    if not okUiSource then hiding=false main.Visible=true warn("[A7DEV TEST ALL V2] UI download failed: "..tostring(uiSource)) return end
    local uiFn,uiCompileError=loadstring(uiSource)
    if not uiFn then hiding=false main.Visible=true warn("[A7DEV TEST ALL V2] UI compile failed: "..tostring(uiCompileError)) return end
    local okRun,runError=pcall(uiFn)
    hiding=false
    if not okRun then main.Visible=true warn("[A7DEV TEST ALL V2] UI runtime failed: "..tostring(runError)) end
    return
   end
  end
  task.wait(.05)
 end
 hiding=false
 local gui=playerGui:FindFirstChild("A7DEV_ProjectSlayer2")
 local main=gui and gui:FindFirstChild("Main")
 if main then main.Visible=true end
 warn("[A7DEV TEST ALL V2] Slayer 2 controls did not become ready before timeout.")
end)

return result
