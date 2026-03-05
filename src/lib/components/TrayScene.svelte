<script lang="ts">
	import { untrack } from 'svelte';
	import { T, useThrelte, useTask } from '@threlte/core';
	import {
		OrbitControls,
		Grid,
		Text,
		interactivity,
		type IntersectionEvent
	} from '@threlte/extras';
	import PrintBed from './PrintBed.svelte';

	// Enable interactivity for pointer events on 3D objects
	interactivity();
	import type { BufferGeometry } from 'three';
	import * as THREE from 'three';
	import { arrangeBoxes, type TrayPlacement } from '$lib/models/box';
	import type { CounterStack } from '$lib/models/counterTray';
	import type { CardStack } from '$lib/models/cardTray';
	import { captureSceneToDataUrl, type CaptureOptions } from '$lib/utils/screenshotCapture';

	// Type guard to check if a stack is a CounterStack (has shape property)
	function isCounterStack(stack: CounterStack | CardStack): stack is CounterStack {
		return 'shape' in stack;
	}
	import { getTrayLetter, getProject, TRAY_COLORS } from '$lib/stores/project.svelte';
	import {
		layoutEditorState,
		selectTray,
		updateTrayPosition,
		setSnapGuides,
		clearSnapGuides,
		getEffectiveDimensions
	} from '$lib/stores/layoutEditor.svelte';
	import { snapPosition } from '$lib/utils/layoutSnapping';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		color: string;
		geometry: BufferGeometry;
		placement: TrayPlacement;
		counterStacks: CounterStack[];
		trayLetter?: string;
	}

	interface BoxGeometryData {
		boxId: string;
		boxName: string;
		boxGeometry: BufferGeometry | null;
		lidGeometry: BufferGeometry | null;
		trayGeometries: TrayGeometryData[];
		boxDimensions: { width: number; depth: number; height: number };
	}

	interface TrayClickInfo {
		trayId: string;
		name: string;
		letter: string;
		width: number;
		depth: number;
		height: number;
		color: string;
	}

	interface Props {
		geometry: BufferGeometry | null;
		allTrays?: TrayGeometryData[];
		allBoxes?: BoxGeometryData[];
		boxGeometry?: BufferGeometry | null;
		lidGeometry?: BufferGeometry | null;
		printBedSize: number;
		exploded?: boolean;
		showAllTrays?: boolean;
		showAllBoxes?: boolean;
		boxWallThickness?: number;
		boxTolerance?: number;
		boxFloorThickness?: number;
		explosionAmount?: number;
		showCounters?: boolean;
		selectedTrayCounters?: (CounterStack | CardStack)[];
		selectedTrayLetter?: string;
		selectedTrayId?: string;
		triangleCornerRadius?: number;
		showReferenceLabels?: boolean;
		hidePrintBed?: boolean;
		viewTitle?: string;
		onCaptureReady?: (captureFunc: (options: CaptureOptions) => string) => void;
		isLayoutEditMode?: boolean;
		onTrayClick?: (info: TrayClickInfo | null) => void;
		onTrayDoubleClick?: (trayId: string) => void;
		generating?: boolean;
	}

	let {
		geometry,
		allTrays = [],
		allBoxes = [],
		boxGeometry = null,
		lidGeometry = null,
		printBedSize,
		exploded = false,
		showAllTrays = false,
		showAllBoxes = false,
		boxWallThickness = 3,
		boxTolerance = 0.5,
		boxFloorThickness = 2,
		explosionAmount = 0,
		showCounters = false,
		selectedTrayCounters = [],
		selectedTrayLetter = 'A',
		selectedTrayId = '',
		triangleCornerRadius = 1.5,
		showReferenceLabels = false,
		hidePrintBed = false,
		viewTitle = '',
		onCaptureReady,
		isLayoutEditMode = false,
		onTrayClick,
		onTrayDoubleClick,
		generating = false
	}: Props = $props();

	// Get Threlte context for capture
	const { renderer, scene, camera } = useThrelte();

	// Billboard quaternion for text labels - updated each frame to face camera
	let labelQuaternion = $state<[number, number, number, number]>([0, 0, 0, 1]);

	// Capture mode - when true, use fixed top-down rotation instead of billboard
	let captureMode = $state(false);
	// Top-down quaternion: -90° around X axis to lay flat facing up
	const topDownQuaternion: [number, number, number, number] = [-0.707, 0, 0, 0.707];

	// Hovered label state for tooltip
	let hoveredLabel = $state<{
		refCode: string;
		text: string;
		position: [number, number, number];
	} | null>(null);

	// Monospace font for consistent character width in labels
	const monoFont = '/fonts/JetBrainsMono-Regular.ttf';

	// Layout edit mode state
	let editModeHoveredTrayId = $state<string | null>(null);

	// Drag state - kept local to component, following PointerInputManager pattern
	// pendingDrag is set on pointerdown, actualDrag is set once movement threshold is exceeded
	let pendingDrag = $state<{
		trayId: string;
		startX: number;
		startY: number;
		originalTrayX: number;
		originalTrayY: number;
	} | null>(null);
	let actualDrag = $state(false);

	// Fade transition for edit mode (instead of camera animation)
	// Phases: 'normal' -> 'fading-to-edit' -> 'edit' -> 'fading-to-normal' -> 'normal'
	type TransitionPhase = 'normal' | 'fading-to-edit' | 'edit' | 'fading-to-normal';
	let transitionPhase = $state<TransitionPhase>('normal');
	let normalSceneOpacity = $state(1);
	let editSceneOpacity = $state(0);
	let fadeProgress = $state(0);
	const FADE_DURATION = 0.3; // seconds

	// Saved camera state for returning from edit mode
	let savedCameraPosition = $state<THREE.Vector3 | null>(null);
	let savedCameraTarget = $state<THREE.Vector3 | null>(null);

	// Visual edit mode - only true after fade-out completes (used for Grid/PrintBed positioning)
	// This prevents visual jumps during the fade transition
	let visualEditMode = $derived(
		transitionPhase === 'edit' || transitionPhase === 'fading-to-normal'
	);

	// Fade overlay opacity for transition effect
	// Key insight: overlay must appear IMMEDIATELY when isLayoutEditMode changes,
	// before the effect runs, to hide any scene jumps
	let fadeOverlayOpacity = $derived.by(() => {
		// If mode is changing but visual hasn't caught up, show overlay immediately
		// This runs synchronously with the prop change, before effects
		if (isLayoutEditMode !== visualEditMode) return 1;

		// During fade-in phases (after camera jump), fade out the overlay
		if (transitionPhase === 'edit' && editSceneOpacity < 1) return 1 - editSceneOpacity;
		if (transitionPhase === 'normal' && normalSceneOpacity < 1) return 1 - normalSceneOpacity;
		return 0;
	});

	// Get layout editor state - use $derived.by() to properly track reactive reads from store
	let workingPlacements = $derived.by(() => layoutEditorState.workingPlacements);
	let layoutSelectedTrayId = $derived.by(() => layoutEditorState.selectedTrayId);

	// Force reactivity tracking by reading all layout editor values in $effect
	$effect(() => {
		// Reading these values ensures Svelte tracks them for reactivity
		void [isLayoutEditMode, workingPlacements.length, layoutSelectedTrayId];
	});

	let snapGuides = $derived(layoutEditorState.activeSnapGuides);

	// Threlte event handlers for the interaction plane
	function handlePlanePointerMove(e: IntersectionEvent<PointerEvent>) {
		if (!isLayoutEditMode || !pendingDrag) return;

		const floorPos = e.point;
		if (!floorPos) return;

		const deltaX = floorPos.x - pendingDrag.startX;
		const deltaY = -(floorPos.z - pendingDrag.startY);
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Only process if there's meaningful movement (threshold of 2mm)
		if (distance > 2) {
			if (!actualDrag) {
				actualDrag = true;
			}

			const trayId = pendingDrag.trayId;
			const newX = pendingDrag.originalTrayX + deltaX;
			const newY = pendingDrag.originalTrayY + deltaY;

			const placement = workingPlacements.find((p) => p.trayId === trayId);
			if (placement) {
				const boundsW = layoutEditorState.boundsWidth;
				const boundsD = layoutEditorState.boundsDepth;
				const snapResult = snapPosition(placement, newX, newY, workingPlacements, boundsW, boundsD);
				updateTrayPosition(trayId, snapResult.x, snapResult.y);
				setSnapGuides(snapResult.guides);
			}
		}
	}

	function handlePlanePointerUp(_e: IntersectionEvent<PointerEvent>) {
		if (!isLayoutEditMode) return;
		pendingDrag = null;
		actualDrag = false;
		clearSnapGuides();
	}

	function handlePlanePointerDown(_e: IntersectionEvent<PointerEvent>) {
		// Click on background (plane) deselects - but only if a tray wasn't just clicked
		// (pendingDrag being set means a tray's onpointerdown already fired for this click)
		if (!isLayoutEditMode) return;
		if (pendingDrag) return;
		pendingDrag = null;
		actualDrag = false;
		selectTray(null);
	}

	// Track previous edit mode state to detect transitions
	let wasInEditMode = $state(false);

	// Start fade transition when edit mode changes
	$effect(() => {
		const currentEditMode = isLayoutEditMode;

		untrack(() => {
			if (!camera.current) return;
			const cam = camera.current as THREE.PerspectiveCamera;

			if (currentEditMode && !wasInEditMode) {
				// Entering edit mode - start fading out normal scene
				savedCameraPosition = cam.position.clone();
				savedCameraTarget = new THREE.Vector3(0, 0, 0);
				transitionPhase = 'fading-to-edit';
				fadeProgress = 0;
			} else if (!currentEditMode && wasInEditMode) {
				// Exiting edit mode - start fading out edit scene
				transitionPhase = 'fading-to-normal';
				fadeProgress = 0;
			}

			wasInEditMode = currentEditMode;
		});
	});

	// Fade transition animation task
	useTask((delta) => {
		if (transitionPhase === 'normal' || transitionPhase === 'edit') return;
		if (!camera.current) return;

		const cam = camera.current as THREE.PerspectiveCamera;
		fadeProgress += delta / FADE_DURATION;
		const t = Math.min(fadeProgress, 1);
		// Ease out for smoother fade
		const easeT = 1 - Math.pow(1 - t, 2);

		if (transitionPhase === 'fading-to-edit') {
			// First half: fade out normal scene
			if (fadeProgress < 1) {
				normalSceneOpacity = 1 - easeT;
				editSceneOpacity = 0;
			} else {
				// Halfway point: jump camera to edit mode position, start fading in edit scene
				normalSceneOpacity = 0;

				const editModeHeight = Math.max(printBedSize * 1.5, 400);
				cam.position.set(editModeCenter.x, editModeHeight, editModeCenter.z + 0.01);
				cam.lookAt(editModeCenter.x, 0, editModeCenter.z);

				// Start fade in
				fadeProgress = 0;
				editSceneOpacity = 0;
				transitionPhase = 'edit';
				// We'll fade in the edit scene in the next block
			}
		} else if (transitionPhase === 'fading-to-normal') {
			// First half: fade out edit scene
			if (fadeProgress < 1) {
				editSceneOpacity = 1 - easeT;
				normalSceneOpacity = 0;
			} else {
				// Halfway point: jump camera back to saved position, start fading in normal scene
				editSceneOpacity = 0;

				if (savedCameraPosition && savedCameraTarget) {
					cam.position.copy(savedCameraPosition);
					cam.lookAt(savedCameraTarget);
				}

				// Clear saved state
				savedCameraPosition = null;
				savedCameraTarget = null;

				// Start fade in
				fadeProgress = 0;
				normalSceneOpacity = 0;
				transitionPhase = 'normal';
			}
		}
	});

	// Fade in after camera jump (separate task to handle the fade-in phase)
	useTask((delta) => {
		// Handle fade-in after transition completes
		if (transitionPhase === 'edit' && editSceneOpacity < 1) {
			fadeProgress += delta / FADE_DURATION;
			const t = Math.min(fadeProgress, 1);
			const easeT = 1 - Math.pow(1 - t, 2);
			editSceneOpacity = easeT;
		} else if (transitionPhase === 'normal' && normalSceneOpacity < 1) {
			fadeProgress += delta / FADE_DURATION;
			const t = Math.min(fadeProgress, 1);
			const easeT = 1 - Math.pow(1 - t, 2);
			normalSceneOpacity = easeT;
		}
	});

	// Generate a display label from a counter stack
	function getStackLabel(stack: CounterStack): string {
		// Use user-provided label if available
		if (stack.label) {
			return `${stack.label} x${stack.count}`;
		}
		// Fall back to shape name
		const shapeName = stack.shape === 'custom' ? (stack.customShapeName ?? 'custom') : stack.shape;
		return `${shapeName} x${stack.count}`;
	}

	function getCardStackLabel(stack: CardStack): string {
		return `cards x${stack.count}`;
	}

	// Update label rotation each frame to face the camera (true billboard)
	useTask(() => {
		if (camera.current) {
			// Copy the camera's quaternion so text always faces the camera directly
			const q = camera.current.quaternion;
			labelQuaternion = [q.x, q.y, q.z, q.w];
		}
	});

	// Expose capture function when Threlte is ready
	$effect(() => {
		if (onCaptureReady && renderer && scene && camera.current) {
			const captureFunc = (
				options: CaptureOptions & { bounds?: { width: number; depth: number; height: number } }
			) => {
				const cam = camera.current as THREE.PerspectiveCamera;

				// If bounds provided, temporarily reposition camera for optimal framing
				if (options.bounds && cam.isPerspectiveCamera) {
					const savedPosition = cam.position.clone();
					const savedQuaternion = cam.quaternion.clone();
					const savedUp = cam.up.clone();

					// Top-down view: position camera directly above looking down
					const trayWidth = options.bounds.width;
					const trayDepth = options.bounds.depth;
					const captureAspect = options.width / options.height;

					// For 16:9 capture, rotate view 90° if tray is deeper than wide
					// This maximizes tray size by aligning longer dimension with wider frame edge
					const shouldRotate = trayDepth > trayWidth;
					const effectiveWidth = shouldRotate ? trayDepth : trayWidth;
					const effectiveDepth = shouldRotate ? trayWidth : trayDepth;

					// Camera FOV is vertical (50 degrees)
					const vFovRad = (50 * Math.PI) / 180;
					// Calculate horizontal FOV based on aspect ratio
					const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * captureAspect);

					// Calculate distance needed to fit dimensions in frame
					const distanceForWidth = effectiveWidth / 2 / Math.tan(hFovRad / 2);
					const distanceForDepth = effectiveDepth / 2 / Math.tan(vFovRad / 2);

					// Use the larger distance with padding for labels
					const distance = Math.max(distanceForWidth, distanceForDepth) * 1.4;

					// Position camera directly above origin (meshOffset centers the tray at origin)
					cam.position.set(0, distance, 0);
					cam.up.set(0, 0, -1);
					cam.lookAt(0, 0, 0);
					// Rotate view 90° around the camera's view axis if tray is deeper than wide
					if (shouldRotate) {
						cam.rotateZ(Math.PI / 2);
					}
					cam.updateProjectionMatrix();

					// Capture
					const dataUrl = captureSceneToDataUrl(renderer, scene, cam, options);

					// Restore camera
					cam.position.copy(savedPosition);
					cam.quaternion.copy(savedQuaternion);
					cam.up.copy(savedUp);
					cam.updateProjectionMatrix();

					return dataUrl;
				}

				return captureSceneToDataUrl(renderer, scene, cam, options);
			};

			// Expose capture function and capture mode setter
			const captureApi = Object.assign(captureFunc, {
				setCaptureMode: (mode: boolean) => {
					captureMode = mode;
				}
			});
			onCaptureReady(captureApi);
		}
	});

	// Create rounded triangle geometry for counter previews
	// Matches the JSCAD hull-of-circles approach from counterTray.ts
	function createRoundedTriangleGeometry(
		side: number,
		thickness: number,
		cornerRadius: number
	): BufferGeometry {
		const r = cornerRadius;
		const triHeight = side * (Math.sqrt(3) / 2);

		// Circle centers matching JSCAD counterTray.ts createTrianglePrism
		const insetX = side / 2 - r;
		const insetYBottom = -triHeight / 2 + r;
		const insetYTop = triHeight / 2 - r * 2;

		const BL = { x: -insetX, y: insetYBottom };
		const BR = { x: insetX, y: insetYBottom };
		const T = { x: 0, y: insetYTop };

		// Calculate direction vectors and perpendiculars for tangent points
		// Left edge: BL to T
		const BL_T_len = Math.sqrt((T.x - BL.x) ** 2 + (T.y - BL.y) ** 2);
		const BL_T_dir = { x: (T.x - BL.x) / BL_T_len, y: (T.y - BL.y) / BL_T_len };
		const BL_T_perp = { x: -BL_T_dir.y, y: BL_T_dir.x }; // perpendicular (outward)

		// Right edge: T to BR
		const T_BR_len = Math.sqrt((BR.x - T.x) ** 2 + (BR.y - T.y) ** 2);
		const T_BR_dir = { x: (BR.x - T.x) / T_BR_len, y: (BR.y - T.y) / T_BR_len };
		const T_BR_perp = { x: -T_BR_dir.y, y: T_BR_dir.x }; // perpendicular (outward)

		// Tangent points
		const BL_bottom = { x: BL.x, y: BL.y - r };
		const BL_left = { x: BL.x + r * BL_T_perp.x, y: BL.y + r * BL_T_perp.y };
		const T_left = { x: T.x + r * BL_T_perp.x, y: T.y + r * BL_T_perp.y };
		const T_right = { x: T.x + r * T_BR_perp.x, y: T.y + r * T_BR_perp.y };
		const BR_right = { x: BR.x + r * T_BR_perp.x, y: BR.y + r * T_BR_perp.y };
		const BR_bottom = { x: BR.x, y: BR.y - r };

		// Angles for arcs (from center to tangent point)
		const angleBL_bottom = Math.atan2(BL_bottom.y - BL.y, BL_bottom.x - BL.x);
		const angleBL_left = Math.atan2(BL_left.y - BL.y, BL_left.x - BL.x);
		const angleT_left = Math.atan2(T_left.y - T.y, T_left.x - T.x);
		const angleT_right = Math.atan2(T_right.y - T.y, T_right.x - T.x);
		const angleBR_right = Math.atan2(BR_right.y - BR.y, BR_right.x - BR.x);
		const angleBR_bottom = Math.atan2(BR_bottom.y - BR.y, BR_bottom.x - BR.x);

		const shape = new THREE.Shape();

		// Start at bottom-left tangent point
		shape.moveTo(BL_bottom.x, BL_bottom.y);

		// Bottom edge to BR
		shape.lineTo(BR_bottom.x, BR_bottom.y);

		// Arc around BR (clockwise from bottom to right-edge tangent)
		shape.absarc(BR.x, BR.y, r, angleBR_bottom, angleBR_right, false);

		// Right edge to T
		shape.lineTo(T_right.x, T_right.y);

		// Arc around T (clockwise from right to left)
		shape.absarc(T.x, T.y, r, angleT_right, angleT_left, false);

		// Left edge to BL
		shape.lineTo(BL_left.x, BL_left.y);

		// Arc around BL (clockwise from left to bottom)
		shape.absarc(BL.x, BL.y, r, angleBL_left, angleBL_bottom, false);

		const extrudeSettings = {
			depth: thickness,
			bevelEnabled: false
		};

		const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
		// Center the geometry along extrusion axis, and adjust Y for asymmetric top inset
		geom.translate(0, r / 2, -thickness / 2);
		return geom;
	}

	// Interior offset from box origin (wall + tolerance)
	let interiorStartOffset = $derived(boxWallThickness + boxTolerance);

	// Helper to get geometry bounds
	function getGeomBounds(geom: BufferGeometry | null): THREE.Box3 | null {
		if (!geom) return null;
		geom.computeBoundingBox();
		return geom.boundingBox;
	}

	// Individual geometry bounds
	let boxBounds = $derived(getGeomBounds(boxGeometry));
	let lidBounds = $derived(getGeomBounds(lidGeometry));

	// Gap between objects in side-by-side view
	const sideGap = 20;

	// Calculate total depth of trays group (accounting for bin-packing)
	let traysGroupDepth = $derived.by(() => {
		if (allTrays.length === 0) return 0;
		// With bin-packing, trays can share rows. Total depth is max(y + depth)
		return Math.max(...allTrays.map((t) => t.placement.y + t.placement.dimensions.depth));
	});

	// Calculate side-by-side positions for "All" view (box | trays-in-box | lid)
	// After -90° X rotation, geometry spans from position.z - depth to position.z
	// To align back edges at Z=0, we set position.z = depth
	let sidePositions = $derived.by(() => {
		if (!showAllTrays || exploded) {
			return { box: { x: 0, z: 0 }, traysGroup: { x: 0, z: 0 }, lid: { x: 0, z: 0 } };
		}

		// In "All" mode, show: Box | Trays (stacked) | Lid
		// Each at their own X position, with back edges aligned at Z=0
		const items: { key: string; width: number; depth: number }[] = [];

		if (boxGeometry && boxBounds) {
			items.push({
				key: 'box',
				width: boxBounds.max.x - boxBounds.min.x,
				depth: boxBounds.max.y - boxBounds.min.y
			});
		}

		// Trays group
		if (allTrays.length > 0) {
			const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width));
			items.push({
				key: 'traysGroup',
				width: maxTrayWidth,
				depth: traysGroupDepth
			});
		}

		if (lidGeometry && lidBounds) {
			items.push({
				key: 'lid',
				width: lidBounds.max.x - lidBounds.min.x,
				depth: lidBounds.max.y - lidBounds.min.y
			});
		}

		const totalWidth = items.reduce((sum, w) => sum + w.width, 0) + (items.length - 1) * sideGap;
		let currentX = -totalWidth / 2;
		const positions = {
			box: { x: 0, z: 0 },
			traysGroup: { x: 0, z: 0 },
			lid: { x: 0, z: 0 }
		};

		for (const item of items) {
			if (item.key === 'box' || item.key === 'traysGroup' || item.key === 'lid') {
				positions[item.key] = {
					x: currentX + item.width / 2,
					z: item.depth // Back edge at Z=0, front at Z=depth
				};
			}
			currentX += item.width + sideGap;
		}

		return positions;
	});

	// Calculate positions for all boxes in multi-box view (using print bed size for spacing)
	let boxPositions = $derived.by(() => {
		if (!showAllBoxes || allBoxes.length === 0) return [];

		// Each box gets its own print bed, so use printBedSize for arrangement
		const bedDims = allBoxes.map(() => ({
			width: printBedSize,
			depth: printBedSize
		}));

		return arrangeBoxes(bedDims, sideGap);
	});

	// Combined bounds for camera positioning
	let allGeometries = $derived.by(() => {
		const geoms: BufferGeometry[] = [];
		if (geometry) geoms.push(geometry);
		if (boxGeometry) geoms.push(boxGeometry);
		if (lidGeometry) geoms.push(lidGeometry);
		for (const t of allTrays) {
			geoms.push(t.geometry);
		}
		return geoms;
	});

	let combinedBounds = $derived.by(() => {
		if (allGeometries.length === 0) return null;

		const box = new THREE.Box3();
		for (const geom of allGeometries) {
			geom.computeBoundingBox();
			if (geom.boundingBox) {
				box.union(geom.boundingBox);
			}
		}
		return box;
	});

	// Mesh offset for single geometry centering
	let meshOffset = $derived.by(() => {
		if (!combinedBounds) return { x: 0, z: 0 };
		return {
			x: -(combinedBounds.max.x + combinedBounds.min.x) / 2,
			z: (combinedBounds.max.y + combinedBounds.min.y) / 2
		};
	});

	// Edit mode bounds from layout editor (interior size, accounting for walls)
	let editBoundsWidth = $derived(layoutEditorState.boundsWidth);
	let editBoundsDepth = $derived(layoutEditorState.boundsDepth);

	// Edit mode center - uses interior bounds, not print bed size
	let editModeCenter = $derived.by(() => {
		return {
			x: meshOffset.x + interiorStartOffset + editBoundsWidth / 2,
			z: meshOffset.z - interiorStartOffset - editBoundsDepth / 2
		};
	});

	// Log edit mode center changes
	// Exploded view offsets - lid slides out first, then trays lift
	// Lid slides along longest dimension of box
	let explodedOffset = $derived.by(() => {
		if (!exploded)
			return {
				box: 0,
				trays: 0,
				lidY: 0,
				lidSlideX: 0,
				lidSlideZ: 0,
				maxSlideX: 0,
				maxSlideZ: 0,
				slidesAlongX: false
			};
		// Get box dimensions for positioning
		const boxHeight = boxBounds ? boxBounds.max.z - boxBounds.min.z : 0;
		const boxWidth = boxBounds ? boxBounds.max.x - boxBounds.min.x : 0;
		const boxDepth = boxBounds ? boxBounds.max.y - boxBounds.min.y : 0;
		// Lid lip height = wall thickness
		const lipHeight = boxWallThickness;

		// Determine slide direction based on longest dimension
		const slidesAlongX = boxWidth > boxDepth;

		// Two-phase explosion:
		// Phase 1 (0-50%): Lid slides out
		// Phase 2 (50-100%): Trays lift up
		const slidePhase = Math.min(explosionAmount / 50, 1);
		const liftPhase = Math.max((explosionAmount - 50) / 50, 0);

		// Lid slides out along longest dimension
		const slideLength = slidesAlongX ? boxWidth : boxDepth;
		const maxSlideDistance = slideLength + boxHeight * 0.5;
		const lidSlideDistance = maxSlideDistance * slidePhase;
		const trayLiftDistance = boxHeight * liftPhase;

		return {
			box: 0,
			trays: trayLiftDistance,
			lidY: boxHeight - lipHeight,
			lidSlideX: slidesAlongX ? lidSlideDistance : 0,
			lidSlideZ: slidesAlongX ? 0 : lidSlideDistance,
			maxSlideX: slidesAlongX ? maxSlideDistance : 0,
			maxSlideZ: slidesAlongX ? 0 : maxSlideDistance,
			slidesAlongX
		};
	});

	// Get live tray color from project store (for reactive updates)
	function getTrayColor(trayId: string, fallbackIndex: number): string {
		const project = getProject();
		for (const box of project.boxes) {
			const tray = box.trays.find((t) => t.id === trayId);
			if (tray?.color) return tray.color;
		}
		return TRAY_COLORS[fallbackIndex % TRAY_COLORS.length];
	}
</script>

<T.PerspectiveCamera
	makeDefault
	position={[printBedSize * 1.0, printBedSize * 0.8, printBedSize * 1.5]}
	fov={50}
>
	{@const isTransitioning =
		transitionPhase === 'fading-to-edit' ||
		transitionPhase === 'fading-to-normal' ||
		(transitionPhase === 'edit' && editSceneOpacity < 1) ||
		(transitionPhase === 'normal' && normalSceneOpacity < 1)}
	<OrbitControls
		target={visualEditMode ? [editModeCenter.x, 0, editModeCenter.z] : [0, 0, printBedSize / 2]}
		enableDamping={!isTransitioning}
		enabled={!isTransitioning}
		enableRotate={!visualEditMode && !isTransitioning}
		enablePan={!visualEditMode && !isTransitioning}
		enableZoom={!isTransitioning}
	/>
	<!-- Fade overlay - positioned in front of camera, fades to black during transitions -->
	{#if fadeOverlayOpacity > 0}
		<T.Mesh position.z={-1} renderOrder={999}>
			<T.PlaneGeometry args={[10, 10]} />
			<T.MeshBasicMaterial
				color="#1a1a1a"
				transparent
				opacity={fadeOverlayOpacity}
				depthTest={false}
				depthWrite={false}
			/>
		</T.Mesh>
	{/if}
</T.PerspectiveCamera>

<T.DirectionalLight position={[50, 100, 50]} intensity={1.5} />
<T.DirectionalLight position={[-50, 50, -50]} intensity={0.5} />
<T.DirectionalLight
	position={[0, 20, -80]}
	intensity={0.3}
/><!-- Subtle backlight for rim definition -->
<T.AmbientLight intensity={0.4} />

<!-- Background grid for multi-box view (subtle, at world origin for alignment) -->
{#if showAllBoxes && !hidePrintBed}
	<Grid
		position.y={-0.51}
		cellColor="#2a2a2a"
		sectionColor="#5a3530"
		sectionThickness={1}
		cellSize={10}
		sectionSize={50}
		gridSize={[2000, 2000]}
		fadeDistance={1000}
		fadeStrength={2}
	/>
{/if}

<!-- Invisible interaction plane for deselecting in edit mode -->
{#if visualEditMode}
	<T.Mesh
		rotation.x={-Math.PI / 2}
		position.x={editModeCenter.x}
		position.y={-0.6}
		position.z={editModeCenter.z}
		onpointerdown={() => {
			selectTray(null);
		}}
	>
		<T.PlaneGeometry args={[editBoundsWidth, editBoundsDepth]} />
		<T.MeshBasicMaterial visible={false} />
	</T.Mesh>
{/if}

<!-- Multi-box view: All boxes arranged side by side with their own bed planes -->
{#if !generating && showAllBoxes && allBoxes.length > 0}
	{#each allBoxes as boxData, boxIndex (boxData.boxId)}
		{@const boxPos = boxPositions[boxIndex]}
		{@const boxWidth = boxData.boxDimensions.width}
		{@const boxDepth = boxData.boxDimensions.depth}
		{@const xOffset = boxPos?.x ?? 0}
		{@const zOffset = printBedSize / 2}
		<!-- Compute geometry bounds for proper centering -->
		{@const boxGeomBounds = boxData.boxGeometry ? getGeomBounds(boxData.boxGeometry) : null}
		{@const boxCenterX = boxGeomBounds
			? -(boxGeomBounds.max.x + boxGeomBounds.min.x) / 2
			: -boxWidth / 2}
		{@const boxCenterZ = boxGeomBounds
			? (boxGeomBounds.max.y + boxGeomBounds.min.y) / 2
			: boxDepth / 2}

		<!-- Print bed for this box -->
		<PrintBed size={printBedSize} title={boxData.boxName} position={[xOffset, 0, zOffset]} />

		<!-- Box geometry (without lid) -->
		{#if boxData.boxGeometry}
			<T.Mesh
				geometry={boxData.boxGeometry}
				rotation.x={-Math.PI / 2}
				position.x={xOffset + boxCenterX}
				position.y={0}
				position.z={zOffset + boxCenterZ}
				onclick={() => onTrayClick?.(null)}
			>
				<T.MeshStandardMaterial
					color="#333333"
					roughness={0.6}
					metalness={0.1}
					side={THREE.DoubleSide}
				/>
			</T.Mesh>
		{/if}

		<!-- Trays inside this box - using T.Group so counters rotate with tray -->
		{#each boxData.trayGeometries as trayData, trayIndex (trayData.trayId)}
			{@const placement = trayData.placement}
			{@const isRotated = placement.rotated}
			{@const groupX =
				xOffset +
				boxCenterX +
				(boxGeomBounds?.min.x ?? 0) +
				boxWallThickness +
				boxTolerance +
				placement.x +
				(isRotated ? placement.dimensions.width : 0)}
			{@const groupZ =
				zOffset +
				boxCenterZ -
				(boxGeomBounds?.min.y ?? 0) -
				boxWallThickness -
				boxTolerance -
				placement.y}
			{@const groupY = boxFloorThickness}
			{@const cumulativeTrayIdx =
				allBoxes.slice(0, boxIndex).reduce((sum, b) => sum + b.trayGeometries.length, 0) +
				trayIndex}
			<T.Group
				position.x={groupX}
				position.y={groupY}
				position.z={groupZ}
				rotation.y={isRotated ? Math.PI / 2 : 0}
			>
				<T.Mesh
					geometry={trayData.geometry}
					rotation.x={-Math.PI / 2}
					onclick={(e: IntersectionEvent<MouseEvent>) => {
						e.stopPropagation();
						const dims = trayData.placement.dimensions;
						onTrayClick?.({
							trayId: trayData.trayId,
							name: trayData.name,
							letter: trayData.trayLetter ?? getTrayLetter(cumulativeTrayIdx),
							width: dims.width,
							depth: dims.depth,
							height: dims.height,
							color: getTrayColor(trayData.trayId, trayIndex)
						});
					}}
					ondblclick={() => {
						if (!isLayoutEditMode) {
							onTrayDoubleClick?.(trayData.trayId);
						}
					}}
				>
					<T.MeshStandardMaterial
						color={getTrayColor(trayData.trayId, trayIndex)}
						roughness={0.6}
						metalness={0.1}
						side={THREE.DoubleSide}
					/>
				</T.Mesh>

				<!-- Counter previews for this tray - positions are in tray-local coords (hidden in edit mode) -->
				{#if showCounters && !isLayoutEditMode && trayData.counterStacks}
					{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
						{#if stack.isEdgeLoaded}
							{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
								{@const effectiveShape =
									stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
								{@const standingHeight =
									stack.isCardDivider && stack.cardDividerHeight
										? stack.cardDividerHeight
										: effectiveShape === 'triangle'
											? stack.length
											: stack.shape === 'custom'
												? Math.min(stack.width, stack.length)
												: Math.max(stack.width, stack.length)}
								{@const counterY = stack.z + standingHeight / 2}
								{@const isAlt = counterIdx % 2 === 1}
								{@const counterColor = isAlt
									? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
									: stack.color}
								{#if stack.edgeOrientation === 'lengthwise'}
									{@const counterSpacing =
										(stack.slotWidth ?? stack.count * stack.thickness) / stack.count}
									{@const posX = stack.x + (counterIdx + 0.5) * counterSpacing}
									{@const posZ = -stack.y - (stack.slotDepth ?? stack.length) / 2}
									{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
										<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
											<T.BoxGeometry args={[stack.thickness, standingHeight, stack.length]} />
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else if effectiveShape === 'circle'}
										<T.Mesh
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.z={Math.PI / 2}
										>
											<T.CylinderGeometry
												args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
											/>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else if effectiveShape === 'hex'}
										<T.Mesh
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.z={Math.PI / 2}
											rotation.x={stack.hexPointyTop ? 0 : Math.PI / 6}
										>
											<T.CylinderGeometry
												args={[stack.width / 2, stack.width / 2, stack.thickness, 6]}
											/>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else}
										{@const triGeom = createRoundedTriangleGeometry(
											stack.width,
											stack.thickness,
											triangleCornerRadius
										)}
										<T.Mesh
											geometry={triGeom}
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.y={Math.PI / 2}
											rotation.x={Math.PI}
										>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{/if}
								{:else}
									{@const counterSpacing =
										(stack.slotDepth ?? stack.count * stack.thickness) / stack.count}
									{@const posX = stack.x + (stack.slotWidth ?? stack.length) / 2}
									{@const posZ = -stack.y - (counterIdx + 0.5) * counterSpacing}
									{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
										<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
											<T.BoxGeometry args={[stack.length, standingHeight, stack.thickness]} />
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else if effectiveShape === 'circle'}
										<T.Mesh
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.x={Math.PI / 2}
										>
											<T.CylinderGeometry
												args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
											/>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else if effectiveShape === 'hex'}
										<T.Mesh
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.x={Math.PI / 2}
											rotation.y={stack.hexPointyTop ? Math.PI / 6 : 0}
										>
											<T.CylinderGeometry
												args={[stack.width / 2, stack.width / 2, stack.thickness, 6]}
											/>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{:else}
										{@const triGeom = createRoundedTriangleGeometry(
											stack.width,
											stack.thickness,
											triangleCornerRadius
										)}
										<T.Mesh
											geometry={triGeom}
											position.x={posX}
											position.y={counterY}
											position.z={posZ}
											rotation.x={Math.PI}
										>
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{/if}
								{/if}
							{/each}
						{:else}
							<!-- Top-loaded counters -->
							{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
								{@const counterZ = stack.z + counterIdx * stack.thickness + stack.thickness / 2}
								{@const posX = stack.x}
								{@const posY = counterZ}
								{@const posZ = -stack.y}
								{@const isAlt = counterIdx % 2 === 1}
								{@const counterColor = isAlt
									? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
									: stack.color}
								{@const effectiveShape =
									stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
								{@const isSleevedCard = stack.innerWidth && stack.innerLength}
								{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
									{#if isSleevedCard}
										<!-- Sleeved card: transparent sleeve with inner card -->
										{@const sleeveColor = isAlt ? '#88c8e8' : '#78b8d8'}
										{@const innerCardColor = isAlt ? '#2a5a74' : '#1a4a64'}
										<T.Mesh
											position.x={posX}
											position.y={posY}
											position.z={posZ}
											rotation.x={stack.slopeAngle ?? 0}
										>
											<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
											<T.MeshStandardMaterial
												color={sleeveColor}
												transparent
												opacity={0.4}
												roughness={0.3}
												metalness={0.1}
											/>
										</T.Mesh>
										<T.Mesh
											position.x={posX}
											position.y={posY}
											position.z={posZ}
											rotation.x={stack.slopeAngle ?? 0}
										>
											<T.BoxGeometry
												args={[stack.innerWidth, stack.thickness * 0.6, stack.innerLength]}
											/>
											<T.MeshStandardMaterial
												color={innerCardColor}
												roughness={0.5}
												metalness={0.1}
											/>
										</T.Mesh>
									{:else}
										<T.Mesh
											position.x={posX}
											position.y={posY}
											position.z={posZ}
											rotation.x={stack.slopeAngle ?? 0}
										>
											<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
											<T.MeshStandardMaterial
												color={counterColor}
												roughness={0.4}
												metalness={0.2}
											/>
										</T.Mesh>
									{/if}
								{:else if effectiveShape === 'circle'}
									<T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
										<T.CylinderGeometry
											args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
										/>
										<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
									</T.Mesh>
								{:else if effectiveShape === 'hex'}
									<T.Mesh
										position.x={posX}
										position.y={posY}
										position.z={posZ}
										rotation.y={stack.hexPointyTop ? 0 : Math.PI / 6}
									>
										<T.CylinderGeometry
											args={[stack.width / 2, stack.width / 2, stack.thickness, 6]}
										/>
										<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
									</T.Mesh>
								{:else}
									<!-- Back-row triangles need 180° rotation around Z to face their finger cutout -->
									{@const triGeom = createRoundedTriangleGeometry(
										stack.width,
										stack.thickness,
										triangleCornerRadius
									)}
									{@const isBackRow = stack.rowAssignment === 'back'}
									<T.Mesh
										geometry={triGeom}
										position.x={posX}
										position.y={posY}
										position.z={posZ}
										rotation.x={-Math.PI / 2}
										rotation.y={Math.PI}
										rotation.z={isBackRow ? Math.PI : 0}
									>
										<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
									</T.Mesh>
								{/if}
							{/each}
						{/if}
					{/each}
				{/if}
			</T.Group>
		{/each}
	{/each}
{/if}

<!-- Box geometry (single box view) - hidden during edit mode -->
{#if !generating && boxGeometry && !showAllBoxes && !visualEditMode}
	{@const boxWidth = boxBounds ? boxBounds.max.x - boxBounds.min.x : 0}
	<T.Mesh
		geometry={boxGeometry}
		rotation.x={-Math.PI / 2}
		position.x={showAllTrays && !exploded ? sidePositions.box.x - boxWidth / 2 : meshOffset.x}
		position.y={explodedOffset.box}
		position.z={showAllTrays && !exploded ? sidePositions.box.z : meshOffset.z}
		onclick={() => onTrayClick?.(null)}
	>
		<T.MeshStandardMaterial
			color="#333333"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Layout Edit Mode: Render trays from working placements with selection -->
{#if !generating}
	{#if visualEditMode && workingPlacements.length > 0}
		{#each workingPlacements as placement, i (placement.trayId)}
			{@const dims = getEffectiveDimensions(placement)}
			{@const trayData = allTrays.find((t) => t.trayId === placement.trayId)}
			{@const isSelected = placement.trayId === layoutSelectedTrayId}
			{@const isHovered = placement.trayId === editModeHoveredTrayId}
			{@const isRotated = placement.rotation === 90 || placement.rotation === 270}
			<!-- Position: use current meshOffset - camera animates to match this position -->
			{@const groupX =
				meshOffset.x + interiorStartOffset + placement.x + (isRotated ? dims.width : 0)}
			{@const groupY = 0}
			{@const groupZ = meshOffset.z - interiorStartOffset - placement.y}
			{#if trayData}
				<!-- Get actual geometry dimensions (un-rotate if bin-packing rotated it) -->
				{@const binPackRotated = trayData.placement.rotated}
				{@const layoutDims = trayData.placement.dimensions}
				{@const geomWidth = binPackRotated ? layoutDims.depth : layoutDims.width}
				{@const geomDepth = binPackRotated ? layoutDims.width : layoutDims.depth}
				{@const geomHeight = layoutDims.height}
				<T.Group
					position.x={groupX}
					position.y={groupY}
					position.z={groupZ}
					rotation.y={isRotated ? Math.PI / 2 : 0}
				>
					<!-- Tray geometry (same as normal rendering) -->
					<T.Mesh geometry={trayData.geometry} rotation.x={-Math.PI / 2}>
						<T.MeshStandardMaterial
							color={isSelected ? '#ffffff' : getTrayColor(placement.trayId, i)}
							roughness={0.6}
							metalness={0.1}
							side={THREE.DoubleSide}
							emissive={isSelected ? '#2060c0' : isHovered ? '#404040' : '#000000'}
							emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
						/>
					</T.Mesh>
					<!-- Invisible hit box for interaction - uses actual geometry dimensions -->
					<T.Mesh
						visible={false}
						rotation.x={-Math.PI / 2}
						position.x={geomWidth / 2}
						position.y={geomHeight / 2}
						position.z={-geomDepth / 2}
						onpointerdown={(e: IntersectionEvent<PointerEvent>) => {
							e.stopPropagation();
							selectTray(placement.trayId);

							// Start drag - store the intersection point for delta calculation
							const point = e.point;
							pendingDrag = {
								trayId: placement.trayId,
								startX: point ? point.x : placement.x,
								startY: point ? point.z : -placement.y,
								originalTrayX: placement.x,
								originalTrayY: placement.y
							};
							actualDrag = false;
						}}
						onpointerenter={() => {
							editModeHoveredTrayId = placement.trayId;
						}}
						onpointerleave={() => {
							editModeHoveredTrayId = null;
						}}
					>
						<T.BoxGeometry args={[geomWidth, geomDepth, geomHeight]} />
						<T.MeshBasicMaterial transparent opacity={0} />
					</T.Mesh>
					<!-- Selection wireframe - uses actual geometry dimensions -->
					{#if isSelected}
						{@const edgesGeom = new THREE.EdgesGeometry(
							new THREE.BoxGeometry(geomWidth, geomDepth, geomHeight)
						)}
						<T.LineSegments
							rotation.x={-Math.PI / 2}
							position.x={geomWidth / 2}
							position.y={geomHeight / 2}
							position.z={-geomDepth / 2}
							geometry={edgesGeom}
							oncreate={(ref) => {
								ref.computeLineDistances();
							}}
						>
							<T.LineDashedMaterial color="#ffffff" dashSize={3} gapSize={2} />
						</T.LineSegments>
					{/if}
				</T.Group>
			{/if}
		{/each}

		<!-- Interaction plane for drag tracking - covers the print bed area -->
		<!-- This catches pointermove and pointerup when the pointer leaves the tray meshes -->
		<T.Mesh
			rotation.x={-Math.PI / 2}
			position.x={editModeCenter.x}
			position.y={-0.1}
			position.z={editModeCenter.z}
			onpointerdown={handlePlanePointerDown}
			onpointermove={handlePlanePointerMove}
			onpointerup={handlePlanePointerUp}
		>
			<T.PlaneGeometry args={[printBedSize * 2, printBedSize * 2]} />
			<T.MeshBasicMaterial visible={false} />
		</T.Mesh>

		<!-- Snap guides - use meshOffset to match tray positions -->
		{#each snapGuides as guide, guideIdx (guideIdx)}
			{@const offsetX = meshOffset.x + interiorStartOffset}
			{@const offsetZ = meshOffset.z - interiorStartOffset}
			{@const geometry = new THREE.BufferGeometry().setFromPoints(
				guide.type === 'vertical'
					? [
							new THREE.Vector3(offsetX + guide.position, 0.5, offsetZ - guide.start),
							new THREE.Vector3(offsetX + guide.position, 0.5, offsetZ - guide.end)
						]
					: [
							new THREE.Vector3(offsetX + guide.start, 0.5, offsetZ - guide.position),
							new THREE.Vector3(offsetX + guide.end, 0.5, offsetZ - guide.position)
						]
			)}
			<T.Line args={[geometry]}>
				<T.LineBasicMaterial color="#c9503c" />
			</T.Line>
		{/each}
		<!-- All trays with positions (when showAllTrays is true, single box view) -->
	{:else if showAllTrays && !showAllBoxes && allTrays.length > 0}
		{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
		{@const maxTrayHeight = Math.max(...allTrays.map((t) => t.placement.dimensions.height))}
		{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
		{@const traySpacing = liftPhase * maxTrayHeight * 1.2}
		{#each allTrays as trayData, i (trayData.trayId)}
			{@const placement = trayData.placement}
			{@const isRotated = placement.rotated}
			{@const groupX = exploded
				? meshOffset.x +
					interiorStartOffset +
					placement.x +
					(isRotated ? placement.dimensions.width : 0)
				: sidePositions.traysGroup.x -
					maxTrayWidth / 2 +
					placement.x +
					(isRotated ? placement.dimensions.width : 0)}
			{@const groupY = exploded ? boxFloorThickness + explodedOffset.trays + i * traySpacing : 0}
			{@const groupZ = exploded
				? meshOffset.z - interiorStartOffset - placement.y
				: traysGroupDepth - placement.y}
			<T.Group
				position.x={groupX}
				position.y={groupY}
				position.z={groupZ}
				rotation.y={isRotated ? Math.PI / 2 : 0}
			>
				<T.Mesh
					geometry={trayData.geometry}
					rotation.x={-Math.PI / 2}
					onclick={(e: IntersectionEvent<MouseEvent>) => {
						e.stopPropagation();
						const dims = trayData.placement.dimensions;
						onTrayClick?.({
							trayId: trayData.trayId,
							name: trayData.name,
							letter: trayData.trayLetter ?? getTrayLetter(i),
							width: dims.width,
							depth: dims.depth,
							height: dims.height,
							color: getTrayColor(trayData.trayId, i)
						});
					}}
					ondblclick={() => {
						if (!isLayoutEditMode) {
							onTrayDoubleClick?.(trayData.trayId);
						}
					}}
				>
					<T.MeshStandardMaterial
						color={getTrayColor(trayData.trayId, i)}
						roughness={0.6}
						metalness={0.1}
						side={THREE.DoubleSide}
					/>
				</T.Mesh>
			</T.Group>
		{/each}
	{:else if geometry}
		<!-- Single selected tray -->
		<T.Mesh
			{geometry}
			rotation.x={-Math.PI / 2}
			position.x={meshOffset.x}
			position.y={0}
			position.z={meshOffset.z}
		>
			<T.MeshStandardMaterial
				color={getTrayColor(selectedTrayId, 0)}
				roughness={0.6}
				metalness={0.1}
				side={THREE.DoubleSide}
			/>
		</T.Mesh>
	{/if}
{/if}

<!-- Lid geometry (single box view) - hidden during edit mode -->
{#if !generating && lidGeometry && !showAllBoxes && !visualEditMode}
	{@const lidWidth = lidBounds ? lidBounds.max.x - lidBounds.min.x : 0}
	{@const lidHeight = lidBounds ? lidBounds.max.z - lidBounds.min.z : 0}
	{@const lidDepth = lidBounds ? lidBounds.max.y - lidBounds.min.y : 0}
	{@const slidesX = explodedOffset.slidesAlongX}
	<!-- When exploded: position lid on top of box, then slide it off toward exit -->
	<!-- Account for geometry bounds offset (min.x/min.y may not be 0) -->
	{@const lidPosX =
		showAllTrays && !exploded
			? sidePositions.lid.x - lidWidth / 2
			: exploded
				? slidesX
					? meshOffset.x + explodedOffset.lidSlideX // Start aligned, slide out in +X
					: meshOffset.x + lidWidth // After 180° Z rot, lid extends in -X, so add lidWidth to align
				: meshOffset.x}
	{@const lidPosZ =
		showAllTrays && !exploded
			? sidePositions.lid.z
			: exploded
				? slidesX
					? meshOffset.z - lidDepth // After +90° X rot, lid extends in +Z, so subtract lidDepth to align
					: meshOffset.z - explodedOffset.lidSlideZ // After rotations, slide in -Z direction
				: meshOffset.z}
	{@const lidRotZ = exploded ? (slidesX ? 0 : Math.PI) : 0}
	<T.Mesh
		geometry={lidGeometry}
		rotation.x={exploded ? Math.PI / 2 : -Math.PI / 2}
		rotation.z={lidRotZ}
		position.x={lidPosX}
		position.y={exploded ? explodedOffset.lidY + lidHeight : explodedOffset.lidY}
		position.z={lidPosZ}
		onclick={() => onTrayClick?.(null)}
	>
		<T.MeshStandardMaterial
			color="#444444"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Counter preview for single tray view (only when tray geometry is visible, hidden in edit mode) -->
{#if !generating && showCounters && !isLayoutEditMode && !showAllTrays && !showAllBoxes && geometry && selectedTrayCounters.length > 0}
	{#each selectedTrayCounters as stack, stackIdx (stackIdx)}
		{#if !isCounterStack(stack)}
			<!-- CardStack: render sleeved cards with transparent sleeve and inner card -->
			{#each Array(stack.count) as _cardItem, cardIdx (cardIdx)}
				{@const cardZ = stack.z + cardIdx * stack.thickness + stack.thickness / 2}
				{@const posX = meshOffset.x + stack.x}
				{@const posY = cardZ}
				{@const posZ = meshOffset.z - stack.y}
				{@const isAlt = cardIdx % 2 === 1}
				{@const innerCardColor = isAlt ? '#2a5a74' : '#1a4a64'}
				{@const sleeveColor = isAlt ? '#88c8e8' : '#78b8d8'}
				<!-- Outer sleeve (semi-transparent) -->
				<T.Mesh
					position.x={posX}
					position.y={posY}
					position.z={posZ}
					rotation.x={stack.slopeAngle ?? 0}
				>
					<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
					<T.MeshStandardMaterial
						color={sleeveColor}
						transparent
						opacity={0.4}
						roughness={0.3}
						metalness={0.1}
					/>
				</T.Mesh>
				<!-- Inner card (opaque, slightly smaller) -->
				<T.Mesh
					position.x={posX}
					position.y={posY}
					position.z={posZ}
					rotation.x={stack.slopeAngle ?? 0}
				>
					<T.BoxGeometry args={[stack.innerWidth, stack.thickness * 0.6, stack.innerLength]} />
					<T.MeshStandardMaterial color={innerCardColor} roughness={0.5} metalness={0.1} />
				</T.Mesh>
			{/each}
		{:else if stack.isEdgeLoaded}
			<!-- Edge-loaded: counters standing on edge like books -->
			{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
				{@const effectiveShape =
					stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
				{@const standingHeight =
					stack.isCardDivider && stack.cardDividerHeight
						? stack.cardDividerHeight
						: effectiveShape === 'triangle'
							? stack.length // Triangle geometric height (point down)
							: stack.shape === 'custom'
								? Math.min(stack.width, stack.length)
								: Math.max(stack.width, stack.length)}
				{@const triangleLift = 0}
				{@const counterY = stack.z + standingHeight / 2 + triangleLift}
				{@const isAlt = counterIdx % 2 === 1}
				{@const counterColor = isAlt
					? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
					: stack.color}
				{#if stack.edgeOrientation === 'lengthwise'}
					<!-- Lengthwise: counters arranged along X axis, standing on edge -->
					{@const counterSpacing = (stack.slotWidth ?? stack.count * stack.thickness) / stack.count}
					{@const posX = meshOffset.x + stack.x + (counterIdx + 0.5) * counterSpacing}
					{@const posZ = meshOffset.z - stack.y - (stack.slotDepth ?? stack.length) / 2}
					{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
						<!-- Standing on edge: thickness along X (stacking), height along Y, length along Z -->
						<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
							<T.BoxGeometry args={[stack.thickness, standingHeight, stack.length]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else if effectiveShape === 'circle'}
						<!-- Cylinder standing on edge: rotate so axis is along X -->
						<T.Mesh
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.z={Math.PI / 2}
						>
							<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 32]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else if effectiveShape === 'hex'}
						<!-- hex: rotate so axis is along X -->
						<T.Mesh
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.z={Math.PI / 2}
							rotation.x={stack.hexPointyTop ? 0 : Math.PI / 6}
						>
							<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 6]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else}
						<!-- triangle: standing on edge lengthwise, axis=X, point down, flat up, rounded corners -->
						{@const triGeom = createRoundedTriangleGeometry(
							stack.width,
							stack.thickness,
							triangleCornerRadius
						)}
						<T.Mesh
							geometry={triGeom}
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.y={Math.PI / 2}
							rotation.x={Math.PI}
						>
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{/if}
				{:else}
					<!-- Crosswise: counters arranged along Y axis (Z in Three.js) -->
					{@const counterSpacing = (stack.slotDepth ?? stack.count * stack.thickness) / stack.count}
					{@const posX = meshOffset.x + stack.x + (stack.slotWidth ?? stack.length) / 2}
					{@const posZ = meshOffset.z - stack.y - (counterIdx + 0.5) * counterSpacing}
					{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
						<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
							<T.BoxGeometry args={[stack.length, standingHeight, stack.thickness]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else if effectiveShape === 'circle'}
						<T.Mesh
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.x={Math.PI / 2}
						>
							<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 32]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else if effectiveShape === 'hex'}
						<!-- hex -->
						<T.Mesh
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.x={Math.PI / 2}
							rotation.y={stack.hexPointyTop ? Math.PI / 6 : 0}
						>
							<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 6]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{:else}
						<!-- triangle: standing on edge crosswise, point down, flat up, rounded corners -->
						{@const triGeom = createRoundedTriangleGeometry(
							stack.width,
							stack.thickness,
							triangleCornerRadius
						)}
						<T.Mesh
							geometry={triGeom}
							position.x={posX}
							position.y={counterY}
							position.z={posZ}
							rotation.x={Math.PI}
						>
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{/if}
				{/if}
			{/each}
		{:else}
			<!-- Top-loaded: traditional vertical stacks -->
			{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
				{@const counterZ = stack.z + counterIdx * stack.thickness + stack.thickness / 2}
				{@const posX = meshOffset.x + stack.x}
				{@const posY = counterZ}
				{@const posZ = meshOffset.z - stack.y}
				{@const isAlt = counterIdx % 2 === 1}
				{@const counterColor = isAlt
					? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
					: stack.color}
				{@const effectiveShape =
					stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
				{@const isSleevedCard = stack.innerWidth && stack.innerLength}
				{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
					{#if isSleevedCard}
						<!-- Sleeved card: transparent sleeve with inner card -->
						{@const sleeveColor = isAlt ? '#88c8e8' : '#78b8d8'}
						{@const innerCardColor = isAlt ? '#2a5a74' : '#1a4a64'}
						<T.Mesh
							position.x={posX}
							position.y={posY}
							position.z={posZ}
							rotation.x={stack.slopeAngle ?? 0}
						>
							<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
							<T.MeshStandardMaterial
								color={sleeveColor}
								transparent
								opacity={0.4}
								roughness={0.3}
								metalness={0.1}
							/>
						</T.Mesh>
						<T.Mesh
							position.x={posX}
							position.y={posY}
							position.z={posZ}
							rotation.x={stack.slopeAngle ?? 0}
						>
							<T.BoxGeometry args={[stack.innerWidth, stack.thickness * 0.6, stack.innerLength]} />
							<T.MeshStandardMaterial color={innerCardColor} roughness={0.5} metalness={0.1} />
						</T.Mesh>
					{:else}
						<T.Mesh
							position.x={posX}
							position.y={posY}
							position.z={posZ}
							rotation.x={stack.slopeAngle ?? 0}
						>
							<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{/if}
				{:else if effectiveShape === 'circle'}
					<T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
						<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 32]} />
						<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
					</T.Mesh>
				{:else if effectiveShape === 'hex'}
					<!-- hex -->
					<T.Mesh
						position.x={posX}
						position.y={posY}
						position.z={posZ}
						rotation.y={stack.hexPointyTop ? 0 : Math.PI / 6}
					>
						<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 6]} />
						<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
					</T.Mesh>
				{:else}
					<!-- triangle: rounded corners, geometry is centered -->
					<!-- Back-row triangles need 180° rotation around Z to face their finger cutout -->
					{@const triGeom = createRoundedTriangleGeometry(
						stack.width,
						stack.thickness,
						triangleCornerRadius
					)}
					{@const isBackRow = stack.rowAssignment === 'back'}
					<T.Mesh
						geometry={triGeom}
						position.x={posX}
						position.y={posY}
						position.z={posZ}
						rotation.x={-Math.PI / 2}
						rotation.y={Math.PI}
						rotation.z={isBackRow ? Math.PI : 0}
					>
						<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
					</T.Mesh>
				{/if}
			{/each}
		{/if}
	{/each}
{/if}

<!-- Counter preview for all trays view (single box view) - using T.Group so counters rotate with tray (hidden in edit mode) -->
{#if !generating && showCounters && !isLayoutEditMode && showAllTrays && !showAllBoxes && allTrays.length > 0}
	{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
	{@const maxTrayHeight = Math.max(...allTrays.map((t) => t.placement.dimensions.height))}
	{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
	{@const traySpacing = liftPhase * maxTrayHeight * 1.2}
	{#each allTrays as trayData, trayIdx (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const isRotated = placement.rotated}
		{@const groupX = exploded
			? meshOffset.x +
				interiorStartOffset +
				placement.x +
				(isRotated ? placement.dimensions.width : 0)
			: sidePositions.traysGroup.x -
				maxTrayWidth / 2 +
				placement.x +
				(isRotated ? placement.dimensions.width : 0)}
		{@const groupY = exploded
			? boxFloorThickness + explodedOffset.trays + trayIdx * traySpacing
			: 0}
		{@const groupZ = exploded
			? meshOffset.z - interiorStartOffset - placement.y
			: traysGroupDepth - placement.y}
		<T.Group
			position.x={groupX}
			position.y={groupY}
			position.z={groupZ}
			rotation.y={isRotated ? Math.PI / 2 : 0}
		>
			{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
				{#if stack.isEdgeLoaded}
					<!-- Edge-loaded: counters standing on edge like books -->
					{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
						{@const effectiveShape =
							stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
						{@const standingHeight =
							stack.isCardDivider && stack.cardDividerHeight
								? stack.cardDividerHeight
								: effectiveShape === 'triangle'
									? stack.length
									: stack.shape === 'custom'
										? Math.min(stack.width, stack.length)
										: Math.max(stack.width, stack.length)}
						{@const counterY = stack.z + standingHeight / 2}
						{@const isAlt = counterIdx % 2 === 1}
						{@const counterColor = isAlt
							? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
							: stack.color}
						{#if stack.edgeOrientation === 'lengthwise'}
							{@const counterSpacing =
								(stack.slotWidth ?? stack.count * stack.thickness) / stack.count}
							{@const posX = stack.x + (counterIdx + 0.5) * counterSpacing}
							{@const posZ = -stack.y - (stack.slotDepth ?? stack.length) / 2}
							{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
								<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
									<T.BoxGeometry args={[stack.thickness, standingHeight, stack.length]} />
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else if effectiveShape === 'circle'}
								<T.Mesh
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.z={Math.PI / 2}
								>
									<T.CylinderGeometry
										args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
									/>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else if effectiveShape === 'hex'}
								<T.Mesh
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.z={Math.PI / 2}
									rotation.x={stack.hexPointyTop ? 0 : Math.PI / 6}
								>
									<T.CylinderGeometry
										args={[stack.width / 2, stack.width / 2, stack.thickness, 6]}
									/>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else}
								{@const triGeom = createRoundedTriangleGeometry(
									stack.width,
									stack.thickness,
									triangleCornerRadius
								)}
								<T.Mesh
									geometry={triGeom}
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.y={Math.PI / 2}
									rotation.x={Math.PI}
								>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{/if}
						{:else}
							<!-- Crosswise: counters arranged along Y axis (Z in Three.js) -->
							{@const counterSpacing =
								(stack.slotDepth ?? stack.count * stack.thickness) / stack.count}
							{@const posX = stack.x + (stack.slotWidth ?? stack.length) / 2}
							{@const posZ = -stack.y - (counterIdx + 0.5) * counterSpacing}
							{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
								<T.Mesh position.x={posX} position.y={counterY} position.z={posZ}>
									<T.BoxGeometry args={[stack.length, standingHeight, stack.thickness]} />
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else if effectiveShape === 'circle'}
								<T.Mesh
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.x={Math.PI / 2}
								>
									<T.CylinderGeometry
										args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
									/>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else if effectiveShape === 'hex'}
								<T.Mesh
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.x={Math.PI / 2}
									rotation.y={stack.hexPointyTop ? Math.PI / 6 : 0}
								>
									<T.CylinderGeometry
										args={[stack.width / 2, stack.width / 2, stack.thickness, 6]}
									/>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{:else}
								{@const triGeom = createRoundedTriangleGeometry(
									stack.width,
									stack.thickness,
									triangleCornerRadius
								)}
								<T.Mesh
									geometry={triGeom}
									position.x={posX}
									position.y={counterY}
									position.z={posZ}
									rotation.x={Math.PI}
								>
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{/if}
						{/if}
					{/each}
				{:else}
					<!-- Top-loaded: traditional vertical stacks -->
					{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
						{@const counterZ = stack.z + counterIdx * stack.thickness + stack.thickness / 2}
						{@const posX = stack.x}
						{@const posY = counterZ}
						{@const posZ = -stack.y}
						{@const isAlt = counterIdx % 2 === 1}
						{@const counterColor = isAlt
							? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
							: stack.color}
						{@const effectiveShape =
							stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
						{@const isSleevedCard = stack.innerWidth && stack.innerLength}
						{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
							{#if isSleevedCard}
								<!-- Sleeved card: transparent sleeve with inner card -->
								{@const sleeveColor = isAlt ? '#88c8e8' : '#78b8d8'}
								{@const innerCardColor = isAlt ? '#2a5a74' : '#1a4a64'}
								<T.Mesh
									position.x={posX}
									position.y={posY}
									position.z={posZ}
									rotation.x={stack.slopeAngle ?? 0}
								>
									<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
									<T.MeshStandardMaterial
										color={sleeveColor}
										transparent
										opacity={0.4}
										roughness={0.3}
										metalness={0.1}
									/>
								</T.Mesh>
								<T.Mesh
									position.x={posX}
									position.y={posY}
									position.z={posZ}
									rotation.x={stack.slopeAngle ?? 0}
								>
									<T.BoxGeometry
										args={[stack.innerWidth, stack.thickness * 0.6, stack.innerLength]}
									/>
									<T.MeshStandardMaterial color={innerCardColor} roughness={0.5} metalness={0.1} />
								</T.Mesh>
							{:else}
								<T.Mesh
									position.x={posX}
									position.y={posY}
									position.z={posZ}
									rotation.x={stack.slopeAngle ?? 0}
								>
									<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
									<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
								</T.Mesh>
							{/if}
						{:else if effectiveShape === 'circle'}
							<T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
								<T.CylinderGeometry
									args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
								/>
								<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
							</T.Mesh>
						{:else if effectiveShape === 'hex'}
							<T.Mesh
								position.x={posX}
								position.y={posY}
								position.z={posZ}
								rotation.y={stack.hexPointyTop ? 0 : Math.PI / 6}
							>
								<T.CylinderGeometry args={[stack.width / 2, stack.width / 2, stack.thickness, 6]} />
								<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
							</T.Mesh>
						{:else}
							{@const triGeom = createRoundedTriangleGeometry(
								stack.width,
								stack.thickness,
								triangleCornerRadius
							)}
							{@const isBackRow = stack.rowAssignment === 'back'}
							<T.Mesh
								geometry={triGeom}
								position.x={posX}
								position.y={posY}
								position.z={posZ}
								rotation.x={-Math.PI / 2}
								rotation.y={Math.PI}
								rotation.z={isBackRow ? Math.PI : 0}
							>
								<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
							</T.Mesh>
						{/if}
					{/each}
				{/if}
			{/each}
		</T.Group>
	{/each}
{/if}

{#if !hidePrintBed && !showAllBoxes}
	<!-- Background grid for single box view (subtle) - hidden in edit mode -->
	{#if !visualEditMode}
		<Grid
			position.y={-0.51}
			cellColor="#2a2a2a"
			sectionColor="#5a3530"
			sectionThickness={1}
			cellSize={10}
			sectionSize={50}
			gridSize={[2000, 2000]}
			fadeDistance={800}
			fadeStrength={1}
		/>
	{/if}

	<!-- PrintBed position differs in edit mode (corner at origin) vs normal mode (centered) -->
	<!-- In edit mode, show interior bounds (accounting for walls) -->
	<PrintBed
		size={visualEditMode ? Math.max(editBoundsWidth, editBoundsDepth) : printBedSize}
		title={visualEditMode ? '' : viewTitle}
		position={visualEditMode ? [editModeCenter.x, 0, editModeCenter.z] : [0, 0, 0]}
		sizeLabel={visualEditMode
			? `${Math.max(editBoundsWidth, editBoundsDepth)}mm max box cavity`
			: undefined}
	/>
{/if}

<!-- Reference labels for PDF capture - single tray view (hidden in edit mode) -->
{#if showReferenceLabels && !isLayoutEditMode && !showAllTrays && !showAllBoxes && geometry && selectedTrayCounters.length > 0}
	{@const counterStacks = selectedTrayCounters.filter(isCounterStack)}
	{@const cardStacks = selectedTrayCounters.filter((s): s is CardStack => !isCounterStack(s))}
	{@const counterMaxHeight =
		counterStacks.length > 0
			? Math.max(
					...counterStacks.map((stack) => {
						const effectiveShape =
							stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape;
						return stack.isEdgeLoaded
							? effectiveShape === 'triangle'
								? stack.length
								: stack.shape === 'custom'
									? Math.min(stack.width, stack.length)
									: Math.max(stack.width, stack.length)
							: stack.z + stack.count * stack.thickness;
					})
				)
			: 0}
	{@const cardMaxHeight =
		cardStacks.length > 0
			? Math.max(...cardStacks.map((stack) => stack.z + stack.count * stack.thickness))
			: 0}
	{@const maxStackHeight = Math.max(counterMaxHeight, cardMaxHeight, 20)}
	{@const labelHeight = maxStackHeight + 5}
	{#each counterStacks as stack, stackIdx (stackIdx)}
		{@const refCode = `${selectedTrayLetter}${stackIdx + 1}`}
		{@const posX = stack.isEdgeLoaded
			? stack.edgeOrientation === 'lengthwise'
				? meshOffset.x + stack.x + (stack.slotWidth ?? stack.count * stack.thickness) / 2
				: meshOffset.x + stack.x + (stack.slotWidth ?? stack.length) / 2
			: meshOffset.x + stack.x}
		{@const posZ = stack.isEdgeLoaded
			? stack.edgeOrientation === 'lengthwise'
				? meshOffset.z - stack.y - (stack.slotDepth ?? stack.length) / 2
				: meshOffset.z - stack.y - (stack.slotDepth ?? stack.count * stack.thickness) / 2
			: meshOffset.z - stack.y}
		{@const stackLabel = getStackLabel(stack)}
		{@const tooltipHeight = labelHeight + 6}
		{@const isHovered = hoveredLabel?.refCode === refCode}
		<!-- Floating label above stack -->
		<Text
			text={refCode}
			font={monoFont}
			fontSize={4}
			position={[posX, labelHeight, posZ]}
			quaternion={captureMode ? topDownQuaternion : labelQuaternion}
			color={isHovered ? '#ffffff' : '#000000'}
			anchorX="center"
			anchorY="bottom"
			outlineWidth="8%"
			outlineColor={isHovered ? '#000000' : '#ffffff'}
			onpointerenter={() => {
				hoveredLabel = { refCode, text: stackLabel, position: [posX, tooltipHeight, posZ] };
			}}
			onpointerleave={() => {
				hoveredLabel = null;
			}}
		/>
	{/each}
	{#each cardStacks as stack, stackIdx (stackIdx)}
		{@const refCode = `${selectedTrayLetter}${counterStacks.length + stackIdx + 1}`}
		{@const posX = meshOffset.x + stack.x}
		{@const posZ = meshOffset.z - stack.y}
		{@const stackLabel = getCardStackLabel(stack)}
		{@const tooltipHeight = labelHeight + 6}
		{@const isHovered = hoveredLabel?.refCode === refCode}
		<!-- Floating label above card stack -->
		<Text
			text={refCode}
			font={monoFont}
			fontSize={4}
			position={[posX, labelHeight, posZ]}
			quaternion={captureMode ? topDownQuaternion : labelQuaternion}
			color={isHovered ? '#ffffff' : '#000000'}
			anchorX="center"
			anchorY="bottom"
			outlineWidth="8%"
			outlineColor={isHovered ? '#000000' : '#ffffff'}
			onpointerenter={() => {
				hoveredLabel = { refCode, text: stackLabel, position: [posX, tooltipHeight, posZ] };
			}}
			onpointerleave={() => {
				hoveredLabel = null;
			}}
		/>
	{/each}
{/if}

<!-- Tooltip for hovered label -->
{#if hoveredLabel && hoveredLabel.text}
	{@const tooltipFontSize = 3}
	{@const charWidth = tooltipFontSize * 0.6}
	{@const textWidth = hoveredLabel.text.length * charWidth}
	{@const paddingX = 2}
	{@const paddingY = 1.5}
	{@const bgWidth = textWidth + paddingX * 2}
	{@const bgHeight = tooltipFontSize + paddingY * 2}
	{@const yOffset = tooltipFontSize + 3}
	<!-- Background rectangle -->
	<T.Mesh
		position={[
			hoveredLabel.position[0],
			hoveredLabel.position[1] + yOffset,
			hoveredLabel.position[2]
		]}
		quaternion={captureMode ? topDownQuaternion : labelQuaternion}
	>
		<T.PlaneGeometry args={[bgWidth, bgHeight]} />
		<T.MeshBasicMaterial color="#000000" transparent opacity={0.8} />
	</T.Mesh>
	<!-- Tooltip text -->
	<Text
		text={hoveredLabel.text}
		font={monoFont}
		fontSize={tooltipFontSize}
		position={[
			hoveredLabel.position[0],
			hoveredLabel.position[1] + yOffset,
			hoveredLabel.position[2] + 0.1
		]}
		quaternion={captureMode ? topDownQuaternion : labelQuaternion}
		color="#ffffff"
		anchorX="center"
		anchorY="middle"
	/>
{/if}

<!-- Reference labels for PDF capture - all trays view (single box view, hidden in edit mode) -->
{#if showReferenceLabels && !isLayoutEditMode && showAllTrays && !showAllBoxes && allTrays.length > 0}
	{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
	{@const maxTrayHeight = Math.max(...allTrays.map((t) => t.placement.dimensions.height))}
	{@const globalLabelHeight = maxTrayHeight + 5}
	{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
	{@const traySpacing = liftPhase * maxTrayHeight * 1.2}
	{#each allTrays as trayData, trayIdx (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const isRotated = placement.rotated}
		{@const trayXOffset = exploded
			? meshOffset.x + interiorStartOffset + placement.x
			: sidePositions.traysGroup.x - maxTrayWidth / 2 + placement.x}
		{@const trayYOffset = exploded
			? boxFloorThickness + explodedOffset.trays + trayIdx * traySpacing
			: 0}
		{@const trayZOffset = exploded
			? meshOffset.z - interiorStartOffset - placement.y
			: traysGroupDepth - placement.y}
		{@const trayLetter = trayData.trayLetter ?? String.fromCharCode(65 + trayIdx)}
		{@const labelHeight = trayYOffset + globalLabelHeight}
		{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
			{@const refCode = `${trayLetter}${stackIdx + 1}`}
			{@const localX = stack.isEdgeLoaded
				? stack.edgeOrientation === 'lengthwise'
					? stack.x + (stack.slotWidth ?? stack.count * stack.thickness) / 2
					: stack.x + (stack.slotWidth ?? stack.length) / 2
				: stack.x}
			{@const localZ = stack.isEdgeLoaded
				? stack.edgeOrientation === 'lengthwise'
					? -stack.y - (stack.slotDepth ?? stack.length) / 2
					: -stack.y - (stack.slotDepth ?? stack.count * stack.thickness) / 2
				: -stack.y}
			{@const groupXOffset = isRotated ? placement.dimensions.width : 0}
			{@const posX = isRotated ? trayXOffset + groupXOffset + localZ : trayXOffset + localX}
			{@const posZ = isRotated ? trayZOffset - localX : trayZOffset + localZ}
			{@const stackLabel = getStackLabel(stack)}
			{@const tooltipHeight = labelHeight + 6}
			{@const isHovered = hoveredLabel?.refCode === refCode}
			<!-- Floating label above stack -->
			<Text
				text={refCode}
				font={monoFont}
				fontSize={4}
				position={[posX, labelHeight, posZ]}
				quaternion={captureMode ? topDownQuaternion : labelQuaternion}
				color={isHovered ? '#ffffff' : '#000000'}
				anchorX="center"
				anchorY="bottom"
				outlineWidth="8%"
				outlineColor={isHovered ? '#000000' : '#ffffff'}
				onpointerenter={() => {
					hoveredLabel = { refCode, text: stackLabel, position: [posX, tooltipHeight, posZ] };
				}}
				onpointerleave={() => {
					hoveredLabel = null;
				}}
			/>
		{/each}
	{/each}
{/if}

<!-- Reference labels for multi-box (print) view (hidden in edit mode) -->
{#if showReferenceLabels && !isLayoutEditMode && showAllBoxes && allBoxes.length > 0}
	{#each allBoxes as boxData, boxIndex (boxData.boxId)}
		{@const boxPos = boxPositions[boxIndex]}
		{@const boxWidth = boxData.boxDimensions.width}
		{@const boxDepth = boxData.boxDimensions.depth}
		{@const xOffset = boxPos?.x ?? 0}
		{@const zOffset = printBedSize / 2}
		{@const labelBoxGeomBounds = boxData.boxGeometry ? getGeomBounds(boxData.boxGeometry) : null}
		{@const labelBoxCenterX = labelBoxGeomBounds
			? -(labelBoxGeomBounds.max.x + labelBoxGeomBounds.min.x) / 2
			: -boxWidth / 2}
		{@const labelBoxCenterZ = labelBoxGeomBounds
			? (labelBoxGeomBounds.max.y + labelBoxGeomBounds.min.y) / 2
			: boxDepth / 2}
		{@const boxMaxTrayHeight =
			boxData.trayGeometries.length > 0
				? Math.max(...boxData.trayGeometries.map((t) => t.placement.dimensions.height))
				: 0}
		{@const boxLabelHeight = boxFloorThickness + boxMaxTrayHeight + 5}
		{#each boxData.trayGeometries as trayData, trayIndex (trayData.trayId)}
			{@const placement = trayData.placement}
			{@const isRotated = placement.rotated}
			{@const trayX =
				xOffset +
				labelBoxCenterX +
				(labelBoxGeomBounds?.min.x ?? 0) +
				boxWallThickness +
				boxTolerance +
				placement.x}
			{@const trayZ =
				zOffset +
				labelBoxCenterZ -
				(labelBoxGeomBounds?.min.y ?? 0) -
				boxWallThickness -
				boxTolerance -
				placement.y}
			{@const cumulativeIdx =
				allBoxes.slice(0, boxIndex).reduce((sum, b) => sum + b.trayGeometries.length, 0) +
				trayIndex}
			{@const trayLetter = trayData.trayLetter ?? getTrayLetter(cumulativeIdx)}
			{@const labelHeight = boxLabelHeight}
			{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
				{@const refCode = `${trayLetter}${stackIdx + 1}`}
				{@const localX = stack.isEdgeLoaded
					? stack.edgeOrientation === 'lengthwise'
						? stack.x + (stack.slotWidth ?? stack.count * stack.thickness) / 2
						: stack.x + (stack.slotWidth ?? stack.length) / 2
					: stack.x}
				{@const localZ = stack.isEdgeLoaded
					? stack.edgeOrientation === 'lengthwise'
						? -stack.y - (stack.slotDepth ?? stack.length) / 2
						: -stack.y - (stack.slotDepth ?? stack.count * stack.thickness) / 2
					: -stack.y}
				{@const groupXOffset = isRotated ? placement.dimensions.width : 0}
				{@const posX = isRotated ? trayX + groupXOffset + localZ : trayX + localX}
				{@const posZ = isRotated ? trayZ - localX : trayZ + localZ}
				{@const stackLabel = getStackLabel(stack)}
				{@const tooltipHeight = labelHeight + 6}
				{@const isHovered = hoveredLabel?.refCode === refCode}
				<Text
					text={refCode}
					font={monoFont}
					fontSize={4}
					position={[posX, labelHeight, posZ]}
					quaternion={captureMode ? topDownQuaternion : labelQuaternion}
					color={isHovered ? '#ffffff' : '#000000'}
					anchorX="center"
					anchorY="bottom"
					outlineWidth="8%"
					outlineColor={isHovered ? '#000000' : '#ffffff'}
					onpointerenter={() => {
						hoveredLabel = { refCode, text: stackLabel, position: [posX, tooltipHeight, posZ] };
					}}
					onpointerleave={() => {
						hoveredLabel = null;
					}}
				/>
			{/each}
		{/each}
	{/each}
{/if}
