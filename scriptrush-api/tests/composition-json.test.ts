import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSITION_JSON_LIMITS, parseCompositionJson } from "../src/lib/composition-json.ts";
import { parseHubComposition, validateCompositionCoverage, type HubComposition } from "../src/lib/hub-spec.ts";

const spec = (): HubComposition => ({
  window: {
    title: "My exact title", width: 480, height: 360, radius: 12, draggable: true, navigation: "none", font: "Gotham", textSize: 14,
    closeLabel: "Close", minimizeLabel: null, restoreLabel: "Restore", featureIds: [], alternatePalette: null,
    palette: { background: [18, 24, 42], foreground: [240, 245, 255], accent: [85, 221, 255], control: [30, 43, 68], muted: [175, 191, 213] },
  },
  pages: [{ id: "main", label: "Main", featureIds: [], items: [{ id: "content", featureIds: [], kind: "text", text: "Preserve every page and value" }] }],
});

test("strict JSON and its exact decoded values take precedence", () => {
  const value = { title: "Title, [18 24 42] }{", values: [true, false, null, -1.25e3], code: 'ctx.notify("Hello, []{}")\nlocal s = "\\\\"' };
  assert.deepEqual(parseCompositionJson(JSON.stringify(value)), value);
  assert.deepEqual(parseCompositionJson("```json\r\n" + JSON.stringify(value) + "\r\n```"), value);
});

test("missing RGB commas recover locally and preserve the complete composition", () => {
  const original = spec();
  const malformed = JSON.stringify(original).replace('"background":[18,24,42]', '"background":[18 24 42]');
  assert.deepEqual(parseHubComposition(malformed), original);
});

test("container separators and trailing commas recover without adding values", () => {
  assert.deepEqual(parseCompositionJson('{"rows":[[1][2],{"a":1}{"b":2},],"next":true,}'), { rows: [[1], [2], { a: 1 }, { b: 2 }], next: true });
  assert.deepEqual(parseCompositionJson('{"a":1 "b":[true false null]}'), { a: 1, b: [true, false, null] });
  assert.deepEqual(parseCompositionJson('["first" "second"]'), ["first", "second"]);
});

test("comma recovery cannot rewrite Luau, escaped quotes, newlines or requirement bindings", () => {
  const original = spec();
  original.pages[0].items = [{
    id: "custom", kind: "button", featureIds: ["action"], label: "Action", description: "Exact label", action: "custom",
    code: 'local text = "[18 24 42] }{ ][ trailing,}"\nctx.notify(text)\nlocal quoted = "\\\"quoted\\\""',
  }];
  const malformed = JSON.stringify(original).replace(',"pages":', ' "pages":');
  const recovered = parseHubComposition(malformed);
  assert.deepEqual(recovered, original);
  assert.equal(recovered.pages[0].items[0].kind, "button");
  assert.equal((recovered.pages[0].items[0] as { code: string }).code, (original.pages[0].items[0] as { code: string }).code);
});

test("truncated output, missing values and unescaped quotes are rejected without completion", () => {
  for (const malformed of [
    '{"pages":[', '{"pages":[{"id":"one"}', '[1 2', '[1,', '{"a":}', '{"a":1,', '{"a" 1}',
    '{"code":"ctx.notify("hello")"}', '["bad ""quotes"]', '{"a":"unterminated}', '{"code":"raw\nnewline"}',
    '{"a":undefined}', '{"a":NaN}', '{"a":1 /* comment */}', 'prefix {"a":1}', '{"a":1} {"b":2}',
    '[01]', '[1-2]', '[truefalse]', '[1,,2]',
  ]) assert.throws(() => parseCompositionJson(malformed), SyntaxError, malformed);
});

test("duplicate decoded keys are rejected in strict and recovered JSON", () => {
  for (const malformed of [
    '{"title":"first","title":"second"}', '{"title":"first" "title":"second"}',
    '{"a":1,"\\u0061":2}', '{"nested":{"id":"one","id":"two"}}',
  ]) assert.throws(() => parseCompositionJson(malformed), /duplicate object key/, malformed);
  assert.deepEqual(parseCompositionJson('{"first":{"id":1},"second":{"id":2}}'), { first: { id: 1 }, second: { id: 2 } });
});

test("limits bound strict parsing and comma recovery", () => {
  assert.throws(() => parseCompositionJson(" ".repeat(COMPOSITION_JSON_LIMITS.maxCharacters + 1)), /character limit/);
  assert.throws(() => parseCompositionJson("[" + Array.from({ length: COMPOSITION_JSON_LIMITS.maxTokens / 2 + 1 }, () => "0").join(",") + "]"), /token limit/);
  const depth = COMPOSITION_JSON_LIMITS.maxDepth;
  assert.doesNotThrow(() => parseCompositionJson("[".repeat(depth) + "0" + "]".repeat(depth)));
  assert.throws(() => parseCompositionJson("[".repeat(depth + 1) + "0" + "]".repeat(depth + 1)), /depth limit/);
  assert.deepEqual(parseCompositionJson("[" + Array.from({ length: COMPOSITION_JSON_LIMITS.maxCommaEdits + 1 }, () => "0").join(" ") + "]"), Array(COMPOSITION_JSON_LIMITS.maxCommaEdits + 1).fill(0));
  assert.throws(() => parseCompositionJson("[" + Array.from({ length: COMPOSITION_JSON_LIMITS.maxCommaEdits + 2 }, () => "0").join(" ") + "]"), /comma edit limit/);
});

test("recovered transport still obeys schema, semantic and feature coverage checks", () => {
  const invalidColor = JSON.stringify(spec()).replace('"background":[18,24,42]', '"background":[18 24 999]');
  assert.throws(() => parseHubComposition(invalidColor));
  const duplicateItems = spec();
  duplicateItems.pages[0].items.push(structuredClone(duplicateItems.pages[0].items[0]));
  assert.throws(() => parseHubComposition(JSON.stringify(duplicateItems).replace(',"pages":', ' "pages":')), /DUPLICATE_HUB_IDS/);
  const unreachable = spec();
  unreachable.pages.push({ id: "second", label: "Second", featureIds: [], items: [] });
  assert.throws(() => parseHubComposition(JSON.stringify(unreachable).replace(',"pages":', ' "pages":')), /UNREACHABLE_HUB_PAGES/);
  const recovered = parseHubComposition(JSON.stringify(spec()).replace(',"pages":', ' "pages":'));
  assert.deepEqual(validateCompositionCoverage(recovered, {
    fullHub: true, features: [{ id: "missing", label: "Missing", behavior: "Required action", availability: "supported", evidence: "Existing behavior", interaction: true }],
    ui: { instructions: "Keep all controls", requiredText: [] },
  }), ["Missing requirement in composed hub: missing"]);
});
