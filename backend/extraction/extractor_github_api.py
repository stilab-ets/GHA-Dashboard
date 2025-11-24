import requests
import os

GITHUB_API = "https://api.github.com"

def fetch_github_runs(owner, repo, token):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }

    all_runs = []
    page = 1

    while True:
        url = f"{GITHUB_API}/repos/{owner}/{repo}/actions/runs?per_page=100&page={page}"
        r = requests.get(url, headers=headers)

        if r.status_code != 200:
            print("❌ GitHub API error:", r.text)
            break

        data = r.json()
        runs = data.get("workflow_runs", [])

        if not runs:
            break  # terminé

        all_runs.extend(runs)
        page += 1

    return all_runs
