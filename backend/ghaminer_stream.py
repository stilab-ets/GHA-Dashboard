"""
GHAminer Streaming Wrapper
Converts GHAminer's batch CSV collection into real-time WebSocket streaming
"""
import sys
import os
import json
from datetime import datetime
from typing import Any, Generator, Dict, List, Optional

# Add GHAminer src to path
ghaminer_src_path = os.path.join(os.path.dirname(__file__), 'ghaminer', 'src')
if ghaminer_src_path not in sys.path:
    sys.path.insert(0, ghaminer_src_path)

import requests
import yaml

# Import GHAminer modules
try:
    from build_run_analyzer import get_jobs_for_run
    from repo_info_collector import get_workflow_ids, get_repository_languages
    from request_github import get_request
except ImportError as e:
    print(f"[GHAminer Stream] Error importing GHAminer modules: {e}")
    print(f"[GHAminer Stream] GHAminer src path: {ghaminer_src_path}")
    raise


def load_config(config_file: str = None) -> dict:
    """Load GHAminer config.yaml"""
    if config_file is None:
        config_file = os.path.join(os.path.dirname(__file__), 'ghaminer', 'src', 'config.yaml')
    
    try:
        with open(config_file, 'r') as file:
            config = yaml.safe_load(file)
        return config
    except Exception as e:
        print(f"[GHAminer] Failed to load config: {e}")
        return {
            'workflow_ids': [],
            'fetch_job_details': True,
            'fetch_test_parsing_results': False,
            'fetch_commit_details': False,
            'fetch_pull_request_details': False,
            'fetch_sloc': False
        }


def convert_ghaminer_run_to_dashboard(run_data: dict, repo: str) -> dict:
    """
    Convert GHAminer's run data format to dashboard format
    """
    # Extract job details if available
    jobs = []
    if run_data.get('job_details'):
        job_details = run_data['job_details']
        if isinstance(job_details, str):
            try:
                job_details = json.loads(job_details)
            except:
                job_details = []
        
        if isinstance(job_details, list):
            for job in job_details:
                if isinstance(job, dict):
                    # Extract job info
                    job_name = job.get('job_name', 'Unknown')
                    job_result = job.get('job_result', 'unknown')
                    job_start = job.get('job_start')
                    job_end = job.get('job_end')
                    job_duration = job.get('job_duration', 0)
                    
                    # Convert duration if it's a string
                    if isinstance(job_duration, str) and job_duration != "N/A":
                        try:
                            job_duration = float(job_duration)
                        except:
                            job_duration = 0
                    elif job_duration == "N/A":
                        job_duration = 0
                    
                    # If duration is 0, try to calculate from start/end times
                    if job_duration == 0 and job_start and job_end:
                        try:
                            start_dt = datetime.strptime(job_start, "%Y-%m-%dT%H:%M:%SZ")
                            end_dt = datetime.strptime(job_end, "%Y-%m-%dT%H:%M:%SZ")
                            job_duration = (end_dt - start_dt).total_seconds()
                        except:
                            pass
                    
                    jobs.append({
                        'id': None,  # GHAminer doesn't provide job ID in this format
                        'name': job_name,
                        'status': 'completed' if job_result in ['success', 'failure', 'cancelled', 'skipped', 'timed_out'] else 'in_progress',
                        'conclusion': job_result,
                        'duration': job_duration,
                        'started_at': job_start,
                        'completed_at': job_end
                    })
    
    # Extract pull request number
    pull_request_number = None
    if run_data.get('gh_pull_req_number'):
        try:
            pull_request_number = int(run_data['gh_pull_req_number'])
        except:
            pass
    
    # Calculate duration
    duration = 0
    if run_data.get('build_duration'):
        try:
            duration = float(run_data['build_duration'])
        except:
            pass
    
    # Get actor
    actor = run_data.get('issuer_name') or run_data.get('actor') or None
    
    # Get commit SHA (try multiple field names)
    commit_sha = run_data.get('commit_sha') or run_data.get('head_sha') or None
    
    return {
        'id': run_data.get('id_build') or run_data.get('id'),
        'workflow_id': run_data.get('workflow_id'),
        'workflow_name': run_data.get('workflow_name') or run_data.get('name') or 'Unknown',
        'branch': run_data.get('branch') or run_data.get('head_branch'),
        'actor': actor,
        'status': run_data.get('status', 'completed'),
        'conclusion': run_data.get('conclusion', 'unknown'),
        'created_at': run_data.get('created_at'),
        'updated_at': run_data.get('updated_at'),
        'duration': duration,
        'run_number': run_data.get('run_number'),
        'event': run_data.get('workflow_event_trigger') or run_data.get('event'),
        'html_url': f"https://github.com/{repo}/actions/runs/{run_data.get('id_build') or run_data.get('id')}",
        'pull_request_number': pull_request_number,
        'jobs_url': f"https://api.github.com/repos/{repo}/actions/runs/{run_data.get('id_build') or run_data.get('id')}/jobs",
        'jobs': jobs,
        'commit_sha': commit_sha,
        'head_sha': commit_sha  # Also include as head_sha for compatibility
    }


def get_total_workflow_runs_count(repo: str, token: str) -> int:
    """
    Get the total count of workflow runs for a repository using GitHub API.
    Returns total_count from the /repos/{owner}/{repo}/actions/runs endpoint.
    """
    try:
        api_url = f"https://api.github.com/repos/{repo}/actions/runs?per_page=1"
        headers = {
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
        import requests as req_module
        resp = req_module.get(api_url, headers=headers)
        
        if resp.status_code == 200:
            response = resp.json()
            total_count = response.get('total_count', 0)
            print(f"[GHAminer Stream] Total workflow runs count: {total_count}")
            return total_count
        else:
            print(f"[GHAminer Stream] Failed to get total count: {resp.status_code}")
            return 0
    except Exception as e:
        print(f"[GHAminer Stream] Error getting total count: {e}")
        return 0


def stream_workflow_runs_phase1(repo: str, token: str, config: dict = None) -> Generator[tuple[Dict[str, Any], int, int, List[Dict[str, Any]]], None, None]:
    """
    Phase 1: Collect all workflow runs FIRST (without job details)
    Yields: (dashboard_run_dict, current_count, total_count, all_runs_list)
    """
    if config is None:
        config = load_config()
    
    print(f"[GHAminer Stream] Phase 1: Starting workflow runs collection for {repo}")
    
    # Get total count upfront
    total_count = get_total_workflow_runs_count(repo, token)
    
    # Get workflow IDs (filtered by config if specified)
    specific_workflow_ids = config.get("workflow_ids", [])
    workflow_ids = get_workflow_ids(repo, token, specific_workflow_ids)
    
    print(f"[GHAminer Stream] Found {len(workflow_ids)} workflows to process")
    
    total_runs = 0
    all_runs = []  # Store all runs for Phase 2
    # Use the total_count from API if available, otherwise fall back to estimation
    # If total_count is 0 (API failed), we'll use estimation as fallback
    actual_total = total_count if total_count > 0 else None
    
    # Process each workflow
    for workflow_id in workflow_ids:
        page = 1
        
        while True:
            # Fetch workflow runs page
            api_url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_id}/runs?page={page}&per_page=100"
            
            # Use requests directly to get Link header for pagination
            headers = {'Authorization': f'token {token}'}
            import requests as req_module
            resp = req_module.get(api_url, headers=headers)
            
            if resp.status_code != 200:
                print(f"[GHAminer Stream] Failed to fetch page {page}: {resp.status_code}")
                break
            
            response = resp.json()
            
            if not response or 'workflow_runs' not in response:
                break
            
            workflow_runs = response.get('workflow_runs', [])
            if not workflow_runs:
                break
            
            print(f"[GHAminer Stream] Processing page {page} of workflow {workflow_id}: {len(workflow_runs)} runs")
            
            # Process each run (WITHOUT fetching job details)
            for run in workflow_runs:
                run_id = run['id']
                
                # Build basic run info (NO JOB DETAILS)
                run_data = {
                    'id_build': run_id,
                    'workflow_id': workflow_id,
                    'workflow_name': run.get('name', 'Unknown Workflow'),
                    'name': run.get('name', 'Unknown Workflow'),
                    'status': run.get('status', 'completed'),
                    'conclusion': run.get('conclusion', 'unknown'),
                    'created_at': run.get('created_at'),
                    'updated_at': run.get('updated_at'),
                    'run_number': run.get('run_number'),
                    'workflow_event_trigger': run.get('event', 'unknown'),
                    'event': run.get('event', 'unknown'),
                    'branch': run.get('head_branch'),
                    'head_branch': run.get('head_branch'),
                    'actor': run.get('actor', {}).get('login') if isinstance(run.get('actor'), dict) else None,
                    'issuer_name': run.get('actor', {}).get('login') if isinstance(run.get('actor'), dict) else None,
                    'job_details': [],  # Empty for now
                    'total_jobs': 0
                }
                
                # Calculate duration
                if run.get('run_started_at') and run.get('updated_at'):
                    try:
                        start_dt = datetime.strptime(run['run_started_at'], '%Y-%m-%dT%H:%M:%SZ')
                        end_dt = datetime.strptime(run['updated_at'], '%Y-%m-%dT%H:%M:%SZ')
                        run_data['build_duration'] = (end_dt - start_dt).total_seconds()
                    except:
                        run_data['build_duration'] = 0
                else:
                    run_data['build_duration'] = 0
                
                # Convert to dashboard format (without jobs)
                dashboard_run = convert_ghaminer_run_to_dashboard(run_data, repo)
                all_runs.append(dashboard_run)
                total_runs += 1
                
                # Use actual_total if we have it, otherwise use total_runs as fallback
                display_total = actual_total if actual_total else max(total_runs, total_runs + 100 if len(workflow_runs) == 100 else total_runs)
                
                yield (dashboard_run, total_runs, display_total, all_runs)
            
            # Check for next page using Link header
            link_header = resp.headers.get('Link', '')
            has_next = 'rel="next"' in link_header or len(workflow_runs) == 100
            
            if has_next:
                page += 1
            else:
                break
    
    print(f"[GHAminer Stream] Phase 1 complete: {total_runs} runs collected")


def stream_job_details_phase2(repo: str, token: str, all_runs: List[Dict[str, Any]], config: dict = None) -> Generator[tuple[Dict[str, Any], int, int], None, None]:
    """
    Phase 2: Collect job details for all collected runs
    Yields: (updated_dashboard_run_dict, current_count, total_runs)
    """
    if config is None:
        config = load_config()
    
    if not config.get("fetch_job_details", True):
        print(f"[GHAminer Stream] Phase 2: Skipped (fetch_job_details=False)")
        return
    
    total_runs = len(all_runs)
    print(f"[GHAminer Stream] Phase 2: Starting job details collection for {total_runs} runs")
    
    for idx, dashboard_run in enumerate(all_runs):
        # Dashboard dicts use 'id' field
        run_id = dashboard_run.get('id')
        
        if not run_id:
            continue
        
        try:
            # Fetch job details from GitHub API
            jobs_ids, job_details, job_count = get_jobs_for_run(repo, int(run_id), token)
            
            # Convert job details to dashboard format (list of job objects)
            jobs_list = []
            if job_details:
                for job in job_details:
                    if isinstance(job, dict):
                        job_name = job.get('job_name', 'Unknown')
                        job_result = job.get('job_result', 'unknown')
                        job_start = job.get('job_start')
                        job_end = job.get('job_end')
                        job_duration = job.get('job_duration', 0)
                        
                        # Convert duration if it's a string
                        if isinstance(job_duration, str) and job_duration != "N/A":
                            try:
                                job_duration = float(job_duration)
                            except:
                                job_duration = 0
                        elif job_duration == "N/A":
                            job_duration = 0
                        
                        # If duration is 0, try to calculate from start/end times
                        if job_duration == 0 and job_start and job_end:
                            try:
                                start_dt = datetime.strptime(job_start, "%Y-%m-%dT%H:%M:%SZ")
                                end_dt = datetime.strptime(job_end, "%Y-%m-%dT%H:%M:%SZ")
                                job_duration = (end_dt - start_dt).total_seconds()
                            except:
                                pass
                        
                        jobs_list.append({
                            'id': None,  # Job ID not available in this format
                            'name': job_name,
                            'status': 'completed' if job_result in ['success', 'failure', 'cancelled', 'skipped', 'timed_out'] else 'in_progress',
                            'conclusion': job_result,
                            'duration': job_duration,
                            'started_at': job_start,
                            'completed_at': job_end
                        })
            
            # Update the dashboard dict directly with jobs
            dashboard_run['jobs'] = jobs_list
            current_count = idx + 1
            
            yield (dashboard_run, current_count, total_runs)
            
        except Exception as e:
            print(f"[GHAminer Stream] Error fetching jobs for run {run_id}: {e}")
            # Keep the run without job details (jobs list should already be empty)
            if 'jobs' not in dashboard_run:
                dashboard_run['jobs'] = []
            yield (dashboard_run, idx + 1, total_runs)
    
    print(f"[GHAminer Stream] Phase 2 complete: Job details collected for {total_runs} runs")


def stream_ghaminer_data(repo: str, token: str, config: dict = None) -> Generator[Dict[str, Any], None, None]:
    """
    Main generator that orchestrates two-phase collection:
    Phase 1: Collect all workflow runs (without jobs)
    Phase 2: Collect job details for all runs
    """
    # Phase 1: Collect all workflow runs
    all_runs_list = []
    for dashboard_run, current_count, estimated_total, all_runs in stream_workflow_runs_phase1(repo, token, config):
        all_runs_list = all_runs  # Keep updating the list
        yield dashboard_run
    
    # Phase 2: Collect job details (if enabled)
    if config and config.get("fetch_job_details", True):
        for updated_run, current_count, total_runs in stream_job_details_phase2(repo, token, all_runs_list, config):
            yield updated_run

