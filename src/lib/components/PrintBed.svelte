<script lang="ts">
	import { T } from '@threlte/core';
	import { Text } from '@threlte/extras';
	import * as THREE from 'three';

	interface Props {
		size: number;
		title?: string;
		position?: [number, number, number];
	}

	let { size, title = '', position = [0, 0, 0] }: Props = $props();

	// Make position values reactive
	let posX = $derived(position[0]);
	let posY = $derived(position[1]);
	let posZ = $derived(position[2]);

	// Grid settings (must match background grid)
	const cellSize = 10;
	const sectionSize = 50;

	// Create noise texture for the bed surface
	function createNoiseTexture(): THREE.CanvasTexture {
		const pixelsPerMm = 4;
		const canvasSize = size * pixelsPerMm;

		const canvas = document.createElement('canvas');
		canvas.width = canvasSize;
		canvas.height = canvasSize;
		const ctx = canvas.getContext('2d')!;

		// Mid-gray base (will be tinted by material color)
		ctx.fillStyle = '#808080';
		ctx.fillRect(0, 0, canvasSize, canvasSize);

		// Add subtle noise texture
		const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
			const noise = (Math.random() - 0.5) * 30;
			data[i] = Math.max(0, Math.min(255, data[i] + noise));
			data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
			data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
		}
		ctx.putImageData(imageData, 0, 0);

		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		return texture;
	}

	// Generate grid line geometries
	let cellGeometry = $derived.by(() => {
		const worldXMin = posX - size / 2;
		const worldXMax = posX + size / 2;
		const worldZMin = posZ - size / 2;
		const worldZMax = posZ + size / 2;

		const firstCellX = Math.ceil(worldXMin / cellSize) * cellSize;
		const firstCellZ = Math.ceil(worldZMin / cellSize) * cellSize;

		const cellLines: number[] = [];

		// Vertical cell lines (constant X)
		for (let worldX = firstCellX; worldX <= worldXMax; worldX += cellSize) {
			if (worldX % sectionSize === 0) continue;
			cellLines.push(worldX, posY + 0.15, worldZMin);
			cellLines.push(worldX, posY + 0.15, worldZMax);
		}

		// Horizontal cell lines (constant Z)
		for (let worldZ = firstCellZ; worldZ <= worldZMax; worldZ += cellSize) {
			if (worldZ % sectionSize === 0) continue;
			cellLines.push(worldXMin, posY + 0.15, worldZ);
			cellLines.push(worldXMax, posY + 0.15, worldZ);
		}

		if (cellLines.length === 0) return null;

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(cellLines, 3));
		return geometry;
	});

	let sectionGeometry = $derived.by(() => {
		const worldXMin = posX - size / 2;
		const worldXMax = posX + size / 2;
		const worldZMin = posZ - size / 2;
		const worldZMax = posZ + size / 2;

		const firstSectionX = Math.ceil(worldXMin / sectionSize) * sectionSize;
		const firstSectionZ = Math.ceil(worldZMin / sectionSize) * sectionSize;

		const sectionLines: number[] = [];

		// Vertical section lines
		for (let worldX = firstSectionX; worldX <= worldXMax; worldX += sectionSize) {
			sectionLines.push(worldX, posY + 0.2, worldZMin);
			sectionLines.push(worldX, posY + 0.2, worldZMax);
		}

		// Horizontal section lines
		for (let worldZ = firstSectionZ; worldZ <= worldZMax; worldZ += sectionSize) {
			sectionLines.push(worldXMin, posY + 0.2, worldZ);
			sectionLines.push(worldXMax, posY + 0.2, worldZ);
		}

		if (sectionLines.length === 0) return null;

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(sectionLines, 3));
		return geometry;
	});

	let noiseTexture = $derived.by(() => createNoiseTexture());

	// Calculate label positions relative to bed center
	let bedSizeLabelPos: [number, number, number] = $derived([
		posX - size / 2 + 5,
		posY + 0.5,
		posZ + size / 2 - 5
	]);

	let titleLabelPos: [number, number, number] = $derived([
		posX - size / 2 + 5,
		posY + 0.5,
		posZ - size / 2 + 5
	]);
</script>

<!-- Print bed surface with noise texture (reacts to lighting) -->
<T.Mesh position={[posX, posY + 0.01, posZ]} rotation.x={-Math.PI / 2}>
	<T.PlaneGeometry args={[size, size]} />
	<T.MeshStandardMaterial map={noiseTexture} color="#3a3a3a" roughness={0.8} metalness={0.05} />
</T.Mesh>

<!-- Cell grid lines -->
{#if cellGeometry}
	<T.LineSegments geometry={cellGeometry}>
		<T.LineBasicMaterial color="#4a4a4a" />
	</T.LineSegments>
{/if}

<!-- Section grid lines -->
{#if sectionGeometry}
	<T.LineSegments geometry={sectionGeometry}>
		<T.LineBasicMaterial color="#6a6a6a" />
	</T.LineSegments>
{/if}

<!-- Print bed border -->
<T.LineLoop position={[posX, posY + 0.15, posZ]}>
	<T.BufferGeometry>
		<T.BufferAttribute
			attach="attributes-position"
			args={[
				new Float32Array([
					-size / 2,
					0,
					-size / 2,
					size / 2,
					0,
					-size / 2,
					size / 2,
					0,
					size / 2,
					-size / 2,
					0,
					size / 2
				]),
				3
			]}
		/>
	</T.BufferGeometry>
	<T.LineBasicMaterial color="#c9503c" linewidth={2} />
</T.LineLoop>

<!-- Bed size label -->
<Text
	text={`${size}mm bed`}
	fontSize={8}
	position={bedSizeLabelPos}
	rotation={[-Math.PI / 2, 0, 0]}
	color="#c9503c"
	anchorX="left"
	anchorY="bottom"
/>

<!-- Title label -->
{#if title}
	<Text
		text={title}
		fontSize={10}
		position={titleLabelPos}
		rotation={[-Math.PI / 2, 0, 0]}
		color="#ffffff"
		anchorX="left"
		anchorY="top"
	/>
{/if}
