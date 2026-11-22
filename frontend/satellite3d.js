
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const modal = document.getElementById("satellite3DModal");
const sceneContainer = document.getElementById("satellite3DScene");
const title = document.getElementById("satellite3DTitle");
const subtitle = document.getElementById("satellite3DSubtitle");
const closeButton = document.getElementById("close3DViewer");

let scene, camera, renderer, controls, satellite;
let animationFrame;
let resizeObserver;

function createMaterial(color, metalness = 0.4) {
    return new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness: 0.55
    });
}

function addBox(parent, size, position, material) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        material
    );

    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
}

function createSolarPanel(parent, xPosition) {
    const panel = new THREE.Group();
    panel.position.x = xPosition;

    const blue = createMaterial("#174C91", 0.5);
    const frame = createMaterial("#C7D5E8", 0.7);

    addBox(panel, [5.5, 0.12, 3.2], [0, 0, 0], frame);
    addBox(panel, [5.25, 0.08, 3.0], [0, 0.08, 0], blue);

    // Solar panel grid lines
    for (let i = -2; i <= 2; i++) {
        addBox(
            panel,
            [0.025, 0.02, 3.0],
            [i * 1.05, 0.14, 0],
            frame
        );
    }

    for (let i = -1; i <= 1; i++) {
        addBox(
            panel,
            [5.25, 0.02, 0.025],
            [0, 0.14, i * 0.75],
            frame
        );
    }

    parent.add(panel);
}

function createISS() {
    const group = new THREE.Group();

    const white = createMaterial("#E8EDF5", 0.65);
    const silver = createMaterial("#9EADBF", 0.8);
    const gold = createMaterial("#D5A94E", 0.65);

    // Central station modules
    const module1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, 2.5, 24),
        white
    );
    module1.rotation.z = Math.PI / 2;
    group.add(module1);

    const module2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.48, 1.7, 24),
        silver
    );
    module2.rotation.z = Math.PI / 2;
    module2.position.x = 1.8;
    group.add(module2);

    // Central truss
    addBox(group, [10, 0.18, 0.18], [0, 0, 0], gold);

    // Solar array wings
    createSolarPanel(group, -6);
    createSolarPanel(group, 6);

    // Connecting structures
    addBox(group, [0.25, 1.2, 0.25], [0, 0.6, 0], silver);
    addBox(group, [0.25, 1.2, 0.25], [0, -0.6, 0], silver);

    // Small docking modules
    for (const x of [-1.8, 1.8]) {
        const node = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.8, 20),
            white
        );
        node.rotation.z = Math.PI / 2;
        node.position.x = x;
        group.add(node);
    }

    // Communication antenna
    const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        white
    );
    dish.position.set(0, 1.1, 0.8);
    group.add(dish);

    return group;
}

function createHubble() {
    const group = new THREE.Group();

    const white = createMaterial("#E9EDF5", 0.5);
    const gold = createMaterial("#D5A94E", 0.6);
    const blue = createMaterial("#174C91", 0.5);

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 3.8, 32),
        white
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);

    const front = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 0.35, 32),
        gold
    );
    front.rotation.z = Math.PI / 2;
    front.position.x = 2;
    group.add(front);

    createSolarPanel(group, -3.5);
    createSolarPanel(group, 3.5);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.08, 12, 32),
        gold
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -1.5;
    group.add(ring);

    return group;
}

function createNOAA() {
    const group = new THREE.Group();

    const white = createMaterial("#E8EDF5", 0.6);
    const gold = createMaterial("#D5A94E", 0.6);
    const blue = createMaterial("#174C91", 0.5);

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, 2.8, 24),
        white
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);

    createSolarPanel(group, -2.5);
    createSolarPanel(group, 2.5);

    const antenna = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 16),
        gold
    );
    antenna.position.y = 0.9;
    group.add(antenna);

    return group;
}

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

function initializeViewer(modelName, satelliteId) {
    if (!sceneContainer) return;

    if (renderer) {
        cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        renderer.dispose();
        sceneContainer.replaceChildren();
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color("#050B1A");

    camera = new THREE.PerspectiveCamera(
        45,
        sceneContainer.clientWidth / sceneContainer.clientHeight,
        0.1,
        1000
    );

    camera.position.set(0, 5, 13);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
        sceneContainer.clientWidth,
        sceneContainer.clientHeight
    );

    sceneContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    scene.add(new THREE.AmbientLight("#FFFFFF", 1.8));

    const sunlight = new THREE.DirectionalLight("#FFFFFF", 3);
    sunlight.position.set(8, 10, 8);
    scene.add(sunlight);

    const blueLight = new THREE.PointLight("#318BFF", 2);
    blueLight.position.set(-8, -4, -5);
    scene.add(blueLight);

    createStars();

    if (satelliteId === "20580" || modelName.toLowerCase().includes("hubble")) {
        satellite = createHubble();
    } else if (satelliteId === "33591" || modelName.toLowerCase().includes("noaa")) {
        satellite = createNOAA();
    } else {
        satellite = createISS();
    }

    scene.add(satellite);

    resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera) return;

        const width = sceneContainer.clientWidth;
        const height = sceneContainer.clientHeight;

        if (!width || !height) return;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    resizeObserver.observe(sceneContainer);

    function animate() {
        animationFrame = requestAnimationFrame(animate);

        if (satellite) {
            satellite.rotation.y += 0.002;
        }

        controls.update();
        renderer.render(scene, camera);
    }

    animate();
}

window.openSatellite3D = function (satelliteData) {
    const name = satelliteData.name || satelliteData.satellite_name || "Satellite";
    const id = String(satelliteData.norad_id || satelliteData.id || "");

    title.textContent = name;
    subtitle.textContent = `NORAD ID: ${id || "Unknown"} · Illustrative 3D model`;

    modal.classList.add("active");

    requestAnimationFrame(() => {
        initializeViewer(name, id);
    });
};

function closeViewer() {
    modal.classList.remove("active");

    cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();

    if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
    }
}

closeButton?.addEventListener("click", closeViewer);

modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeViewer();
    }
});

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeViewer();
    }
});
