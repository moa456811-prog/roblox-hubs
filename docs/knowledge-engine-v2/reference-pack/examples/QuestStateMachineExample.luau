-- Generic CLIENT-SIDE controller with injected adapters. Educational source,
-- NOT directly functional in an unknown third-party game.
-- Integrator must implement adapters backed by observable, authorized game APIs.
local Controller = {}
Controller.__index = Controller

function Controller.new(adapters)
    assert(type(adapters) == "table", "Adapters are required")
    for _, field in ipairs({"hasQuest", "requestQuest", "findTarget", "attackTarget", "isAlive"}) do
        assert(type(adapters[field]) == "function", "Missing adapter: " .. field)
    end
    return setmetatable({api = adapters, phase = "IDLE", failures = 0}, Controller)
end

function Controller:step()
    if not self.api.isAlive() then
        self.phase = "WAIT_RESPAWN"
        return self.phase
    end
    if not self.api.hasQuest() then
        self.phase = "REQUEST_QUEST"
        if self.failures < 3 then
            local ok = pcall(self.api.requestQuest)
            if not ok then self.failures += 1 end
        end
        return self.phase
    end
    self.failures = 0
    local target = self.api.findTarget()
    if not target then
        self.phase = "WAIT_TARGET"
        return self.phase
    end
    self.phase = "ATTACK"
    self.api.attackTarget(target)
    return self.phase
end

return Controller
