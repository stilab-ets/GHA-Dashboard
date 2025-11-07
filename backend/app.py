from flask import Flask, Response, jsonify, request
import pandas as pd
import os
from core.models import AggregationPeriod
from extraction.extractor import extract_data
from analysis.endpoint import AggregationFilters, send_data
from typing import cast
from datetime import date
import asyncio
from flask_sock import Sock

app = Flask(__name__)
sock = Sock(app)

CSV_PATH = "builds_features.csv"



@app.route("/api/extraction", methods=["GET"])
def extraction_api():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Repo manquant"}), 400

    token = os.getenv("GITHUB_TOKEN", "<TON_TOKEN_ICI>")
    
    # Appel à la fonction d’extraction
    result = extract_data(repo, token, "2024-04-01", "2025-10-31")

    #  Gestion des retours (DataFrame ou erreur)
    if isinstance(result, tuple):
        df, error = result
        if error:
            return jsonify({"error": error}), 400
        else:
            # Conversion DataFrame → JSON
            return jsonify(df.to_dict(orient="records"))
    else:
        return jsonify({"error": "Format de retour inattendu"}), 500


@app.route("/api/github-metrics")
def github_metrics():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "repo manquant"}), 400

    df = pd.read_csv("builds_features.csv")
    repo_df = df[df["repo"] == repo]

    if repo_df.empty:
        return jsonify({"error": "Aucune donnée trouvée pour ce dépôt."}), 404

    result = {
        "repo": repo,
        "totalRuns": len(repo_df),
        "successRate": round((repo_df[repo_df["conclusion"] == "success"].shape[0] / len(repo_df)) * 100, 2),
        "avgDuration": round(repo_df["build_duration"].mean(), 2)
    }
    return jsonify(result)

@sock.route("/data/<path:repositoryName>")
def websocket_data(ws, repositoryName: str):
    filters = AggregationFilters()

    aggregationPeriod = request.args.get("aggregationPeriod")
    if aggregationPeriod != None:
        filters.aggregationPeriod = cast(AggregationPeriod, aggregationPeriod)

    startDate = request.args.get("startDate")
    if startDate != None:
        filters.startDate = date.fromisoformat(startDate)

    endDate = request.args.get("endDate")
    if endDate != None:
        filters.endDate = date.fromisoformat(endDate)

    branch = request.args.get("branch")
    if branch != None:
        filters.branch = branch

    author = request.args.get("author")
    if author != None:
        filters.author = author

    workflowName = request.args.get("workflowName")
    if workflowName != None:
        filters.workflowName = workflowName

    asyncio.run(send_data(ws, repositoryName, filters))

if __name__ == "__main__":
    app.run(port=3000, debug=True)
