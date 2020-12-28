import MinHeap from './heap.js'

// Simple helpers to manipulate arrays. Does NOT work for b shorter than a
const addVec = (a, b) => a.map((v, i) => v + b[i]);
const subVec = (a, b) => a.map((v, i) => v - b[i]);

// For A* we'd like to calculate distances the same way, no matter the dimensions of the grid
const makeNodeDistance = (dimensions) => {
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

// Apply some action to each node on the path
const retracePath = (node, apply) => {
	let cnode = node.parent;
	while(cnode.parent) {
		if (apply) {
			apply(cnode);
		}
		cnode = cnode.parent;
	}
};

const nodeComparator = (a, b) => {
	if (a.fCost < b.fCost) return -1;
	else if (a.fCost > b.fCost) return 1;
	else if (a.hCost < b.hCost) return -1;
	else if (a.hCost > b.hCost) return 1;
	
	return 0;
};

const findPath = (startNode, endNode, gridDimensions) => {
	// TODO cache this
	const nodeDist = makeNodeDistance(gridDimensions);
	const step = makeAstarStep(nodeDist);
	
	let openSet = new MinHeap(nodeComparator);
	let closedSet = [];
	
	openSet.push(startNode);
	
	while(openSet.size() > 0 && step(openSet, closedSet, endNode) !== 1);
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
const makeAstarStep = (nodeDistance) => {
	return (openSet, closedSet, endNode, colorClosed = false) => {
		// Pick the node from the open set with the lowest f cost
		const currentNode = openSet.pop();
		closedSet.push(currentNode);
		if (colorClosed) {
			currentNode.cube.mat.color.set(0xff0000);
		}
		
		if (currentNode.id === endNode.id) {
			retracePath(currentNode);
			return 1;
		}
		
		// 
		for(let i = 0; i < currentNode.neighbours.length; i++) {
			const neighbour = currentNode.neighbours[i];
			
			// No point looking at non-traversable nodes or those we already looked at. We could add a node id to make this less cumbersome.
			if (!neighbour.traversable || closedSet.find(e => e.id === neighbour.id)) {
				continue;
			}
			
			const newDistanceToNeighbour = currentNode.gCost + nodeDistance(currentNode, neighbour);
			if (newDistanceToNeighbour < neighbour.gCost || !openSet.find(e => e.id === neighbour.id)) {
				neighbour.gCost = newDistanceToNeighbour;
				neighbour.hCost = nodeDistance(neighbour, endNode);
				neighbour.parent = currentNode;
				
				if (!openSet.find(e => e.id === neighbour.id)) {
					openSet.push(neighbour);
				}
			}
		}
	}
}


export default findPath;