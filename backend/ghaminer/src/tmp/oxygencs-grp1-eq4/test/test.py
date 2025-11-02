# test/test_main.py
"""Unit tests for the App class in main.py."""
import os
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime

import pytest
from src.main import App


class TestApp(unittest.TestCase):
    @patch("src.main.DatabaseManager")
    def setUp(self, MockDatabaseManager):
        """Set up the App instance with mocks for testing."""
        self.mock_db_manager = MockDatabaseManager()
        self.app = App()
        self.app.db_manager = self.mock_db_manager  # Replace with mock

    @patch("src.main.requests.post")
    def test_setup_sensor_hub_successful(self, mock_post):
        """Test that setup_sensor_hub establishes a connection successfully."""
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"result": "success"}
        self.app.setup_sensor_hub()
        mock_post.assert_called_once_with(
            f"{self.app.host}/SensorHub/negotiate?token={self.app.token}", timeout=10
        )
        self.assertIsNotNone(self.app._hub_connection)

    def test_take_action_turn_on_ac(self):
        """Test that take_action calls send_action_to_hvac with 'TurnOnAc'."""
        self.app.send_action_to_hvac = MagicMock()
        temperature = self.app.t_max + 5
        self.app.take_action(temperature)
        self.app.send_action_to_hvac.assert_called_once_with("TurnOnAc")
        self.mock_db_manager.save_event.assert_called_once()

    def test_take_action_turn_on_heater(self):
        """Test that take_action calls send_action_to_hvac with 'TurnOnHeater'."""
        self.app.send_action_to_hvac = MagicMock()
        temperature = self.app.t_min - 5
        self.app.take_action(temperature)
        self.app.send_action_to_hvac.assert_called_once_with("TurnOnHeater")
        self.mock_db_manager.save_event.assert_called_once()

    def test_take_action_stable(self):
        """Test that take_action does not call send_action_to_hvac if temperature is stable."""
        self.app.send_action_to_hvac = MagicMock()
        temperature = (self.app.t_min + self.app.t_max) / 2
        self.app.take_action(temperature)
        self.app.send_action_to_hvac.assert_not_called()
        self.mock_db_manager.save_event.assert_called_once()

    @patch("src.main.requests.get")
    def test_send_action_to_hvac(self, mock_get):
        """Test that send_action_to_hvac sends a request to the HVAC system."""
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"status": "OK"}
        self.app.send_action_to_hvac("TurnOnAc")
        mock_get.assert_called_once_with(
            f"{self.app.host}/api/hvac/{self.app.token}/TurnOnAc/{self.app.ticks}",
            timeout=10,
        )

    def test_save_event_to_database(self):
        """Test that save_event_to_database calls db_manager.save_event."""
        timestamp = datetime.now()
        temperature = 22.5
        self.app.save_event_to_database(timestamp, temperature)
        self.mock_db_manager.save_event.assert_called_once_with(
            timestamp, temperature, "sensor_data"
        )


if __name__ == "__main__":
    unittest.main()
