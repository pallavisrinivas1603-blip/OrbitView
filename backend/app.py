
from flask import Flask, render_template, jsonify
import os
import requests
import traceback
import time
import math

from datetime import datetime, timezone, timedelta
from skyfield.api import EarthSatellite, load, wgs84

from space_alerts import check_space_proximity, send_telegram_alert


# ==================================================
# FLASK CONFIGURATION
# ==================================================

frontend_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../frontend")
)

app = Flask(
    __name__,
    template_folder=frontend_path,
    static_folder=frontend_path,
    static_url_path="/static"
)


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

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"

ts = load.timescale()

GROUND_STATION = wgs84.latlon(
    latitude_degrees=12.9716,
    longitude_degrees=77.5946,
    elevation_m=920
)

GROUND_STATION_NAME = "Bengaluru, India"

MINIMUM_ELEVATION = 10

IST = timezone(timedelta(hours=5, minutes=30))

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
    "records": None
}

CACHE_DURATION = 7200


def get_satellite_records():

    current_time = time.time()

    if (
        TLE_CACHE["records"] is not None
        and current_time - TLE_CACHE["fetched_at"] < CACHE_DURATION
    ):

        return TLE_CACHE["records"]

    records = {}

    for satellite_id, satellite_name in SATELLITES.items():

        response = requests.get(

            CELESTRAK_URL,

            params={

                "CATNR": satellite_id,

                "FORMAT": "TLE"

            },

            timeout=20

        )

        response.raise_for_status()

        lines = [

            line.strip()

            for line in response.text.splitlines()

            if line.strip()

        ]

        if len(lines) < 3:

            continue

        records[satellite_id] = {

            "name": satellite_name,

            "line1": lines[1],

            "line2": lines[2]

        }

    if not records:

        raise Exception("No satellite orbital data received.")

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
# SATELLITE TRACKING API
# ==================================================

@app.route("/api/satellites")
def get_satellites():

    try:

        satellite_objects = create_satellites()

        current_time = ts.now()

        satellites = []

        for satellite_id, satellite in satellite_objects.items():

            geocentric = satellite.at(current_time)

            subpoint = wgs84.subpoint(geocentric)

            velocity = geocentric.velocity.km_per_s

            speed = (velocity ** 2).sum() ** 0.5

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

                "data_source": "CelesTrak",

                "status": "REAL ORBITAL DATA"

            })

        return jsonify({

            "source": "CelesTrak",

            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),

            "satellites": satellites

        })

    except requests.RequestException as error:

        return jsonify({

            "error": "Unable to connect to CelesTrak.",

            "details": str(error)

        }), 502

    except Exception as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Satellite calculation failed.",

            "details": str(error)

        }), 500


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

                    seconds=period_seconds * index / (SAMPLE_COUNT - 1)

                )

                for index in range(SAMPLE_COUNT)

            ]

            skyfield_times = ts.from_datetimes(sample_times)

            geocentric = satellite.at(skyfield_times)

            subpoints = wgs84.subpoint(geocentric)

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

                "coordinates": coordinates

            })

        return jsonify({

            "source": "CelesTrak TLE + Skyfield",

            "calculation_type": "Predicted orbital path",

            "updated_at": current_datetime.isoformat(),

            "sample_count": SAMPLE_COUNT,

            "orbits": orbit_paths

        })

    except requests.RequestException as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Unable to retrieve orbital data.",

            "details": str(error)

        }), 502

    except Exception as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Orbit calculation failed.",

            "details": str(error)

        }), 500


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

                        "rise_time": to_ist(
                            event_time
                        ).isoformat()

                    }

                elif event_code == 1 and current_pass:

                    difference = satellite - GROUND_STATION

                    topocentric = difference.at(event_time)

                    altitude, azimuth, distance = (
                        topocentric.altaz()
                    )

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

                    current_pass["set_time"] = (
                        set_time.isoformat()
                    )

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

            "data_source": "CelesTrak orbital elements",

            "passes": passes,

            "message": (

                "Satellite pass prediction completed."

                if passes

                else "No qualifying satellite passes found."

            )

        })

    except requests.RequestException as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Unable to retrieve satellite data.",

            "details": str(error)

        }), 502

    except Exception as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Satellite pass prediction failed.",

            "details": traceback.format_exc()

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

        altitude, azimuth, distance = (
            topocentric.altaz()
        )

        distance_km = float(distance.km)

        one_way_delay_ms = (

            distance_km / SPEED_OF_LIGHT_KM_S

        ) * 1000

        round_trip_delay_ms = one_way_delay_ms * 2

        frequency_ghz = COMMUNICATION_FREQUENCY_GHZ

        frequency_mhz = frequency_ghz * 1000

        if distance_km <= 0:

            raise ValueError("Invalid satellite distance.")

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

        return jsonify({

            "satellite": SATELLITES[satellite_id],

            "norad_id": satellite_id,

            "ground_station": GROUND_STATION_NAME,

            "calculation_time": to_ist(
                current_time
            ).isoformat(),

            "distance_km": round(
                distance_km, 2
            ),

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

            "data_source": "CelesTrak orbital elements",

            "status": "SIMULATED COMMUNICATION ANALYSIS"

        })

    except requests.RequestException as error:

        print(traceback.format_exc())

        return jsonify({

            "error": "Unable to retrieve satellite data.",

            "details": str(error)

        }), 502

    except Exception as error:

        print(traceback.format_exc())

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

        alerts = check_space_proximity(satellite_names)

        results = []

        current_time = time.time()

        for alert in alerts:

            satellite_name = alert["satellite"]

            last_sent = LAST_SPACE_ALERT.get(
                satellite_name, 0
            )

            if current_time - last_sent >= SPACE_ALERT_COOLDOWN:

                telegram_sent = send_telegram_alert(alert)

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

        print(traceback.format_exc())

        return jsonify({

            "error": "Space proximity alert failed.",

            "details": str(error)

        }), 500


# ==================================================
# RUN APPLICATION
# ==================================================

if __name__ == "__main__":

    app.run(debug=True)
