# Coûts et intégration progressive

- **Gratuit localement** : SQLite FTS5, catalogue, recettes, Python stdlib, mocks, classement de sources et tests unitaires.
- **Potentiellement gratuit dans les quotas existants** : métadonnées publiques et import périodique GitHub, stockage limité, calcul statique. Respecter le rate limiting et le droit d'accès aux sources.
- **Coûts variables** : tokens IA pour générer/réviser de gros scripts, bases vectorielles payantes, cloud sandboxes, hébergement Vercel selon conditions de plan, stockage volumineux et nombreux utilisateurs.
- **Optimisation prioritaire** : cache par jeu/version, FTS5, 5-10 extraits pertinents plutôt que des milliers, patchs ciblés, et compilation locale avant de déclencher une nouvelle requête IA.
- Ne promettre ni « hébergement illimité gratuit » ni « 100 % de scripts corrects ». Mesurer coût par génération et taux de réussite en jeu.
