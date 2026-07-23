# ADR-004 : Ajout de tests de bout en bout avec Playwright

- **Statut** : Accepté
- **Date** : 2026-07-15

## Contexte

Le projet comporte une interface utilisateur complexe reposant sur React ainsi qu'une extension de navigateur interagissant avec GitHub.

Les tests unitaires existants permettent de vérifier certaines fonctionnalités isolées, mais ils ne couvrent pas les interactions complètes entre l'interface, l'extension et le backend.

Plusieurs outils de tests automatisés ont été étudiés. Playwright offre notamment un bon support des navigateurs Chromium, utilisés par le projet.

## Décision

Mettre en place une suite de tests de bout en bout avec Playwright afin de valider les principales fonctionnalités du tableau de bord et de l'extension.

Ces tests sont intégrés au pipeline d'intégration continue afin de détecter rapidement les régressions.

## Conséquences

### Avantages

- Validation automatique des scénarios utilisateurs.
- Détection précoce des régressions.
- Amélioration de la qualité globale du projet.

### Inconvénients

- Temps d'exécution des tests plus élevé.
- Maintenance supplémentaire lors des évolutions de l'interface.
- Mise en place plus complexe que des tests unitaires.
- Pas de support Playwright des extensions sur Firefox, tous les tests devront être strictement sur chromium