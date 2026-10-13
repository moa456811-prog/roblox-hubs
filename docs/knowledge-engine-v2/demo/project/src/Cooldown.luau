local Cooldown = {}
Cooldown.__index = Cooldown
function Cooldown.new(duration, clock)
    assert(type(duration) == 'number' and duration >= 0, 'Invalid duration')
    return setmetatable({ duration = duration, clock = clock, deadline = 0 }, Cooldown)
end
function Cooldown:Ready() return self.clock() >= self.deadline end
function Cooldown:Start() self.deadline = self.clock() + self.duration end
function Cooldown:Remaining() return math.max(0, self.deadline - self.clock()) end
return Cooldown
