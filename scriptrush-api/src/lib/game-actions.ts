import type { HubComposition } from "./hub-spec.ts";

/** Recognize valid Lua spacing consistently in validation, embedding and UI sync. */
export const referencesGameplay = (code: string): boolean => /\bctx\s*\.\s*gameplay\b/.test(code);
export function gameplayToggleKey(code: string): string | undefined {
  return code.trim().match(/^ctx\s*\.\s*gameplay\s*\.\s*setEnabled\s*\(\s*(["'])(farm|boss|quest|loot)\1\s*,\s*ctx\s*\.\s*enabled\s*\)\s*;?$/)?.[2];
}
export const compositionUsesGameplay = (spec: HubComposition): boolean => spec.pages.some(page => page.items.some(item => "code" in item && referencesGameplay(item.code)));
