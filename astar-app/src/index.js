import './css/index.css';
import React from 'react'
import ReactDOM from 'react-dom'
//import Helmet from 'react-helmet'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import GRID from './grid.js'
import findPath from './astar.js'

class AstarDemo extends React.Component {
	constructor(props) {
		super(props);
		
		this.onClickInGrid = this.onClickInGrid.bind(this);
		this.onKeyDown = this.onKeyDown.bind(this);
	}
	// Main rendering effect & THREE scene setup
	componentDidMount() {		
		this.sceneSetup();
		this.scenePopulate();
		this.astarSetup();
		this.animate();
		
		window.addEventListener('resize', this.onResize);
		window.addEventListener('keydown', this.onKeyDown);
	}
	
	componentWillUnmount() {
		window.removeEventListener('resize', this.onResize);
		window.cancelAnimationFrame(this.frameId);
		
		this.mount.removeChild(this.renderer.domElement);
		
		this.controls.dispose();
		Object.keys(this.grid.nodes).forEach(nodeKey => {
			let cnode = this.grid.nodes[nodeKey];
			this.scene.remove(cnode.cube.mesh);
			this.scene.remove(cnode.cube.outline);
			
			cnode.cube.geo.dispose();
			cnode.cube.mat.dispose();
			cnode.cube.outline.geo.dispose();
			cnode.cube.outline.mat.dispose();
		});
	}
	
	astarSetup = () => {
		this.markNodeAs = GRID.NODE_STATE.TRAVERSABLE;
		
		// Current set of marked nodes
		this.markedNodes = [];
		
		// Does user need to press a button to confirm node as choice?
		this.markWithConfirm = true;
		
		// If multiple nodes are marked, do we confirm every node or just the target in the group
		this.multiConfirm = false;
		
		// If multiple nodes are selected, the current index is confirmed if multiConfirm = false
		this.markedIndex = 0;
		
		// ?? when pathfinding, start/end/traversable is relevant. So gather these in an aggregate perhaps..
		this.startNode = null;
		this.endNode = null;
	};
	
	animate = () => {
		this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.frameId = window.requestAnimationFrame(this.animate); // Why is this accurate without binding here?
    };

    onResize = () => {		
        const width = this.mount.clientWidth;
        const height = this.mount.clientHeight;

        this.renderer.setSize( width, height );
        this.camera.aspect = width / height;

        // After making changes to most of camera properties you have to call
        // .updateProjectionMatrix for the changes to take effect. Why that
		// isn't implicit in a setter I don't know.
        this.camera.updateProjectionMatrix();
    };
	
	scenePopulate = () => {
		// Create the grid
		let dims = {};
		dims.sizeX = 20;
		dims.sizeY = 1;
		dims.sizeZ = 20;
		dims.nCubesX = 10;
		dims.nCubesY = 1;
		dims.nCubesZ = 10;
		this.grid = GRID.create(dims);
		
		// Add to scene
		const nodeKeys = Object.keys(this.grid.nodes);
		nodeKeys.forEach(key => {
			this.scene.add(this.grid.nodes[key].cube.mesh);
			this.scene.add(this.grid.nodes[key].cube.outline.mesh);
		});
	};
	
	sceneSetup = () => {		
		let width = this.mount.clientWidth;
		let height = this.mount.clientHeight;
		this.frameId = 0;

		// Set up scene & renderer
		this.scene = new THREE.Scene();

		// Axes for debugging
		const axes = new THREE.AxesHelper(5);
		this.scene.add(axes);

		this.renderer = new THREE.WebGLRenderer({antialias: true});
		this.renderer.setSize( width, height );
		this.renderer.setClearColor(0xeeffee, 1);

		// Set up camera
		//const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
		//camera.position.y = 10;
		const camScale = 40;
		this.camera = new THREE.OrthographicCamera(width/-camScale, width/camScale, height/camScale, height/-camScale, 1, 1000);
		this.camera.position.y = 50;

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.update();
		
		this.raycaster = new THREE.Raycaster();
		
		this.mount.appendChild(this.renderer.domElement);
	};
	
	displayErrorMessage = (msg) => {
		console.log(msg);
	};
	
	onKeyDown = e => {
		const keyA = 65;
		const keyArrowLeft = 37;
		const keyArrowRight = 39;
		
		if (e.which === keyA) {
			this.confirmMarkedNodes();
		}
		else if (e.which === keyArrowLeft) {
			this.moveMarked(true);
		}
		else if (e.which === keyArrowRight) {
			this.moveMarked(false);
		}
	}
	
	moveMarked = moveLeft => {
		this.markedIndex = (this.markedIndex + (moveLeft ? -1 : +1)) % this.markedNodes.length;
		if (this.markedIndex < 0) {
			this.markedIndex += this.markedNodes.length;
		}
		this.markedNodes.forEach(node => GRID.setNodeState(node, GRID.NODE_STATE.MARKED_GROUP));
		GRID.setNodeState(this.markedNodes[this.markedIndex], GRID.NODE_STATE.MARKED_SINGLE);
	}
	
	onClickInGrid(e) {
		// Find the clicked node
		const mousePos = new THREE.Vector2();
		
		// Turn coords into NDC before picking
		mousePos.x = (e.clientX / this.mount.clientWidth)*2 - 1;
		mousePos.y = -(e.clientY / this.mount.clientHeight)*2 + 1;
		
		// Pick
		this.raycaster.setFromCamera(mousePos, this.camera);
		const allPickedObjects = this.raycaster.intersectObjects(this.scene.children);
		
		// We're only interested in the actual nodes/cubes, not the outlines(if present)
		const pickedObjects = allPickedObjects.map(e => e.object.type === 'Mesh' ? e.object : undefined).filter(e => e);
		
		// Extract the positions (which are keys into the grid)
		const pickedPositions = pickedObjects.map(obj => JSON.stringify([obj.position.x, obj.position.y, obj.position.z]));
		
		// Get the nodes
		const pickedNodes = pickedPositions.map(pos => this.grid.nodes[pos]);
		
		if (!pickedNodes.length) {
			return;
		}
		
		// Clear the previously marked nodes 
		this.markedNodes.forEach(node => GRID.setNodeState(node, node.previousState || GRID.NODE_STATE.TRAVERSABLE));
		this.markedIndex = 0;
		
		this.markedNodes = pickedNodes;
		
		// Add the new nodes to marked, or instantly confirm them
		if (this.markWithConfirm) {
			// Start showing the nodes as marked
			pickedNodes.forEach(node => {
				GRID.setNodeState(node, GRID.NODE_STATE.MARKED_GROUP);
			});
			GRID.setNodeState(pickedNodes[this.markedIndex], GRID.NODE_STATE.MARKED_SINGLE);
			
		} else {
			this.confirmMarkedNodes();
		}		
	};
	
	confirmMarkedNodes() {
		// Reset previous nodes that conflict with the ones we want to confirm
		const resetStartNode = () => {
			GRID.setNodeState(this.startNode);
			this.startNode = null;
		};
		const resetEndNode = () => {
			GRID.setNodeState(this.endNode);
			this.endNode = null;
		};
		
		if (!this.markedNodes.length) {
			return;
		}
		
		// If the confirmed node(s) is a start/end node, reset them
		const ids = this.multiConfirm ? this.markedNodes.map(node => node.id) : [this.markedNodes[0].id];
		
		if (this.startNode) {
			ids.filter(id => id === this.startNode.id).forEach(n => resetStartNode());
		}
		if (this.endNode) {
			ids.filter(id => id === this.endNode.id).forEach(n => resetEndNode());
		}
		
		// If not setting multiple nodes, or if setting start/end nodes, reset all others
		if (!this.multiConfirm || this.markNodeAs === GRID.NODE_STATE.START || this.markNodeAs === GRID.NODE_STATE.END) {
			this.markedNodes
				.filter(node => node.id !== this.markedNodes[this.markedIndex].id)
				.forEach(node => GRID.resetNodeState(node));
		}
		
		// Select start node
		if (this.markNodeAs === GRID.NODE_STATE.START) {
			if (this.startNode) {
				resetStartNode();
			}
			GRID.setNodeState(this.markedNodes[this.markedIndex], GRID.NODE_STATE.START);
			this.startNode = this.markedNodes[this.markedIndex];
		}
		// Select end node
		else if (this.markNodeAs === GRID.NODE_STATE.END) {
			if (this.endNode) {
				resetEndNode();
			}
			GRID.setNodeState(this.markedNodes[this.markedIndex], GRID.NODE_STATE.END);
			this.endNode = this.markedNodes[this.markedIndex];
		}
		// Default node
		else if (this.markNodeAs === GRID.NODE_STATE.TRAVERSABLE || 
				 this.markNodeAs === GRID.NODE_STATE.NON_TRAVERSABLE) {
			
			this.markedNodes.forEach(node => GRID.setNodeState(node, this.markNodeAs));
		}
		
		this.markedNodes = [];
		
		this.updatePath();
	}
	
	updatePath = () => {		
		// Clear fcosts / parents / path visuals
		Object.keys(this.grid.nodes).forEach(key => {
			const node = this.grid.nodes[key];
			if (node.currentState === GRID.NODE_STATE.ON_PATH) {
				GRID.setNodeState(node, node.previousState || GRID.NODE_STATE.TRAVERSABLE);
			}
			GRID.clearPathstate(node);
		});
		
		// Do not recalculate path if we miss start/end nodes
		if (!this.startNode || !this.endNode || (this.startNode.id === this.endNode.id)) {
			return;
		}
		console.log('finding path')
		findPath(this.startNode, this.endNode, this.grid.dimensions);
		
		// endNode can be traced back, now
		let cnode = this.endNode.parent;
		if (!cnode) {
			return;
		}
		
		while(cnode.parent) {
			GRID.setNodeState(cnode, GRID.NODE_STATE.ON_PATH);
			cnode = cnode.parent;
		}
	};
	
	
	render() {
		return (
			<div className="container">
				<div className="grid" ref={ref => (this.mount = ref)} onClick={this.onClickInGrid} />
				
				<div className="options">
					<h6>Mark node as:</h6>
					<input 
						type="radio" id="nodeSelect_none" 
						value="0" 
						name="nodeSelect" 
						defaultChecked={true} 
						onClick={e => {this.markNodeAs = GRID.NODE_STATE.TRAVERSABLE}} 
					/>
					<label htmlFor="nodeSelect_none">nothing</label>
					
					<input 
						type="radio" 
						id="nodeSelect_start" 
						value="1" name="nodeSelect" 
						defaultChecked={this.markNodeAs === GRID.NODE_STATE.START} 
						onClick={e => {this.markNodeAs = GRID.NODE_STATE.START}} 
					/>
					<label htmlFor="nodeSelect_start">start</label>
					
					<input 
						type="radio" 
						id="nodeSelect_end" 
						value="2" 
						name="nodeSelect" 
						defaultChecked={this.markNodeAs === GRID.NODE_STATE.END} 
						onClick={e => {this.markNodeAs = GRID.NODE_STATE.END}}  
					/>
					<label htmlFor="nodeSelect_end">end</label>
					
					<input 
						type="radio" 
						id="nodeSelect_traversable" 
						value="3" 
						name="nodeSelect" 
						defaultChecked={this.markNodeAs === GRID.NODE_STATE.NON_TRAVERSABLE} 
						onClick={e => {this.markNodeAs = GRID.NODE_STATE.NON_TRAVERSABLE}}  
					/>
					<label htmlFor="nodeSelect_traversable">(non)traversable</label>
					
					<input type="checkbox" 
						onClick={e => this.markWithConfirm = !this.markWithConfirm} 
					/>
				</div>
			</div>
		);
	}
}

ReactDOM.render(<AstarDemo />, document.getElementById('root'))