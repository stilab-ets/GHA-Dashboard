# test/test_database.py
"""Unit tests for the DatabaseManager class."""
from datetime import datetime
from src.database_manager import DatabaseManager


def test_database_connection():
    """Test if database connection is established."""
    db_manager = DatabaseManager()
    assert db_manager.conn is not None  # Vérifie que la connexion est établie


def test_save_event():
    """Test saving an event to the database."""
    db_manager = DatabaseManager()
    timestamp = datetime.now()
    temperature = 23.5
    event_type = "test_event"
    db_manager.save_event(timestamp, temperature, event_type)
    # Add assertions as needed for validation
    db_manager.close_connection()
