
// ================================================
// ORBITVIEW - SATELLITE TRACKING & ANIMATION
// ================================================

// --------------------------------
// SATELLITE DATA
// --------------------------------

let satelliteData = [];
let orbitData = [];

let animationFrameId = null;
let animationStartTime = null;

const ANIMATION_DURATION = 30000;

// --------------------------------
// GLOBE ELEMENT
// --------------------------------

const globeElement = document.getElementById("globeViz");

if (!globeElement) {
    console.error("Globe element #globeViz was not found.");
}

// --------------------------------
// CREATE GLOBE + INFO LAYOUT
// --------------------------------

let globeLayout = null;
let infoPanel = null;
let world = null;

if (globeElement) {

    globeLayout = document.createElement("div");

    globeLayout.id = "orbitGlobeLayout";

    globeLayout.style.cssText = `
        display: grid;
        grid-template-columns: minmax(0, 1fr) 290px;
        gap: 20px;
        align-items: start;
        width: 100%;
    `;

    globeElement.parentNode.insertBefore(globeLayout, globeElement);
    globeLayout.appendChild(globeElement);

    // --------------------------------
    // RESPONSIVE STYLES
    // --------------------------------

    const responsiveStyle = document.createElement("style");

    responsiveStyle.textContent = `
        #orbitGlobeLayout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 290px;
            gap: 20px;
            align-items: start;
            width: 100%;
        }

        #satelliteInfoPanel {
            background: #ffffff;
            color: #313851;
            border: 1px solid #dce1e8;
            border-radius: 16px;
            padding: 22px;
            box-shadow: 0 8px 25px rgba(30, 40, 60, 0.08);
            font-family: Arial, sans-serif;
            line-height: 1.7;
            min-width: 0;
            display: none;
            overflow-wrap: anywhere;
        }

        #satelliteInfoPanel h3 {
            font-size: 20px;
            margin: 0 0 15px;
            color: #313851;
        }

        #satelliteInfoPanel p {
            margin: 10px 0;
            font-size: 13px;
            color: #4b5568;
        }

        #satelliteInfoPanel strong {
            color: #222a40;
        }

        @media (max-width: 850px) {
            #orbitGlobeLayout {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(responsiveStyle);

    // --------------------------------
    // SATELLITE INFO PANEL
    // --------------------------------

    infoPanel = document.createElement("div");

    infoPanel.id = "satelliteInfoPanel";

    globeLayout.appendChild(infoPanel);

    // --------------------------------
    // GLOBE CONFIGURATION
    // --------------------------------

    world = Globe()(globeElement)
        .globeImageUrl(
            "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        )
        .backgroundImageUrl(
            "https://unpkg.com/three-globe/example/img/night-sky.png"
        )
        .showAtmosphere(true)
        .atmosphereColor("#8bb8ff")
        .atmosphereAltitude(0.18)
        .pointAltitude(0.025)
        .pointRadius(0.65)
        .pointColor("color")
        .labelText("name")
        .labelSize(1.5)
        .labelDotRadius(0.3)
        .labelColor(() => "#ffffff")
        .labelResolution(2)
        .onPointClick(point => {

            const satellite = satelliteData.find(
                item => item.norad_id === point.norad_id
            );

            if (satellite) {
                showSatelliteDetails(satellite);
            }

        });

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.35;

}

// --------------------------------
// RESPONSIVE GLOBE
// --------------------------------

function resizeGlobe() {

    if (!globeElement || !world) return;

    const width = globeElement.clientWidth;
    const height = globeElement.clientHeight;

    if (width > 0 && height > 0) {
        world.width(width);
        world.height(height);
    }

}

window.addEventListener("resize", resizeGlobe);

setTimeout(resizeGlobe, 100);

// --------------------------------
// SATELLITE COLORS
// --------------------------------

function getSatelliteColor(name) {

    const colors = {
        "ISS": "#36D9FF",
        "NOAA-19": "#35D99A",
        "Hubble": "#FFCB70"
    };

    return colors[name] || "#ffffff";

}

// --------------------------------
// SHOW SATELLITE DETAILS
// --------------------------------

function showSatelliteDetails(satellite) {

    if (!infoPanel) return;

    infoPanel.style.display = "block";

    infoPanel.innerHTML = `
        <h3>🛰️ ${satellite.name}</h3>

        <p>
            <strong>NORAD ID:</strong>
            ${satellite.norad_id}
        </p>

        <p>
            <strong>Altitude:</strong>
            ${satellite.altitude_km} km
        </p>

        <p>
            <strong>Latitude:</strong>
            ${satellite.latitude}°
        </p>

        <p>
            <strong>Longitude:</strong>
            ${satellite.longitude}°
        </p>

        <p>
            <strong>Velocity:</strong>
            ${satellite.velocity_km_s} km/s
        </p>

        <p>
            <strong>Data Source:</strong>
            CelesTrak + Skyfield
        </p>

        <p>
            <strong>Status:</strong>
            ORBITAL DATA
        </p>
    `;

}

// --------------------------------
// UPDATE SATELLITE CARDS
// --------------------------------

function updateSatelliteCards(satellites) {

    const cardIds = {
        "ISS": "iss",
        "NOAA-19": "noaa",
        "Hubble": "hubble"
    };

    satellites.forEach(satellite => {

        const prefix = cardIds[satellite.name];

        if (!prefix) return;

        const statusElement =
            document.getElementById(`${prefix}-status`);

        const altitudeElement =
            document.getElementById(`${prefix}-altitude`);

        const latitudeElement =
            document.getElementById(`${prefix}-latitude`);

        const longitudeElement =
            document.getElementById(`${prefix}-longitude`);

        const velocityElement =
            document.getElementById(`${prefix}-velocity`);

        const trackingElement =
            document.getElementById(`${prefix}-tracking`);

        if (statusElement) {
            statusElement.textContent = "TRACKING";
        }

        if (altitudeElement) {
            altitudeElement.textContent =
                `${satellite.altitude_km} km`;
        }

        if (latitudeElement) {
            latitudeElement.textContent =
                `${satellite.latitude}°`;
        }

        if (longitudeElement) {
            longitudeElement.textContent =
                `${satellite.longitude}°`;
        }

        if (velocityElement) {
            velocityElement.textContent =
                `${satellite.velocity_km_s} km/s`;
        }

        if (trackingElement) {
            trackingElement.textContent =
                `Source: ${satellite.data_source}`;
        }

    });

}

// --------------------------------
// LOAD SATELLITE DATA
// --------------------------------

async function loadSatellites() {

    try {

        const response = await fetch("/api/satellites");

        if (!response.ok) {
            throw new Error("Unable to load satellite data.");
        }

        const data = await response.json();

        if (!Array.isArray(data.satellites)) {
            throw new Error(
                "Satellite API did not return a valid satellites list."
            );
        }

        satelliteData = data.satellites;

        updateSatelliteCards(satelliteData);

        if (world) {

            const markers = satelliteData.map(satellite => ({
                lat: satellite.latitude,
                lng: satellite.longitude,
                name: satellite.name,
                norad_id: satellite.norad_id,
                color: getSatelliteColor(satellite.name)
            }));

            world.pointsData(markers);

        }

        console.log("Satellite data loaded:", satelliteData);

    } catch (error) {

        console.error("Satellite loading error:", error);

        const message = document.getElementById("searchMessage");

        if (message) {
            message.textContent =
                "Unable to load satellite data. Check the backend.";
        }

    }

}

// --------------------------------
// LOAD ORBITAL GROUND TRACKS
// --------------------------------

async function loadSatelliteOrbits() {

    if (!world) return;

    try {

        const response = await fetch("/api/orbits");

        if (!response.ok) {
            throw new Error("Unable to load orbital paths.");
        }

        const data = await response.json();

        orbitData = data.orbits || [];

        const paths = orbitData.map(orbit => ({
            name: orbit.name,
            norad_id: orbit.norad_id,
            color: orbit.color,
            coordinates: orbit.coordinates
        }));

        world
            .pathsData(paths)
            .pathPoints("coordinates")
            .pathPointLat(point => point[0])
            .pathPointLng(point => point[1])
            .pathPointAlt(() => 0.008)
            .pathColor("color")
            .pathStroke(1.5)
            .pathResolution(4)
            .pathDashLength(0.2)
            .pathDashGap(0.08)
            .pathDashAnimateTime(5000);

        console.log("Orbital ground tracks loaded:", orbitData);

        startSatelliteAnimation();

    } catch (error) {

        console.error("Orbital path loading error:", error);

    }

}

// --------------------------------
// INTERPOLATE ORBIT POSITION
// --------------------------------

function getInterpolatedPosition(coordinates, progress) {

    if (!coordinates || coordinates.length < 2) {
        return null;
    }

    const totalSegments = coordinates.length - 1;

    const position = progress * totalSegments;

    const index = Math.min(
        Math.floor(position),
        totalSegments - 1
    );

    const fraction = position - index;

    const start = coordinates[index];
    const end = coordinates[index + 1];

    let longitudeDifference = end[1] - start[1];

    if (longitudeDifference > 180) {
        longitudeDifference -= 360;
    } else if (longitudeDifference < -180) {
        longitudeDifference += 360;
    }

    let longitude = start[1] +
        longitudeDifference * fraction;

    longitude = ((longitude + 540) % 360) - 180;

    const latitude = start[0] +
        (end[0] - start[0]) * fraction;

    return {
        lat: latitude,
        lng: longitude
    };

}

// --------------------------------
// ANIMATE SATELLITES
// --------------------------------

function animateSatellites(timestamp) {

    if (!orbitData.length || !world) return;

    if (animationStartTime === null) {
        animationStartTime = timestamp;
    }

    const elapsed = timestamp - animationStartTime;

    const progress = (elapsed % ANIMATION_DURATION) /
        ANIMATION_DURATION;

    const animatedMarkers = orbitData.map(orbit => {

        const position = getInterpolatedPosition(
            orbit.coordinates,
            progress
        );

        if (!position) return null;

        return {
            lat: position.lat,
            lng: position.lng,
            name: orbit.name,
            norad_id: orbit.norad_id,
            color: orbit.color || getSatelliteColor(orbit.name)
        };

    }).filter(Boolean);

    world.pointsData(animatedMarkers);

    animationFrameId = requestAnimationFrame(
        animateSatellites
    );

}

// --------------------------------
// START ANIMATION
// --------------------------------

function startSatelliteAnimation() {

    if (!world) return;

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
    }

    animationStartTime = null;

    animationFrameId = requestAnimationFrame(
        animateSatellites
    );

    console.log("Satellite animation started!");

}

// --------------------------------
// OPEN 3D SATELLITE VIEWER
// --------------------------------

function openSatelliteViewer(satellite) {

    if (typeof window.openSatellite3D === "function") {

        window.openSatellite3D({
            name: satellite.name,
            norad_id: satellite.norad_id
        });

    } else {

        console.error(
            "3D satellite viewer is not ready. Check satellite3d.js."
        );

        const message =
            document.getElementById("searchMessage");

        if (message) {
            message.textContent =
                "Satellite found, but 3D viewer is not ready. Check the browser console.";
        }

    }

}

// --------------------------------
// SATELLITE SEARCH
// CHANDRAYAAN-3 + INSAT-3D
// --------------------------------

function searchSatellite() {

    const searchInput =
        document.getElementById("satelliteSearch");

    const message =
        document.getElementById("searchMessage");

    const chandrayaanResult =
        document.getElementById("chandrayaanSearchResult");

    const insatResult =
        document.getElementById("insatSearchResult");

    if (!searchInput || !message) return;

    const query = searchInput.value.trim().toLowerCase();

    if (chandrayaanResult) {
        chandrayaanResult.style.display = "none";
    }

    if (insatResult) {
        insatResult.style.display = "none";
    }

    if (!query) {

        message.textContent =
            "Please enter a satellite name or NORAD ID.";

        return;

    }

    const normalizedQuery = query.replace(/[\s-]/g, "");

    // --------------------------------
    // CHANDRAYAAN-3 SEARCH
    // --------------------------------

    if (
        normalizedQuery === "chandrayaan3" ||
        normalizedQuery === "chandrayaan"
    ) {

        if (chandrayaanResult) {

            chandrayaanResult.style.display = "block";

            message.textContent =
                "🇮🇳 Chandrayaan-3 found! Explore its mission details below.";

        } else {

            message.textContent =
                "Chandrayaan-3 found, but its preview card is missing. Check index.html.";

        }

        return;

    }

    // --------------------------------
    // INSAT-3D SEARCH
    // --------------------------------

    if (
        normalizedQuery === "insat3d" ||
        normalizedQuery === "insat"
    ) {

        if (insatResult) {

            insatResult.style.display = "block";

            message.textContent =
                "🇮🇳 INSAT-3D found! Explore India's weather satellite in 3D below.";

        } else {

            message.textContent =
                "INSAT-3D found, but its preview card is missing. Check index.html.";

        }

        return;

    }

    // --------------------------------
    // EXISTING EARTH SATELLITE SEARCH
    // --------------------------------

    const satellite = satelliteData.find(item => {

        const satelliteName =
            String(item.name || "").toLowerCase();

        const satelliteId =
            String(item.norad_id || "");

        return (
            satelliteName === query ||
            satelliteId === query
        );

    });

    if (!satellite) {

        message.textContent =
            "Satellite not found. Try ISS, NOAA-19, Hubble, Chandrayaan-3 or INSAT-3D.";

        return;

    }

    message.textContent =
        `${satellite.name} found successfully! Opening 3D explorer...`;

    if (world) {

        world.pointOfView({
            lat: satellite.latitude,
            lng: satellite.longitude,
            altitude: 1.8
        }, 1500);

    }

    showSatelliteDetails(satellite);

    openSatelliteViewer(satellite);

}

// --------------------------------
// SEARCH EVENT LISTENERS
// --------------------------------

const searchButton =
    document.getElementById("searchButton");

const satelliteSearchInput =
    document.getElementById("satelliteSearch");

if (searchButton) {
    searchButton.addEventListener("click", searchSatellite);
}

if (satelliteSearchInput) {

    satelliteSearchInput.addEventListener("keydown", event => {

        if (event.key === "Enter") {
            searchSatellite();
        }

    });

}

// --------------------------------
// FORMAT PASS TIMES
// --------------------------------

function formatPassTime(dateString) {

    const date = new Date(dateString);

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata"
    });

}

// --------------------------------
// SATELLITE PASS PREDICTION
// --------------------------------

async function loadSatellitePasses() {

    const button =
        document.getElementById("loadPassesButton");

    const message =
        document.getElementById("passMessage");

    const results =
        document.getElementById("passResults");

    if (!button || !message || !results) {
        console.warn(
            "Satellite pass prediction elements are not present in index.html."
        );
        return;
    }

    button.disabled = true;
    button.textContent = "Calculating passes...";

    message.textContent =
        "Please wait. Calculating upcoming satellite passes.";

    results.innerHTML = "";

    try {

        const response = await fetch("/api/passes");

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.details ||
                data.error ||
                "Unable to calculate satellite passes."
            );
        }

        const passes = data.passes || [];

        message.textContent =
            `${passes.length} satellite passes found for Bengaluru.`;

        if (passes.length === 0) {

            results.innerHTML = `
                <div class="pass-empty">
                    <h3>No upcoming passes found 🌌</h3>
                    <p>Try calculating again later.</p>
                </div>
            `;

            return;

        }

        results.innerHTML = passes.map((pass, index) => `

            <article class="pass-card">

                <h3>🛰️ ${pass.satellite}</h3>

                <p class="pass-id">
                    NORAD ID: ${pass.norad_id}
                    · Pass ${index + 1}
                </p>

                <div class="pass-time">
                    <span>🌅 Satellite Rise</span>
                    <strong>${formatPassTime(pass.rise_time)}</strong>
                </div>

                <div class="pass-time">
                    <span>⭐ Maximum Elevation Time</span>
                    <strong>
                        ${formatPassTime(pass.maximum_elevation_time)}
                    </strong>
                </div>

                <div class="pass-time">
                    <span>🌇 Satellite Set</span>
                    <strong>${formatPassTime(pass.set_time)}</strong>
                </div>

                <div class="pass-details">

                    <div class="pass-detail">
                        <span>Maximum Elevation</span>
                        <strong>${pass.maximum_elevation}°</strong>
                    </div>

                    <div class="pass-detail">
                        <span>Duration</span>
                        <strong>${pass.duration_minutes} min</strong>
                    </div>

                    <div class="pass-detail">
                        <span>Azimuth</span>
                        <strong>${pass.azimuth}°</strong>
                    </div>

                    <div class="pass-detail">
                        <span>Range</span>
                        <strong>${pass.range_km} km</strong>
                    </div>

                </div>

            </article>

        `).join("");

        console.log("Satellite passes:", passes);

    } catch (error) {

        console.error("Pass prediction error:", error);

        message.textContent =
            "Unable to load satellite predictions. Check the backend.";

        results.textContent =
            "Prediction error: " + error.message;

    } finally {

        button.disabled = false;

        button.textContent =
            "Calculate Next 24 Hours 🚀";

    }

}

// --------------------------------
// PASS BUTTON - SAFE EVENT LISTENER
// --------------------------------

const loadPassesButton =
    document.getElementById("loadPassesButton");

if (loadPassesButton) {

    loadPassesButton.addEventListener(
        "click",
        loadSatellitePasses
    );

}

// --------------------------------
// START ORBITVIEW
// --------------------------------

loadSatellites();
loadSatelliteOrbits();

console.log("OrbitView initialized successfully 🚀");
