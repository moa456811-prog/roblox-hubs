/** Trusted closed simulation; no IO/network/OS/host modules in candidate Lua. */
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) process.exit(2);
const project = JSON.parse(await readFile(inputPath, "utf8"));
const source = new Map(project.files.map(file => [file.path, file.content]));
const base = { fileHashes: project.fileHashes, executed: false, assertions: [], scope: "Cooldown and local character lifecycle simulation; no live game mechanics." };
if (!source.has("src/Cooldown.luau") || !source.has("src/main.client.luau")) {
  await writeFile(outputPath, JSON.stringify({ ...base, reason: "suite_not_applicable" })); process.exit(0);
}
const nonce = randomUUID().replaceAll("-", "");
const quote = value => '"' + [...new TextEncoder().encode(value)].map(byte => byte === 34 ? '\\"' : byte === 92 ? '\\\\' : byte < 32 || byte > 126 ? "\\" + String(byte).padStart(3, "0") : String.fromCharCode(byte)).join("") + '"';
const fixture = `
local now, messages, assertions = 0, {}, {}
local function check(name, result) table.insert(assertions, {name=name, passed=result == true}) end
local function library(value) local copy = {} for k,v in pairs(value) do copy[k]=v end return table.freeze(copy) end
local handlers = {}
local signal = {Connect=function(_,callback)
 local connection={Connected=true}; function connection:Disconnect() self.Connected=false end
 table.insert(handlers,{callback=callback,connection=connection}); return connection
end}
local player={Character={},CharacterAdded=signal}
local services={Players={LocalPlayer=player}}
local gameMock={GetService=function(_,name) assert(services[name],"service outside closed mock"); return services[name] end}
local files={ ["src/Cooldown.luau"]=${quote(source.get("src/Cooldown.luau"))}, ["src/main.client.luau"]=${quote(source.get("src/main.client.luau"))} }
local cache={}
local loadModule
loadModule=function(path)
 if cache[path]~=nil then return cache[path] end
 assert(files[path],"module outside closed project")
 local callback,err=loadstring(files[path],path); assert(callback,err)
 local env={assert=assert,error=error,pairs=pairs,ipairs=ipairs,next=next,select=select,type=type,typeof=typeof,tostring=tostring,tonumber=tonumber,pcall=pcall,xpcall=xpcall,setmetatable=setmetatable,
 math=library(math),table=library(table),string=library(string),utf8=library(utf8),os=table.freeze({clock=function() return now end}),
 print=function(...) table.insert(messages,{...}) end,game=gameMock,script=table.freeze({Parent=table.freeze({Cooldown="src/Cooldown.luau"})}),require=function(key) return loadModule(key) end}
 setfenv(callback,env); local value=callback(); cache[path]=value; return value
end
local ok,err=pcall(function()
 local Cooldown=loadModule("src/Cooldown.luau")
 local gate=Cooldown.new(2,function() return now end)
 check("cooldown starts ready",gate:Ready())
 gate:Start(); check("start blocks immediate repeat",not gate:Ready())
 now=1; check("remaining time follows injected clock",gate:Remaining()==1)
 now=2; check("cooldown becomes ready at the deadline",gate:Ready())
 local application=loadModule("src/main.client.luau")
 check("current character is handled",#messages==1)
 now=5; for _,h in ipairs(handlers) do if h.connection.Connected then h.callback({}) end end
 check("character replacement is handled",#messages==2)
 application.Stop()
 local disconnected=true; for _,h in ipairs(handlers) do disconnected=disconnected and not h.connection.Connected end
 check("Stop disconnects every retained character listener",disconnected)
 now=9; for _,h in ipairs(handlers) do if h.connection.Connected then h.callback({}) end end
 check("stopped application produces no further effects",#messages==2)
end)
if not ok then check("candidate completed the closed scenario",false) end
print("__PROJECT_${nonce}__")
for _,a in ipairs(assertions) do print(a.passed and "PASS" or "FAIL",a.name) end
`;
const directory = await mkdtemp(join(tmpdir(), "scriptrush-mock-"));
try {
  const file = join(directory, "scenario.luau"); await writeFile(file, fixture, { mode: 0o600 });
  const result = await new Promise(done => {
    let launched = false;
    const child = execFile(process.env.SCRIPTRUSH_LUAU_RUNNER || "luau", [file], { timeout: 6000, maxBuffer: 64000, windowsHide: true }, (error, stdout) => done({ error, stdout, launched }));
    child.once("spawn", () => { launched = true; });
  });
  const marker = `__PROJECT_${nonce}__`, at = result.stdout.indexOf(marker);
  const assertions = at < 0 ? [] : result.stdout.slice(at + marker.length).trim().split(/\r?\n/).filter(Boolean).map(line => ({ name: line.replace(/^(?:PASS|FAIL)\s+/, ""), passed: line.startsWith("PASS\t") || line.startsWith("PASS ") }));
  if (result.error && result.launched) assertions.push({ name: "bounded Luau process completed", passed: false });
  await writeFile(outputPath, JSON.stringify({ ...base, executed: result.launched && assertions.length > 0, reason: !result.launched ? "runner_not_available" : undefined, assertions }));
} finally {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("scriptrush-mock-")) throw new Error("Unexpected owned mock directory");
  await rm(target, { recursive: true, force: true });
}
