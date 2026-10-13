-- No reflection/raw instance access, while the audited controller can require
-- only the explicit inert ModuleScript fixtures admitted by the original mock.
local function __guard(value)
    assert(type(value)~="table" or getmetatable(value)~=__instanceMt,"Raw mock Instance access is unavailable")
end
__instanceMt.__iter=function() error("Raw mock Instance access is unavailable",2) end
__sandbox.pairs=function(value) __guard(value);return pairs(value) end
__sandbox.ipairs=function(value) __guard(value);return ipairs(value) end
__sandbox.next=function(value,key) __guard(value);return next(value,key) end
local __closedTable=table.clone(table)
for key,callback in pairs(__closedTable) do
    if type(callback)=="function" then __closedTable[key]=function(...)
        -- Instances may be values in a normal list (insert/find/pack). Only
        -- prohibit using an Instance itself as the table being inspected.
        if key~="pack" and key~="create" then __guard(select(1,...)) end
        if key=="move" and select("#",...)>=5 then __guard(select(5,...)) end
        return callback(...)
    end end
end
__sandbox.table=table.freeze(__closedTable)
__sandbox.setmetatable=function(value,meta)
    assert(type(value)=="table" and getmetatable(value)==nil,"Only a fresh plain table can receive a metatable")
    return setmetatable(value,meta)
end
Enum.Font.Ubuntu={Name="Ubuntu",EnumType="Font"}
