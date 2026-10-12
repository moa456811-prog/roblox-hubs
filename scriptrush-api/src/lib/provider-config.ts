export type ProviderConfig = { name: "apinex" | "openrouter"; endpoint: string; model: string; key: string };

/** Credentials are used only with their fixed, authorized provider origin. */
export function selectProvider(env: { APINEX_API_KEY?: string; OPENROUTER_API_KEY?: string }): ProviderConfig {
  if (env.APINEX_API_KEY?.trim()) return { name: "apinex", endpoint: "https://api.apinex.bond/v1/chat/completions", model: "free/gpt-6-luna", key: env.APINEX_API_KEY.trim() };
  if (env.OPENROUTER_API_KEY?.trim()) return { name: "openrouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "dots-studio/dots-3-note-preview:free", key: env.OPENROUTER_API_KEY.trim() };
  throw new Error("AI_NOT_CONFIGURED");
}
