import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";



// ===== Envmap switching =====
const ENV_URLS = [
  "./assets/mossy_forest_4k.hdr",  // 1
  "./assets/blaubeuren_night_4k.hdr",        // 2
  "./assets/aircraft_workshop_01_4k.hdr",        // 3
  "./assets/hall_of_finfish_4k.hdr",  
  "./assets/rostock_laage_airport_4k.hdr",   
   "./assets/university_workshop_4k.hdr",   
];

let pmremGen = null;
let envCache = new Map();   // url -> pmremTexture
let currentEnvTex = null;   // 현재 scene.environment로 쓰는 텍스처
let isEnvLoading = false;


// ============================================================
// 0) 기본 설정
// ============================================================
let scene, camera, renderer, controls, clock;
let overlay;

// ============================================================
// Bubble-wand interaction (equip -> blow -> reload)
// ============================================================
let hud;

let wandGroup = null;
let wandRing = null;
let wandMouth = null; // emit point (Object3D)
let fallbackMouth = null;

let wandState = "stowed"; // "stowed" | "equipping" | "ready" | "stowing" | "reloading"
let wandAnimT = 0;
let wandReloadT = 0;
let wandAmmo = 0;

// 캐시: 매 프레임 new 금지
const _wandPos = new THREE.Vector3();
const _wandEuler = new THREE.Euler();

let popPool = [];
let popActive = [];
let popTexture = null;

// ============================================================
// AUDIO SYNTH (bubble pop arp)
// ============================================================
let audioCtx = null;
let analyser = null;
let timeDomain = null;
let audioReady = false;

let synthGain = null;

// 클릭 시작(overlay click) 이후에 audioCtx가 준비되면 호출
function initSynth() {
  if (!audioCtx) return;

  synthGain = audioCtx.createGain();
  synthGain.gain.value = 0.15;
  synthGain.connect(audioCtx.destination);
}

// MIDI -> Hz
function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// 아주 짧은 플럭(사인파 + 짧은 ADSR)
function triggerPluck(freqHz, when = audioCtx.currentTime) {
  if (!audioCtx || !synthGain) return;

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqHz, when);

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(0.0, when);

  const A = 0.002;
  const D = 0.03;
  const R = 0.05;
  const peak = 1.0;

  amp.gain.linearRampToValueAtTime(peak, when + A);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.25), when + A + D);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + A + D + R);

  osc.connect(amp);
  amp.connect(synthGain);

  osc.start(when);
  osc.stop(when + A + D + R + 0.02);

  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

// ============================================================
// CHORD TONES: F7 / F11 / F13 (MIDI notes around 4th octave)
// ============================================================
const chordTones = {
  F7: [53, 57, 60, 63],
  F11: [53, 58, 60, 63, 67],
  F13: [53, 57, 60, 63, 67, 74],
};
const chordNames = ["F7", "F11", "F13"];

let lastPopSoundTime = 0;

function playPopArp() {
  if (!audioCtx || !synthGain) return;

  const now = audioCtx.currentTime;
  if (now - lastPopSoundTime < 0.02) return;
  lastPopSoundTime = now;

  const chord = chordNames[(Math.random() * chordNames.length) | 0];
  const tones = chordTones[chord];

  const n = 1 + ((Math.random() * 3) | 0);
  const step = 0.03 + Math.random() * 0.03;

  for (let i = 0; i < n; i++) {
    const midi = tones[(Math.random() * tones.length) | 0];
    const octaveShift = Math.random() < 0.25 ? 12 : 0;
    triggerPluck(midiToHz(midi + octaveShift), now + i * step);
  }
}

// ============================================================
// Pop FX
// ============================================================
class PopFX {
  constructor(sprite) {
    this.sprite = sprite;
    this.age = 0;
    this.life = 0.12;
    this.baseScale = 1.0;
    this.alive = false;
  }

  reset(pos, baseScale) {
    this.sprite.position.copy(pos);
    this.age = 0;
    this.life = 0.12 + Math.random() * 0.06;
    this.baseScale = baseScale;
    this.alive = true;

    this.sprite.visible = true;
    this.sprite.material.opacity = 1.0;
    this.sprite.scale.setScalar(baseScale);
  }

  kill() {
    this.alive = false;
    this.sprite.visible = false;
  }

  update(dt) {
    if (!this.alive) return;

    this.age += dt;
    const t = Math.min(1, this.age / this.life);

    this.sprite.scale.setScalar(this.baseScale * (1.0 + 0.55 * t));
    this.sprite.material.opacity = 1.0 - t;

    if (t >= 1) this.kill();
  }
}

function makeRingTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const c = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.33;

  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(c, c, rInner, c, c, rOuter);
  grad.addColorStop(0.0, "rgba(255,255,255,0.0)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.85, "rgba(255,255,255,0.2)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.0)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================
// Params
// ============================================================
const params = {
  microWindStrength: 0.35,
  microWindSmooth: 0.92,
  microWindUp: 0.15,

  fftSize: 2048,
  analyserSmoothing: 0.85,

  aDb: -35,
  bDb: -20,
  dbOffMargin: 5,

  gentle: {
    startRadius: 0.04,
    maxRadius: 0.22,
    growRateMin: 0.05,
    growRateMax: 0.15,
    releaseSpeed: 0.9,
    releaseUp: 0.35,
  },

  strong: {
    maxDb: -12,
    spawnRateMin: 10,
    spawnRateMax: 80,
    radiusMin: 0.05,
    radiusMax: 0.15,
    speedMin: 1.0,
    speedMax: 5.0,
    lifeMin: 2.5,
    lifeMax: 5.0,
    jitter: 0.15,
  },

  maxBubbles: 600,

  gravity: new THREE.Vector3(0, -0.25, 0),
  buoyancy: 0.55,
  airDrag: 0.985,
  windForwardBoost: 1.6,
  jitter: 0.25,

  moveSpeed: 6.5,
  sprintMultiplier: 1.65,
  mouseSensitivity: 1.0,

  wand: {
    equipKey: "b",
    reloadKey: "r",
    equipTime: 0.45,
    reloadTime: 0.95,
    ammoMax: 40,

    // 카메라 로컬 좌표계 기준(첫인칭)
    poseStowedPos: new THREE.Vector3(0.42, -0.42, -0.20),
    poseStowedRot: new THREE.Euler(-0.35, 0.95, 0.18),
    poseReadyPos: new THREE.Vector3(0.00, -0.90, -1.0),
    poseReadyRot: new THREE.Euler(0.00, 0.00, 0.00),
  },
};

// ============================================================
// 1) 유틸
// ============================================================
function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// 지수이동평균(EMA)
class EMA {
  constructor(alpha = 0.2, initial = 0) {
    this.alpha = alpha;
    this.value = initial;
  }
  update(x) {
    this.value = this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
}

const rmsEMA = new EMA(0.25, 0);

// ============================================================
// 2) 오디오 입력 + RMS 계산
// ============================================================
async function initAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = params.fftSize;
  analyser.smoothingTimeConstant = params.analyserSmoothing;

  source.connect(analyser);
  timeDomain = new Float32Array(analyser.fftSize);

  audioReady = true;
}

function computeRMS() {
  if (!audioReady || !analyser) return 0;

  analyser.getFloatTimeDomainData(timeDomain);

  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const v = timeDomain[i];
    sum += v * v;
  }
  return rmsEMA.update(Math.sqrt(sum / timeDomain.length));
}

function rmsToDbFS(rms) {
  const eps = 1e-8;
  return 20 * Math.log10(Math.max(eps, rms));
}

// ============================================================
// 3) 씬 / 렌더러 / 조명 / 환경맵
// ============================================================
function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);
  camera.position.set(0, 1.6, 5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 1);
  renderer.sortObjects = true;
  renderer.physicallyCorrectLights = true; // (버전에 따라 useLegacyLights로 교체 필요)

  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.55);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 3);
  scene.add(dir);

  controls = new PointerLockControls(camera, renderer.domElement);
  controls.pointerSpeed = params.mouseSensitivity;

  window.addEventListener("resize", onResize);

pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();

loadEnvironmentHDR(ENV_URLS[0]);     // 기본 1번
setupEnvmapHotkeys();               // ✅ 1~4 토글
}


function applyEnvMap(envTex) {
  // 기존 envTex 해제: 캐시를 쓰는 구조라면 dispose하면 안 됨.
  // 따라서 "currentEnvTex가 캐시에 없는 경우"만 dispose하거나,
  // 더 간단히: 캐시를 영구 유지(4개면 부담 적음)하고 dispose하지 않는다.

  currentEnvTex = envTex;
  scene.environment = envTex;
  scene.background = envTex;
}

function setupEnvmapHotkeys() {
  window.addEventListener("keydown", (e) => {
    // IME/한글 입력 등 특수 케이스 방지
    if (e.repeat) return;

    const k = e.key;
    if (k === "1" || k === "2" || k === "3" || k === "4" || k === "5" || k === "6") {
      const idx = Number(k) - 1;
      const url = ENV_URLS[idx];
      if (url) loadEnvironmentHDR(url);
    }
  });
}

window.addEventListener("beforeunload", () => {
  if (pmremGen) pmremGen.dispose();
  // 캐시된 envTex들 해제 (원하면)
  for (const tex of envCache.values()) tex.dispose();
  envCache.clear();
});



function loadEnvironmentHDR(url) {
  if (!renderer) return;
  if (!pmremGen) {
    pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();
  }

  // 중복 로딩 방지
  if (isEnvLoading) return;
  isEnvLoading = true;

  // 캐시 있으면 즉시 적용
  if (envCache.has(url)) {
    applyEnvMap(envCache.get(url));
    isEnvLoading = false;
    return;
  }

  new RGBELoader()
    .setDataType(THREE.HalfFloatType)
    .load(
      url,
      (hdrTex) => {
        const envTex = pmremGen.fromEquirectangular(hdrTex).texture;

        hdrTex.dispose();

        envCache.set(url, envTex);
        applyEnvMap(envTex);

        isEnvLoading = false;
      },
      undefined,
      (err) => {
        console.warn("HDR envmap load failed:", url, err);
        isEnvLoading = false;

        // 실패 시 fallback
        scene.background = new THREE.Color(0x05060a);
        scene.environment = null;
      }
    );
}


function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// 3.5) 비눗방울대(Equip/Reload) + HUD
// ============================================================
function setWandPose(pos, rot) {
  if (!wandGroup) return;
  wandGroup.position.copy(pos);
  wandGroup.rotation.set(rot.x, rot.y, rot.z);
}

function initWandModel() {
  wandGroup = new THREE.Group();
  fallbackMouth = new THREE.Object3D();
  fallbackMouth.name = "FallbackMouth";
  fallbackMouth.position.set(0.0, -0.02, -0.25); // 카메라 앞쪽(보이는 위치)
  wandGroup.add(fallbackMouth);

  // 기본은 무조건 fallback을 emitPoint로
  wandMouth = fallbackMouth;

  wandGroup.visible = false;

  // ✅ 로딩 전에도 버블 시스템이 끊기지 않게 placeholder mouth
  wandMouth = new THREE.Object3D();
  wandMouth.name = "__mouth_placeholder__";
  // 예전 wandRing 앞쪽 느낌의 대충 위치(나중에 GLB Mouth로 교체됨)
  wandMouth.position.set(0.0, -0.02, -0.18);
  wandGroup.add(wandMouth);

  camera.add(wandGroup);
  
  // 초기 상태
  wandState = "stowed";
  wandAnimT = 0;
  wandReloadT = 0;
  wandAmmo = params.wand.ammoMax;
  setWandPose(params.wand.poseStowedPos, params.wand.poseStowedRot);

  const loader = new GLTFLoader();
  loader.load(
    "./assets/bubblewand.glb",
    (gltf) => {
  const model = gltf.scene;

  // 안전하게 리셋
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);

  model.updateMatrixWorld(true);

  // 1) 현재 크기 측정
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  // 2) 스케일 먼저!
  const target = 0.01;
  const s = THREE.MathUtils.clamp(target / maxDim, 0.02, 50);
  model.scale.setScalar(s);

  model.updateMatrixWorld(true);

  // 3) 스케일 후 중심 다시 구해서 원점으로 당기기
  box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);

  // 4) 카메라 앞쪽으로 살짝 밀기(near plane/카메라 뒤 방지)
  model.position.z -= 0.15;

  // (디버그) 축 보이게 — 나중에 지워도 됨
  // model.add(new THREE.AxesHelper(0.2));

  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.material) {
        o.material.side = THREE.DoubleSide;
        o.material.needsUpdate = true;
      }
    }
  });

  wandGroup.add(model);

  // Mouth 찾기
  const mouthNode =
    model.getObjectByName("Mouth") ||
    model.getObjectByName("mouth") ||
    model.getObjectByName("MOUTH");

  if (mouthNode) {
    wandMouth = mouthNode;
    emitPoint = wandMouth;
  } else {
    console.warn('[Wand] Mouth node not found. Using placeholder.');
    emitPoint = wandMouth; // placeholder 유지
  }
}

  );
}



function consumeWandAmmo(n = 1) {
  wandAmmo = Math.max(0, wandAmmo - n);
}

function startWandReload() {
  if (wandState !== "ready") return;
  if (wandAmmo >= params.wand.ammoMax) return;

  wandState = "reloading";
  wandReloadT = 0;

  // 살짝 효과음(가능할 때만)
  if (audioCtx && synthGain) {
    triggerPluck(midiToHz(48), audioCtx.currentTime);
    triggerPluck(midiToHz(55), audioCtx.currentTime + 0.03);
  }
}

function updateWand(dt) {
  if (!wandGroup) return;

  const equipKey = params.wand.equipKey;
  const reloadKey = params.wand.reloadKey;

  // 포즈 캐싱
  const stowedPos = params.wand.poseStowedPos;
  const stowedRot = params.wand.poseStowedRot;
  const readyPos = params.wand.poseReadyPos;
  const readyRot = params.wand.poseReadyRot;

  if (wandState === "equipping") {
    wandAnimT = Math.min(1, wandAnimT + dt / params.wand.equipTime);
    const t = smoothstep(0, 1, wandAnimT);

    _wandPos.copy(stowedPos).lerp(readyPos, t);
    _wandEuler.set(
      THREE.MathUtils.lerp(stowedRot.x, readyRot.x, t),
      THREE.MathUtils.lerp(stowedRot.y, readyRot.y, t),
      THREE.MathUtils.lerp(stowedRot.z, readyRot.z, t)
    );
    setWandPose(_wandPos, _wandEuler);

    if (wandAnimT >= 1) {
      wandState = "ready";
      setWandPose(readyPos, readyRot);
    }
    return;
  }

  if (wandState === "stowing") {
    // (stowTime이 없으면 equipTime의 0.8로)
    const stowTime = params.wand.stowTime ?? params.wand.equipTime * 0.8;
    wandAnimT = Math.min(1, wandAnimT + dt / stowTime);
    const t = smoothstep(0, 1, wandAnimT);

    _wandPos.copy(readyPos).lerp(stowedPos, t);
    _wandEuler.set(
      THREE.MathUtils.lerp(readyRot.x, stowedRot.x, t),
      THREE.MathUtils.lerp(readyRot.y, stowedRot.y, t),
      THREE.MathUtils.lerp(readyRot.z, stowedRot.z, t)
    );
    setWandPose(_wandPos, _wandEuler);

    if (wandAnimT >= 1) {
      wandState = "stowed";
      wandGroup.visible = false;
      setWandPose(stowedPos, stowedRot);
    }
    return;
  }

  if (wandState === "reloading") {
    wandReloadT = Math.min(1, wandReloadT + dt / params.wand.reloadTime);
    const t = smoothstep(0, 1, wandReloadT);

    // ready 포즈 기반으로 살짝 내려갔다가 다시 올라오는 모션
    const dip = Math.sin(t * Math.PI);
    _wandPos.copy(readyPos);
    _wandPos.y += -0.12 * dip;
    _wandPos.z += 0.06 * dip;

    _wandEuler.set(readyRot.x + 0.25 * dip, readyRot.y - 0.15 * dip, readyRot.z);
    setWandPose(_wandPos, _wandEuler);

    if (wandReloadT >= 1) {
      wandAmmo = params.wand.ammoMax;
      wandState = "ready";
      setWandPose(readyPos, readyRot);
    }
    return;
  }

  // stowed/ready는 포즈 고정
  if (wandState === "stowed") {
    setWandPose(stowedPos, stowedRot);
  } else if (wandState === "ready") {
    setWandPose(readyPos, readyRot);
  }
}

function createHUD() {
  hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.left = "14px";
  hud.style.top = "14px";
  hud.style.padding = "10px 12px";
  hud.style.borderRadius = "12px";
  hud.style.background = "rgba(0,0,0,0.45)";
  hud.style.color = "#fff";
  hud.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  hud.style.fontSize = "12px";
  hud.style.lineHeight = "1.35";
  hud.style.pointerEvents = "none";
  hud.style.userSelect = "none";
  hud.style.zIndex = "900";
  hud.style.backdropFilter = "blur(6px)";
  document.body.appendChild(hud);
}

function updateHUD(db) {
  if (!hud) return;

  const ek = params.wand.equipKey.toUpperCase();
  const rk = params.wand.reloadKey.toUpperCase();
  const max = params.wand.ammoMax;

  let stateLine = "";
  if (wandState === "stowed") stateLine = `비눗방울대: OFF  [${ek}] 들기`;
  else if (wandState === "equipping") stateLine = "비눗방울대: 들기...";
  else if (wandState === "stowing") stateLine = "비눗방울대: 내리기...";
  else if (wandState === "reloading") stateLine = `장전 중... (${Math.round((1 - wandReloadT) * 100)}%)`;
  else if (wandState === "ready") {
    if (wandAmmo <= 0) stateLine = `비눗방울액 없음  [${rk}] 장전`;
    else stateLine = `비눗방울대: READY  탄창 ${wandAmmo}/${max}  [${rk}] 장전`;
  }

  const dbText = Number.isFinite(db) ? db.toFixed(1) : "-";

  hud.innerHTML = `
    <div style="font-weight:700; margin-bottom:4px;">Bubble Wand</div>
    <div>${stateLine}</div>
    <div style="opacity:0.85; margin-top:4px;">현재 버블: ${bubbleActive.length}</div>
    <div style="opacity:0.9; margin-top:4px;">입력 음량: ${dbText} dBFS</div>
    <div style="opacity:0.75; margin-top:6px; font-size:11px;">
      1~6: 환경맵 변경 / ESC: 포인터락 해제
    </div>
  `;
}

function setupWandHotkeys() {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    // 포인터락이 풀려있는 상태(overlay 보이는 상태)에선 무시
    if (overlay && overlay.style.display !== "none") return;

    const k = (e.key || "").toLowerCase();

    if (k === params.wand.equipKey) {
      if (!wandGroup) return;
      if (wandState === "stowed") {
        wandGroup.visible = true;
        wandState = "equipping";
        wandAnimT = 0;
      } else if (wandState === "ready") {
        wandState = "stowing";
        wandAnimT = 0;
      }
      return;
    }

    if (k === params.wand.reloadKey) {
      startWandReload();
      return;
    }
  });
}

// ============================================================
// 4) 버블 시스템 (풀링 + 업데이트)
// ============================================================

const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();

class Bubble {
  constructor(mesh) {
    this.mesh = mesh;
    this.vel = new THREE.Vector3();
    this.radius = 0.08;
    this.age = 0;
    this.life = 4.0;
    this.growWhileBlowing = false;
    this.alive = false;
    this.anchored = false;
    this.wind = new THREE.Vector3();
  }

  reset(position, velocity, radius, life, growWhileBlowing) {
    this.anchored = false;
    this.wind.set(0, 0, 0);

    this.mesh.position.copy(position);
    this.vel.copy(velocity);

    this.radius = radius;
    this.age = 0;
    this.life = life;
    this.growWhileBlowing = growWhileBlowing;
    this.alive = true;

    this.mesh.scale.setScalar(radius);
    this.mesh.visible = true;
  }

  kill() {
    this.alive = false;
    this.mesh.visible = false;
  }

  update(dt, isBlowingNow) {
    if (!this.alive) return;

    if (this.anchored) {
      return;
    }

    // 미세 바람 - Random Walk + Smooth
    const w = params.microWindStrength;

    this.wind.multiplyScalar(Math.pow(params.microWindSmooth, dt * 60));
    this.wind.x += (Math.random() * 2 - 1) * w * dt;
    this.wind.z += (Math.random() * 2 - 1) * w * dt;
    this.wind.y += (Math.random() * 2 - 1) * w * params.microWindUp * dt;

    const maxWind = w * 0.8;
    this.wind.x = THREE.MathUtils.clamp(this.wind.x, -maxWind, maxWind);
    this.wind.y = THREE.MathUtils.clamp(this.wind.y, -maxWind, maxWind);
    this.wind.z = THREE.MathUtils.clamp(this.wind.z, -maxWind, maxWind);

    this.vel.addScaledVector(this.wind, 1.0);

    this.age += dt;

    // 물리 업데이트
    this.vel.addScaledVector(params.gravity, dt);
    this.vel.y += params.buoyancy * dt;
    this.vel.multiplyScalar(Math.pow(params.airDrag, dt * 60));
    this.mesh.position.addScaledVector(this.vel, dt);

    if (this.growWhileBlowing && isBlowingNow) {
      this.radius += 0.18 * dt;
      this.mesh.scale.setScalar(this.radius);
    }

    // 랜덤 팝
    const arming = this.life * 0.30;
    if (this.age >= arming) {
      const intensity = (this.age - arming) / (this.life - arming);
      const hazardPerSec = lerp(0.4, 4.0, intensity);
      if (Math.random() < hazardPerSec * dt) {
        this.popNow();
        return;
      }
    }

    if (this.age > this.life) {
      this.popNow();
    }
  }

  popNow() {
    if (!this.alive) return;

    const fx = getPopFX();
    if (fx) {
      fx.reset(this.mesh.position, this.radius * 6.0);
    }

    playPopArp();
    this.kill();
  }
}

let bubblePool = [];
let bubbleActive = [];

let emitPoint;
let bubbleMaterial;

function initBubbles() {
  // 공유 geometry/material (clone 남발 제거)
  const geo = new THREE.SphereGeometry(1, 24, 24);

  bubbleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.02,
    metalness: 0.0,
    transmission: 1.0,
    transparent: true,

    envMapIntensity: 2.0,

    opacity: 0.8,
    depthWrite: false,
    depthTest: true,

    thickness: 0.1,
    ior: 1.33,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,

    iridescence: 1.0,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400],
  });

  for (let i = 0; i < params.maxBubbles; i++) {
    const mesh = new THREE.Mesh(geo, bubbleMaterial);
    mesh.visible = false;
    mesh.renderOrder = 10;
    scene.add(mesh);

    bubblePool.push(new Bubble(mesh));
  }

  // 비눗방울대(1인칭 소품) + emit point(링 앞)
  initWandModel();
  emitPoint = wandMouth;
  scene.add(camera);

  // Pop FX pool
  popTexture = makeRingTexture(128);

  const popMatTemplate = new THREE.SpriteMaterial({
    map: popTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    depthTest: true,
  });

  const POP_MAX = 300;
  for (let i = 0; i < POP_MAX; i++) {
    // SpriteMaterial은 opacity가 개별로 움직이므로 clone 유지
    const spr = new THREE.Sprite(popMatTemplate.clone());
    spr.visible = false;
    scene.add(spr);
    popPool.push(new PopFX(spr));
  }
}

function getBubbleFromPool() {
  if (bubblePool.length === 0) return null;
  const b = bubblePool.pop();
  bubbleActive.push(b);
  return b;
}

function recycleDeadBubbles() {
  for (let i = bubbleActive.length - 1; i >= 0; i--) {
    const b = bubbleActive[i];
    if (!b.alive) {
      bubbleActive.splice(i, 1);
      bubblePool.push(b);
    }
  }
}

function getPopFX() {
  if (popPool.length === 0) return null;
  const fx = popPool.pop();
  popActive.push(fx);
  return fx;
}

function recycleDeadPopFX() {
  for (let i = popActive.length - 1; i >= 0; i--) {
    const fx = popActive[i];
    if (!fx.alive) {
      popActive.splice(i, 1);
      popPool.push(fx);
    }
  }
}

// ============================================================
// 5) dB → 버블 방출
// ============================================================
let growingBubble = null;
let strongSpawnAcc = 0;
let mode = "idle"; // "idle" | "gentle" | "strong"

function updateGentle(db, dt) {
  const t = smoothstep(params.aDb, params.bDb, db);

  if (!growingBubble) {
    if (wandAmmo <= 0) return;
    const b = getBubbleFromPool();
    if (!b) return;

    emitPoint.getWorldPosition(_tmpPos);
    b.reset(_tmpPos, _tmpDir.set(0, 0, 0), params.gentle.startRadius, 5.0, false);

    b.anchored = true;
    growingBubble = b;
  }

  emitPoint.getWorldPosition(_tmpPos);
  growingBubble.mesh.position.copy(_tmpPos);

  const growRate = lerp(params.gentle.growRateMin, params.gentle.growRateMax, t);
  growingBubble.radius = Math.min(params.gentle.maxRadius, growingBubble.radius + growRate * dt);
  growingBubble.mesh.scale.setScalar(growingBubble.radius);
}

function updateStrong(db, dt) {
  const s = params.strong;
  const t = smoothstep(params.bDb, s.maxDb, db);

  const spawnRate = lerp(s.spawnRateMin, s.spawnRateMax, t);
  const radius = lerp(s.radiusMax, s.radiusMin, t);
  const speed = lerp(s.speedMin, s.speedMax, t);
  const life = lerp(s.lifeMax, s.lifeMin, t);

  strongSpawnAcc += spawnRate * dt;

  const maxPerFrame = 20;
  let spawned = 0;

  while (strongSpawnAcc >= 1.0 && spawned < maxPerFrame) {
    if (wandAmmo <= 0) break;
    strongSpawnAcc -= 1.0;
    spawned++;

    const b = getBubbleFromPool();
    if (!b) return;

    emitPoint.getWorldPosition(_tmpPos);
    camera.getWorldDirection(_tmpDir);

    const j = s.jitter * (0.35 + 0.65 * t);
    _tmpDir.x += (Math.random() * 2 - 1) * j;
    _tmpDir.y += (Math.random() * 2 - 1) * j * 0.6;
    _tmpDir.z += (Math.random() * 2 - 1) * j;
    _tmpDir.normalize();

    const vel = b.vel; // 재사용
    vel.copy(_tmpDir).multiplyScalar(speed * params.windForwardBoost);
    vel.y += lerp(0.2, 1.0, t);

    _tmpPos.x += (Math.random() * 2 - 1) * 0.03;
    _tmpPos.y += (Math.random() * 2 - 1) * 0.03;
    _tmpPos.z += (Math.random() * 2 - 1) * 0.03;

    b.reset(_tmpPos, vel, radius, life, false);

    consumeWandAmmo(1);
  }
}

function updateBubbleEmissionByDb(db, dt) {
  const offDb = params.aDb - params.dbOffMargin;

  const strongOn = db > params.bDb;
  const gentleOn = db >= params.aDb && db <= params.bDb;

  let nextMode = "idle";
  if (strongOn) nextMode = "strong";
  else if (gentleOn) nextMode = "gentle";
  else if (db <= offDb) nextMode = "idle";
  else nextMode = mode; // 히스테리시스

  if (nextMode !== mode) {
    if (mode === "gentle" && growingBubble) {
      camera.getWorldDirection(_tmpDir).normalize();

      growingBubble.anchored = false;
      growingBubble.vel.copy(_tmpDir).multiplyScalar(params.gentle.releaseSpeed);
      growingBubble.vel.y += params.gentle.releaseUp;

      // "한 번 불기"가 끝나는 시점에 탄창 소모
      consumeWandAmmo(1);

      growingBubble = null;
    }

    if (nextMode === "strong") {
      strongSpawnAcc = 0;
    }

    mode = nextMode;
  }

  if (mode === "gentle") {
    updateGentle(db, dt);
  } else if (mode === "strong") {
    if (growingBubble) {
      camera.getWorldDirection(_tmpDir).normalize();
      growingBubble.anchored = false;
      growingBubble.vel.copy(_tmpDir).multiplyScalar(params.gentle.releaseSpeed);
      growingBubble.vel.y += params.gentle.releaseUp;
      growingBubble = null;
    }
    updateStrong(db, dt);
  }
}

// ============================================================
// 7) UI(오버레이) + 시작 트리거
// ============================================================
function createOverlay() {
  overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.color = "#fff";
  overlay.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  overlay.style.textAlign = "center";
  overlay.style.padding = "24px";
  overlay.style.cursor = "pointer";
  overlay.style.userSelect = "none";
  overlay.style.zIndex = "1000";
  overlay.innerHTML = `
    <div style="max-width:720px; line-height:1.4;">
      <div style="font-size:20px; font-weight:700; margin-bottom:10px;">Click to Start</div>
      <div style="opacity:0.9; font-size:14px;">
        마이크 권한 + <b>[B]</b>로 비눗방울대를 들어야 비눗방울이 생성됩니다.<br/>
        몇 번 불면 탄창이 소모되며, <b>[R]</b>로 장전(리로드)할 수 있습니다.<br/>
        1 ~ 6 번: 환경맵 변경 / 마우스: 시점 / ESC: 포인터락 해제
      </div>
      <div style="margin-top:16px; font-size:12px; opacity:0.7;">
        오디오 입력은 브라우저 정책상 사용자 클릭 후에만 시작됩니다.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", async () => {
    try {
      if (!audioReady) await initAudio();
      if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      if (!synthGain) initSynth();

      controls.lock();
      overlay.style.display = "none";
    } catch (err) {
      console.error(err);
      overlay.innerHTML = `
        <div style="max-width:720px; line-height:1.4;">
          <div style="font-size:18px; font-weight:700; margin-bottom:10px;">마이크 초기화 실패</div>
          <div style="opacity:0.9; font-size:14px;">
            브라우저 설정에서 마이크 권한을 허용했는지 확인하세요.<br/>
            콘솔 에러 로그를 확인하면 원인을 파악할 수 있습니다.
          </div>
          <div style="margin-top:16px; font-size:12px; opacity:0.7;">(다시 클릭하여 재시도)</div>
        </div>
      `;
    }
  });

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked) overlay.style.display = "flex";
  });
}

// ============================================================
// 8) 루프
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);

  const rms = computeRMS();
  const db = rmsToDbFS(rms);

  updateWand(dt);
  updateHUD(db);

  const canBlow = wandState === "ready" && wandAmmo > 0;
  if (canBlow) {
    updateBubbleEmissionByDb(db, dt);
  } else {
    // 비눗방울대가 들려있지 않거나(또는 장전 필요) -> 생성 중지
    if (growingBubble) {
      growingBubble.kill();
      growingBubble = null;
    }
    mode = "idle";
    strongSpawnAcc = 0;
  }

  // 버블 업데이트 (기존 기능 유지: isBlowingNow 파라미터는 미사용 상태)
  for (let i = 0; i < bubbleActive.length; i++) {
    bubbleActive[i].update(dt);
  }
  recycleDeadBubbles();

  for (let i = 0; i < popActive.length; i++) {
    popActive[i].update(dt);
  }
  recycleDeadPopFX();

  renderer.render(scene, camera);
}

// ============================================================
// 9) 엔트리
// ============================================================
initThree();
initBubbles();
createOverlay();
createHUD();
setupWandHotkeys();
animate();
