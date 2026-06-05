import os
import sys

# Gevent monkey patch must be done before importing other modules
try:
    from gevent import monkey
    monkey.patch_all()
    GEVENT_AVAILABLE = True
except ImportError:
    GEVENT_AVAILABLE = False

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from flask_sock import Sock
import argparse
import json
import requests

from analysis.endpoint import AggregationFilters, send_data
from typing import cast
from datetime import date

parser = argparse.ArgumentParser()
parser.add_argument("--e2e", action="store_true", help="Enable E2E test mode")

args = parser.parse_args()

E2E_MODE = args.e2e

# Initialize Flask app
load_dotenv()
app = Flask(__name__)
sock = Sock(app)
CORS(app)

# ============================================
# Health Check
# ============================================
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "GHA Dashboard Backend (GHAminer)",
        "ghaminer_configured": os.path.exists(os.path.join(os.path.dirname(__file__), 'ghaminer', 'src', 'config.yaml'))
    }, 200
    
    
# ============================================
# Authentication Endpoint
# ============================================
@app.post("/auth/github")
def github_auth():
    if E2E_MODE:
        # In E2E mode, return a dummy token for testing purposes
        return jsonify({
            "success": True,
            "token": os.getenv("TEST_GITHUB_TOKEN"),  # TODO: encode token before sending to client for better security
            "username": os.getenv("TEST_GITHUB_USERNAME")
        })

    data = request.get_json()
    code = data["code"]

    response = requests.post(
        "https://github.com/login/oauth/access_token",
        headers={
            "Accept": "application/json"
        },
        data={
            "client_id": os.getenv("GITHUB_CLIENT_ID"),
            "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
            "code": code
        }
    )

    token_data = response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        return jsonify({
            "success": False,
            "error": "OAuth exchange failed"
        }), 401
        
    user_response = requests.get(
        "https://api.github.com/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json"
        }
    )
    
    user = user_response.json()

    return jsonify({
        "success": True,
        "token": access_token, # TODO: encode token before sending to client for better security
        "username": user["login"]
    })

# ============================================
# WebSocket Endpoint
# ============================================
@sock.route("/data/<path:repositoryName>")
def websocket_data(ws, repositoryName: str):
    """
    WebSocket endpoint for streaming GitHub Actions data via GHAminer
    """
    filters = AggregationFilters()

    # Get token from query params
    token = request.args.get("token", "")

    aggregationPeriod = request.args.get("aggregationPeriod")
    if aggregationPeriod != None:
        filters.aggregationPeriod = cast(str, aggregationPeriod)

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

    # Decode URL-encoded repository name and validate
    from urllib.parse import unquote
    repo = unquote(repositoryName)
    
    # Validate repository format (should be owner/repo)
    if "/" not in repo or repo.count("/") != 1:
        error_msg = {
            "type": "error",
            "message": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        return

    # Stream data using GHAminer
    send_data(ws, repo, filters, token)


# ============================================
# Data Check Endpoint
# ============================================
@app.route("/api/data/check/<path:repositoryName>")
def check_data(repositoryName: str):
    """
    Check if data exists for a repository and return metadata.
    """
    from urllib.parse import unquote
    repo = unquote(repositoryName)
    
    # Validate repository format
    if "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "error": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }), 400
    
    try:
        from data.persistence import DataPersistence
        persistence = DataPersistence()
        
        # Check if data exists
        all_runs = persistence.get_all_runs(repo)
        runs_with_jobs = persistence.get_runs_with_jobs(repo)
        
        # Get last updated time
        data = persistence._load_data(repo)
        last_updated = data.get('last_updated')
        
        if all_runs:
            return jsonify({
                "exists": True,
                "totalRuns": len(all_runs),
                "runsWithJobs": len(runs_with_jobs),
                "lastUpdated": last_updated
            }), 200
        else:
            return jsonify({
                "exists": False,
                "totalRuns": 0,
                "runsWithJobs": 0,
                "lastUpdated": None
            }), 200
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


@app.route("/api/data/load/<path:repositoryName>")
def load_data(repositoryName: str):
    """
    Load existing data for a repository.
    """
    from urllib.parse import unquote
    repo = unquote(repositoryName)
    
    # Validate repository format
    if "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "error": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }), 400
    
    try:
        from data.persistence import DataPersistence
        persistence = DataPersistence()
        
        # Load all runs
        all_runs_dict = persistence.get_all_runs(repo)
        all_runs = list(all_runs_dict.values())
        
        # Load jobs for each run
        for run in all_runs:
            run_id = str(run.get('id', ''))
            if run_id:
                jobs = persistence.get_jobs_for_run(repo, run_id)
                if jobs:
                    run['jobs'] = jobs
        
        return jsonify({
            "runs": all_runs,
            "totalRuns": len(all_runs)
        }), 200
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# ============================================
# Debug Endpoint
# ============================================
@app.route("/api/debug")
def debug():
    """Debug information"""
    ghaminer_config_path = os.path.join(os.path.dirname(__file__), 'ghaminer', 'src', 'config.yaml')
    
    config_info = {}
    if os.path.exists(ghaminer_config_path):
        try:
            import yaml
            with open(ghaminer_config_path, 'r') as f:
                config_info = yaml.safe_load(f)
        except:
            config_info = {"error": "Failed to load config"}
    
    return jsonify({
        "environment": {
            "FLASK_ENV": os.getenv("FLASK_ENV"),
            "GITHUB_TOKEN_SET": bool(os.getenv("GITHUB_TOKEN"))
        },
        "ghaminer": {
            "config_path": ghaminer_config_path,
            "config_exists": os.path.exists(ghaminer_config_path),
            "config": config_info
        },
        "working_directory": os.getcwd(),
        "python_version": sys.version
    })


# ============================================
# Start Application
# ============================================
if __name__ == "__main__":
    port = int(os.getenv("FLASK_RUN_PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    print(f"Starting GHA Dashboard Backend (GHAminer) on port {port}")
    print(f"GitHub Token configured: {bool(os.getenv('GITHUB_TOKEN'))}")

    # Use gevent for WebSocket support with Flask-Sock
    if GEVENT_AVAILABLE:
        try:
            from gevent import pywsgi
            print("Using gevent WSGI server (WebSocket support for Flask-Sock)")
            # Note: WSGIServer doesn't support timeout parameter directly
            # Instead, we use periodic keepalive messages (every 30s) to prevent connection timeouts
            # during GitHub API rate limit waits
            server = pywsgi.WSGIServer(
                ('0.0.0.0', port), 
                app, 
                log=None
            )
            print(f"WebSocket server configured - using periodic keepalive messages to prevent timeout during rate limit waits")
            server.serve_forever()
        except Exception as e:
            print(f"WARNING: Error starting gevent server: {e}")
            import traceback
            traceback.print_exc()
            print("Falling back to Flask dev server (WebSockets may not work)")
            app.run(host="0.0.0.0", port=port, debug=debug)
    else:
        print("WARNING: gevent not installed, using Flask dev server (WebSockets may not work)")
        app.run(host="0.0.0.0", port=port, debug=debug)
