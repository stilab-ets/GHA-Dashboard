FROM python:3.12-slim

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    git \
    postgresql-client \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier requirements.txt en premier (meilleur cache Docker)
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le backend (inclut ghaminer/, extraction/, etc.)
COPY . .

# Donner les permissions à GHAminer
RUN chmod -R 777 /app/ghaminer/src/tmp || true && \
    chmod -R 777 /app/ghaminer/src/repos || true

# Créer utilisateur non-root
RUN useradd -m -u 1001 flaskuser && \
    chown -R flaskuser:flaskuser /app

USER flaskuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:3000/health')" || exit 1

CMD ["python", "app.py"]
