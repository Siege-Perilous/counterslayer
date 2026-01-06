<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TrayScene from './TrayScene.svelte';
	import type { BufferGeometry } from 'three';

	interface Props {
		geometry: BufferGeometry | null;
		printBedSize: number;
	}

	let { geometry, printBedSize }: Props = $props();
</script>

<div class="h-full w-full">
	<Canvas>
		<TrayScene {geometry} {printBedSize} />
	</Canvas>
</div>
