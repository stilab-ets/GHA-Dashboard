# ADR-006 : Conservation d'une logique centralisée dans background.js

- **Statut** : Accepté
- **Date** : 2026-07-15

## Contexte

Le script `background.js` constitue le point d'entrée principal de l'extension et regroupe la majorité de la logique métier.

Une architecture plus modulaire, répartissant les fonctionnalités dans plusieurs fichiers, a été envisagée afin d'améliorer la séparation des responsabilités.

Cependant, cette approche aurait nécessité une adaptation importante de la configuration de construction de l'extension ainsi que la gestion de nombreuses dépendances entre les modules. Étant donné la taille du projet et les contraintes de temps, cette réorganisation n'apportait pas de bénéfice suffisant.

## Décision

Conserver une logique principalement centralisée dans le fichier `background.js`.

Les fonctionnalités restent organisées par sections logiques à l'intérieur du fichier afin de préserver la lisibilité sans complexifier la configuration du projet.

## Conséquences

### Avantages

- Configuration de construction plus simple.
- Réduction de la complexité liée à l'assemblage de nombreux modules.
- Développement plus rapide.
- Limitation des risques d'erreurs de configuration.

### Inconvénients

- Fichier de grande taille.
- Lisibilité qui peut diminuer avec l'évolution du projet.
- Séparation des responsabilités moins marquée qu'une architecture modulaire.