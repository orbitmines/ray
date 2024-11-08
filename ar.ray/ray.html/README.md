```ts
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
```
