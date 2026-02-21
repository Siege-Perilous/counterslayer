<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid } from '@threlte/extras';
	import type { BufferGeometry } from 'three';
	import * as THREE from 'three';
	import type { TrayPlacement } from '$lib/models/box';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';
	import type { CounterStack } from '$lib/models/counterTray';

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
		counterStacks: CounterStack[];
	}

	interface Props {
		geometry: BufferGeometry | null;
		allTrays?: TrayGeometryData[];
		boxGeometry?: BufferGeometry | null;
		lidGeometry?: BufferGeometry | null;
		printBedSize: number;
		exploded?: boolean;
		showAllTrays?: boolean;
		boxWallThickness?: number;
		boxTolerance?: number;
		boxFloorThickness?: number;
		explosionAmount?: number;
		showCounters?: boolean;
		selectedTrayCounters?: CounterStack[];
	}

	let {
		geometry,
		allTrays = [],
		boxGeometry = null,
		lidGeometry = null,
		printBedSize,
		exploded = false,
		showAllTrays = false,
		boxWallThickness = 3,
		boxTolerance = 0.5,
		boxFloorThickness = 2,
		explosionAmount = 0,
		showCounters = false,
		selectedTrayCounters = []
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

	// Tray colors for visual distinction - varied hues for easier differentiation
	const trayColors = ['#f97316', '#06b6d4', '#ec4899', '#eab308', '#8b5cf6', '#10b981'];

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
<T.AmbientLight intensity={0.4} />

<!-- Box geometry (green) -->
{#if boxGeometry}
	{@const boxWidth = boxBounds ? boxBounds.max.x - boxBounds.min.x : 0}
	<T.Mesh
		geometry={boxGeometry}
		rotation.x={-Math.PI / 2}
		position.x={showAllTrays && !exploded ? sidePositions.box.x - boxWidth / 2 : meshOffset.x}
		position.y={explodedOffset.box}
		position.z={showAllTrays && !exploded ? sidePositions.box.z : meshOffset.z}
	>
		<T.MeshStandardMaterial
			color="#22c55e"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
			transparent
			opacity={0.85}
		/>
	</T.Mesh>
{/if}

<!-- All trays with positions (when showAllTrays is true) -->
{#if showAllTrays && allTrays.length > 0}
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
			color="#f97316"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Lid geometry (purple) -->
{#if lidGeometry}
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
			color="#a855f7"
			roughness={0.6}
			metalness={0.1}
			side={THREE.DoubleSide}
		/>
	</T.Mesh>
{/if}

<!-- Counter preview for single tray view (only when tray geometry is visible) -->
{#if showCounters && !showAllTrays && geometry && selectedTrayCounters.length > 0}
	{#each selectedTrayCounters as stack, stackIdx (stackIdx)}
		{#if stack.isEdgeLoaded}
			<!-- Edge-loaded: counters standing on edge like books -->
			{#each Array(stack.count) as _counterItem, counterIdx (counterIdx)}
				{@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
				{@const standingHeight =
					stack.shape === 'custom'
						? Math.min(stack.width, stack.length)
						: Math.max(stack.width, stack.length)}
				{@const counterY = stack.z + standingHeight / 2}
				{@const isAlt = counterIdx % 2 === 1}
				{@const counterColor = isAlt ? `hsl(${(stackIdx * 137.508) % 360}, 50%, 40%)` : stack.color}
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
					{:else}
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
					{:else}
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
				{@const counterColor = isAlt ? `hsl(${(stackIdx * 137.508) % 360}, 50%, 40%)` : stack.color}
				{@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
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
				{:else}
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
				{/if}
			{/each}
		{/if}
	{/each}
{/if}

<!-- Counter preview for all trays view -->
{#if showCounters && showAllTrays && allTrays.length > 0}
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
					{@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
					{@const standingHeight =
						stack.shape === 'custom'
							? Math.min(stack.width, stack.length)
							: Math.max(stack.width, stack.length)}
					{@const counterY = trayYOffset + stack.z + standingHeight / 2}
					{@const isAlt = counterIdx % 2 === 1}
					{@const counterColor = isAlt
						? `hsl(${(stackIdx * 137.508) % 360}, 50%, 40%)`
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
						{:else}
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
						{:else}
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
						? `hsl(${(stackIdx * 137.508) % 360}, 50%, 40%)`
						: stack.color}
					{@const effectiveShape = stack.shape === 'custom' ? (stack.customBaseShape ?? 'rectangle') : stack.shape}
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
					{:else}
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
					{/if}
				{/each}
			{/if}
		{/each}
	{/each}
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
