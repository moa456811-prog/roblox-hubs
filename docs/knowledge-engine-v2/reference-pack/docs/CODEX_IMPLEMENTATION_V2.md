# ScriptRush v2 — cahier des charges pour Codex

## Mission

Intégrer le dossier ScriptRush Knowledge Engine V2 au **site ScriptRush EXISTANT** sans remplacer sa logique opérationnelle ni altérer une autre session Codex active. Priorités : **game-link-first**, ingestion de connaissance avec provenance, génération fondée sur preuves, tests et sauvegarde des artefacts complets. Ce pack est un prototype Python à adapter à l'architecture réelle ; ce n'est pas un moteur prêt à déployer dans Vercel.

## STOP AVANT ÉDITION

- Inspecter le dépôt effectif de `scriptrush`, `scriptrush-live-scanner`, `scriptrush-clear-ui`, la base de données et le provider IA existants ; ne pas supposer que ces projets ont le même code.
- Détecter une branche/PR/conversation Codex en cours ; ne pas écraser une modification concurrente. Créer une branche dédiée et présenter un plan de migration avant de changer la production.
- Vérifier le schéma DB, les environnements, les clés, la compatibilité Vercel/Cloudflare et le traitement actuel des timeouts.

## Architecture cible

1. **Game Resolver** : page Roblox / Place ID → Universe ID, titre, version publique (si disponible), liens de provenance. Cache avec TTL et erreur explicite quand l'API publique ne répond pas. **Pas de `rbxl` obligatoire** ; la description du jeu reste une source faible.
2. **Public Evidence Collector** : recherche limitée de sources admissibles : documentations, projets open source liés au jeu, issues/changelogs et observations opt-in ; pas de scraping illimité, pas d'exécution du code tiers. Distinguer *candidat* de *mécanisme confirmé*.
3. **Knowledge Ingestion** : source GitHub + licence + commit SHA + version + environnement + extraits. Index textuel/FTS5 ou moteur équivalent à l'hébergement existant ; pas d'embeddings payants nécessaires au départ. R2/D1 facultatifs, ne pas créer de nouveaux comptes payants automatiquement.
4. **Game-Specific Retrieval** : déterminer gameplay/topic, filtrer le client vs serveur vs outil, réordonner par pertinence, récence et fiabilité. Ne jamais mélanger une simple bibliothèque de développement côté serveur avec les capacités d'un exécuteur client.
5. **Planning Agent** : construire une fiche structurée : mécanismes prouvés, hypothèses, fonctions à créer, imports requis, risques de compatibilité, résultats observables. Refuser d'inventer le nom d'une remote/quête/monnaie.
6. **Generator/Patcher** : nouveau script à partir du plan, ou patch minimal pour un code existant ; conserver la version antérieure, toutes les fonctions non touchées et les tests de non-régression. Sortie **multi-fichiers persistante**, jamais un seul message géant.
7. **Validation Engine** : compiler Luau si disponible, vérifier dépendances, scénarios unitaires/mock, et rapporter ce qui reste non testé. Validation en jeu seulement si un runner réel / diagnostic autorisé est disponible. Les appels IA/réessais sont bornés.
8. **Feedback Evidence** : permettre à l'utilisateur de déclarer réussite/échec et joindre un log ; enregistrer la version du script et de la cible. Les succès auto-déclarés ne deviennent jamais « 100 % universellement fonctionnel ».
9. **UI** : progression vraie (`Découverte → Recherche → Plan → Génération → Contrôles → Prêt à tester`), liens sources, niveau de preuve, historique, diff, bouton de téléchargement des artefacts complets et reprise d'une tâche interrompue.

## API cible illustrative — à adapter aux routes existantes

- `POST /api/games/resolve` avec `{placeIdOrUrl}` → `{game, evidence_level, unknowns}`
- `POST /api/knowledge/query` avec `{request, gameId, role}` → références triées avec licence et compatibilité
- `POST /api/generations` avec `{request, gameId, role, existingProjectId?}` → `jobId` persistant
- `GET /api/generations/:jobId/status` → étapes effectivement terminées
- `GET /api/generations/:jobId/files` → manifest + URLs signées / authorization correcte
- `POST /api/generations/:jobId/feedback` → preuve limitée au même compte/projet

**Toutes les routes sensibles exigent une authentification et une séparation forte des utilisateurs.** Ne pas laisser un compte lire les scripts privés d'un autre ni envoyer un script privé à un service externe sans consentement.

## Gates de qualité non négociables

- No file required : saisir uniquement un URL Roblox valide + demande fonctionne au moins jusqu'à un plan honnête.
- No invented API : une remote ou un nom de fonction ne peut être dit « confirmé » à partir de la simple description publique.
- Role isolation : bibliothèque `project_server` jamais importée naïvement dans `executor_client`.
- Source chain : chaque extrait de code utilisé renvoie au dépôt, fichier, commit et licence effectivement vérifiés.
- Parser/validator failure : aucun `passed` quand le compilateur n'a pas été lancé.
- Bounded model calls : retries et budgets configurables, réponses tronquées récupérées ou erreurs déclarées ; ne pas boucler sans fin.
- One issue / one patch : le mode réparation produit un diff limité, avec snapshots et possibilité de rollback.
- Automatic testing claims : seulement si les assertions et journaux d'exécution le prouvent ; ne pas annoncer « 100 % ».
- Game tests : aucun test réel sur le jeu prétendu sans runner/observations authentiques.
- CI : tests de non-régression de l'UI, du moteur, de l'API et des flux d'historique avant déploiement.

## Plan de livraison

1. Baseline : mesurer bugs actuels (timeouts, erreurs, code tronqué) et coût API par génération ; enregistrer les résultats.
2. Intégrer **en lecture seule** le Game Resolver + index de sources ; tests automatisés, aucun impact sur la génération actuelle.
3. Brancher la recherche au contexte du modèle derrière un feature flag. Évaluer avant/après sur jeux et demandes représentatifs.
4. Ajouter sortie persistante, compilation, annotations `non vérifié / syntaxe OK / testé`, et reprise de génération.
5. Ajouter patch minimal + tests de non-régression ; observer les échecs réels.
6. Ouvrir la fonctionnalité opt-in à un sous-groupe, comparer stabilité, pertinence, latence et coûts ; ne publier qu'après approbation.

## Résultats exigés avant publication

- Liste exacte des fichiers modifiés, migrations et API changées.
- Diff et tests réellement exécutés, avec résultats et défaillances.
- Benchmark de recherche (`scripts/evaluate_retrieval.py`) **plus** mesures de scripts réellement fonctionnels (différentes métriques).
- Estimation réaliste des coûts Vercel/base/API pour plusieurs niveaux de trafic.
- Rollback documenté et aucune modification non approuvée de production.
