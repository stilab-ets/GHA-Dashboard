# ADR-005 : Utilisation conjointe de l'authentification OAuth et des Personal Access Tokens

- **Statut** : Accepté
- **Date** : 2026-07-15

## Contexte

L'application doit accéder aux API GitHub afin de récupérer les données nécessaires au fonctionnement du tableau de bord.

L'authentification OAuth représente la solution retenue pour les utilisateurs finaux puisqu'elle respecte les bonnes pratiques de GitHub.

Toutefois, durant le développement, effectuer un cycle OAuth complet à chaque exécution ralentit les tests et le débogage. Les développeurs disposent déjà de Personal Access Tokens (PAT) permettant un accès rapide aux API.

## Décision

Supporter deux modes d'authentification :

OAuth pour l'utilisation normale de l'application ;
Personal Access Token (PAT) pour faciliter le développement et les tests.

Les deux mécanismes utilisent ensuite les mêmes services d'accès à l'API GitHub.

## Conséquences

### Avantages

- Développement plus rapide grâce aux PAT.
- Respect des bonnes pratiques en production avec OAuth.
- Réduction du temps nécessaire aux tests manuels.
- Flexibilité selon le contexte d'utilisation.

### Inconvénients

- Deux mécanismes d'authentification doivent être maintenus.
- Documentation plus importante.
- Complexité légèrement supérieure dans la configuration.