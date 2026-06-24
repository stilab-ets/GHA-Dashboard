# User Guide - GHA Dashboard

## Introduction

GHA Dashboard analyzes GitHub Actions workflow runs for a GitHub repository.

It includes:
- a Chrome extension that displays the dashboard inside GitHub
- a local Flask backend that serves API and WebSocket endpoints
- local JSON persistence for cached workflow data

The intended flow is: start the Flask server locally, load the Chrome extension, then let the extension send the GitHub token to the backend when collecting data.

## 1. Prerequisites

- Python
- Google Chrome
- Optional: a GitHub OAuth app, or a GitHub Personal Access Token with `repo` or `public_repo` permission

## 2. Backend Setup

Clone the project:

```bash
git clone https://github.com/stilab-ets/GHA-Dashboard
cd GHA-Dashboard/backend
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Start the Flask backend:

```bash
python app.py
```

The backend runs on `http://localhost:3000` by default.

Check that it is running:

```bash
curl http://localhost:3000/health
```

## 3. Authentication

The extension handles token communication with the backend.

Two authentication modes are supported:
- GitHub OAuth: configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `backend/.env`, then restart the backend.
- Personal Access Token: paste your token in the extension popup and save it.

The token is sent to the local backend only when the extension starts data collection.

## 4. Installing the Chrome Extension

Build or prepare the extension, then open Chrome at:

```text
chrome://extensions
```

Enable Developer Mode, click **Load unpacked**, and select:

```text
GHA-Dashboard/extension/build
```

## 5. Using the Dashboard

Open a GitHub repository, for example:

```text
https://github.com/facebook/react/actions
```

The extension adds the GHA Dashboard entry point to GitHub. Open the dashboard and start data collection. The extension creates an extraction session with the Flask backend, sends the selected repository and filters, and streams workflow run data back into the dashboard.

## 6. Data Storage

Collected workflow data is cached locally as JSON files under:

```text
backend/data/storage/
```

Each repository gets its own local JSON file. You can delete these files to clear cached data.

## 7. Dashboard Features

Available filters:
- workflows
- branches
- actors
- date range

Available metrics and views include:
- total workflow runs
- success vs failure rate
- average and median build duration
- runs per day
- workflow comparison
- branch comparison
- failure rate timeline
- duration spikes and anomaly indicators

## 8. Troubleshooting

If the dashboard cannot load data:
- confirm the backend is running at `http://localhost:3000/health`
- confirm the GitHub token is configured in the extension popup or OAuth is configured in `backend/.env`
- check the terminal running `python app.py` for backend errors
- clear stale cached data in `backend/data/storage/` if needed

If Chrome shows `ERR_CONNECTION_REFUSED`, restart the backend:

```bash
cd backend
python app.py
```

## 9. Contact & Support

- @jaykay9999

Authors: Cassandre Ashley Javel, Alexander Pan, Maksym Pravdin, Vincent Renaud, Danny Alexander Villeda
Project: PFE009 Development of a dashboard for monitoring workflows with GitHub Actions - Final Year Project (ETS)
Year: 2026

Authors: Anthony Monton, Vyshmi Nagendran, Fatma Aljane, Gabriel Aube, Valentin Palashev
Project: PFE017 Design and Development of an Intelligent Dashboard for Monitoring GitHub Actions - Final Year Project (ETS)
Year: 2025
