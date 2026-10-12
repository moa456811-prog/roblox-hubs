import type { HubComposition } from "./hub-spec.ts";

export const SCRIPT_UI_LANGUAGE_POLICY = "SCRIPT UI LANGUAGE: All generated functional UI text must be English: buttons, tabs, descriptions, instructions, placeholders, notifications, unavailable-feature explanations and error messages. A request written in French does NOT request a French interface. Translate French functional labels and page content into English, even when they were quoted in a French request. Preserve custom hub titles, game names and proper names. Apply this English UI preference while keeping all requested features, layout, colors and dimensions. Review the original request with this language preference; do not reject an English translation merely because the request was written in French.";

/** Common untranslated controls are rejected; semantic review checks the rest. */
export function englishUiIssues(spec: HubComposition): string[] {
  const texts = [spec.window.closeLabel, spec.window.minimizeLabel, spec.window.restoreLabel,
    ...spec.pages.flatMap(page => [page.label, ...page.items.flatMap(item => {
      if (item.kind === "text") return [item.text];
      if (item.kind === "disabled") return [item.label, item.reason];
      return [item.label, item.description, ...(item.kind === "number" ? [item.applyLabel] : item.kind === "toggle" ? [item.onLabel, item.offLabel] : [])];
    })])];
  const french = /\b(?:accueil|fermer|bienvenue|appliquer|activer|désactiver|desactiver|réglages|reglages|paramètres|parametres|restaurer|cliquez|appuyez)\b|\b(?:vitesse de marche|puissance de saut|profil (?:du jeu )?(?:requis|manquant))\b/i;
  return texts.some(text => text && french.test(text)) ? ["Generated buttons, tabs, page content and messages must be in English. Translate the remaining French functional UI text while preserving the custom title and requested design."] : [];
}
