import test from "node:test";
import assert from "node:assert/strict";
import {
  addHistory, clearHistory, exportHistory, getCurrentScript, getRuntimeProfile, getSelection,
  importHistory, readHistory, setCurrentScript, setRuntimeProfile, STORAGE_KEYS, StorageError,
} from "../lib/storage.ts";
import type { StorageLike } from "../lib/storage.ts";
import { parseHistoryImport, parseRuntimeProfile, parseScriptResponse, ValidationError } from "../lib/validation.ts";
import { fetchScanner, generateScript, researchGame } from "../lib/api.ts";
import type { HistoryInput } from "../lib/types.ts";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const input = (overrides: Partial<HistoryInput> = {}): HistoryInput => ({
  type: "generated", gameName: "Test Game", placeId: "123", prompt: "Preserve this request",
  script: "local x = 1\nprint(x)", ...overrides,
});

test("migration copies legacy script exactly and retains all legacy values", () => {
  const storage = new MemoryStorage();
  const script = "  -- Ω\r\nprint(\"unchanged\")\n\n";
  const profile = JSON.stringify({ game: { placeId: 123 }, scan: { mode: "deep" } });
  storage.setItem("scriptrush_current_script", script);
  storage.setItem("scriptrush_runtime_profile", profile);
  storage.setItem("sr_game", "Test Game");
  storage.setItem("sr_place", "123");
  assert.equal(getCurrentScript(storage), script);
  assert.deepEqual(getSelection(storage), { game: "Test Game", placeId: "123" });
  assert.equal(getRuntimeProfile(storage)?.game.placeId, 123);
  assert.equal(storage.getItem("scriptrush_current_script"), script);
  assert.equal(storage.getItem("scriptrush_runtime_profile"), profile);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.current)!).script, script);
});

test("corrupt v2 data falls back to legacy without overwriting either copy", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.current, "{broken");
  storage.setItem("scriptrush_current_script", "print('still here')");
  assert.equal(getCurrentScript(storage), "print('still here')");
  assert.equal(storage.getItem(STORAGE_KEYS.current), "{broken");
});

test("failed migration and failed writes never erase the previous script", () => {
  const storage = new MemoryStorage();
  storage.setItem("scriptrush_current_script", "print('old')");
  storage.failWrites = true;
  assert.equal(getCurrentScript(storage), "print('old')");
  assert.throws(() => setCurrentScript("print('new')", storage), StorageError);
  assert.equal(storage.getItem("scriptrush_current_script"), "print('old')");
});

test("saving current code does not trim or validate a manually pasted draft", () => {
  const storage = new MemoryStorage();
  const draft = "\n-- TODO working draft\nfunction incomplete(\n";
  setCurrentScript(draft, storage);
  assert.equal(getCurrentScript(storage), draft);
});

test("clearing the new runtime profile cannot resurrect its legacy copy", () => {
  const storage = new MemoryStorage();
  storage.setItem("scriptrush_runtime_profile", '{"game":{"placeId":123}}');
  assert.ok(getRuntimeProfile(storage));
  setRuntimeProfile(null, storage);
  assert.equal(getRuntimeProfile(storage), null);
  assert.ok(storage.getItem("scriptrush_runtime_profile"));
});

test("runtime imports accept exact marker, preserve report data and require real IDs", () => {
  const report = '[SCRIPTRUSH_RUNTIME_PROFILE]\n{"game":{"universeId":"456"},"features":[{"key":"farm","score":42}]}';
  assert.deepEqual(parseRuntimeProfile(report).features, [{ key: "farm", score: 42 }]);
  for (const invalid of ['{"game":{}}', '{"game":{"placeId":0}}', '{"game":{"placeId":"abc"}}', 'prefix ' + report, '{"game":{"placeId":123},"__proto__":{"polluted":true}}']) {
    assert.throws(() => parseRuntimeProfile(invalid), ValidationError);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("script extraction requires exactly one complete Lua block", () => {
  assert.equal(parseScriptResponse("Here is the script:\n```luau\nlocal x = 1\nprint(x)\n```\nUse it in game."), "local x = 1\nprint(x)");
  for (const invalid of ["print(1)", "```lua\nprint(1)", "```js\nprint(1)\n```", "```lua\nprint(1)\n```\n```lua\nprint(2)\n```", "```lua\n\n```", "```lua\nfunction run()\nprint(1)\n```", "```lua\nlocal a = {1, 2\n```", "```lua\nlocal a =\n```", "```lua\n...\n```", "```lua\nprint('unfinished)\n```", "```lua\n--[[ unfinished\n```"] ) {
    assert.throws(() => parseScriptResponse(invalid), ValidationError, invalid);
  }
});

test("script extraction rejects placeholders and provider truncation metadata", () => {
  for (const placeholder of ["YOUR_REMOTE", "INSERT_REMOTE", "REPLACE_WITH_REMOTE", "TODO"]) {
    assert.throws(() => parseScriptResponse("```lua\n-- " + placeholder + "\nprint(1)\n```"), /placeholder/);
  }
  assert.throws(() => parseScriptResponse("```lua\nprint(1)\n```", { finish_reason: "length" }), /incomplete/);
});

test("lexical checks allow delimiters in strings/comments and standard Luau constructs", () => {
  const code = "-- fake function (\nlocal text = [=[ } end ]=]\nlocal a = if true then 1 else 2\nfor i = 1, 3 do\n  if i > 1 then print(\"[end]\") end\nend\nrepeat a -= 1 until a == 0";
  assert.equal(parseScriptResponse("```luau\n" + code + "\n```"), code);
});

test("history stores a fixed script as a new version and derives accurate counters", () => {
  const storage = new MemoryStorage();
  const previous = addHistory(input({ id: "old" }), storage);
  const fixed = addHistory(input({ type: "fixed", sourceVersionId: previous.id, script: "print('fixed')\r\n" }), storage);
  assert.equal(readHistory(storage).length, 2);
  assert.equal(readHistory(storage).find((entry) => entry.id === previous.id)?.script, previous.script);
  assert.equal(fixed.sourceVersionId, previous.id);
  assert.equal(fixed.lineCount, 2);
  assert.equal(fixed.characterCount, fixed.script.length);
});

test("history retains the latest 25 versions after reload", () => {
  const storage = new MemoryStorage();
  for (let i = 0; i < 30; i++) addHistory(input({ id: "v" + i, createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString() }), storage);
  const reloaded = new MemoryStorage();
  reloaded.values = new Map(storage.values);
  assert.equal(readHistory(reloaded).length, 25);
  assert.equal(readHistory(reloaded)[0].id, "v29");
  assert.equal(readHistory(reloaded)[24].id, "v5");
});

test("history import is atomic, merges versions and retains colliding scripts", () => {
  const storage = new MemoryStorage();
  const original = addHistory(input({ id: "same" }), storage);
  const imported = { ...original, script: "print('different script')", lineCount: 999 };
  importHistory(JSON.stringify({ version: 2, entries: [original, imported] }), storage);
  assert.equal(readHistory(storage).length, 2);
  assert.deepEqual(new Set(readHistory(storage).map((entry) => entry.script)), new Set([original.script, imported.script]));
  assert.ok(readHistory(storage).every((entry) => entry.lineCount !== 999));
  const before = storage.getItem(STORAGE_KEYS.history);
  assert.throws(() => importHistory(JSON.stringify({ version: 2, entries: [original, { ...imported, script: 123 }] }), storage), ValidationError);
  assert.equal(storage.getItem(STORAGE_KEYS.history), before);
});

test("history export round-trips scripts exactly including drafts", () => {
  const storage = new MemoryStorage();
  const script = "\n-- TODO preserved historic draft\r\nfunction x(\n";
  addHistory(input({ script }), storage);
  const entries = parseHistoryImport(exportHistory(storage));
  assert.equal(entries[0].script, script);
  clearHistory(storage);
  assert.equal(readHistory(storage).length, 0);
  importHistory(JSON.stringify(entries), storage);
  assert.equal(readHistory(storage)[0].script, script);
});

test("corrupt history stays intact and is backed up before the next valid write", () => {
  const storage = new MemoryStorage();
  const raw = '{"version":2,"entries":[broken';
  storage.setItem(STORAGE_KEYS.history, raw);
  assert.deepEqual(readHistory(storage), []);
  assert.equal(exportHistory(storage), raw);
  assert.equal(storage.getItem(STORAGE_KEYS.history), raw);
  storage.failWrites = true;
  assert.throws(() => addHistory(input(), storage), StorageError);
  assert.equal(storage.getItem(STORAGE_KEYS.history), raw);
  storage.failWrites = false;
  addHistory(input(), storage);
  assert.ok([...storage.values.entries()].some(([key, value]) => key.startsWith(STORAGE_KEYS.history + "_recovery_") && value === raw));
});

test("API normalizes the research contract and forwards fix script without shortening", async () => {
  const previousFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("/api/research-game")) return Response.json({ profile: { name: "Game Found", placeId: 123, universeId: 456 } });
    sent = JSON.parse(String(init?.body));
    return Response.json({ message: "```lua\nprint('fixed')\n```" });
  };
  try {
    assert.deepEqual(await researchGame("123").then(({ game, placeId }) => ({ game, placeId })), { game: "Game Found", placeId: "123" });
    const currentScript = "  -- preserved\r\n" + "print('old')\n".repeat(7000);
    const result = await generateScript({ game: "Game Found", placeId: "123", mode: "fix", prompt: "repair", sources: [], currentScript });
    assert.equal(sent.currentScript, currentScript);
    assert.equal(result.script, "print('fixed')");
  } finally { globalThis.fetch = previousFetch; }
});

test("API rejects incomplete output and exposes understandable errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: "```lua\nfunction x()\n```" });
  try {
    await assert.rejects(generateScript({ game: "Test", placeId: "123", mode: "build", prompt: "request", sources: [] }), /incomplete/);
    globalThis.fetch = async () => new Response("Gateway failure", { status: 504 });
    await assert.rejects(fetchScanner(), /timed out/);
    globalThis.fetch = async () => Response.json({ error: "private upstream detail" }, { status: 403 });
    await assert.rejects(researchGame("Test"), (error: Error) => error.message.includes("unavailable") && !error.message.includes("private upstream"));
  } finally { globalThis.fetch = previousFetch; }
});

test("API propagates cancellation for research and scanner requests", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if (init?.signal?.aborted) throw new DOMException("Stopped", "AbortError");
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
  };
  try {
    const controller = new AbortController();
    const waiting = fetchScanner(controller.signal);
    controller.abort();
    await assert.rejects(waiting, { name: "AbortError" });
    await assert.rejects(researchGame("Game", controller.signal), { name: "AbortError" });
  } finally { globalThis.fetch = previousFetch; }
});
