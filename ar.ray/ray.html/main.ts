/**
 * This file is loaded via the <script> tag in the index.html file and will
 * be executed in the renderer process for that window. No Node.js APIs are
 * available in this process because `nodeIntegration` is turned off and
 * `contextIsolation` is turned on. Use the contextBridge API in `preload.js`
 * to expose Node.js functionality from the main process.
 */
import Renderer from "./src/renderer";
import {FontStore, Glyph} from "./src/font/font";

import {parse} from "./src/font/opentype.js/opentype.mjs"

const renderer = new Renderer({
  antialias: true,
  // Controls the default clear alpha value. When set to true, the value is 0 Otherwise it's 1.
  alpha: true,
  // Provides a hint to the user agent indicating what configuration of GPU is suitable for this WebGL context. Can be "high-performance", "low-power" or "default". Default is "default"
  powerPreference: 'high-performance',
  // fixes: https://github.com/niklasvh/html2canvas/issues/1311
  preserveDrawingBuffer: true
});
renderer.pixelRatio = window.devicePixelRatio;

// const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
// camera.position.set(0, 0, 1000);
// camera.lookAt(0, 0, 0);

// const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x1c2127)

// const clock = new THREE.Clock();

// const uniforms = {
//   u_time: {type: "f", value: 1.0},
//   u_resolution: {type: "v2", value: new THREE.Vector2()},
//   u_mouse: {type: "v2", value: new THREE.Vector2()}
// };

const BASE_URL = 'http://localhost:5173'
const get = async (file: string) => await (await fetch(`${BASE_URL}/${file}`)).text()

const container = document.getElementById('container');

const init = async () => {
  if (!renderer.isWebGL2Available()) {
    const element = document.createElement( 'div' );
    element.id = 'webglmessage';
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '13px';
    element.style.fontWeight = 'normal';
    element.style.textAlign = 'center';
    element.style.background = '#fff';
    element.style.color = '#000';
    element.style.padding = '1.5em';
    element.style.width = '400px';
    element.style.margin = '5em auto 0';
    element.innerHTML = 'Your graphics card/browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL 2</a>';

    container.appendChild(element);
    return;
  }

  container.appendChild(renderer.domElement);
}

// // Initiate function or other initializations here
// renderer.setAnimationLoop(() => {
//     // group.rotation.x += 0.01;
//     // group.rotation.z += 0.01;

//     renderer.render(scene, camera);
// });

const animate = () => {
  requestAnimationFrame(animate);
  render();
}

let program = renderer.createProgram(
  renderer.createVertexShader(await get('test.vert')),
  renderer.createFragmentShader(await get('test.frag'))
)

// TODO: Refactor opentype.js to automatically fill "make" with data.
// TODO: Add CBDT/CBLC (EBDT/EBLC) support for emojis
// TODO: Strike-through, + differentiate bold/semibold/italic etc..
// TODO: Test variable fonts from google noto
// TODO: Fonts should be editable within the interface: Save to the .ttf file and perform version control over
//       the structure of the ttf file. Changes from the OS should be labelled as branches from the original and
//       if no conflicts from the edited variant as well.

let context = "Qe8P?i6o90d&;\n$*%#@AaRg"

const fonts = new FontStore()
fonts.load(await fetch('http://localhost:5173/lib/fonts/JetBrainsMono/ttf/JetBrainsMono-Regular.ttf').then(res => res.arrayBuffer()))
fonts.load(await fetch('http://localhost:5173/lib/fonts/NotoEmoji/ttf/NotoEmoji-Regular.ttf').then(res => res.arrayBuffer()))

const render = () => {
  console.log('render')

  const positionBuffer = renderer.gl.createBuffer();
  renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);

  // renderer.gl.viewport(0, 0, canvas.width, canvas.height);
  renderer.gl.clearColor(28 / 255, 33 / 255, 39 / 255, 1);
  renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT);

  renderer.gl.useProgram(program);

  const a_position = renderer.gl.getAttribLocation(program, "a_position");
  renderer.gl.enableVertexAttribArray(a_position);
  renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);
  renderer.gl.vertexAttribPointer(a_position, 2, renderer.gl.FLOAT, false, 0, 0);

  const u_color = renderer.gl.getUniformLocation(program, "u_color");

  // uniforms.u_time.value += clock.getDelta();
  // console.log(uniforms.u_time.value)

  // renderer.render(scene, camera);

  function renderTextPoints(text: string, xStart = -0.9, yOffset = 0.9, size = 28) {
    let xOffset = xStart;

    // console.log(f2.charToGlyph('🏎'))
    // console.log('🏎')
    // TODO: glyph.advanceWidth for emojis we need to instantiate Glyphs before parseHmtxTableAll

    {
      let lineHeight; // TODO WOULDNT WORK WITH NEWLINE AT THE BEGINNING
      for (const char of text) {
        if (char === '\n') {
          xOffset = xStart;
          yOffset -= lineHeight;
          continue;
        }

        const glyph = fonts.glyph(char);

        const xScale = (1 / renderer.width) * size * (1 / glyph.font.tables.head.unitsPerEm)
        const yScale = (1 / renderer.height) * size * (1 / glyph.font.tables.head.unitsPerEm)

        // TODO Allow customization like for arabic (horizontal) or chinese (vertical)

        // TODO: Should check everything in front and behind till a newline for the line-height if there are different fonts.
        lineHeight = (glyph.font.tables.head.yMax - glyph.font.tables.head.yMin + glyph.font.tables.post.underlineThickness) * yScale;

        // TODO: Tie a "rendered cache" to each token, if nothing changes, we just load from cache.
        const triangles = glyph.toTriangles({
          segmentsPerCurve: 30
        }).map(triangle => triangle.scale_x(xScale).offset_x(xOffset).scale_y(yScale).offset_y(yOffset))
          .map(triangle => [triangle.a.x, triangle.a.y, triangle.b.x, triangle.b.y, triangle.c.x, triangle.c.y])
          .flat()

        renderer.gl.uniform4f(u_color, 1, 1, 1, 1)

        renderer.gl.bufferData(renderer.gl.ARRAY_BUFFER, new Float32Array(triangles), renderer.gl.STATIC_DRAW);
        renderer.gl.drawArrays(renderer.gl.TRIANGLES, 0, triangles.length / 2); // /2 because it's x,y for each point

        xOffset += glyph.advanceWidth * xScale; // + spacing
      }
    }

  }

  renderTextPoints(context);
}

// let tanFOV = Math.tan(((Math.PI / 180) * camera.fov / 2));
let initialWindowHight = window.innerHeight;
const onWindowResize = (event?: UIEvent) => {
  // camera.aspect = window.innerWidth / window.innerHeight;
  //
  // // adjust the FOV
  // camera.fov = (360 / Math.PI) * Math.atan(tanFOV * (window.innerHeight / initialWindowHight));
  //
  // camera.updateProjectionMatrix();
  // camera.lookAt(scene.position);

  renderer.setSize(window.innerWidth, window.innerHeight);
  // uniforms.u_resolution.value.x = renderer.domElement.width;
  // uniforms.u_resolution.value.y = renderer.domElement.height;

  render()
}

onWindowResize()
window.addEventListener('resize', onWindowResize, false);

document.onmousemove = (event) => {
  // uniforms.u_mouse.value.x = event.pageX;
  // uniforms.u_mouse.value.y = event.pageY;
}

const heldKeys = new Set<string>();
const repeatTimers = new Map<string, number>();

function onKeyAction(key: string) {
  context += key;
}



document.onkeydown = (event) => {
  event.preventDefault();

  const key = event.key;

  const isChar = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (isChar) {

    if (!heldKeys.has(key)) {
      // First time the key is pressed
      heldKeys.add(key);
      onKeyAction(key);

      if (repeatTimers.has(key))
        return;

      // Start repeat timer
      setTimeout(() => {
        if (!heldKeys.has(key)) return;

        const timer = window.setInterval(() => {
          onKeyAction(key)
        }, 50);
        repeatTimers.set(key, timer);
      }, 500)

    }

  }
}
document.onkeyup = (event) => {
  const key = event.key;

  heldKeys.delete(key);

  const timer = repeatTimers.get(key);
  if (timer !== undefined) {
    clearInterval(timer);
    repeatTimers.delete(key);
  }
}

await init();
animate();