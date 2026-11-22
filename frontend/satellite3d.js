
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ================================================
// ORBITVIEW - INTERACTIVE 3D SATELLITE EXPLORER
// ================================================

const modal = document.getElementById("satellite3DModal");
const sceneContainer = document.getElementById("satellite3DScene");
const title = document.getElementById("satellite3DTitle");
const subtitle = document.getElementById("satellite3DSubtitle");
const closeButton = document.getElementById("close3DViewer");

let scene, camera, renderer, controls, satellite;
let animationFrame;
let resizeObserver;
let raycaster;
let mouse;

let componentGroups = {};
let selectedComponent = null;
let exploded = false;
let rotating = true;
let closeUpMode = false;

let closeUpButton;
let backButton;
let animationButton;
let currentModel = "ISS";

// Animation settings
let animationsEnabled = true;
let animationClock;
let animationBaseTransforms = {};

// ================================================
// COMPONENT INFORMATION
// ================================================

const componentInfo = {
    body: {
        name: "Satellite Body",
        description: "The main structure of a satellite. It houses onboard computers, electronic systems, power management units and other equipment.",
        purpose: "Protects and supports the satellite's internal systems."
    },

    solar: {
        name: "Solar Panels",
        description: "Solar panels use photovoltaic cells to convert sunlight into electrical energy.",
        purpose: "Generate electrical power for spacecraft operations."
    },

    antenna: {
        name: "Communication Antenna",
        description: "Antennas transmit and receive radio signals between spacecraft and ground stations.",
        purpose: "Enables communication and data transmission."
    },

    truss: {
        name: "Structural Frame",
        description: "The structural frame connects and supports different satellite components.",
        purpose: "Provides structural strength and support."
    },

    docking: {
        name: "Docking Module",
        description: "Docking modules provide connection points for compatible spacecraft.",
        purpose: "Allows compatible spacecraft to connect."
    },

    sensors: {
        name: "Scientific Instruments",
        description: "Scientific instruments collect information about Earth, space and other objects.",
        purpose: "Gather scientific observations and measurements."
    },

    thrusters: {
        name: "Thrusters",
        description: "Thrusters provide small changes in spacecraft velocity and orientation.",
        purpose: "Support attitude and orbit adjustments."
    },

    lander: {
        name: "Vikram Lander",
        description: "Vikram was the Chandrayaan-3 lander. It carried scientific instruments and delivered the Pragyan rover to the lunar surface.",
        purpose: "Perform a controlled lunar landing and support surface experiments."
    },

    legs: {
        name: "Landing Legs",
        description: "The lander has a supporting landing-leg structure designed for contact with the lunar surface.",
        purpose: "Provide stability and support during landing."
    },

    instruments: {
        name: "Lunar Scientific Instruments",
        description: "The mission carried instruments for studying lunar surface properties and the local lunar environment.",
        purpose: "Collect scientific measurements from the Moon."
    },

    rover: {
        name: "Pragyan Rover",
        description: "Pragyan was the six-wheeled lunar rover deployed by the Vikram lander. It explored the nearby lunar surface.",
        purpose: "Travel across the lunar surface and perform scientific observations."
    },

    weather: {
        name: "Weather Observation Instruments",
        description: "INSAT-3D carries meteorological instruments that observe clouds, atmospheric conditions and weather patterns.",
        purpose: "Support weather forecasting and cyclone monitoring."
    },

    propulsion: {
        name: "Propulsion System",
        description: "The propulsion system helps maintain the satellite's position in its geostationary orbit.",
        purpose: "Support orbital station keeping."
    }
};

// ================================================
// MATERIALS
// ================================================

function createMaterial(color, metalness = 0.4, roughness = 0.55) {
    return new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness
    });
}

function addMesh(parent, geometry, material, position, componentId) {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(...position);

    if (componentId) {
        mesh.userData.componentId = componentId;
    }

    parent.add(mesh);
    return mesh;
}

function addBox(parent, size, position, material, componentId = null) {
    return addMesh(
        parent,
        new THREE.BoxGeometry(...size),
        material,
        position,
        componentId
    );
}

function registerComponent(id, group) {
    group.userData.componentId = id;
    componentGroups[id] = group;
    satellite.add(group);
    return group;
}

// ================================================
// CYLINDER HELPER
// ================================================

function addCylinder(
    parent,
    radiusTop,
    radiusBottom,
    height,
    position,
    material,
    componentId,
    radialSegments = 20
) {
    return addMesh(
        parent,
        new THREE.CylinderGeometry(
            radiusTop,
            radiusBottom,
            height,
            radialSegments
        ),
        material,
        position,
        componentId
    );
}

// ================================================
// BACKGROUND STARS
// ================================================

function createStars() {
    const positions = [];

    for (let i = 0; i < 1200; i++) {
        positions.push(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100
        );
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    const stars = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            color: "#FFFFFF",
            size: 0.12
        })
    );

    scene.add(stars);
}

// ================================================
// SOLAR PANELS
// ================================================

function createSolarPanel(parent, xPosition) {
    const panel = new THREE.Group();

    panel.position.x = xPosition;

    const blue = createMaterial("#174C91", 0.5);
    const frame = createMaterial("#C7D5E8", 0.7);

    addBox(panel, [5.5, 0.12, 3.2], [0, 0, 0], frame, "solar");

    addBox(panel, [5.25, 0.08, 3.0], [0, 0.08, 0], blue, "solar");

    for (let i = -2; i <= 2; i++) {
        addBox(
            panel,
            [0.025, 0.02, 3.0],
            [i * 1.05, 0.14, 0],
            frame,
            "solar"
        );
    }

    for (let i = -1; i <= 1; i++) {
        addBox(
            panel,
            [5.25, 0.02, 0.025],
            [0, 0.14, i * 0.75],
            frame,
            "solar"
        );
    }

    parent.add(panel);

    return panel;
}

// ================================================
// ISS MODEL
// ================================================

function createISS() {
    const group = new THREE.Group();

    satellite = group;
    componentGroups = {};

    const white = createMaterial("#E8EDF5", 0.65);
    const silver = createMaterial("#9EADBF", 0.8);
    const gold = createMaterial("#D5A94E", 0.65);

    const body = new THREE.Group();

    const module1 = addCylinder(
        body, 0.65, 0.65, 2.5,
        [0, 0, 0], white, "body", 24
    );

    module1.rotation.z = Math.PI / 2;

    const module2 = addCylinder(
        body, 0.48, 0.48, 1.7,
        [1.8, 0, 0], silver, "body", 24
    );

    module2.rotation.z = Math.PI / 2;

    registerComponent("body", body);

    const truss = new THREE.Group();

    addBox(truss, [10, 0.18, 0.18], [0, 0, 0], gold, "truss");

    registerComponent("truss", truss);

    const solar = new THREE.Group();

    createSolarPanel(solar, -6);
    createSolarPanel(solar, 6);

    registerComponent("solar", solar);

    const docking = new THREE.Group();

    for (const x of [-1.8, 1.8]) {
        const node = addCylinder(
            docking, 0.38, 0.38, 0.8,
            [x, 0, 0], white, "docking", 20
        );

        node.rotation.z = Math.PI / 2;
    }

    registerComponent("docking", docking);

    const antenna = new THREE.Group();

    addMesh(
        antenna,
        new THREE.SphereGeometry(
            0.65, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2
        ),
        white,
        [0, 1.1, 0.8],
        "antenna"
    );

    addCylinder(
        antenna, 0.06, 0.06, 0.8,
        [0, 0.75, 0.8], gold, "antenna", 12
    );

    registerComponent("antenna", antenna);

    const sensors = new THREE.Group();

    addBox(
        sensors,
        [0.65, 0.65, 0.65],
        [-0.7, 0.9, 0],
        createMaterial("#36D9FF", 0.7),
        "sensors"
    );

    registerComponent("sensors", sensors);

    const thrusters = new THREE.Group();

    for (const x of [-0.9, 0.9]) {
        const nozzle = addCylinder(
            thrusters, 0.12, 0.22, 0.65,
            [x, -0.8, 0], gold, "thrusters", 16
        );

        nozzle.rotation.z = Math.PI / 2;
    }

    registerComponent("thrusters", thrusters);

    return group;
}

// ================================================
// HUBBLE MODEL
// ================================================

function createHubble() {
    const group = new THREE.Group();

    satellite = group;
    componentGroups = {};

    const white = createMaterial("#E9EDF5", 0.5);
    const gold = createMaterial("#D5A94E", 0.6);

    const body = new THREE.Group();

    const cylinder = addCylinder(
        body, 0.85, 0.85, 3.8,
        [0, 0, 0], white, "body", 32
    );

    cylinder.rotation.z = Math.PI / 2;

    const front = addCylinder(
        body, 0.95, 0.95, 0.35,
        [2, 0, 0], gold, "body", 32
    );

    front.rotation.z = Math.PI / 2;

    registerComponent("body", body);

    const solar = new THREE.Group();

    createSolarPanel(solar, -3.5);
    createSolarPanel(solar, 3.5);

    registerComponent("solar", solar);

    const antenna = new THREE.Group();

    const ring = addMesh(
        antenna,
        new THREE.TorusGeometry(0.88, 0.08, 12, 32),
        gold,
        [-1.5, 0, 0],
        "antenna"
    );

    ring.rotation.y = Math.PI / 2;

    registerComponent("antenna", antenna);

    return group;
}

// ================================================
// NOAA MODEL
// ================================================

function createNOAA() {
    const group = new THREE.Group();

    satellite = group;
    componentGroups = {};

    const white = createMaterial("#E8EDF5", 0.6);
    const gold = createMaterial("#D5A94E", 0.6);

    const body = new THREE.Group();

    const cylinder = addCylinder(
        body, 0.65, 0.65, 2.8,
        [0, 0, 0], white, "body", 24
    );

    cylinder.rotation.z = Math.PI / 2;

    registerComponent("body", body);

    const solar = new THREE.Group();

    createSolarPanel(solar, -2.5);
    createSolarPanel(solar, 2.5);

    registerComponent("solar", solar);

    const antenna = new THREE.Group();

    addMesh(
        antenna,
        new THREE.SphereGeometry(0.55, 24, 16),
        gold,
        [0, 0.9, 0],
        "antenna"
    );

    registerComponent("antenna", antenna);

    return group;
}

// ================================================
// CHANDRAYAAN-3 MODEL
// ================================================

function createChandrayaan3() {
    const group = new THREE.Group();

    satellite = group;
    componentGroups = {};

    const gold = createMaterial("#D5A94E", 0.65);
    const white = createMaterial("#E9EDF5", 0.55);
    const silver = createMaterial("#AEBBCB", 0.8);
    const dark = createMaterial("#25344D", 0.65);
    const black = createMaterial("#111827", 0.4);
    const solarBlue = createMaterial("#174C91", 0.6);
    const instrumentBlue = createMaterial("#36D9FF", 0.65);

    // VIKRAM LANDER

    const lander = new THREE.Group();

    addBox(lander, [2.5, 1.35, 2.5], [0, 1.2, 0], gold, "lander");

    addBox(lander, [1.8, 0.35, 1.8], [0, 2.05, 0], white, "lander");

    addBox(lander, [1.2, 0.15, 1.2], [0, 2.3, 0], silver, "lander");

    addBox(lander, [0.7, 0.45, 0.08], [0, 1.35, 1.29], dark, "lander");

    addBox(lander, [0.7, 0.45, 0.08], [0, 1.35, -1.29], dark, "lander");

    addCylinder(
        lander, 0.18, 0.18, 0.45,
        [0.65, 2.45, 0.65], silver, "lander", 16
    );

    addCylinder(
        lander, 0.18, 0.18, 0.45,
        [-0.65, 2.45, -0.65], silver, "lander", 16
    );

    registerComponent("lander", lander);

    // LANDING LEGS

    const legs = new THREE.Group();

    const legPositions = [
        [-1, 0, -1],
        [1, 0, -1],
        [-1, 0, 1],
        [1, 0, 1]
    ];

    legPositions.forEach(([x, y, z]) => {
        const leg = addCylinder(
            legs, 0.09, 0.12, 1.65,
            [x * 1.1, 0.45, z * 1.1],
            silver, "legs", 12
        );

        leg.rotation.z = x * 0.35;
        leg.rotation.x = z * 0.35;

        addBox(
            legs, [0.65, 0.12, 0.65],
            [x * 1.35, -0.42, z * 1.35],
            gold, "legs"
        );

        addMesh(
            legs,
            new THREE.SphereGeometry(0.17, 12, 12),
            dark,
            [x * 0.95, 0.95, z * 0.95],
            "legs"
        );
    });

    registerComponent("legs", legs);

    // SOLAR PANEL

    const solar = new THREE.Group();

    addBox(solar, [0.12, 0.12, 2.0], [1.5, 1.2, 0], silver, "solar");

    addBox(solar, [0.12, 1.8, 2.7], [2.45, 1.2, 0], white, "solar");

    addBox(solar, [0.08, 1.65, 2.5], [2.53, 1.2, 0], solarBlue, "solar");

    for (let i = -2; i <= 2; i++) {
        addBox(
            solar, [0.025, 1.65, 0.025],
            [2.59, 1.2, i * 0.42],
            white, "solar"
        );
    }

    for (let i = -1; i <= 1; i++) {
        addBox(
            solar, [0.025, 0.025, 2.5],
            [2.59, 1.2 + i * 0.5, 0],
            white, "solar"
        );
    }

    registerComponent("solar", solar);

    // COMMUNICATION ANTENNA

    const antenna = new THREE.Group();

    addCylinder(
        antenna, 0.05, 0.05, 0.9,
        [0, 2.8, -0.7], silver, "antenna", 12
    );

    const dish = addMesh(
        antenna,
        new THREE.SphereGeometry(
            0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2
        ),
        white,
        [0, 3.15, -0.7],
        "antenna"
    );

    dish.rotation.x = Math.PI;

    addMesh(
        antenna,
        new THREE.SphereGeometry(0.12, 16, 12),
        gold,
        [0, 3.05, -0.7],
        "antenna"
    );

    registerComponent("antenna", antenna);

    // SCIENTIFIC INSTRUMENTS

    const instruments = new THREE.Group();

    addBox(
        instruments, [0.7, 0.5, 0.65],
        [-0.8, 0.7, 1.45],
        instrumentBlue, "instruments"
    );

    addBox(
        instruments, [0.55, 0.45, 0.55],
        [0.85, 0.7, 1.45],
        silver, "instruments"
    );

    addMesh(
        instruments,
        new THREE.CylinderGeometry(0.2, 0.2, 0.15, 20),
        black,
        [-0.8, 0.7, 1.82],
        "instruments"
    );

    addMesh(
        instruments,
        new THREE.SphereGeometry(0.2, 16, 12),
        instrumentBlue,
        [0.85, 1.05, 1.45],
        "instruments"
    );

    registerComponent("instruments", instruments);

    // PRAGYAN ROVER

    const rover = new THREE.Group();

    addBox(rover, [1.4, 0.45, 1.0], [0, 0.65, 0], gold, "rover");

    addBox(rover, [1.25, 0.08, 0.85], [0, 0.93, 0], solarBlue, "rover");

    for (let i = -2; i <= 2; i++) {
        addBox(
            rover, [0.025, 0.025, 0.85],
            [i * 0.24, 0.99, 0],
            white, "rover"
        );
    }

    for (let i = -1; i <= 1; i++) {
        addBox(
            rover, [1.25, 0.025, 0.025],
            [0, 0.99, i * 0.25],
            white, "rover"
        );
    }

    const wheelPositions = [
        [-0.58, 0.35, -0.62],
        [0, 0.35, -0.62],
        [0.58, 0.35, -0.62],
        [-0.58, 0.35, 0.62],
        [0, 0.35, 0.62],
        [0.58, 0.35, 0.62]
    ];

    wheelPositions.forEach(([x, y, z]) => {
        const wheel = addCylinder(
            rover, 0.22, 0.22, 0.16,
            [x, y, z], black, "rover", 20
        );

        wheel.rotation.x = Math.PI / 2;

        const hub = addCylinder(
            rover, 0.09, 0.09, 0.18,
            [x, y, z], silver, "rover", 16
        );

        hub.rotation.x = Math.PI / 2;
    });

    addCylinder(
        rover, 0.035, 0.035, 0.65,
        [0, 1.25, -0.3], silver, "rover", 10
    );

    addMesh(
        rover,
        new THREE.SphereGeometry(0.12, 12, 12),
        white,
        [0, 1.6, -0.3],
        "rover"
    );

    rover.position.set(4.5, 0, 0.5);

    registerComponent("rover", rover);

    group.rotation.y = -0.25;

    return group;
}

// ================================================
// INSAT-3D MODEL - INDIAN WEATHER SATELLITE
// ================================================

function createINSAT3D() {
    const group = new THREE.Group();

    satellite = group;
    componentGroups = {};

    const gold = createMaterial("#D5A94E", 0.65);
    const white = createMaterial("#E9EDF5", 0.55);
    const silver = createMaterial("#AEBBCB", 0.8);
    const blue = createMaterial("#174C91", 0.6);
    const dark = createMaterial("#25344D", 0.65);
    const cyan = createMaterial("#36D9FF", 0.7);

    // MAIN SATELLITE BODY

    const body = new THREE.Group();

    addBox(
        body,
        [2.5, 2.2, 2.2],
        [0, 0, 0],
        gold,
        "body"
    );

    addBox(
        body,
        [2.1, 1.8, 0.12],
        [0, 0, 1.16],
        white,
        "body"
    );

    addBox(
        body,
        [2.1, 1.8, 0.12],
        [0, 0, -1.16],
        silver,
        "body"
    );

    addBox(
        body,
        [0.7, 0.7, 0.15],
        [0.65, 0.4, 1.25],
        dark,
        "body"
    );

    addBox(
        body,
        [0.7, 0.7, 0.15],
        [-0.65, -0.4, 1.25],
        dark,
        "body"
    );

    addBox(
        body,
        [1.1, 0.35, 1.1],
        [0, 1.25, 0],
        silver,
        "body"
    );

    registerComponent("body", body);

    // SOLAR PANEL WINGS

    const solar = new THREE.Group();

    addBox(
        solar,
        [2.0, 0.12, 0.12],
        [-2.1, 0, 0],
        silver,
        "solar"
    );

    addBox(
        solar,
        [2.0, 0.12, 0.12],
        [2.1, 0, 0],
        silver,
        "solar"
    );

    createSolarPanel(solar, -5);
    createSolarPanel(solar, 5);

    registerComponent("solar", solar);

    // WEATHER OBSERVATION INSTRUMENTS

    const weather = new THREE.Group();

    addBox(
        weather,
        [0.9, 0.8, 0.7],
        [0, 1.45, 0],
        white,
        "weather"
    );

    addMesh(
        weather,
        new THREE.SphereGeometry(0.4, 24, 16),
        cyan,
        [0, 1.95, 0.35],
        "weather"
    );

    addBox(
        weather,
        [0.5, 0.5, 0.5],
        [-1.2, 0.7, 0],
        silver,
        "weather"
    );

    addBox(
        weather,
        [0.5, 0.5, 0.5],
        [1.2, 0.7, 0],
        silver,
        "weather"
    );

    addMesh(
        weather,
        new THREE.SphereGeometry(0.2, 16, 12),
        cyan,
        [0, 1.45, 0.55],
        "weather"
    );

    registerComponent("weather", weather);

    // COMMUNICATION ANTENNA

    const antenna = new THREE.Group();

    addCylinder(
        antenna,
        0.07,
        0.07,
        1.3,
        [0, 1.6, -1.1],
        silver,
        "antenna",
        16
    );

    const dish = addMesh(
        antenna,
        new THREE.SphereGeometry(
            0.85,
            24,
            16,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
        ),
        white,
        [0, 2.2, -1.1],
        "antenna"
    );

    dish.rotation.x = Math.PI;

    addMesh(
        antenna,
        new THREE.SphereGeometry(0.16, 16, 12),
        gold,
        [0, 2.2, -1.1],
        "antenna"
    );

    registerComponent("antenna", antenna);

    // PROPULSION SYSTEM

    const propulsion = new THREE.Group();

    for (const x of [-0.8, 0.8]) {
        const nozzle = addCylinder(
            propulsion,
            0.15,
            0.28,
            0.8,
            [x, -1.45, 0],
            gold,
            "propulsion",
            16
        );

        nozzle.rotation.x = Math.PI;
    }

    addBox(
        propulsion,
        [1.8, 0.3, 0.5],
        [0, -1.1, -0.8],
        silver,
        "propulsion"
    );

    registerComponent("propulsion", propulsion);

    group.rotation.y = -0.2;

    return group;
}

// ================================================
// COMPONENT BUTTON DEFINITIONS
// ================================================

const componentButtonDefinitions = {
    body: {
        icon: "🛰️",
        label: "Satellite Body"
    },

    solar: {
        icon: "☀️",
        label: "Solar Panels"
    },

    antenna: {
        icon: "📡",
        label: "Antenna"
    },

    truss: {
        icon: "🔩",
        label: "Structural Frame"
    },

    docking: {
        icon: "🔗",
        label: "Docking Module"
    },

    sensors: {
        icon: "🔭",
        label: "Scientific Instruments"
    },

    thrusters: {
        icon: "🚀",
        label: "Thrusters"
    },

    lander: {
        icon: "🌕",
        label: "Vikram Lander"
    },

    legs: {
        icon: "🦿",
        label: "Landing Legs"
    },

    instruments: {
        icon: "🔬",
        label: "Lunar Instruments"
    },

    rover: {
        icon: "🤖",
        label: "Pragyan Rover"
    },

    weather: {
        icon: "🌦️",
        label: "Weather Instruments"
    },

    propulsion: {
        icon: "🚀",
        label: "Propulsion System"
    }
};

// ================================================
// COMPONENT BUTTONS
// ================================================

function setupComponentButtons() {
    const container = document.querySelector(".component-buttons");

    if (!container) return;

    container.querySelectorAll("[data-dynamic-component]").forEach(button => {
        button.remove();
    });

    const availableComponents = Object.keys(componentGroups);

    container.querySelectorAll("[data-component]").forEach(button => {
        const id = button.dataset.component;

        button.style.display = availableComponents.includes(id)
            ? "flex"
            : "none";

        button.classList.remove("selected");
    });

    availableComponents.forEach(id => {
        if (container.querySelector(`[data-component="${id}"]`)) {
            return;
        }

        const definition = componentButtonDefinitions[id];

        if (!definition) return;

        const button = document.createElement("button");

        button.className = "component-button";
        button.dataset.component = id;
        button.dataset.dynamicComponent = "true";

        button.innerHTML = `
            <span>${definition.icon}</span>
            ${definition.label}
        `;

        container.appendChild(button);
    });

    container.querySelectorAll("[data-component]").forEach(button => {
        button.onclick = () => {
            selectComponent(button.dataset.component);
        };
    });
}

// ================================================
// COMPONENT INFORMATION
// ================================================

function updateComponentInfo(id) {
    const info = componentInfo[id];

    if (!info) return;

    document.getElementById("componentTitle").textContent = info.name;

    document.getElementById("componentDescription").textContent =
        info.description;

    document.getElementById("componentPurpose").textContent =
        info.purpose;
}

function restoreComponentMaterials() {
    Object.values(componentGroups).forEach(group => {
        group.traverse(object => {
            if (!object.isMesh) return;

            if (object.userData.originalMaterial) {
                object.material.dispose();
                object.material = object.userData.originalMaterial;
                delete object.userData.originalMaterial;
            }
        });
    });
}

function selectComponent(id) {
    const info = componentInfo[id];

    if (!info || !componentGroups[id]) return;

    selectedComponent = id;

    updateComponentInfo(id);

    document.querySelectorAll("[data-component]").forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.component === id
        );
    });

    restoreComponentMaterials();

    Object.entries(componentGroups).forEach(([key, group]) => {
        group.traverse(object => {
            if (!object.isMesh) return;

            const originalMaterial = object.material;

            object.userData.originalMaterial = originalMaterial;

            const highlightedMaterial = originalMaterial.clone();

            if (key === id) {
                highlightedMaterial.color.set("#36D9FF");
                highlightedMaterial.emissive.set("#073B55");
                highlightedMaterial.emissiveIntensity = 0.45;
            }

            object.material = highlightedMaterial;
        });
    });

    if (closeUpButton) {
        closeUpButton.disabled = false;
        closeUpButton.style.opacity = "1";
    }
}

// ================================================
// COMPONENT CLOSE-UP MODE
// ================================================

function createCloseUpControls() {
    if (closeUpButton) return;

    const explodeButton = document.getElementById("explodeButton");
    const buttonContainer = explodeButton?.parentElement;

    if (!buttonContainer) return;

    closeUpButton = document.createElement("button");

    closeUpButton.id = "closeup3DButton";
    closeUpButton.className = "explorer-button";
    closeUpButton.textContent = "View Component Close-up";
    closeUpButton.disabled = true;
    closeUpButton.style.opacity = "0.5";

    backButton = document.createElement("button");

    backButton.id = "backToSatelliteButton";
    backButton.className = "explorer-button";
    backButton.textContent = "Back to Full Model";
    backButton.style.display = "none";

    buttonContainer.appendChild(closeUpButton);
    buttonContainer.appendChild(backButton);

    closeUpButton.addEventListener("click", openComponentCloseUp);
    backButton.addEventListener("click", returnToFullSatellite);
}

// ================================================
// OPEN COMPONENT CLOSE-UP
// ================================================

function openComponentCloseUp() {
    if (!selectedComponent || !componentGroups[selectedComponent]) return;

    exploded = false;
    closeUpMode = true;

    Object.values(componentGroups).forEach(group => {
        group.position.set(0, 0, 0);
        group.visible = false;
    });

    const selectedGroup = componentGroups[selectedComponent];

    selectedGroup.visible = true;

    satellite.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(selectedGroup);

    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();

    bounds.getCenter(center);
    bounds.getBoundingSphere(sphere);

    const radius = Math.max(sphere.radius, 0.5);
    const distance = Math.max(radius * 3.2, 4);

    controls.target.copy(center);

    camera.position.set(
        center.x + distance * 0.45,
        center.y + distance * 0.35,
        center.z + distance
    );

    camera.lookAt(center);
    controls.update();

    closeUpButton.style.display = "none";
    backButton.style.display = "inline-block";

    document.getElementById("explodeButton").disabled = true;
}

// ================================================
// RETURN TO FULL SATELLITE
// ================================================

function returnToFullSatellite() {
    if (!satellite) return;

    closeUpMode = false;

    Object.values(componentGroups).forEach(group => {
        group.visible = true;
        group.position.set(0, 0, 0);
    });

    camera.position.set(0, 5, 13);
    controls.target.set(0, 0, 0);
    controls.update();

    closeUpButton.style.display = "inline-block";
    backButton.style.display = "none";

    document.getElementById("explodeButton").disabled = false;

    if (selectedComponent) {
        selectComponent(selectedComponent);
    }
}

// ================================================
// SATELLITE COMPONENT ANIMATIONS
// ================================================

function saveAnimationBaseTransforms() {
    animationBaseTransforms = {};

    ["body", "solar", "antenna"].forEach(id => {
        const group = componentGroups[id];

        if (!group) return;

        animationBaseTransforms[id] = {
            position: group.position.clone(),
            rotation: group.rotation.clone()
        };
    });

    animationClock = new THREE.Clock();
}

function updateSatelliteAnimations() {
    if (!animationsEnabled || !animationClock) return;

    const time = animationClock.getElapsedTime();

    // Solar panels: gentle tracking movement
    const solar = componentGroups.solar;
    const solarBase = animationBaseTransforms.solar;

    if (solar && solarBase) {
        solar.rotation.y =
            solarBase.rotation.y + Math.sin(time * 0.45) * 0.16;
    }

    // Antenna: gentle scanning movement
    const antenna = componentGroups.antenna;
    const antennaBase = animationBaseTransforms.antenna;

    if (antenna && antennaBase) {
        antenna.rotation.y =
            antennaBase.rotation.y + Math.sin(time * 0.7) * 0.3;
    }

    // Satellite body: subtle orientation movement
    const body = componentGroups.body;
    const bodyBase = animationBaseTransforms.body;

    if (body && bodyBase) {
        body.rotation.z =
            bodyBase.rotation.z + Math.sin(time * 0.5) * 0.025;
    }
}

// ================================================
// ANIMATION CONTROL BUTTON
// ================================================

function setupAnimationButton(rotateButton) {
    if (!rotateButton?.parentElement) return;

    if (!animationButton) {
        animationButton = document.createElement("button");

        animationButton.id = "satelliteAnimationButton";
        animationButton.className = "explorer-button";

        rotateButton.parentElement.appendChild(animationButton);

        animationButton.addEventListener("click", () => {
            animationsEnabled = !animationsEnabled;

            animationButton.textContent = animationsEnabled
                ? "Pause Animations"
                : "Resume Animations";
        });
    }

    animationButton.textContent = animationsEnabled
        ? "Pause Animations"
        : "Resume Animations";
}

// ================================================
// EXPLODED VIEW
// ================================================

function toggleExplodedView() {
    if (closeUpMode) return;

    exploded = !exploded;

    const button = document.getElementById("explodeButton");

    if (button) {
        button.textContent = exploded
            ? "Close Exploded View"
            : "Exploded View";
    }
}

function updateExplodedView() {
    const offsets = {
        body: new THREE.Vector3(0, 0, 0),
        solar: new THREE.Vector3(0, 3.5, 0),
        truss: new THREE.Vector3(0, -2.5, 0),
        docking: new THREE.Vector3(3, 0, 2),
        antenna: new THREE.Vector3(0, 3, 3),
        sensors: new THREE.Vector3(-3, 2, 0),
        thrusters: new THREE.Vector3(0, -3, -2),

        lander: new THREE.Vector3(0, 0, 0),
        legs: new THREE.Vector3(0, -2.5, 0),
        instruments: new THREE.Vector3(-2.5, 1.5, 2),
        rover: new THREE.Vector3(4, 0, 2),

        weather: new THREE.Vector3(-2.5, 2, 2),
        propulsion: new THREE.Vector3(0, -3, -2)
    };

    Object.entries(componentGroups).forEach(([id, group]) => {
        if (!group.visible) return;

        const target = exploded
            ? offsets[id] || new THREE.Vector3()
            : new THREE.Vector3();

        group.position.lerp(target, 0.08);
    });
}

// ================================================
// 3D MOUSE CLICK DETECTION
// ================================================

function handleSceneClick(event) {
    if (closeUpMode || !renderer) return;

    const rect = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const objects = [];

    Object.values(componentGroups).forEach(group => {
        if (!group.visible) return;

        group.traverse(object => {
            if (object.isMesh) {
                objects.push(object);
            }
        });
    });

    const hits = raycaster.intersectObjects(objects, false);

    if (!hits.length) return;

    const id = hits[0].object.userData.componentId;

    if (id) {
        selectComponent(id);
    }
}

// ================================================
// RESET VIEW
// ================================================

function resetView() {
    exploded = false;
    closeUpMode = false;
    selectedComponent = null;

    restoreComponentMaterials();

    Object.values(componentGroups).forEach(group => {
        group.position.set(0, 0, 0);
        group.visible = true;
    });

    satellite.rotation.set(0, 0, 0);

    // Restore animated components to their original rotations
    Object.entries(animationBaseTransforms).forEach(([id, transform]) => {
        const group = componentGroups[id];

        if (group) {
            group.rotation.copy(transform.rotation);
        }
    });

    camera.position.set(0, 5, 13);
    controls.target.set(0, 0, 0);
    controls.reset();

    controls.autoRotate = rotating;
    controls.update();

    const explodeButton = document.getElementById("explodeButton");

    if (explodeButton) {
        explodeButton.textContent = "Exploded View";
        explodeButton.disabled = false;
    }

    if (closeUpButton) {
        closeUpButton.style.display = "inline-block";
        closeUpButton.disabled = true;
        closeUpButton.style.opacity = "0.5";
    }

    if (backButton) {
        backButton.style.display = "none";
    }

    document.getElementById("componentTitle").textContent =
        "Select a component";

    document.getElementById("componentDescription").textContent =
        "Click a component button or select a part of the 3D satellite.";

    document.getElementById("componentPurpose").textContent =
        "Explore how satellite systems work.";

    document.querySelectorAll("[data-component]").forEach(button => {
        button.classList.remove("selected");
    });
}

// ================================================
// INITIALIZE VIEWER
// ================================================

function initializeViewer(modelName, satelliteId) {
    if (!sceneContainer) return;

    cancelAnimationFrame(animationFrame);

    resizeObserver?.disconnect();

    if (controls) {
        controls.dispose();
    }

    if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
    }

    componentGroups = {};
    selectedComponent = null;
    exploded = false;
    closeUpMode = false;

    scene = new THREE.Scene();

    scene.background = new THREE.Color("#050B1A");

    const width = sceneContainer.clientWidth || 600;
    const height = sceneContainer.clientHeight || 480;

    camera = new THREE.PerspectiveCamera(
        45,
        width / height,
        0.1,
        1000
    );

    camera.position.set(0, 5, 13);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.setSize(width, height);

    sceneContainer.appendChild(renderer.domElement);

    // ORBIT CONTROLS

    controls = new OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 40;
    controls.autoRotate = rotating;
    controls.autoRotateSpeed = 1.2;

    // LIGHTING

    scene.add(new THREE.AmbientLight("#FFFFFF", 1.8));

    const sunlight = new THREE.DirectionalLight("#FFFFFF", 3);

    sunlight.position.set(8, 10, 8);

    scene.add(sunlight);

    const blueLight = new THREE.PointLight("#318BFF", 2);

    blueLight.position.set(-8, -4, -5);

    scene.add(blueLight);

    createStars();

    // SELECT MODEL

    const normalizedName = modelName.toLowerCase();
    const normalizedId = String(satelliteId).toUpperCase();

    if (
        normalizedId === "INSAT3D" ||
        normalizedName.includes("insat-3d") ||
        normalizedName.includes("insat3d") ||
        normalizedName.includes("insat 3d")
    ) {
        currentModel = "INSAT3D";
        satellite = createINSAT3D();

        camera.position.set(0, 6, 18);

        controls.target.set(0, 0.5, 0);

        subtitle.textContent =
            "Indian weather satellite · Meteorological observation · Illustrative 3D model";

    } else if (
        normalizedId === "CHANDRAYAAN3" ||
        normalizedName.includes("chandrayaan")
    ) {
        currentModel = "CHANDRAYAAN3";
        satellite = createChandrayaan3();

        camera.position.set(0, 6, 17);

        controls.target.set(1, 1, 0);

        subtitle.textContent =
            "Indian lunar mission · Vikram lander and Pragyan rover · Illustrative 3D model";

    } else if (
        satelliteId === "20580" ||
        normalizedName.includes("hubble")
    ) {
        currentModel = "HUBBLE";
        satellite = createHubble();

        subtitle.textContent =
            `NORAD ID: ${satelliteId} · Illustrative educational 3D model`;

    } else if (
        satelliteId === "33591" ||
        normalizedName.includes("noaa")
    ) {
        currentModel = "NOAA";
        satellite = createNOAA();

        subtitle.textContent =
            `NORAD ID: ${satelliteId} · Illustrative educational 3D model`;

    } else {
        currentModel = "ISS";
        satellite = createISS();

        subtitle.textContent =
            `NORAD ID: ${satelliteId || "25544"} · Illustrative educational 3D model`;
    }

    scene.add(satellite);

    // Save original component rotations for animation
    saveAnimationBaseTransforms();

    // RAYCASTER

    raycaster = new THREE.Raycaster();

    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener("click", handleSceneClick);

    // COMPONENT BUTTONS

    setupComponentButtons();

    createCloseUpControls();

    // MODEL CONTROL BUTTONS

    const explodeButton = document.getElementById("explodeButton");
    const resetButton = document.getElementById("reset3DButton");
    const rotateButton = document.getElementById("rotate3DButton");

    // Add separate animation control
    setupAnimationButton(rotateButton);

    if (explodeButton) {
        explodeButton.onclick = toggleExplodedView;

        explodeButton.textContent = "Exploded View";
        explodeButton.disabled = false;
    }

    if (resetButton) {
        resetButton.onclick = resetView;
    }

    if (rotateButton) {
        rotateButton.onclick = () => {
            rotating = !rotating;

            controls.autoRotate = rotating;

            rotateButton.textContent = rotating
                ? "Pause Rotation"
                : "Resume Rotation";
        };

        rotateButton.textContent = rotating
            ? "Pause Rotation"
            : "Resume Rotation";
    }

    if (closeUpButton) {
        closeUpButton.style.display = "inline-block";
        closeUpButton.disabled = true;
        closeUpButton.style.opacity = "0.5";
    }

    if (backButton) {
        backButton.style.display = "none";
    }

    // RESPONSIVE RESIZING

    resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera) return;

        const newWidth = sceneContainer.clientWidth;
        const newHeight = sceneContainer.clientHeight;

        if (!newWidth || !newHeight) return;

        camera.aspect = newWidth / newHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(newWidth, newHeight);
    });

    resizeObserver.observe(sceneContainer);

    // ANIMATION LOOP

    function animate() {
        animationFrame = requestAnimationFrame(animate);

        updateSatelliteAnimations();

        updateExplodedView();

        controls.update();

        renderer.render(scene, camera);
    }

    animate();
}

// ================================================
// OPEN VIEWER
// ================================================

window.openSatellite3D = function (satelliteData) {
    const name =
        satelliteData.name ||
        satelliteData.satellite_name ||
        "Satellite";

    const id = String(
        satelliteData.norad_id ||
        satelliteData.id ||
        ""
    );

    title.textContent = name;

    subtitle.textContent = "Loading 3D model...";

    modal.classList.add("active");

    requestAnimationFrame(() => {
        initializeViewer(name, id);
    });
};

// ================================================
// CLOSE VIEWER
// ================================================

function closeViewer() {
    if (!modal) return;

    modal.classList.remove("active");

    cancelAnimationFrame(animationFrame);

    resizeObserver?.disconnect();

    if (controls) {
        controls.dispose();
    }

    if (renderer) {
        renderer.domElement.removeEventListener(
            "click",
            handleSceneClick
        );

        renderer.dispose();

        renderer.domElement.remove();

        renderer = null;
    }

    scene = null;
    camera = null;
    controls = null;
    satellite = null;

    componentGroups = {};

    selectedComponent = null;

    exploded = false;
    closeUpMode = false;

    animationClock = null;
    animationBaseTransforms = {};
}

closeButton?.addEventListener("click", closeViewer);

modal?.addEventListener("click", event => {
    if (event.target === modal) {
        closeViewer();
    }
});

window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeViewer();
    }
});
