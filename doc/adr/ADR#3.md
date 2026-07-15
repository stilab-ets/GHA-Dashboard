# ADR-003 : Utilisation du format JSON pour le stockage local

- **Statut** : Accepté
- **Date** : 2026-07-15

## Contexte

L'extension conserve localement certaines données générées lors de l'analyse des dépôts GitHub. Une réflexion a été menée afin de déterminer le format de stockage le plus approprié.

Plusieurs solutions ont été envisagées :

-des fichiers CSV ;
-une base de données SQL embarquée ;
-des fichiers JSON.

Le projet disposait déjà d'un mécanisme de lecture et d'écriture des données au format JSON utilisé par le backend. Modifier cette couche de persistance aurait nécessité de réécrire une partie importante du code existant sans apporter de bénéfice fonctionnel significatif.

## Décision

Conserver le stockage local au format JSON.

Les données sont enregistrées et relues directement sous forme de fichiers JSON, en réutilisant l'implémentation existante.*

## Conséquences

### Avantages

- Réutilisation complète du mécanisme de lecture et d'écriture existant.
- Réduction de l'effort de développement.
- Limitation des risques de régression.
- Format simple à manipuler et à déboguer.

### Inconvénients

- Les performances sont moins bonnes qu'une base de données pour de très grands volumes de données.
- Le format est moins adapté aux requêtes complexes.
- Les fichiers peuvent devenir volumineux avec l'augmentation des données stockées.