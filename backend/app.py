import os
import secrets
import sys
import time

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
from typing import Iterable, cast
from datetime import date, datetime
from urllib.parse import unquote

parser = argparse.ArgumentParser()
parser.add_argument("--e2e", action="store_true", help="Enable E2E test mode")

args = parser.parse_args()

E2E_MODE = args.e2e

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize Flask app
load_dotenv()
load_dotenv(os.path.join(BACKEND_DIR, ".env"), override=True)
app = Flask(__name__)
sock = Sock(app)

DEFAULT_EXTENSION_ORIGINS = "chrome-extension://hgehgkjceklknibnacgjhefociphnhaf"


def get_allowed_extension_origins():
    raw_origins = os.getenv("GHA_EXTENSION_ORIGINS", DEFAULT_EXTENSION_ORIGINS)
    return [
        origin.strip()
        for origin in raw_origins.split(",")
        if origin.strip()
    ]


def is_allowed_extension_origin(origin):
    return origin in get_allowed_extension_origins()


CORS(
    app,
    resources={
        r"/*": {
            "origins": get_allowed_extension_origins(),
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    },
)

# in-memory store pour multiples extractions simultanées (TTL 5 mins)
extractions = {}


def _cleanup_expired_extractions():
    now = time.time()
    expired_ids = [
        extraction_id
        for extraction_id, extraction in extractions.items()
        if extraction["expires_at"] <= now
    ]
    for extraction_id in expired_ids:
        extractions.pop(extraction_id, None)


def _first_filter_value(value):
    if isinstance(value, list):
        values = [item for item in value if item and item != "all"]
        return values[0] if values else None
    if value in (None, "", "all"):
        return None
    return value


def _bool_filter_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (int, float)):
        return value != 0
    return default


def _workflow_id_filter_values(value) -> list[int]:
    if value in (None, "", "all"):
        return []

    raw_values = value if isinstance(value, list) else [value]
    workflow_ids = []

    for raw_value in raw_values:
        if raw_value in (None, "", "all"):
            continue

        try:
            workflow_id = int(raw_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid workflow ID: {raw_value}") from exc

        if workflow_id <= 0:
            raise ValueError(f"Invalid workflow ID: {raw_value}")

        if workflow_id not in workflow_ids:
            workflow_ids.append(workflow_id)

    return workflow_ids


def _build_aggregation_filters(filters_payload):
    filters = AggregationFilters()

    if not isinstance(filters_payload, dict):
        return filters

    aggregation_period = filters_payload.get("aggregationPeriod")
    if aggregation_period:
        filters.aggregationPeriod = cast(str, aggregation_period)

    start_date = filters_payload.get("startDate") or filters_payload.get("start")
    if start_date:
        filters.startDate = date.fromisoformat(cast(str, start_date))

    end_date = filters_payload.get("endDate") or filters_payload.get("end")
    if end_date:
        filters.endDate = date.fromisoformat(cast(str, end_date))
    else:
        filters.endDate = date.today()

    branch = _first_filter_value(filters_payload.get("branch"))
    if branch:
        filters.branch = cast(str, branch)

    author = _first_filter_value(filters_payload.get("author") or filters_payload.get("actor"))
    if author:
        filters.author = cast(str, author)

    workflow_name = _first_filter_value(filters_payload.get("workflowName") or filters_payload.get("workflow"))
    if workflow_name:
        filters.workflowName = cast(str, workflow_name)

    filters.workflowIds = _workflow_id_filter_values(
        filters_payload.get("workflowIds") or filters_payload.get("workflow_ids")
    )

    fetch_job_details = filters_payload.get("fetchJobDetails")
    if fetch_job_details is None:
        fetch_job_details = filters_payload.get("includeJobs")
    if fetch_job_details is None:
        fetch_job_details = filters_payload.get("fetch_job_details")
    filters.fetchJobDetails = _bool_filter_value(fetch_job_details, default=False)

    force_refresh = filters_payload.get("forceRefresh")
    if force_refresh is None:
        force_refresh = filters_payload.get("force_refresh")
    filters.forceRefresh = _bool_filter_value(force_refresh, default=False)

    return filters


def _build_filters_from_request_args(args):
    payload = {
        "start": args.get("start") or args.get("startDate"),
        "end": args.get("end") or args.get("endDate"),
        "workflowIds": args.getlist("workflowIds") or args.getlist("workflow_ids"),
    }
    return _build_aggregation_filters(payload)


def _run_date_in_scope(run, filters: AggregationFilters) -> bool:
    created_at = run.get("created_at") or run.get("createdAt")
    if not created_at:
        return True

    try:
        run_date = datetime.fromisoformat(str(created_at).replace("Z", "+00:00")).date()
    except ValueError:
        return True

    return filters.startDate <= run_date <= filters.endDate


def _run_workflow_in_scope(run, filters: AggregationFilters) -> bool:
    workflow_ids = filters.workflowIds or []
    if not workflow_ids:
        return True

    try:
        return int(run.get("workflow_id")) in set(workflow_ids)
    except (TypeError, ValueError):
        return False


def _filter_runs_for_scope(runs: Iterable[dict], filters: AggregationFilters) -> list[dict]:
    scoped_runs = []
    seen_ids = set()

    for run in runs:
        run_id = run.get("id")
        if run_id is None or str(run_id) in seen_ids:
            continue
        if not _run_date_in_scope(run, filters):
            continue
        if not _run_workflow_in_scope(run, filters):
            continue

        seen_ids.add(str(run_id))
        scoped_runs.append(run)

    return scoped_runs

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
            "token": os.getenv("TEST_GITHUB_TOKEN"),
            "username": os.getenv("TEST_GITHUB_USERNAME")
        })

    data = request.get_json(silent=True) or {}
    code = data.get("code")
    redirect_uri = data.get("redirect_uri") or data.get("redirectUri")

    if not code:
        return jsonify({
            "success": False,
            "error": "Missing GitHub authorization code"
        }), 400

    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")

    missing_config = [
        name for name, value in {
            "GITHUB_CLIENT_ID": client_id,
            "GITHUB_CLIENT_SECRET": client_secret
        }.items()
        if not value
    ]

    if missing_config:
        return jsonify({
            "success": False,
            "error": (
                "GitHub OAuth is not configured on the backend. "
                f"Set {', '.join(missing_config)} in backend/.env and restart the backend."
            )
        }), 500

    token_payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code
    }

    if redirect_uri:
        token_payload["redirect_uri"] = redirect_uri

    try:
        response = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={
                "Accept": "application/json"
            },
            data=token_payload,
            timeout=15
        )
    except requests.RequestException as exc:
        return jsonify({
            "success": False,
            "error": f"Unable to reach GitHub OAuth service: {exc}"
        }), 502

    try:
        token_data = response.json()
    except ValueError:
        token_data = {}
    access_token = token_data.get("access_token")

    if not access_token:
        github_error = token_data.get("error_description") or token_data.get("error")
        message = "OAuth exchange failed"
        if github_error:
            message = f"{message}: {github_error}"

        return jsonify({
            "success": False,
            "error": message
        }), 401

    try:
        user_response = requests.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json"
            },
            timeout=15
        )
    except requests.RequestException as exc:
        return jsonify({
            "success": False,
            "error": f"Unable to reach GitHub user API: {exc}"
        }), 502

    if not user_response.ok:
        return jsonify({
            "success": False,
            "error": "OAuth token received, but GitHub user profile could not be loaded"
        }), 401

    user = user_response.json()
    username = user.get("login")

    if not username:
        return jsonify({
            "success": False,
            "error": "OAuth token received, but GitHub username was missing"
        }), 401

    return jsonify({
        "success": True,
        "token": access_token,
        "username": username
    })

# ============================================
# Extraction Session Endpoint
# ============================================
@app.post("/api/extractions")
def create_extraction():
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return jsonify({
            "success": False,
            "error": "Missing Authorization bearer token"
        }), 401

    token = auth_header.removeprefix("Bearer ").strip()

    if not token:
        return jsonify({
            "success": False,
            "error": "Empty bearer token"
        }), 401

    data = request.get_json() or {}
    repo = data.get("repo")
    filters = data.get("filters", {})

    if not repo or "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "success": False,
            "error": "Invalid repository format. Expected owner/repo"
        }), 400

    if not isinstance(filters, dict):
        return jsonify({
            "success": False,
            "error": "Invalid filters payload"
        }), 400

    _cleanup_expired_extractions()
    now = time.time()

    #Generate an unique extraction ID
    extraction_id = secrets.token_urlsafe(32)

    #Store extraction info in memory with TTL 5 mins
    extractions[extraction_id] = {
        "token": token,
        "repo": repo,
        "filters": filters,
        "expires_at": now + 300
    }

    return jsonify({
        "success": True,
        "extractionId": extraction_id
    }), 201

# ============================================
# WebSocket Endpoint
# ============================================
@sock.route("/data/<path:extractionId>")
def websocket_data(ws, extractionId: str):
    """
    WebSocket endpoint for streaming GitHub Actions data via GHAminer
    """
    origin = request.headers.get("Origin")
    if not is_allowed_extension_origin(origin):
        ws.send(json.dumps({
            "type": "error",
            "message": "Forbidden WebSocket origin"
        }))
        ws.close()
        return

    _cleanup_expired_extractions()
    extraction = extractions.get(extractionId)

    if not extraction:
        error_msg = {
            "type": "error",
            "message": "Invalid or expired extraction session"
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        extractions.pop(extractionId, None)
        return

    token = extraction["token"]
    repo = extraction["repo"]
    
    # Validate repository format (should be owner/repo)
    if "/" not in repo or repo.count("/") != 1:
        error_msg = {
            "type": "error",
            "message": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        return

    try:
        filters = _build_aggregation_filters(extraction.get("filters", {}))
    except ValueError as e:
        error_msg = {
            "type": "error",
            "message": f"Invalid extraction filters: {e}"
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        extractions.pop(extractionId, None)
        return

    try:
        # Stream data using GHAminer
        send_data(ws, repo, filters, token)
    finally:
        extractions.pop(extractionId, None)


# ============================================
# Workflow Discovery Endpoint
# ============================================
@app.get("/api/workflows/<path:repositoryName>")
def get_workflows(repositoryName: str):
    """
    Return GitHub Actions workflows for a repository.
    """
    repo = unquote(repositoryName)

    if "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "error": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }), 400

    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None
    if not token and os.getenv("ALLOW_ENV_GITHUB_TOKEN_FALLBACK") == "1":
        token = os.getenv("GITHUB_TOKEN")

    if not token:
        return jsonify({
            "error": "GitHub token required to load workflows"
        }), 401

    workflows = []
    page = 1

    try:
        while True:
            response = requests.get(
                f"https://api.github.com/repos/{repo}/actions/workflows",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
                params={"per_page": 100, "page": page},
                timeout=15,
            )

            if response.status_code == 404:
                return jsonify({"error": "Repository or workflows not found"}), 404
            if response.status_code >= 400:
                return jsonify({
                    "error": "Unable to load workflows",
                    "status": response.status_code
                }), response.status_code

            page_workflows = response.json().get("workflows", [])
            workflows.extend([
                {
                    "id": workflow.get("id"),
                    "name": workflow.get("name"),
                    "path": workflow.get("path"),
                    "state": workflow.get("state"),
                }
                for workflow in page_workflows
                if workflow.get("id") is not None
            ])

            if len(page_workflows) < 100:
                break
            page += 1

        return jsonify({"workflows": workflows}), 200
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502


# ============================================
# Data Check Endpoint
# ============================================
@app.route("/api/data/check/<path:repositoryName>")
def check_data(repositoryName: str):
    """
    Check if data exists for a repository and return metadata.
    """
    repo = unquote(repositoryName)

    # Validate repository format
    if "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "error": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }), 400
    
    try:
        filters = _build_filters_from_request_args(request.args)
    except ValueError as e:
        return jsonify({"error": f"Invalid scope filters: {e}"}), 400

    try:
        from data.persistence import DataPersistence
        persistence = DataPersistence()
        
        # Check if data exists
        all_runs = _filter_runs_for_scope(persistence.get_all_runs(repo).values(), filters)
        runs_with_jobs = persistence.get_runs_with_jobs(repo)
        
        # Get last updated time
        data = persistence._load_data(repo)
        last_updated = data.get('last_updated')
        
        if all_runs:
            return jsonify({
                "exists": True,
                "totalRuns": len(all_runs),
                "runsWithJobs": len([run for run in all_runs if str(run.get("id")) in runs_with_jobs]),
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
    repo = unquote(repositoryName)
    
    # Validate repository format
    if "/" not in repo or repo.count("/") != 1:
        return jsonify({
            "error": f"Invalid repository format: {repo}. Expected format: owner/repo"
        }), 400
    
    try:
        filters = _build_filters_from_request_args(request.args)
    except ValueError as e:
        return jsonify({"error": f"Invalid scope filters: {e}"}), 400

    try:
        from data.persistence import DataPersistence
        persistence = DataPersistence()
        
        # Load all runs
        all_runs_dict = persistence.get_all_runs(repo)
        all_runs = _filter_runs_for_scope(all_runs_dict.values(), filters)
        
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
            "GITHUB_TOKEN_SET": bool(os.getenv("GITHUB_TOKEN")),
            "ALLOW_ENV_GITHUB_TOKEN_FALLBACK": os.getenv("ALLOW_ENV_GITHUB_TOKEN_FALLBACK") == "1"
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
    host = os.getenv("FLASK_RUN_HOST", "127.0.0.1")
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    env_token_set = bool(os.getenv("GITHUB_TOKEN"))
    env_token_fallback_enabled = os.getenv("ALLOW_ENV_GITHUB_TOKEN_FALLBACK") == "1"

    print(f"Starting GHA Dashboard Backend (GHAminer) on {host}:{port}")
    print(f"GitHub env token fallback enabled: {env_token_fallback_enabled} (GITHUB_TOKEN configured: {env_token_set})")

    # Use gevent for WebSocket support with Flask-Sock
    if GEVENT_AVAILABLE:
        try:
            from gevent import pywsgi
            print("Using gevent WSGI server (WebSocket support for Flask-Sock)")
            # Note: WSGIServer doesn't support timeout parameter directly
            # Instead, we use periodic keepalive messages (every 30s) to prevent connection timeouts
            # during GitHub API rate limit waits
            server = pywsgi.WSGIServer(
                (host, port),
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
            app.run(host=host, port=port, debug=debug)
    else:
        print("WARNING: gevent not installed, using Flask dev server (WebSockets may not work)")
        app.run(host=host, port=port, debug=debug)
