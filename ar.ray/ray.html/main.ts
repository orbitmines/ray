/**
 * This file is loaded via the <script> tag in the index.html file and will
 * be executed in the renderer process for that window. No Node.js APIs are
 * available in this process because `nodeIntegration` is turned off and
 * `contextIsolation` is turned on. Use the contextBridge API in `preload.js`
 * to expose Node.js functionality from the main process.
 */
import * as THREE from 'three';
import Renderer from "./src/renderer";
import {font, Glyph} from "./src/font/font";

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

const f = font(await get('lib/fonts/JetBrainsMono/json/JetBrains Mono_Regular.json'))
console.log(f)

const f2 = parse(await fetch('http://localhost:5173/lib/fonts/NotoEmoji/ttf/NotoEmoji-Regular.ttf').then(res => res.arrayBuffer()))
// const f2 = parse(await fetch('http://localhost:5173/lib/fonts/NotoSansArabic/ttf/NotoSansArabic-Regular.ttf').then(res => res.arrayBuffer()))
console.log(f2)
// console.log(f2.glyphs.glyphs[402].toPathData().toLowerCase().replaceAll('m', ' m ').replaceAll('l', ' l ').replaceAll("q", ' q ').replaceAll("b", ' b ').replaceAll("z", ' z ').replaceAll("  ", " ").replace(/^\s/, "").replaceAll("-", " "))

const render = () => {
  uniforms.u_time.value += clock.getDelta();

  // renderer.render(scene, camera);

  function renderTextPoints(text: string, xStart = -0.9, yBase = 0, size = 20) {
    let triangles: any[] = [];
    let xCursor = xStart;

    {
      const xScale = (1 / renderer.width) * size * (1 / f.resolution)
      const yScale = (1 / renderer.height) * size * (1 / f.resolution)

      // TODO Allow customization like for arabic (horizontal) or chinese (vertical)
      const lineHeight = (f.boundingBox.yMax - f.boundingBox.yMin + f.underlineThickness) * yScale;

      for (const char of text) {
        if (char === '\n') {
          xCursor = xStart;
          yBase -= lineHeight;
          continue;
        }

        let glyph = f.glyphs[char];
        if (!glyph) {
          glyph = f.glyphs['?'];
          if (!glyph) {
            continue
          }
        }

        // points.push(...scaledPoints)
        triangles.push(...Glyph.parse(glyph.o).toTriangles({
          xScale,
          yScale,
          xOffset: xCursor,
          yOffset: yBase,
          segmentsPerCurve: 100
        }))

        xCursor += glyph.ha * xScale; // + spacing
      }
    }

    const xScale = 1 / 4000
    const yScale = 1 / 4000

    // 106, 99, 105, 500, 450
    // arabic 50
    const n = 499;
    const glyph = f2.glyphs.glyphs[n];

    const o = glyph.toPathData({flipY: false}).toLowerCase().replaceAll('m', ' m ').replaceAll('l', ' l ').replaceAll("q", ' q ').replaceAll("b", ' b ').replaceAll("z", ' z ').replaceAll("-", " -").replaceAll("  ", " ").replace(/^\s/, "");
    // console.log(o)
    // triangles.push(...)
    for (let tri of Glyph.parse(o).toTriangles({
      xScale,
      yScale,
      xOffset: xCursor,
      yOffset: yBase,
      segmentsPerCurve: 100
    })) {
      triangles.push(tri) // TODO .push(...()) has a maximum stack size limit, dont use it.
    }
    console.log(glyph)

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

  renderTextPoints("Qe8P?i6o90d&;\n$*%#@AaRg");
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

  render()
}

onWindowResize()
window.addEventListener('resize', onWindowResize, false);

document.onmousemove = (event) => {
  uniforms.u_mouse.value.x = event.pageX;
  uniforms.u_mouse.value.y = event.pageY;
}

await init();
animate();