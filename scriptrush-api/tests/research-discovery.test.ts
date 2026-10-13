import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { randomUUID } from "node:crypto";
import { publicSourceGitBlobHash } from "../src/lib/public-source-analysis.ts";

/** Execute the actual research implementation with an injected public transport;
 * only the framework server-only import guard is removed for Node unit tests. */
async function researcher(fetcher: typeof fetch) {
  const key = `__publicResearch_${randomUUID().replaceAll("-", "")}`, registry = globalThis as unknown as Record<string, unknown>;
  registry[key] = fetcher;
  const path = new URL("../src/lib/research.ts", import.meta.url);
  const source = readFileSync(path, "utf8").replace(/^import "server-only";\r?\n/m, "")
    .replace(/from "\.\/([^"\n]+)"/g, (_match, relative: string) => `from ${JSON.stringify(new URL(relative, path).href)}`);
  const javascript = stripTypeScriptTypes(`const fetch = globalThis[${JSON.stringify(key)}];\n${source}`, { mode: "strip" });
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`) as typeof import("../src/lib/research.ts");
    return { module, dispose: () => { delete registry[key]; } };
  } catch (error) { delete registry[key]; throw error; }
}

test("research keeps selected child place, searches universe and Luau, verifies blobs and filters private repositories", async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [], commit = "e".repeat(40), tree = "d".repeat(40);
  const wrapper = "local packets = require(game.ReplicatedStorage.Packets)\npackets.combat:fire()";
  const otherGame = 'if game.PlaceId == 9999 then\notherRemote:FireServer("LootOtherGame")\nend';
  const loader = await researcher(async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.hostname === "apis.roblox.com") return Response.json({ universeId: 456 });
    if (url.hostname === "games.roblox.com") return Response.json({ data: [{ name: "Example Game", rootPlaceId: 999, id: 456, description: "Public metadata" }] });
    if (url.hostname === "scriptblox.com") return Response.json({ result: { scripts: [] } });
    if (url.pathname === "/search/repositories") return Response.json({ items: [
      { full_name: "private/repo", private: true, default_branch: "main" },
      { full_name: "public/GenericHub", private: false, name: "GenericHub", default_branch: "main" },
    ] });
    if (url.pathname === "/repos/public/GenericHub/commits/main") return Response.json({ sha: commit, commit: { tree: { sha: tree } } });
    if (url.pathname === "/repos/public/GenericHub/license") return Response.json({ message: "Not found" }, { status: 404 });
    if (url.pathname === `/repos/public/GenericHub/git/trees/${tree}`) return Response.json({ tree: [
      { type: "blob", path: "main.lua", size: Buffer.byteLength(otherGame), sha: publicSourceGitBlobHash(otherGame) },
      { type: "blob", path: "456.luau", size: Buffer.byteLength(wrapper), sha: publicSourceGitBlobHash(wrapper) },
      { type: "blob", path: "999/other.luau", size: 50, sha: "f".repeat(40) },
    ] });
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith("/456.luau")) return new Response(wrapper);
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith("/main.lua")) return new Response(otherGame);
    throw new Error(`Unexpected public request: ${url.href}`);
  });
  try {
    const result = await loader.module.researchGame("https://www.roblox.com/games/123/Example-Game");
    assert.equal(result.placeId, "123", "Selected child place is not replaced by the root or universe");
    assert.equal(result.universeId, "456");
    const queries = calls.filter(call => call.url.pathname === "/search/repositories").map(call => call.url.searchParams.get("q"));
    assert.ok(queries.includes("456 language:Luau")); assert.ok(queries.includes("123 language:Lua")); assert.ok(queries.includes('"Example Game" language:Luau'));
    assert.equal(calls.some(call => call.url.pathname.includes("/private/repo/")), false);
    assert.ok(calls.every(call => !new Headers(call.init?.headers).has("Authorization")));
    assert.ok(result.publicScripts.some(reference => reference.universeId === "456" && reference.placeId === undefined));
    assert.ok(result.sourceAnalysis?.length); assert.ok(result.researchKnowledge.features.every(feature => feature.basis === "unknown"));
    assert.deepEqual(result.licenseAttributions, []);
    assert.doesNotMatch(result.knowledgeContext, /LootOtherGame|packets\.combat|require\(/);
    const view = loader.module.publicResearchView(result);
    assert.ok(view.sourceAnalysis?.length); assert.equal(Object.hasOwn(view, "knowledgeContext"), false);
    assert.equal(Object.hasOwn(view, "licenseAttributions"), false);
    assert.ok(view.publicScripts.every(reference => !Object.hasOwn(reference, "snippet") && !Object.hasOwn(reference, "license")));
    const before = calls.length; await loader.module.researchGame("123"); assert.equal(calls.length, before, "Place-scoped cache avoids repeated public discovery");
  } finally { loader.dispose(); }
});

test("research never supplies a source whose pinned tree blob disagrees with fetched text", async () => {
  const commit = "a".repeat(40), tree = "b".repeat(40);
  const loader = await researcher(async input => {
    const url = new URL(String(input));
    if (url.hostname === "apis.roblox.com") return Response.json({ universeId: 456 });
    if (url.hostname === "games.roblox.com") return Response.json({ data: [{ name: "Example Game", rootPlaceId: 123 }] });
    if (url.hostname === "scriptblox.com") return Response.json({ result: { scripts: [] } });
    if (url.pathname === "/search/repositories") return Response.json({ items: [{ full_name: "owner/game", private: false }] });
    if (url.pathname.includes("/commits/")) return Response.json({ sha: commit, commit: { tree: { sha: tree } } });
    if (url.pathname.endsWith("/license")) return Response.json({}, { status: 404 });
    if (url.pathname.includes("/git/trees/")) return Response.json({ tree: [{ type: "blob", path: "456.luau", size: 90, sha: "f".repeat(40) }] });
    if (url.hostname === "raw.githubusercontent.com") return new Response("local packets = require(game.ReplicatedStorage.Packets)\npackets.quest:fire()");
    throw new Error("Unexpected request");
  });
  try {
    const result = await loader.module.researchGame("123");
    assert.equal(result.sourceCounts.github, 0); assert.equal(result.knowledgeContext, "");
    assert.ok(result.researchKnowledge.features.every(feature => feature.basis === "unknown"));
  } finally { loader.dispose(); }
});
