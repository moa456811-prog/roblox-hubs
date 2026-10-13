/** Execute actual rendered callbacks in a closed Luau process. Never a live client. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseHubComposition, type HubComposition } from "../../../src/lib/hub-spec.ts";
import { luaString, renderHubComposition } from "../../../src/lib/hub-composer.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(here, "../../..");
const artifacts = path.join(api, "test-results/specialist-v2/runtime");
export type RuntimeCase = {
  id: string;
  messages: Array<{role:string;content:string}>;
  expected: {composition:HubComposition};
};
export type RuntimeCheck = { name:string; passed:boolean; detail:string };
export type RuntimeReport = {
  id:string; passed:boolean; checks:RuntimeCheck[]; failures:string[]; runtimeErrors:string[];
  durationMs:number; interpreter:string; execution:string; limitations:string[];
  sourceSha256:string; sourceFile:string; observations?:Record<string,unknown>;
};
function lua(value:unknown):string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return luaString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `{${value.map(lua).join(",")}}`;
  if (typeof value === "object") return `{${Object.entries(value).map(([key,entry])=>`[${luaString(key)}]=${lua(entry)}`).join(",")}}`;
  throw new Error("Unsupported fixture value");
}
function fixture(row:RuntimeCase):unknown {
  const user=row.messages.findLast(message=>message.role === "user");
  if (!user) throw new Error(`No user game evidence in ${row.id}`);
  const evidence=JSON.parse(user.content).gameEvidence;
  if (!evidence || !Array.isArray(evidence.objects) || !Array.isArray(evidence.attributes)) throw new Error(`Missing owned gameEvidence in ${row.id}`);
  return evidence;
}
export function luauExecutable():string {
  const bundled=path.resolve(api,"../scriptrush-proxy/test-results/full-hub/tools/luau-0.742/"+(process.platform === "win32" ? "luau.exe":"luau"));
  return process.env.LUAU_BIN || (existsSync(bundled) ? bundled : "luau");
}
export function runRuntime(row:RuntimeCase, candidate:HubComposition, options:{directory?:string;tag?:string;timeoutMs?:number}={}):RuntimeReport {
  candidate=parseHubComposition(JSON.stringify(candidate));
  const expected=parseHubComposition(JSON.stringify(row.expected.composition));
  const source=renderHubComposition(candidate);
  if (source.length>200_000) throw new Error("Rendered candidate exceeds closed QA source limit");
  const safeTag=(options.tag || row.id).replace(/[^A-Za-z0-9_.-]/g,"-");
  const directory=options.directory || artifacts;
  mkdirSync(directory,{recursive:true});
  const sourceFile=path.join(directory,`${safeTag}.lua`);
  const runner=path.join(directory,`${safeTag}.runtime.luau`);
  writeFileSync(sourceFile,source+"\n");
  const binding:Record<string,unknown>={};
  for (const page of expected.pages) for (const wanted of page.items) for (const feature of wanted.featureIds) {
    const matches=candidate.pages.flatMap(actualPage=>actualPage.items.filter(item=>item.featureIds.includes(feature)).map(item=>({itemId:item.id,pageId:actualPage.id})));
    binding[feature]={...matches[0],count:matches.length,expected:wanted,pageLabel:page.label};
  }
  const pages=expected.pages.map(page=>({label:page.label,id:candidate.pages.find(actual=>actual.label===page.label)?.id}));
  const prelude=readFileSync(path.join(api,"tests/runtime/mock-roblox.luau"),"utf8");
  const extension=readFileSync(path.join(here,"fixture.luau"),"utf8");
  const assertions=readFileSync(path.join(here,"assertions.luau"),"utf8");
  // A separately compiled chunk has no lexical access to host locals. setfenv
  // alone would not hide captured locals in an interpolated function body.
  // loadstring is a host-only capability and is absent from __sandbox.
  writeFileSync(runner,`${prelude}\nlocal __fixture=${lua(fixture(row))}\n${extension}\nlocal __expected=${lua(expected)}\nlocal __bindings=${lua(binding)}\nlocal __expectedPages=${lua(pages)}\nlocal __candidate,__compileError=loadstring(${luaString(source)},"@isolated-generated-hub")\nif not __candidate then\nprint("SPECIALIST_RUNTIME "..__json({passed=false,checks={},failures={"Candidate source failed to compile in isolated chunk"},runtimeErrors={tostring(__compileError)}}))\nelse\nsetfenv(__candidate,__sandbox)\n${assertions}\nend\n`);
  const start=performance.now();
  const result=spawnSync(luauExecutable(),[runner],{cwd:directory,encoding:"utf8",timeout:options.timeoutMs??6_000,killSignal:"SIGKILL",windowsHide:true,maxBuffer:2_000_000,
    env:Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])) as NodeJS.ProcessEnv});
  const processError=result.error as NodeJS.ErrnoException | undefined;
  if (processError?.code === "ENOENT") throw new Error("Official Luau CLI not found; set LUAU_BIN to its existing executable");
  const marker=result.stdout?.split(/\r?\n/).findLast(line=>line.startsWith("SPECIALIST_RUNTIME "));
  const parsed=marker ? JSON.parse(marker.slice("SPECIALIST_RUNTIME ".length)) : {
    passed:false,checks:[],failures:[processError?.code === "ETIMEDOUT" ? "Execution exceeded timeout" : "Closed mock did not complete"],runtimeErrors:[result.stderr?.trim() || processError?.message || "No runtime report"]};
  const report:RuntimeReport={...parsed,id:row.id,durationMs:Math.round(performance.now()-start),sourceFile,sourceSha256:createHash("sha256").update(source).digest("hex"),
    interpreter:"Official Luau CLI (tested with 0.742)",execution:"Isolated owned fictional Roblox fixture; no live game, network, filesystem or OS API in candidate sandbox",
    limitations:["Checks actual handler control flow, local property changes, notifications, fixture lookup, GUI state and lifecycle in a finite mock.","Does not validate real Roblox engine rendering, glyph metrics, teleport delivery, permissions or behavior in another game.","Only the 11 explicitly supported fixture feature types are runtime assessed; unknown feature types fail this gate."]};
  writeFileSync(path.join(directory,`${safeTag}.runtime.json`),JSON.stringify(report,null,2)+"\n");
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [casesFile,predictionsFile,outputFile]=process.argv.slice(2);
  if (!casesFile || !predictionsFile || !outputFile) throw new Error("Usage: node --experimental-strip-types experiments/specialist-v2/runtime/run.ts <cases.jsonl> <predictions.jsonl> <report.json>");
  const rows=readFileSync(casesFile,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as RuntimeCase);
  const predictions=readFileSync(predictionsFile,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const reports:Array<Partial<RuntimeReport> & {id:string;variant:string;passed:boolean;failures:string[];schemaAccepted?:boolean}>=predictions.map(prediction=>{
    const row=rows.find(row=>row.id===prediction.id);
    if (!row) throw new Error(`Unknown predicted case ${prediction.id}`);
    try { return {...runRuntime(row,parseHubComposition(prediction.output),{tag:`${prediction.variant}-${row.id}`}),variant:prediction.variant}; }
    catch(error) { return {id:row.id,variant:prediction.variant,passed:false,checks:[],failures:[error instanceof Error ? error.message : "Invalid candidate"],runtimeErrors:[],schemaAccepted:false}; }
  });
  const missing=rows.flatMap(row=>["base","specialist"].filter(variant=>!predictions.some(prediction=>prediction.id===row.id && prediction.variant===variant)).map(variant=>({id:row.id,variant,passed:false,checks:[],failures:["Missing candidate"],runtimeErrors:[]})));
  reports.push(...missing);
  const summary=Object.fromEntries(["base","specialist"].map(variant=>{const results=reports.filter(report=>report.variant===variant);return [variant,{cases:results.length,passed:results.filter(report=>report.passed).length}];}));
  mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});
  writeFileSync(outputFile,JSON.stringify({scope:"Closed fictional fixture execution, not live Roblox certification",summary,reports},null,2)+"\n");
  console.log(JSON.stringify({output:path.resolve(outputFile),summary}));
}
