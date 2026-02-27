<script lang="ts">
	import { T, useThrelte, useTask } from '@threlte/core';
	import { OrbitControls, Grid, Text, interactivity } from '@threlte/extras';
	import PrintBed from './PrintBed.svelte';

	// Enable interactivity for pointer events on 3D objects
	interactivity();
	import type { BufferGeometry } from 'three';
	import * as THREE from 'three';
	import { arrangeBoxes, type TrayPlacement } from '$lib/models/box';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';
	import type { CounterStack } from '$lib/models/counterTray';
	import { captureSceneToDataUrl, type CaptureOptions } from '$lib/utils/screenshotCapture';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
		counterStacks: CounterStack[];
		trayLetter?: string;
	}

	interface BoxGeometryData {
		boxId: string;
		boxName: string;
		boxGeometry: BufferGeometry | null;
		trayGeometries: TrayGeometryData[];
		boxDimensions: { width: number; depth: number; height: number };
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
		selectedTrayCounters?: CounterStack[];
		selectedTrayLetter?: string;
		triangleCornerRadius?: number;
		showReferenceLabels?: boolean;
		hidePrintBed?: boolean;
		viewTitle?: string;
		onCaptureReady?: (captureFunc: (options: CaptureOptions) => string) => void;
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
		triangleCornerRadius = 1.5,
		showReferenceLabels = false,
		hidePrintBed = false,
		viewTitle = '',
		onCaptureReady
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

					// Camera FOV is vertical (50 degrees)
					const vFovRad = (50 * Math.PI) / 180;
					// Calculate horizontal FOV based on aspect ratio
					const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * captureAspect);

					// Calculate distance needed to fit width (using horizontal FOV) and depth (using vertical FOV)
					const distanceForWidth = trayWidth / 2 / Math.tan(hFovRad / 2);
					const distanceForDepth = trayDepth / 2 / Math.tan(vFovRad / 2);

					// Use the larger distance with padding for labels
					const distance = Math.max(distanceForWidth, distanceForDepth) * 1.4;

					// Position camera directly above origin (meshOffset centers the tray at origin)
					cam.position.set(0, distance, 0);
					cam.up.set(0, 0, -1); // Set "up" to -Z so the tray is oriented correctly
					cam.lookAt(0, 0, 0);
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

	// Max depth is now print bed size for consistent alignment
	let maxBoxDepth = $derived.by(() => {
		if (!showAllBoxes || allBoxes.length === 0) return 0;
		return printBedSize;
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

	// Camera target
	let cameraTarget = $derived.by(() => {
		if (!combinedBounds) return { x: 0, y: 0, z: 0 };
		const height = combinedBounds.max.z - combinedBounds.min.z;
		return {
			x: 0,
			y: height / 2,
			z: 0
		};
	});

	let cameraDistance = $derived.by(() => {
		// For multi-box view, calculate based on total arrangement width (using print bed sizes)
		if (showAllBoxes && allBoxes.length > 0) {
			const totalWidth = allBoxes.length * printBedSize + (allBoxes.length - 1) * sideGap;
			const maxHeight = Math.max(...allBoxes.map((b) => b.boxDimensions.height));
			const size = Math.max(totalWidth, printBedSize, maxHeight);
			return size * 1.5;
		}

		if (!combinedBounds) return printBedSize;

		let effectiveWidth = combinedBounds.max.x - combinedBounds.min.x;

		// Account for side-by-side spread in "All" mode
		if (showAllTrays && !exploded) {
			const widths: number[] = [];
			if (boxBounds) widths.push(boxBounds.max.x - boxBounds.min.x);
			if (allTrays.length > 0) {
				widths.push(Math.max(...allTrays.map((t) => t.placement.dimensions.width)));
			}
			if (lidBounds) widths.push(lidBounds.max.x - lidBounds.min.x);
			if (widths.length > 0) {
				effectiveWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * sideGap;
			}
		}

		const size = Math.max(
			effectiveWidth,
			combinedBounds.max.y - combinedBounds.min.y,
			combinedBounds.max.z - combinedBounds.min.z,
			printBedSize
		);
		return size * 1.5;
	});

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

	// Tray colors - harmonious with tableslayer/ui primary red
	const trayColors = ['#c9503c', '#3d7a6a', '#d4956a', '#7c5c4a', '#a36b5a', '#5a7c6a'];

	// Debug logging
	$effect(() => {
		if (showAllTrays && allTrays.length > 0) {
			const maxTrayW = Math.max(...allTrays.map((t) => t.placement.dimensions.width));
			console.log('=== TrayScene Debug ===');
			console.log('exploded:', exploded);
			console.log('showAllTrays:', showAllTrays);
			console.log('maxTrayWidth:', maxTrayW);
			console.log('traysGroupDepth:', traysGroupDepth);
			console.log('sidePositions.traysGroup:', JSON.stringify(sidePositions.traysGroup));
			console.log('meshOffset:', JSON.stringify(meshOffset));
			console.log('interiorStartOffset:', interiorStartOffset);
			allTrays.forEach((t, i) => {
				const p = t.placement;
				// Calculate actual positions based on current mode
				const xPos = exploded
					? meshOffset.x + interiorStartOffset + p.x
					: sidePositions.traysGroup.x - maxTrayW / 2 + p.x;
				const zPos = exploded ? meshOffset.z - interiorStartOffset - p.y : traysGroupDepth - p.y;
				console.log(
					`Tray ${i} "${t.name}": placement(x=${p.x}, y=${p.y}), dims(w=${p.dimensions.width.toFixed(1)}, d=${p.dimensions.depth}) -> actual position(x=${xPos.toFixed(1)}, z=${zPos.toFixed(1)})`
				);
			});
		}
		// Lid debug
		if (exploded && lidBounds && boxBounds) {
			const bw = boxBounds.max.x - boxBounds.min.x;
			const bd = boxBounds.max.y - boxBounds.min.y;
			const lw = lidBounds.max.x - lidBounds.min.x;
			const ld = lidBounds.max.y - lidBounds.min.y;
			const slidesX = bw > bd;
			const boundsOffsetX = boxBounds.min.x - lidBounds.min.x;
			const boundsOffsetY = boxBounds.min.y - lidBounds.min.y;
			console.log('=== Lid Debug ===');
			console.log('boxBounds:', {
				min: { x: boxBounds.min.x.toFixed(2), y: boxBounds.min.y.toFixed(2) },
				max: { x: boxBounds.max.x.toFixed(2), y: boxBounds.max.y.toFixed(2) }
			});
			console.log('lidBounds:', {
				min: { x: lidBounds.min.x.toFixed(2), y: lidBounds.min.y.toFixed(2) },
				max: { x: lidBounds.max.x.toFixed(2), y: lidBounds.max.y.toFixed(2) }
			});
			console.log('boxWidth:', bw.toFixed(2), 'boxDepth:', bd.toFixed(2));
			console.log('lidWidth:', lw.toFixed(2), 'lidDepth:', ld.toFixed(2));
			console.log(
				'boundsOffsetX:',
				boundsOffsetX.toFixed(2),
				'boundsOffsetY:',
				boundsOffsetY.toFixed(2)
			);
			console.log('slidesAlongX:', slidesX);
			console.log('meshOffset:', { x: meshOffset.x.toFixed(2), z: meshOffset.z.toFixed(2) });
			console.log('explodedOffset:', {
				lidSlideX: explodedOffset.lidSlideX.toFixed(2),
				maxSlideX: explodedOffset.maxSlideX.toFixed(2),
				lidSlideZ: explodedOffset.lidSlideZ.toFixed(2),
				maxSlideZ: explodedOffset.maxSlideZ.toFixed(2)
			});
		}
	});
</script>

<T.PerspectiveCamera
	makeDefault
	position={[cameraDistance * 0.7, cameraDistance * 0.5, cameraDistance * 0.7]}
	fov={50}
>
	<OrbitControls target={[cameraTarget.x, cameraTarget.y, cameraTarget.z]} enableDamping />
</T.PerspectiveCamera>

<T.DirectionalLight position={[50, 100, 50]} intensity={1.5} />
<T.DirectionalLight position={[-50, 50, -50]} intensity={0.5} />
<T.DirectionalLight
	position={[0, 20, -80]}
	intensity={0.3}
/><!-- Subtle backlight for rim definition -->
<T.AmbientLight intensity={0.4} />

<!-- Grid for multi-box view -->
{#if showAllBoxes && !hidePrintBed}
	<Grid
		position.y={-0.01}
		cellColor="#5a5a5a"
		sectionColor="#8b4a3c"
		sectionThickness={1.5}
		cellSize={10}
		sectionSize={50}
		gridSize={[2000, 2000]}
		fadeDistance={500}
	/>
{/if}

<!-- Multi-box view: All boxes arranged side by side with their own bed planes -->
{#if showAllBoxes && allBoxes.length > 0}
	{#each allBoxes as boxData, boxIndex (boxData.boxId)}
		{@const boxPos = boxPositions[boxIndex]}
		{@const boxWidth = boxData.boxDimensions.width}
		{@const boxDepth = boxData.boxDimensions.depth}
		{@const boxHeight = boxData.boxDimensions.height}
		{@const xOffset = boxPos?.x ?? 0}
		{@const zOffset = printBedSize / 2}

		<!-- Print bed for this box -->
		<PrintBed size={printBedSize} title={boxData.boxName} position={[xOffset, 0, zOffset]} />

		<!-- Box geometry (without lid) -->
		{#if boxData.boxGeometry}
			<T.Mesh
				geometry={boxData.boxGeometry}
				rotation.x={-Math.PI / 2}
				position.x={xOffset - boxWidth / 2}
				position.y={0}
				position.z={zOffset + boxDepth / 2}
			>
				<T.MeshStandardMaterial
					color="#333333"
					roughness={0.6}
					metalness={0.1}
					side={THREE.DoubleSide}
				/>
			</T.Mesh>
		{/if}

		<!-- Trays inside this box -->
		{#each boxData.trayGeometries as trayData, trayIndex (trayData.trayId)}
			{@const placement = trayData.placement}
			{@const trayX = xOffset - boxWidth / 2 + boxWallThickness + boxTolerance + placement.x}
			{@const trayZ =
				zOffset + boxDepth / 2 - boxWallThickness - boxTolerance - placement.y}
			<T.Mesh
				geometry={trayData.geometry}
				rotation.x={-Math.PI / 2}
				position.x={trayX}
				position.y={boxFloorThickness}
				position.z={trayZ}
			>
				<T.MeshStandardMaterial
					color={trayColors[trayIndex % trayColors.length]}
					roughness={0.6}
					metalness={0.1}
					side={THREE.DoubleSide}
				/>
			</T.Mesh>
		{/each}
	{/each}
{/if}

<!-- Box geometry (single box view) -->
{#if boxGeometry && !showAllBoxes}
	{@const boxWidth = boxBounds ? boxBounds.max.x - boxBounds.min.x : 0}
	<T.Mesh
		geometry={boxGeometry}
		rotation.x={-Math.PI / 2}
		position.x={showAllTrays && !exploded ? sidePositions.box.x - boxWidth / 2 : meshOffset.x}
		position.y={explodedOffset.box}
		position.z={showAllTrays && !exploded ? sidePositions.box.z : meshOffset.z}
	>
		<T.MeshStandardMaterial
			color="#333333"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- All trays with positions (when showAllTrays is true, single box view) -->
{#if showAllTrays && !showAllBoxes && allTrays.length > 0}
	{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
	{#each allTrays as trayData, i (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const xOffset = exploded
			? meshOffset.x + interiorStartOffset + placement.x
			: sidePositions.traysGroup.x - maxTrayWidth / 2 + placement.x}
		{@const trayHeight = trayData.placement.dimensions.height}
		{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
		{@const traySpacing = liftPhase * trayHeight * 1.2}
		{@const yOffset = exploded ? boxFloorThickness + explodedOffset.trays + i * traySpacing : 0}
		{@const zOffset = exploded
			? meshOffset.z - interiorStartOffset - placement.y
			: traysGroupDepth - placement.y}
		<T.Mesh
			geometry={trayData.geometry}
			rotation.x={-Math.PI / 2}
			position.x={xOffset}
			position.y={yOffset}
			position.z={zOffset}
		>
			<T.MeshStandardMaterial
				color={trayColors[i % trayColors.length]}
				roughness={0.6}
				metalness={0.1}
				side={THREE.DoubleSide}
			/>
		</T.Mesh>
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
			color="#c9503c"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Lid geometry (single box view) -->
{#if lidGeometry && !showAllBoxes}
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
	>
		<T.MeshStandardMaterial
			color="#444444"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Counter preview for single tray view (only when tray geometry is visible) -->
{#if showCounters && !showAllTrays && !showAllBoxes && geometry && selectedTrayCounters.length > 0}
	{#each selectedTrayCounters as stack, stackIdx (stackIdx)}
		{#if stack.isEdgeLoaded}
			<!-- Edge-loaded: counters standing on edge like books -->
			{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
				{@const effectiveShape =
					stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
				{@const standingHeight =
					effectiveShape === 'triangle'
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
				{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
					<T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
						<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
						<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
					</T.Mesh>
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
					{@const triGeom = createRoundedTriangleGeometry(
						stack.width,
						stack.thickness,
						triangleCornerRadius
					)}
					<T.Mesh
						geometry={triGeom}
						position.x={posX}
						position.y={posY}
						position.z={posZ}
						rotation.x={-Math.PI / 2}
						rotation.y={Math.PI}
					>
						<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
					</T.Mesh>
				{/if}
			{/each}
		{/if}
	{/each}
{/if}

<!-- Counter preview for all trays view (single box view) -->
{#if showCounters && showAllTrays && !showAllBoxes && allTrays.length > 0}
	{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
	{#each allTrays as trayData, trayIdx (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const trayHeight = placement.dimensions.height}
		{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
		{@const traySpacing = liftPhase * trayHeight * 1.2}
		{@const trayXOffset = exploded
			? meshOffset.x + interiorStartOffset + placement.x
			: sidePositions.traysGroup.x - maxTrayWidth / 2 + placement.x}
		{@const trayYOffset = exploded
			? boxFloorThickness + explodedOffset.trays + trayIdx * traySpacing
			: 0}
		{@const trayZOffset = exploded
			? meshOffset.z - interiorStartOffset - placement.y
			: traysGroupDepth - placement.y}
		{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
			{#if stack.isEdgeLoaded}
				<!-- Edge-loaded: counters standing on edge like books -->
				{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
					{@const effectiveShape =
						stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
					{@const standingHeight =
						effectiveShape === 'triangle'
							? stack.length // Triangle geometric height (point down)
							: stack.shape === 'custom'
								? Math.min(stack.width, stack.length)
								: Math.max(stack.width, stack.length)}
					{@const triangleLift = 0}
					{@const counterY = trayYOffset + stack.z + standingHeight / 2 + triangleLift}
					{@const isAlt = counterIdx % 2 === 1}
					{@const counterColor = isAlt
						? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
						: stack.color}
					{#if stack.edgeOrientation === 'lengthwise'}
						{@const counterSpacing =
							(stack.slotWidth ?? stack.count * stack.thickness) / stack.count}
						{@const posX = trayXOffset + stack.x + (counterIdx + 0.5) * counterSpacing}
						{@const posZ = trayZOffset - stack.y - (stack.slotDepth ?? stack.length) / 2}
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
								<T.CylinderGeometry
									args={[stack.width / 2, stack.width / 2, stack.thickness, 32]}
								/>
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
						{@const counterSpacing =
							(stack.slotDepth ?? stack.count * stack.thickness) / stack.count}
						{@const posX = trayXOffset + stack.x + (stack.slotWidth ?? stack.length) / 2}
						{@const posZ = trayZOffset - stack.y - (counterIdx + 0.5) * counterSpacing}
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
					{@const posX = trayXOffset + stack.x}
					{@const posY = trayYOffset + counterZ}
					{@const posZ = trayZOffset - stack.y}
					{@const isAlt = counterIdx % 2 === 1}
					{@const counterColor = isAlt
						? `hsl(${[15, 25, 160, 35, 170][stackIdx % 5]}, 45%, 35%)`
						: stack.color}
					{@const effectiveShape =
						stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
					{#if effectiveShape === 'square' || effectiveShape === 'rectangle'}
						<T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
							<T.BoxGeometry args={[stack.width, stack.thickness, stack.length]} />
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
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
						{@const triGeom = createRoundedTriangleGeometry(
							stack.width,
							stack.thickness,
							triangleCornerRadius
						)}
						<T.Mesh
							geometry={triGeom}
							position.x={posX}
							position.y={posY}
							position.z={posZ}
							rotation.x={-Math.PI / 2}
							rotation.y={Math.PI}
						>
							<T.MeshStandardMaterial color={counterColor} roughness={0.4} metalness={0.2} />
						</T.Mesh>
					{/if}
				{/each}
			{/if}
		{/each}
	{/each}
{/if}

{#if !hidePrintBed && !showAllBoxes}
	<!-- Single box view: Grid and Print bed -->
	<Grid
		position.y={-0.01}
		cellColor="#5a5a5a"
		sectionColor="#8b4a3c"
		sectionThickness={1.5}
		cellSize={10}
		sectionSize={50}
		gridSize={[2000, 2000]}
		fadeDistance={500}
	/>

	<PrintBed size={printBedSize} title={viewTitle} position={[0, 0, 0]} />
{/if}

<!-- Reference labels for PDF capture - single tray view -->
{#if showReferenceLabels && !showAllTrays && !showAllBoxes && geometry && selectedTrayCounters.length > 0}
	{@const maxStackHeight = Math.max(
		...selectedTrayCounters.map((stack) => {
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
	)}
	{@const labelHeight = maxStackHeight + 5}
	{#each selectedTrayCounters as stack, stackIdx (stackIdx)}
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

<!-- Reference labels for PDF capture - all trays view (single box view) -->
{#if showReferenceLabels && showAllTrays && !showAllBoxes && allTrays.length > 0}
	{@const maxTrayWidth = Math.max(...allTrays.map((t) => t.placement.dimensions.width))}
	{#each allTrays as trayData, trayIdx (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const trayHeight = placement.dimensions.height}
		{@const liftPhase = Math.max((explosionAmount - 50) / 50, 0)}
		{@const traySpacing = liftPhase * trayHeight * 1.2}
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
		{@const maxStackHeight = Math.max(
			...trayData.counterStacks.map((stack) => {
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
		)}
		{@const labelHeight = trayYOffset + maxStackHeight + 5}
		{#each trayData.counterStacks as stack, stackIdx (stackIdx)}
			{@const refCode = `${trayLetter}${stackIdx + 1}`}
			{@const posX = stack.isEdgeLoaded
				? stack.edgeOrientation === 'lengthwise'
					? trayXOffset + stack.x + (stack.slotWidth ?? stack.count * stack.thickness) / 2
					: trayXOffset + stack.x + (stack.slotWidth ?? stack.length) / 2
				: trayXOffset + stack.x}
			{@const posZ = stack.isEdgeLoaded
				? stack.edgeOrientation === 'lengthwise'
					? trayZOffset - stack.y - (stack.slotDepth ?? stack.length) / 2
					: trayZOffset - stack.y - (stack.slotDepth ?? stack.count * stack.thickness) / 2
				: trayZOffset - stack.y}
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
