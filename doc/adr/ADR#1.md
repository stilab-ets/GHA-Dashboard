# ADR-001 : Séparation des fichiers Manifest par navigateur

- **Statut** : Accepté
- **Date** : 2026-07-04

## Contexte

L'extension doit être compatible avec plusieurs navigateurs, notamment les navigateurs basés sur Chromium (Google Chrome, Microsoft Edge, etc.) ainsi que Firefox.

Bien que ces navigateurs utilisent le format Manifest V3, certaines différences existent dans leur implémentation, notamment au niveau des permissions, de certaines clés du manifeste et des fonctionnalités supportées.

Une approche consistant à maintenir un unique fichier `manifest.json` avec des traitements conditionnels lors de la génération a été envisagée. Cependant, cette solution rend le manifeste plus complexe à maintenir et augmente les risques d'erreurs lors de l'ajout de nouvelles fonctionnalités.

## Décision

Créer un fichier manifeste distinct pour chaque navigateur :

- `manifest.chromium.json`
- `manifest.firefox.json`

Le processus de construction sélectionne automatiquement le manifeste approprié selon le navigateur ciblé.

Chaque manifeste contient uniquement les configurations nécessaires à sa plateforme tout en conservant une structure similaire afin de faciliter leur évolution.

## Conséquences

### Avantages

- Les manifestes demeurent simples et faciles à comprendre.
- Les différences entre Chromium et Firefox sont clairement identifiées.
- Les adaptations spécifiques à un navigateur n'impactent pas les autres plateformes.
- La maintenance est facilitée lors de l'évolution de l'extension.

### Inconvénients

- Certaines informations sont dupliquées entre les deux fichiers.
- Les modifications communes doivent être répercutées dans chaque manifeste.
- Il faut s'assurer que les deux fichiers restent cohérents au fil des évolutions.