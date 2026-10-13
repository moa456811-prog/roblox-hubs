import "server-only";
import { selectProvider } from "./provider-config.ts";
import { createProviderRunner } from "./provider-client.ts";

// Preserve the existing authorized production provider selection. Kaggle's
// personal benchmark access is not enabled for public visitor generations.
export const runModel = createProviderRunner({
  providers: () => [selectProvider({ APINEX_API_KEY: process.env.APINEX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY })],
});
