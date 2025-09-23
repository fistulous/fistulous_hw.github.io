/*-------------------------------------------------------------------------
06_FlipTriangle.js

1) Change the color of the triangle by keyboard input
   : 'r' for red, 'g' for green, 'b' for blue
2) Flip the triangle vertically by keyboard input 'f' 
---------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;   // shader program
let vao;      // vertex array object
let colorTag = "red"; // triangle 초기 color는 red
let verticalFlip = 1.0; // 1.0 for normal, -1.0 for vertical flip
let textOverlay3; // for text output third line (see util.js)

let offsetX = 0.0, offsetY = 0.0;
const STEP = 0.01;
const keysDown = {}; // 현재 눌려 있는 키를 저장

const half = 0.1;            // 변 0.2 → 반변
const LIMIT = 1.0 - half;    // 오프셋의 최대 절대값

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }


function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 600;
    canvas.height = 600;

    resizeAspectRatio(gl, canvas);

    // Initialize WebGL settings
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.2, 0.3, 1.0);
    
    return true;
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

function setupKeyboardEvents() {
    document.addEventListener('keydown', (event) => {
        if (event.key == 'f') {
            //console.log("f key pressed");
            updateText(textOverlay3, "f key pressed");
            verticalFlip = -verticalFlip; 
        }
        else if (event.key == 'r') {
            //console.log("r key pressed");
            updateText(textOverlay3, "r key pressed");
            colorTag = "red";
        }
        else if (event.key == 'g') {
            //console.log("g key pressed");
            updateText(textOverlay3, "g key pressed");
            colorTag = "green";
        }
        else if (event.key == 'b') {
            //console.log("b key pressed");
            updateText(textOverlay3, "b key pressed");
            colorTag = "blue";
        }
    });
}

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    keysDown[event.key] = true;
    event.preventDefault(); // 스크롤 방지
  }
});

window.addEventListener('keyup', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    keysDown[event.key] = false;
    event.preventDefault();
  }
});


function setupBuffers() {
  // 변 0.2 => 반변 0.1이므로, (-0.1~0.1) 범위의 정사각형
  
  const vertices = new Float32Array([
    -half, -half, 0.0,  // bottom-left
     half, -half, 0.0,  // bottom-right
     half,  half, 0.0,  // top-right
    -half,  half, 0.0,  // top-left
  ]);

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  shader.setAttribPointer('aPos', 3, gl.FLOAT, false, 0, 0);
}


function render() {
  // 이동 처리
  if (keysDown['ArrowUp']) offsetY += STEP;
  if (keysDown['ArrowDown']) offsetY -= STEP;
  if (keysDown['ArrowLeft']) offsetX -= STEP;
  if (keysDown['ArrowRight']) offsetX += STEP;
  
  offsetX = clamp(offsetX, -LIMIT, LIMIT);
  offsetY = clamp(offsetY, -LIMIT, LIMIT);
  // 좌표 출력 (옵션)
  updateText(textOverlay3, `offset: (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})`);

  // WebGL 그리기
  gl.clear(gl.COLOR_BUFFER_BIT);

  let color = [1, 0, 0, 1];
  if (colorTag === "green") color = [0, 1, 0, 1];
  else if (colorTag === "blue") color = [0, 0, 1, 1];

  shader.setVec4("uColor", color);
  shader.setFloat("verticalFlip", verticalFlip);
  shader.setVec2("uOffset", [offsetX, offsetY]); // ← 셰이더 uniform에 전달

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

  requestAnimationFrame(render);
}

let textOverlay0;

async function main() {
    try {

        // WebGL 초기화
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        // 셰이더 초기화
        await initShader();

        // setup text overlay (see util.js)
        //textOverlay0 = setupText(canvas, "Use arrow keys to move the rectangle", 0);

        //setupText(canvas, "r, g, b: change color", 1);
        //setupText(canvas, "f: flip vertically", 2);
        textOverlay0 = setupText(canvas, "Use arrow keys to move the rectangle", 1);

        // 키보드 이벤트 설정
        setupKeyboardEvents();
        
        // 나머지 초기화
        setupBuffers(shader);
        shader.use();
        
        // 렌더링 시작
        render();

        return true;

    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}

// call main function
main().then(success => {
    if (!success) {
        console.log('프로그램을 종료합니다.');
        return;
    }
}).catch(error => {
    console.error('프로그램 실행 중 오류 발생:', error);
});
