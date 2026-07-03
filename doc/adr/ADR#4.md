# ADR-002 : PostgreSQL pour la persistance

- **Statut** : Acceptée

## Contexte

Le système nécessite un stockage persistant pour l'historique des métriques et permettre des analyses temporelles.

## Décision

Utiliser PostgreSQL comme base de données relationnelle.

## Conséquences

### Positives
- Base de données robuste et éprouvée
- Support natif des requêtes complexes et agrégations
- Excellente intégration avec Python (Flask)
- Open source et bien documentée
- Support des index pour optimiser les requêtes de filtrage

### Négatives
- Overhead pour de petits volumes de données
- Nécessité de gérer les migrations de schéma
- Alternative time-series DB (InfluxDB) pourrait être plus adaptée pour les séries temporelles
