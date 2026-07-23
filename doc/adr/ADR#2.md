# ADR-002 : Adoption de `webextension-polyfill` pour la compatibilité multi-navigateurs

- **Statut** : Accepté
- **Date** : 2026-07-04

## Contexte

L'extension était initialement développée à l'aide de l'API `chrome.*`, disponible sur les navigateurs basés sur Chromium.

Toutefois, Firefox privilégie l'utilisation de l'API standard `browser.*`, qui présente certaines différences de comportement, notamment l'utilisation des Promises plutôt que des callbacks.

Maintenir deux implémentations distinctes ou ajouter de nombreuses conditions dans le code aurait augmenté sa complexité et son coût de maintenance.

## Décision

Intégrer la bibliothèque `webextension-polyfill` afin d'utiliser une API unifiée basée sur l'objet `browser`.

Cette bibliothèque fournit une couche d'abstraction permettant :

- d'utiliser l'API `browser.*` sur les navigateurs Chromium;
- d'obtenir un comportement uniforme entre les navigateurs;
- d'utiliser des Promises avec les API des extensions.

L'ensemble des appels aux API des extensions est désormais effectué via l'objet `browser`.

## Conséquences

### Avantages

- Une seule base de code est maintenue pour tous les navigateurs supportés.
- Le code est plus lisible grâce à l'utilisation des Promises et de `async/await`.
- Les différences entre les implémentations Chromium et Firefox sont largement masquées.
- L'ajout du support d'autres navigateurs compatibles avec les WebExtensions est facilité.

### Inconvénients

- Une dépendance supplémentaire est ajoutée au projet.
- Une migration du code existant est nécessaire pour remplacer les appels `chrome.*` par `browser.*`.
- Certaines différences spécifiques entre les navigateurs peuvent tout de même nécessiter des adaptations ponctuelles.