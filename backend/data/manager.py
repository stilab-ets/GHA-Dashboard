"""
Data management module for checking existing data and determining what to skip.
Implements smart skipping logic for runs (by date ranges) and jobs (by run ID).
"""
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple
from .persistence import DataPersistence


class DataManager:
    """
    Manages existing data and determines what should be skipped during collection.
    Implements skip page logic for runs and skip job collection for runs that already have jobs.
    """
    
    def __init__(self, repo: str, persistence: DataPersistence = None):
        """
        Initialize the data manager for a repository.
        
        Args:
            repo: Repository name (owner/repo)
            persistence: DataPersistence instance (creates new one if not provided)
        """
        self.repo = repo
        self.persistence = persistence or DataPersistence()
        
        # Cache loaded data for performance
        self._cached_runs: Optional[Dict[str, Dict]] = None
        self._cached_run_ids: Optional[Set[str]] = None
        self._cached_runs_with_jobs: Optional[Set[str]] = None
        self._cached_workflow_date_ranges: Optional[Dict[str, Dict]] = None
    
    def _load_cache(self):
        """Load and cache data from persistence."""
        if self._cached_runs is None:
            self._cached_runs = self.persistence.get_all_runs(self.repo)
            self._cached_run_ids = set(self._cached_runs.keys())
            self._cached_runs_with_jobs = self.persistence.get_runs_with_jobs(self.repo)
            
            # Load workflow date ranges
            all_runs = self._cached_runs.values()
            self._cached_workflow_date_ranges = {}
            
            for run in all_runs:
                workflow_id = str(run.get('workflow_id', ''))
                if not workflow_id:
                    continue
                
                created_at = run.get('created_at')
                if not created_at:
                    continue
                
                if workflow_id not in self._cached_workflow_date_ranges:
                    self._cached_workflow_date_ranges[workflow_id] = {
                        'earliest': created_at,
                        'latest': created_at
                    }
                else:
                    if created_at < self._cached_workflow_date_ranges[workflow_id]['earliest']:
                        self._cached_workflow_date_ranges[workflow_id]['earliest'] = created_at
                    if created_at > self._cached_workflow_date_ranges[workflow_id]['latest']:
                        self._cached_workflow_date_ranges[workflow_id]['latest'] = created_at
    
    def should_skip_run(self, run_id: str) -> bool:
        """
        Check if a run should be skipped (already exists).
        
        Args:
            run_id: Workflow run ID
            
        Returns:
            True if run should be skipped
        """
        self._load_cache()
        return str(run_id) in self._cached_run_ids
    
    def should_skip_jobs_for_run(self, run_id: str) -> bool:
        """
        Check if jobs should be skipped for a run (already collected).
        
        Args:
            run_id: Workflow run ID
            
        Returns:
            True if jobs should be skipped
        """
        self._load_cache()
        return str(run_id) in self._cached_runs_with_jobs
    
    def should_skip_page(self, workflow_id: str, page_runs: List[Dict]) -> Tuple[bool, int]:
        """
        Determine if a page should be skipped based on date ranges.
        Uses improved logic to calculate how many pages to skip based on date coverage.
        
        Args:
            workflow_id: Workflow ID
            page_runs: List of runs from the current page
            
        Returns:
            Tuple of (should_skip, skip_next_pages_count)
            - should_skip: True if this page should be skipped
            - skip_next_pages_count: Number of next pages to also skip (calculated based on date range)
        """
        if not page_runs:
            return False, 0
        
        self._load_cache()
        
        workflow_id_str = str(workflow_id)
        
        # Get date range for this workflow from cache
        cached_range = self._cached_workflow_date_ranges.get(workflow_id_str)
        if not cached_range:
            # No cached data for this workflow, don't skip
            return False, 0
        
        # Get earliest and latest dates from current page
        page_dates = []
        for run in page_runs:
            created_at = run.get('created_at')
            if created_at:
                page_dates.append(created_at)
        
        if not page_dates:
            # No dates in page, don't skip
            return False, 0
        
        page_earliest = min(page_dates)
        page_latest = max(page_dates)
        cached_earliest = cached_range['earliest']
        cached_latest = cached_range['latest']
        
        # Calculate date range coverage
        # If page dates are within cached range, skip this page
        if page_earliest >= cached_earliest and page_latest <= cached_latest:
            # All dates in this page are within cached range
            # Calculate how many pages to skip based on date range coverage
            # Estimate: if cached range covers a long period, we can skip more pages
            # Each page typically covers ~100 runs, which might span days/weeks
            
            # Calculate the time span of cached data
            try:
                from datetime import datetime
                cached_start = datetime.fromisoformat(cached_earliest.replace('Z', '+00:00'))
                cached_end = datetime.fromisoformat(cached_latest.replace('Z', '+00:00'))
                page_start = datetime.fromisoformat(page_earliest.replace('Z', '+00:00'))
                page_end = datetime.fromisoformat(page_latest.replace('Z', '+00:00'))
                
                cached_span_days = (cached_end - cached_start).total_seconds() / 86400
                page_span_days = (page_end - page_start).total_seconds() / 86400
                
                # If cached range is much larger than page range, we can skip more pages
                # Estimate: skip pages based on how much of the cached range we've covered
                # Conservative: skip 1-5 pages based on coverage ratio
                if page_span_days > 0:
                    coverage_ratio = cached_span_days / page_span_days
                    # Skip more pages if cached range is much larger
                    skip_count = min(int(coverage_ratio / 2), 5)  # Max 5 pages
                    skip_count = max(skip_count, 1)  # At least skip 1 more page
                else:
                    skip_count = 2  # Default
            except:
                # Fallback to conservative estimate
                skip_count = 2
            
            return True, skip_count
        
        # If page overlaps with cached range but extends beyond it, don't skip
        # (we need to collect the new data)
        return False, 0
    
    def check_page_has_existing_runs(self, workflow_id: str, page_runs: List[Dict]) -> Tuple[bool, int]:
        """
        Check if a page has any runs that exist in cache.
        Used for backtracking logic.
        
        Returns:
            Tuple of (has_any_existing, count_existing)
        """
        if not page_runs:
            return False, 0
        
        self._load_cache()
        
        existing_count = 0
        for run in page_runs:
            run_id = str(run.get('id', ''))
            if run_id and run_id in self._cached_run_ids:
                existing_count += 1
        
        return existing_count > 0, existing_count
    
    def filter_new_runs(self, runs: List[Dict]) -> List[Dict]:
        """
        Filter out runs that already exist in cache.
        
        Args:
            runs: List of run dictionaries
            
        Returns:
            List of new runs (not in cache)
        """
        self._load_cache()
        new_runs = []
        
        for run in runs:
            run_id = str(run.get('id'))
            if run_id and run_id not in self._cached_run_ids:
                new_runs.append(run)
        
        return new_runs
    
    def filter_runs_needing_jobs(self, runs: List[Dict]) -> List[Dict]:
        """
        Filter runs that need job collection (don't have jobs yet).
        
        Args:
            runs: List of run dictionaries
            
        Returns:
            List of runs that need jobs collected
        """
        self._load_cache()
        runs_needing_jobs = []
        
        for run in runs:
            run_id = str(run.get('id'))
            if run_id and run_id not in self._cached_runs_with_jobs:
                runs_needing_jobs.append(run)
        
        return runs_needing_jobs
    
    def get_existing_run(self, run_id: str) -> Optional[Dict]:
        """Get an existing run from cache, including jobs if available."""
        self._load_cache()
        run = self._cached_runs.get(str(run_id))
        if run:
            # Load jobs if available
            run_id_str = str(run_id)
            if run_id_str in self._cached_runs_with_jobs:
                jobs = self.persistence.get_jobs_for_run(self.repo, run_id_str)
                if jobs is not None:
                    run = run.copy()  # Don't modify cached version
                    run['jobs'] = jobs
        return run
    
    def update_cache_after_save(self, run: Dict = None, run_id: str = None, jobs: List[Dict] = None):
        """
        Update cache after saving new data (for performance).
        
        Args:
            run: Run dictionary that was saved
            run_id: Run ID (if run not provided)
            jobs: Jobs that were saved for the run
        """
        if self._cached_runs is None:
            return
        
        if run:
            run_id = str(run.get('id'))
            if run_id:
                self._cached_runs[run_id] = run
                self._cached_run_ids.add(run_id)
        
        if run_id and jobs is not None:
            run_id_str = str(run_id)
            if self._cached_runs_with_jobs is None:
                self._cached_runs_with_jobs = set()
            self._cached_runs_with_jobs.add(run_id_str)
    
    def invalidate_cache(self):
        """Invalidate the cache (force reload on next access)."""
        self._cached_runs = None
        self._cached_run_ids = None
        self._cached_runs_with_jobs = None
        self._cached_workflow_date_ranges = None

