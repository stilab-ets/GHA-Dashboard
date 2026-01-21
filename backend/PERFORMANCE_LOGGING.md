# Performance Logging for GHA-Dashboard

## Overview

Performance logging has been added to track API call durations and collection phase timings for the GHA-Dashboard data collection process.

## What Gets Logged

### 1. API Call Durations
Every GitHub API call is logged with:
- API type (WORKFLOW_RUNS_API, JOBS_API, etc.)
- URL
- Duration in seconds (with 3 decimal precision)
- HTTP status code

### 2. Phase Timings
Collection phases are logged with:
- Phase start/end markers
- Total duration for each phase
- Number of items collected

**Phase 1**: Workflow Runs Collection
- Logs when workflow runs collection starts and ends
- Total duration and number of runs collected

**Phase 2**: Jobs Collection
- Logs when job details collection starts and ends
- Total duration and number of runs processed

## Log File Location

Logs are saved in: `backend/logs/performance_{repository_name}_{timestamp}.log`

Example: `backend/logs/performance_AUTOMATIC1111_stable-diffusion-webui_20260120_230015.log`

## How to Use

1. **Start the backend server**:
   ```bash
   cd backend
   python app.py
   ```

2. **Open the GHA Dashboard in your browser** and navigate to a GitHub repository

3. **Click "Start Data Collection"** for the repository (e.g., `AUTOMATIC1111/stable-diffusion-webui`)

4. **Check the log file** in `backend/logs/` directory

## Log Format Examples

```
2026-01-20 23:00:15 - INFO - ================================================================================
2026-01-20 23:00:15 - INFO - Performance logging started for repository: AUTOMATIC1111/stable-diffusion-webui
2026-01-20 23:00:15 - INFO - Log file: C:\Users\...\backend\logs\performance_AUTOMATIC1111_stable-diffusion-webui_20260120_230015.log
2026-01-20 23:00:15 - INFO - ================================================================================
2026-01-20 23:00:15 - INFO - PHASE_START - PHASE_1_WORKFLOW_RUNS_COLLECTION - Repository: AUTOMATIC1111/stable-diffusion-webui
2026-01-20 23:00:15 - INFO - API_CALL - WORKFLOW_RUNS_COUNT_API - URL: https://api.github.com/repos/.../actions/runs?per_page=1 - Duration: 0.234s - Status: 200
2026-01-20 23:00:16 - INFO - API_CALL - WORKFLOW_RUNS_API - URL: https://api.github.com/repos/.../actions/workflows/.../runs?page=1&per_page=100 - Duration: 0.456s - Status: 200 - Page: 1
2026-01-20 23:05:30 - INFO - PHASE_END - PHASE_1_WORKFLOW_RUNS_COLLECTION - Total Duration: 315.234s - Total Runs: 1234
2026-01-20 23:05:30 - INFO - PHASE_START - PHASE_2_JOBS_COLLECTION - Repository: AUTOMATIC1111/stable-diffusion-webui - Total Runs: 1234
2026-01-20 23:05:31 - INFO - API_CALL - JOBS_API - URL: https://api.github.com/repos/.../actions/runs/12345/jobs - Duration: 0.567s - Status: 200
2026-01-20 23:15:45 - INFO - PHASE_END - PHASE_2_JOBS_COLLECTION - Total Duration: 615.789s - Total Runs: 1234
```

## Implementation Details

The logging is implemented in:
- `backend/core/utils/logger.py` - Logger setup and configuration
- `backend/ghaminer/src/request_github.py` - API call duration logging
- `backend/ghaminer_stream.py` - Phase timing and workflow runs API logging
- `backend/analysis/endpoint.py` - Logger initialization with repository name

## Notes

- Logs are written in real-time as collection progresses
- Each repository collection creates a new log file
- Log files are overwritten if a collection is started again for the same repository (new timestamp)
- The logger handles import errors gracefully - if logging setup fails, collection continues without logging

