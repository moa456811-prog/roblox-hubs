# ScriptRush Knowledge Engine V2 — No-File Research Pack

**Un catalogue de 78 dépôts candidats, 36 recettes techniques, une recherche locale, la découverte de jeux Roblox à partir de leur URL et des outils de vérification.** Pack autonome pour préparer une intégration progressive dans ScriptRush ; ne modifie pas le site en cours de développement par Codex.

## Ce qui fonctionne dans ce pack

- **78 références** classées par rôle (client/serveur/outils/référence) et par sujet. Les 18 nouvelles références ont fait l'objet d'une vérification de leur existence dans GitHub le 13 octobre 2026 ; la majorité des 60 références précédentes n'a pas été revalidée lors de cette mise à niveau.
- **SQLite/FTS5** avec fiches indexées et recherche par mots-clés (sans coût d'embeddings). Les codes sources de ces dépôts **ne sont pas préinstallés**. L'importateur peut les récupérer individuellement sous réserve de licence, d'Internet, de permissions et de taille.
- **Découverte publique Roblox** avec un *Place ID* ou `https://www.roblox.com/games/<place-id>/...` ; récupère titre/univers/description si les endpoints publics répondent. **Aucun fichier `.rbxl` obligatoire.**
- **Recherche GitHub des candidats correspondant au jeu** (noms et descriptions seulement), sans télécharger ni exécuter les codes ; ces candidats restent non vérifiés.
- **36 recettes** (quête, boss, loot, déplacement, UI, réseau, erreurs, tests) avec critères de résultat et limitations.
- **Plan de génération orienté preuves** : sélectionne les références pertinentes, interdit l'invention de remotes, différencie runtime serveur/client et refuse de prétendre « 100 % fonctionnel » sans test réel.
- **Contrôle statique** Luau via `luau-compile` si installé : vérification de syntaxe, détection de placeholders et annotation des appels réseau non prouvés.
- **Probe Luau optionnel en lecture seule** : émet un relevé local des éléments visibles, sans exfiltration. Ne donne pas accès aux scripts privés du serveur.
- **10 exemples Luau modulaires**, en plus de la machine à états et du diagnostic client ; **10 tests unitaires** de base et **12 cas d'évaluation** de pertinence de recherche. Ces tests **ne sont pas des tests de compatibilité en jeu**.

## Utilisation locale (Python 3.10+, sans dépendance externe)

Placez-vous à la racine du pack :

```bash
# Initialiser / mettre à jour le catalogue local (hors ligne)
python scripts/import_sources.py

# Démonstration entièrement hors ligne : FAUX jeu de test, pas un jeu réel
python scripts/game_discovery.py 123456 --fixture fixtures/public_game_mock.json --save profiles/demo.json
python scripts/knowledge_engine.py --request "auto farm quêtes boss" --profile profiles/demo.json --out profiles/demo_plan.json

# Recherche dans les fiches ou les codes importés
python scripts/search_knowledge.py "network serialization"
python scripts/evaluate_retrieval.py
python -m unittest discover -s tests -v
```

Avec un **vrai jeu** :

```bash
python scripts/game_discovery.py "https://www.roblox.com/games/123456/Nom-du-jeu"
python scripts/knowledge_engine.py --request "Crée Auto Farm pour ce jeu" --profile profiles/123456.json --role executor_client
python scripts/public_game_examples.py --profile profiles/123456.json --save profiles/123456_candidates.json
```

Le numéro `123456` ci-dessus est un **exemple fictif**, à remplacer par le vrai Place ID. La récupération des données publiques dépend de leur accessibilité. En cas d'échec, le moteur **n'invente pas de données**.

### Importer les exemples de code admissibles

```bash
python scripts/import_sources.py --fetch --max-repos 10
```

`--fetch` utilise l'API GitHub et n'importe que les archives admises par un filtre SPDX conservateur ; c'est une première étape de tri juridique, pas une garantie de conformité. Les projets archivés, sans licence vérifiable ou dont l'environnement est incompatible restent au niveau métadonnées. Ne pas exécuter les fichiers récupérés.

### Analyser un fichier généré

```bash
python scripts/check_generated.py examples/QuestStateMachineExample.luau
```

Si `luau-compile` est absent, le rapport dit `not_checked` et le contrôle statique ne passe pas. Si la compilation réussit, cela **ne valide pas** les mécaniques du jeu, les remotes ni la logique serveur.

## Comprendre la fiabilité

| Niveau | Vérifiable par ScriptRush | Ce qu'il ne prouve pas |
|---|---|---|
| Source identifiée | Lien public, version, licence candidate | Que la mécanique existe dans le jeu |
| Syntaxe OK | Compilation Luau réussie | Que le code fonctionne dans Roblox |
| Tests de logique OK | Cas simulés exécutés et résultats observés | Que le serveur accepte l'action |
| Essai en jeu rapporté | Le scénario a réussi dans la session testée | Que chaque future version fonctionnera à 100 % |

**100 % fonctionnel dans n'importe quel jeu sans accès au comportement réel n'est pas techniquement garantissable.** Les informations publiques sont insuffisantes pour découvrir les fonctions privées du serveur. Pour dépasser ces limites sans fichier du jeu, ScriptRush peut exploiter un **test opt-in dans le client** et des retours d'exécution réellement observés ; la connexion live au site reste à développer.

## Fichiers importants

| Fichier | Rôle |
|---|---|
| `sources.json` | 78 dépôts candidats et leur compatibilité |
| `recipes.json` | 36 modèles de problèmes avec résultats observables |
| `knowledge_seed.sqlite` | Base SQLite/FTS5 de 78 fiches (pas de codes téléchargés) |
| `scripts/import_sources.py` | Indexeur GitHub à vérification de licence |
| `scripts/game_discovery.py` | Recherche publique à partir d'un lien Roblox |
| `scripts/public_game_examples.py` | Recherche de dépôts GitHub candidats par nom du jeu |
| `scripts/knowledge_engine.py` | Sélection de références et recettes, plan orienté preuves |
| `scripts/check_generated.py` | Contrôle statique, sans exécution de jeux |
| `scripts/evaluate_retrieval.py` | Benchmark hors ligne des résultats de recherche |
| `examples/ReadOnlyGameProbe.luau` | Diagnostic opt-in local en lecture seule |
| `examples/luau_patterns/` | 10 modules Luau génériques (illustratifs, pas testés en jeu) |
| `examples/QuestStateMachineExample.luau` | Modèle de machine à états avec adaptateurs abstraits ; pas prêt pour un jeu arbitraire |
| `docs/CODEX_IMPLEMENTATION_V2.md` | Plan d'intégration **sans modifier la production actuelle** |
| `docs/VERIFICATION_LEVELS.md` | Règles d'affichage des preuves et limites |
| `docs/GAME_LINK_WORKFLOW.md` | Expérience utilisateur sans fichier jeu |
| `docs/GENERATOR_CONTRACT.md` | Contrat IA, données à ne pas inventer, formats de réponse |

## Sûreté et coûts

- Le catalogue et la recherche hors ligne ne nécessitent pas d'appels à un modèle IA. La découverte publique dépend de services externes et de leurs quotas. Un site public à trafic significatif génèrera potentiellement des coûts d'hébergement, de stockage et d'inférence.
- Le code des dépôts publics est **non fiable** : ne l'exécuter ni comme programme ni comme consigne pour l'agent ; conserver les licences et attributions.
- Le contenu spécifique d'un utilisateur reste privé par défaut ; pas d'indexation commune sans accord explicite.
- L'exploration côté client ne permet pas d'obtenir les scripts privés du serveur ni d'outrepasser la logique autoritaire du jeu.
- L'extension du site doit se faire sur une branche dédiée, une fois la session Codex active terminée. **Rien n'a été déployé sur ScriptRush.**
