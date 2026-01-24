# Data Persistence and Management Module

This module provides local persistence and intelligent data management for the GHA Dashboard streaming system.

## Overview

The data persistence and management system ensures that:
1. **Data is saved locally** - All collected workflow runs and jobs are saved to local JSON files
2. **Existing data is reused** - When collecting data for a project that was previously collected, the system intelligently skips what's already been collected
3. **Efficient API usage** - Reduces unnecessary API calls by skipping pages and runs that are already in cache

## Architecture

### DataPersistence (`persistence.py`)

Handles saving and loading workflow runs and jobs to/from local JSON files.

- **Storage Location**: `backend/data/storage/{repo_name}.json`
- **Data Structure**: Each repository has a JSON file containing:
  - `runs`: Dictionary of run_id -> run_data
  - `jobs_by_run`: Dictionary of run_id -> list of jobs
  - `workflow_date_ranges`: Dictionary of workflow_id -> date range info
  - `last_updated`: Timestamp of last update

### DataManager (`manager.py`)

Provides intelligent data management and skip logic.

**Key Features:**
- **Skip Page Logic**: For runs, if a page's date range is already fully covered by cached data, skip that page and potentially next few pages
- **Skip Job Collection**: For jobs, if a run already has jobs collected, skip the API call
- **Cache Management**: Maintains in-memory cache for fast lookups

## Usage

The modules are automatically integrated into `ghaminer_stream.py`. No manual configuration is required.

### How It Works

#### Phase 1: Workflow Runs Collection

1. For each workflow, pages are fetched sequentially
2. Before processing a page, the system checks if the page's date range is already in cache
3. If the page is fully covered, it's skipped (and potentially next 2 pages)
4. For each run in a non-skipped page:
   - Check if run already exists in cache
   - If exists, skip it (but still add to `all_runs` for Phase 2)
   - If new, process and save it
5. Runs are saved in batches of 50 for efficiency

#### Phase 2: Job Details Collection

1. Filter runs to only those that need jobs collected
2. For each run:
   - Check if jobs already exist in cache
   - If exists, load from cache
   - If not, fetch from API and save

## Skip Page Logic Details

The skip page mechanism works by:
1. Tracking the earliest and latest dates for each workflow in cached data
2. When a page is fetched, comparing the page's date range to the cached range
3. If `page_earliest >= cached_earliest AND page_latest <= cached_latest`, the page is skipped
4. Additionally, if a page is skipped, the next 2 pages are also skipped (conservative estimate)

This handles the case where:
- Initial collection was incomplete (only newest runs collected)
- Later collection needs to fill in gaps (older runs)
- New runs appear over time

## Data Format

### Run Data Structure
```json
{
  "id": "123456789",
  "workflow_id": "12345",
  "workflow_name": "CI",
  "branch": "main",
  "actor": "username",
  "status": "completed",
  "conclusion": "success",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z",
  "duration": 300.0,
  "jobs": []
}
```

### Jobs Data Structure
```json
[
  {
    "id": null,
    "name": "build",
    "status": "completed",
    "conclusion": "success",
    "duration": 150.0,
    "started_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:02:30Z"
  }
]
```

## Benefits

1. **Faster Collection**: Skips already-collected data, reducing API calls
2. **Data Persistence**: Data survives refreshes and restarts
3. **Incremental Updates**: Can collect new data without re-collecting everything
4. **Efficient Storage**: JSON format is human-readable and efficient for this use case

## File Locations

- **Storage Directory**: `backend/data/storage/`
- **Module Files**: `backend/data/persistence.py`, `backend/data/manager.py`
- **Integration**: `backend/ghaminer_stream.py`

