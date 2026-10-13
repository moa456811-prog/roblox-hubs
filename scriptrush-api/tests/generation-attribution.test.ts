import assert from "node:assert/strict";
import test from "node:test";
import { retainGenerationAttributions } from "../src/lib/generation-attribution.ts";
import { MIT_LICENSE_BODY } from "../src/lib/knowledge-v2/ingest.ts";

const notice = `MIT License\nCopyright (c) 2026 Synthetic Test\n${MIT_LICENSE_BODY}`;
const attribution = { sourceId: "synthetic-licensed-reference", url: "https://github.com/example/reference/blob/" + "a".repeat(40) + "/LICENSE", revision: "a".repeat(40), licenseText: notice };

test("complete licensed notices survive a model that drops all attribution", () => {
  const script = 'local x = 1\nprint(x)';
  const result = retainGenerationAttributions(script, [attribution, attribution]);
  assert.ok(result.startsWith(script + "\n\n"));
  const lines = result.slice(script.length).trim().split("\n");
  assert.ok(lines.every(line => line.startsWith("-- ")));
  assert.ok(result.includes(notice.split("\n").map(line => "-- " + line).join("\n")));
  assert.equal(result.split("Reference licence notice").length, 2);
  assert.equal(retainGenerationAttributions(script, []), script);
});

test("notice delimiters and carriage returns cannot escape line comments", () => {
  const result = retainGenerationAttributions('print("original")', [{ ...attribution, licenseText: notice.replace('Synthetic Test', 'Synthetic Test ]] print("not executable") --[[').replace('Permission is', 'Permission\ris') }]);
  const appended = result.slice(result.indexOf("\n\n") + 2);
  assert.equal(appended.includes("\r"), false);
  assert.ok(appended.trim().split("\n").every(line => line.startsWith("-- ")));
});

test("invalid attribution is rejected instead of emitting a stripped or unsafe notice", () => {
  for (const reference of [{ ...attribution, licenseText: "MIT" }, { ...attribution, revision: "main" }, { ...attribution, url: "http://example.com" }, { ...attribution, sourceId: "bad\rprint(1)" }, { ...attribution, licenseText: notice + "\u0000" }]) assert.throws(() => retainGenerationAttributions("print(1)", [reference]), /INVALID_GENERATION_ATTRIBUTION/);
  assert.throws(() => retainGenerationAttributions("print(1)", Array(13).fill(attribution)), /GENERATION_ATTRIBUTION_LIMIT/);
});
