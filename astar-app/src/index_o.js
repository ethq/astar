import './css/index.css';
import React from 'react'
import ReactDOM from 'react-dom'
//import Helmet from 'react-helmet'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const Grid = () => {
	const { useRef, useEffect, useCallback } = React;
	const mount = useRef(null);
	
	// Marked node can be:
	// -1: don't mark node
	// 0: select start node
	// 1: select end node
	// 2: toggle traversable
	let markNodeAs = -1;
	let markedNodes = [];
	let markWithConfirm = true;
	
	// ?? when pathfinding, start/end/traversable is relevant. So gather these in an aggregate perhaps..
	let startNode = null;
	let endNode = null;
	
	// We need access to various three.js objects outside of the "constructor"; scene, camera, raycaster and so on
	const sceneObjects = useRef(null);
	
	const confirmMarkedNodes = useCallback(() => {
		// Select start node
		if (markNodeAs === 0) {
			if (markedNodes.length !== 1) {
				displayErrorMessage('Too many nodes marked, only one can be start node.');
				return;
			}
			if (startNode) {
				startNode.setAsDefault();
			}
			// If the end node IS this node, then reset that as well
			if (endNode && JSON.stringify(endNode.cube.position.get()) === JSON.stringify(markedNodes[0].cube.position.get())) {
				endNode = null;
			}
			markedNodes[0].setAsStart();
			startNode = markedNodes[0];
		}
		// Select end node
		else if (markNodeAs === 1) {
			if (markedNodes.length !== 1) {
				displayErrorMessage('Too many nodes marked, only one can be end node.');
				return;
			}
			// If an end node is set, reset it
			if (endNode) {
				endNode.setAsDefault();
			}
			// If the start node IS this node, then reset that as well
			if (startNode && JSON.stringify(startNode.cube.position.get()) === JSON.stringify(markedNodes[0].cube.position.get())) {
				startNode = null;
			}
			markedNodes[0].setAsEnd();
			endNode = markedNodes[0];
		}
		// Mark node(s) as (non)traversable
		else if (markNodeAs === 2) {
			markedNodes.forEach(node => node.setAsNonTraversable());
		}
		
		markedNodes = [];
	}, [markedNodes, startNode, endNode]);
	
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

	// Simple helpers to manipulate arrays. Does NOT work for b shorter than a
	const addVec = (a, b) => a.map((v, i) => v + b[i]);
	const subVec = (a, b) => a.map((v, i) => v - b[i]);
	
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
			
			// Dimensions to preferentially reduce in. [0, 1, 2] <=> [x, y, z]. dimA reduced first, then dimB. last moves are done in a straight line in dimC
			const dimA = 0;
			const dimB = 2;
			//const dimC = 1;
			
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

	const findPath = (startNode, endNode, step) => {
		let openSet = [];
		let closedSet = [];
		
		openSet.push(startNode);
		
		while(openSet.length > 0 && step(openSet, closedSet, endNode) !== 1);
	};

	const findPathAndVisualize = (startNode, endNode, step) => {
		let openSet = [];
		let closedSet = [];
		
		openSet.push(startNode);
		
		// Todo: move coloring into this function, leave astarstep to do just that - step astar
		let iid = setInterval(() => {
			const res = step(openSet, closedSet, endNode, false);
			if (res === 1) {
				clearInterval(iid);
			}
		}, 10);
	};
	
	// Note that astarStep modifies openSet and closedSet. For complete functionalness, should return new copies.
	const makeAstarStep = nodeDistance => (openSet, closedSet, endNode, colorClosed = false) => {
		// Pick the node from the open set with the lowest f cost
		let currentNode = openSet[0];
		for (let i = 1; i < openSet.length; i++) {
			if ((openSet[i].fCost < currentNode.fCost) || (openSet[i].fCost === currentNode.fCost && openSet[i].hCost < currentNode.hCost)) {
				currentNode = openSet[i];
			}
		}
		
		const currentNodeIdx = openSet.indexOf(currentNode);
		openSet.splice(currentNodeIdx, 1);
		closedSet.push(currentNode);
		if (colorClosed) {
			currentNode.cube.mat.color.set(0xff0000);
		}
		
		if (JSON.stringify(currentNode.cube.position.get()) === JSON.stringify(endNode.cube.position.get())) {
			retracePath(currentNode);
			return 1;
		}
		
		// 
		for(let i = 0; i < currentNode.neighbours.length; i++) {
			const neighbour = currentNode.neighbours[i];
			const neighbourPos = JSON.stringify(neighbour.cube.position.get());
			
			// No point looking at non-traversable nodes or those we already looked at. We could add a node id to make this less cumbersome.
			if (!neighbour.traversable || closedSet.find(e => JSON.stringify(e.cube.position.get()) === neighbourPos)) {
				continue;
			}
			
			const newDistanceToNeighbour = currentNode.gCost + nodeDistance(currentNode, neighbour);
			if (newDistanceToNeighbour < neighbour.gCost || !openSet.find(e => JSON.stringify(e.cube.position.get()) === neighbourPos)) {
				neighbour.gCost = newDistanceToNeighbour;
				neighbour.hCost = nodeDistance(neighbour, endNode);
				neighbour.parent = currentNode;
				
				if (!openSet.find(e => JSON.stringify(e.cube.position.get()) === neighbourPos)) {
					openSet.push(neighbour);
				}
			}
		}
	};
	
	// Main rendering effect & THREE scene setup
	useEffect(() => {
		
		function createCube(pos, ext) {
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
			cube.outline.mat.opacity = 1;
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
				previousVisuals: {},
				neighbours: [],
				parent: undefined,
				// g-cost is the distance from the start node to the current node
				gCost: 0,
				// h-cost is the (approximate) distance from the current node to the end node
				hCost: 0
			};
			node.fCost = () => node.gCost + node.hCost;
			
			// Public members
			node.setAsNonTraversable = () => {
				node.traversable = false;
				node.cube.mat.color.set(0xff0000);
				node.cube.mat.opacity = 0.5;
				node.previousVisuals = {};
			};
			
			node.setAsDefault = () => {
				node.traversable = true;
				node.cube.mat.color.set(0x00ff00);
				node.cube.mat.opacity = 0.1;
				node.previousVisuals = {};
			};
			
			node.setAsStart = () => {
				node.traversable = true;
				node.cube.mat.color.set(0x0000ff);
				node.cube.mat.opacity = 0.7;
				node.previousVisuals = {};
			};
			
			node.setAsEnd = () => {
				node.traversable = true;
				node.cube.mat.color.set(0xffff00);
				node.cube.mat.opacity = 0.7;
				node.previousVisuals = {};
			};
			
			// Only visual, for marking
			node.setAsNoTarget = () => {
				if (Object.keys(node.previousVisuals).length === 0) {
					return;
				};
				node.cube.mat.color.set(node.previousVisuals.color);
				node.cube.mat.opacity = node.previousVisuals.opacity;
				
				node.previousVisuals = {};
			}
			node.setAsSingleTarget = () => {
				// Store previous visual state to restore. We test for existence to allow nodes to be set as targets repeatedly while not destroying the previous state.
				if (Object.keys(node.previousVisuals).length === 0) {
					node.previousVisuals = { color: node.cube.mat.color.getHex(), opacity: node.cube.mat.opacity };
				}
				node.cube.mat.color.set(0x404040);
				node.cube.mat.opacity = 0.9;
			};
			
			node.setAsGroupTarget = () => {
				// Store previous visual state to restore. We test for existence to allow nodes to be set as targets repeatedly while not destroying the previous state.
				if (Object.keys(node.previousVisuals).length === 0) {
					node.previousVisuals = { color: node.cube.mat.color.getHex(), opacity: node.cube.mat.opacity };
				}
				node.cube.mat.color.set(0xa1a1a1);
				node.cube.mat.opacity = 0.7;
			};
			
			return node;
		};

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
			cubes.forEach(cube => scene.add(cube.outline.mesh));
			cubes.forEach(cube => scene.add(cube.mesh));
			
			// Store grid properties
			grid.dimensions = dimensions;
			grid.nodeExt = ext;
			grid.nCubes = [nCubesX, nCubesY, nCubesZ];
			
			return grid;
		};

		
		let width = mount.current.clientWidth;
		let height = mount.current.clientHeight;
		let frameId = 0;

		// Set up scene & renderer
		const scene = new THREE.Scene();

		// Axes for debugging
		const axes = new THREE.AxesHelper(5);
		scene.add(axes);

		const renderer = new THREE.WebGLRenderer({antialias: true});
		renderer.setSize( width, height );
		renderer.setClearColor(0xeeffee, 1);

		// Set up camera
		//const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
		//camera.position.y = 10;
		const camScale = 40;
		const camera = new THREE.OrthographicCamera(width/-camScale, width/camScale, height/camScale, height/-camScale, 1, 1000);
		camera.position.y = 50;

		const obControls = new OrbitControls(camera, renderer.domElement);

		obControls.update();
		
		const raycaster = new THREE.Raycaster();

		// Create the grid
		let dims = {};
		dims.sizeX = 20;
		dims.sizeY = 1;
		dims.sizeZ = 20;
		dims.nCubesX = 10;
		dims.nCubesY = 1;
		dims.nCubesZ = 10;
		let grid = addGrid(scene, dims);
		
		sceneObjects.current = {grid, camera, raycaster, scene}

		// Set up A*
		/*let nodeDistance = makeNodeDistance(dims);
		const startNode = selectRandomNode(grid);
		const endNode = selectRandomNode(grid, n => n !== startNode);

		startNode.cube.mat.opacity = 0.3;
		endNode.cube.mat.opacity = 0.6;*/

		const renderScene = () => {
			renderer.render(scene, camera);
		}

		const handleResize = () => {
			width = mount.current.clientWidth;
			height = mount.current.clientHeight;
			renderer.setSize(width, height);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderScene();
		}
		
		const onKeyDown = e => {
			confirmMarkedNodes();
		}
		
		const animate = () => {
			obControls.update();
			renderScene();
			frameId = window.requestAnimationFrame(animate);
		}

		const start = () => {
			if (!frameId) {
				frameId = requestAnimationFrame(animate);
			}
		}

		const stop = () => {
			cancelAnimationFrame(frameId);
			frameId = null;
		}

		mount.current.appendChild(renderer.domElement);
		window.addEventListener('resize', handleResize);
		window.addEventListener('keydown', onKeyDown)
		start();
		
		return () => {
			stop();
			window.removeEventListener('resize', handleResize);
			mount.current.removeChild(renderer.domElement);
			
			Object.keys(sceneObjects.current.grid.nodes).forEach(nodeKey => {
				let cnode = sceneObjects.current.grid.nodes[nodeKey];
				scene.remove(cnode.cube.mesh);
				scene.remove(cnode.cube.outline);
				
				cnode.cube.geo.dispose();
				cnode.cube.mat.dispose();
				cnode.cube.outline.geo.dispose();
				cnode.cube.outline.mat.dispose();
			});
			
			sceneObjects.current = null;
		}
	}, []);
	
	const displayErrorMessage = msg => {
		console.log(msg);
	};
	
	const handleClickInGrid = e => {
		if (markNodeAs === -1) {
			return;
		}
		// Find the clicked node
		const mousePos = new THREE.Vector2();
		
		// Turn coords into NDC before picking
		mousePos.x = (e.clientX / mount.current.clientWidth)*2 - 1;
		mousePos.y = -(e.clientY / mount.current.clientHeight)*2 + 1;
		
		// Pick
		sceneObjects.current.raycaster.setFromCamera(mousePos, sceneObjects.current.camera);
		const allPickedObjects = sceneObjects.current.raycaster.intersectObjects(sceneObjects.current.scene.children);
		
		// We're only interested in the actual nodes/cubes, not the outlines(if present)
		const pickedObjects = allPickedObjects.map(e => e.object.type === 'Mesh' ? e.object : undefined).filter(e => e);
		
		// Extract the positions (which are keys into the grid)
		const pickedPositions = pickedObjects.map(obj => JSON.stringify([obj.position.x, obj.position.y, obj.position.z]));
		
		// Get the nodes
		const pickedNodes = pickedPositions.map(pos => sceneObjects.current.grid.nodes[pos]);
		
		if (!pickedNodes.length) {
			return;
		}
		
		// Clear the previously marked nodes 
		markedNodes.forEach(node => node.setAsNoTarget());
		markedNodes = pickedNodes;
		
		// Add the new nodes to marked, or instantly confirm them
		if (markWithConfirm) {
			// Start showing the nodes as marked
			pickedNodes.forEach(node => {
				node.setAsGroupTarget();
			});
			pickedNodes[0].setAsSingleTarget();
			
		} else {
			confirmMarkedNodes();
		}		
	};
	
	return (
		<div className="container">
			<div className="grid" ref={mount} onClick={handleClickInGrid} />
			
			<div className="options">
				<h6>Mark node as:</h6>
				<input type="radio" id="nodeSelect_none" value="0" name="nodeSelect" defaultChecked={markNodeAs === -1} onClick={e => {markNodeAs = -1}} />
				<label htmlFor="nodeSelect_none">nothing</label>
				
				<input 
					type="radio" 
					id="nodeSelect_start" 
					value="1" name="nodeSelect" 
					defaultChecked={markNodeAs === 0} 
					onClick={e => {markNodeAs = 0}} 
				/>
				<label htmlFor="nodeSelect_start">start</label>
				
				<input 
					type="radio" 
					id="nodeSelect_end" 
					value="2" 
					name="nodeSelect" 
					defaultChecked={markNodeAs === 1} 
					onClick={e => {markNodeAs = 1}}  
				/>
				<label htmlFor="nodeSelect_end">end</label>
				
				<input 
					type="radio" 
					id="nodeSelect_traversable" 
					value="3" 
					name="nodeSelect" 
					defaultChecked={markNodeAs === 2} 
					onClick={e => {markNodeAs = 2}}  
				/>
				<label htmlFor="nodeSelect_traversable">(non)traversable</label>
				
				<input type="checkbox" 
					onClick={e => markWithConfirm = !markWithConfirm} 
				/>
			</div>
		</div>
	);
}

ReactDOM.render(<Grid />, document.getElementById('root'))