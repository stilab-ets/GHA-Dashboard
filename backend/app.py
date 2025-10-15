from flask import Flask, jsonify, request
from flask_cors import CORS
from ghaminer_integration import run_ghaminer  

app = Flask(__name__)
CORS(app) 
from functools import lru_cache

@lru_cache(maxsize=10)
def cached_metrics(repo):
    return run_ghaminer(repo)

@app.route("/metrics")
def get_metrics():
    repo = request.args.get("repo")
    result = cached_metrics(repo)
    return jsonify(result)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
