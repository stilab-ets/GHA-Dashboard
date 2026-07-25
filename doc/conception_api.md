# Conception de l'API (v0.1.0)
## Tables des matières

- **[Introduction](#introduction)**
- **[Requêtes HTTP](#requêtes-http)**
- **[Messages WebSockets](#messages-websockets)**
- **[Représentation des données](#représentation-des-données)**

## Introduction
Ce document décrit le protocole de communication actuellement utilisé entre le client
(browser extension) et le backend Python du projet GHA Dashboard.

Il remplace l’ancien contrat basé sur une simple connexion WebSocket vers un dépôt
par une approche plus explicite en deux étapes :

1. le client crée une session d’extraction via une requête HTTP ;
2. le backend renvoie ensuite un flux de messages WebSocket associé à cette session.

Le document ci-dessous sert de référence fonctionnelle pour l’implémentation,
la validation et l’évolution future du protocole.

## Requêtes HTTP

### POST /api/extractions

#### Description
Crée une session d’extraction pour un dépôt GitHub donné. La réponse contient un
identifiant de session qui sera utilisé pour ouvrir une connexion WebSocket.

#### En-têtes
- **Authorization** (*string*, obligatoire) :
  - Valeur de type `Bearer <token>`.
  - Le token est utilisé par le backend pour interroger l’API GitHub.

#### Corps de la requête
```json
{
  "repo": "owner/repo",
  "filters": {
    "aggregationPeriod": "day",
    "startDate": "2025-01-01",
    "endDate": "2025-01-31",
    "workflowIds": [1234, 5678],
    "author": "alice",
    "branch": "main",
    "workflowName": "CI",
    "fetchJobDetails": true,
    "forceRefresh": false
  }
}
```

#### Paramètres de filtres
- **aggregationPeriod** (*"day" | "week" | "month"*) :
  - Période utilisée par le backend pour la logique d’agrégation.
  - Valeur par défaut : `day`.
- **startDate** / **endDate** (*date ISO*, optionnels) :
  - Limite la plage temporelle des runs récupérés.
- **workflowIds** (*number[]*, optionnel) :
  - Filtre les runs sur une liste d’identifiants de workflow.
- **author** / **branch** / **workflowName** (*string*, optionnels) :
  - Filtres complémentaires applicables au moment de la collecte et du chargement.
- **fetchJobDetails** (*boolean*, optionnel) :
  - Si `true`, le backend collecte également les détails des jobs après la phase
    de récupération des runs.
- **forceRefresh** (*boolean*, optionnel) :
  - Si `true`, le backend ignore les données déjà présentes en cache et relance
    une collecte complète.

#### Réponse
```json
{
  "success": true,
  "extractionId": "<session-id>"
}
```

#### Erreurs possibles
- `401 Unauthorized` si le token d’authentification est absent ou invalide.
- `400 Bad Request` si le dépôt n’est pas au format `owner/repo`.

---

### GET /api/data/check/<path:repositoryName>

#### Description
Vérifie si des données existent déjà pour un dépôt et retourne des métadonnées
associées, après application des filtres de portée.

#### Paramètres
- **repositoryName** (*path*, obligatoire) :
  - Le dépôt ciblé au format `owner/repo`.
- **start**, **end**, **workflowIds**, **workflow_ids** (*query params*, optionnels) :
  - Permettent de filtrer les runs avant la vérification.

#### Réponse
```json
{
  "exists": true,
  "totalRuns": 128,
  "runsWithJobs": 94,
  "lastUpdated": "2026-07-03T12:34:56"
}
```

---

### GET /api/data/load/<path:repositoryName>

#### Description
Charge les runs déjà présents en stockage local pour un dépôt, en appliquant les
filtres de portée fournis dans la requête.

#### Paramètres
- **repositoryName** (*path*, obligatoire)
- **start**, **end**, **workflowIds**, **workflow_ids** (*query params*, optionnels)

#### Réponse
```json
{
  "runs": [
    {
      "id": 123456789,
      "name": "CI",
      "status": "completed"
    }
  ],
  "totalRuns": 1
}
```

---

### GET /api/workflows/<path:repositoryName>

#### Description
Retourne la liste des workflows GitHub associés à un dépôt, à partir de l’API GitHub.

#### Paramètres
- **repositoryName** (*path*, obligatoire) : dépôt au format `owner/repo`.

#### Réponse
```json
{
  "workflows": [
    {
      "id": 42,
      "name": "CI",
      "path": ".github/workflows/ci.yml",
      "state": "active"
    }
  ]
}
```

---

### GET /health

#### Description
Point de contrôle de santé du backend.

#### Réponse
```json
{
  "status": "ok",
  "service": "GHA Dashboard Backend (GHAminer)",
  "ghaminer_configured": true
}
```

### Connexion WebSocket initiale
Après la création d’une session via `POST /api/extractions`, le client ouvre une
connexion WebSocket vers :

```text
ws://<host>:<port>/data/<extractionId>
```

Le chemin est l’identifiant retourné par l’endpoint HTTP précédent. Cette
connexion est ensuite utilisée pour recevoir les messages de progression et les
résultats de collecte.

## Messages WebSockets

### Comportement général
- Le serveur envoie des messages au client au fur et à mesure de la collecte.
- Les messages envoyés par le client sont actuellement ignorés par le backend.
- La connexion est fermée à la fin de la collecte, en cas d’erreur ou si la session
  d’extraction expire.

### Types de messages

#### `runs`
Message de contenu principal, envoyé par lots pendant la phase de collecte des runs,
puis pendant la phase d’enrichissement par les jobs.

```json
{
  "type": "runs",
  "data": [
    {
      "id": 123456789,
      "name": "CI",
      "status": "completed"
    }
  ],
  "page": 1,
  "hasMore": true,
  "phase": "workflow_runs",
  "totalRuns": 128,
  "newRuns": 50,
  "existingRuns": 78,
  "elapsed_time": 12.3,
  "eta_seconds": 45.0
}
```

#### `phase_complete`
Indique la fin d’une phase de collecte.

```json
{
  "type": "phase_complete",
  "phase": "workflow_runs",
  "totalRuns": 128,
  "newRuns": 50,
  "existingRuns": 78,
  "elapsed_time": 20.5
}
```

#### `job_progress`
Indique l’avancement de la collecte des jobs pendant la seconde phase.

```json
{
  "type": "job_progress",
  "runs_processed": 64,
  "total_runs": 128,
  "jobs_collected": 320,
  "elapsed_time": 45.2,
  "eta_seconds": 30.0
}
```

#### `complete`
Signale la fin complète de la session d’extraction.

```json
{
  "type": "complete",
  "phase": "jobs",
  "totalRuns": 128,
  "newRuns": 50,
  "existingRuns": 78,
  "totalJobs": 320,
  "elapsed_time": 70.0
}
```

#### `error`
Signale une erreur côté serveur.

```json
{
  "type": "error",
  "message": "GitHub token required. Please configure it in the Chrome extension popup."
}
```

#### `keepalive`
Message facultatif envoyé périodiquement pour éviter la coupure de la connexion
pendant les longues attentes liées aux limites de l’API GitHub.

```json
{
  "type": "keepalive",
  "message": "Connection alive - waiting for API rate limit..."
}
```

#### `log`
Message de diagnostic utilisé par le backend pour signaler des événements de
progression internes.

```json
{
  "type": "log",
  "message": "Phase 2: Still collecting job details... 64/128 runs processed"
}
```

## Représentation des données

### `ExtractionFilters`
```json
{
  "aggregationPeriod": "day",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "workflowIds": [1234, 5678],
  "author": "alice",
  "branch": "main",
  "workflowName": "CI",
  "fetchJobDetails": true,
  "forceRefresh": false
}
```

### `WorkflowRun`
```json
{
  "id": 123456789,
  "name": "CI",
  "display_title": "CI #42",
  "head_branch": "main",
  "status": "completed",
  "conclusion": "success",
  "event": "push",
  "workflow_id": 42,
  "workflow_name": "CI",
  "run_number": 42,
  "run_attempt": 1,
  "created_at": "2026-01-01T12:00:00Z",
  "updated_at": "2026-01-01T12:05:00Z",
  "html_url": "https://github.com/owner/repo/actions/runs/123456789",
  "duration": 300,
  "jobs": []
}
```

### `Job`
```json
{
  "id": 987654321,
  "run_id": 123456789,
  "name": "build",
  "status": "completed",
  "conclusion": "success",
  "started_at": "2026-01-01T12:01:00Z",
  "completed_at": "2026-01-01T12:04:00Z",
  "html_url": "https://github.com/owner/repo/runs/987654321",
  "runner_name": "GitHub Actions",
  "runner_group_name": "Default"
}
```

### `ExtractionSession`
```json
{
  "extractionId": "<session-id>",
  "repo": "owner/repo",
  "filters": {
    "fetchJobDetails": true
  },
  "expires_at": 1719931200
}
```

### Notes de cohérence
- Les objets `WorkflowRun` sont le format de données principal transporté par les
  messages `runs`.
- Les jobs sont optionnels et ne sont présents que si la collecte a été demandée
  via `fetchJobDetails`.
- Le backend peut envoyer plusieurs messages `runs` pour un même run au cours
  d’une collecte, notamment lors de la phase d’enrichissement des jobs.
- La session d’extraction est temporaire et expire après une durée limitée.
