local Players = game:GetService('Players')
local Cooldown = require(script.Parent.Cooldown)
local player = Players.LocalPlayer
local gate = Cooldown.new(2, os.clock)
local connections = {}
local function onCharacter(character)
    if gate:Ready() then
        gate:Start()
        print('Character ready')
    end
end
connections[1] = player.CharacterAdded:Connect(onCharacter)
if player.Character then onCharacter(player.Character) end
local function stop()
    for _, connection in ipairs(connections) do connection:Disconnect() end
    table.clear(connections)
end
return { Stop = stop }
