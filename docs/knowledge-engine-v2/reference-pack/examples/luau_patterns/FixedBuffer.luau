-- Store only the latest N events; bounded memory cost.
local Buffer = {}
Buffer.__index = Buffer

function Buffer.new(capacity)
    assert(type(capacity) == "number" and capacity >= 1 and capacity <= 10000)
    return setmetatable({items = {}, head = 0, size = 0, capacity = math.floor(capacity)}, Buffer)
end

function Buffer:push(value)
    self.head = self.head % self.capacity + 1
    self.items[self.head] = value
    self.size = math.min(self.capacity, self.size + 1)
end

function Buffer:values()
    local out = {}
    for i = 1, self.size do
        local index = (self.head - self.size + i - 1) % self.capacity + 1
        table.insert(out, self.items[index])
    end
    return out
end

return Buffer
