from flask import Flask, render_template, jsonify, request
import os
import requests
import traceback
import time
import math
import sqlite3

from datetime import datetime, timezone, timedelta
from skyfield.api import EarthSatellite, load, wgs84

from space_alerts import (
    check_space_proximity,
    send_telegram_alert,
    send_bug_report_telegram
)

# ==================================================
# FLASK CONFIGURATION
# ==================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

frontend_path = os.path.abspath(
    os.path.join(BASE_DIR, "../frontend")
)

app = Flask(
    __name__,
    template_folder=frontend_path,
    static_folder=frontend_path,
    static_url_path="/static"
)

# ==================================================
# BUG & ERROR CENTER DATABASE
# ==================================================

DATABASE_PATH = os.path.join(
    BASE_DIR,
    "bug_error_center.db"
)


def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def current_timestamp():
    return datetime.now(timezone.utc).isoformat()


def initialize_database():

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS error_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            error_type TEXT NOT NULL,
            message TEXT NOT NULL,
            source TEXT,
            endpoint TEXT,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            feature TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("PRAGMA table_info(error_logs)")
    existing_columns = {
        row[1] for row in cursor.fetchall()
    }

    if "source" not in existing_columns:
        cursor.execute(
            "ALTER TABLE error_logs ADD COLUMN source TEXT"
        )

    if "endpoint" not in existing_columns:
        cursor.execute(
            "ALTER TABLE error_logs ADD COLUMN endpoint TEXT"
        )

    cursor.execute("PRAGMA table_info(bug_reports)")
    bug_columns = {
        row[1] for row in cursor.fetchall()
    }

    if "title" not in bug_columns:
        cursor.execute(
            "ALTER TABLE bug_reports ADD COLUMN title TEXT"
        )

    if "description" not in bug_columns:
        cursor.execute(
            "ALTER TABLE bug_reports ADD COLUMN description TEXT"
        )

    if "feature" not in bug_columns:
        cursor.execute(
            "ALTER TABLE bug_reports ADD COLUMN feature TEXT"
        )

    if "status" not in bug_columns:
        cursor.execute(
            "ALTER TABLE bug_reports ADD COLUMN status TEXT DEFAULT 'Open'"
        )

    if "created_at" not in bug_columns:
        cursor.execute(
            "ALTER TABLE bug_reports ADD COLUMN created_at TEXT"
        )

    connection.commit()
    connection.close()


def save_error_log(
    error_type,
    message,
    source="Backend",
    endpoint=None
):

    try:

        connection = get_db_connection()

        connection.execute(
            """
            INSERT INTO error_logs (
                error_type,
                message,
                source,
                endpoint,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(error_type)[:100],
                str(message)[:2000],
                str(source)[:100],
                str(endpoint or "")[:300],
                current_timestamp()
            )
        )

        connection.commit()
        connection.close()

    except Exception:
        app.logger.exception(
            "Unable to save error log."
        )


initialize_database()

# ==================================================
# SATELLITE CONFIGURATION
# ==================================================

SATELLITES = {
    "25544": "ISS",
    "33591": "NOAA-19",
    "20580": "Hubble"
}

ORBIT_COLORS = {
    "25544": "#36D9FF",
    "33591": "#35D99A",
    "20580": "#FFCB70"
}

CELESTRAK_URL = (
    "https://celestrak.org/NORAD/elements/gp.php"
)

ALTERNATE_TLE_URL = (
    "https://tle.ivanstanojevic.me/api/tle/{}"
)

TLE_HEADERS = {
    "User-Agent": "OrbitView/1.0"
}

ts = load.timescale()

GROUND_STATION = wgs84.latlon(
    latitude_degrees=12.9716,
    longitude_degrees=77.5946,
    elevation_m=920
)

GROUND_STATION_NAME = "Bengaluru, India"

MINIMUM_ELEVATION = 10

IST = timezone(
    timedelta(hours=5, minutes=30)
)

SPEED_OF_LIGHT_KM_S = 299792.458

COMMUNICATION_FREQUENCY_GHZ = 2.0

# ==================================================
# SPACE ALERT CONFIGURATION
# ==================================================

SPACE_ALERT_COOLDOWN = 300

LAST_SPACE_ALERT = {}

# ==================================================
# TLE CACHE
# ==================================================

TLE_CACHE = {
    "fetched_at": 0,
    "records": {}
}

CACHE_DURATION = 7200

# ==================================================
# TLE VALIDATION
# ==================================================

def validate_tle(line1, line2, satellite_id):

    if not line1.startswith("1 "):
        return False

    if not line2.startswith("2 "):
        return False

    line1_id = line1[2:7].strip()
    line2_id = line2[2:7].strip()

    return (
        line1_id == satellite_id
        and line2_id == satellite_id
    )


# ==================================================
# SATELLITE DATA RETRIEVAL
# ==================================================

def get_satellite_records():

    current_time = time.time()

    cached_records = TLE_CACHE["records"]

    # Return cache only when every configured satellite
    # has a recent, successfully retrieved record.

    if cached_records and all(
        satellite_id in cached_records
        and not cached_records[satellite_id].get("stale", False)
        and current_time - cached_records[satellite_id].get(
            "fetched_at",
            TLE_CACHE["fetched_at"]
        ) < CACHE_DURATION
        for satellite_id in SATELLITES
    ):

        return cached_records

    # Preserve previous records so a failed provider
    # does not immediately remove a satellite.

    records = {}
    provider_errors = []

    for satellite_id, satellite_name in SATELLITES.items():

        satellite_record = None

        # ------------------------------------------
        # PROVIDER 1: CELESTRAK
        # ------------------------------------------

        try:

            response = requests.get(
                CELESTRAK_URL,
                params={
                    "CATNR": satellite_id,
                    "FORMAT": "TLE"
                },
                headers=TLE_HEADERS,
                timeout=15
            )

            response.raise_for_status()

            lines = [
                line.strip()
                for line in response.text.splitlines()
                if line.strip()
            ]

            line1 = next(
                (
                    line for line in lines
                    if line.startswith("1 ")
                ),
                None
            )

            line2 = next(
                (
                    line for line in lines
                    if line.startswith("2 ")
                ),
                None
            )

            if (
                line1
                and line2
                and validate_tle(
                    line1,
                    line2,
                    satellite_id
                )
            ):

                satellite_record = {
                    "name": satellite_name,
                    "line1": line1,
                    "line2": line2,
                    "source": "CelesTrak",
                    "fetched_at": current_time,
                    "stale": False
                }

        except Exception as error:

            provider_errors.append(
                f"CelesTrak {satellite_id}: {error}"
            )

        # ------------------------------------------
        # PROVIDER 2: ALTERNATE TLE API
        # ------------------------------------------

        if satellite_record is None:

            try:

                response = requests.get(
                    ALTERNATE_TLE_URL.format(
                        satellite_id
                    ),
                    headers=TLE_HEADERS,
                    timeout=15
                )

                response.raise_for_status()

                data = response.json()

                line1 = str(
                    data.get("line1", "")
                ).strip()

                line2 = str(
                    data.get("line2", "")
                ).strip()

                if validate_tle(
                    line1,
                    line2,
                    satellite_id
                ):

                    satellite_record = {
                        "name": satellite_name,
                        "line1": line1,
                        "line2": line2,
                        "source": "Alternate TLE API",
                        "fetched_at": current_time,
                        "stale": False
                    }

            except Exception as error:

                provider_errors.append(
                    f"Alternate API {satellite_id}: {error}"
                )

        # ------------------------------------------
        # KEEP SUCCESSFUL RECORDS
        # ------------------------------------------

        if satellite_record is not None:

            records[satellite_id] = satellite_record

        # ------------------------------------------
        # PRESERVE PREVIOUS RECORD IF BOTH FAIL
        # ------------------------------------------

        elif satellite_id in cached_records:

            old_record = dict(
                cached_records[satellite_id]
            )

            old_record["stale"] = True

            records[satellite_id] = old_record

            app.logger.warning(
                "Using stale cached TLE for %s",
                satellite_name
            )

    # ------------------------------------------
    # CHECK WHETHER ANY DATA EXISTS
    # ------------------------------------------

    if not records:

        raise Exception(
            "Unable to retrieve satellite orbital data. "
            + " | ".join(provider_errors)
        )

    # Update cache without discarding older records
    # for satellites whose providers failed.

    TLE_CACHE["records"] = records
    TLE_CACHE["fetched_at"] = current_time

    return records


# ==================================================
# CREATE SATELLITE OBJECTS
# ==================================================

def create_satellites():

    records = get_satellite_records()

    satellite_objects = {}

    for satellite_id, record in records.items():

        satellite_objects[satellite_id] = EarthSatellite(
            record["line1"],
            record["line2"],
            record["name"],
            ts
        )

    return satellite_objects


# ==================================================
# TIME CONVERSION
# ==================================================

def to_ist(skyfield_time):

    utc_time = skyfield_time.utc_datetime()

    return utc_time.astimezone(IST)
    # ==================================================
# HOME PAGE
# ==================================================

@app.route("/")
def home():
    return render_template("index.html")


# ==================================================
# SYSTEM HEALTH
# ==================================================

@app.route("/api/system-health")
def system_health():

    database_status = "Healthy"

    try:
        connection = get_db_connection()
        connection.execute("SELECT 1")
        connection.close()

    except Exception:
        database_status = "Error"

    return jsonify({

        "application": "OrbitView",

        "status": (
            "Healthy"
            if database_status == "Healthy"
            else "Degraded"
        ),

        "database": database_status,

        "timestamp": current_timestamp(),

        "features": {
            "satellite_tracking": "Available",
            "orbit_visualization": "Available",
            "pass_prediction": "Available",
            "communication_analysis": "Available",
            "space_alerts": "Available",
            "bug_reporting": "Available",
            "error_logging": "Available"
        }

    })


# ==================================================
# FRONTEND ERROR REPORTING
# ==================================================

@app.route("/api/errors", methods=["POST"])
def receive_frontend_error():

    data = request.get_json(silent=True) or {}

    error_type = str(
        data.get("error_type", "JavaScript Error")
    ).strip()

    message = str(
        data.get("message", "Unknown frontend error")
    ).strip()

    source = str(
        data.get("source", "Frontend")
    ).strip()

    endpoint = str(
        data.get("endpoint", "")
    ).strip()

    if not message:
        return jsonify({
            "success": False,
            "message": "Error message is required."
        }), 400

    save_error_log(
        error_type=error_type,
        message=message,
        source=source,
        endpoint=endpoint
    )

    return jsonify({
        "success": True,
        "message": "Frontend error recorded."
    }), 201


# ==================================================
# ERROR LOGS
# ==================================================

@app.route("/api/error-logs")
def get_error_logs():

    try:

        connection = get_db_connection()

        rows = connection.execute(
            """
            SELECT *
            FROM error_logs
            ORDER BY id DESC
            LIMIT 200
            """
        ).fetchall()

        connection.close()

        logs = [dict(row) for row in rows]

        return jsonify({
            "success": True,
            "count": len(logs),
            "logs": logs
        })

    except Exception:

        app.logger.exception(
            "Unable to retrieve error logs."
        )

        return jsonify({
            "success": False,
            "error": "Unable to retrieve error logs."
        }), 500


# ==================================================
# SUBMIT BUG REPORT
# ==================================================

@app.route("/api/bug-reports", methods=["POST"])
def submit_bug_report():

    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    feature = str(data.get("feature", "")).strip()

    if not title or not description or not feature:

        return jsonify({
            "success": False,
            "message": "Title, description and feature are required."
        }), 400

    if len(title) > 150:

        return jsonify({
            "success": False,
            "message": "Title must be 150 characters or fewer."
        }), 400

    if len(description) > 3000:

        return jsonify({
            "success": False,
            "message": "Description must be 3000 characters or fewer."
        }), 400

    if len(feature) > 100:

        return jsonify({
            "success": False,
            "message": "Feature name is too long."
        }), 400

    connection = None

    try:

        created_at = current_timestamp()

        connection = get_db_connection()

        cursor = connection.execute(
            """
            INSERT INTO bug_reports (
                title,
                description,
                feature,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                title,
                description,
                feature,
                "Open",
                created_at
            )
        )

        report_id = cursor.lastrowid

        connection.commit()
        connection.close()
        connection = None

        report = {
            "title": title,
            "description": description,
            "feature": feature,
            "status": "Open",
            "created_at": created_at
        }

        telegram_sent = send_bug_report_telegram(report)

        print(
            "DEBUG TELEGRAM RESULT:",
            telegram_sent
        )

        return jsonify({
            "success": True,
            "message": "Bug report submitted successfully.",
            "report_id": report_id,
            "telegram_sent": telegram_sent
        }), 201

    except Exception:

        if connection:
            connection.close()

        app.logger.exception(
            "Unable to save bug report."
        )

        return jsonify({
            "success": False,
            "message": "Unable to submit bug report."
        }), 500


# ==================================================
# UPDATE BUG REPORT STATUS
# ==================================================

@app.route(
    "/api/bug-reports/<int:report_id>/status",
    methods=["PATCH"]
)
def update_bug_report_status(report_id):

    data = request.get_json(silent=True) or {}

    new_status = str(
        data.get("status", "")
    ).strip()

    allowed_statuses = [
        "Open",
        "In Progress",
        "Resolved"
    ]

    if new_status not in allowed_statuses:

        return jsonify({
            "success": False,
            "message": "Invalid report status."
        }), 400

    try:

        connection = get_db_connection()

        cursor = connection.execute(
            """
            UPDATE bug_reports
            SET status = ?
            WHERE id = ?
            """,
            (new_status, report_id)
        )

        connection.commit()

        updated = cursor.rowcount > 0

        connection.close()

        if not updated:

            return jsonify({
                "success": False,
                "message": "Bug report not found."
            }), 404

        return jsonify({
            "success": True,
            "message": "Bug report status updated.",
            "report_id": report_id,
            "status": new_status
        })

    except Exception:

        app.logger.exception(
            "Unable to update bug report."
        )

        return jsonify({
            "success": False,
            "message": "Unable to update bug report status."
        }), 500


# ==================================================
# AUTOMATIC SERVER ERROR LOGGING
# ==================================================

@app.after_request
def log_server_errors(response):

    if response.status_code >= 500:

        try:

            response_data = (
                response.get_json(silent=True) or {}
            )

            message = (
                response_data.get("error")
                or response_data.get("message")
                or f"HTTP {response.status_code} server error"
            )

            details = response_data.get("details")

            if details:
                message = (
                    f"{message}: {str(details)[:1500]}"
                )

            save_error_log(
                error_type=f"HTTP {response.status_code}",
                message=message,
                source="Backend",
                endpoint=request.path
            )

        except Exception:

            app.logger.exception(
                "Automatic error logging failed."
            )

    return response


# ==================================================
# SATELLITE TRACKING API
# ==================================================

@app.route("/api/satellites")
def get_satellites():

    try:

        records = get_satellite_records()

        satellite_objects = create_satellites()

        current_time = ts.now()

        satellites = []

        for satellite_id, satellite in satellite_objects.items():

            geocentric = satellite.at(current_time)

            subpoint = wgs84.subpoint(geocentric)

            velocity = geocentric.velocity.km_per_s

            speed = (velocity ** 2).sum() ** 0.5

            record = records[satellite_id]

            satellites.append({

                "name": SATELLITES[satellite_id],

                "latitude": round(
                    subpoint.latitude.degrees, 4
                ),

                "longitude": round(
                    subpoint.longitude.degrees, 4
                ),

                "altitude_km": round(
                    subpoint.elevation.km, 2
                ),

                "velocity_km_s": round(
                    float(speed), 3
                ),

                "norad_id": satellite_id,

                "data_source": record["source"],

                "data_status": (
                    "STALE CACHED DATA"
                    if record.get("stale", False)
                    else "CURRENT TLE DATA"
                ),

                "status": "ORBITAL DATA"

            })

        return jsonify({

            "source": "Public TLE providers",

            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),

            "satellites": satellites

        })

    except Exception as error:

        app.logger.exception(
            "Satellite tracking failed."
        )

        return jsonify({

            "error": "Unable to retrieve satellite orbital data.",

            "details": str(error)

        }), 502


# ==================================================
# SATELLITE ORBIT PATH API
# ==================================================

@app.route("/api/orbits")
def get_satellite_orbits():

    try:

        records = get_satellite_records()

        satellite_objects = create_satellites()

        orbit_paths = []

        current_datetime = datetime.now(timezone.utc)

        SAMPLE_COUNT = 121

        for satellite_id, satellite in satellite_objects.items():

            record = records[satellite_id]

            mean_motion = float(
                record["line2"][52:63].strip()
            )

            if mean_motion <= 0:
                continue

            period_minutes = 1440 / mean_motion

            period_seconds = period_minutes * 60

            sample_times = [

                current_datetime + timedelta(
                    seconds=period_seconds * index / (
                        SAMPLE_COUNT - 1
                    )
                )

                for index in range(SAMPLE_COUNT)

            ]

            skyfield_times = ts.from_datetimes(
                sample_times
            )

            geocentric = satellite.at(
                skyfield_times
            )

            subpoints = wgs84.subpoint(
                geocentric
            )

            latitudes = subpoints.latitude.degrees

            longitudes = subpoints.longitude.degrees

            coordinates = [

                [
                    round(float(latitude), 4),
                    round(float(longitude), 4)
                ]

                for latitude, longitude in zip(
                    latitudes,
                    longitudes
                )

            ]

            orbit_paths.append({

                "name": SATELLITES[satellite_id],

                "norad_id": satellite_id,

                "color": ORBIT_COLORS.get(
                    satellite_id,
                    "#36D9FF"
                ),

                "period_minutes": round(
                    period_minutes, 2
                ),

                "coordinates": coordinates,

                "data_status": (
                    "STALE CACHED DATA"
                    if record.get("stale", False)
                    else "CURRENT TLE DATA"
                )

            })

        return jsonify({

            "source": "Public TLE providers + Skyfield",

            "calculation_type": "Predicted orbital path",

            "updated_at": current_datetime.isoformat(),

            "sample_count": SAMPLE_COUNT,

            "orbits": orbit_paths

        })

    except Exception as error:

        app.logger.exception(
            "Orbit calculation failed."
        )

        return jsonify({

            "error": "Unable to calculate satellite orbits.",

            "details": str(error)

        }), 502
        # ==================================================
# SATELLITE PASS PREDICTION API
# ==================================================

@app.route("/api/passes")
def get_satellite_passes():

    try:

        satellite_objects = create_satellites()

        start_time = ts.now()
        end_time = ts.tt_jd(start_time.tt + 1)

        passes = []

        for satellite_id, satellite in satellite_objects.items():

            events, event_codes = satellite.find_events(
                GROUND_STATION,
                start_time,
                end_time,
                altitude_degrees=MINIMUM_ELEVATION
            )

            current_pass = {}

            for event_time, event_code in zip(events, event_codes):

                if event_code == 0:

                    current_pass = {
                        "satellite": SATELLITES[satellite_id],
                        "norad_id": satellite_id,
                        "rise_time": to_ist(event_time).isoformat()
                    }

                elif event_code == 1 and current_pass:

                    difference = satellite - GROUND_STATION
                    topocentric = difference.at(event_time)

                    altitude, azimuth, distance = topocentric.altaz()

                    current_pass["maximum_elevation"] = round(
                        altitude.degrees, 2
                    )

                    current_pass["maximum_elevation_time"] = (
                        to_ist(event_time).isoformat()
                    )

                    current_pass["azimuth"] = round(
                        azimuth.degrees, 2
                    )

                    current_pass["range_km"] = round(
                        distance.km, 2
                    )

                elif event_code == 2 and current_pass:

                    set_time = to_ist(event_time)

                    current_pass["set_time"] = set_time.isoformat()

                    rise_time = datetime.fromisoformat(
                        current_pass["rise_time"]
                    )

                    duration = (
                        set_time - rise_time
                    ).total_seconds()

                    current_pass["duration_minutes"] = round(
                        duration / 60, 2
                    )

                    if "maximum_elevation" in current_pass:
                        passes.append(current_pass)

                    current_pass = {}

        passes.sort(
            key=lambda item: item["rise_time"]
        )

        return jsonify({

            "ground_station": GROUND_STATION_NAME,
            "prediction_period": "Next 24 hours",
            "minimum_elevation_degrees": MINIMUM_ELEVATION,
            "timezone": "IST",
            "data_source": "Public TLE orbital elements",
            "passes": passes,

            "message": (
                "Satellite pass prediction completed."
                if passes
                else "No qualifying satellite passes found."
            )

        })

    except Exception as error:

        app.logger.exception(
            "Satellite pass prediction failed."
        )

        return jsonify({

            "error": "Satellite pass prediction failed.",
            "details": str(error)

        }), 500


# ==================================================
# SATELLITE COMMUNICATION ANALYSIS API
# ==================================================

@app.route("/api/communication/<satellite_id>")
def communication_analysis(satellite_id):

    try:

        satellite_objects = create_satellites()

        if satellite_id not in satellite_objects:

            return jsonify({
                "error": "Satellite not found."
            }), 404

        satellite = satellite_objects[satellite_id]

        current_time = ts.now()

        difference = satellite - GROUND_STATION
        topocentric = difference.at(current_time)

        altitude, azimuth, distance = topocentric.altaz()

        distance_km = float(distance.km)

        if distance_km <= 0:
            raise ValueError("Invalid satellite distance.")

        one_way_delay_ms = (
            distance_km / SPEED_OF_LIGHT_KM_S
        ) * 1000

        round_trip_delay_ms = one_way_delay_ms * 2

        frequency_ghz = COMMUNICATION_FREQUENCY_GHZ
        frequency_mhz = frequency_ghz * 1000

        fspl_db = (
            32.44
            + 20 * math.log10(frequency_mhz)
            + 20 * math.log10(distance_km)
        )

        transmit_power_dbm = 30
        transmit_antenna_gain_dbi = 10
        receive_antenna_gain_dbi = 10
        other_losses_db = 2

        received_power_dbm = (
            transmit_power_dbm
            + transmit_antenna_gain_dbi
            + receive_antenna_gain_dbi
            - fspl_db
            - other_losses_db
        )

        is_visible = bool(
            altitude.degrees >= MINIMUM_ELEVATION
        )

        record = TLE_CACHE["records"].get(
            satellite_id, {}
        )

        return jsonify({

            "satellite": SATELLITES[satellite_id],
            "norad_id": satellite_id,
            "ground_station": GROUND_STATION_NAME,

            "calculation_time": to_ist(
                current_time
            ).isoformat(),

            "distance_km": round(distance_km, 2),

            "elevation_degrees": round(
                float(altitude.degrees), 2
            ),

            "azimuth_degrees": round(
                float(azimuth.degrees), 2
            ),

            "visible_above_minimum_elevation": is_visible,

            "frequency_ghz": frequency_ghz,

            "one_way_delay_ms": round(
                one_way_delay_ms, 4
            ),

            "round_trip_delay_ms": round(
                round_trip_delay_ms, 4
            ),

            "free_space_path_loss_db": round(
                fspl_db, 2
            ),

            "link_budget_assumptions": {

                "transmit_power_dbm": transmit_power_dbm,

                "transmit_antenna_gain_dbi":
                    transmit_antenna_gain_dbi,

                "receive_antenna_gain_dbi":
                    receive_antenna_gain_dbi,

                "other_losses_db": other_losses_db

            },

            "estimated_received_power_dbm": round(
                received_power_dbm, 2
            ),

            "calculation_type": "Educational simulation",

            "data_source": record.get(
                "source", "Cached TLE data"
            ),

            "data_status": (
                "STALE CACHED DATA"
                if record.get("stale", False)
                else "CURRENT TLE DATA"
            ),

            "status": "SIMULATED COMMUNICATION ANALYSIS"

        })

    except Exception as error:

        app.logger.exception(
            "Communication analysis failed."
        )

        return jsonify({

            "error": "Communication analysis failed.",
            "details": str(error)

        }), 500


# ==================================================
# SPACE OBJECT PROXIMITY ALERT API
# ==================================================

@app.route("/api/space-alerts")
def get_space_alerts():

    try:

        satellite_names = list(SATELLITES.values())

        alerts = check_space_proximity(
            satellite_names
        )

        results = []

        current_time = time.time()

        for alert in alerts:

            satellite_name = alert["satellite"]

            last_sent = LAST_SPACE_ALERT.get(
                satellite_name, 0
            )

            if (
                current_time - last_sent
                >= SPACE_ALERT_COOLDOWN
            ):

                telegram_sent = send_telegram_alert(
                    alert
                )

                if telegram_sent:
                    LAST_SPACE_ALERT[satellite_name] = current_time

            else:
                telegram_sent = False

            alert["telegram_sent"] = telegram_sent

            results.append(alert)

        return jsonify({

            "feature": "Space Object Proximity Alert",

            "status": "SIMULATION ONLY",

            "data_source": "Simulated space object data",

            "warning_distance_km": 10.0,

            "alerts": results,

            "alert_count": len(results),

            "message": (
                "Simulated proximity alerts generated."
                if results
                else "No simulated proximity alerts at this time."
            )

        })

    except Exception as error:

        app.logger.exception(
            "Space proximity alert failed."
        )

        return jsonify({

            "error": "Space proximity alert failed.",
            "details": str(error)

        }), 500


# ==================================================
# RUN APPLICATION
# ==================================================

if __name__ == "__main__":

    initialize_database()

    app.run(debug=True)