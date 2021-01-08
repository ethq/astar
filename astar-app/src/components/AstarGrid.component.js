import '../css/index.css';
import React from 'react'
import ReactDOM from 'react-dom'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import GRID from '../libs/grid.js'
import findPath from '../libs/astar.js'
import createHeap from '../libs/heap.js'

const CAMERA_TYPE = {
	NONE: 1,
	ORTHOGRAPHIC: 2,
	PERSPECTIVE: 3
};

export default class AstarGrid extends React.Component {
	constructor(props) {
		super(props);

		this.onClickInGrid = this.onClickInGrid.bind(this);
		this.onKeyDown = this.onKeyDown.bind(this);
		this.renderScene = () => {
			let pending = false;

			const render = () => {
				this.renderer.render(this.scene, this.camera);
			}

			if (pending) {
				return;
			}
			pending = false;
			this.frameId = window.requestAnimationFrame(render);
		};

		this.state = {
			autoCalculatePath: true,
			controlsEnabled: true,
			gridDimensions: {
				nCubesX: 20,
				nCubesY: 2,
				nCubesZ: 20
			}
		};
	}
	// Main rendering effect & THREE scene setup
	componentDidMount() {
		this.sceneSetup();
		this.addGrid();
		this.astarInit();
		this.renderScene();

		window.addEventListener('resize', this.onResize);
		window.addEventListener('keydown', this.onKeyDown);
		this.controls.addEventListener('change', this.renderScene);
	}

	componentWillUnmount() {
		window.removeEventListener('resize', this.onResize);
		window.removeEventListener('keydown', this.onKeyDown);
		window.cancelAnimationFrame(this.frameId);

		this.controls.removeEventListener('change', this.renderScene);
		this.controls.dispose();

		this.removeGrid();
		this.mount.removeChild(this.renderer.domElement);
	}

	astarInit = () => {
		this.markNodeAs = GRID.NODE_PATH_STATE.START;

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
		this.render();
        this.frameId = window.requestAnimationFrame(this.animate);
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

	addGrid = () => {
		let dims = {};
		dims.sizeX = this.state.gridDimensions.nCubesX;
		dims.sizeY = this.state.gridDimensions.nCubesY;
		dims.sizeZ = this.state.gridDimensions.nCubesZ;
		dims.nCubesX = this.state.gridDimensions.nCubesX;
		dims.nCubesY = this.state.gridDimensions.nCubesY;
		dims.nCubesZ = this.state.gridDimensions.nCubesZ;
		this.grid = GRID.create(dims);

		// Add to scene
		const nodeKeys = Object.keys(this.grid.nodes);
		nodeKeys.forEach(key => {
			this.scene.add(this.grid.nodes[key].cube.mesh);
			this.scene.add(this.grid.nodes[key].cube.outline.mesh);
		});
	};

	removeGrid = () => {
		// Resets start/end nodes etc.
		this.astarInit();

		// Remove nodes from scene
		Object.keys(this.grid.nodes).forEach(nodeKey => {
			let cnode = this.grid.nodes[nodeKey];
			this.scene.remove(cnode.cube.mesh);
			this.scene.remove(cnode.cube.outline.mesh);

			cnode.cube.geo.dispose();
			cnode.cube.mat.dispose();
			cnode.cube.outline.geo.dispose();
			cnode.cube.outline.mat.dispose();
		});

		this.renderScene();
	};

	sceneSetup = () => {
		let width = this.mount.clientWidth;
		let height = this.mount.clientHeight;
		this.frameId = 0;

		// Set up scene & renderer
		this.scene = new THREE.Scene();

		// Axes for debugging
		//const axes = new THREE.AxesHelper(5);
		//this.scene.add(axes);

		this.renderer = new THREE.WebGLRenderer({antialias: true});
		this.renderer.setSize( width, height );
		this.renderer.setClearColor(0xeeffee, 1);

		// Set up camera
		this.setCamera(CAMERA_TYPE.ORTHOGRAPHIC);

		this.raycaster = new THREE.Raycaster();

		this.mount.appendChild(this.renderer.domElement);
	};

	setCamera = cameraType => {
		const camScale = 30;
		const fov = 75;
		const width = this.mount.clientWidth;
		const height = this.mount.clientHeight;

		this.camera = null;
		if (this.controls) {
			this.controls.removeEventListener('change', this.renderScene);
			this.controls.dispose();
		}

		switch(cameraType) {
			case CAMERA_TYPE.ORTHOGRAPHIC:
				this.camera = new THREE.OrthographicCamera(-width/camScale, width/camScale, height/camScale, -height/camScale, 0.1, 1000);
				this.camera.position.y = 20;
				break;
			case CAMERA_TYPE.PERSPECTIVE:
				this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
				this.camera.position.y = 25;
				break;
			default:
				return;
		}

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.addEventListener('change', this.renderScene);
		this.renderScene();
	};

	setOutlineOpacity = opacity => {
		Object.keys(this.grid.nodes).forEach(key => {
			const node = this.grid.nodes[key];
			node.cube.outline.mat.opacity = opacity;
		});
		GRID.OUTLINE_OPACITY = opacity;
	}

	setRegularNodeOpacity = opacity => {
		Object.keys(this.grid.nodes).forEach(key => {
			const node = this.grid.nodes[key];
			if (node.state === GRID.NODE_PATH_STATE.TRAVERSABLE) {
				node.cube.mat.opacity = Math.min(1, Math.max(0, opacity));
			}
		});
		GRID.TRAVERSABLE_NODE_OPACITY = opacity;
	};

	displayErrorMessage = (msg) => {
		console.log(msg);
	};

	onKeyDown = e => {
		const keyA = 65;
		const keyArrowLeft = 37;
		const keyArrowRight = 39;
		const enterKey = 13;

		if (e.which === keyA) {
			this.confirmMarkedNodes();
		}
		else if (e.which === keyArrowLeft) {
			this.moveMarked(true);
		}
		else if (e.which === keyArrowRight) {
			this.moveMarked(false);
		}
		else if (e.which === enterKey) {
			// Only place in app where enter is pressed is in the options menu,
			// we lose all options on re-render, so... stop submission
			e.preventDefault();
		}

		this.renderScene();
	}

	moveMarked = moveLeft => {
		this.markedIndex = (this.markedIndex + (moveLeft ? -1 : +1)) % this.markedNodes.length;
		if (this.markedIndex < 0) {
			this.markedIndex += this.markedNodes.length;
		}
		this.markedNodes.forEach(node => GRID.setNodeVisualState(node, GRID.NODE_VISUAL_STATE.MARKED_GROUP));
		GRID.setNodeVisualState(this.markedNodes[this.markedIndex], GRID.NODE_VISUAL_STATE.MARKED_SINGLE);
	}

	onClickInGrid(e) {
		if (e.altKey) {
			return;
		}

		// Find the clicked node
		const mousePos = new THREE.Vector2();

		// Event coordinates are in viewport coordinates, which do not necessarily correspond to three.js' canvas coordinates
		const offsetY = -(document.getElementById('root').clientHeight - this.mount.clientHeight);

		// Turn coords into NDC before picking
		mousePos.x = (e.clientX / this.mount.clientWidth)*2 - 1;
		mousePos.y = -((e.clientY + offsetY) / this.mount.clientHeight)*2 + 1;

		// Pick
		this.raycaster.setFromCamera(mousePos, this.camera);
		const allPickedObjects = this.raycaster.intersectObjects(this.scene.children);

		// We're only interested in the actual nodes/cubes, not the outlines(if present)
		const pickedObjects = allPickedObjects.map(e => e.object.type === 'Mesh' ? e.object : undefined).filter(e => e);

		// Extract the positions (which are keys into the grid)
		const pickedPositions = pickedObjects.map(obj => JSON.stringify([obj.position.x, obj.position.y, obj.position.z]));

		// Get the nodes
		const pickedNodes = pickedPositions.map(pos => this.grid.nodes[pos]);

		if (pickedNodes.length === 0) {
			return;
		}

		// Clear the previously marked nodes
		this.markedNodes.forEach(node => GRID.resetNodeVisualState(node));
		this.markedIndex = 0;
		this.markedNodes = [];
		this.markedNodes = pickedNodes;

		// Add the new nodes to marked, or instantly confirm them
		if (this.markWithConfirm) {
			// Start showing the nodes as marked
			pickedNodes.forEach(node => {
				GRID.setNodeVisualState(node, GRID.NODE_VISUAL_STATE.MARKED_GROUP);
			});
			GRID.setNodeVisualState(pickedNodes[this.markedIndex], GRID.NODE_VISUAL_STATE.MARKED_SINGLE);

		} else {
			this.confirmMarkedNodes();
		}

		this.renderScene();
	};

	confirmMarkedNodes() {
		// Reset previous nodes that conflict with the ones we want to confirm
		const resetStartNode = () => {
			GRID.setNodePathState(this.startNode, GRID.NODE_PATH_STATE.TRAVERSABLE);
			this.startNode = null;
		};
		const resetEndNode = () => {
			GRID.setNodePathState(this.endNode, GRID.NODE_PATH_STATE.TRAVERSABLE);
			this.endNode = null;
		};

		if (this.markedNodes.length === 0) {
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

		// Select start node
		if (this.markNodeAs === GRID.NODE_PATH_STATE.START) {
			if (this.startNode) {
				resetStartNode();
			}
			GRID.setNodePathState(this.markedNodes[this.markedIndex], GRID.NODE_PATH_STATE.START);
			this.startNode = this.markedNodes[this.markedIndex];
		}
		// Select end node
		else if (this.markNodeAs === GRID.NODE_PATH_STATE.END) {
			if (this.endNode) {
				resetEndNode();
			}
			GRID.setNodePathState(this.markedNodes[this.markedIndex], GRID.NODE_PATH_STATE.END);
			this.endNode = this.markedNodes[this.markedIndex];
		}
		// Default node
		else if (this.markNodeAs === GRID.NODE_PATH_STATE.TRAVERSABLE ||
				 this.markNodeAs === GRID.NODE_PATH_STATE.NON_TRAVERSABLE) {

			const nodesToSet = this.multiConfirm ? this.markedNodes : [this.markedNodes[0]];
			nodesToSet.forEach(node => GRID.setNodePathState(node, this.markNodeAs));
		}

		this.markedNodes.forEach(node => GRID.resetNodeVisualState(node));
		this.markedNodes = [];

		if (this.state.autoCalculatePath) {
			this.updatePath();
		}
	}

	updatePath = () => {
		// Clear fcosts / parents / path visuals
		Object.keys(this.grid.nodes).forEach(key => {
			const node = this.grid.nodes[key];
			if (node.state === GRID.NODE_PATH_STATE.ON_PATH) {
				GRID.setNodePathState(node, GRID.NODE_PATH_STATE.TRAVERSABLE);
			}
			GRID.clearPathstate(node);
		});

		// Do not recalculate path if we are missing start/end nodes
		if (!this.startNode || !this.endNode || (this.startNode.id === this.endNode.id)) {
			return;
		}

		findPath(this.startNode, this.endNode, this.grid.dimensions);

		// endNode can be traced back, now
		let cnode = this.endNode.parent;
		if (!cnode) {
			return;
		}

		while(cnode.parent) {
			GRID.setNodePathState(cnode, GRID.NODE_PATH_STATE.ON_PATH);
			cnode = cnode.parent;
		}
	};


	render() {
		return (
			<div className="container">
				<div className="grid" ref={ref => (this.mount = ref)} onClick={this.onClickInGrid} />

				<form className="options">
					<ul>
						<li>
							<p>Mark node as</p>
							<ul>
								<li>
									<input
										type="radio" id="nodeSelect_none"
										value="0"
										name="nodeSelect"
										onClick={e => {this.markNodeAs = GRID.NODE_PATH_STATE.TRAVERSABLE}}
									/>
									<label htmlFor="nodeSelect_none">nothing</label>
								</li>

								<li>
									<input
										type="radio"
										id="nodeSelect_start"
										value="1" name="nodeSelect"
										defaultChecked={true}
										onClick={e => {this.markNodeAs = GRID.NODE_PATH_STATE.START}}
									/>
									<label htmlFor="nodeSelect_start">start</label>
								</li>

								<li>
									<input
										type="radio"
										id="nodeSelect_end"
										value="2"
										name="nodeSelect"
										onClick={e => {this.markNodeAs = GRID.NODE_PATH_STATE.END}}
									/>
									<label htmlFor="nodeSelect_end">end</label>
								</li>

								<li>
									<input
										type="radio"
										id="nodeSelect_traversable"
										value="3"
										name="nodeSelect"
										onClick={e => {this.markNodeAs = GRID.NODE_PATH_STATE.NON_TRAVERSABLE}}
									/>
									<label htmlFor="nodeSelect_traversable">(non)traversable</label>
								</li>
							</ul>
						</li>
						<li>
							<p>Marking</p>
							<ul>
								<li>
									<input type="checkbox"
										id="nodeMark_confirm"
										onClick={e => this.markWithConfirm = !this.markWithConfirm}
									/>
									<label htmlFor="nodeMark_confirm">Auto-confirm nodes</label>
								</li>
								<li>
									<input type="checkbox"
										id="nodeMark_multiple"
										onClick={e => this.multiConfirm = e.target.checked}
									/>
									<label htmlFor="nodeMark_multiple">Confirm multiple nodes</label>
								</li>
							</ul>
						</li>
						<li>
							<p>Rendering</p>
							<ul>
								<li>
									<input type="range"
										id="renderOptions_outlineOpacity"
										min="0"
										max="100"
										onChange={e => {this.setOutlineOpacity(e.target.valueAsNumber/100); this.renderScene();}}
										defaultValue={100*GRID.OUTLINE_OPACITY}
									/>
									<label htmlFor="renderOptions_outlineOpacity">Outline opacity</label>
								</li>
								<li>
									<input type="radio"
										id="renderOptions_cameraOrtho"
										name="renderOptions_camera"
										defaultChecked={true}
										onClick={() => this.setCamera(CAMERA_TYPE.ORTHOGRAPHIC)}
									/>
									<label htmlFor="renderOptions_cameraOrtho">Orthographic camera</label>
								</li>
								<li>
									<input type="radio"
										id="renderOptions_cameraPersp"
										name="renderOptions_camera"
										onClick={() => this.setCamera(CAMERA_TYPE.PERSPECTIVE)}
									/>
									<label htmlFor="renderOptions_cameraPersp">Perspective camera</label>
								</li>
								<li>
									<input type="range"
										id="renderOptions_regularNodeOpacity"
										min="0"
										max="100"
										defaultValue={100*GRID.TRAVERSABLE_NODE_OPACITY}
										onChange={e => {this.setRegularNodeOpacity(e.target.valueAsNumber/100); this.renderScene();}}
									/>
									<label htmlFor="renderOptions_regularNodeOpacity">Regular node opacity</label>
								</li>
							</ul>
						</li>
						<li>
							<p>A*</p>
							<ul>
								<li>
									<input type="checkbox"
										id="astarOptions_autoRecalculate"
										checked={this.state.autoCalculatePath}
										onChange={() => {
											this.setState(state => ({autoCalculatePath: !state.autoCalculatePath}));
										}}

									/>
									<label htmlFor="renderOptions_autoRecalculate">Automatically recalculate path</label>
								</li>
								<li style={{display: this.state.autoCalculatePath ? "none" : "inline"}}>
									<button
										id="astarOptions_calculatePath"
										type="button"
										onClick={this.updatePath.bind(this)}
									>
									Calculate path
									</button>
								</li>
							</ul>
						</li>
						<li>
							<p>Grid</p>
							<ul>
								<li>
									<label htmlFor="gridOptions_numCubesX">Cubes in X </label>
									<input type="number" min="1" max="1000" id="gridOptions_numCubesX"
										onChange={e => {
											this.setState((prevState, props) => ({
												gridDimensions: {
													nCubesX: parseInt(e.target.value, 10),
													nCubesY: prevState.gridDimensions.nCubesY,
													nCubesZ: prevState.gridDimensions.nCubesZ
												}
											}))
										}}
									/>
								</li>
								<li>
									<label htmlFor="gridOptions_numCubesY">Cubes in Y </label>
									<input type="number" min="1" max="1000" id="gridOptions_numCubesY"
										onChange={e => {
											this.setState((prevState, props) => ({
												gridDimensions: {
													nCubesX: prevState.gridDimensions.nCubesX,
													nCubesY: parseInt(e.target.value, 10),
													nCubesZ: prevState.gridDimensions.nCubesZ
												}
											}))
										}}
									/>
								</li>
								<li>
									<label htmlFor="gridOptions_numCubesZ">Cubes in Z </label>
									<input type="number" min="1" max="1000" id="gridOptions_numCubesZ"
										onChange={e => {
											this.setState((prevState, props) => ({
												gridDimensions: {
													nCubesX: prevState.gridDimensions.nCubesX,
													nCubesY: prevState.gridDimensions.nCubesY,
													nCubesZ: parseInt(e.target.value, 10)
												}
											}))
										}}
									/>
								</li>
								<li>
									<button type="button"
											id="gridOptions_update"
											onClick={() => {
												this.removeGrid();
												this.addGrid();
											}}
									>
									Update grid
									</button>
								</li>
							</ul>
						</li>
					</ul>
				</form>
			</div>
		);
	}
}
