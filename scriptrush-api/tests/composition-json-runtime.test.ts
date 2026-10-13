import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { parseHubComposition } from "../src/lib/hub-spec.ts";
import { renderHubComposition } from "../src/lib/hub-composer.ts";

test("locally recovered complete hub preserves the exact requested renderer output and compiles with Luau", { skip: !process.env.SCRIPTRUSH_TEST_LUAU_COMPILE }, async () => {
  const fixture = await readFile(new URL("./fixtures/composed-utility-hub.json", import.meta.url), "utf8");
  const original = parseHubComposition(fixture);
  const valid = JSON.stringify(original);
  const color = original.window.palette.background;
  const malformed = valid.replace(`"background":${JSON.stringify(color)}`, `"background":[${color.join(" ")}]`);
  assert.notEqual(malformed, valid);
  const recovered = parseHubComposition(malformed);
  assert.deepEqual(recovered, original);
  const script = renderHubComposition(recovered);
  assert.equal(script, renderHubComposition(original));
  const directory = await mkdtemp(join(tmpdir(), "scriptrush-json-compile-"));
  try {
    const path = join(directory, "complete-hub.luau"); await writeFile(path, script);
    execFileSync(process.env.SCRIPTRUSH_TEST_LUAU_COMPILE!, ["--null", path], { timeout: 10000, maxBuffer: 64000, windowsHide: true });
  } finally {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith("scriptrush-json-compile-"));
    await rm(target, { recursive: true, force: true });
  }
});
