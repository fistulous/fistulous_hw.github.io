const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
if (!gl) console.error('WebGL 2 is not supported by your browser.');

canvas.width = 500;
canvas.height = 500;
canvas.style.width = '500px';
canvas.style.height = '500px';

gl.enable(gl.SCISSOR_TEST);




function render() {
  gl.viewport(0, 0, canvas.width, canvas.height);

  const w = canvas.width,  h = canvas.height;
  const hw = (w / 2) | 0,   hh = (h / 2) | 0;

  gl.scissor(0, 0, hw, hh);
  gl.clearColor(0.0, 0.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.scissor(hw, 0, hw, hh);
  gl.clearColor(1.0, 1.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.scissor(0, hh, hw, hh);
  gl.clearColor(0.0, 1.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.scissor(hw, hh, hw, hh);
  gl.clearColor(1.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

render();

window.addEventListener('resize', () => {
  let size = Math.min(window.innerWidth, window.innerHeight);
  size = Math.min(500,size);
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';

  render(); 
});
