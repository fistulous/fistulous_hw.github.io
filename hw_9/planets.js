import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
import { initOrbitControls } from './util.js';

// =============================
// 텍스처 이미지 경로 (여기를 네가 채워 넣기)
// =============================
const TEXTURE_PATHS = {
    sun:      'PATH_TO_SUN_TEXTURE_IMAGE',      // 예: './textures/sun.jpg'
    mercury:  './Mercury.jpg',  // 예: './textures/mercury.jpg'
    venus:    './Venus.jpg',
    earth:    './Earth.jpg',
    mars:     './Mars.jpg',
};

// =============================
// 기본 설정
// =============================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// 카메라 2종류: Perspective / Orthographic
const aspect = window.innerWidth / window.innerHeight;

// Perspective Camera
const perspectiveCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
perspectiveCamera.position.set(0, 60, 120);

// Orthographic Camera
const frustumSize = 200;
const orthographicCamera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
);
orthographicCamera.position.copy(perspectiveCamera.position);
orthographicCamera.lookAt(0, 0, 0);

let camera = perspectiveCamera;
scene.add(camera);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0x000000);

// OrbitControls
const orbitControls = initOrbitControls(camera, renderer);
orbitControls.target.set(0, 0, 0);

// Stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// Light: 태양 위치에 PointLight
const pointLight = new THREE.PointLight(0xffffff, 2, 0);
pointLight.position.set(0, 0, 0);
scene.add(pointLight);

// 약간의 주변광
const ambientLight = new THREE.AmbientLight(0xffffff,0.7);
scene.add(ambientLight);

// GUI
const gui = new GUI();


// =============================
// Camera GUI
// =============================

// 현재 카메라 상태
const cameraParams = {
    current: 'Perspective'   // 화면에 보여줄 문자열
};

let currentCamCtrl; // 나중에 updateDisplay() 호출하려고 외부 변수로 빼둠

// 카메라 스위치 함수
cameraParams.switchCamera = () => {
    if (camera === perspectiveCamera) {
        // Orthographic으로 전환
        camera = orthographicCamera;
        cameraParams.current = 'Orthographic';
    } else {
        // Perspective로 전환
        camera = perspectiveCamera;
        cameraParams.current = 'Perspective';
    }

    // OrbitControls에 새 카메라 전달
    orbitControls.object = camera;

    // 혹시 모르니 카메라도 다시 한 번 타겟을 보게 하고
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // GUI에 표시된 "Current Camera" 문자열 갱신
    if (currentCamCtrl) currentCamCtrl.updateDisplay();
};

const cameraFolder = gui.addFolder('Camera');

// 1) 위쪽 버튼
cameraFolder
    .add(cameraParams, 'switchCamera')
    .name('Switch Camera Type');

// 2) 현재 카메라 타입 표시 (읽기 전용)
currentCamCtrl = cameraFolder
    .add(cameraParams, 'current')
    .name('Current Camera');

currentCamCtrl.disable();  // 값 편집은 막고, 표시만


// =============================
// 태양 & 행성 데이터
// =============================
const textureLoader = new THREE.TextureLoader();


// 태양
let sunMesh;
createSun();

// 행성 정의
const planetConfigs = [
    {
        name: 'Mercury',   // 수성
        key: 'mercury',
        radius: 1.5,
        distance: 20,
        color: '#a6a6a6',
        rotationSpeed: 0.02,
        orbitSpeed: 0.02
    },
    {
        name: 'Venus',     // 금성
        key: 'venus',
        radius: 3,
        distance: 35,
        color: '#e39e1c',
        rotationSpeed: 0.015,
        orbitSpeed: 0.015
    },
    {
        name: 'Earth',     // 지구
        key: 'earth',
        radius: 3.5,
        distance: 50,
        color: '#3498db',
        rotationSpeed: 0.01,
        orbitSpeed: 0.01
    },
    {
        name: 'Mars',      // 화성
        key: 'mars',
        radius: 2.5,
        distance: 65,
        color: '#c0392b',
        rotationSpeed: 0.008,
        orbitSpeed: 0.008
    }
];

// 행성 상태 & 객체를 저장할 배열
const planets = [];
const planetParams = {}; // GUI에서 쓸 속도 파라미터

createPlanets();






// =============================
// Functions
// =============================

function createSun() {
    const sunTexture = textureLoader.load(TEXTURE_PATHS.sun);
    const sunGeo = new THREE.SphereGeometry(10, 32, 32);
    const sunMat = new THREE.MeshStandardMaterial({
        map: sunTexture,
        emissive: 0xffff00,
        emissiveIntensity: 1
    });
    sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sunMesh);
}

function createPlanets() {
    planetConfigs.forEach((cfg) => {
        // 텍스처 + 머티리얼
        const tex = textureLoader.load(TEXTURE_PATHS[cfg.key]);
        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            color: cfg.color
        });

        // 구체 geometry
        const geo = new THREE.SphereGeometry(cfg.radius, 32, 32);
        const mesh = new THREE.Mesh(geo, mat);

        // 공전용 pivot
        const pivot = new THREE.Object3D();
        pivot.position.set(0, 0, 0);
        scene.add(pivot);

        // 행성 위치 (x축으로 distance만큼)
        mesh.position.x = cfg.distance;
        pivot.add(mesh);

        // 상태 저장
        planetParams[cfg.key] = {
            rotationSpeed: cfg.rotationSpeed,
            orbitSpeed: cfg.orbitSpeed
        };

        planets.push({
            key: cfg.key,
            name: cfg.name,
            mesh,
            pivot
        });

        // GUI 폴더 (각 Planet)
        const folder = gui.addFolder(cfg.name);
        folder
            .add(planetParams[cfg.key], 'rotationSpeed', 0, 0.1, 0.001)
            .name('Rotation Speed');
        folder
            .add(planetParams[cfg.key], 'orbitSpeed', 0, 0.1, 0.001)
            .name('Orbit Speed');
    });
}

// =============================
// Render Loop
// =============================
function render() {
    requestAnimationFrame(render);

    // 태양 자전 (원하면 속도 조절 가능)
    if (sunMesh) {
        sunMesh.rotation.y += 0.005;
    }

    // 각 행성 자전/공전 업데이트
    planets.forEach((p) => {
        const params = planetParams[p.key];
        p.mesh.rotation.y += params.rotationSpeed;   // 자전
        p.pivot.rotation.y += params.orbitSpeed;     // 공전
    });

    orbitControls.update();
    stats.update();
    renderer.render(scene, camera);
}

render();

// =============================
// Resize 대응
// =============================
window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;

    // Perspective
    perspectiveCamera.aspect = newAspect;
    perspectiveCamera.updateProjectionMatrix();

    // Orthographic
    orthographicCamera.left   = (frustumSize * newAspect) / -2;
    orthographicCamera.right  = (frustumSize * newAspect) / 2;
    orthographicCamera.top    = frustumSize / 2;
    orthographicCamera.bottom = -frustumSize / 2;
    orthographicCamera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});
