import test from "node:test";
import assert from "node:assert/strict";
import { selectProvider } from "../src/lib/provider-config.ts";

test("APInex credentials take priority and are bound to the APInex origin and a free model", () => {
  const config = selectProvider({ APINEX_API_KEY: " test-apinex ", OPENROUTER_API_KEY: "test-openrouter" });
  assert.equal(config.key, "test-apinex");
  assert.equal(new URL(config.endpoint).origin, "https://api.apinex.bond");
  assert.equal(config.model, "free/gpt-6-luna");
});

test("OpenRouter remains usable only with its own credential when APInex is unconfigured", () => {
  const config = selectProvider({ APINEX_API_KEY: " ", OPENROUTER_API_KEY: "test-openrouter" });
  assert.equal(config.key, "test-openrouter");
  assert.equal(new URL(config.endpoint).origin, "https://openrouter.ai");
  assert.match(config.model, /:free$/);
  assert.throws(() => selectProvider({}), /AI_NOT_CONFIGURED/);
});
