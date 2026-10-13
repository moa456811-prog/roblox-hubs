-- Track observed boss state only; do not fabricate a respawn time.
local Tracker = {}
Tracker.__index = Tracker

function Tracker.new(clockFn)
    return setmetatable({clock = clockFn or os.clock, bosses = {}}, Tracker)
end

function Tracker:seen(id, alive)
    local key = tostring(id)
    local item = self.bosses[key] or {timesSeen = 0}
    item.timesSeen += 1
    item.lastSeenAt = self.clock()
    if item.alive and alive == false then item.lastDeathObservedAt = item.lastSeenAt end
    item.alive = alive
    self.bosses[key] = item
end

function Tracker:info(id)
    local item = self.bosses[tostring(id)]
    if not item then return nil end
    return table.clone(item)
end

return Tracker
