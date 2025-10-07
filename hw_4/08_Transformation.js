/*-------------------------------------------------------------------------
08_Transformation.js

canvas의 중심에 한 edge의 길이가 0.3인 정사각형을 그리고, 
이를 크기 변환 (scaling), 회전 (rotation), 이동 (translation) 하는 예제임.
    T는 x, y 방향 모두 +0.5 만큼 translation
    R은 원점을 중심으로 2초당 1회전의 속도로 rotate
    S는 x, y 방향 모두 0.3배로 scale
이라 할 때, 
    keyboard 1은 TRS 순서로 적용
    keyboard 2는 TSR 순서로 적용
    keyboard 3은 RTS 순서로 적용
    keyboard 4는 RST 순서로 적용
    keyboard 5는 STR 순서로 적용
    keyboard 6은 SRT 순서로 적용
    keyboard 7은 원래 위치로 돌아옴
---------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText, Axes } from '../util/util.js';
import { Shader, readShaderFile } from '../util/shader.js';

let isInitialized = false;
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;
let vao;
let vaoBigWing;
let vaoSmallWing1;
let vaoSmallWing2;

let finalTransform;
let rotationAngle = 0; // 지우기
let currentTransformType = null;
let isAnimating = true;
let lastTime = 0;
let textOverlay; 

let bigwingTransform;
let smallwing1Transform;
let smallwing2Transform;
let bigwingAngle = 0;
let smallwingAngle = 0;


document.addEventListener('DOMContentLoaded', () => {
    if (isInitialized) {
        console.log("Already initialized");
        return;
    }

    main().then(success => {
        if (!success) {
            console.log('프로그램을 종료합니다.');
            return;
        }
        isInitialized = true;
        requestAnimationFrame(animate);
    }).catch(error => {
        console.error('프로그램 실행 중 오류 발생:', error);
    });
});

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 700;
    canvas.height = 700;
    resizeAspectRatio(gl, canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.2, 0.3, 0.4, 1.0);
    
    return true;
}

function setupBuffers() {
    const column = new Float32Array([
        -0.10,  0.5,  // 좌상단
        -0.10, -0.5,  // 좌하단
         0.10, -0.5,  // 우하단
         0.10,  0.5   // 우상단
    ]);
    // 가로 0.2 세로 1.0

    const bigWing = new Float32Array([
        -0.30, 0.55,  // 좌상단
        -0.30, 0.45,  // 좌하단
         0.30, 0.45,  // 우하단
         0.30, 0.55   // 우상단
    ])
    // 가로 0.6 세로 0.1 중앙 0.0,0.5

    const smallWing1 = new Float32Array([
        0.24, 0.52,  // 좌상단
        0.24, 0.48,  // 좌하단
        0.36, 0.48,  // 우하단
        0.36, 0.52   // 우상단
    ])
    // 가로 0.12 세로 0.04 중앙 0.3,0.5

    const smallWing2 = new Float32Array([
        -0.24, 0.52,  // 좌상단
        -0.24, 0.48,  // 좌하단
        -0.36, 0.48,  // 우하단
        -0.36, 0.52   // 우상단
    ])
    // 가로 0.12 세로 0.04 중앙 -0.3,0.5

    const indices = new Uint16Array([
        0, 1, 2,    // 첫 번째 삼각형
        0, 2, 3     // 두 번째 삼각형
    ]);

    // ******************************************************** 크기 지정

    const columnColors = new Float32Array([
        0.55,0.35,0.17, 1.0,  // 갈색
        0.55,0.35,0.17, 1.0,
        0.55,0.35,0.17, 1.0,
        0.55,0.35,0.17, 1.0
    ]);


    const bigWingColors = new Float32Array([
        1.0, 1.0, 1.0, 1.0,  // 흰색
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0
    ]);

    const smallWingColors = new Float32Array([
        0.5, 0.5, 0.5, 1.0,  // 회색
        0.5, 0.5, 0.5, 1.0,
        0.5, 0.5, 0.5, 1.0,
        0.5, 0.5, 0.5, 1.0
    ]);

    // ******************************************************** 색상 지정

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

   // VBO for position
    const columnPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, columnPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, column, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // VBO for color
    const columnColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, columnColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, columnColors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);

    // EBO
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // ******************************************************** column buffer 설정

    vaoBigWing = gl.createVertexArray();
    gl.bindVertexArray(vaoBigWing);

    // VBO for position
    const bigWingPosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bigWingPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bigWing, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // VBO for color
    const bigWingColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bigWingColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bigWingColors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);

    // EBO
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // ******************************************************** bigWing buffer 설정

    vaoSmallWing1 = gl.createVertexArray();
    gl.bindVertexArray(vaoSmallWing1);

    // VBO for position
    const smallWing1PosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, smallWing1PosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, smallWing1, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // VBO for color
    const smallWingColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, smallWingColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, smallWingColors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);

    // EBO
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    //smallwing2

    vaoSmallWing2 = gl.createVertexArray();
    gl.bindVertexArray(vaoSmallWing2);

    // VBO for position
    const smallWing2PosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, smallWing2PosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, smallWing2, gl.STATIC_DRAW);
    shader.setAttribPointer("a_position", 2, gl.FLOAT, false, 0, 0);

    // VBO for color
    gl.bindBuffer(gl.ARRAY_BUFFER, smallWingColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, smallWingColors, gl.STATIC_DRAW);
    shader.setAttribPointer("a_color", 4, gl.FLOAT, false, 0, 0);

    // EBO
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    // ******************************************************** smallWing buffer 설정
}

function setupKeyboardEvents() {
    let key;
    document.addEventListener('keydown', (event) => {
        key = event.key;
        switch(key) {
            case '1': currentTransformType = 'TRS'; isAnimating = true; break;
            case '2': currentTransformType = 'TSR'; isAnimating = true; break;
            case '3': currentTransformType = 'RTS'; isAnimating = true; break;
            case '4': currentTransformType = 'RST'; isAnimating = true; break;
            case '5': currentTransformType = 'STR'; isAnimating = true; break;
            case '6': currentTransformType = 'SRT'; isAnimating = true; break;
            case '7':
                currentTransformType = null;
                isAnimating = false;
                rotationAngle = 0;
                finalTransform = mat4.create();
                break;
        }
    });
}

function getTransformMatrices() {
    const T = mat4.create();
    const R = mat4.create();
    const S = mat4.create();
    
    mat4.translate(T, T, [0.5, 0.5, 0]);  // translation by (0.5, 0.5)
    mat4.rotate(R, R, rotationAngle, [0, 0, 1]); // rotation about z-axis
    mat4.scale(S, S, [0.3, 0.3, 1]); // scale by (0.3, 0.3)
    
    return { T, R, S };
}

function applyTransform(type) {
    finalTransform = mat4.create();
    const { T, R, S } = getTransformMatrices();
    
    const transformOrder = {
        'TRS': [T, R, S],
        'TSR': [T, S, R],
        'RTS': [R, T, S],
        'RST': [R, S, T],
        'STR': [S, T, R],
        'SRT': [S, R, T]
    };

    /*
      type은 'TRS', 'TSR', 'RTS', 'RST', 'STR', 'SRT' 중 하나
      array.forEach(...) : 각 type의 element T or R or S 에 대해 반복
    */
    if (transformOrder[type]) {
        transformOrder[type].forEach(matrix => {
            mat4.multiply(finalTransform, matrix, finalTransform);
        });
    }
}

function bigwingRotation(){
    bigwingTransform = mat4.create();
    const gotoOrigin = mat4.create();
    const wingRotate = mat4.create();
    const backtoPos = mat4.create();

    mat4.translate(gotoOrigin, gotoOrigin, [0.0,-0.5,0.0]);
    mat4.rotate(wingRotate, wingRotate, bigwingAngle, [0, 0, 1]);
    mat4.translate(backtoPos, backtoPos, [0.0, 0.5, 0.0]);

    const transformOrder = [gotoOrigin, wingRotate, backtoPos];
    transformOrder.forEach(matrix => {
        mat4.multiply(bigwingTransform, matrix, bigwingTransform);
    });
}

function smallwingRotation(){
    smallwing1Transform = mat4.create();
    smallwing2Transform = mat4.create();

    const gotoOrigin1 = mat4.create();
    const gotoOrigin2 = mat4.create();
    const wingRotate = mat4.create();
    const backtoPos1 = mat4.create();
    const backtoPos2 = mat4.create();

    mat4.translate(gotoOrigin1, gotoOrigin1, [-0.3, -0.5 , 0.0]);
    mat4.translate(gotoOrigin2, gotoOrigin2, [0.3, -0.5, 0.0])
    mat4.rotate(wingRotate, wingRotate, smallwingAngle, [0, 0, 1]);
    mat4.translate(backtoPos1, backtoPos1, [0.3, 0.5, 0.0]);
    mat4.translate(backtoPos2, backtoPos2, [-0.3, 0.5, 0.0]);

    const transformOrder1 = [gotoOrigin1, wingRotate, backtoPos1];
    transformOrder1.forEach(matrix => {
        mat4.multiply(smallwing1Transform, matrix, smallwing1Transform);
    });
    mat4.multiply(smallwing1Transform, bigwingTransform, smallwing1Transform);

    const transformOrder2 = [gotoOrigin2, wingRotate, backtoPos2];
    transformOrder2.forEach(matrix => {
        mat4.multiply(smallwing2Transform, matrix, smallwing2Transform);
    });
    mat4.multiply(smallwing2Transform, bigwingTransform, smallwing2Transform);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    // draw cube
    shader.use();


    shader.setMat4("u_transform", finalTransform);
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    shader.setMat4("u_transform", bigwingTransform);
    gl.bindVertexArray(vaoBigWing);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    shader.setMat4("u_transform", smallwing1Transform);
    gl.bindVertexArray(vaoSmallWing1);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    shader.setMat4("u_transform", smallwing2Transform);
    gl.bindVertexArray(vaoSmallWing2);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    // gl.drawElements(mode, index_count, type, byte_offset);
    // 기둥, 작은날개 2개, 큰날개 1개
}

function animate(currentTime) {
    // elapsedTime은 기존 currentTime과 동일 (currentTime - StartTime)
    console.log(currentTime)
    bigwingAngle = Math.PI * 2.0 * Math.sin(currentTime/1000);
    bigwingRotation();

    smallwingAngle = Math.PI * (-10.0) * Math.sin(currentTime/1000);
    smallwingRotation();


    render();
 
    requestAnimationFrame(animate);
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

async function main() {
    try {
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        finalTransform = mat4.create();
        
        await initShader();

        setupBuffers();

        setupKeyboardEvents();

        return true;
    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}
