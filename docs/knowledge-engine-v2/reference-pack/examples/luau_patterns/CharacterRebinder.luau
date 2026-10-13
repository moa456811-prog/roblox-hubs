-- Client lifecycle helper; callback receives the new character and cleanup list.
-- Caller MUST supply a valid LocalPlayer and authorized callback.
local Rebinder = {}

function Rebinder.connect(localPlayer, callback)
    assert(localPlayer ~= nil and type(callback) == "function")
    local generation = 0
    local active = true
    local connection
    local function onCharacter(character)
        generation += 1
        local myGeneration = generation
        task.defer(function()
            if active and myGeneration == generation then callback(character, myGeneration) end
        end)
    end
    connection = localPlayer.CharacterAdded:Connect(onCharacter)
    if localPlayer.Character then onCharacter(localPlayer.Character) end
    return function()
        active = false
        generation += 1
        if connection then connection:Disconnect() end
    end
end

return Rebinder
