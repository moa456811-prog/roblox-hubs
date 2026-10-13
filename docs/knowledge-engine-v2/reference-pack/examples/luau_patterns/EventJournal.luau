-- Bounded read-only event timeline; never records player tokens or credentials.
local Journal = {}
Journal.__index = Journal

function Journal.new(capacity)
    assert(type(capacity) == "number" and capacity >= 1 and capacity <= 2000)
    return setmetatable({capacity = math.floor(capacity), records = {}}, Journal)
end

function Journal:add(category, outcome, detail)
    local records = self.records
    table.insert(records, {
        at = os.clock(), category = tostring(category):sub(1, 50),
        outcome = tostring(outcome):sub(1, 50), detail = tostring(detail or ""):sub(1, 400),
    })
    if #records > self.capacity then table.remove(records, 1) end
end

function Journal:copy()
    local result = {}
    for _, record in ipairs(self.records) do table.insert(result, table.clone(record)) end
    return result
end

return Journal
