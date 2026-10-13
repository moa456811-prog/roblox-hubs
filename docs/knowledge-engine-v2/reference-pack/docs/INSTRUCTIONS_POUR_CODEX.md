# Message à transmettre à Codex quand sa tâche en cours est finie

Je veux améliorer le projet **ScriptRush existant**, sans réécrire le site, sans perdre l'interface ou mes scripts, et **sans modifier une branche où une autre session travaille**. Voici le pack ScriptRush Knowledge Engine V2.

**Objectif :** une plateforme spécialisée Roblox qui démarre avec **le lien Roblox/Place ID sans exiger de fichier `.rbxl`**, et qui se sert d'une base de connaissances évolutive pour créer ou réparer des scripts complets, sans inventer des mécaniques de jeu. Le moteur doit expliquer ce qui est prouvé et ce qui n'a pas encore pu être testé dans le jeu, au lieu d'afficher « 100 % fonctionnel » sans preuve.

**Étapes impératives :**

1. Commence par lire `README.md`, `docs/CODEX_IMPLEMENTATION_V2.md`, `docs/GENERATOR_CONTRACT.md`, `docs/VERIFICATION_LEVELS.md` et analyser le vrai code ScriptRush. Ne remplace pas les fichiers non concernés.
2. Intègre la résolution Place ID → informations publiques du jeu, puis la recherche de références versionnées par jeu, licence et environnement. Aucun `.rbxl` obligatoire.
3. Ajoute le catalogue (`sources.json`) et les recettes (`recipes.json`) en respectant les licences. Pour l'indexation des sources ouvertes : importer seulement les éléments autorisés et conserver les preuves de provenance.
4. Ajoute une vraie recherche RAG légère (FTS5 ou outil existant), avec cache, versionnement et filtrage client/serveur/exécuteur.
5. Enrichis le processus de génération existant : plan fondé sur preuves, scripts multi-fichiers complets stockés hors du chat, validation de syntaxe et tests simulés. En mode erreur, correctifs ciblés du code déjà fourni, non régénération complète.
6. Crée une progression réellement liée aux étapes exécutées et une reprise après timeout ; pas de faux statuts.
7. Vérifie que les chemins actuels continuent à fonctionner, avec tests automatiques et rollback ; livre uniquement une branche/PR testée, ne déploie pas en production sans mon accord.
8. Affiche clairement : `non vérifié`, `compilation OK`, `tests simulés OK`, `test en jeu observé` ; ne promets pas 100 % sans pouvoir tester le jeu réel.

**Livrable :** diff, tests, métriques de fiabilité/latence/coût, démo sans fichier de jeu, limitations réelles, étapes de déploiement après approbation.
