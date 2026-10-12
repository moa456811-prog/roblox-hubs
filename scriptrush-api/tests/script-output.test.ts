import assert from "node:assert/strict";
import test from "node:test";

const { extractCode, reviewScript, providerErrorCode } = await import(new URL("../src/lib/script-output.ts", import.meta.url).href);
const shortUi = 'local ui=Instance.new("ScreenGui",game.Players.LocalPlayer.PlayerGui)';

test("Lua and Luau labels are fully removed, including CRLF transport", () => {
  assert.equal(extractCode(`\`\`\`luau\n${shortUi}\n\`\`\``), shortUi);
  assert.equal(extractCode(`\`\`\`lua\r\n${shortUi}\r\n\`\`\``), shortUi);
  assert.equal(extractCode(`Explanation\n\`\`\`LUAU\n${shortUi}\n\`\`\`\n`), shortUi);
});

test("JSON, unlabeled fences, multiple blocks and incomplete fences are rejected", () => {
  for (const output of [
    `\`\`\`json\n{"code":"${shortUi}"}\n\`\`\``,
    `\`\`\`\n${shortUi}\n\`\`\``,
    `\`\`\`lua\n${shortUi}`,
    `\`\`\`lua\n${shortUi}\n\`\`\`\n\`\`\`luau\n${shortUi}\n\`\`\``,
    `\`\`\`luau-extra\n${shortUi}\n\`\`\``,
  ]) assert.equal(extractCode(output), "");
});

test("a complete short UI script is not replaced because of character count", () => {
  assert.ok(shortUi.length < 320);
  assert.deepEqual(reviewScript(shortUi), []);
});

test("empty, placeholder and loader output remain rejected", () => {
  assert.ok(reviewScript("").length > 0);
  assert.ok(reviewScript('local remote=YOUR_REMOTE; local p=game:GetService("Players")').some((issue: string) => issue.includes("placeholder")));
  assert.ok(reviewScript('loadstring(game:HttpGet("https://example.com/code"))()').some((issue: string) => issue.includes("external loader")));
});

test("fix mode retains its protection against replacing most of a large script", () => {
  assert.ok(reviewScript(shortUi, shortUi.repeat(60), true).includes("patch replaced too much of the current script"));
});

test("structured provider reasons never echo arbitrary error bodies", () => {
  assert.equal(providerErrorCode(new Error("RATE_LIMITED")), "RATE_LIMITED");
  assert.equal(providerErrorCode(new Error("AI_ERROR_401")), "AI_ERROR_401");
  assert.equal(providerErrorCode(new Error("Unexpected response with private credentials")), "AI_ERROR");
});
