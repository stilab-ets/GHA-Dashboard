#!/bin/bash
# test-docker.sh - Script de validation Docker

echo "Test de la conteneurisation GHA Dashboard"
echo "=============================================="

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Conteneurs en cours d'exécution
echo ""
echo "📦 Test 1: Vérification des conteneurs..."
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Conteneurs en cours d'exécution"
else
    echo -e "${RED}✗${NC} Aucun conteneur actif"
    exit 1
fi

# Test 2: Health check backend
echo ""
echo "Test 2: Health check backend..."
HEALTH=$(curl -s http://localhost:3000/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}✓${NC} Backend répond correctement"
    echo "   Response: $HEALTH"
else
    echo -e "${RED}✗${NC} Backend ne répond pas"
    exit 1
fi

# Test 3: PostgreSQL accessible
echo ""
echo "Test 3: Connexion PostgreSQL"
if docker-compose exec -T postgres psql -U postgres -d gha_dashboard -c "\dt" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL accessible"
else
    echo -e "${RED}✗${NC} PostgreSQL inaccessible"
    exit 1
fi

# Test 4: Tables créées
echo ""
echo "Test 4: Vérification des tables..."
TABLES=$(docker-compose exec -T postgres psql -U postgres -d gha_dashboard -c "\dt" | grep -E "repositories|workflows|workflow_runs")
if [ ! -z "$TABLES" ]; then
    echo -e "${GREEN}✓${NC} Tables créées avec succès"
else
    echo -e "${RED}✗${NC} Tables manquantes"
    exit 1
fi

# Test 5: Debug endpoint
echo ""
echo "Test 5: Endpoint de debug..."
DEBUG=$(curl -s http://localhost:3000/api/debug)
if echo "$DEBUG" | grep -q "GITHUB_TOKEN_SET"; then
    echo -e "${GREEN}✓${NC} Debug endpoint accessible"
else
    echo -e "${RED}✗${NC} Debug endpoint non accessible"
    exit 1
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✅ Tous les tests passés avec succès !${NC}"
echo ""