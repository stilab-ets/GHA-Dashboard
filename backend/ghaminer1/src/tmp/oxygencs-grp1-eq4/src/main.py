# src/main.py
"""Main module for OxygenCS application."""
import os
import logging
from pathlib import Path
import time
from dotenv import load_dotenv

from signalrcore.hub_connection_builder import HubConnectionBuilder
import requests

from database_manager import DatabaseManager


class App:
    """Class for managing HVAC control and monitoring."""

    def __init__(self):

        # docker_env_path = Path("/usr/src/app/config.env")
        local_env_path = Path("config.env")
        # dotenv_path = docker_env_path if docker_env_path.exists() else local_env_path

        load_dotenv(local_env_path)
        self._hub_connection = None
        self.ticks = 10
        self.db_manager = DatabaseManager()
        self.host = os.getenv("HOST", "default_host_value")
        self.token = os.getenv("TOKEN", "default_token_value")
        self.t_max = int(os.getenv("T_MAX", "50"))
        self.t_min = int(os.getenv("T_MIN", "18"))

    def __del__(self):
        """Cleanup connections on deletion."""
        if self._hub_connection is not None:
            self._hub_connection.stop()
        self.db_manager.close_connection()

    def start(self):
        """Start Oxygen CS."""
        self.setup_sensor_hub()
        self._hub_connection.start()
        print("Press CTRL+C to exit.")
        while True:
            time.sleep(2)

    def setup_sensor_hub(self):
        """Configure hub connection and subscribe to sensor data events."""
        try:
            response = requests.post(
                f"{self.host}/SensorHub/negotiate?token={self.token}", timeout=10
            )
            response.raise_for_status()
            print("Connexion établie:", response.json())
        except requests.exceptions.RequestException as e:
            print("Erreur de connexion:", e)
            return

        self._hub_connection = (
            HubConnectionBuilder()
            .with_url(f"{self.host}/SensorHub?token={self.token}")
            .configure_logging(logging.INFO)
            .with_automatic_reconnect(
                {
                    "type": "raw",
                    "keep_alive_interval": 10,
                    "reconnect_interval": 5,
                    "max_attempts": 999,
                }
            )
            .build()
        )
        self._hub_connection.on("ReceiveSensorData", self.on_sensor_data_received)
        self._hub_connection.on_open(print("||| Connection closed."))
        self._hub_connection.on_close(lambda: print("||| Connection closed."))

        self._hub_connection.on_error(
            lambda data: print(f"||| An exception was thrown: {data.error}")
        )

    def on_sensor_data_received(self, data):
        """Callback method to handle sensor data on reception."""
        try:
            print(data[0]["date"] + " --> " + data[0]["data"], flush=True)
            timestamp = data[0]["date"]
            temperature = float(data[0]["data"])

            # Déterminez le type d'événement en fonction de la température
            if temperature >= self.t_max:
                self.send_action_to_hvac("TurnOnAc")
                event_type = "activation_climatisation"
            elif temperature <= self.t_min:
                self.send_action_to_hvac("TurnOnHeater")
                event_type = "activation_chauffage"
            else:
                event_type = "stable"

            # Sauvegarder l'événement dans la base de données
            self.db_manager.save_event(timestamp, temperature, event_type)

        except requests.RequestException as e:
            print(f"Erreur lors de la requête : {e}")

    def take_action(self, temperature):
        """Take action to HVAC depending on current temperature."""
        if temperature >= self.t_max:
            self.send_action_to_hvac("TurnOnAc")
        elif temperature <= self.t_min:
            self.send_action_to_hvac("TurnOnHeater")

    def send_action_to_hvac(self, action):
        """Send action query to the HVAC service."""
        response = requests.get(
            f"{self.host}/api/hvac/{self.token}/{action}/{self.ticks}", timeout=10
        )
        details = response.json()
        print(details, flush=True)

    def save_event_to_database(self, timestamp, temperature):
        """Save sensor data into the database using the DatabaseManager."""
        event_type = "sensor_data"
        self.db_manager.save_event(timestamp, temperature, event_type)


app = App()

if __name__ == "__main__":
    app.start()
