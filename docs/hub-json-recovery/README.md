# Correctif du JSON de hub et des appels inutiles

Branche isolée `codex/hub-json-recovery`, base `cd09a4a` de `codex/scriptrush-multipage`. La branche de l'autre session et la PR Knowledge Engine V2 ne sont pas modifiées. Aucun déploiement, changement de clé ou appel à un fournisseur IA n'a été effectué pour ces essais.

## Problème observé

La capture montre « Invalid hub composition: Expected ',' or ']' after array element » après trois appels IA, avec aucune implémentation de jeu exploitable. Le code traitait une erreur de syntaxe JSON comme un défaut d'implémentation et envoyait une réparation complète du hub. La réponse brute du fournisseur n'est pas disponible ; les tests reproduisent cette classe d'erreur, sans prétendre connaître son contenu exact à la position indiquée.

## Comportement corrigé

- JSON strict en premier. Récupération locale de huit virgules maximum, uniquement hors des chaînes : séparateurs manquants entre éléments/propriétés ou virgules finales. Aucun appel IA, aucune modification des valeurs, chaînes Luau, couleurs, titres ou identifiants. Les validations de schéma, exigences, rôles des contrôles et revue du script restent obligatoires.
- JSON ambigu, clés décodées dupliquées, quotes cassées, valeurs/délimiteurs manquants et sortie tronquée sont refusés. Aucun script partiel, aucun hub de secours. Une erreur de protocole ne déclenche plus une régénération complète payante.
- Une réponse tronquée, initiale ou après une réparation légitime d'implémentation, garde le diagnostic `INCOMPLETE_RESPONSE` jusqu'au navigateur. Les appels déjà exécutés restent comptabilisés. Les messages ne prétendent pas qu'aucune réparation n'a eu lieu si une réparation avait déjà été tentée.
- Le preset Full Hub exact, sans contexte exploitable ni implémentation recherchée, s'arrête avant tout appel IA. Un hub personnalisé peut nécessiter le plan, puis s'arrête avant écriture/revue lorsqu'il réclame les mêmes actions sans preuve. Les utilitaires standard et demandes purement UI ne sont pas bloqués par l'absence de mécaniques du jeu.
- Les fichiers ou diagnostics fournis peuvent justifier une analyse : ils ne certifient pas un mécanisme. Les garde-fous suivants restent nécessaires. Le préflight personnalisé reconnaît les fonctionnalités inventoriées par la recherche ; il ne garantit pas zéro appel pour toutes les formulations libres.
- Le frontend distingue manque de preuves, JSON invalide et troncature, préserve la demande/le script, affiche le nombre d'appels réellement rapporté et ne relance pas automatiquement la requête.

Le pipeline garde son architecture et son interface. Les scripts générés restent en anglais, avec un titre personnalisé conservé et sans marque imposée. Les réparations sémantiques utiles gardent leur budget complet ; seules les répétitions provoquées par une réponse invalide sont arrêtées.

## Preuves

- Tests API : **210 passent**, dont parseur, pipeline, dépenses/absence de nouvel appel, compilation Luau, conservation des exigences et contexte, fournisseurs/fallback et jeux déjà pris en charge.
- Tests frontend : **69 passent**, dont transport des trois diagnostics, absence de retry, conservation des requêtes/scripts et régressions de confidentialité du scanner.
- Les deux builds Next et contrôles TypeScript sont vérifiés avant livraison. La CI Linux Node 22.19/24 exécute les mêmes tests et un compilateur officiel Luau 0.742 avec SHA-256 vérifié ; voir les checks de la PR pour son résultat.
- La composition corrigée localement est égale à la composition originale, son rendu Luau reste identique octet par octet, et ce script complet compile réellement. Les callbacks Luau ne sont jamais exécutés par le parseur JSON.
- [Test HTTP réel](http-proof.json) : demande locale « Anime Zero [Void Arbiter] », preset exact Full Hub, sans fichier ; recherche publique sans code admis, réponse `422 GAME_EVIDENCE_REQUIRED`, **0 appel IA**, aucun script renvoyé, environ **3,24 secondes** sur cet essai. Ce n'est pas un test dans Roblox.
- Une règle `.gitattributes` ciblée préserve les octets LF de la fixture scanner déjà revue. Le checkout Windows faisait sinon échouer son test CRLF. Aucun code de scanner ni hash de confiance n'est assoupli.

Les essais de génération utilisent des réponses auteur injectées. Aucune qualité réelle de modèle, économie en dollars, remboursement de tokens déjà consommés ou compatibilité en jeu n'est mesurée. Les requêtes normales avec preuves continuent à utiliser les fournisseurs existants.

## Activation et rollback

Correctif livré en PR indépendante, **non déployé en production**. Le site public continue d'utiliser sa version actuelle tant que le déploiement n'est pas approuvé. Après accord, déployer l'API et le frontend du même commit, vérifier le preset sans preuves (422, zéro appel), une composition avec preuve, les utilitaires UI et une correction de script existant. Revenir au déploiement précédent des deux applications pour annuler ; aucune migration de données n'est nécessaire.

Ce correctif ne transforme pas les fonctions inconnues d'Anime Zero en fonctionnalités prouvées. La PR Knowledge Engine V2 reste une livraison séparée pour développer la provenance, le stockage et les niveaux de vérification.
