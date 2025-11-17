FROM python:3.12-slim

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    git \
    postgresql-client \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier requirements.txt
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY . .

# Créer les dossiers nécessaires
RUN mkdir -p /app/src /app/extraction /app/ghaminer /app/logs

# Créer les dossiers nécessaires pour GHAminer avec permissions
RUN mkdir -p /app/ghaminer/src/tmp && \
    mkdir -p /app/ghaminer/src/repos && \
    chmod -R 777 /app/ghaminer/src/tmp && \
    chmod -R 777 /app/ghaminer/src/repos

# Créer un utilisateur non-root
RUN useradd -m -u 1001 flaskuser && \
    chown -R flaskuser:flaskuser /app

# S'assurer que flaskuser peut écrire dans les dossiers GHAminer
RUN chown -R flaskuser:flaskuser /app/ghaminer/src/tmp && \
    chown -R flaskuser:flaskuser /app/ghaminer/src/repos

USER flaskuser

# Exposer le port Flask
EXPOSE 3000

# Health check sur le bon port
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:3000/api/github-metrics?repo=test')" || exit 1

# Commande de démarrage
CMD ["python", "app.py"]