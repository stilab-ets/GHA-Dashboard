from flask import Flask, jsonify, request
from flask_cors import CORS
import subprocess
import json
import os

app = Flask(__name__)
CORS(app)

@app.route('/api/github-metrics', methods=['GET'])
def github_metrics():
    repo = request.args.get('repo', 'stilab-ets/GHA-Dashboard')
    start_date = request.args.get('start_date', '2024-01-01')
    end_date = request.args.get('end_date', '2025-10-31')
    token = os.getenv("GITHUB_TOKEN")  # on garde le token caché dans l’environnement

    try:
        cmd = [
            "python", "GHAminer/src/GHAMetrics.py",
            "-t", token,
            "-s", f"https://github.com/{repo}",
            "-fd", start_date,
            "-td", end_date
        ]
        print(" Lancement de GHAminer...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        print(" Exécution terminée.")

        # Afficher ce que GHAminer a renvoyé
        print(result.stdout)

        # Essayer de charger le JSON
        data = json.loads(result.stdout)

        return jsonify(data)
    except subprocess.TimeoutExpired:
        return jsonify({"error": " Temps d’exécution dépassé"})
    except json.JSONDecodeError:
        return jsonify({"error": " Sortie GHAminer non valide ou vide"})
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(port=3000, debug=True)
