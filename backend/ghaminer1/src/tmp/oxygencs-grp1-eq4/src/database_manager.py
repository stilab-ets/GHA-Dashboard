# src/database_manager.py
"""Module for managing database operations."""

import os
import time
import psycopg2
from dotenv import load_dotenv


class DatabaseManager:
    """Class for managing HVAC data storage in a PostgreSQL database."""

    def __init__(self, max_retries=5, retry_delay=5):
        """Initialize database connection with retry logic."""
        load_dotenv()
        self.database_url = os.getenv("DATABASE_URL")
        self.conn = None
        self.cursor = None
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.connect_to_database()

    def connect_to_database(self):
        """Attempt to connect to the database with retries."""
        for attempt in range(self.max_retries):
            try:
                self.conn = psycopg2.connect(self.database_url)
                self.cursor = self.conn.cursor()
                print("Connexion à la base de données établie.")
                break
            except psycopg2.OperationalError as e:
                print(f"Database connection failed: {e}")
                if attempt < self.max_retries - 1:
                    print(f"Retrying in {self.retry_delay} seconds...")
                    time.sleep(self.retry_delay)
                else:
                    print("Max retries reached. Could not connect to the database.")
                    raise

    def save_event(self, timestamp, temperature, event_type):
        """Save an event into the database."""
        try:
            insert_query = """
            INSERT INTO hvac_data (temperature, received_at, event_type)
            VALUES (%s, %s, %s)
            """
            self.cursor.execute(insert_query, (temperature, timestamp, event_type))
            self.conn.commit()
            print("Données sauvegardées dans la base de données.")
        except Exception as e:
            print(f"Erreur lors de l'insertion des données : {e}")

    def close_connection(self):
        """Close database connection."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("Connexion à la base de données fermée.")

    def retrieve_event(self, timestamp):
        """Retrieve an event from the database based on the timestamp."""
        try:
            query = """
            SELECT temperature, event_type
            FROM hvac_data
            WHERE received_at = %s
            """
            self.cursor.execute(query, (timestamp,))
            result = self.cursor.fetchone()
            if result:
                return {"temperature": result[0], "event_type": result[1]}
            return None
        except Exception as e:
            print(f"Erreur lors de la récupération des données : {e}")
            return None

    def update_event(self, timestamp, temperature, event_type):
        """Update an event in the database based on the timestamp."""
        try:
            update_query = """
            UPDATE hvac_data
            SET temperature = %s, event_type = %s
            WHERE received_at = %s
            """
            self.cursor.execute(update_query, (temperature, event_type, timestamp))
            self.conn.commit()
            print("Données mises à jour dans la base de données.")
        except Exception as e:
            print(f"Erreur lors de la mise à jour des données : {e}")

    def delete_event(self, timestamp):
        """Delete an event from the database based on the timestamp."""
        delete_query = "DELETE FROM hvac_data WHERE timestamp = %s"
        try:
            self.cursor.execute(delete_query, (timestamp,))
            self.conn.commit()
            print(f"Event with timestamp {timestamp} deleted.")
        except Exception as e:
            print(f"Error deleting event: {e}")
