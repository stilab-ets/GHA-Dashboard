# BrokerX - Documentation d’Architecture (Arc42)

Projet réalisé dans le cadre du cours LOG795 – Projet de fin d’études en génie logiciel
Ce document suit la structure **arc42** pour documenter l’architecture du GitHub Actions Dashboard.

---

## 1. Introduction et Objectifs

### Panorama des exigences


### Objectifs qualité

| Priorité | Objectif qualité | Scénario |
|----------|------------------|----------|
| 1 |  | |

### Parties prenantes

---

## 2. Contraintes d’architecture

| Contrainte | Description |
|------------|-------------|
|  |  |

---

## 3. Portée et contexte du système

### Analyse des cas d’utilisation (CU)

#### CU-01 : Inscription et vérification d'identité

Ce cas d’utilisation décrit ...

**Scénario principal (succès) :**

**Scénarios alternatifs et exceptions :**

**Postconditions :**

**Hypothèses :**

---

### MoSCoW des CU

#### Must-Have

#### Should-Have

#### Could-Have


### Glossaire (Ubiquitous Language)
| Terme | Définition |
|-------|------------|
| **MFA** | Multi-Factor Authentication : Méthode d’authentification nécessitant plusieurs preuves d’identité. |

### Diagramme de contexte

### Esquisse du modèle de domaine

---

## 4. Stratégie de solution

| Problème | Approche |
|----------|----------|
| **Gestion des données** | PostgreSQL |

---

## 5. Vue des blocs de construction
### Composants principaux

- Diagramme de classes :

- Diagramme de components : 

---

## 6. Vue d'exécution

- Diagramme d'exécution pour le CU-01 :  

---

## 7. Vue de déploiement

---

## 8. Concepts transversaux

- **Extension Google Chrome** : Agrégats (Client, Portefeuille, Ordre, Transaction) avec règles métiers encapsulées.

---

## 9. Décisions d'architecture

### ADR-001 : Choix d’architecture ...

#### Statut
Acceptée

#### Contexte


#### Décision

#### Conséquences
##### Positives :


##### Négatives :

---

## 10. Exigences qualité

### Performance


### Disponibilité (estimé)

---

## 11. Risques et dettes techniques

---

## 12. Glossaire

| Terme | Définition |
|-------|------------|
| **Frontend** | Partie de l’application avec laquelle l’utilisateur interagit directement (interface utilisateur). |
| **Backend** | Partie de l’application qui gère la logique métier, les données et les opérations côté serveur. |
| **CD** | Continuous Deployment : Pratique où chaque modification validée (et testée automatiquement) est déployée en production de manière automatisée, sans intervention manuelle. |
| **CI** | Continuous Integration : Pratique consistant à intégrer souvent le code dans la branche principale, avec exécution automatisée des tests pour détecter rapidement les erreurs. |