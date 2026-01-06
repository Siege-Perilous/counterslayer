<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid } from '@threlte/extras';
	import type { BufferGeometry } from 'three';
	import * as THREE from 'three';
	import type { TrayPlacement } from '$lib/models/box';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
	}

	interface Props {
		geometry: BufferGeometry | null;
		allTrays?: TrayGeometryData[];
		boxGeometry?: BufferGeometry | null;
		lidGeometry?: BufferGeometry | null;
		importedGeometry: BufferGeometry | null;
		printBedSize: number;
		exploded?: boolean;
		showAllTrays?: boolean;
		boxWallThickness?: number;
		boxTolerance?: number;
		boxFloorThickness?: number;
	}

	let {
		geometry,
		allTrays = [],
		boxGeometry = null,
		lidGeometry = null,
		importedGeometry,
		printBedSize,
		exploded = false,
		showAllTrays = false,
		boxWallThickness = 3,
		boxTolerance = 0.5,
		boxFloorThickness = 2
	}: Props = $props();

	// Interior offset from box origin (wall + tolerance)
	let interiorStartOffset = $derived(boxWallThickness + boxTolerance);

	// Helper to get geometry bounds
	function getGeomBounds(geom: BufferGeometry | null): THREE.Box3 | null {
		if (!geom) return null;
		geom.computeBoundingBox();
		return geom.boundingBox;
	}

	// Individual geometry bounds
	let trayBounds = $derived(getGeomBounds(geometry));
	let boxBounds = $derived(getGeomBounds(boxGeometry));
	let lidBounds = $derived(getGeomBounds(lidGeometry));

	// Gap between objects in side-by-side view
	const sideGap = 20;

	// Calculate total depth of trays group (stacked along Y/Z)
	let traysGroupDepth = $derived.by(() => {
		if (allTrays.length === 0) return 0;
		// Sum of all tray depths (they're stacked along Y)
		return allTrays.reduce((sum, t) => sum + t.placement.dimensions.depth, 0);
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
			const maxTrayWidth = Math.max(...allTrays.map(t => t.placement.dimensions.width));
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
					z: item.depth  // Back edge at Z=0, front at Z=depth
				};
			}
			currentX += item.width + sideGap;
		}

		return positions;
	});

	// Combined bounds for camera positioning
	let allGeometries = $derived.by(() => {
		const geoms: BufferGeometry[] = [];
		if (geometry) geoms.push(geometry);
		if (boxGeometry) geoms.push(boxGeometry);
		if (lidGeometry) geoms.push(lidGeometry);
		if (importedGeometry) geoms.push(importedGeometry);
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
		if (!combinedBounds) return printBedSize;

		let effectiveWidth = combinedBounds.max.x - combinedBounds.min.x;

		// Account for side-by-side spread in "All" mode
		if (showAllTrays && !exploded) {
			const widths: number[] = [];
			if (boxBounds) widths.push(boxBounds.max.x - boxBounds.min.x);
			if (allTrays.length > 0) {
				widths.push(Math.max(...allTrays.map(t => t.placement.dimensions.width)));
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

	// Exploded view offsets - trays inside box, lid floating above
	let explodedOffset = $derived.by(() => {
		if (!exploded) return { box: 0, trays: 0, lid: 0 };
		// Get box height for lid positioning
		const boxHeight = boxBounds ? (boxBounds.max.z - boxBounds.min.z) : 0;
		return {
			box: 0,
			trays: 0,  // Trays sit inside box at same Y level
			lid: boxHeight * 1.5  // Lid floats one box height above
		};
	});

	// Tray colors for visual distinction
	const trayColors = ['#4a9eff', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
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
<T.AmbientLight intensity={0.4} />

<!-- Box geometry (green) -->
{#if boxGeometry}
	<T.Mesh
		geometry={boxGeometry}
		rotation.x={-Math.PI / 2}
		position.x={showAllTrays && !exploded ? sidePositions.box.x : meshOffset.x}
		position.y={explodedOffset.box}
		position.z={showAllTrays && !exploded ? sidePositions.box.z : meshOffset.z}
	>
		<T.MeshStandardMaterial color="#22c55e" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} transparent opacity={0.85} />
	</T.Mesh>
{/if}

<!-- All trays with positions (when showAllTrays is true) -->
{#if showAllTrays && allTrays.length > 0}
	{#each allTrays as trayData, i (trayData.trayId)}
		{@const placement = trayData.placement}
		{@const boxDepth = boxBounds ? (boxBounds.max.y - boxBounds.min.y) : traysGroupDepth}
		{@const interiorOffset = (boxDepth - traysGroupDepth) / 2}
		{@const xOffset = exploded ? (meshOffset.x + interiorStartOffset) : sidePositions.traysGroup.x}
		{@const yOffset = exploded ? boxFloorThickness : explodedOffset.trays}
		{@const zOffset = exploded
			? (meshOffset.z - interiorStartOffset - placement.y)
			: (sidePositions.traysGroup.z + interiorOffset - placement.y)}
		<T.Mesh
			geometry={trayData.geometry}
			rotation.x={-Math.PI / 2}
			position.x={xOffset}
			position.y={yOffset}
			position.z={zOffset}
		>
			<T.MeshStandardMaterial color={trayColors[i % trayColors.length]} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
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
		<T.MeshStandardMaterial color="#4a9eff" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
	</T.Mesh>
{/if}

<!-- Lid geometry (purple) -->
{#if lidGeometry}
	{@const lidDepth = lidBounds ? (lidBounds.max.y - lidBounds.min.y) : 0}
	<T.Mesh
		geometry={lidGeometry}
		rotation.x={exploded ? Math.PI / 2 : -Math.PI / 2}
		position.x={showAllTrays && !exploded ? sidePositions.lid.x : meshOffset.x}
		position.y={explodedOffset.lid}
		position.z={showAllTrays && !exploded ? sidePositions.lid.z : (exploded ? meshOffset.z - lidDepth : meshOffset.z)}
	>
		<T.MeshStandardMaterial color="#a855f7" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
	</T.Mesh>
{/if}

<!-- Imported geometry (orange) -->
{#if importedGeometry}
	<T.Mesh
		geometry={importedGeometry}
		rotation.x={-Math.PI / 2}
		position.x={meshOffset.x}
		position.z={meshOffset.z}
	>
		<T.MeshStandardMaterial color="#ff9f4a" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
	</T.Mesh>
{/if}

<Grid
	position.y={-0.01}
	cellColor="#6f6f6f"
	sectionColor="#9d4b4b"
	sectionThickness={1.5}
	cellSize={10}
	sectionSize={50}
	gridSize={[printBedSize, printBedSize]}
	fadeDistance={printBedSize * 1.5}
/>
