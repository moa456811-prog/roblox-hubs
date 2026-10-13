-- Verify observable counters (inventory, quest progress). No server claims.
local Delta = {}
function Delta.compare(before, after, expectedMinChange)
    if type(before) ~= "number" or type(after) ~= "number" then
        return {status = "unknown", reason = "Missing numeric evidence"}
    end
    local threshold = expectedMinChange or 1
    assert(type(threshold) == "number" and threshold >= 0)
    local actual = after - before
    if actual >= threshold then
        return {status = "observed_increase", change = actual}
    end
    return {status = "not_confirmed", change = actual}
end
return Delta
