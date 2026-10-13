-- Generic local pacing utility, not a way to override server cooldowns.
local Gate = {}
Gate.__index = Gate

function Gate.new(clockFn)
    return setmetatable({clock = clockFn or os.clock, nextAt = {}}, Gate)
end

function Gate:allow(key, seconds)
    assert(type(key) == "string", "key must be a string")
    assert(type(seconds) == "number" and seconds >= 0, "seconds must be nonnegative")
    local now = self.clock()
    if now < (self.nextAt[key] or 0) then
        return false, (self.nextAt[key] - now)
    end
    self.nextAt[key] = now + seconds
    return true, 0
end

function Gate:reset(key)
    if key == nil then self.nextAt = {} else self.nextAt[key] = nil end
end

return Gate
