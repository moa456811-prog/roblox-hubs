import test from "node:test";
import assert from "node:assert/strict";
import { describeProviderConfiguration, selectProvider, selectProviders } from "../src/lib/provider-config.ts";

test("APInex credentials take priority and are bound to the APInex origin and a free model", () => {
  const config = selectProvider({ APINEX_API_KEY: " test-apinex ", OPENROUTER_API_KEY: "test-openrouter" });
  assert.equal(config.key, "test-apinex");
  assert.equal(new URL(config.endpoint).origin, "https://api.apinex.bond");
  assert.equal(config.model, "free/gpt-6-luna");
});

test("OpenRouter is usable only with its own credential when APInex is unconfigured", () => {
  const config = selectProvider({ APINEX_API_KEY: " ", OPENROUTER_API_KEY: "test-openrouter" });
  assert.equal(config.key, "test-openrouter");
  assert.equal(new URL(config.endpoint).origin, "https://openrouter.ai");
  assert.equal(config.model, "apodex/apodex-1.1-mini:free");
  assert.throws(() => selectProvider({}), /AI_NOT_CONFIGURED/);
});

test("both credentials configure a trimmed APInex-first chain bound to the correct origins", () => {
  const providers = selectProviders({ APINEX_API_KEY: " primary-secret ", OPENROUTER_API_KEY: " backup-secret " });
  assert.deepEqual(providers.map(provider => provider.name), ["apinex", "openrouter"]);
  assert.deepEqual(providers.map(provider => provider.key), ["primary-secret", "backup-secret"]);
  assert.deepEqual(providers.map(provider => new URL(provider.endpoint).origin), ["https://api.apinex.bond", "https://openrouter.ai"]);
  assert.deepEqual(providers.map(provider => provider.model), ["free/gpt-6-luna", "apodex/apodex-1.1-mini:free"]);
});

test("a missing or blank alternate credential never reuses the primary provider credential", () => {
  for (const openrouterKey of [undefined, "", " \n\t"]) {
    assert.deepEqual(selectProviders({ APINEX_API_KEY: " primary-secret ", OPENROUTER_API_KEY: openrouterKey }).map(provider => provider.name), ["apinex"]);
  }
  for (const apinexKey of [undefined, "", " \n\t"]) {
    assert.deepEqual(selectProviders({ APINEX_API_KEY: apinexKey, OPENROUTER_API_KEY: " backup-secret " }).map(provider => provider.name), ["openrouter"]);
  }
});

test("empty configuration fails without accepting an unsupported Kaggle credential", () => {
  const unsupported = { APINEX_API_KEY: " \n", OPENROUTER_API_KEY: " \t", KAGGLE_API_TOKEN: "unsupported-secret" };
  assert.throws(() => selectProviders(unsupported), /AI_NOT_CONFIGURED/);
  assert.throws(() => selectProviders({}), /AI_NOT_CONFIGURED/);
});

test("extra environment options cannot redirect credentials or select a paid model", () => {
  const env = {
    APINEX_API_KEY: "primary-secret", OPENROUTER_API_KEY: "backup-secret",
    APINEX_ENDPOINT: "https://invalid.example", OPENROUTER_ENDPOINT: "https://invalid.example",
    APINEX_MODEL: "paid/model", OPENROUTER_MODEL: "paid/model", KAGGLE_API_TOKEN: "unsupported-secret",
  };
  const providers = selectProviders(env);
  assert.deepEqual(providers.map(provider => provider.endpoint), ["https://api.apinex.bond/v1/chat/completions", "https://openrouter.ai/api/v1/chat/completions"]);
  assert.deepEqual(providers.map(provider => provider.model), ["free/gpt-6-luna", "apodex/apodex-1.1-mini:free"]);
});

test("public provider status reports the active chain without exposing credentials", () => {
  const status = describeProviderConfiguration({ APINEX_API_KEY: "primary-secret", OPENROUTER_API_KEY: "backup-secret" });
  assert.deepEqual(status, { provider: "apinex/free", configuredProviders: ["apinex/free", "openrouter/free"], automaticProviderSwitch: true });
  assert.doesNotMatch(JSON.stringify(status), /primary-secret|backup-secret|key|endpoint/);
});

test("public provider status disables switching with one or no configured provider", () => {
  assert.deepEqual(describeProviderConfiguration({ APINEX_API_KEY: "primary-secret" }), { provider: "apinex/free", configuredProviders: ["apinex/free"], automaticProviderSwitch: false });
  assert.deepEqual(describeProviderConfiguration({ OPENROUTER_API_KEY: "backup-secret" }), { provider: "openrouter/free", configuredProviders: ["openrouter/free"], automaticProviderSwitch: false });
  assert.deepEqual(describeProviderConfiguration({ APINEX_API_KEY: " \n", OPENROUTER_API_KEY: " \t" }), { provider: "unconfigured", configuredProviders: [], automaticProviderSwitch: false });
});
