# LOG-680 : Template for Oxygen-CS

Ce laboratoire vise à finaliser le pipeline d'intégration et de déploiement continu (CI/CD) de l'application Oxygène CS tout en mettant en place une supervision efficace à l'aide de Grafana. Les objectifs principaux incluent le déploiement du contrôleur HVAC et de MetricsAPI sur un cluster Kubernetes et le suivi des métriques de performance et d'utilisation.

## Membres de l'équipe

- **Membre 1** : ALJANE Fatma
- **Membre 2** : Nagendran Vyshmi
- **Membre 3** : Mayorga Rodriguez Jennifer

## Prérequis
Python 3.8+
pipenv
Docker (pour la conteneurisation)
PostgreSQL (pour la gestion des données)
Fichier kubeconfig.yaml
kubectl
Acces a Grafana


## Démarrage

installez les dépendances du projet :

```bash
pipenv install
```

## Setup

Les variables d'environnement suivantes doivent être définies dans la classe App :

- HOST : L'adresse du hub de capteurs et du système CVC.
- TOKEN : Jeton pour l'authentification des requêtes.
- T_MAX : Température maximale tolérée avant intervention du système.
- T_MIN : Température minimale tolérée.
- DATABASE_URL : URL de connexion à la base de données PostgreSQL pour le stockage des données de température et des événements CVC.

Vous pouvez configurer ces variables dans un fichier .env pour un accès plus sécurisé et une portabilité améliorée.

## Pipeline CI/CD et Conteneurisation
Ce projet inclut une intégration continue (CI) pour automatiser les tests et la publication de l'image Docker. Voici les étapes du pipeline CI/CD :

1. Tests unitaires et d'intégration : À chaque push ou pull request, le pipeline exécute les tests pour garantir que les modifications n'introduisent pas de bugs.
2. Création d'image Docker : L'application est empaquetée dans une image Docker et étiquetée pour Docker Hub.
3. Déploiement continu : L'image Docker est automatiquement poussée vers Docker Hub, prête à être déployée sur un serveur.
4. Deploiement Kubernetes : Les configurations définies dans des fichiers YAML (Deployments, Services, Ingress) sont appliquées au cluster Kubernetes via GitHub Actions, garantissant un déploiement automatisé et cohérent.
5. Verification deploiement : L’état des ressources est surveillé à l’aide de commandes Kubernetes (kubectl), tandis que les métriques collectées sur Grafana permettent de valider que les déploiements fonctionnent correctement et répondent aux attentes.


## Pré-commit Hook Configuration
Pour assurer la qualité et la conformité du code avant chaque commit, nous avons mis en place un hook pre-commit. Ce hook effectue des vérifications automatiques, notamment :

- Correction d'espaces superflus en fin de ligne
- Validation YAML pour vérifier la syntaxe des fichiers YAML
- Formatage de code avec Black pour assurer une uniformité de style
- Linting avec Flake8 et Pylint pour détecter les erreurs et améliorer la qualité du code
- Exécution des tests unitaires avec Pytest pour s'assurer que le code ne contient pas de bugs avant d'être poussé
  
### Installation de pre-commit
Si vous n'avez pas pre-commit installé, commencez par l'installer via pip :

```bash
pip install pre-commit
```

### Fichier .pre-commit-config.yaml
Le fichier .pre-commit-config.yaml contient la configuration pour les hooks suivants :

- trailing-whitespace : Supprime les espaces en fin de ligne
- end-of-file-fixer : Assure une ligne vide en fin de fichier
- check-yaml : Vérifie la validité des fichiers YAML
- check-added-large-files : Empêche d'ajouter des fichiers volumineux par erreur
- Black : Formate le code Python
- Flake8 et Pylint : Analyzent le code pour détecter des erreurs et des problèmes de style
- Pytest : Exécute les tests unitaires pour vérifier que le code fonctionne comme prévu

Ces vérifications permettent de maintenir un code propre, bien formaté et exempt d'erreurs potentielles.

### Deploiement Kubernetes
Déploiement Kubernetes pour héberger l'application Oxygène CS dans un environnement de production. Voici les étapes du déploiement Kubernetes :

1. Configuration ressources Kubernetes : Les configurations YAML spécifient les déploiements pour orchestrer les pods, les services pour les communications internes, et les ingress pour rendre l'application accessible.
2. Configuration des parametre de l'application : Les ConfigMaps et Secrets permettent d'externaliser les variables d’environnement, garantissant une configuration sécurisée et adaptable pour les seuils de température et les données sensibles.
3. Automatisation du deploiement : GitHub Actions utilise kubectl et le fichier kubeconfig.yaml pour déployer automatiquement les configurations nécessaires sur le cluster Kubernetes.
4. Verification et suivi des deploiements : L'état des ressources est supervisé grâce aux commandes kubectl, tandis que Grafana fournit des métriques pour vérifier la performance et la stabilité de l'application.

Cette approche garantit un déploiement fiable, sécurisé et entièrement automatisé de l'application dans un environnement de production. Elle permet également de surveiller en permanence les performances grâce à l'intégration de Kubernetes et Grafana.

###  Grafana
Grafana est utilisé pour surveiller en temps réel les performances de l’application Oxygène CS et ses processus associés. Voici les étapes pour configurer cette supervision :

1. Configuration de la source de données : Reliez Grafana à la base de données PostgreSQL pour accéder aux métriques collectées par l’application.
2. Creation de tableau de bord : Développez des dashboards adaptés soit les métriques HVAC soit Suivi des températures et événements du système HVAC et CI/CD - Indicateurs de performance du pipeline CI/CD, comme les taux de succès des builds et les durées moyennes.
3. Mises à jour  : Les tableaux de bord sont actualisés en temps réel pour fournir une vue précise de l’état de l’application. L’accès à Grafana est assuré via une URL, permettant une surveillance continue
Tableau : Evenements HVAC, Temperature en fonction du temps, Kanban metrics, Pull requests par jours, CD/Metrics, Les pull requests

Ce système de monitoring garantit une visibilité complète et en temps réel, facilitant la gestion proactive et l’optimisation des performances de l’application.

## Lancement du Programme

Après la configuration, démarrez l'application avec la commande suivante :

```bash
pipenv run start
```
Pour exécuter l'application dans un conteneur Docker :
Construisez l'image Docker :
```bash
docker-compose up --build
docker-compose up
```
Apres deploiement sur Kubernetes, pour acceder a l'application : 
```bash

```
## Journalisation
L'application journalise les événements critiques, comme l'ouverture et la fermeture des connexions, les erreurs et les actions du système CVC, pour faciliter le dépannage et le suivi du bon fonctionnement.

## Licence
Ce projet est sous licence MIT.


## To Implement

There are placeholders in the code for sending events to a database and handling request exceptions. These sections should be completed as per the requirements of your specific application.

## License

MIT

## Contact

For more information, please feel free to contact the repository owner. 
