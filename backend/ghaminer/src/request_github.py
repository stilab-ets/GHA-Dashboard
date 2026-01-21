import requests
from datetime import datetime, timezone, timedelta
import csv
import os
import time
import math
import logging
import base64
import re
import numpy as np
import sys

# Try to import performance logger
try:
    # Add backend root to path
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from core.utils.logger import get_performance_logger
    PERFORMANCE_LOGGING = True
except ImportError:
    PERFORMANCE_LOGGING = False

def get_request(url, token):
    headers = {'Authorization': f'token {token}'}
    attempt = 0
    max_attempts = 5  # Number of attempts before applying infinite retry on connection errors

    while True:
        try:
            # Start timing for API call
            start_time = time.time()
            response = requests.get(url, headers=headers, timeout=10)  # Set a timeout to avoid hanging requests
            duration = time.time() - start_time
            
            # Check rate limit headers proactively
            remaining_requests = int(response.headers.get('X-RateLimit-Remaining', 1))  # Default to 1 if missing
            reset_time = response.headers.get('X-RateLimit-Reset')

            if remaining_requests == 0 and reset_time:
                sleep_time = max(0, (datetime.fromtimestamp(int(reset_time), timezone.utc) - datetime.now(timezone.utc)).total_seconds() + 10)
                logging.warning(f"Rate limit hit! Sleeping for {sleep_time} seconds.")
                time.sleep(sleep_time)
                continue  # Retry after sleeping

            if response.status_code == 200:
                # Log API call duration
                if PERFORMANCE_LOGGING:
                    try:
                        perf_logger = get_performance_logger()
                        # Extract API endpoint type from URL
                        if '/actions/runs' in url and '/jobs' in url:
                            api_type = "JOBS_API"
                        elif '/actions/runs' in url:
                            api_type = "WORKFLOW_RUNS_API"
                        elif '/actions/workflows' in url:
                            api_type = "WORKFLOW_RUNS_API"
                        else:
                            api_type = "OTHER_API"
                        perf_logger.info(f"API_CALL - {api_type} - URL: {url} - Duration: {duration:.3f}s - Status: {response.status_code}")
                    except:
                        pass  # Don't break if logging fails
                return response.json()
            elif response.status_code == 403 and reset_time:
                sleep_time = max(0, (datetime.fromtimestamp(int(reset_time), timezone.utc) - datetime.now(timezone.utc)).total_seconds() + 10)
                logging.error(f"Rate limit exceeded, sleeping for {sleep_time} seconds. URL: {url}")
                time.sleep(sleep_time)
                continue  # Retry after sleeping
            elif response.status_code in [500, 502, 503, 504]:
                # Retry on server errors
                wait_time = min(2 ** attempt, 60)  # Exponential backoff up to 60 seconds
                logging.warning(f"GitHub server error {response.status_code}. Retrying in {wait_time} seconds.")
                time.sleep(wait_time)
                attempt += 1
            else:
                return None  # Return None for non-retryable failures

        except requests.exceptions.ConnectionError:
            wait_time = min(2 ** attempt, 60)  # Exponential backoff up to 60 seconds
            logging.error(f"Network error: Connection lost. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            attempt += 1

        except requests.exceptions.Timeout:
            wait_time = min(2 ** attempt, 60)  # Exponential backoff up to 60 seconds
            logging.error(f"Request timed out. Retrying in {wait_time} seconds...")
            time.sleep(wait_time)
            attempt += 1

        except requests.exceptions.RequestException as e:
            logging.error(f"Unexpected error fetching {url}: {e}")
            return None  # Return None on unknown request errors

        # If exceeded max_attempts, switch to infinite retry for connection issues
        if attempt >= max_attempts:
            logging.error("Max attempts reached. Entering infinite retry mode for connection errors.")
            attempt = max_attempts - 1  # Prevent integer overflow
