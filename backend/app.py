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
import json

from analysis.endpoint import AggregationFilters, send_data
from typing import cast
from datetime import date


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
