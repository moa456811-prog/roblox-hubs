# 10 patterns Luau autonomes originaux

Chaque exemple est du **code générique** qui nécessite d'être intégré et adapté à l'environnement du jeu. Certains exemples sont uniquement clients ; aucun ne garantit le fonctionnement d'un Auto Farm dans un jeu dont les mécaniques sont inconnues. Aucun contrôle syntaxique `luau-compile` n'a été exécuté dans cet environnement faute de compilateur installé.

- `CooldownGate` : rythme d'appels borné, n'outrepasse pas les délais serveur.
- `BoundedRetry` : nombre maximum d'essais et arrêt explicite.
- `FiniteState` : transitions validées.
- `JanitorLite` : nettoyage d'événements et d'instances.
- `EventJournal` : historique local borné et sans identifiants secrets.
- `ProofDelta` : preuve de progression sur compteurs observables.
- `BossObservation` : données d'apparition/mort observées, pas de délais inventés.
- `TargetSelector` : choix dans une liste de cibles identifiées.
- `CharacterRebinder` : reconnexion après respawn, arrêt propre.
- `FixedBuffer` : buffer circulaire pour journaux bornés.

Le générateur ScriptRush doit distinguer **exemple pédagogique**, **composant testé**, et **intégration prouvée dans le jeu**.
