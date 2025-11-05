/*--------------------------------------------------------------------------------
ConeWithLighting.js

- Lighting a cone model with Phong / Gouraud shading
- Arcball control for CAMERA / MODEL mode
- Keyboard:
  'a' toggle arcball mode
  'r' reset arcball
  's' smooth shading (vertex normals)
  'f' flat shading   (face normals)
  'p' PHONG shading
  'g' GOURAUD shading
----------------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';
import { Arcball } from '../util/arcball.js';
import { Cube } from '../util/cube.js';
import { Cone } from '../util/cone.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');

let shader;         // cone rendering shader (phong/gouraud)
let lampShader;     // lamp shader
let isInitialized = false;

let textOverlay2;   // arcball mode
let textOverlay3;   // shading+rendering mode

let viewMatrix = mat4.create();
let projMatrix = mat4.create();
let modelMatrix = mat4.create();
let lampModelMatrix = mat4.create();

let arcBallMode   = 'CAMERA';   // 'CAMERA' | 'MODEL'
let shadingMode   = 'FLAT';     // 'FLAT'   | 'SMOOTH'
let renderingMode = 'PHONG';    // 'PHONG'  | 'GOURAUD'

const cone = new Cone(gl, 32);   // 과제 가이드: 세그먼트 32
const lamp = new Cube(gl);

const cameraPos = vec3.fromValues(0, 0, 3);
const lightPos  = vec3.fromValues(1.0, 0.7, 1.0);
const lightSize = vec3.fromValues(0.1, 0.1, 0.1);

// Arcball: distance 5.0, rotation 2.0, zoom 0.0005
const arcball = new Arcball(canvas, 5.0, { rotation: 2.0, zoom: 0.0005 });

document.addEventListener('DOMContentLoaded', () => {
  if (isInitialized) return;
  main().then(success => { if (success) isInitialized = true; })
        .catch(err => console.error(err));
});

function initWebGL() {
  if (!gl) {
    console.error('WebGL2 is not supported.');
    return false;
  }
  canvas.width = 700;
  canvas.height = 700;
  resizeAspectRatio(gl, canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.enable(gl.DEPTH_TEST);
  return true;
}

// 렌더러 모드에 따라 다른 셰이더 파일을 읽어옴
async function initShader() {
  const vertFile = (renderingMode === 'PHONG') ? 'shVert.glsl'   : 'GshVert.glsl';
  const fragFile = (renderingMode === 'PHONG') ? 'shFrag.glsl'   : 'GshFrag.glsl';
  const vsrc = await readShaderFile(vertFile);
  const fsrc = await readShaderFile(fragFile);
  shader = new Shader(gl, vsrc, fsrc);
}

// 램프 셰이더는 고정
async function initLampShader() {
  const vsrc = await readShaderFile('shLampVert.glsl');
  const fsrc = await readShaderFile('shLampFrag.glsl');
  lampShader = new Shader(gl, vsrc, fsrc);
}

// 셰이더가 새로 만들어질 때마다 호출해 공통 유니폼 재설정
function applyCommonUniforms() {
  shader.use();
  shader.setMat4('u_projection', projMatrix);

  // 재질
  shader.setVec3('material.diffuse',  vec3.fromValues(1.0, 0.5, 0.31));
  shader.setVec3('material.specular', vec3.fromValues(0.5, 0.5, 0.5));
  shader.setFloat('material.shininess', 32);

  // 광원
  shader.setVec3('light.position', lightPos);
  shader.setVec3('light.ambient',  vec3.fromValues(0.2, 0.2, 0.2));
  shader.setVec3('light.diffuse',  vec3.fromValues(0.7, 0.7, 0.7));
  shader.setVec3('light.specular', vec3.fromValues(1.0, 1.0, 1.0));

  // 카메라
  shader.setVec3('u_viewPos', cameraPos);
}

function setupKeyboardEvents() {
  document.addEventListener('keydown', async (event) => {   // ← async로 전환
    switch (event.key) {
      case 'a':
        arcBallMode = (arcBallMode === 'CAMERA') ? 'MODEL' : 'CAMERA';
        updateText(textOverlay2, 'arcball mode: ' + arcBallMode);
        break;

      case 'r':
        arcball.reset();
        modelMatrix = mat4.create();
        arcBallMode = 'CAMERA';
        updateText(textOverlay2, 'arcball mode: ' + arcBallMode);
        break;

      case 's':
        if (typeof cone.copyVertexNormalsToNormals === 'function') {
          cone.copyVertexNormalsToNormals();
          cone.updateNormals();
        }
        shadingMode = 'SMOOTH';
        updateText(textOverlay3, `shading mode: ${shadingMode} (${renderingMode})`);
        break;

      case 'f':
        if (typeof cone.copyFaceNormalsToNormals === 'function') {
          cone.copyFaceNormalsToNormals();
          cone.updateNormals();
        }
        shadingMode = 'FLAT';
        updateText(textOverlay3, `shading mode: ${shadingMode} (${renderingMode})`);
        break;

      case 'p':
        renderingMode = 'PHONG';
        await initShader();        // 이제 await 사용 가능
        applyCommonUniforms();
        updateText(textOverlay3, `shading mode: ${shadingMode} (${renderingMode})`);
        break;

      case 'g':
        renderingMode = 'GOURAUD';
        await initShader();
        applyCommonUniforms();
        updateText(textOverlay3, `shading mode: ${shadingMode} (${renderingMode})`);
        break;
    }
  });
}

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (arcBallMode === 'CAMERA') {
    viewMatrix = arcball.getViewMatrix();
  } else {
    modelMatrix = arcball.getModelRotMatrix();
    viewMatrix  = arcball.getViewCamDistanceMatrix();
  }

  // cone
  shader.use();
  shader.setMat4('u_model', modelMatrix);
  shader.setMat4('u_view',  viewMatrix);
  shader.setVec3('u_viewPos', cameraPos);
  cone.draw(shader);

  // lamp
  lampShader.use();
  lampShader.setMat4('u_view', viewMatrix);
  lamp.draw(lampShader);

  requestAnimationFrame(render);
}

async function main() {
  if (!initWebGL()) return false;

  // view / projection (프로그램 전체에서 고정)
  mat4.lookAt(
    viewMatrix,
    cameraPos,
    vec3.fromValues(0, 0, 0),
    vec3.fromValues(0, 1, 0)
  );
  mat4.perspective(
    projMatrix,
    glMatrix.toRadian(60),
    canvas.width / canvas.height,
    0.1,
    100.0
  );

  // 셰이더 생성
  await initShader();
  await initLampShader();
  applyCommonUniforms();

  // 램프(광원 큐브) 모델 행렬
  lampShader.use();
  lampShader.setMat4('u_projection', projMatrix);
  mat4.translate(lampModelMatrix, lampModelMatrix, lightPos);
  mat4.scale(lampModelMatrix, lampModelMatrix, lightSize);
  lampShader.setMat4('u_model', lampModelMatrix);

  // 텍스트 오버레이
  setupText(canvas, 'Cone with Lighting', 1);
  textOverlay2 = setupText(canvas, 'arcball mode: ' + arcBallMode, 2);
  textOverlay3 = setupText(canvas, `shading mode: ${shadingMode} (${renderingMode})`, 3);
  setupText(canvas, "press 'a' to change arcball mode", 4);
  setupText(canvas, "press 'r' to reset arcball", 5);
  setupText(canvas, "press 's' to switch to smooth shading", 6);
  setupText(canvas, "press 'f' to switch to flat shading", 7);
  setupText(canvas, "press 'g' to switch to Gouraud shading", 8);
  setupText(canvas, "press 'p' to switch to Phong shading", 9);

  setupKeyboardEvents();
  requestAnimationFrame(render);
  return true;
}
