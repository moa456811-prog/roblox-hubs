import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sanitizeScanner } from "../lib/scanner-safety.ts";

const upstream = readFileSync(new URL("./fixtures/live-scanner-v2.lua", import.meta.url), "utf8");

test("reviewed live scanner retains its UI, report contract and read-only operations", () => {
  const safe = sanitizeScanner(upstream);
  for (const action of ["Quick scan", "Deep scan", "Record before", "Record after", "Export / Copy report", "Close"]) {
    assert.ok(safe.includes(`button("${action}"`), `missing ${action} action`);
  }
  assert.ok(safe.includes('return "[SCRIPTRUSH_RUNTIME_PROFILE]" .. encoded'));
  assert.ok(safe.includes("game = {placeId = tostring(game.PlaceId), universeId = tostring(game.GameId)}"));
  assert.ok(safe.includes("remoteObservationOnly = true"));
  assert.doesNotMatch(safe, /\b(?:FireServer|InvokeServer|HttpGet|HttpPost|RequestAsync|GetAsync|PostAsync|readfile|listfiles|request)\s*\(/i);
  assert.doesNotMatch(safe, /\.UserId\b|\.Chatted\b|GetChatForUserAsync/);
});

test("both snapshot traversal and timeline reject private subtrees before observing them", () => {
  const safe = sanitizeScanner(upstream);
  assert.match(safe, /if object and object\.Parent and shouldInspect\(object\) then/);
  assert.match(safe, /if #state\.events >= 180 or not object or not shouldInspect\(object\) then return end/);
  const guard = safe.slice(safe.indexOf("local function shouldInspect"), safe.indexOf("local function push"));
  assert.match(guard, /cursor:IsA\("Model"\) and isPlayerCharacter\(cursor\) then return false/);
  assert.match(guard, /cursor:IsA\("TextBox"\) then return false/);
  assert.match(guard, /cursor = cursor\.Parent/);
  assert.match(guard, /isSensitiveField\(cursor\.Name\) then return false/);
  assert.doesNotMatch(safe, /object:IsA\("TextButton"\) or object:IsA\("TextBox"\)/);
});

test("attributes, values, paths and exported strings pass through privacy guards", () => {
  const safe = sanitizeScanner(upstream);
  assert.match(safe, /if not isSensitiveField\(key\) then encoded = scalar\(value\) end/);
  assert.match(safe, /object:IsA\("ValueBase"\) and not isSensitiveField\(object\.Name\)/);
  assert.match(safe, /root = safeName\(root\.Name\)/);
  assert.match(safe, /local text = redactPrivateText\(value\)/);
  assert.match(safe, /Players\.PlayerAdded:Connect\(rememberPlayer\)/);
  assert.match(safe, /player\.Name, player\.DisplayName/);
  assert.match(safe, /text:lower\(\):find\(name, startAt, true\)/);
  assert.match(safe, /HttpService:JSONEncode\(sanitizeReport\(report\)\)/);
  assert.match(safe, /clean\[cleanKey\] = sanitizeReport\(item, childPath\)/);
  assert.match(safe, /privacyConnection:Disconnect\(\)/);
  for (const field of ["password", "token", "key", "cookie", "credential", "auth", "userid", "user", "name", "chat", "email", "account", "session", "owner"]) {
    assert.ok(safe.includes(`"${field}"`));
  }
});

test("player names cannot rename schema keys, feature enums or game identifiers", () => {
  const safe = sanitizeScanner(upstream);
  const reportGuard = safe.slice(safe.indexOf("local protocolStrings"), safe.indexOf("local function encodeReport"));
  assert.match(reportGuard, /local cleanKey = key/);
  assert.match(reportGuard, /if type\(key\) == "string" and path:match\("%\.attributes\$"\) then\s+cleanKey = redactPrivateText\(key\)/);
  assert.doesNotMatch(reportGuard, /local cleanKey = type\(key\) == "string" and redactPrivateText\(key\)/);
  assert.match(reportGuard, /local allowed = protocolStrings\[path\]\s+if allowed and allowed\[value\] then return value end/);
  for (const path of ["version", "type", "scan.mode", "features[].key", "features[].label", "features[].confidence"]) {
    assert.ok(reportGuard.includes(`["${path}"] =`), `protocol constants missing for ${path}`);
  }
  assert.ok(reportGuard.includes('path == "game.placeId" or path == "game.universeId"'));
  assert.ok(reportGuard.includes('value:match("^%d+$")'));
  assert.ok(reportGuard.includes('childPath = path .. "[]"'));
  assert.ok(reportGuard.includes('not path:find(".attributes.", 1, true)'));
  assert.ok(reportGuard.indexOf("if allowed and allowed[value] then return value end") < reportGuard.indexOf("return redactPrivateText(value)"));
});

test("unreviewed or changed upstream code fails closed", () => {
  for (const changed of ["", upstream + "\n", upstream.replace("object.Text", "object.Password"), upstream + '\nremote:FireServer("probe")', "x".repeat(100_001)]) {
    assert.throws(() => sanitizeScanner(changed), /privacy review is required/);
  }
});

test("transport CRLF normalization does not change the reviewed scanner", () => {
  assert.equal(sanitizeScanner(upstream.replace(/\n/g, "\r\n")), sanitizeScanner(upstream));
});
