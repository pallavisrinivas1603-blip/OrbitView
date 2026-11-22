
const communicationButton = document.getElementById(
    "analyzeCommunicationButton"
);

const satelliteSelector = document.getElementById(
    "communicationSatellite"
);

const communicationMessage = document.getElementById(
    "communicationMessage"
);

const communicationResults = document.getElementById(
    "communicationResults"
);


communicationButton.addEventListener("click", async () => {

    const satelliteId = satelliteSelector.value;

    communicationButton.disabled = true;
    communicationButton.textContent = "Analyzing...";

    communicationMessage.textContent =
        "Calculating communication parameters...";

    communicationResults.innerHTML = "";

    try {

        const response = await fetch(
            `/api/communication/${encodeURIComponent(satelliteId)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Communication analysis failed."
            );
        }

        const visibilityText = data.visible_above_minimum_elevation
            ? "Above minimum elevation"
            : "Below local horizon";

        const visibilityClass = data.visible_above_minimum_elevation
            ? "visible-status"
            : "hidden-status";

        communicationMessage.textContent =
            "Communication analysis completed successfully.";

        communicationResults.innerHTML = `

            <div class="communication-summary">

                <div class="communication-summary-top">

                    <div>
                        <span class="result-label">
                            SELECTED SATELLITE
                        </span>

                        <h3>🛰️ ${escapeHTML(data.satellite)}</h3>

                        <p>NORAD ID: ${escapeHTML(data.norad_id)}</p>
                    </div>

                    <span class="${visibilityClass}">
                        ${visibilityText}
                    </span>

                </div>

            </div>


            <div class="communication-grid">

                <div class="communication-card">
                    <span>📏 Satellite Distance</span>
                    <strong>${formatNumber(data.distance_km)} km</strong>
                </div>

                <div class="communication-card">
                    <span>⏱️ One-Way Delay</span>
                    <strong>${data.one_way_delay_ms} ms</strong>
                </div>

                <div class="communication-card">
                    <span>🔁 Round-Trip Delay</span>
                    <strong>${data.round_trip_delay_ms} ms</strong>
                </div>

                <div class="communication-card">
                    <span>📡 Frequency</span>
                    <strong>${data.frequency_ghz} GHz</strong>
                </div>

                <div class="communication-card">
                    <span>📉 Free-Space Path Loss</span>
                    <strong>${data.free_space_path_loss_db} dB</strong>
                </div>

                <div class="communication-card">
                    <span>📶 Estimated Received Power</span>
                    <strong>${data.estimated_received_power_dbm} dBm</strong>
                </div>

                <div class="communication-card">
                    <span>📐 Elevation</span>
                    <strong>${data.elevation_degrees}°</strong>
                </div>

                <div class="communication-card">
                    <span>🧭 Azimuth</span>
                    <strong>${data.azimuth_degrees}°</strong>
                </div>

            </div>


            <div class="link-budget-panel">

                <h3>📊 Link Budget Assumptions</h3>

                <div class="budget-row">
                    <span>Transmit Power</span>
                    <strong>${data.link_budget_assumptions.transmit_power_dbm} dBm</strong>
                </div>

                <div class="budget-row">
                    <span>Transmit Antenna Gain</span>
                    <strong>${data.link_budget_assumptions.transmit_antenna_gain_dbi} dBi</strong>
                </div>

                <div class="budget-row">
                    <span>Receive Antenna Gain</span>
                    <strong>${data.link_budget_assumptions.receive_antenna_gain_dbi} dBi</strong>
                </div>

                <div class="budget-row">
                    <span>Other Losses</span>
                    <strong>${data.link_budget_assumptions.other_losses_db} dB</strong>
                </div>

                <div class="budget-row received-power-row">
                    <span>Estimated Received Power</span>
                    <strong>${data.estimated_received_power_dbm} dBm</strong>
                </div>

            </div>


            <div class="calculation-footer">

                <span>
                    Ground Station: ${escapeHTML(data.ground_station)}
                </span>

                <span>
                    Calculation Time:
                    ${new Date(data.calculation_time).toLocaleString()}
                </span>

                <span>
                    Data Source: ${escapeHTML(data.data_source)}
                </span>

                <span>
                    ${escapeHTML(data.calculation_type)}
                </span>

            </div>

        `;

    } catch (error) {

        communicationMessage.textContent = error.message;

        communicationResults.innerHTML = `
            <div class="communication-placeholder">
                <h3>Analysis Error</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;

    } finally {

        communicationButton.disabled = false;

        communicationButton.textContent =
            "Analyze Communication";

    }

});


function formatNumber(value) {

    return Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });

}


function escapeHTML(value) {

    return String(value).replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );

}
