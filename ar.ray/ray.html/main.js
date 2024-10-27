/**
 * This file is loaded via the <script> tag in the index.html file and will
 * be executed in the renderer process for that window. No Node.js APIs are
 * available in this process because `nodeIntegration` is turned off and
 * `contextIsolation` is turned on. Use the contextBridge API in `preload.js`
 * to expose Node.js functionality from the main process.
 */
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    // Controls the default clear alpha value. When set to true, the value is 0 Otherwise it's 1.
    alpha: true,
    // Provides a hint to the user agent indicating what configuration of GPU is suitable for this WebGL context. Can be "high-performance", "low-power" or "default". Default is "default"
    powerPreference: 'high-performance',
    // fixes: https://github.com/niklasvh/html2canvas/issues/1311
    preserveDrawingBuffer: true
});
renderer.setPixelRatio(window.devicePixelRatio);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 1000);
camera.lookAt(0, 0, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2127)

const clock = new THREE.Clock();

const uniforms = {
    u_time: { type: "f", value: 1.0 },
    u_resolution: { type: "v2", value: new THREE.Vector2() },
    u_mouse: { type: "v2", value: new THREE.Vector2() }
};

const BASE_URL = 'http://localhost:5173'
const get = async (file) => await (await fetch(`${BASE_URL}/${file}`)).text()

const container = document.getElementById('container');

const init = async () => {
    if (!WebGL.isWebGL2Available()) {
        const warning = WebGL.getWebGL2ErrorMessage();
        container.appendChild(warning);
        return;
    }
    
    container.appendChild(renderer.domElement);

    scene.add(new THREE.Mesh(
        new THREE.PlaneGeometry( 2, 2 ),
        new THREE.ShaderMaterial( {
            uniforms: uniforms,
            vertexShader: await get('main.vert')        ,
            fragmentShader: await get('main.frag')
        })
    ))
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
    renderer.render(scene, camera);
}

let tanFOV = Math.tan(((Math.PI / 180) * camera.fov / 2));
let initialWindowHight = window.innerHeight;
const onWindowResize = (event) => {
    camera.aspect = window.innerWidth / window.innerHeight;

    // adjust the FOV
    camera.fov = (360 / Math.PI) * Math.atan(tanFOV * (window.innerHeight / initialWindowHight));

    camera.updateProjectionMatrix();
    camera.lookAt(scene.position);

    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.u_resolution.value.x = renderer.domElement.width;
    uniforms.u_resolution.value.y = renderer.domElement.height;

    renderer.render(scene, camera);
}

onWindowResize()
window.addEventListener('resize', onWindowResize, false);

document.onmousemove = (event) => {
    uniforms.u_mouse.value.x = event.pageX;
    uniforms.u_mouse.value.y = event.pageY;
}

await init();
animate();