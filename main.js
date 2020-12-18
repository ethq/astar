import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r123/three.module.min.js';
import { OrbitControls } from '/node_modules/three/examples/jsm/controls/OrbitControls.js';

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
		cube.position.val = [x, y, z];
	};
	cube.position.get = () => cube.position.val;
	
	cube.scale = {};
	cube.scale.set = (x, y, z) => {
		cube.mesh.scale.set(x, y, z);
		cube.outline.scale.set(x, y, z);
		cube.scale.val = [x, y, z];
	};
	cube.scale.get = () => cube.scale.val;
	
	cube.scale.set(...ext);
	cube.position.set(...pos);
	
	return cube;
}

// Node "class"
const createNode = (cube) => {
	let node = {
		traversable: true,
		cube: cube,
		neighbours: [],
		parent: undefined,
		// g-cost is the distance from the start node to the current node
		gCost: 0,
		// h-cost is the (approximate) distance from the current node to the end node
		hCost: 0 
	};
	node.fCost = () => node.gCost + node.hCost;
	return node;
};

// Helpers to manipulate arrays. Does NOT work for b shorter than a
const addVec = (a, b) => a.map((v, i) => v + b[i]);
const subVec = (a, b) => a.map((v, i) => v - b[i]);

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
	
	const ext = [wx, wy, wz];
	
	// Calculate center coordinates for each cube
	const centerAndScaleRange = width => (val, idx, arr) => width*(val - Math.floor(arr.length/2) + 0.5*(1-arr.length%2));
	
	const x = [...Array(nCubesX).keys()].map(centerAndScaleRange(wx));
	const y = [...Array(nCubesY).keys()].map(centerAndScaleRange(wy));
	const z = [...Array(nCubesZ).keys()].map(centerAndScaleRange(wz));
	
	const cartesian = (...a) => a.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));
	const cubeCoords = cartesian(x, y, z);
	
	// Create the cubes themselves
	let cubes = cubeCoords.map(pos => createCube(pos, ext));
	
	// Create the grid itself, allowing indexing by position
	let grid = {};
	grid.nodes = {};
	cubes.forEach(cube => grid.nodes[JSON.stringify(cube.position.get())] = createNode(cube));
	
	// Add neighbours to each grid cell
	const neighbourPositionsAndSelf = cartesian([-wx, 0, wx], [-wy, 0, wy], [-wz, 0, wz]);
	
	// The origin is no neighbour
	const neighbourPositions = neighbourPositionsAndSelf.filter(nbpos => nbpos.reduce((a,cv) => Math.abs(a) + Math.abs(cv)) > 0);
	
	const addNeighbours = (grid, node) => {
		// Get relative neighbour positions
		const nodePosition = node.cube.position.get();
		const nodeNeighbourPositions = neighbourPositions.map(np => addVec(nodePosition, np));
		
		// Remove nodes that fall outside the grid
		const isInside = (x, y, z) => Math.abs(x) <= dimensions.sizeX/2 && Math.abs(y) <= dimensions.sizeY/2 && Math.abs(z) <= dimensions.sizeZ/2;
		const nodeNeighbourPositionsInside = nodeNeighbourPositions.filter(nbpos => isInside(...nbpos));
		
		// Add neighbours to node
		node.neighbours = nodeNeighbourPositionsInside.map(pos => grid.nodes[JSON.stringify(pos)]);
	};
	Object.keys(grid.nodes).forEach(nodeKey => addNeighbours(grid, grid.nodes[nodeKey]));
	
	// Add to scene
	cubes.forEach(cube => scene.add(cube.outline));
	cubes.forEach(cube => scene.add(cube.mesh));
	
	// Store grid properties
	grid.dimensions = dimensions;
	grid.nodeExt = ext;
	grid.nCubes = [nCubesX, nCubesY, nCubesZ];
	
	return grid;
};

// Utility functions for the grid
const selectRandomNode = (grid, condition) => {
	const keys = Object.keys(grid.nodes);
	const randomKey = keys[Math.floor(Math.random()*keys.length)];
	const randomNode = grid.nodes[randomKey];
	
	if (condition && !condition(randomNode)) {
		return selectRandomNode(grid, condition);
	}
	return randomNode;
};

// For A* we'd like to calculate distances the same way, no matter the dimensions of the grid
const makeNodeDistance = dimensions => {
	// Width of grid cubes in each dimension
	const widths = [dimensions.sizeX / dimensions.nCubesX,
					dimensions.sizeY / dimensions.nCubesY,
					dimensions.sizeZ / dimensions.nCubesZ];
	
	return (nodeA, nodeB) => {
		const posA = nodeA.cube.position.get();
		const posB = nodeB.cube.position.get();
		
		// Distances, with a unit between each adjacent grid cell
		let dists = subVec(posA, posB).map((v,i) => Math.abs(v)/widths[i]);
		
		// Distances on our unit grid, scaled by a factor 10 to avoid decimals
		const distDiag = 14;
		const distDirect = 10;
		
		// Reduce [x, y] and then [[x,y], z]. This will generate different paths than reducing e.g. [x, z] and then [[x,z], y]. Test!
		// This type of reduction doesnt give proper diagonal costs for the pure XZ plane, for example....
		// May want to invent another way of doing this in 3D, since it excludes one dimension and as such can give bad paths
		// For example, we could calculate 3D-diagonal moves until we're a straight path in one dimension away from the target node.
		// Probably best!
		
		// So, for now, we switch around. Reduce [x,z] => [[x,z], y]
		const dimA = 0;
		const dimB = 2;
		const dimC = 1;
		
		const distDiagAB = Math.min(dists[dimA], dists[dimB]);
		const distDirectAB = Math.abs(dists[dimA] - dists[dimB]);
		
		// The diagonal moves are removed from both dimensions
		dists[dimA] -= distDiagAB;
		dists[dimB] -= distDiagAB;
		
		// The direct moves are removed from the largest dimension
		if (dists[dimA] > dists[dimB]) {
			dists[dimA] -= distDirectAB;
		}
		else {
			dists[dimB] -= distDirectAB;
		}
		
		// At this point dist = [0, Y, 0]
		const distDiagABC = Math.min(Math.max(dists[dimA], dists[dimB]));
		const distDirectABC = Math.abs(dists.reduce((a, cv) => a - cv));
		
		/*
		console.log(distDiagAB);
		console.log(distDirectAB);
		console.log(distDiagABC);
		console.log(distDirectABC);
		*/
		
		return distDiag*(distDiagAB + distDiagABC) + distDirect*(distDirectAB + distDirectABC);
	};
};

// Just color the path blue
const retracePath = (node) => {
	let cnode = node.parent;
	while(cnode.parent) {
		cnode.cube.mat.color.set(0x000000);
		cnode.cube.mat.opacity = 0.4;
		cnode = cnode.parent;
	}
};

const findPath = (startNode, endNode, nodes) => {
	let openSet = [];
	let closedSet = [];
	
	openSet.push(startNode);
	
	while(openSet.length > 0 && astarStep(openSet, closedSet, endNode) != 1);
};

const findPathVisualized = (startNode, endNode, nodes) => {
	let openSet = [];
	let closedSet = [];
	
	openSet.push(startNode);
	
	let iid = setInterval(() => {
		const res = astarStep(openSet, closedSet, endNode, false);
		if (res == 1) {
			clearInterval(iid);
		}
	}, 10);
};

// Modifies openSet and closedSet
const astarStep = (openSet, closedSet, endNode, colorClosed = false) => {
	// Pick the node from the open set with the lowest f cost
	let currentNode = openSet[0];
	for (let i = 1; i < openSet.length; i++) {
		if (openSet[i].fCost < currentNode.fCost || openSet[i].fCost == currentNode.fCost && openSet[i].hCost < currentNode.hCost) {
			currentNode = openSet[i];
		}
	}
	
	const currentNodeIdx = openSet.indexOf(currentNode);
	openSet.splice(currentNodeIdx, 1);
	closedSet.push(currentNode);
	if (colorClosed) {
		currentNode.cube.mat.color.set(0xff0000);
	}
	
	if (JSON.stringify(currentNode.cube.position.get()) == JSON.stringify(endNode.cube.position.get())) {
		retracePath(currentNode);
		return 1;
	}
	
	// 
	for(let i = 0; i < currentNode.neighbours.length; i++) {
		const neighbour = currentNode.neighbours[i];
		const neighbourPos = JSON.stringify(neighbour.cube.position.get());
		
		// No point looking at non-traversable nodes or those we already looked at. We could add a node id to make this less cumbersome.
		if (!neighbour.traversable || closedSet.find(e => JSON.stringify(e.cube.position.get()) == neighbourPos)) {
			continue;
		}
		
		const newDistanceToNeighbour = currentNode.gCost + nodeDistance(currentNode, neighbour);
		if (newDistanceToNeighbour < neighbour.gCost || !openSet.find(e => JSON.stringify(e.cube.position.get()) == neighbourPos)) {
			neighbour.gCost = newDistanceToNeighbour;
			neighbour.hCost = nodeDistance(neighbour, endNode);
			neighbour.parent = currentNode;
			
			if (!openSet.find(e => JSON.stringify(e.cube.position.get()) == neighbourPos)) {
				openSet.push(neighbour);
			}
		}
	}
};

function resizeCanvasToDisplaySize(renderer, camera) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    // you must pass false here or three.js sadly fights the browser
    renderer.setSize(width/2, height/2, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // set render target sizes here
  }
}


// Set up scene & renderer
const scene = new THREE.Scene();

// Axes for debugging
const axes = new THREE.AxesHelper(5);
scene.add(axes);

const renderer = new THREE.WebGLRenderer({canvas: document.querySelector("canvas")});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setClearColor(0xeeffee, 1);

//document.getElementById('renderer').appendChild(renderer.domElement);

// Set up camera
//const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
//camera.position.y = 10;
const camScale = 40;
const camera = new THREE.OrthographicCamera(window.innerWidth/-camScale, window.innerWidth/camScale, window.innerHeight/camScale, window.innerHeight/-camScale, 1, 1000);
camera.position.y = 50;

const controls = new OrbitControls(camera, renderer.domElement);

controls.update();

// Create the grid
let dims = {};
dims.sizeX = 20;
dims.sizeY = 1;
dims.sizeZ = 20;
dims.nCubesX = 10;
dims.nCubesY = 1;
dims.nCubesZ = 10;
let grid = addGrid(scene, dims);

// Set up A*
let nodeDistance = makeNodeDistance(dims);
const startNode = selectRandomNode(grid);
const endNode = selectRandomNode(grid, n => n != startNode);

startNode.cube.mat.opacity = 0.3;
endNode.cube.mat.opacity = 0.6;

//findPath(startNode, endNode);

// Set up picking
// Note that raycasting against Line or LineSegment requires a smaller raycaster.params.Line.threshold(e.g. 0.1, 1 being default)
const raycaster = new THREE.Raycaster();

const pick = pos => {
	raycaster.setFromCamera(pos, camera);
	return raycaster.intersectObjects(scene.children);
};

// Hook up input

const onMouseDown = e => {
	const mousePos = new THREE.Vector2();
	
	// Turn coords into NDC before picking
	mousePos.x = (e.clientX / window.innerWidth)*2 - 1;
	mousePos.y = -(e.clientY / window.innerHeight)*2 + 1;
	
	// Pick
	const allPickedObjects = pick(mousePos);
	
	// We're only interested in the actual nodes/cubes, not the outlines(if present)
	const pickedObjects = allPickedObjects.map(e => e.object.type == 'Mesh' ? e.object : undefined).filter(e => e);
	
	// Extract the positions (which are keys into the grid)
	const pickedPositions = pickedObjects.map(obj => JSON.stringify([obj.position.x, obj.position.y, obj.position.z]));
	
	// Get the nodes
	const pickedNodes = pickedPositions.map(pos => grid.nodes[pos]);
	
	// Do stuff with em depending on options
	pickedNodes.forEach(node => {
		node.traversable = false; 
		node.cube.mat.color.set(0xff0000);
	});
	
};

let onKeyDown = (e) => {
	const keycode = e.which;
	if (keycode == '37') {
		findPath(startNode, endNode);
	}
	else if (keycode == '38') {
		//grid.mat.color.setHex(0x00ff00);
	}
};

document.addEventListener("keydown", onKeyDown, false);
document.addEventListener("pointerdown", onMouseDown, false);


// Animation loop
const animate = function() {
	requestAnimationFrame( animate );
	
	resizeCanvasToDisplaySize(renderer, camera);
	controls.update();
	renderer.render(scene, camera);
};

animate();