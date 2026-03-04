<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import * as THREE from 'three';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		getWorkingPlacements,
		getSelectedTrayId,
		selectTray,
		updateTrayPosition,
		setSnapGuides,
		clearSnapGuides,
		getActiveSnapGuides,
		getPrintBedSize,
		getEffectiveDimensions,
		type EditorTrayPlacement
	} from '$lib/stores/layoutEditor.svelte';
	import { snapPosition, isValidPosition } from '$lib/utils/layoutSnapping';

	// Props
	interface Props {
		boxWallThickness?: number;
		boxTolerance?: number;
	}

	let { boxWallThickness: _boxWallThickness = 3, boxTolerance: _boxTolerance = 0.5 }: Props =
		$props();

	const { renderer, camera } = useThrelte();

	// State
	let isDragging = $state(false);
	let dragStartPoint = $state<THREE.Vector3 | null>(null);
	let dragStartTrayPos = $state<{ x: number; y: number } | null>(null);
	let hoveredTrayId = $state<string | null>(null);

	// Derived
	let placements = $derived(getWorkingPlacements());
	let selectedTrayId = $derived(getSelectedTrayId());
	let snapGuides = $derived(getActiveSnapGuides());
	let printBedSize = $derived(getPrintBedSize());

	// Raycaster for picking
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const intersectPoint = new THREE.Vector3();

	// Map tray IDs to mesh references
	let trayMeshes = new SvelteMap<string, THREE.Mesh>();

	function registerTrayMesh(trayId: string, mesh: THREE.Mesh) {
		trayMeshes.set(trayId, mesh);
	}

	function updateMousePosition(event: MouseEvent) {
		const canvas = renderer.domElement;
		const rect = canvas.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	function getIntersectedTrayId(): string | null {
		raycaster.setFromCamera(mouse, camera.current);

		// Check intersection with tray meshes
		const meshArray = Array.from(trayMeshes.values());
		const intersects = raycaster.intersectObjects(meshArray, false);

		if (intersects.length > 0) {
			const mesh = intersects[0].object as THREE.Mesh;
			// Find tray ID from mesh
			for (const [id, m] of trayMeshes) {
				if (m === mesh) return id;
			}
		}
		return null;
	}

	function getFloorPosition(): THREE.Vector3 | null {
		raycaster.setFromCamera(mouse, camera.current);
		if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
			return intersectPoint.clone();
		}
		return null;
	}

	function handlePointerDown(event: MouseEvent) {
		if (event.button !== 0) return; // Only left click

		updateMousePosition(event);
		const trayId = getIntersectedTrayId();

		if (trayId) {
			selectTray(trayId);

			// Start drag
			const floorPos = getFloorPosition();
			const placement = placements.find((p) => p.trayId === trayId);
			if (floorPos && placement) {
				isDragging = true;
				dragStartPoint = floorPos;
				dragStartTrayPos = { x: placement.x, y: placement.y };
			}
		} else {
			// Clicked empty space - deselect
			selectTray(null);
		}
	}

	function handlePointerMove(event: MouseEvent) {
		updateMousePosition(event);

		if (isDragging && selectedTrayId && dragStartPoint && dragStartTrayPos) {
			const floorPos = getFloorPosition();
			if (floorPos) {
				// Calculate delta from drag start
				// Note: Three.js X = layout X, Three.js Z = -layout Y
				const deltaX = floorPos.x - dragStartPoint.x;
				const deltaY = -(floorPos.z - dragStartPoint.z);

				const newX = dragStartTrayPos.x + deltaX;
				const newY = dragStartTrayPos.y + deltaY;

				const placement = placements.find((p) => p.trayId === selectedTrayId);
				if (placement) {
					// Apply snapping
					const snapResult = snapPosition(placement, newX, newY, placements, printBedSize);

					// Check if position is valid (no overlaps)
					if (isValidPosition(placement, snapResult.x, snapResult.y, placements, printBedSize)) {
						updateTrayPosition(selectedTrayId, snapResult.x, snapResult.y);
						setSnapGuides(snapResult.guides);
					}
				}
			}
		} else {
			// Update hover state
			hoveredTrayId = getIntersectedTrayId();
		}
	}

	function handlePointerUp() {
		isDragging = false;
		dragStartPoint = null;
		dragStartTrayPos = null;
		clearSnapGuides();
	}

	// Get Three.js position from layout position
	function getThreePosition(placement: EditorTrayPlacement): [number, number, number] {
		const dims = getEffectiveDimensions(placement);
		// Three.js: X = layout X (centered), Y = height/2, Z = -layout Y (centered)
		// Position is at corner in layout, but Three.js boxes are centered
		const x = placement.x + dims.width / 2;
		const y = placement.height / 2;
		const z = -(placement.y + dims.depth / 2);
		return [x, y, z];
	}

	// Get color based on state
	function getTrayColor(placement: EditorTrayPlacement): string {
		if (placement.trayId === selectedTrayId) {
			return '#4a9eff'; // Blue for selected
		}
		if (placement.trayId === hoveredTrayId) {
			// Lighten the original color for hover
			return placement.color;
		}
		return placement.color;
	}

	function getTrayEmissive(placement: EditorTrayPlacement): string {
		if (placement.trayId === selectedTrayId) {
			return '#2060c0';
		}
		if (placement.trayId === hoveredTrayId) {
			return '#404040';
		}
		return '#000000';
	}

	onMount(() => {
		const canvas = renderer.domElement;
		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointerleave', handlePointerUp);

		return () => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointerleave', handlePointerUp);
		};
	});
</script>

<!-- Camera and controls -->
<T.PerspectiveCamera
	makeDefault
	position={[printBedSize * 0.5, printBedSize * 0.8, printBedSize * 0.8]}
	fov={45}
/>
<OrbitControls
	enableDamping
	dampingFactor={0.1}
	target={[printBedSize / 2, 0, -printBedSize / 2]}
	enabled={!isDragging}
/>

<!-- Lighting -->
<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[50, 100, 50]} intensity={0.8} castShadow />

<!-- Print bed floor -->
<T.Mesh rotation.x={-Math.PI / 2} position={[printBedSize / 2, -0.5, -printBedSize / 2]}>
	<T.PlaneGeometry args={[printBedSize, printBedSize]} />
	<T.MeshStandardMaterial color="#1a1a1a" />
</T.Mesh>

<!-- Grid helper -->
<T.GridHelper
	args={[printBedSize, printBedSize / 10, '#333333', '#222222']}
	position={[printBedSize / 2, 0.01, -printBedSize / 2]}
/>

<!-- Tray meshes -->
{#each placements as placement (placement.trayId)}
	{@const dims = getEffectiveDimensions(placement)}
	{@const pos = getThreePosition(placement)}
	{@const isSelected = placement.trayId === selectedTrayId}
	{@const isHovered = placement.trayId === hoveredTrayId}
	<T.Mesh
		position={pos}
		rotation.y={(placement.rotation * Math.PI) / 180}
		oncreate={(ref) => registerTrayMesh(placement.trayId, ref)}
	>
		<T.BoxGeometry args={[dims.width, placement.height, dims.depth]} />
		<T.MeshStandardMaterial
			color={getTrayColor(placement)}
			emissive={getTrayEmissive(placement)}
			emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
			transparent
			opacity={isSelected || isHovered ? 1.0 : 0.25}
		/>
	</T.Mesh>

	<!-- Selection wireframe -->
	{#if isSelected}
		<T.LineSegments position={pos} rotation.y={(placement.rotation * Math.PI) / 180}>
			<T.EdgesGeometry args={[new THREE.BoxGeometry(dims.width, placement.height, dims.depth)]} />
			<T.LineBasicMaterial color="#ffffff" linewidth={2} />
		</T.LineSegments>
	{/if}

	<!-- Tray label -->
	<!-- Using a simple plane with text would go here, but for now skip to keep it simple -->
{/each}

<!-- Snap guides -->
{#each snapGuides as guide, guideIdx (guideIdx)}
	{@const geometry = new THREE.BufferGeometry().setFromPoints(
		guide.type === 'vertical'
			? [
					new THREE.Vector3(guide.position, 0.5, -guide.start),
					new THREE.Vector3(guide.position, 0.5, -guide.end)
				]
			: [
					new THREE.Vector3(guide.start, 0.5, -guide.position),
					new THREE.Vector3(guide.end, 0.5, -guide.position)
				]
	)}
	<T.Line args={[geometry]}>
		<T.LineBasicMaterial color="#00ffff" />
	</T.Line>
{/each}

<style>
	/* Component styles go here if needed */
</style>
