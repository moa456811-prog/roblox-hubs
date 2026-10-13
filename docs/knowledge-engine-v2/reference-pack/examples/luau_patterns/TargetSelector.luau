-- Generic selection over observed target records supplied by an adapter.
local Selector = {}

function Selector.best(candidates)
    local chosen
    local chosenDist = math.huge
    for _, item in ipairs(candidates) do
        if item.isAlive == true and item.eligible == true
            and type(item.distance) == "number" and item.distance >= 0
            and item.distance < chosenDist then
            chosenDist = item.distance
            chosen = item
        end
    end
    return chosen
end

return Selector
