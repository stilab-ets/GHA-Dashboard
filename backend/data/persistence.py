"""
Data persistence module for saving and loading workflow runs and jobs locally.
Uses JSON format for storage, organized by repository.
"""
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path


class DataPersistence:
    """
    Manages local persistence of workflow runs and jobs.
    Data is stored in JSON format, one file per repository.
    """
    
    def __init__(self, data_dir: str = None):
        """
        Initialize the persistence manager.
        
        Args:
            data_dir: Directory to store data files. Defaults to 'backend/data/storage'
        """
        if data_dir is None:
            # Default to backend/data/storage
            backend_dir = Path(__file__).parent.parent
            data_dir = os.path.join(backend_dir, 'data', 'storage')
        
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_repo_file(self, repo: str) -> Path:
        """Get the file path for a repository's data."""
        # Sanitize repo name for filename (replace / with _)
        safe_repo = repo.replace('/', '_').replace('\\', '_')
        return self.data_dir / f"{safe_repo}.json"
    
    def _load_data(self, repo: str) -> Dict[str, Any]:
        """Load data for a repository from disk."""
        repo_file = self._get_repo_file(repo)
        
        if not repo_file.exists():
            return {
                'repo': repo,
                'runs': {},
                'jobs_by_run': {},
                'workflow_date_ranges': {},
                'last_updated': None
            }
        
        try:
            with open(repo_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Ensure all required keys exist
                if 'runs' not in data:
                    data['runs'] = {}
                if 'jobs_by_run' not in data:
                    data['jobs_by_run'] = {}
                if 'workflow_date_ranges' not in data:
                    data['workflow_date_ranges'] = {}
                return data
        except Exception as e:
            print(f"[DataPersistence] Error loading data for {repo}: {e}")
            return {
                'repo': repo,
                'runs': {},
                'jobs_by_run': {},
                'workflow_date_ranges': {},
                'last_updated': None
            }
    
    def _save_data(self, repo: str, data: Dict[str, Any]):
        """Save data for a repository to disk."""
        repo_file = self._get_repo_file(repo)
        data['last_updated'] = datetime.utcnow().isoformat()
        
        try:
            # Write atomically using a temp file
            temp_file = repo_file.with_suffix('.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            temp_file.replace(repo_file)
        except Exception as e:
            print(f"[DataPersistence] Error saving data for {repo}: {e}")
            raise
    
    def save_run(self, repo: str, run: Dict[str, Any]):
        """
        Save a workflow run to local storage.
        
        Args:
            repo: Repository name (owner/repo)
            run: Run data dictionary (must have 'id' field)
        """
        run_id = str(run.get('id'))
        if not run_id:
            print(f"[DataPersistence] Warning: Run missing 'id' field, skipping save")
            return
        
        data = self._load_data(repo)
        data['runs'][run_id] = run
        self._save_data(repo, data)
    
    def save_runs_batch(self, repo: str, runs: List[Dict[str, Any]]):
        """
        Save multiple workflow runs in a batch (more efficient).
        
        Args:
            repo: Repository name (owner/repo)
            runs: List of run data dictionaries
        """
        if not runs:
            return
        
        data = self._load_data(repo)
        
        for run in runs:
            run_id = str(run.get('id'))
            if run_id:
                data['runs'][run_id] = run
        
        self._save_data(repo, data)
    
    def save_jobs_for_run(self, repo: str, run_id: str, jobs: List[Dict[str, Any]]):
        """
        Save jobs for a specific run.
        
        Args:
            repo: Repository name (owner/repo)
            run_id: Workflow run ID
            jobs: List of job data dictionaries
        """
        run_id_str = str(run_id)
        data = self._load_data(repo)
        data['jobs_by_run'][run_id_str] = jobs
        self._save_data(repo, data)
    
    def get_run(self, repo: str, run_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific run by ID."""
        data = self._load_data(repo)
        return data['runs'].get(str(run_id))
    
    def get_all_runs(self, repo: str) -> Dict[str, Dict[str, Any]]:
        """Get all runs for a repository."""
        data = self._load_data(repo)
        return data['runs']
    
    def get_jobs_for_run(self, repo: str, run_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get jobs for a specific run."""
        data = self._load_data(repo)
        return data['jobs_by_run'].get(str(run_id))
    
    def has_run(self, repo: str, run_id: str) -> bool:
        """Check if a run exists in storage."""
        data = self._load_data(repo)
        return str(run_id) in data['runs']
    
    def has_jobs_for_run(self, repo: str, run_id: str) -> bool:
        """Check if jobs have been collected for a run."""
        data = self._load_data(repo)
        return str(run_id) in data['jobs_by_run']
    
    def get_all_run_ids(self, repo: str) -> set:
        """Get all run IDs for a repository."""
        data = self._load_data(repo)
        return set(data['runs'].keys())
    
    def get_runs_with_jobs(self, repo: str) -> set:
        """Get all run IDs that have jobs collected."""
        data = self._load_data(repo)
        return set(data['jobs_by_run'].keys())
    
    def update_workflow_date_range(self, repo: str, workflow_id: str, earliest_date: str, latest_date: str):
        """
        Update the date range for a workflow (used for skip page logic).
        
        Args:
            repo: Repository name
            workflow_id: Workflow ID
            earliest_date: Earliest run date (ISO format)
            latest_date: Latest run date (ISO format)
        """
        data = self._load_data(repo)
        if 'workflow_date_ranges' not in data:
            data['workflow_date_ranges'] = {}
        
        workflow_id_str = str(workflow_id)
        if workflow_id_str not in data['workflow_date_ranges']:
            data['workflow_date_ranges'][workflow_id_str] = {
                'earliest': earliest_date,
                'latest': latest_date
            }
        else:
            # Update to expand the range if needed
            existing = data['workflow_date_ranges'][workflow_id_str]
            if earliest_date < existing['earliest']:
                existing['earliest'] = earliest_date
            if latest_date > existing['latest']:
                existing['latest'] = latest_date
        
        self._save_data(repo, data)
    
    def get_workflow_date_range(self, repo: str, workflow_id: str) -> Optional[Dict[str, str]]:
        """Get the date range for a workflow."""
        data = self._load_data(repo)
        return data['workflow_date_ranges'].get(str(workflow_id))

