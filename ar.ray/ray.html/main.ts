/**
 * This file is loaded via the <script> tag in the index.html file and will
 * be executed in the renderer process for that window. No Node.js APIs are
 * available in this process because `nodeIntegration` is turned off and
 * `contextIsolation` is turned on. Use the contextBridge API in `preload.js`
 * to expose Node.js functionality from the main process.
 */
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import Renderer from "./src/renderer";
import {font, Glyph} from "./src/font/font";

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

const clock = new THREE.Clock();

const uniforms = {
  u_time: {type: "f", value: 1.0},
  u_resolution: {type: "v2", value: new THREE.Vector2()},
  u_mouse: {type: "v2", value: new THREE.Vector2()}
};

const BASE_URL = 'http://localhost:5173'
const get = async (file: string) => await (await fetch(`${BASE_URL}/${file}`)).text()

const container = document.getElementById('container');

const init = async () => {
  if (!WebGL.isWebGL2Available()) {
    const warning = WebGL.getWebGL2ErrorMessage();
    container.appendChild(warning);
    return;
  }

  container.appendChild(renderer.domElement);

  let program = renderer.createProgram(
    renderer.createVertexShader(await get('test.vert')),
    renderer.createFragmentShader(await get('test.frag'))
  )

  const f = font(await get('lib/fonts/JetBrainsMono/json/JetBrains Mono_Regular.json'))
  console.log(f)


// --- Main renderer ---
  function renderTextPoints(text: string, xStart = -0.9, yBase = 0, size = 0.02) {
    let scale = size / f.resolution;
    let triangles: any[] = [];
    let xCursor = xStart;

    const lineHeight = (f.boundingBox.yMax - f.boundingBox.yMin + f.underlineThickness) * scale;

    for (const char of text) {
      if (char === '\n') {
        xCursor = xStart;
        yBase -= lineHeight;
        continue;
      }

      let glyph = f.glyphs[char];
      if (!glyph) { glyph = f.glyphs['?']; if (!glyph) {continue} }

      // points.push(...scaledPoints)
      triangles.push(...Glyph.parse(glyph.o).toTriangles({ scale, xOffset: xCursor, yOffset: yBase, segmentsPerCurve: 100 }))

      xCursor += glyph.ha * scale; // + spacing
    }


    // const trianglePoints: any[] = earcut(allPoints)
    // console.log(allPoints)
    // console.log(trianglePoints)
    // console.log(trianglePoints.map(x => x / Math.max(...trianglePoints)))

    // const vertices = new Float32Array(allPoints);

    const positionBuffer = renderer.gl.createBuffer();
    renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);
    renderer.gl.bufferData(renderer.gl.ARRAY_BUFFER, new Float32Array(triangles), renderer.gl.STATIC_DRAW);
    // renderer.gl.bufferData(renderer.gl.ARRAY_BUFFER, new Float32Array(points.flat()), renderer.gl.STATIC_DRAW);

    // renderer.gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.gl.clearColor(1, 1, 1, 1);
    renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT);

    renderer.gl.useProgram(program);

    const posLoc = renderer.gl.getAttribLocation(program, "a_position");
    renderer.gl.enableVertexAttribArray(posLoc);
    renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);
    renderer.gl.vertexAttribPointer(posLoc, 2, renderer.gl.FLOAT, false, 0, 0);


    renderer.gl.drawArrays(renderer.gl.TRIANGLES, 0, triangles.length);
    // renderer.gl.drawArrays(renderer.gl.POINTS, 0, points.length);
  }

// --- Execute ---
  renderTextPoints("Qe8P?i6o90d&;\n$*%#@AaRg");

  //
  // // look up where the vertex data needs to go.
  // var positionAttributeLocation = renderer.gl.getAttribLocation(program, "a_position");
  //
  // // look up uniform locations
  // var resolutionUniformLocation = renderer.gl.getUniformLocation(program, "u_resolution");
  // var colorUniformLocation = renderer.gl.getUniformLocation(program, "u_color");
  //
  // // Create a buffer to put three 2d clip space points in
  // var positionBuffer = renderer.gl.createBuffer();
  //
  // // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  // renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);
  //
  // // webrenderer.glUtils.resizeCanvasToDisplaySize(renderer.gl.canvas);
  //
  // // Tell Webrenderer.gl how to convert from clip space to pixels
  // renderer.gl.viewport(0, 0, renderer.gl.canvas.width, renderer.gl.canvas.height);
  //
  // // Clear the canvas
  // renderer.gl.clearColor(0, 0, 0, 0);
  // renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT);
  //
  // // Tell it to use our program (pair of shaders)
  // renderer.gl.useProgram(program);
  //
  // // Turn on the attribute
  // renderer.gl.enableVertexAttribArray(positionAttributeLocation);
  //
  // // Bind the position buffer.
  // renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, positionBuffer);
  //
  // // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  // var size = 2;          // 2 components per iteration
  // var type = renderer.gl.FLOAT;   // the data is 32bit floats
  // var normalize = false; // don't normalize the data
  // var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
  // var offset = 0;        // start at the beginning of the buffer
  // renderer.gl.vertexAttribPointer(
  //   positionAttributeLocation, size, type, normalize, stride, offset);
  //
  // // set the resolution
  // renderer.gl.uniform2f(resolutionUniformLocation, renderer.gl.canvas.width, renderer.gl.canvas.height);
  //
  // // draw 50 random rectanrenderer.gles in random colors
  // for (var ii = 0; ii < 50; ++ii) {
  //   // Setup a random rectanrenderer.gle
  //   // This will write to positionBuffer because
  //   // its the last thing we bound on the ARRAY_BUFFER
  //   // bind point
  //   setRectangle(randomInt(300), randomInt(300), randomInt(300), randomInt(300));
  //
  //   // Set a random color.
  //   renderer.gl.uniform4f(colorUniformLocation, Math.random(), Math.random(), Math.random(), 1);
  //
  //   // Draw the rectanrenderer.gle.
  //   var primitiveType = renderer.gl.TRIANGLES;
  //   var offset = 0;
  //   var count = 6;
  //   renderer.gl.drawArrays(primitiveType, offset, count);
  // }
  //
  // // Returns a random integer from 0 to range - 1.
  // function randomInt(range: number) {
  //   return Math.floor(Math.random() * range);
  // }
  //
  // // Fill the buffer with the values that define a rectanrenderer.gle.
  // function setRectangle(x: number, y: number, width: number, height: number) {
  //   var x1 = x;
  //   var x2 = x + width;
  //   var y1 = y;
  //   var y2 = y + height;
  //   renderer.gl.bufferData(renderer.gl.ARRAY_BUFFER, new Float32Array([
  //     x1, y1,
  //     x2, y1,
  //     x1, y2,
  //     x1, y2,
  //     x2, y1,
  //     x2, y2,
  //   ]), renderer.gl.STATIC_DRAW);
  // }

  // scene.add(new THREE.Mesh(
  //   new THREE.PlaneGeometry(2, 2),
  //   new THREE.ShaderMaterial({
  //     uniforms: uniforms,
  //     vertexShader: await get('main.vert'),
  //     fragmentShader: await get('main.frag')
  //   })
  // ))
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

const render = () => {
  uniforms.u_time.value += clock.getDelta();
  // renderer.render(scene, camera);
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
  uniforms.u_resolution.value.x = renderer.domElement.width;
  uniforms.u_resolution.value.y = renderer.domElement.height;

  // renderer.render(scene, camera);
}

onWindowResize()
window.addEventListener('resize', onWindowResize, false);

document.onmousemove = (event) => {
  uniforms.u_mouse.value.x = event.pageX;
  uniforms.u_mouse.value.y = event.pageY;
}

await init();
animate();