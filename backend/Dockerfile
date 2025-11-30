FROM python:3.12-slim

# Dépendances système
RUN apt-get update && apt-get install -y \
    git \
    postgresql-client \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer les requirements avant la copie complète
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le backend
COPY . .

# Créer un dossier tmp global (pour GHAMiner) 
RUN mkdir -p /tmp/ghaminer && chmod -R 777 /tmp/ghaminer

# Symlink propre pour GHAMiner
RUN rm -rf ghaminer/src/tmp && \
    ln -s /tmp/ghaminer ghaminer/src/tmp

# Créer utilisateur non-root
RUN useradd -m -u 1001 flaskuser && chown -R flaskuser:flaskuser /app
USER flaskuser

# Flask écoute sur 3000 (comme ton compose)
EXPOSE 3000

# Toujours utiliser FLASK run (sinon ça marche pas)
CMD ["flask", "run", "--host=0.0.0.0", "--port=3000"]
