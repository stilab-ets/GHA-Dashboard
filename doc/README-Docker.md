# Docker Setup - GHA Dashboard

## Quick Start
```bash
# 1. Configurer le token GitHub
nano .env
# Ajouter : GITHUB_TOKEN=ghp_votre_token

# 2. Démarrer tous les services
docker-compose up -d --build

# 3. Vérifier que tout fonctionne
curl http://localhost:3000/health
```

## Services Disponibles

| Service | URL | Description |
|---------|-----|-------------|
| Backend Flask | http://localhost:3000 | API principale |
| PostgreSQL | localhost:5432 | Base de données |
| pgAdmin | http://localhost:5050 | Interface DB (mode dev) |

## Routes API

### Health Check
```bash
curl http://localhost:3000/health
```

### Extraction des Données
```bash
curl "http://localhost:3000/api/extraction?repo=facebook/react"
```

### Métriques
```bash
curl "http://localhost:3000/api/github-metrics?repo=facebook/react"
```

### Debug
```bash
curl http://localhost:3000/api/debug
```

## Commandes Utiles
```bash
# Démarrer
docker-compose up -d

# Arrêter
docker-compose down

# Logs
docker-compose logs -f backend

# Reconstruire
docker-compose up -d --build

# PostgreSQL CLI
docker-compose exec postgres psql -U postgres -d gha_dashboard

# Vérifier les conteneurs
docker-compose ps
```

## Configuration pgAdmin

Pour utiliser pgAdmin en mode développement :
```bash
# Démarrer avec pgAdmin
docker-compose --profile dev up -d
```

Accéder à http://localhost:5050 :
- Email: `admin@gha.local`
- Password: `admin`

Connexion PostgreSQL :
- Host: `postgres`
- Port: `5432`
- Username: `postgres`
- Password: `postgres`
- Database: `gha_dashboard`

## Troubleshooting

### Port 3000 déjà utilisé
```bash
lsof -i :3000
kill -9 <PID>
```

### Backend ne démarre pas
```bash
docker-compose logs backend
docker-compose restart backend
```

### PostgreSQL inaccessible
```bash
docker-compose logs postgres
docker-compose restart postgres
```

### Réinitialiser complètement
```bash
docker-compose down -v
docker-compose up -d --build
```

## Structure des Volumes

- `postgres-data` : Données PostgreSQL persistantes
- `./backend/builds_features.csv` : CSV généré par extraction

## Variables d'Environnement

Voir `.env` pour la configuration complète.

## Tests
```bash
# Test complet
./test-docker.sh

# Ou manuellement
curl http://localhost:3000/health
curl "http://localhost:3000/api/extraction?repo=facebook/react"
curl "http://localhost:3000/api/github-metrics?repo=facebook/react"
```