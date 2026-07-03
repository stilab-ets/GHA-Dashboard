# ADR-001 : Architecture en trois couches (Chrome + Flask (analyse) + Flask (extraction))

- **Statut** : Acceptée

## Contexte

Le système doit séparer les responsabilités : extraction des données, analyse/traitement, et visualisation.

## Décision

Adopter une architecture en trois couches :
- **Flask** : Couche d'extraction (interface avec GHAminer et GitHub API), couche d'analyse et couche d'agrégation
- **Extension Chrome** : Couche de présentation et visualisation

## Conséquences

### Positives
- Séparation claire des responsabilités
- Scalabilité : chaque couche peut évoluer indépendamment
- Facilite les tests unitaires par composant
- Réutilisabilité : Flask peut servir d'autres clients que Chrome
- Spécialisation technologique (Python pour extraction et analyse)

### Négatives
- Complexité accrue du déploiement (3 services)
- Latence potentielle due aux multiples appels HTTP
- Nécessité de gérer la synchronisation entre services
