local ENV=(getgenv and getgenv()) or _G
ENV.A7DEV_COMPAT_GAME="murder-mystery-2"
local U="https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/Loader.lua".."?legacy="..tostring(DateTime.now().UnixTimestampMillis)
local source=game:HttpGet(U,true)
local fn,err=loadstring(source)
if not fn then
    error("[A7DEV LEGACY] Loader compile error: "..tostring(err),0)
end
return fn()
