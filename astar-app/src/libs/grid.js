import * as THREE from 'three'

let GRID = {};

// Utility functions for the grid
GRID.selectRandomNode = (grid, condition) => {
	const keys = Object.keys(grid.nodes);
	const randomKey = keys[Math.floor(Math.random()*keys.length)];
	const randomNode = grid.nodes[randomKey];
	
	if (condition && !condition(randomNode)) {
		return this.selectRandomNode(grid, condition);
	}
	return randomNode;
}

GRID.NODE_STATE = {
	TRAVERSABLE: 1,
	NON_TRAVERSABLE: 2,
	MARKED_GROUP: 3,
	MARKED_SINGLE: 4,
	START: 5,
	END: 6,
	ON_PATH: 7
};

// TODO: make the states all modifiable from the outside
GRID.TRAVERSABLE_NODE_OPACITY = 0.1;
GRID.OUTLINE_OPACITY = 0.2;

const isMarkedState = state => {
	return state === GRID.NODE_STATE.MARKED_GROUP || state === GRID.NODE_STATE.MARKED_SINGLE;
}
GRID.setNodeState = (node, state) => {
	if (!node) {
		return;
	}
	/*eslint no-fallthrough: ["error", { "commentPattern": "break[\\s\\w]*omitted" }]*/
	switch(state) {
		case GRID.NODE_STATE.NON_TRAVERSABLE:
			node.traversable = false;
			node.cube.mat.color.set(0xff0000);
			node.cube.mat.opacity = 0.5;
			break;
		case GRID.NODE_STATE.MARKED_GROUP:
			node.cube.mat.color.set(0xa1a1a1);
			node.cube.mat.opacity = 0.7;
			break;
		case GRID.NODE_STATE.MARKED_SINGLE:
			node.cube.mat.color.set(0x404040);
			node.cube.mat.opacity = 0.9;
			break;
		case GRID.NODE_STATE.START:
			node.traversable = true;
			node.cube.mat.color.set(0x0000ff);
			node.cube.mat.opacity = 0.7;
			break;
		case GRID.NODE_STATE.END:
			node.traversable = true;
			node.cube.mat.color.set(0xffff00);
			node.cube.mat.opacity = 0.7;
			break;
		case GRID.NODE_STATE.ON_PATH:
			node.cube.mat.color.set(0x000000);
			node.cube.mat.opacity = 0.9;
			break;
		case GRID.NODE_STATE.TRAVERSABLE:
			node.traversable = true;
			node.cube.mat.color.set(0x00ff00);
			node.cube.mat.opacity = GRID.TRAVERSABLE_NODE_OPACITY;
			break;
		default:
			return GRID.setNodeState(node, GRID.NODE_STATE.TRAVERSABLE);
			
	}
	
	// Allow state rollback, but do nothing between marked states
	if (isMarkedState(state) && isMarkedState(node.currentState)) {
		return;
	}
	node.previousState = node.currentState;
	node.currentState = state;
};

GRID.resetNodeState = node => {
	GRID.setNodeState(node, node.previousState || GRID.NODE_STATE.TRAVERSABLE);
}

GRID.clearPathstate = node => {
	node.parent = undefined;
	node.gCost = 0;
	node.hCost = 0;
};

// Internal functions
const createCube = (pos, ext) => {
	if (pos === undefined) {
		pos = [0, 0, 0];
	}
	if (ext === undefined) {
		ext = [1, 1, 1];
	}
	
	let cube = {};
	cube.geo = new THREE.BoxGeometry();
	cube.mat = new THREE.MeshBasicMaterial({color: 0x00ff00 });
	cube.mat.opacity = 0.1;
	cube.mat.transparent = true;
	cube.mesh = new THREE.Mesh(cube.geo, cube.mat);
	
	// outline
	cube.outline = {};
	cube.outline.geo = new THREE.EdgesGeometry(cube.geo);
	cube.outline.mat = new THREE.MeshBasicMaterial({color: 0x000000 });
	cube.outline.mat.depthTest = false;
	cube.outline.mat.opacity = GRID.OUTLINE_OPACITY;
	cube.outline.mat.transparent = true;
	cube.outline.mesh = new THREE.LineSegments(cube.outline.geo, cube.outline.mat);
	
	// Properties to set position/scale simultaneously for outline and mesh
	cube.position = {};
	cube.position.set = (x, y, z) => {
		cube.mesh.position.set(x, y, z);
		cube.outline.mesh.position.set(x, y, z);
		cube.position.val = [x, y, z];
	};
	cube.position.get = () => cube.position.val;
	
	cube.scale = {};
	cube.scale.set = (x, y, z) => {
		cube.mesh.scale.set(x, y, z);
		cube.outline.mesh.scale.set(x, y, z);
		cube.scale.val = [x, y, z];
	};
	cube.scale.get = () => cube.scale.val;
	
	cube.scale.set(...ext);
	cube.position.set(...pos);
	
	return cube;
}

// Node "class"
const createNode = cube => {
	let node = {
		traversable: true,
		cube: cube,
		id: JSON.stringify(cube.position.get()),
		neighbours: [],
		parent: undefined,
		// g-cost is the distance from the start node to the current node
		gCost: 0,
		// h-cost is the (approximate) distance from the current node to the end node
		hCost: 0,
		fCost: function() { return this.gCost + this.hCost }
	};
	//node.fCost = () => node.gCost + node.hCost;
	GRID.setNodeState(node);
	
	return node;
}

// Simple helpers to manipulate arrays. Does NOT work for b shorter than a
const addVec = (a, b) => a.map((v, i) => v + b[i]);
const subVec = (a, b) => a.map((v, i) => v - b[i]);

// Create a grid centered at the origin.
// Dimensions should contain sizeR, divR, with R = X, Y or Z. 
// If Z is not given, a 2D grid is constructed.
GRID.create = dimensions => {
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
	
	// Create the cubes
	let cubes = cubeCoords.map(pos => createCube(pos, ext));
	
	// Create the grid, allowing indexing by position
	let grid = {};
	grid.nodes = {};
	cubes.forEach(cube => grid.nodes[JSON.stringify(cube.position.get())] = createNode(cube));
	
	// Add neighbours to each grid cell
	const neighbourPositionsAndSelf = cartesian([-wx, 0, wx], [-wy, 0, wy], [-wz, 0, wz]);
	
	// The origin is no neighbour
	const neighbourPositions = neighbourPositionsAndSelf.filter(nbpos => nbpos.reduce((a,cv) => Math.abs(a) + Math.abs(cv)) > 0);
	
	// TODO: this does not play well when sizex/ncubes arent integer multiples of each other
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
	//cubes.forEach(cube => scene.add(cube.outline.mesh));
	//cubes.forEach(cube => scene.add(cube.mesh));
	
	// Store grid properties
	grid.dimensions = dimensions;
	grid.nodeExt = ext;
	grid.nCubes = [nCubesX, nCubesY, nCubesZ];
	
	return grid;
}

	

export default GRID;