"""
Logging utility for GHA-Dashboard performance monitoring.
Logs API call durations and collection phase timings to a file.
"""
import logging
import os
from datetime import datetime
from pathlib import Path


def setup_performance_logger(repo_name: str = None) -> logging.Logger:
    """
    Set up a logger that writes to a file with repo name and timestamp.
    
    Args:
        repo_name: Repository name (e.g., 'AUTOMATIC1111/stable-diffusion-webui')
    
    Returns:
        Configured logger instance
    """
    # Create logs directory if it doesn't exist
    logs_dir = Path(__file__).parent.parent.parent / "logs"
    logs_dir.mkdir(exist_ok=True)
    
    # Create log filename with repo name and timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if repo_name:
        # Sanitize repo name for filename
        safe_repo_name = repo_name.replace("/", "_").replace("\\", "_")
        log_filename = logs_dir / f"performance_{safe_repo_name}_{timestamp}.log"
    else:
        log_filename = logs_dir / f"performance_{timestamp}.log"
    
    # Create logger
    logger = logging.getLogger("gha_performance")
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicates
    logger.handlers = []
    
    # File handler
    file_handler = logging.FileHandler(log_filename, mode='w', encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    
    # Console handler (optional, for debugging)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    logger.info("=" * 80)
    logger.info(f"Performance logging started for repository: {repo_name or 'Unknown'}")
    logger.info(f"Log file: {log_filename}")
    logger.info("=" * 80)
    
    return logger


def get_performance_logger() -> logging.Logger:
    """
    Get the existing performance logger, or create a default one if it doesn't exist.
    """
    logger = logging.getLogger("gha_performance")
    if not logger.handlers:
        # If no handlers, create a default logger
        # Use a default repo name if none provided
        return setup_performance_logger("unknown_repo")
    return logger

