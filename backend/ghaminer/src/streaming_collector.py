"""
Streaming Collector for GHAminer
Collects workflow runs page by page and streams to WebSocket,
then collects job details and updates CSV.
"""
import requests
import csv
import os
import time
import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable, Dict, List
from build_run_analyzer import get_jobs_for_run
from request_github import get_request

logger = logging.getLogger(__name__)


class StreamingCollector:
    """
    Collects workflow runs page by page and streams them to a callback function.
    After all runs are collected, fetches job details and updates CSV.
    """
    
    def __init__(self, repo_full_name: str, token: str, output_csv: str, 
                 websocket_callback: Optional[Callable] = None):
        """
        Initialize the streaming collector.
        
        Args:
            repo_full_name: Repository name (owner/repo)
            token: GitHub API token
            output_csv: Path to output CSV file
            websocket_callback: Optional callback function to stream data (receives dict with type and data)
        """
        self.repo_full_name = repo_full_name
        self.token = token
        self.output_csv = output_csv
        self.websocket_callback = websocket_callback
        self.all_runs = []
        self.csv_file_exists = os.path.exists(output_csv)
        
    def _send_websocket_message(self, message_type: str, data: Dict):
        """Send a message via WebSocket callback if available."""
        if self.websocket_callback:
            try:
                message = {
                    "type": message_type,
                    "data": data
                }
                self.websocket_callback(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")
    
    def _load_existing_runs_from_csv(self) -> set:
        """Load existing run IDs from CSV to avoid duplicates."""
        existing_ids = set()
        if not self.csv_file_exists:
            return existing_ids
            
        try:
            with open(self.output_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if 'id_build' in row and row['id_build']:
                        existing_ids.add(str(row['id_build']))
        except Exception as e:
            logger.error(f"Error reading existing build IDs from {self.output_csv}: {e}")
        
        return existing_ids
    
    def collect_workflow_runs(self, max_pages: int = 200):
        """
        Collect all workflow runs page by page (100 runs per page).
        Streams each page as it's collected.
        
        Args:
            max_pages: Maximum number of pages to fetch
        """
        owner, repo_name = self.repo_full_name.split("/")
        url = f"https://api.github.com/repos/{owner}/{repo_name}/actions/runs"
        
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json"
        }
        
        existing_ids = self._load_existing_runs_from_csv()
        page = 1
        total_collected = 0
        
        self._send_websocket_message("status", {
            "message": "Starting workflow runs collection...",
            "stage": "collecting_runs"
        })
        
        while page <= max_pages:
            logger.info(f"📄 Fetching page {page}...")
            
            params = {
                "per_page": 100,
                "page": page
            }
            
            try:
                response = requests.get(url, headers=headers, params=params, timeout=30)
                
                if response.status_code != 200:
                    error_msg = f"GitHub API error: {response.status_code} → {response.text}"
                    logger.error(error_msg)
                    self._send_websocket_message("error", {"message": error_msg})
                    break
                
                data = response.json()
                
                if "workflow_runs" not in data or len(data["workflow_runs"]) == 0:
                    logger.info("No more pages → collection complete")
                    break
                
                # Process runs in this page
                page_runs = []
                for run in data["workflow_runs"]:
                    run_id = str(run.get('id'))
                    
                    # Skip if already exists
                    if run_id in existing_ids:
                        continue
                    
                    existing_ids.add(run_id)
                    
                    # Process run data
                    processed_run = self._process_workflow_run(run)
                    page_runs.append(processed_run)
                    self.all_runs.append(processed_run)
                
                total_collected += len(page_runs)
                
                # Stream this page
                self._send_websocket_message("runs_page", {
                    "page": page,
                    "runs": page_runs,
                    "total_collected": total_collected,
                    "has_more": len(data["workflow_runs"]) == 100
                })
                
                logger.info(f"Page {page}: Collected {len(page_runs)} runs (total: {total_collected})")
                
                # Rate limiting
                time.sleep(0.5)
                page += 1
                
            except Exception as e:
                logger.error(f"Error fetching page {page}: {e}")
                self._send_websocket_message("error", {"message": str(e)})
                break
        
        logger.info(f"✅ Collected {total_collected} workflow runs for {self.repo_full_name}")
        self._send_websocket_message("status", {
            "message": f"Collected {total_collected} workflow runs. Starting job details collection...",
            "stage": "collecting_jobs",
            "total_runs": total_collected
        })
        
        return total_collected
    
    def _process_workflow_run(self, run: Dict) -> Dict:
        """Process a single workflow run into a standardized format."""
        actor = run.get('actor', {})
        actor_login = actor.get('login') if isinstance(actor, dict) else str(actor) if actor else None
        
        # Calculate duration
        duration = 0
        if run.get('updated_at') and run.get('created_at'):
            try:
                created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
                updated = datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
                duration = (updated - created).total_seconds()
            except:
                duration = 0
        
        return {
            'id_build': str(run.get('id')),
            'workflow_id': str(run.get('workflow_id', '')),
            'workflow_name': run.get('name', 'Unknown Workflow'),
            'status': run.get('status', 'unknown'),
            'conclusion': run.get('conclusion', 'unknown'),
            'created_at': run.get('created_at', ''),
            'updated_at': run.get('updated_at', ''),
            'branch': run.get('head_branch', ''),
            'commit_sha': run.get('head_sha', ''),
            'event': run.get('event', 'unknown'),
            'issuer_name': actor_login or 'unknown',
            'run_number': run.get('run_number', 0),
            'build_duration': duration,
            'job_details': None,  # Will be filled later
            'total_jobs': 0,  # Will be filled later
            'repo': self.repo_full_name
        }
    
    def collect_job_details(self):
        """
        Collect job details for all collected runs.
        Updates the CSV file and streams updates.
        """
        total_runs = len(self.all_runs)
        if total_runs == 0:
            logger.warning("No runs to collect job details for")
            return
        
        logger.info(f"🔍 Collecting job details for {total_runs} runs...")
        
        updated_count = 0
        
        for idx, run in enumerate(self.all_runs):
            run_id = run['id_build']
            
            try:
                # Fetch job details
                jobs_ids, job_details, job_count = get_jobs_for_run(
                    self.repo_full_name, 
                    int(run_id), 
                    self.token
                )
                
                # Update run data
                run['total_jobs'] = job_count
                run['job_details'] = json.dumps(job_details) if job_details else None
                
                updated_count += 1
                
                # Stream progress update
                if (idx + 1) % 10 == 0 or (idx + 1) == total_runs:
                    self._send_websocket_message("job_progress", {
                        "processed": idx + 1,
                        "total": total_runs,
                        "current_run_id": run_id
                    })
                
                # Rate limiting
                time.sleep(0.3)
                
            except Exception as e:
                logger.error(f"Error fetching job details for run {run_id}: {e}")
                continue
        
        logger.info(f"✅ Collected job details for {updated_count}/{total_runs} runs")
        
        # Update CSV with job details
        self._update_csv_with_job_details()
        
        self._send_websocket_message("status", {
            "message": f"Job details collection complete. Updated {updated_count} runs.",
            "stage": "complete",
            "updated_runs": updated_count
        })
    
    def _update_csv_with_job_details(self):
        """Update CSV file with job details for all runs."""
        if not self.all_runs:
            return
        
        # Read existing CSV if it exists
        existing_runs = {}
        fieldnames = None
        
        if self.csv_file_exists:
            try:
                with open(self.output_csv, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    fieldnames = reader.fieldnames
                    for row in reader:
                        existing_runs[str(row.get('id_build', ''))] = row
            except Exception as e:
                logger.error(f"Error reading existing CSV: {e}")
        
        # Update existing runs with job details
        for run in self.all_runs:
            run_id = run['id_build']
            if run_id in existing_runs:
                existing_runs[run_id]['total_jobs'] = run.get('total_jobs', 0)
                existing_runs[run_id]['job_details'] = run.get('job_details', '')
        
        # Determine fieldnames
        if not fieldnames:
            # Create new CSV with all fields
            fieldnames = [
                'repo', 'id_build', 'workflow_id', 'workflow_name', 'status', 
                'conclusion', 'created_at', 'updated_at', 'branch', 'commit_sha',
                'event', 'issuer_name', 'run_number', 'build_duration',
                'total_jobs', 'job_details'
            ]
        
        # Ensure job-related fields are in fieldnames
        if 'total_jobs' not in fieldnames:
            fieldnames.append('total_jobs')
        if 'job_details' not in fieldnames:
            fieldnames.append('job_details')
        
        # Write updated CSV
        try:
            # Combine existing and new runs
            all_runs_dict = {**existing_runs}
            for run in self.all_runs:
                all_runs_dict[run['id_build']] = run
            
            with open(self.output_csv, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for run_id, run_data in all_runs_dict.items():
                    # Ensure all fields are present
                    row = {field: run_data.get(field, '') for field in fieldnames}
                    writer.writerow(row)
            
            logger.info(f"✅ Updated CSV file: {self.output_csv}")
            self._send_websocket_message("csv_updated", {
                "message": f"CSV file updated with {len(all_runs_dict)} runs",
                "file_path": self.output_csv
            })
            
        except Exception as e:
            logger.error(f"Error writing CSV: {e}")
            self._send_websocket_message("error", {"message": f"Error updating CSV: {str(e)}"})
    
    def save_initial_runs_to_csv(self):
        """Save initial workflow runs (without job details) to CSV."""
        if not self.all_runs:
            return
        
        fieldnames = [
            'repo', 'id_build', 'workflow_id', 'workflow_name', 'status', 
            'conclusion', 'created_at', 'updated_at', 'branch', 'commit_sha',
            'event', 'issuer_name', 'run_number', 'build_duration',
            'total_jobs', 'job_details'
        ]
        
        # Read existing runs if CSV exists
        existing_runs = {}
        if self.csv_file_exists:
            try:
                with open(self.output_csv, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        existing_runs[str(row.get('id_build', ''))] = row
            except Exception as e:
                logger.error(f"Error reading existing CSV: {e}")
        
        # Add new runs
        for run in self.all_runs:
            existing_runs[run['id_build']] = run
        
        # Write CSV
        try:
            with open(self.output_csv, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for run_id, run_data in existing_runs.items():
                    row = {field: run_data.get(field, '') for field in fieldnames}
                    writer.writerow(row)
            
            logger.info(f"✅ Saved {len(existing_runs)} runs to CSV: {self.output_csv}")
            
        except Exception as e:
            logger.error(f"Error saving CSV: {e}")

