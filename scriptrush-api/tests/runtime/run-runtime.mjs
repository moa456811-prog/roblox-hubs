import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.resolve(here, "../../test-results/runtime");
const [candidateArgument, scenario = "full-hub", outputArgument] = process.argv.slice(2);
if (!candidateArgument || !["full-hub", "preset-hub", "english-ui", "translated-ui", "french-ui"].includes(scenario)) {
  console.error("Usage: node tests/runtime/run-runtime.mjs <candidate.lua> [full-hub|preset-hub|english-ui|translated-ui|french-ui] [result.json]\nSet LUAU_BIN to the official Luau CLI executable (tested with 0.742).");
  process.exit(2);
}
const candidate = path.resolve(candidateArgument);
const source = await readFile(candidate, "utf8");
if (source.length > 200_000) throw new Error("Candidate exceeds this isolated QA harness's source limit.");
const prelude = await readFile(path.join(here, "mock-roblox.luau"), "utf8");
const assertions = await readFile(path.join(here, "assertions.luau"), "utf8");
const wrapper = `${prelude}\nlocal __scenario = ${JSON.stringify(scenario)}\nlocal function __candidate()\n${source}\nend\nsetfenv(__candidate, __sandbox)\n${assertions}\n`;
const workingDirectory = path.join(artifactDirectory, "runs");
await mkdir(workingDirectory, { recursive: true });
const runner = path.join(workingDirectory, `${path.basename(candidate).replace(/[^A-Za-z0-9_.-]/g, "-")}-${scenario}.luau`);
await writeFile(runner, wrapper);
const localQaExecutable = path.resolve(here, "../../../scriptrush-proxy/test-results/full-hub/tools/luau-0.742/" + (process.platform === "win32" ? "luau.exe" : "luau"));
const executable = process.env.LUAU_BIN || (existsSync(localQaExecutable) ? localQaExecutable : "luau");
const started = performance.now();
// Only a closed Roblox mock and a small whitelist of pure Luau functions are
// exposed to generated code. It has no require, IO, networking, real Roblox,
// loadstring, getfenv, metatable/reflection access, or OS API. The process is
// bounded even if a source contains an infinite loop.
const result = spawnSync(executable, [runner], {
  cwd: workingDirectory,
  encoding: "utf8",
  timeout: 6_000,
  killSignal: "SIGKILL",
  maxBuffer: 2_000_000,
  windowsHide: true,
  // The interpreter does not need application/provider secrets. Keep only the
  // minimal OS search/runtime environment, including for a PATH-installed CLI.
  env: Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
});
if (result.error?.code === "ENOENT") throw new Error("Luau CLI was not found. Install the official Luau 0.742 release and set LUAU_BIN to its executable path. This optional QA task never downloads or installs binaries.");
const marker = result.stdout?.split(/\r?\n/).findLast(line => line.startsWith("QA_RESULT "));
let report;
if (marker) {
  report = JSON.parse(marker.slice("QA_RESULT ".length));
} else {
  report = {
    passed: false,
    checks: [],
    failures: [result.error?.code === "ETIMEDOUT" ? "Generated code exceeded the 6-second execution limit." : "The isolated Luau mock did not complete."],
    runtimeErrors: [result.stderr?.trim() || result.error?.message || "No result marker returned"],
  };
}
Object.assign(report, {
  candidate,
  scenario,
  durationMs: Math.round(performance.now() - started),
  interpreter: "Luau CLI (tested with official 0.742)",
  execution: "Isolated mocked Roblox APIs; no real Studio/client execution",
  limitations: [
    "Verifies runtime control flow, values, connections, requested relative geometry and interaction in a pure mock.",
    "Does not verify engine rendering, font glyph metrics, Roblox service availability, or actual teleport/server behavior.",
  ],
});
const output = path.resolve(outputArgument || path.join(artifactDirectory, path.basename(candidate) + "." + scenario + ".runtime.json"));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, ...report }, null, 2));
process.exitCode = report.passed ? 0 : 1;
