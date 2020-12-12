import * as THREE from '/node_modules/three/build/three.module.js'
import { OrbitControls } from '/node_modules/three/examples/jsm/controls/OrbitControls.js'

// pos and ext are expected to have x, y and z members
// pos sets the position of the cube
// ext sets the width in all dimensions
function createCube(pos, ext) {
	if (pos === undefined) {
		pos = [0, 0, 0];
	}
	if (ext === undefined) {
		ext = [1, 1, 1];
	}
	
	let cube = {};
	cube.g = new THREE.BoxGeometry();
	cube.mat = new THREE.MeshBasicMaterial({color: 0x00ff00 });
	cube.mat.opacity = 0.1;
	cube.mat.transparent = true;
	cube.mesh = new THREE.Mesh(cube.g, cube.mat);
	
	// wireframe
	const wfmat = new THREE.MeshBasicMaterial({color: 0x000000 });
	const wf = new THREE.EdgesGeometry(cube.g);
	cube.outline = new THREE.LineSegments(wf, wfmat);
	cube.outline.material.depthTest = false;
	cube.outline.material.opacity = 1;
	cube.outline.material.transparent = true;
	
	// Properties to set position/scale simultaneously for outline and mesh
	cube.position = {};
	cube.position.set = (x, y, z) => {
		cube.mesh.position.set(x, y, z);
		cube.outline.position.set(x, y, z);
		cube.position = [x, y, z];
	};
	cube.position.get = () => cube.position;
	
	cube.scale = {};
	cube.scale.set = (x, y, z) => {
		cube.mesh.scale.set(x, y, z);
		cube.outline.scale.set(x, y, z);
		cube.scale = [x, y, z];
	};
	cube.scale.get = () => cube.scale;
	
	cube.scale.set(...ext);
	cube.position.set(...pos);
	
	return cube;
}

// Create a grid centered at the origin.
// Dimensions should contain sizeR, divR, with R = X, Y or Z. 
// If Z is not given, a 2D grid is constructed.
const addGrid = (scene, dimensions) => {
	const nCubesX = dimensions.nCubesX;
	const nCubesY = dimensions.nCubesY;
	const nCubesZ = dimensions.nCubesZ;
	
	// Width of grid cubes in each dimension
	let wx = dimensions.sizeX / nCubesX;
	let wy = dimensions.sizeY / nCubesY;
	let wz = dimensions.sizeZ / nCubesZ;
	
	// Calculate center coordinates for each cube
	const centerAndScaleRange = width => (val, idx, arr) => width*(val - Math.floor(arr.length/2) + 0.5*(1-arr.length%2));
	
	const x = [...Array(nCubesX).keys()].map(centerAndScaleRange(wx));
	const y = [...Array(nCubesY).keys()].map(centerAndScaleRange(wy));
	const z = [...Array(nCubesZ).keys()].map(centerAndScaleRange(wz));
	
	const cartesian = (...a) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));
	const cubeCoords = cartesian(x, y, z);
	
	// Create the cubes themselves
	const delimiter = 0.0;
	const ext = [wx, wy, wz].map(e => e - delimiter);
	let cubes = cubeCoords.map(pos => createCube(pos, ext));
	
	// Add to scene
	cubes.map(cube => scene.add(cube.outline));
	cubes.map(cube => scene.add(cube.mesh));
	
	return cubes;
};

// Set up scene & renderer
const scene = new THREE.Scene();

// Axes for debugging
const axes = new THREE.AxesHelper(5);
scene.add(axes);

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setClearColor(0xeeffee, 1);

document.body.appendChild( renderer.domElement );

// Set up camera
//const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const camScale = 40;
const camera = new THREE.OrthographicCamera(window.innerWidth/-camScale, window.innerWidth/camScale, window.innerHeight/camScale, window.innerHeight/-camScale, 1, 1000);
camera.position.y = 900;
const controls = new OrbitControls(camera, renderer.domElement);
controls.update()

// Create scene elements
let dims = {};
dims.sizeX = 10;
dims.sizeY = .5;
dims.sizeZ = 10;
dims.nCubesX = 10;
dims.nCubesY = 1;
dims.nCubesZ = 10;
let grid = addGrid(scene, dims)

// Hook up input
let onKeyDown = (e) => {
	const keycode = e.which;
	if (keycode == '37') {
		//cube.mat.color.setHex(0xee0000);
		camera.position.set(0, 10, 0);
	}
	else if (keycode == '38') {
		//grid.mat.color.setHex(0x00ff00);
	}
}

document.addEventListener("keydown", onKeyDown, false)


// Animation loop
const animate = function() {
	requestAnimationFrame( animate );
	
	controls.update()

	renderer.render( scene, camera );
};

animate();