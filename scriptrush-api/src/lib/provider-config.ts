export type ProviderConfig = { name: "apinex" | "openrouter"; endpoint: string; model: string; key: string };
export type ProviderEnvironment = { APINEX_API_KEY?: string; OPENROUTER_API_KEY?: string };

/** Credentials are used only with their fixed, authorized provider origin. */
export function selectProviders(env: ProviderEnvironment): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  const apinexKey = env.APINEX_API_KEY?.trim();
  const openrouterKey = env.OPENROUTER_API_KEY?.trim();
  if (apinexKey) providers.push({ name: "apinex", endpoint: "https://api.apinex.bond/v1/chat/completions", model: "free/gpt-6-luna", key: apinexKey });
  if (openrouterKey) providers.push({ name: "openrouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "apodex/apodex-1.1-mini:free", key: openrouterKey });
  if (!providers.length) throw new Error("AI_NOT_CONFIGURED");
  return providers;
}

/** Compatibility for callers that need only the preferred configured provider. */
export function selectProvider(env: ProviderEnvironment): ProviderConfig {
  return selectProviders(env)[0];
}

/** Public configuration summary. Credentials are never included in health responses. */
export function describeProviderConfiguration(env: ProviderEnvironment) {
  let configuredProviders: string[];
  try { configuredProviders = selectProviders(env).map(provider => `${provider.name}/free`); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "AI_NOT_CONFIGURED") throw error;
    configuredProviders = [];
  }
  return {
    provider: configuredProviders[0] ?? "unconfigured",
    configuredProviders,
    automaticProviderSwitch: configuredProviders.length > 1,
  };
}
