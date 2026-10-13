-- Runs a callable at most 'attempts' times. All failures remain visible.
local Retry = {}

function Retry.run(callback, attempts, delay, sleep)
    assert(type(callback) == "function")
    assert(type(attempts) == "number" and attempts >= 1 and attempts <= 20)
    assert(type(delay) == "number" and delay >= 0 and delay <= 60)
    local waitFn = sleep or task.wait
    local lastError
    for i = 1, attempts do
        local ok, result = pcall(callback, i)
        if ok then return true, result, i end
        lastError = result
        if i < attempts and delay > 0 then waitFn(delay * i) end
    end
    return false, lastError, attempts
end

return Retry
