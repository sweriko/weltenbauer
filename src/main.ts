import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Terrain, TerrainParameters } from './core/Terrain';
import { NoiseParameters } from './core/NoiseWrapper';
import { UIManager } from './editor/UIManager';

/* ---------- renderer ----------------------------------------------------- */
const renderCanvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
if (!renderCanvas) throw new Error('#renderCanvas missing in HTML');

const renderer = new THREE.WebGLRenderer({ 
    canvas: renderCanvas,
    antialias: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x88bbff);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* ---------- scene / camera ----------------------------------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);
scene.fog = new THREE.Fog(0x333333, 500, 2000);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(150, 200, 150);

/* ---------- lighting ----------------------------------------------------- */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(200, 300, 200);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -500;
directionalLight.shadow.camera.right = 500;
directionalLight.shadow.camera.top = 500;
directionalLight.shadow.camera.bottom = -500;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 1000;
scene.add(directionalLight);
scene.add(directionalLight.target);

/* ---------- controls ----------------------------------------------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 50;
controls.maxDistance = 1000;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

/* ---------- terrain editor core ------------------------------------------ */

// Helper function to read initial values directly from DOM
function getInitialParamsFromDOM(): TerrainParameters {
    const seedInput = document.getElementById('seed') as HTMLInputElement;
    const terrainSizeInput = document.getElementById('terrainSize') as HTMLInputElement;
    const terrainSegmentsInput = document.getElementById('terrainSegments') as HTMLInputElement;
    const noiseScaleInput = document.getElementById('noiseScale') as HTMLInputElement;
    const octavesInput = document.getElementById('octaves') as HTMLInputElement;
    const persistenceInput = document.getElementById('persistence') as HTMLInputElement;
    const lacunarityInput = document.getElementById('lacunarity') as HTMLInputElement;
    const heightMultiplierInput = document.getElementById('heightMultiplier') as HTMLInputElement;
    const useRidgedNoiseCheckbox = document.getElementById('useRidgedNoise') as HTMLInputElement;

    const noiseParams: NoiseParameters = {
        seed: seedInput.value ? (isNaN(parseFloat(seedInput.value)) ? seedInput.value : parseFloat(seedInput.value)) : undefined,
        scale: parseFloat(noiseScaleInput.value) || 200,
        octaves: parseInt(octavesInput.value) || 6,
        persistence: parseFloat(persistenceInput.value) || 0.5,
        lacunarity: parseFloat(lacunarityInput.value) || 2.0,
        heightMultiplier: parseFloat(heightMultiplierInput.value) || 50,
    };

    return {
        size: parseInt(terrainSizeInput.value) || 512,
        segments: parseInt(terrainSegmentsInput.value) || 128,
        noiseParams: noiseParams,
        useRidgedNoise: useRidgedNoiseCheckbox.checked,
    };
}

const initialTerrainParams: TerrainParameters = getInitialParamsFromDOM();

// Generate a default seed if none is provided in the input fields
if(initialTerrainParams.noiseParams.seed === undefined || initialTerrainParams.noiseParams.seed === ''){
    initialTerrainParams.noiseParams.seed = Math.random().toString(36).substring(7);
} else {
    // Ensure seed is consistently a string if it came from input, for NoiseWrapper logic
    initialTerrainParams.noiseParams.seed = String(initialTerrainParams.noiseParams.seed);
}

const terrain = new Terrain(scene, initialTerrainParams);

// UIManager will use these initialTerrainParams. Its constructor calls setInitialValues.
const uiManager = new UIManager(terrain, initialTerrainParams);

/* ---------- resize & render loop ----------------------------------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

console.log("WeltBuilder initialized!");
console.log("Initial Terrain Parameters:", initialTerrainParams);
