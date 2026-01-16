# Database Inspection Guide

This guide shows you how to inspect the PostgreSQL database to see what data is being collected.

## Option 1: Using Docker Exec (Recommended)

### 1. Connect to the PostgreSQL container

```bash
docker exec -it gha-postgres psql -U postgres -d gha_dashboard
```

### 2. Useful SQL Queries

#### Check total workflow runs collected:
```sql
SELECT COUNT(*) as total_runs FROM workflow_runs;
```

#### Check runs with job counts:
```sql
SELECT 
    id_build,
    workflow_id,
    branch,
    conclusion,
    total_jobs,
    created_at
FROM workflow_runs
WHERE total_jobs IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

#### Check how many runs have jobs:
```sql
SELECT 
    COUNT(*) as total_runs,
    COUNT(total_jobs) as runs_with_job_count,
    SUM(total_jobs) as total_jobs_collected
FROM workflow_runs;
```

#### Check runs by repository:
```sql
SELECT 
    r.repo_name,
    COUNT(wr.id_build) as run_count,
    COUNT(wr.total_jobs) as runs_with_jobs,
    SUM(wr.total_jobs) as total_jobs
FROM repositories r
LEFT JOIN workflow_runs wr ON wr.repository_id = r.id
GROUP BY r.repo_name;
```

#### Check recent runs and their job counts:
```sql
SELECT 
    wr.id_build,
    w.workflow_name,
    wr.branch,
    wr.conclusion,
    wr.total_jobs,
    wr.created_at
FROM workflow_runs wr
JOIN workflows w ON wr.workflow_id = w.id
ORDER BY wr.created_at DESC
LIMIT 50;
```

#### Check if any runs have jobs_url stored (if we add that field):
```sql
-- This query checks the structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'workflow_runs';
```

### 3. Exit the PostgreSQL prompt
```sql
\q
```

## Option 2: Using pgAdmin (Web Interface)

1. Open your browser and go to: `http://localhost:5050`
2. Login with:
   - Email: `admin@gha.com`
   - Password: `admin`
3. Connect to the server:
   - Right-click "Servers" → "Create" → "Server"
   - Name: `GHA Dashboard`
   - Connection tab:
     - Host: `postgres` (or `localhost` if connecting from outside Docker)
     - Port: `5432`
     - Database: `gha_dashboard`
     - Username: `postgres`
     - Password: `postgres`
4. Navigate to: `Servers` → `GHA Dashboard` → `Databases` → `gha_dashboard` → `Schemas` → `public` → `Tables`
5. Right-click on `workflow_runs` → "View/Edit Data" → "All Rows"

## Option 3: Using a Database Client (DBeaver, pgAdmin Desktop, etc.)

### Connection Details:
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `gha_dashboard`
- **Username**: `postgres`
- **Password**: `postgres`

## Quick Check Script

You can also run this one-liner to see a summary:

```bash
docker exec -it gha-postgres psql -U postgres -d gha_dashboard -c "
SELECT 
    'Total Runs' as metric,
    COUNT(*)::text as value
FROM workflow_runs
UNION ALL
SELECT 
    'Runs with Job Count' as metric,
    COUNT(*)::text as value
FROM workflow_runs
WHERE total_jobs IS NOT NULL
UNION ALL
SELECT 
    'Total Jobs Collected' as metric,
    COALESCE(SUM(total_jobs), 0)::text as value
FROM workflow_runs;
"
```

## Important Notes

1. **Job data is NOT stored in the database** - Only the `total_jobs` count is stored. The actual job details (name, status, conclusion, duration) are only kept in memory (Chrome storage) and sent to the frontend.

2. **To see actual job data**, check the browser console logs (added in this update) or inspect Chrome storage:
   - Open DevTools → Application → Storage → Local Storage
   - Look for `wsRuns` key - this contains all runs with their job arrays

3. **The `total_jobs` field** in `workflow_runs` table is updated when jobs are collected, so you can verify that job collection is happening by checking if this field is being populated.


