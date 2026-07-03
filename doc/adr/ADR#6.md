# ADR-004 : Conteneurisation avec Docker

- **Statut** : Acceptée

## Contexte

Le système doit être facilement déployable sur différentes machines de développement et de production.

## Décision

Conteneuriser tous les services backend (Flask, PostgreSQL) avec Docker et orchestrer avec docker-compose.

## Conséquences

### Positives
- Portabilité garantie sur toutes les plateformes
- Isolation des dépendances
- Facilite le setup pour les nouveaux développeurs
- Environnement de développement identique à la production
- Versioning de l'infrastructure

### Négatives
- Courbe d'apprentissage pour Docker
- Overhead de ressources (CPU, mémoire)
- Complexité de debug dans les conteneurs
