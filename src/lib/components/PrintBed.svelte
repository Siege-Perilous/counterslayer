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

	const [posX, posY, posZ] = position;

	// Create procedural texture for print bed
	function createBedTexture(): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const ctx = canvas.getContext('2d')!;

		// Dark base
		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, 256, 256);

		// Add some noise for texture
		const imageData = ctx.getImageData(0, 0, 256, 256);
		for (let i = 0; i < imageData.data.length; i += 4) {
			const noise = (Math.random() - 0.5) * 10;
			imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
			imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
			imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
		}
		ctx.putImageData(imageData, 0, 0);

		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(size / 50, size / 50);
		return texture;
	}

	let bedTexture = $derived(createBedTexture());

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

<!-- Print bed surface -->
<T.Mesh position={[posX, posY - 1, posZ]} rotation.x={-Math.PI / 2}>
	<T.PlaneGeometry args={[size, size]} />
	<T.MeshStandardMaterial
		map={bedTexture}
		side={THREE.DoubleSide}
		roughness={0.7}
		metalness={0.1}
	/>
</T.Mesh>

<!-- Print bed border -->
<T.LineLoop position={[posX, posY - 0.5, posZ]}>
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
