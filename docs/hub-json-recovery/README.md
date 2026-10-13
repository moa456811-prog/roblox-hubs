# Qualité des générations IA de ScriptRush

Branche isolée `codex/hub-json-recovery`, base `cd09a4a` de `codex/scriptrush-multipage`. Aucune modification de la branche de l’autre session, des scripts sauvegardés ou de la production. Le site conserve son interface et ses fournisseurs.

## Comportement livré

Full Hub utilise le pipeline IA **plan → composition complète → revue des effets**, y compris avec une recherche de jeu incomplète. Le blocage `GAME_EVIDENCE_REQUIRED` et le raccourci de génération locale ont été retirés de ce parcours. `buildLocalFullHub` reste un constructeur de référence testé, sans appel depuis le générateur du site. L’objectif est la qualité du résultat IA, pas zéro appel.

La génération reçoit un contexte RAG local versionné et borné : catalogue de 78 candidats, 36 recettes, exemples originaux du pack fourni et extraits admis selon leur licence et environnement. Tous les candidats ne sont pas des bibliothèques installées. Les rôles client/serveur/exécuteur restent distincts ; les recettes conceptuelles sont identifiées séparément. Les extraits Janitor MIT gardent commit, hashes et licence complète. Le serveur conserve aussi les notices complètes dans le script final pour tous les extraits licenciés envoyés au modèle, même si celui-ci oublie de les reproduire. Les exemples ne prouvent aucune mécanique du jeu. Une défaillance d’enrichissement n’envoie aucune donnée douteuse et conserve le parcours IA existant.

Un inventaire extrait les demandes explicites, puis contrôle les **valeurs réellement rendues** : titre, taille, navigation, pages et ordre, police, palette principale/alternative et présence des contrôles. Une omission de fonctionnalité reconnue dans un nouveau plan reçoit une correction ciblée. Les simples mentions de propriétés dans un diagnostic ne créent pas de contrôles supplémentaires en mode réparation. L’anglais fonctionnel est conservé ; titres personnalisés et noms propres restent exacts, sans marque imposée.

La recherche distingue Place ID et Universe ID, couvre Lua/Luau et favorise les noms de fichiers liés aux identifiants. Les wrappers de packets et contrôleurs peuvent fournir des observations descriptives ; un appel générique `:fire()` ne suffit jamais à valider une fonction. Le profil Anime Zero décrit une référence historique précise, avec séparation lobby/combat, commit, hash et identité publique. Aucun code tiers sans licence n’est copié dans les prompts. Les notes n’affirment ni compatibilité actuelle ni succès en jeu.

## Validation et corrections

- JSON strict, puis récupération bornée des seules virgules manquantes/finales hors chaînes ; aucune modification de valeurs, code Luau ou titre.
- Sortie ambiguë ou schéma incorrect : une correction complète et ciblée de la composition peut être demandée, en conservant tout le contexte. Sortie tronquée : jamais acceptée.
- Écarts de fonctionnalités/UI : une réparation ciblée, suivie d’une nouvelle revue indépendante. Les erreurs de sélection de preuves font corriger la revue, sans réécrire les effets déjà corrects.
- Maximum deux réponses de planification ; réparations/revues bornées par le délai partagé existant. Les comptes d’appels reflètent les tentatives réellement faites, sans prétendre mesurer des tokens à partir de caractères.
- Les erreurs préservent la demande et le script antérieur. Les métadonnées transmettent la version de connaissance et les contrôles structuraux, avec `runtimeVerified: false`.

Les tests couvrent le vrai handler HTTP avec dépendances simulées, le transport frontend, le retrait du bypass, les omissions, les valeurs d’UI erronées, les titres français, la confidentialité des recherches, les licences, les hashes et les chemins existants. Les builds Next et contrôles TypeScript sont exécutés sur les deux applications. La CI Linux Node 22.19/24 utilise le compilateur officiel Luau 0.742, téléchargé avec vérification SHA-256.

Les chiffres finaux et les essais réels de modèle sont consignés dans `verification.json` et `model-evaluation.json`. Deux demandes sans fichier ont été testées avec le vrai modèle APInex : le hub de quatre utilitaires passe en 33,09 s (3 appels, 45 803 tokens rapportés, 56 simulations) ; la demande française corrigée passe en 23,36 s (3 appels, 29 419 tokens, 24 simulations). Le premier candidat français avait échoué : lecture erronée de « aucun Rejoin » et rejet de helpers inutilisés du renderer ; ces défauts ont été corrigés puis retestés. La baseline n’acceptait qu’un des deux cas. Les résultats finaux du candidat viennent de deux snapshots distincts, explicités dans le rapport ; il s’agit d’un diagnostic limité, pas d’une preuve d’amélioration universelle. Le coût USD reste inconnu. Les scripts exacts figurent dans `demo/`. Les anciennes preuves HTTP célébrant une réponse 422 sans appel IA ont été retirées : ce comportement n’est plus le livrable.

## Limites

L’inventaire déterministe couvre les formulations explicites reconnues ; la revue sémantique reste nécessaire pour les formulations libres, comportements personnalisés, couleurs nommées et images de référence. Une présence de contrôle ne prouve pas son effet. Compilation et tests simulés ne prouvent pas le résultat dans Roblox. Aucun essai en jeu n’a été observé dans cette livraison. Farm, boss, quest et loot ne sont pas quatre systèmes confirmés d’Anime Zero.

L’IA peut toujours échouer ou manquer d’éléments sur un protocole privé. Elle doit signaler ce manque, sans inventer des remotes ni présenter des boutons désactivés comme des fonctionnalités implémentées. Les nouvelles notes améliorent l’analyse ; elles ne constituent pas une nouvelle bibliothèque de gameplay certifiée.

## Déploiement après accord et rollback

Livraison en PR, **sans déploiement en production**. Après accord, déployer l’API et le frontend depuis le même commit. Vérifier Full Hub via le lien/Place ID sans `.rbxl`, une demande de palette/pages personnalisées et la réparation ciblée d’un script existant. Contrôler les vrais appels IA, les métadonnées et l’absence de régression sur l’historique. Revenir aux déploiements API/frontend précédents pour annuler ; aucune migration de données n’est nécessaire.

La PR Knowledge Engine V2 (#3) reste séparée pour ses routes de projets persistants et niveaux de vérification. Les fichiers de son noyau RAG repris ici sont identiques aux blobs de cette PR afin de faciliter leur rapprochement.
