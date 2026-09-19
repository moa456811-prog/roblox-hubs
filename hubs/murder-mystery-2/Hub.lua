local B="https://raw.githubusercontent.com/moa456811-prog/roblox-hubs/main/hubs/murder-mystery-2/payload-v18/"
local P={"part_00.txt","part_01.txt","part_02.txt","part_03.txt","part_04.txt","part_05.txt","part_06.txt","part_07.txt","part_08.txt","part_09.txt","part_10.txt","part_11.txt"}
local Q="?cb="..tostring(DateTime.now().UnixTimestampMillis)
local S=""
for _,N in ipairs(P) do
    S=S..game:HttpGet(B..N..Q)
end
local A="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local M={}
for i=1,#A do M[string.byte(A,i)]=i-1 end
local O={}
local p=1
while p<=#S do
    local a=string.byte(S,p)
    local b=string.byte(S,p+1)
    local c=string.byte(S,p+2)
    local d=string.byte(S,p+3)
    local x=M[a] or 0
    local y=M[b] or 0
    local z=(c==61) and nil or (M[c] or 0)
    local w=(d==61) and nil or (M[d] or 0)
    local n=x*262144+y*4096+(z or 0)*64+(w or 0)
    O[#O+1]=string.char(bit32.bxor(math.floor(n/65536)%256,73))
    if z then O[#O+1]=string.char(bit32.bxor(math.floor(n/256)%256,73)) end
    if w then O[#O+1]=string.char(bit32.bxor(n%256,73)) end
    p=p+4
end
local F,E=loadstring(table.concat(O))
if not F then error("A7DEV COMPILE: "..tostring(E)) end
return F()
