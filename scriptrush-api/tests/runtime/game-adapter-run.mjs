import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here=path.dirname(fileURLToPath(import.meta.url));
const [candidateArgument,mode="factory",outputArgument]=process.argv.slice(2);
if(!candidateArgument || !["factory","full-hub"].includes(mode)) {
  console.error("Usage: node --experimental-strip-types tests/runtime/game-adapter-run.mjs <runtime.ts|factory.lua|hub.lua> [factory|full-hub] [report.json]");
  process.exit(2);
}
const candidate=path.resolve(candidateArgument);
let source;
if(mode==="factory" && /\.[cm]?ts$/.test(candidate)) {
  const module=await import(pathToFileURL(candidate).href);
  source=module.BLOX_FRUITS_RUNTIME_FACTORY;
  if(typeof source!=="string") throw new Error("Factory module must export BLOX_FRUITS_RUNTIME_FACTORY as a Luau expression string.");
} else source=await readFile(candidate,"utf8");
if(source.length>200_000) throw new Error("Candidate source exceeds isolated QA limit.");
const [base,mock,assertions]=await Promise.all([
  readFile(path.join(here,"mock-roblox.luau"),"utf8"),
  readFile(path.join(here,"game-adapter-mock.luau"),"utf8"),
  readFile(path.join(here,"game-adapter-assertions.luau"),"utf8"),
]);
const wrapper=`${base}\n${mock}\nlocal __mode=${JSON.stringify(mode)}\nlocal function __candidate()\n${mode==="factory"?"return ":""}${source}\nend\nsetfenv(__candidate,__sandbox)\n${assertions}\n`;
const directory=path.resolve(here,"../../test-results/game-adapter-runtime");
await mkdir(directory,{recursive:true});
const runner=path.join(directory,`${path.basename(candidate).replace(/[^A-Za-z0-9_.-]/g,"-")}-${mode}.luau`);
await writeFile(runner,wrapper);
const bundled=path.resolve(here,"../../../scriptrush-proxy/test-results/full-hub/tools/luau-0.742/"+(process.platform==="win32"?"luau.exe":"luau"));
const executable=process.env.LUAU_BIN || (existsSync(bundled)?bundled:"luau");
const started=performance.now();
const result=spawnSync(executable,[runner],{
  cwd:directory,encoding:"utf8",timeout:6_000,killSignal:"SIGKILL",maxBuffer:2_000_000,windowsHide:true,
  env:Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])),
});
if(result.error?.code==="ENOENT") throw new Error("Luau CLI unavailable; set LUAU_BIN. This runner never downloads or installs software.");
const marker=result.stdout?.split(/\r?\n/).findLast(line=>line.startsWith("GAME_ADAPTER_QA_RESULT "));
const report=marker?JSON.parse(marker.slice("GAME_ADAPTER_QA_RESULT ".length)):{passed:false,checks:[],failures:[result.error?.code==="ETIMEDOUT"?"Candidate exceeded the 6-second limit":"Closed game-adapter QA did not complete"],runtimeErrors:[result.stderr?.trim() || result.error?.message || "No result marker"]};
Object.assign(report,{
  candidate,mode,durationMs:Math.round(performance.now()-started),
  execution:"Closed deterministic Luau mocks; simulated source-backed Blox Fruits data",
  limitations:["Checks actual factory and UI dispatch control flow against admitted fixtures only.","Does not establish live Blox Fruits compatibility, server acceptance, path reachability, physics pickup, rendering or anti-cheat behavior.","Fixture require accepts only explicit inert ModuleScript data; no remote source is executed."],
});
const output=path.resolve(outputArgument || path.join(directory,path.basename(candidate)+"."+mode+".json"));
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({output,...report},null,2));
process.exitCode=report.passed?0:1;
