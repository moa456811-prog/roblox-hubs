# Aucun fichier du jeu obligatoire : parcours game-link-first

**Entrée minimale** : utilisateur colle une URL Roblox, par exemple `https://www.roblox.com/games/12345/MonJeu`, et écrit ce qu'il veut.

**Données que l'on peut chercher sans fichier** : identifiant du jeu, titre, description publique, créateur, date de mise à jour si publique, dépôts GitHub candidats, documentations et exemples permissifs de bibliothèques génériques.

**Données que cela NE donne pas** : contenu serveur privé, noms/arguments réels des remotes, validation serveur, routines internes de combat, disponibilité des quêtes, valeur du cooldown réel, ni garantie que le jeu fonctionne comme sa description.

## Parcours proposé

1. Vérifier le Place ID et le Universe ID avec données publiques ; sinon `identity_unavailable` au lieu d'un faux titre.
2. Extraire des mots clés descriptifs **sans en déduire automatiquement** qu'une fonction existe dans le jeu.
3. Chercher des projets GitHub par nom du jeu : **candidats**, non preuves. Vérifier URL, licence, modification récente, code de la version correspondante.
4. Faire correspondre la demande au catalogue et à des recettes (quest, boss, pathfinding, loot...). Choisir explicitement `executor_client` ou `game_project_full`.
5. Générer seulement les mécanismes justifiables. Si l'implémentation du jeu est inconnue : produire une interface d'adaptation + conditions explicites de test, ou déclarer qu'un script réellement fonctionnel ne peut pas encore être prouvé.
6. Compiler/valider les fonctions génériques. Retourner des niveaux de preuves concrets plutôt qu'une note fictive 100/100.
7. Facultatif : diagnostic *en lecture seule* dans la session du joueur, avec consentement ; l'outil ne reçoit que ce qui est observable côté client. La connexion automatisée au site n'est PAS incluse dans ce pack.
8. Le propriétaire/testeur fournit les résultats réels : quête acceptée, cible vaincue, récompense enregistrée, etc. Réparer à partir du code existant et d'une preuve de défaillance, pas en repartant de zéro.

## Pourquoi « 100 % automatique » ne peut pas être promis

Un script peut compiler et rester incapable d'effectuer l'action : la validation des dégâts, les quêtes et les données sensibles relèvent souvent du serveur. Sans tester un comportement observé dans le jeu, le meilleur résultat honnête est un script *préparé et vérifié statiquement*, pas « garanti fonctionnel ». Une mise à jour du jeu peut invalider un script qui fonctionnait auparavant.
