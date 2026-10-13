import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseHubComposition, type HubComposition } from "../../../../src/lib/hub-spec.ts";
import type { GenerationContract } from "../../../../src/lib/generation-contract.ts";
import { renderHubComposition, luaString } from "../../../../src/lib/hub-composer.ts";
import { gameAdapterFor, gameplayBindingIssues } from "../../../../src/lib/game-adapters/catalog.ts";
import { luauExecutable, type RuntimeReport } from "../../runtime/run.ts";
export type { RuntimeReport } from "../../runtime/run.ts";

const here=path.dirname(fileURLToPath(import.meta.url));
const api=path.resolve(here,"../../../..");
export type ProductionRuntimeCase={id:string;game:Record<string,unknown>;expected:{composition:HubComposition;contract:GenerationContract}};
export type ProductionRuntimeReport=RuntimeReport & {factory:{passed:boolean;checks:number;failures:string[]};profile:{gameAdapter:string;placeId:string;basis:"source-backed";liveVerified:false}};
function lua(value:unknown):string {
  if(value===null || value===undefined)return "nil";
  if(typeof value==="string")return luaString(value);
  if(typeof value==="number" || typeof value==="boolean")return String(value);
  if(Array.isArray(value))return `{${value.map(lua).join(",")}}`;
  if(typeof value==="object")return `{${Object.entries(value).map(([key,item])=>`[${luaString(key)}]=${lua(item)}`).join(",")}}`;
  throw new Error("Unsupported production fixture value");
}
export function runProductionRuntime(row:ProductionRuntimeCase,candidate:HubComposition,options:{directory?:string;tag?:string;timeoutMs?:number}={}):ProductionRuntimeReport {
  const start=performance.now();
  candidate=parseHubComposition(JSON.stringify(candidate));
  const expected=parseHubComposition(JSON.stringify(row.expected.composition));
  const pack=gameAdapterFor(row.game);
  if(!pack || pack.id!=="blox-fruits")throw new Error("No audited Blox Fruits adapter matches the exact production profile");
  const bindingIssues=gameplayBindingIssues(candidate,row.expected.contract,pack);
  const source=renderHubComposition(candidate,{gameplayFactory:pack.factory});
  if(source.length>200_000)throw new Error("Production candidate exceeds isolated QA source limit");
  const directory=options.directory || path.join(api,"test-results/specialist-v2/production/runtime");
  const tag=(options.tag || row.id).replace(/[^A-Za-z0-9_.-]/g,"-");
  mkdirSync(directory,{recursive:true});
  const sourceFile=path.join(directory,tag+".lua");
  writeFileSync(sourceFile,source+"\n");
  const base=readFileSync(path.join(api,"tests/runtime/mock-roblox.luau"),"utf8");
  const mock=readFileSync(path.join(api,"tests/runtime/game-adapter-mock.luau"),"utf8");
  const hardening=readFileSync(path.join(here,"sandbox.luau"),"utf8");
  function execute(mode:string,code:string,assertions:string,locals:string="") {
    const file=path.join(directory,`${tag}.${mode}.luau`);
    writeFileSync(file,`${base}\n${mock}\n${hardening}\nlocal __mode=${luaString(mode)}\n${locals}\nlocal __candidate,__compileError=loadstring(${luaString(code)},"@isolated-production-${mode}")\nif not __candidate then\nprint("PRODUCTION_RUNTIME "..__json({passed=false,checks={},failures={"Candidate failed to compile in isolated chunk"},runtimeErrors={tostring(__compileError)}}))\nelse\nsetfenv(__candidate,__sandbox)\n${assertions}\nend\n`);
    const result=spawnSync(luauExecutable(),[file],{cwd:directory,encoding:"utf8",timeout:options.timeoutMs??6_000,killSignal:"SIGKILL",windowsHide:true,maxBuffer:2_000_000,
      env:Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])) as NodeJS.ProcessEnv});
    const error=result.error as NodeJS.ErrnoException | undefined;
    if(error?.code==="ENOENT")throw new Error("Official Luau CLI is unavailable");
    const marker=result.stdout?.split(/\r?\n/).findLast(line=>line.startsWith("PRODUCTION_RUNTIME ") || line.startsWith("GAME_ADAPTER_QA_RESULT "));
    return marker ? JSON.parse(marker.slice(marker.indexOf(" ")+1)) : {passed:false,checks:[],failures:[error?.code==="ETIMEDOUT" ? "Production candidate exceeded execution timeout" : "Production runtime did not finish"],runtimeErrors:[result.stderr?.trim() || error?.message || "No result marker"]};
  }
  // Preserve the complete existing factory suite, independently compiled with
  // the same closed sandbox. Passing it cannot substitute for generated UI tests.
  const factory=execute("factory","return "+pack.factory,readFileSync(path.join(api,"tests/runtime/game-adapter-assertions.luau"),"utf8"));
  const bindings:Record<string,unknown>={};
  for(const page of expected.pages)for(const item of page.items)for(const feature of item.featureIds){
    // Text can annotate an implemented feature without acting as another control.
    const matches=candidate.pages.flatMap(actualPage=>actualPage.items.filter(actual=>(actual.kind==="button" || actual.kind==="number" || actual.kind==="toggle") && actual.featureIds.includes(feature)).map(actual=>({itemId:actual.id,pageId:actualPage.id,pageLabel:actualPage.label})));
    bindings[feature]={...matches[0],count:matches.length,expected:item,expectedPage:page.label};
  }
  const pages=expected.pages.map(page=>({label:page.label,id:candidate.pages.find(actual=>actual.label===page.label)?.id}));
  const rendered=execute("full-hub",source,readFileSync(path.join(here,"assertions.luau"),"utf8"),`local __expected=${lua(expected)}\nlocal __bindings=${lua(bindings)}\nlocal __expectedPages=${lua(pages)}\nlocal __placeId=${Number(row.game.placeId)}\n`);
  const factoryChecks=(factory.checks || []).map((check:{name:string;passed:boolean;detail:string})=>({...check,name:"audited controller: "+check.name}));
  const staticChecks=bindingIssues.map(issue=>({name:"gameplay profile binding",passed:false,detail:issue}));
  const report:ProductionRuntimeReport={...rendered,id:row.id,passed:factory.passed && rendered.passed && bindingIssues.length===0,
    checks:[...factoryChecks,...rendered.checks,...staticChecks],failures:[...factory.failures.map((failure:string)=>"audited controller: "+failure),...rendered.failures,...bindingIssues],runtimeErrors:[...factory.runtimeErrors,...rendered.runtimeErrors],
    durationMs:Math.round(performance.now()-start),sourceFile,sourceSha256:createHash("sha256").update(source).digest("hex"),interpreter:"Official Luau CLI (tested with 0.742)",
    factory:{passed:factory.passed,checks:factoryChecks.length,failures:factory.failures},profile:{gameAdapter:pack.id,placeId:String(row.game.placeId),basis:"source-backed",liveVerified:false},
    execution:"Actual generated composition and audited controller run in separate closed source-backed Blox Fruits fixtures; no live Roblox connection",
    limitations:["Checks model control wiring and exact requested UI, plus audited controller progress, lifecycle, bounded retries and admission against simulated fixtures.","Does not establish live server acceptance, engine rendering, combat damage delivery, physics pickup, path reachability or anti-cheat behavior.","Only the exact catalog Blox Fruits PlaceId/universe binding is admitted. This does not validate another game.","Each of the controller and generated-hub processes has a separate six-second deadline and minimal environment without API credentials."]};
  writeFileSync(path.join(directory,tag+".runtime.json"),JSON.stringify(report,null,2)+"\n");
  return report;
}
