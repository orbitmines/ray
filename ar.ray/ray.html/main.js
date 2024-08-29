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
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 1000);
camera.lookAt(0, 0, 0);


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2127)

// const geometry = new THREE.BoxGeometry(1, 1, 1);
// const material = new THREE.MeshBasicMaterial({color: 0x00ff00});
// const cube = new THREE.Mesh(geometry, material);
// scene.add(cube);
//
// camera.position.z = 5;

// const material = new THREE.LineBasicMaterial( { color: 0x0000ff } );
// const points = [];
// points.push( new THREE.Vector3( - 10, 0, 0 ) );
// points.push( new THREE.Vector3( 0, 10, 0 ) );
// points.push( new THREE.Vector3( 10, 0, 0 ) );
//
// const geometry = new THREE.BufferGeometry().setFromPoints( points );
// const line = new THREE.Line( geometry, material );
// scene.add( line );

const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3-20, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(37-20, 0, 0)
]);

const points = curve.getPoints(50);
const geometry = new THREE.BufferGeometry().setFromPoints(points);

const material = new THREE.LineBasicMaterial({color: "#FFAA00", linewidth: 4});


// Create the final object to add to the scene
const curveObject = new THREE.Line(geometry, material);

const group = new THREE.Group();
group.add(curveObject)

const Vertex = () => {
    const obj = new THREE.Mesh(
        new THREE.CircleGeometry(3, 32),
        new THREE.MeshBasicMaterial({color: "#FFAA00"})
    );
    obj.position.set(0, 0, 0)
    return obj;
}
const Continuation = ({position}) => {
    const obj = new THREE.Mesh(
        new THREE.TorusGeometry(3, 1, 200, 200),
        new THREE.MeshBasicMaterial({color: "#FFAA00"})
    );
    obj.position.set(position[0], position[1], position[2])
    return obj;
};
group.add(Vertex())
group.add(Continuation({position: [0-20, 0, 0]}))
group.add(Continuation({position: [40-20, 0, 0]}))

group.scale.set(2.5, 2.5, 2.5)
scene.add(group)


if (WebGL.isWebGL2Available()) {
    // Initiate function or other initializations here
    renderer.setAnimationLoop(() => {
        // group.rotation.x += 0.01;
        // group.rotation.z += 0.01;

        renderer.render(scene, camera);
    });
} else {

    const warning = WebGL.getWebGL2ErrorMessage();
    document.getElementById('container').appendChild(warning);

}

let tanFOV = Math.tan(((Math.PI / 180) * camera.fov / 2));
let windowHeight = window.innerHeight;

window.addEventListener('resize', (event) => {
    camera.aspect = window.innerWidth / window.innerHeight;

    // adjust the FOV
    camera.fov = (360 / Math.PI) * Math.atan(tanFOV * (window.innerHeight / windowHeight));

    camera.updateProjectionMatrix();
    camera.lookAt(scene.position);

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);

}, false);