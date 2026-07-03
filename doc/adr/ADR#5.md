# ADR-003 : Extension Chrome plutôt qu'application web standalone

- **Statut** : Acceptée

## Contexte

Le tableau de bord doit être accessible facilement par les développeurs lors de leur consultation de GitHub.

## Décision

Développer une extension Chrome qui s'intègre directement dans l'interface GitHub.

## Conséquences

### Positives
- Intégration native dans le workflow GitHub existant
- Pas besoin de changer d'onglet ou d'application
- Accès direct aux informations du dépôt en cours de consultation
- Expérience utilisateur fluide et cohérente

### Négatives
- Limité au navigateur Chrome (pas Firefox, Safari, Edge)
- Dépendance aux API de Chrome Extension
- Nécessite l'installation d'une extension
- Moins de contrôle sur l'environnement d'exécution
