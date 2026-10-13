import "server-only";
import { selectProviders } from "./provider-config.ts";
import { createProviderRunner } from "./provider-client.ts";

// APInex is preferred. Its capacity/quota failures can continue the same stage
// through the configured free OpenRouter model, within the original deadline.
export const runModel = createProviderRunner({
  providers: () => selectProviders({ APINEX_API_KEY: process.env.APINEX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }),
});
