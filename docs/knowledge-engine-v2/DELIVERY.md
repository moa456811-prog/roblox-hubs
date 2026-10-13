# ScriptRush Knowledge Engine V2 — livraison pour revue

Branche isolée : `codex/knowledge-engine-v2`, issue de `codex/scriptrush-multipage` au commit `cd09a4a5984cf3962ffb7583745429f6a82a700b`. Le checkout de l'autre session, son interface, ses scripts et sa branche n'ont pas été modifiés. Aucun déploiement, changement de base de données, entraînement ou appel de modèle payant n'a été effectué pour cette intégration.

## Périmètre du diff

- Nouveau code API dans `scriptrush-api/src/lib/knowledge-v2`, `generation-jobs`, `knowledge-project.ts` et les routes `/api/v2`. Les routes de génération et fournisseurs existants sont conservés ; V2 réutilise le fournisseur serveur existant uniquement à l'étape de génération.
- Nouveau parcours optionnel dans `scriptrush-proxy/workflows/knowledge-workflow.tsx`. Le workflow existant est enveloppé par un interrupteur, sans réécriture de ses contrôles ou de ses clés History. Export ZIP, fichiers complets, diff, snapshots, reprise et retours de test sont ajoutés au parcours V2.
- La réécriture API générale passe de `afterFiles` à `fallback` : les routes V2 dynamiques doivent être résolues avant le transfert des anciennes API. Leur destination reste identique. Ce défaut a été reproduit dans le navigateur et corrigé.
- Catalogue, recettes, import public vérifié, tests, démo, workflow CI sans déploiement et documentation sont ajoutés. Les fichiers Next générés pendant les tests ne font pas partie du changement fonctionnel.
- Une règle `.gitattributes` ciblée conserve les octets LF de la fixture scanner déjà revue. Aucun changement du scanner ni de son hash de confiance : le premier test Windows échouait parce que le checkout CRLF devenait CRCRLF dans le scénario de normalisation.

## Données et recherche

Les documents demandés ont été lus avant l'implémentation : README, CODEX_IMPLEMENTATION_V2, GENERATOR_CONTRACT et VERIFICATION_LEVELS. Le pack est conservé sous `reference-pack` avec preuve d'import `PACK_IMPORT.json`. Le seed SQLite binaire, régénérable et limité aux métadonnées, n'est pas utilisé. Aucun programme fourni dans le ZIP n'a été exécuté.

Les **78 entrées sont des candidates**, pas 78 bibliothèques certifiées. Les **36 recettes** sont des méthodes génériques, pas des preuves des mécaniques d'un jeu. Les licences proposées dans le pack restent inconnues tant que les fichiers réels n'ont pas été contrôlés.

Un premier import réel est livré : `howmanysmall/Janitor`, commit `47acf39d7b265fad409e438e976affa9468ff0a2`, README et `src/init.luau`, licence MIT complète. Le dépôt public, le commit, les blobs Git, SHA-256, licence et provenance ont été vérifiés. Les rôles admis sont client/serveur de projet, pas exécuteur. Le code importé sert de référence et n'a pas été exécuté. Ses dépendances ne sont pas automatiquement vendoriées. Les avis de licence complets sont joints aux artefacts lorsque cette source est récupérée.

Le RAG utilise un index inversé **BM25 réel en TypeScript**, équivalent léger de recherche plein texte. Il évite une dépendance SQLite native sur les fonctions Next. Version calculée sur les documents et licences ; cache borné, TTL, filtrage exact par rôle et Place ID ; documents suspects mis en quarantaine. Les scripts privés ne rejoignent jamais cet index commun. Les descriptions publiques restent des données non fiables, sans autoriser des remotes.

L'import est une commande de maintenance explicite, avec commit et chemins précis, jamais un endpoint d'import arbitraire. La première politique d'admission valide uniquement le MIT complet ; les autres licences restent bloquées pour revue. Toute mise à jour des imports exige un nouveau build pour modifier l'index de production.

## Parcours et preuves

Le lien Roblox ou Place ID suffit pour démarrer. Deux endpoints publics résolvent identité et univers, avec origine fixe, tailles/délais bornés, cache et résultat `UNKNOWN` en cas d'échec. Un fichier `.rbxl` n'est jamais requis.

`Analyze Game & Plan` exécute découverte, recherche et plan sans appel au modèle. Le consentement au fournisseur est requis uniquement pour générer/réparer. Les étapes sont enregistrées avant/après leur exécution, avec tentative, dates et erreur. Une clé privée de reprise donne accès à un seul job ; seul son hash est stocké. Elle n'apparaît ni dans les URLs, ni dans le prompt, ni dans les preuves livrées. Les demandes, plans et artefacts sont conservés hors du chat, dans le stockage privé des jobs.

Une génération attend des fichiers complets et un inventaire de fonctionnalités. Cet inventaire préserve les exigences explicites ; il n'invente pas les capacités d'un « Full Hub » non détaillé. Les statuts d'implémentation fournis par le modèle sont renommés `modelDeclaredStatus` et restent `verificationStatus: unverified`. Un contrôle de présence ne prouve pas la qualité sémantique ni la fidélité visuelle.

La réparation n'accepte que de petits remplacements de segments uniques dans les fichiers existants ; les autres octets sont conservés. Snapshots et manifests SHA-256 permettent une restauration, qui invalide les anciens résultats de validation. Les retours « Worked » exigent le hash exact de la version actuelle et sont refusés pendant une étape active. Ils restent déclaratifs.

| Affichage | Preuve nécessaire |
| --- | --- |
| Unverified / non vérifié | Défaut, absence de compilation ou modification locale |
| Compilation passed | Processus Luau réellement lancé et terminé, preuve liée aux fichiers |
| Simulated tests passed | Assertions effectivement exécutées, rapport lié à tous les hashes |
| In-game result reported | Retour d'un testeur sur le snapshot précis, sans observation indépendante |
| In-game result observed | Réservé à une future observation instrumentée ; jamais émis actuellement |

Une étape `validation: passed` signifie que l'opération de validation s'est terminée. Les résultats compilation/simulation/jeu et leurs erreurs sont affichés séparément. `ready` signifie que les fichiers sont disponibles, pas qu'ils fonctionnent en jeu. Aucun « 100 % fonctionnel » n'est produit par ce moteur.

## Vérification et métriques

Preuves reproductibles : [rapport de démo](demo/report.json), [preuve navigateur](demo/browser-proof.json), [fichiers complets de démo](demo/project/src/main.client.luau), [manifest du pack](PACK_IMPORT.json).

- Base API avant changement : 194 tests passaient. Livraison locale : **268 tests API + 85 tests interface**, zéro échec ou test ignoré ; TypeScript et les deux builds sont vérifiés séparément dans `verification.json`.
- Tests supplémentaires : provenance/licence, 12 cas RAG, rôles/jeu/cache, identité, refus des preuves forgées, confidentialité, transport, persistance réelle sur disque, CAS concurrent, redémarrage, timeout/annulation, limites modèle, patch ciblé, rollback et conservation History.
- Compilation avec Luau officiel **0.742**. La simulation fermée exécute les deux fichiers auteurs de démo avec **8 assertions** : cooldown, personnage initial, respawn et déconnexion des événements. Un mutant qui supprime le nettoyage compile encore, mais échoue aux assertions ; compilation et comportement sont donc distingués.
- Démo sans fichier de jeu : identité publique observée pour Place `2753915549`, trois artefacts persistés (deux Luau et licence), timeout réel de recherche, reprise depuis une nouvelle instance de service, correctif ciblé, puis restauration exacte.
- Mesure locale de cette démo : résolution publique **456 ms**, recherche avec stockage **12,6 ms**, plan **14,9 ms**, validation **190 ms**. BM25/cache sur 100 requêtes : première requête **0,43 ms**, p50 **0,079 ms**, p95 **0,097 ms**. Ce sont des mesures de développement, sans garantie de latence en production.
- Coût des appels modèle de ces essais : **0 requête fournisseur, 0 token fournisseur**. Le writer de démo est une fixture explicitement identifiée, pas une mesure de qualité IA. Qualité, tokens, prix et latence d'un modèle réel restent non mesurés. Les rapports réels laissent coût/tokens à `null` quand le fournisseur ne les fournit pas.
- Budget par job : au plus trois tentatives par étape, deux opérations de génération ; le fournisseur existant peut faire deux requêtes de transport par opération, donc au plus **quatre requêtes modèle**. Un timeout/arrêt ne garantit pas l'arrêt immédiat de la facturation d'une requête déjà acceptée par le fournisseur.

La CI teste Node 22.19 et 24, télécharge Luau officiel avec SHA-256 vérifié, exécute tests/compilation/simulation/typecheck/build, sans étape de déploiement. Le résultat distant doit être lu dans la PR ; il n'est pas supposé à partir des tests locaux.

## Limites réelles

- Aucun test indépendant dans un jeu Roblox réel, aucun accès à son code serveur privé. Les quêtes, monnaies, remotes et garanties de Full Hub d'un jeu restent inconnus sans preuves supplémentaires.
- La simulation livrée couvre le contrat cooldown/cycle de vie local. Les autres projets n'obtiennent pas automatiquement un succès simulé : suite absente = `not_run`. Aucun test de rendu visuel de l'UI Luau générée n'a été exécuté.
- Les contrôles statiques sont conservateurs, basés sur des motifs ; ils refusent les loaders, imports manquants, certains appels dynamiques/remotes et mélanges de rôles évidents. Ce ne sont ni une analyse sémantique exhaustive ni une sandbox générale. Des corrections légitimes avec dépendances dynamiques peuvent être refusées.
- Le stockage Supabase REST/CAS est couvert par une simulation PostgREST. Son schéma privé est préparé mais non appliqué ni testé sur une vraie base. Aucun runtime Vercel avec compilateur/simulation n'est qualifié.
- La clé de job est une capacité anonyme, pas une connexion utilisateur. Récupération de compte, révocation, rétention/suppression, quotas par compte et limites globales de dépense demandent un travail avant une ouverture publique. La taille et le nombre d'opérations par job sont déjà bornés.
- Il s'agit d'une spécialisation par connaissances/contrats/validation. Aucun nouvel entraînement Kaggle ni comparaison APInex n'est revendiqué dans cette livraison.

## Activation uniquement après approbation

1. Revoir et approuver cette PR, les limites et le périmètre d'un essai privé. Préparer un stockage Supabase séparé ou explicitement approuvé ; vérifier `scriptrush-api/src/lib/generation-jobs/prepare-supabase.sql`, ses RLS, sauvegardes et accès serveur avant application. Aucun compte/service payant n'est créé automatiquement.
2. Sur l'environnement de test approuvé, configurer `SCRIPTRUSH_GENERATION_STORE=supabase`, URL et clé serveur dédiées. Ne jamais publier cette clé via `NEXT_PUBLIC_*`. Le filesystem est réservé à un hôte Node privé persistant et refusé sur Vercel.
3. Configurer des outils Luau fiables compatibles avec l'hôte, puis vérifier compiler et simulation sur cet hôte. En leur absence, conserver les niveaux `not_checked/not_run`. Sur Vercel, qualifier le packaging/exécution Linux ou un worker dédié avant de promettre ces tests.
4. Activer le backend avec `SCRIPTRUSH_KNOWLEDGE_V2_ENABLED=true` et construire le frontend avec `NEXT_PUBLIC_SCRIPTRUSH_KNOWLEDGE_V2=true`. Le proxy de production garde son origine API fixe existante. En développement uniquement, `SCRIPTRUSH_KNOWLEDGE_API_ORIGIN=http://127.0.0.1:3101` permet la démo locale.
5. Tester les chemins historiques et V2 dans l'environnement approuvé, poser quotas/coût/rétention pour l'essai, puis obtenir l'accord de production. L'ancien parcours reste le défaut, V2 nécessite aussi un choix utilisateur.
6. Rollback : désactiver le flag backend et reconstruire le frontend sans son flag ; restaurer le déploiement précédent si nécessaire. Conserver les données privées et snapshots pour reprise. Aucune migration destructive n'est nécessaire. Une restauration de script est également disponible par snapshot dans V2.

Rejouer la démo technique sur un hôte de développement : définir `SCRIPTRUSH_LUAU_COMPILER` et `SCRIPTRUSH_LUAU_RUNNER` vers des outils officiels, puis `node --experimental-strip-types scripts/demo-knowledge-v2.ts` depuis `scriptrush-api`. Ce script utilise une fixture auteur sans clé IA et ne déploie rien.
