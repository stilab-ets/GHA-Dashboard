# User Guide – GHA Dashboard

##  Introduction
GHA Dashboard is a tool designed to analyze GitHub Actions workflow runs for any GitHub repository.  
It includes:
- a Chrome Extension displaying an interactive dashboard,
- a Flask backend API,
- a PostgreSQL database,
- an automatic GitHub Actions extraction system.

This guide explains how to install, run, and use the dashboard.
---

##  1. Prerequisites

###  Required Software
- Docker & Docker Compose
- Google Chrome (for the extension)
- GitHub Personal Access Token (PAT) with `repo` or `public_repo` permission

###  Configure your Token
- Open the Chrome extension popup.
- Paste your GitHub Personal Access Token (PAT) in the “Token” field.
- Save your changes.
Once configured, the extension automatically uses your token to fetch GitHub Actions data.

---

##  2. Installation

### Step 1 — Clone the project
```bash
git clone https://github.com/stilab-ets/GHA-Dashboard
cd GHA-Dashboard
```
### Step 2 — Start Docker
```bash
docker compose up --build
```
Services started:
- Backend Flask → http://localhost:3000
- PostgreSQL → port 5432

### Step 3 - Test the backend
```bash
curl http://localhost:3000/health
```

Expected output:
{
  "status": "ok",
  "service": "GHA Dashboard Backend",
  "csv_exists": true
}

##  3. Installing the Chrome Extension

### Step 1 — Open Chrome Extensions

Go to:
chrome://extensions

Enable Developer Mode (top right).

### Step 2 — Load the extension
Click Load unpacked
Select the folder: /extension
The “GHA Dashboard” icon will appear in Chrome.

Le folder c'est /extension/build

##  4. Using the Dashboard

### Step 1 — Open Chrome Extensions
Example:
https://github.com/facebook/react/actions
https://github.com/rust-lang/crates.io/actions

### Step 2 — Automatic activation
The extension detects the repository and injects a button:

“Open GHA Dashboard”

Clicking it opens an analytics dashboard directly inside GitHub.

##  5. Dashboard Features
Available Filters :
- Workflows
- Branches
- Actors
- Date range

Filters update dynamically based on extracted data.
Generated Graphs & Metrics : 
- Total workflow runs
- Success vs Failure rate
- Average & median build duration
- Runs per day
- Top workflows
- Branch comparison
- Failure rate timeline
- Automatic spike & anomaly detection

##  6. GitHub Data Extraction
The backend can extract workflow runs using:

Mode 1: GitHub REST API 
Fast + reliable + supports pagination.

Mode 2: GHAMiner
Legacy mode using CSV generation.

Manual extraction
```bash
curl "http://localhost:3000/api/extraction?repo=facebook/react"
```

The API returns:
- workflow runs
- cleaned & normalized fields
- workflow names
- branches
- actors
- timestamps

##  7. Database Synchronization
To insert workflow runs into PostgreSQL:
```bash
curl -X POST "http://localhost:3000/api/sync?repo=facebook/react"
```
This does the following:

- Extracts the latest workflow runs

- Saves them in builds_features.csv

- Inserts into DB (Repository → Workflow → WorkflowRun)

- Prevents duplicates using id_build

##  8. Troubleshooting

"No extraction data available" : 
Check:

- Backend running → http://localhost:3000/health

- Valid GitHub token

- Docker is active

CORS Error
Ensure this is in app.py:
from flask_cors import CORS
CORS(app)

ERR_CONNECTION_REFUSED
Backend is not running.
Restart:
```bash
docker compose up --build
```

##  9. Contact & Support
- Author : Anthony monton, Vyshmi Nagendran, Fatma Aljane, Gabriel Aubé, Valentin Palashev
- Project : PFE017 Design and Development of an Intelligent Dashboard for Monitoring GitHub Actions – Final Year Project (ÉTS)
- Year : 2025