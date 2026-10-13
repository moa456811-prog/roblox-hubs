# Niveaux de vérification affichés à l'utilisateur

Aucune estimation probabiliste ne doit être présentée comme une certification de réussite.

| État | Affichage recommandé | Vérification requise | Limite |
|---|---|---|---|
| `DRAFT` | Code généré — non vérifié | Fichiers persistés | Pas de test |
| `SYNTAX_PASSED` | Compilation Luau réussie | `luau-compile` exécuté et code de retour 0 | Pas de preuve Roblox |
| `MOCK_PASSED` | Tests logiques simulés réussis | Assertions sur les mêmes fichiers versionnés | Les mocks ne sont pas un vrai jeu |
| `REPORTED_GAME_PASS` | Réussite signalée par le testeur | Log/feedback horodaté, version et scénario | Résultat rapporté, non indépendant |
| `OBSERVED_GAME_PASS` | Réussite observée dans la session testée | Runner autorisé ou observation instrumentée + assertions | Ne couvre pas toutes les versions/serveurs |
| `UNVERIFIABLE` | Mécanisme non vérifiable avec les informations disponibles | Raison explicite | Ne jamais inventer l'API manquante |

## Exigences minimales en jeu

- Auto Farm : prise de quête confirmée + cible identifiable + progrès observé + sortie propre après mort/reconnexion.
- Auto Boss : cible réellement vivante, attaque acceptée, récompense confirmée si attendue, pas de boucle à vide.
- Auto Fish : lancer/hameçon/récompense détectés sans actions fantômes.
- Inventaire : delta d'objet/monnaie observé, et pas seulement un clic dans l'UI.
- Auto Sell : vente réellement confirmée, pas de déduction fondée sur la seule disparition visuelle d'un objet.

**L'attribut `game_functionality_verified=true` ne doit pas être réglé à partir d'une documentation, de GitHub ou d'un compilateur seul.** Un test réussi sur une version n'autorise pas l'affirmation « 100 % garanti pour toujours ».
