
import os
import random
import requests

from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

WARNING_DISTANCE_KM = 10.0

SPACE_OBJECTS = [
    "Space Debris",
    "Asteroid",
    "Unknown Object",
    "Rocket Fragment"
]


def check_space_proximity(satellites):

    alerts = []

    for satellite in satellites:

        # DEMO ONLY: Generate a simulated distance.
        distance = round(random.uniform(1, 20), 2)

        if distance <= WARNING_DISTANCE_KM:

            alerts.append({

                "satellite": satellite,

                "object": random.choice(SPACE_OBJECTS),

                "distance_km": distance,

                "status": "WARNING",

                "timestamp": datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),

                "simulation": True

            })

    return alerts


def send_telegram_alert(alert):

    bot_token = os.getenv("ORBITVIEW_BOT_TOKEN")

    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:

        print("OrbitView Telegram credentials are missing.")

        return False

    message = (

        "🚨 ORBITVIEW SPACE PROXIMITY ALERT 🚨\n\n"

        f"Satellite: {alert['satellite']}\n"

        f"Nearby Object: {alert['object']}\n"

        f"Distance: {alert['distance_km']} km\n"

        f"Status: {alert['status']}\n"

        f"Time: {alert['timestamp']}\n\n"

        "⚠️ SIMULATION ONLY\n"

        "This is randomly generated demo data, "
        "NOT a real collision prediction."

    )

    url = (
        f"https://api.telegram.org/bot{bot_token}/sendMessage"
    )

    try:

        response = requests.post(

            url,

            data={

                "chat_id": chat_id,

                "text": message

            },

            timeout=10

        )

        response.raise_for_status()

        return response.json().get("ok", False)

    except requests.RequestException as error:

        print("Telegram alert failed:", error)

        return False
