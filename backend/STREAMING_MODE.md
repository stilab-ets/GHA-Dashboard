# Streaming Mode for GHAminer

## Overview

Streaming mode allows GHAminer to collect workflow runs page by page and stream them directly to the GHA Dashboard via WebSocket, without requiring Docker or PostgreSQL. The local CSV file is used as the database.

## How It Works

1. **Collect Workflow Runs**: Fetches workflow runs page by page (100 runs per API request) from GitHub API
2. **Stream to Dashboard**: Each page of runs is immediately streamed to the connected WebSocket client
3. **Save Initial Data**: All collected runs are saved to CSV (initially without job details)
4. **Collect Job Details**: After all runs are collected, loops back to fetch job details for each run
5. **Update CSV**: Updates the CSV file with job details and streams progress updates

## Configuration

### Option 1: Enable in config.yaml

Edit `backend/ghaminer/src/config.yaml`:

```yaml
streaming_mode: true
```

Then run GHAminer normally:
```bash
python ghaminer/src/GHAMetrics.py -t YOUR_TOKEN -s https://github.com/owner/repo
```

### Option 2: Use WebSocket Endpoint

Connect to the WebSocket endpoint from your application:

```
ws://localhost:3000/stream/owner/repo?token=YOUR_TOKEN
```

The endpoint will:
- Start collecting workflow runs page by page
- Stream each page as it's collected
- Collect job details after all runs are done
- Update the CSV file with complete data

## WebSocket Message Types

The WebSocket sends JSON messages with the following types:

### `status`
Progress updates during collection:
```json
{
  "type": "status",
  "data": {
    "message": "Starting workflow runs collection...",
    "stage": "collecting_runs"
  }
}
```

### `runs_page`
A page of workflow runs:
```json
{
  "type": "runs_page",
  "data": {
    "page": 1,
    "runs": [...],
    "total_collected": 100,
    "has_more": true
  }
}
```

### `job_progress`
Progress while collecting job details:
```json
{
  "type": "job_progress",
  "data": {
    "processed": 50,
    "total": 200,
    "current_run_id": "12345678"
  }
}
```

### `csv_updated`
Notification when CSV is updated:
```json
{
  "type": "csv_updated",
  "data": {
    "message": "CSV file updated with 200 runs",
    "file_path": "builds_features.csv"
  }
}
```

### `error`
Error messages:
```json
{
  "type": "error",
  "data": {
    "message": "Error description"
  }
}
```

## CSV Format

The CSV file (`builds_features.csv`) contains the following columns:

- `repo`: Repository name (owner/repo)
- `id_build`: Workflow run ID
- `workflow_id`: Workflow ID
- `workflow_name`: Workflow name
- `status`: Run status (queued, in_progress, completed)
- `conclusion`: Run conclusion (success, failure, cancelled, etc.)
- `created_at`: Run creation timestamp
- `updated_at`: Run update timestamp
- `branch`: Branch name
- `commit_sha`: Commit SHA
- `event`: Event that triggered the workflow
- `issuer_name`: User who triggered the workflow
- `run_number`: Run number
- `build_duration`: Duration in seconds
- `total_jobs`: Number of jobs (filled after job details collection)
- `job_details`: JSON string with job details (filled after job details collection)

## Running Without Docker

When using streaming mode, you don't need Docker or PostgreSQL:

1. Create a `.env` file (optional, for GitHub token):
```env
GITHUB_TOKEN=your_token_here
```

2. Start the Flask app:
```bash
cd backend
python app.py
```

3. Connect to the streaming endpoint via WebSocket or use the regular API endpoints that read from CSV.

## Benefits

- **No Docker required**: Works with just Python and the CSV file
- **Real-time updates**: Data is streamed as it's collected
- **Efficient**: Collects runs first, then job details (avoids blocking)
- **Progress tracking**: WebSocket provides real-time progress updates
- **CSV-based**: Simple file-based storage, easy to inspect and share



