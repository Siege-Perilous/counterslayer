<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls, Grid } from '@threlte/extras';
	import type { BufferGeometry } from 'three';
	import * as THREE from 'three';

	interface Props {
		geometry: BufferGeometry | null;
		printBedSize: number;
	}

	let { geometry, printBedSize }: Props = $props();

	// Compute bounding box and mesh offset to center on grid
	// Note: geometry is rotated -90° around X, so Z becomes Y and Y becomes -Z
	let bounds = $derived.by(() => {
		if (!geometry) return null;
		geometry.computeBoundingBox();
		return geometry.boundingBox;
	});

	// Offset to center the mesh on the grid (centered on X/Z, bottom at Y=0)
	// After -90° rotation around X: original Y becomes -Z, original Z becomes Y
	let meshOffset = $derived.by(() => {
		if (!bounds) return { x: 0, y: 0, z: 0 };
		return {
			x: -(bounds.max.x + bounds.min.x) / 2,
			z: (bounds.max.y + bounds.min.y) / 2  // Center on Z (was Y, inverted by rotation)
		};
	});

	// Camera target (center of mesh after offset, which is now at origin)
	let cameraTarget = $derived.by(() => {
		if (!bounds) return { x: 0, y: 0, z: 0 };
		const height = bounds.max.z - bounds.min.z;  // Z becomes Y after rotation
		return {
			x: 0,
			y: height / 2,
			z: 0
		};
	});

	let cameraDistance = $derived.by(() => {
		if (!bounds) return printBedSize;
		const size = Math.max(
			bounds.max.x - bounds.min.x,
			bounds.max.y - bounds.min.y,
			bounds.max.z - bounds.min.z,
			printBedSize
		);
		return size * 1.2;
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

{#if geometry}
	<T.Mesh
		{geometry}
		rotation.x={-Math.PI / 2}
		position.x={meshOffset.x}
		position.z={meshOffset.z}
	>
		<T.MeshStandardMaterial color="#4a9eff" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
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
