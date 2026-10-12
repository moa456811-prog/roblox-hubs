import type { HubComposition } from "./hub-spec.ts";

export const SCRIPT_UI_LANGUAGE_POLICY = "SCRIPT UI LANGUAGE: All generated functional UI text must be English: buttons, tabs, descriptions, instructions, placeholders, notifications, unavailable-feature explanations and error messages. A request written in French does NOT request a French interface. Translate French functional labels and page content into English, even when they were quoted in a French request. Preserve custom hub titles, game names and proper names. Apply this English UI preference while keeping all requested features, layout, colors and dimensions. Review the original request with this language preference; do not reject an English translation merely because the request was written in French.";

const functionalLabels: Readonly<Record<string, string>> = {
  "accueil": "Home", "réglages": "Settings", "reglages": "Settings", "paramètres": "Settings", "parametres": "Settings", "préférences": "Preferences", "preferences": "Preferences",
  "bienvenue": "Welcome", "fermer": "Close", "fermeture": "Close", "réduire": "Minimize", "reduire": "Minimize", "minimiser": "Minimize", "restaurer": "Restore",
  "appliquer": "Apply", "activer": "Enable", "désactiver": "Disable", "desactiver": "Disable", "activé": "On", "désactivé": "Off", "desactive": "Off",
  "oui": "Yes", "non": "No", "annuler": "Cancel", "confirmer": "Confirm", "retour": "Back", "suivant": "Next", "précédent": "Previous", "precedent": "Previous",
  "copier": "Copy", "télécharger": "Download", "telecharger": "Download", "enregistrer": "Save", "sauvegarder": "Save", "ouvrir": "Open", "supprimer": "Delete", "effacer": "Clear",
  "réinitialiser": "Reset", "reinitialiser": "Reset", "historique": "History", "aide": "Help", "mouvement": "Movement", "déplacement": "Movement", "deplacement": "Movement",
  "rejoindre": "Rejoin", "vitesse de marche": "Walk Speed", "puissance de saut": "Jump Power", "thème": "Theme",
  "cliquez pour fermer": "Click to close", "cliquez pour appliquer": "Click to apply", "cliquez pour restaurer": "Click to restore",
  "réduire la fenêtre": "Minimize the window", "reduire la fenetre": "Minimize the window", "restaurer la fenêtre": "Restore the window", "restaurer la fenetre": "Restore the window",
  "profil requis": "Needs game profile", "profil du jeu requis": "Needs game profile", "profil manquant": "Missing game profile", "profil du jeu manquant": "Missing game profile",
  "paramètres du jeu": "Game Settings", "parametres du jeu": "Game Settings", "paramètres de l'interface": "UI Settings", "parametres de l'interface": "UI Settings",
};

/** Translate only a finite set of exact functional labels, never arbitrary prose or names. */
export function translateFunctionalUiText(text: string, context: "label" | "content" = "label"): string {
  const key = text.trim().normalize("NFC").toLocaleLowerCase("fr");
  if (context === "content" && (key === "paramètres" || key === "parametres")) return "Preferences";
  return functionalLabels[key] ?? text;
}

/** Enforce known labels deterministically without altering the caller's spec or custom Luau. */
export function applyEnglishUiLabels(spec: HubComposition): HubComposition {
  const translated = structuredClone(spec);
  const label = (text: string | null) => text === null ? null : translateFunctionalUiText(text);
  translated.window.closeLabel = label(translated.window.closeLabel);
  translated.window.minimizeLabel = label(translated.window.minimizeLabel);
  translated.window.restoreLabel = translateFunctionalUiText(translated.window.restoreLabel);
  for (const page of translated.pages) {
    page.label = translateFunctionalUiText(page.label);
    for (const item of page.items) {
      if (item.kind === "text") {
        item.text = translateFunctionalUiText(item.text, "content");
        continue;
      }
      item.label = translateFunctionalUiText(item.label);
      if (item.kind === "disabled") {
        item.reason = translateFunctionalUiText(item.reason, "content");
        continue;
      }
      item.description = translateFunctionalUiText(item.description, "content");
      if (item.kind === "number") item.applyLabel = translateFunctionalUiText(item.applyLabel);
      if (item.kind === "toggle") {
        item.onLabel = translateFunctionalUiText(item.onLabel);
        item.offLabel = translateFunctionalUiText(item.offLabel);
      }
    }
  }
  return translated;
}

/** Common untranslated controls are rejected; semantic review checks the rest. */
export function englishUiIssues(spec: HubComposition): string[] {
  const texts = [spec.window.closeLabel, spec.window.minimizeLabel, spec.window.restoreLabel,
    ...spec.pages.flatMap(page => [page.label, ...page.items.flatMap(item => {
      if (item.kind === "text") return [item.text];
      if (item.kind === "disabled") return [item.label, item.reason];
      return [item.label, item.description, ...(item.kind === "number" ? [item.applyLabel] : item.kind === "toggle" ? [item.onLabel, item.offLabel] : [])];
    })])];
  const french = /(?<![\p{L}\p{N}_])(?:accueil|fermer|bienvenue|appliquer|activer|désactiver|desactiver|activé|désactivé|réglages|reglages|paramètres|parametres|restaurer|réduire|reduire|minimiser|cliquez|appuyez|annuler|enregistrer|sauvegarder|réinitialiser|reinitialiser|télécharger|telecharger|vitesse de marche|puissance de saut|profil (?:du jeu )?(?:requis|manquant))(?![\p{L}\p{N}_])/iu;
  return texts.some(text => text && french.test(text)) ? ["Generated buttons, tabs, page content and messages must be in English. Translate the remaining French functional UI text while preserving the custom title and requested design."] : [];
}
