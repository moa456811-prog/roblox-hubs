-- Explicit finite-state transitions; no implicit game mechanics assumed.
local State = {}
State.__index = State

function State.new(initial, allowed)
    assert(type(initial) == "string")
    assert(type(allowed) == "table")
    return setmetatable({current = initial, allowed = allowed, history = {}}, State)
end

function State:change(nextState)
    if self.current == nextState then return true end
    local edges = self.allowed[self.current] or {}
    if not edges[nextState] then
        return false, "Illegal transition from " .. self.current .. " to " .. tostring(nextState)
    end
    table.insert(self.history, {from = self.current, to = nextState, time = os.clock()})
    self.current = nextState
    return true
end

return State
