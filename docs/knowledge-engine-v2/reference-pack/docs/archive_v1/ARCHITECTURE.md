# ScriptRush Knowledge Engine : architecture recommandée

## Ce que le moteur doit savoir

Chaque source est identifiée par dépôt, version/commit, licence, provenance, langue, catégorie et **capacité d'exécution** :

- `project_server`: seulement dans un serveur de jeu que le développeur contrôle, pas dans un exécuteur client.
- `project_client`: utilisable dans un projet client lorsque la dépendance y est installée.
- `project_both`: modules conçus pour des projets Roblox comportant des dépendances installées.
- `executor_analysis`: documentation de l'outillage d'inspection, exécution manuelle et contrôlée seulement.
- `standalone_tool`: programme de build, parsing, linting ou inspection exécuté dans un processus externe, pas un ModuleScript Roblox.
- `reference_only`: idées d'architecture, pas bibliothèque directement utilisable dans Luau.

La base publique et les projets privés doivent utiliser deux espaces séparés et des règles de visibilité indépendantes.

## Pipeline d'ingestion

1. Répertoire candidat depuis `sources.json`, validation d'URL/dépôt.
2. Métadonnées et conditions de licence via GitHub API ; les licences ambiguës bloquent l'import complet.
3. Téléchargement borné des fichiers `.luau`, `.lua`, `.md` pertinents, sans exécution.
4. Segmentation sur les fonctions/AST si possible (Tree-sitter Luau ou analyse officielle) avec le chemin et les numéros de ligne ; segmentation par lignes seulement comme secours.
5. Étiquetage par type de code (quest, NPC, projectile, réseau, GUI, sauvegarde, tests...), contexte (client/serveur/projet/outillage), APIs, version, preuves et niveau de confiance.
6. Dédoublonnage du code par hash ; conservation d'un seul canonique pour les forks identiques.
7. Index lexical FTS5 ; index vectoriel **optionnel** si sa valeur est démontrée, pour éviter les appels d'embeddings inutiles.
8. Évaluations automatiques sur un jeu de requêtes fixe avant chaque mise à jour de l'index.

## Pipeline de génération (RAG)

Utilisateur -> profil du jeu (informations vérifiées) -> classification de la demande -> filtre de compatibilité -> récupération des 5 à 12 meilleurs extraits -> réponse du modèle avec citations internes aux sources -> analyse du code/compilation -> vérifications -> résultat + incertitudes explicites.

- Ne jamais précharger des milliers de scripts dans un prompt : stocker durablement et récupérer seulement les bonnes parties.
- Ne jamais transformer des exemples de création de jeu serveur en appels prétendument exécutables depuis un client tiers.
- Les solutions doivent s'adapter à la version et aux **fonctions réelles** détectées dans le jeu fourni. Si l'API est inconnue, la déclarer inconnue.
- Pour réparer : charger script initial, identifier module et dépendances, modifier uniquement les plages concernées, lancer des tests de non-régression, retourner un diff.
- Ne pas recourir à des bots/agents en grand nombre par défaut : utiliser une IA solide, recherche précise, puis un second avis seulement si les contrôles échouent.
- Garder la génération persistée et fragmentée par fichier pour éviter la troncation du chat ; afficher le code depuis le stockage, pas depuis une réponse texte tronquée.

## Heuristique de sélection d'extraits

Le moteur doit valoriser : correspondance des APIs, compatibilité d'environnement, provenance, fraîcheur, code avec tests, version du jeu et succès déjà vérifiés. Pénaliser : API supposée, code serveur inaccessible, bibliothèque obsolète, licence incertaine, incompatibilité de dépendance, simple similitude textuelle.

## Évaluations obligatoires

- Requête « Auto Farm dans un script client existant » : aucune recommandation automatique de ProfileStore, Knit serveur, Replica serveur comme dépendance client.
- Requête « lire un `.rbxlx` » : rbx-dom / parser XML Roblox selon le besoin.
- Requête « UI mobile noire/blanche » : bibliothèque UI compatible ou Widgets natifs avec contrôles responsive.
- Requête « erreur nil line 840 » : diff sur la fonction existante, pas une génération de script entier.
- Requête « accélérer RakNet pour insta-kill » : expliquer que transport réseau != autorisation des dégâts côté serveur.
- Requête « script compatible Unity » : ne pas utiliser des dépendances Roblox par défaut.
- Échec de compilation : conserver le texte, proposer une correction ciblée, ne pas afficher un faux statut « testé en jeu ».

## Intégration cloud à adapter par Codex

La base locale `knowledge_seed.sqlite` est un prototype. Pour ScriptRush sur Vercel/Cloudflare : jobs d'ingestion depuis un environnement avec stockage persistant, stockages (R2 ou équivalent) pour les artefacts de source autorisés, index FTS5 dans D1/SQLite (ou PostgreSQL FTS), endpoints d'administration pour réindexer, quotas par dépôt et intégration avec le moteur d'IA actuel. Le site de production ne doit pas attendre un téléchargement GitHub à chaque génération.

Stocker les secrets dans les variables serveur. L'index public peut être mutualisé, mais les uploads privés doivent rester confinés à l'utilisateur/projet. Des workers parallèles doivent respecter les limites GitHub. Mettre en cache les extraits et demandes fréquemment utilisées afin de limiter les crédits IA.
