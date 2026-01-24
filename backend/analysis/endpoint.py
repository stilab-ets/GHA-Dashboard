"""
WebSocket endpoint for streaming GitHub Actions data using GHAminer
"""
import json
import os
import sys
from datetime import date, datetime, time as dt_time
from typing import Any
from dataclasses import dataclass

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Try to use gevent for background tasks (if available)
try:
    from gevent import spawn, sleep as gevent_sleep
    GEVENT_AVAILABLE = True
except ImportError:
    import threading
    GEVENT_AVAILABLE = False

# Import time for sleep (needed for non-gevent case)
import time

# Add backend to path for logger
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import GHAminer streaming wrapper
from ghaminer_stream import stream_workflow_runs_phase1, stream_job_details_phase2, load_config
import time

# Try to import performance logger
try:
    from core.utils.logger import setup_performance_logger
    PERFORMANCE_LOGGING = True
except ImportError:
    PERFORMANCE_LOGGING = False


@dataclass
class AggregationFilters:
    aggregationPeriod: str = "day"
    startDate: date = date(2000, 1, 1)
    endDate: date = date(2100, 1, 1)
    author: str | None = None
    branch: str | None = None
    workflowName: str | None = None


def json_default(o: Any):
    """JSON serializer for datetime objects"""
    if isinstance(o, datetime):
        return o.isoformat()
    elif isinstance(o, date):
        return o.isoformat()
    else:
        return str(o)


def _send_keepalive_periodic(ws: Any, stop_flag: list):
    """
    Background task that sends keepalive messages every 30 seconds
    to prevent WebSocket timeout during rate limit waits.
    Uses gevent if available, otherwise falls back to threading.
    """
    while not stop_flag[0]:
        # Wait 30 seconds
        if GEVENT_AVAILABLE:
            gevent_sleep(30)
        else:
            time.sleep(30)
        
        # Check if we should stop
        if stop_flag[0]:
            break
        
        # Send keepalive message
        try:
            keepalive_msg = {
                "type": "keepalive",
                "message": "Connection alive - waiting for API rate limit..."
            }
            ws.send(json.dumps(keepalive_msg, default=json_default))
        except Exception:
            # Connection might be closed, stop
            break


def send_data(ws: Any, repo: str, filters: AggregationFilters, token: str = None):
    """
    Stream workflow runs and jobs from GHAminer via WebSocket
    """
    print(f"[WebSocket] ========================================")
    print(f"[WebSocket] Starting GHAminer collection for {repo}")
    print(f"[WebSocket] ========================================")
    
    # Set up performance logger with repo name
    if PERFORMANCE_LOGGING:
        try:
            setup_performance_logger(repo)
        except Exception as e:
            print(f"[WebSocket] Warning: Could not set up performance logger: {e}")
    
    if not token:
        token = os.getenv("GITHUB_TOKEN")
    
    if not token:
        error_msg = {
            "type": "error",
            "message": "GitHub token required. Please configure it in the Chrome extension popup."
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        return
    
    # Start background keepalive task to prevent timeout during rate limit waits
    # Use a list for mutable flag (works with both gevent and threading)
    keepalive_stop = [False]
    if GEVENT_AVAILABLE:
        keepalive_task = spawn(_send_keepalive_periodic, ws, keepalive_stop)
        print(f"[WebSocket] Started periodic keepalive task (every 30s) using gevent to prevent timeout during rate limit waits")
    else:
        keepalive_thread = threading.Thread(
            target=_send_keepalive_periodic,
            args=(ws, keepalive_stop),
            daemon=True
        )
        keepalive_thread.start()
        print(f"[WebSocket] Started periodic keepalive thread (every 30s) to prevent timeout during rate limit waits")
    
    try:
        # Load GHAminer config
        config = load_config()
        print(f"[WebSocket] GHAminer config loaded: fetch_job_details={config.get('fetch_job_details', True)}")
        
        all_runs_list = []
        new_runs_count = 0
        existing_runs_count = 0
        
        # Check if we have existing data and send it immediately if no new collection needed
        # This allows the frontend to show data right away
        try:
            from data.persistence import DataPersistence
            persistence = DataPersistence()
            existing_runs_dict = persistence.get_all_runs(repo)
            if existing_runs_dict:
                existing_runs_list = list(existing_runs_dict.values())
                existing_runs_count = len(existing_runs_list)
                print(f"[WebSocket] Found {existing_runs_count} existing runs in cache")
        except Exception as e:
            print(f"[WebSocket] Could not check existing data: {e}")
        
        # ========================================
        # PHASE 1: Collect all workflow runs (without jobs)
        # ========================================
        print(f"[WebSocket] Starting Phase 1: Workflow runs collection")
        phase1_start_time = time.time()
        phase1_batch_size = 100  # GitHub API returns 100 per page
        total_runs = 0
        batch = []
        last_keepalive = 0
        estimated_total = 0
        
        for dashboard_run, current_count, estimated, all_runs, new_count, existing_count in stream_workflow_runs_phase1(repo, token, config):
            all_runs_list = all_runs  # Keep updating
            total_runs = current_count
            estimated_total = estimated
            new_runs_count = new_count
            existing_runs_count = existing_count
            batch.append(dashboard_run)
            
            # Calculate elapsed time and ETA for Phase 1
            elapsed_time = time.time() - phase1_start_time
            runs_per_second = total_runs / elapsed_time if elapsed_time > 0 else 0
            eta_seconds = (estimated_total - total_runs) / runs_per_second if runs_per_second > 0 and estimated_total > total_runs else None
            
            # Send batch to frontend (batch size 100 for Phase 1)
            if len(batch) >= phase1_batch_size:
                msg = {
                    "type": "runs",
                    "data": batch,
                    "page": (total_runs // phase1_batch_size) + 1,
                    "hasMore": True,
                    "phase": "workflow_runs",
                    "totalRuns": estimated_total,
                    "newRuns": new_runs_count,
                    "existingRuns": existing_runs_count,
                    "elapsed_time": elapsed_time,
                    "eta_seconds": eta_seconds
                }
                ws.send(json.dumps(msg, default=json_default))
                print(f"[WebSocket] Sent batch: {len(batch)} runs (total: {total_runs}/{estimated_total} runs, new: {new_runs_count}, existing: {existing_runs_count})")
                batch.clear()
                last_keepalive = total_runs
            
            # Send keepalive every 100 runs to prevent timeout
            if total_runs - last_keepalive >= 100:
                keepalive_msg = {
                    "type": "log",
                    "message": f"Phase 1: Still collecting... {total_runs} runs processed so far"
                }
                try:
                    ws.send(json.dumps(keepalive_msg, default=json_default))
                    last_keepalive = total_runs
                except:
                    pass
        
        # Send remaining Phase 1 batch
        if batch:
            elapsed_time = time.time() - phase1_start_time
            msg = {
                "type": "runs",
                "data": batch,
                "page": (total_runs // phase1_batch_size) + 1,
                "hasMore": False,
                "phase": "workflow_runs",
                "totalRuns": total_runs,
                "newRuns": new_runs_count,
                "existingRuns": existing_runs_count,
                "elapsed_time": elapsed_time,
                "eta_seconds": None
            }
            ws.send(json.dumps(msg, default=json_default))
            print(f"[WebSocket] Sent final Phase 1 batch: {len(batch)} runs")
        
        # Send Phase 1 completion message
        phase1_elapsed = time.time() - phase1_start_time
        phase1_complete_msg = {
            "type": "phase_complete",
            "phase": "workflow_runs",
            "totalRuns": total_runs,
            "newRuns": new_runs_count,
            "existingRuns": existing_runs_count,
            "elapsed_time": phase1_elapsed
        }
        ws.send(json.dumps(phase1_complete_msg, default=json_default))
        print(f"[WebSocket] Phase 1 complete: {total_runs} total runs ({new_runs_count} new, {existing_runs_count} existing) in {phase1_elapsed:.2f} seconds")
        
        # ========================================
        # PHASE 2: Collect job details (if enabled)
        # Always run Phase 2 if we have runs (even if Phase 1 collected 0 new runs)
        # ========================================
        if config.get("fetch_job_details", True):
            # Ensure we have runs for Phase 2
            if not all_runs_list:
                # Try to load existing runs from persistence
                try:
                    from data.persistence import DataPersistence
                    persistence = DataPersistence()
                    all_existing_runs_dict = persistence.get_all_runs(repo)
                    all_runs_list = list(all_existing_runs_dict.values())
                    print(f"[WebSocket] Loaded {len(all_runs_list)} existing runs for Phase 2")
                except Exception as e:
                    print(f"[WebSocket] Warning: Failed to load existing runs for Phase 2: {e}")
            
            if all_runs_list:
                print(f"[WebSocket] Starting Phase 2: Job details collection")
                phase2_start_time = time.time()
                phase2_batch_size = 50  # Smaller batches for job details
                batch = []
                jobs_collected = 0
                last_keepalive = 0
                
                for updated_run, current_count, total_runs_count in stream_job_details_phase2(repo, token, all_runs_list, config):
                    # Count jobs
                    if updated_run.get('jobs'):
                        jobs_collected += len(updated_run['jobs'])
                    
                    batch.append(updated_run)
                    
                    # Calculate elapsed time and ETA for Phase 2
                    elapsed_time = time.time() - phase2_start_time
                    runs_per_second = current_count / elapsed_time if elapsed_time > 0 else 0
                    eta_seconds = (total_runs_count - current_count) / runs_per_second if runs_per_second > 0 and total_runs_count > current_count else None
                    
                    # Send batch to frontend (batch size 50 for Phase 2)
                    if len(batch) >= phase2_batch_size:
                        msg = {
                            "type": "runs",
                            "data": batch,
                            "page": (current_count // phase2_batch_size) + 1,
                            "hasMore": True,
                            "phase": "jobs",
                            "totalRuns": total_runs_count,
                            "elapsed_time": elapsed_time,
                            "eta_seconds": eta_seconds
                        }
                        ws.send(json.dumps(msg, default=json_default))
                        print(f"[WebSocket] Sent batch: {len(batch)} runs (total: {current_count}/{total_runs_count} runs, {jobs_collected} jobs)")
                        batch.clear()
                        last_keepalive = current_count
                    
                    # Send job progress update (with timing info)
                    if current_count % 10 == 0 or current_count == total_runs_count:
                        job_progress_msg = {
                            "type": "job_progress",
                            "runs_processed": current_count,
                            "total_runs": total_runs_count,
                            "jobs_collected": jobs_collected,
                            "elapsed_time": elapsed_time,
                            "eta_seconds": eta_seconds
                        }
                        try:
                            ws.send(json.dumps(job_progress_msg, default=json_default))
                        except:
                            pass
                    
                    # Send keepalive every 50 runs to prevent timeout
                    if current_count - last_keepalive >= 50:
                        keepalive_msg = {
                            "type": "log",
                            "message": f"Phase 2: Still collecting job details... {current_count}/{total_runs_count} runs processed"
                        }
                        try:
                            ws.send(json.dumps(keepalive_msg, default=json_default))
                            last_keepalive = current_count
                        except:
                            pass
                
                # Send remaining Phase 2 batch
                if batch:
                    elapsed_time = time.time() - phase2_start_time
                    msg = {
                        "type": "runs",
                        "data": batch,
                        "page": (len(all_runs_list) // phase2_batch_size) + 1,
                        "hasMore": False,
                        "phase": "jobs",
                        "totalRuns": len(all_runs_list),
                        "elapsed_time": elapsed_time,
                        "eta_seconds": None
                    }
                    ws.send(json.dumps(msg, default=json_default))
                    print(f"[WebSocket] Sent final Phase 2 batch: {len(batch)} runs")
                
                phase2_elapsed = time.time() - phase2_start_time
                total_jobs = jobs_collected
                
                # If no runs were processed in Phase 2 but we have existing runs, send them now
                # This ensures the frontend has the data even when all jobs already exist
                if len(all_runs_list) > 0 and jobs_collected == 0 and new_runs_count == 0:
                    print(f"[WebSocket] Sending {len(all_runs_list)} existing runs to frontend (no new data collected)")
                    # Send all existing runs in batches
                    batch_size = 100
                    for i in range(0, len(all_runs_list), batch_size):
                        batch = all_runs_list[i:i + batch_size]
                        msg = {
                            "type": "runs",
                            "data": batch,
                            "page": (i // batch_size) + 1,
                            "hasMore": i + batch_size < len(all_runs_list),
                            "phase": "jobs",
                            "totalRuns": len(all_runs_list),
                            "elapsed_time": phase2_elapsed,
                            "eta_seconds": None
                        }
                        ws.send(json.dumps(msg, default=json_default))
            else:
                phase2_elapsed = 0
                total_jobs = 0
        else:
            phase2_elapsed = 0
            total_jobs = 0
        
        # Send final completion message
        complete_msg = {
            "type": "complete",
            "phase": "jobs" if config.get('fetch_job_details', True) else "workflow_runs",
            "totalRuns": total_runs,
            "newRuns": new_runs_count,
            "existingRuns": existing_runs_count,
            "totalJobs": total_jobs,
            "elapsed_time": phase1_elapsed + phase2_elapsed
        }
        ws.send(json.dumps(complete_msg, default=json_default))
        
        print(f"[WebSocket] ========================================")
        print(f"[WebSocket] Collection complete!")
        print(f"[WebSocket] Total runs: {total_runs} ({new_runs_count} new, {existing_runs_count} existing)")
        print(f"[WebSocket] Total jobs: {total_jobs}")
        print(f"[WebSocket] Phase 1 time: {phase1_elapsed:.2f} seconds")
        print(f"[WebSocket] Phase 2 time: {phase2_elapsed:.2f} seconds")
        print(f"[WebSocket] Total time: {phase1_elapsed + phase2_elapsed:.2f} seconds")
        print(f"[WebSocket] ========================================")
        
    except Exception as e:
        print(f"[WebSocket] ERROR: {e}")
        import traceback
        traceback.print_exc()
        try:
            error_msg = {"type": "error", "message": str(e)}
            ws.send(json.dumps(error_msg, default=json_default))
        except:
            print("[WebSocket] Failed to send error message")
    
    finally:
        # Stop the keepalive task/thread
        keepalive_stop[0] = True
        if not GEVENT_AVAILABLE and 'keepalive_thread' in locals():
            if keepalive_thread.is_alive():
                keepalive_thread.join(timeout=1.0)
        print(f"[WebSocket] Closing connection")
        ws.close()
