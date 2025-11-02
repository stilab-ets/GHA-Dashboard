import os
import pytest
import requests
from src.database_manager import DatabaseManager
from datetime import datetime

@pytest.fixture(scope="module")
def app_instance():
    from src.main import App 
    os.environ["HOST"] = "http://159.203.50.162/"  
    os.environ["TOKEN"] = "6a5c1ec66dfea25f6ce1"  
    app_instance = App()
    return app_instance

@pytest.fixture(scope="function")
def db():
    # Setup a real database connection (preferably a testing database)
    db_manager = DatabaseManager()
    try:
        yield db_manager
    finally:
        # Ensure the connection is closed properly after the test
        db_manager.close_connection()

def unique_timestamp():
    """Generate a unique timestamp for testing."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def test_main_route(app_instance):
    """Verify that host and token are set in the app instance."""
    assert app_instance.host is not None
    assert app_instance.token is not None
    print("\ntest_main_route passed: Host and token are set in app instance.")

def test_database_connection(db):
    """Test connection to the real database."""
    assert db.conn is not None
    print("\ntest_database_connection passed: Database connection is established.")

def test_database_insert_and_retrieve(db):
    """Test insertion and retrieval of data from the real database."""
    test_data = {
        "timestamp": unique_timestamp(),
        "temperature": 25.0,
        "event_type": "sensor_data",
    }
    db.save_event(test_data['timestamp'], test_data['temperature'], test_data['event_type'])
    
    # Retrieve the event
    result = db.retrieve_event(test_data['timestamp'])
    assert result is not None
    assert result["temperature"] == test_data["temperature"]
    assert result["event_type"] == test_data["event_type"]
    print("\ntest_database_insert_and_retrieve passed: Data inserted and retrieved successfully.")

def test_database_update(db):
    """Test updating data in the real database."""
    initial_data = {
        "timestamp": unique_timestamp(),
        "temperature": 22.5,
        "event_type": "sensor_data",
    }
    db.save_event(initial_data['timestamp'], initial_data['temperature'], initial_data['event_type'])
    
    # Update the event
    updated_data = {
        "timestamp": initial_data['timestamp'],
        "temperature": 25.0,
        "event_type": "updated_event",
    }
    db.update_event(updated_data['timestamp'], updated_data['temperature'], updated_data['event_type'])
    result = db.retrieve_event(updated_data['timestamp'])
    assert result is not None
    assert result["temperature"] == updated_data["temperature"]
    assert result["event_type"] == updated_data["event_type"]
    print("\ntest_database_update passed: Data updated successfully.")

def test_database_delete(db):
    """Test deletion of data from the real database."""
    test_data = {
        "timestamp": unique_timestamp(),
        "temperature": 22.5,
        "event_type": "sensor_data",
    }
    db.save_event(test_data['timestamp'], test_data['temperature'], test_data['event_type'])
    
    # Delete the event
    db.delete_event(test_data['timestamp'])
    result = db.retrieve_event(test_data['timestamp'])
    assert result is None
    print("\ntest_database_delete passed: Data deletion verified.")
