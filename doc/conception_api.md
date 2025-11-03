# Conception de l'API (v0.0.1)
## Tables des matières

- **[Introduction](#introduction)**
- **[Requêtes HTTP](#requêtes-http)**
- **[Messages WebSockets](#messages-websockets)**
- **[Représentation des données](#représentation-des-données)**

## Introduction
Ce document contient des descriptions détaillées de tout les aspect en rapport
à la communication entre le client et le serveur, soit:

- Toutes les requêtes HTTP, incluant leur route, leurs paramètres obligatoires
et leurs paramètres optionnels, ainsi que leur réponse
- Tous les messages envoyés sur les WebSockets
- Tous le format des données échangées dans les deux cas

Le présent document sert de contrat entre le client et le serveur qui
facilitera l'implémentation en parallèle par différents membres de l'équipe.

## Requêtes HTTP

### GET /data/\<path:repositoryName\>

#### Description
Cette requête lance une nouvelle connexion WebSocket qui renverra en temps réel
obtenues à partir de GHAMiner.

> [!CAUTION]
> Cette requête doit absolument être utilisée pour établir une connection
> WebSocket avec le serveur et ne peut pas être utilisée comme requête HTTP
> normale. En Vanilla Javascipt, on peut établir cette connection ainsi:
>
> ```js
> let ws = new Websocket("ws://<host>:<port>/data/<repository>");
> ```

#### Paramètres
Tout les paramètres doivent être encodé selon les spécifications pour les
paramètres dans un URI ([RFC 3986 (section 2)](https://datatracker.ietf.org/doc/html/rfc3986#section-2)).

> [!NOTE]
> En pratique, utiliser la fonction [`encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
> de Javascript pour chaque paramètre afin de s'assurer de ne pas utiliser un
> charactère réservé.

- **Obligatoires**
  - **repositoryName** (*path*):
    - Le nom du dépôt de code que l'on veut analyser.

- **Optionels**
  - **aggregationPeriod** (*"day" | "week" | "month"*):
    - **Par défaut**: "month"
    - Période sur laquelle on agrège les données.
  - **startDate** (*date*):
    - La date de début des données.
  - **endDate** (*date*):
    - La date de fin des donnnées.
  - **author** (*string*):
    - Filtre sur le nom d'utilisateur de la personne ayant déclenché la run.
  - **branch** (*string*):
    - Filtre sur la branche qui est utilisé pour la run.
  - **workflowName** (*string*):
    - Filtre sur le workflow qui est utilisé pour la run.

#### Retour
Voir la section appropriée sur les WebSockets.

#### Exemples de requêtes
- Requête pour aller chercher toutes les données disponibles sur le dépôt
  `rust-lang/crates.io`:
  ```
  /data/rust-lang/crates.io
  ```
- Requête pour aller chercher les données agrégées selon la semaine pour le
  dépot `rust-lang/crates.io`:
  ```
  /data/rust-lang/crates.io?aggregationPeriod=week
  ```
- Requête avec tous les filtres:
  ```
  /data/rust-lang/crates.io?aggregationPeriod=week&startDate=2025-10-01&endDate=2025-10-31&workflowName=CI&author=Gaubbe&branch=main
  ```


### Messages WebSockets

### /data/\<path:repositoryName\>
Après la connection initial au WebSocket, le serveur PEUT envoyer un message de
type [`InitialDataMessage`](#initialdatamessage) contenant une liste des données qui sont déjà existantes.

Ensuite, lorsque le serveur reçoit assez de nouvelles informations de GHAMiner
pour la période d'agrégation choisie, il DOIT renvoyer un message de type
[`NewDataMessage`](#newdatamessage), contenant une nouvelle donnée d'analyse.

Lorsque GHAMiner a fini son exécution, le serveur DOIT fermer la connexion.

Les messages provenant du client sont ignorés par le serveur.

### Représentation des données

#### `InitialDataMessage`
```ts
{
    type: "initialData",
    data: AggregationData[]
}
```
Voir: [`AggregationData`](#aggregationdata).

#### `NewDataMessage`
```ts
{
    type: "newData",
    data: AggregationData
}
```
Voir: [`AggregationData`](#aggregationdata).

#### `AggregationData`
```ts
{
    runInfo: RunInfo
    aggregationPeriod: "day" | "month" | "week",
    periodStart: date,
    runs: int,
    statusInfo: StatusInfo,
    timeInfo: TimeInfo
}
```
Voir: [`RunInfo`](#runinfo), [`StatusInfo`](#runinfo), [`TimeInfo`](#timeinfo).

### `RunInfo`
```ts
{
    repositoryName: string,
    workflowName: string,
    branch: string,
    author: string,
}
```

### `StatusInfo`
```ts
{
    sucesses: int,
    failures: int,
    cancelled: int,
}
```

### `TimeInfo`
```ts
{
    min: float,
    q1: float,
    median: float,
    q3: float,
    max: float,
    average: float
}
```
