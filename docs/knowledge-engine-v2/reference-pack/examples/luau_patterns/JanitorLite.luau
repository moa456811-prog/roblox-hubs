-- Release handlers on reload; prevents stacked duplicate event listeners.
local Janitor = {}
Janitor.__index = Janitor

function Janitor.new()
    return setmetatable({cleanup = {}, closed = false}, Janitor)
end

function Janitor:add(item)
    assert(not self.closed, "Janitor already cleaned")
    local kind = typeof(item)
    if type(item) == "function" then
        table.insert(self.cleanup, item)
    elseif kind == "RBXScriptConnection" then
        table.insert(self.cleanup, function() item:Disconnect() end)
    elseif kind == "Instance" then
        table.insert(self.cleanup, function() item:Destroy() end)
    else
        error("Unsupported cleanup type: " .. kind)
    end
    return item
end

function Janitor:destroy()
    if self.closed then return end
    self.closed = true
    for i = #self.cleanup, 1, -1 do
        pcall(self.cleanup[i])
    end
    table.clear(self.cleanup)
end

return Janitor
