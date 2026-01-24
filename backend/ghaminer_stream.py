"""
GHAminer Streaming Wrapper
Converts GHAminer's batch CSV collection into real-time WebSocket streaming
"""
import sys
import os
import json
import time
from datetime import datetime
from typing import Any, Generator, Dict, List, Optional

# Add GHAminer src to path
ghaminer_src_path = os.path.join(os.path.dirname(__file__), 'ghaminer', 'src')
if ghaminer_src_path not in sys.path:
    sys.path.insert(0, ghaminer_src_path)

# Add backend to path for logger
backend_path = os.path.dirname(__file__)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

import requests
import yaml

# Try to import performance logger
try:
    from core.utils.logger import get_performance_logger
    PERFORMANCE_LOGGING = True
except ImportError:
    PERFORMANCE_LOGGING = False

# Import data persistence and management modules
try:
    from data.persistence import DataPersistence
    from data.manager import DataManager
    DATA_PERSISTENCE_AVAILABLE = True
except ImportError as e:
    print(f"[GHAminer Stream] Warning: Data persistence not available: {e}")
    DATA_PERSISTENCE_AVAILABLE = False

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
        
        # Log API call duration
        start_time = time.time()
        resp = req_module.get(api_url, headers=headers)
        duration = time.time() - start_time
        
        if PERFORMANCE_LOGGING:
            try:
                perf_logger = get_performance_logger()
                perf_logger.info(f"API_CALL - WORKFLOW_RUNS_COUNT_API - URL: {api_url} - Duration: {duration:.3f}s - Status: {resp.status_code}")
            except:
                pass
        
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
    
    phase1_start_time = time.time()
    print(f"[GHAminer Stream] Phase 1: Starting workflow runs collection for {repo}")
    
    if PERFORMANCE_LOGGING:
        try:
            perf_logger = get_performance_logger()
            perf_logger.info(f"PHASE_START - PHASE_1_WORKFLOW_RUNS_COLLECTION - Repository: {repo}")
        except:
            pass
    
    # Initialize data persistence and manager
    persistence = None
    data_manager = None
    existing_runs_count = 0
    if DATA_PERSISTENCE_AVAILABLE:
        try:
            persistence = DataPersistence()
            data_manager = DataManager(repo, persistence)
            # Load ALL existing runs at the start
            all_existing_runs = persistence.get_all_runs(repo)
            existing_runs_count = len(all_existing_runs)
            print(f"[GHAminer Stream] Data persistence enabled - found {existing_runs_count} existing runs in cache")
        except Exception as e:
            print(f"[GHAminer Stream] Warning: Failed to initialize data persistence: {e}")
    
    # Get total count upfront
    total_count = get_total_workflow_runs_count(repo, token)
    
    # Get workflow IDs (filtered by config if specified)
    specific_workflow_ids = config.get("workflow_ids", [])
    workflow_ids = get_workflow_ids(repo, token, specific_workflow_ids)
    
    print(f"[GHAminer Stream] Found {len(workflow_ids)} workflows to process")
    
    total_runs = 0
    new_runs_collected = 0
    all_runs = []  # Store all runs for Phase 2 (existing + new)
    runs_to_save = []  # Batch runs for saving
    
    # Load all existing runs into all_runs at the start
    if data_manager and persistence:
        all_existing_runs_dict = persistence.get_all_runs(repo)
        for run_id, run_data in all_existing_runs_dict.items():
            all_runs.append(run_data)
        total_runs = len(all_runs)
        print(f"[GHAminer Stream] Loaded {len(all_runs)} existing runs into memory for Phase 2")
    # Use the total_count from API if available, otherwise fall back to estimation
    # If total_count is 0 (API failed), we'll use estimation as fallback
    actual_total = total_count if total_count > 0 else None
    
    # Process each workflow
    for workflow_id in workflow_ids:
        page = 1
        skip_next_pages = 0  # Track how many pages to skip
        last_skipped_page = None  # Track last skipped page for backtracking
        
        while True:
            # Fetch workflow runs page
            api_url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_id}/runs?page={page}&per_page=100"

            # Use requests directly to get Link header for pagination
            headers = {'Authorization': f'token {token}'}
            import requests as req_module

            # Measure API call duration
            start_time = time.time()
            resp = req_module.get(api_url, headers=headers)
            duration = time.time() - start_time

            if resp.status_code != 200:
                if PERFORMANCE_LOGGING:
                    try:
                        perf_logger = get_performance_logger()
                        perf_logger.info(
                            f"API_CALL - WORKFLOW_RUNS_API - URL: {api_url} - Duration: {duration:.3f}s "
                            f"- Status: {resp.status_code} - Page: {page} - Runs: 0"
                        )
                    except Exception:
                        pass
                print(f"[GHAminer Stream] Failed to fetch page {page}: {resp.status_code}")
                break

            response = resp.json()

            if not response or 'workflow_runs' not in response:
                if PERFORMANCE_LOGGING:
                    try:
                        perf_logger = get_performance_logger()
                        perf_logger.info(
                            f"API_CALL - WORKFLOW_RUNS_API - URL: {api_url} - Duration: {duration:.3f}s "
                            f"- Status: {resp.status_code} - Page: {page} - Runs: 0"
                        )
                    except Exception:
                        pass
                break

            workflow_runs = response.get('workflow_runs', [])
            runs_count = len(workflow_runs)
            if not workflow_runs:
                if PERFORMANCE_LOGGING:
                    try:
                        perf_logger = get_performance_logger()
                        perf_logger.info(
                            f"API_CALL - WORKFLOW_RUNS_API - URL: {api_url} - Duration: {duration:.3f}s "
                            f"- Status: {resp.status_code} - Page: {page} - Runs: 0"
                        )
                    except Exception:
                        pass
                break

            # Log successful call including how many runs were returned
            if PERFORMANCE_LOGGING:
                try:
                    perf_logger = get_performance_logger()
                    perf_logger.info(
                        f"API_CALL - WORKFLOW_RUNS_API - URL: {api_url} - Duration: {duration:.3f}s "
                        f"- Status: {resp.status_code} - Page: {page} - Runs: {runs_count}"
                    )
                except Exception:
                    pass
            
            # Check if we should skip this page (using data manager)
            if data_manager and skip_next_pages == 0:
                # Convert workflow_runs to dashboard format for date checking
                page_runs_for_check = []
                for run in workflow_runs:
                    run_data = {
                        'id_build': run['id'],
                        'workflow_id': workflow_id,
                        'created_at': run.get('created_at'),
                    }
                    page_runs_for_check.append(convert_ghaminer_run_to_dashboard(run_data, repo))
                
                should_skip, skip_count = data_manager.should_skip_page(workflow_id, page_runs_for_check)
                if should_skip:
                    print(f"[GHAminer Stream] Skipping page {page} of workflow {workflow_id} (dates already in cache, will skip {skip_count} more pages)")
                    # Still need to add existing runs to all_runs for Phase 2
                    for run in workflow_runs:
                        run_id = str(run['id'])
                        existing_run = data_manager.get_existing_run(run_id)
                        if existing_run:
                            all_runs.append(existing_run)
                    skip_next_pages = skip_count
                    last_skipped_page = page
                    # Skip to next page
                    page += 1
                    continue
            elif skip_next_pages > 0:
                # We're skipping pages - check if this page has any existing runs
                has_existing = False
                existing_count = 0
                if data_manager:
                    # Convert to check format
                    page_runs_for_check = []
                    for run in workflow_runs:
                        run_data = {
                            'id_build': run['id'],
                            'workflow_id': workflow_id,
                            'created_at': run.get('created_at'),
                        }
                        page_runs_for_check.append(convert_ghaminer_run_to_dashboard(run_data, repo))
                    
                    has_existing, existing_count = data_manager.check_page_has_existing_runs(workflow_id, page_runs_for_check)
                    
                    # Add existing runs to all_runs
                    for run in workflow_runs:
                        run_id = str(run['id'])
                        existing_run = data_manager.get_existing_run(run_id)
                        if existing_run:
                            all_runs.append(existing_run)
                
                # Backtracking logic: if we skipped pages and this page has NO existing runs,
                # we might have skipped too far - go back 1 page
                if not has_existing and last_skipped_page is not None and skip_next_pages > 0:
                    print(f"[GHAminer Stream] Backtracking: page {page} has no existing runs, going back to page {last_skipped_page}")
                    page = last_skipped_page
                    skip_next_pages = 0
                    last_skipped_page = None
                    continue
                
                if has_existing:
                    print(f"[GHAminer Stream] Skipping page {page} of workflow {workflow_id} (skip_next_pages={skip_next_pages}, {existing_count} existing runs)")
                else:
                    print(f"[GHAminer Stream] Skipping page {page} of workflow {workflow_id} (skip_next_pages={skip_next_pages}, no existing runs)")
                
                skip_next_pages -= 1
                if skip_next_pages == 0:
                    last_skipped_page = None
                else:
                    last_skipped_page = page
                page += 1
                continue
            
            print(f"[GHAminer Stream] Processing page {page} of workflow {workflow_id}: {len(workflow_runs)} runs")
            
            # Process each run (WITHOUT fetching job details)
            for run in workflow_runs:
                run_id = run['id']
                
                # Check if run already exists (skip if it does)
                if data_manager and data_manager.should_skip_run(run_id):
                    # Run exists, but we still need to add it to all_runs for Phase 2
                    # Try to get existing run from cache
                    existing_run = data_manager.get_existing_run(str(run_id))
                    if existing_run:
                        all_runs.append(existing_run)
                    continue
                
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
                total_runs = len(all_runs)  # Update total to include all runs
                new_runs_collected += 1
                
                # Save run to persistence (batch for efficiency)
                if persistence:
                    runs_to_save.append(dashboard_run)
                    # Save in batches of 50
                    if len(runs_to_save) >= 50:
                        try:
                            persistence.save_runs_batch(repo, runs_to_save)
                            # Update cache
                            for saved_run in runs_to_save:
                                data_manager.update_cache_after_save(run=saved_run)
                            runs_to_save.clear()
                        except Exception as e:
                            print(f"[GHAminer Stream] Warning: Failed to save runs batch: {e}")
                
                # Use actual_total if we have it, otherwise use total_runs as fallback
                display_total = actual_total if actual_total else max(total_runs, total_runs + 100 if len(workflow_runs) == 100 else total_runs)
                
                yield (dashboard_run, total_runs, display_total, all_runs, new_runs_collected, existing_runs_count)
            
            # Save remaining runs batch
            if persistence and runs_to_save:
                try:
                    persistence.save_runs_batch(repo, runs_to_save)
                    for saved_run in runs_to_save:
                        data_manager.update_cache_after_save(run=saved_run)
                    runs_to_save.clear()
                except Exception as e:
                    print(f"[GHAminer Stream] Warning: Failed to save final runs batch: {e}")
            
            # Update workflow date range for skip logic
            if data_manager and workflow_runs:
                dates = [r.get('created_at') for r in workflow_runs if r.get('created_at')]
                if dates:
                    earliest = min(dates)
                    latest = max(dates)
                    if persistence:
                        persistence.update_workflow_date_range(repo, str(workflow_id), earliest, latest)
            
            # Check for next page using Link header
            link_header = resp.headers.get('Link', '')
            has_next = 'rel="next"' in link_header or len(workflow_runs) == 100
            
            if has_next:
                page += 1
            else:
                break
    
    # Save any remaining runs
    if persistence and runs_to_save:
        try:
            persistence.save_runs_batch(repo, runs_to_save)
            for saved_run in runs_to_save:
                data_manager.update_cache_after_save(run=saved_run)
            runs_to_save.clear()
        except Exception as e:
            print(f"[GHAminer Stream] Warning: Failed to save final runs batch: {e}")
    
    phase1_duration = time.time() - phase1_start_time
    print(f"[GHAminer Stream] Phase 1 complete: {new_runs_collected} new runs collected, {total_runs} total runs (including {existing_runs_count} existing)")
    
    if PERFORMANCE_LOGGING:
        try:
            perf_logger = get_performance_logger()
            perf_logger.info(f"PHASE_END - PHASE_1_WORKFLOW_RUNS_COLLECTION - Total Duration: {phase1_duration:.3f}s - New Runs: {new_runs_collected} - Total Runs: {total_runs}")
        except:
            pass


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
    
    phase2_start_time = time.time()
    
    # Initialize data persistence and manager
    persistence = None
    data_manager = None
    if DATA_PERSISTENCE_AVAILABLE:
        try:
            persistence = DataPersistence()
            data_manager = DataManager(repo, persistence)
        except Exception as e:
            print(f"[GHAminer Stream] Warning: Failed to initialize data persistence: {e}")
    
    # Filter runs that need jobs collected
    if data_manager:
        runs_needing_jobs = data_manager.filter_runs_needing_jobs(all_runs)
        print(f"[GHAminer Stream] Phase 2: {len(runs_needing_jobs)} runs need job details (skipping {len(all_runs) - len(runs_needing_jobs)} that already have jobs)")
        all_runs = runs_needing_jobs
    
    total_runs = len(all_runs)
    print(f"[GHAminer Stream] Phase 2: Starting job details collection for {total_runs} runs")
    
    if PERFORMANCE_LOGGING:
        try:
            perf_logger = get_performance_logger()
            perf_logger.info(f"PHASE_START - PHASE_2_JOBS_COLLECTION - Repository: {repo} - Total Runs: {total_runs}")
        except:
            pass
    
    for idx, dashboard_run in enumerate(all_runs):
        # Dashboard dicts use 'id' field
        run_id = dashboard_run.get('id')
        
        if not run_id:
            continue
        
        # Check if jobs already collected (double-check)
        if data_manager and data_manager.should_skip_jobs_for_run(str(run_id)):
            # Jobs already exist, try to load them
            existing_jobs = persistence.get_jobs_for_run(repo, str(run_id)) if persistence else None
            if existing_jobs:
                dashboard_run['jobs'] = existing_jobs
                current_count = idx + 1
                yield (dashboard_run, current_count, total_runs)
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
            
            # Save jobs to persistence
            if persistence:
                try:
                    persistence.save_jobs_for_run(repo, str(run_id), jobs_list)
                    data_manager.update_cache_after_save(run_id=str(run_id), jobs=jobs_list)
                except Exception as e:
                    print(f"[GHAminer Stream] Warning: Failed to save jobs for run {run_id}: {e}")
            
            current_count = idx + 1
            
            yield (dashboard_run, current_count, total_runs)
            
        except Exception as e:
            print(f"[GHAminer Stream] Error fetching jobs for run {run_id}: {e}")
            # Keep the run without job details (jobs list should already be empty)
            if 'jobs' not in dashboard_run:
                dashboard_run['jobs'] = []
            yield (dashboard_run, idx + 1, total_runs)
    
    phase2_duration = time.time() - phase2_start_time
    print(f"[GHAminer Stream] Phase 2 complete: Job details collected for {total_runs} runs")
    
    if PERFORMANCE_LOGGING:
        try:
            perf_logger = get_performance_logger()
            perf_logger.info(f"PHASE_END - PHASE_2_JOBS_COLLECTION - Total Duration: {phase2_duration:.3f}s - Total Runs: {total_runs}")
        except:
            pass


def stream_ghaminer_data(repo: str, token: str, config: dict = None) -> Generator[Dict[str, Any], None, None]:
    """
    Main generator that orchestrates two-phase collection:
    Phase 1: Collect all workflow runs (without jobs)
    Phase 2: Collect job details for all runs
    """
    # Phase 1: Collect all workflow runs
    all_runs_list = []
    new_runs_count = 0
    existing_runs_count = 0
    for dashboard_run, current_count, estimated_total, all_runs, new_count, existing_count in stream_workflow_runs_phase1(repo, token, config):
        all_runs_list = all_runs  # Keep updating the list
        new_runs_count = new_count
        existing_runs_count = existing_count
        yield dashboard_run
    
    # Ensure we have runs for Phase 2 (even if Phase 1 collected 0 new runs)
    if not all_runs_list:
        # Try to load existing runs
        if DATA_PERSISTENCE_AVAILABLE:
            try:
                persistence = DataPersistence()
                all_existing_runs_dict = persistence.get_all_runs(repo)
                all_runs_list = list(all_existing_runs_dict.values())
                print(f"[GHAminer Stream] Loaded {len(all_runs_list)} existing runs for Phase 2")
            except Exception as e:
                print(f"[GHAminer Stream] Warning: Failed to load existing runs: {e}")
    
    # Phase 2: Collect job details (if enabled and we have runs)
    if config and config.get("fetch_job_details", True) and all_runs_list:
        for updated_run, current_count, total_runs in stream_job_details_phase2(repo, token, all_runs_list, config):
            yield updated_run

