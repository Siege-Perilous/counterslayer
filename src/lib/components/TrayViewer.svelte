<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TrayScene from './TrayScene.svelte';
	import type { BufferGeometry } from 'three';
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
		explosionAmount?: number;
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
		boxFloorThickness = 2,
		explosionAmount = 0
	}: Props = $props();
</script>

<div class="h-full w-full">
	<Canvas>
		<TrayScene
			{geometry}
			{allTrays}
			{boxGeometry}
			{lidGeometry}
			{importedGeometry}
			{printBedSize}
			{exploded}
			{showAllTrays}
			{boxWallThickness}
			{boxTolerance}
			{boxFloorThickness}
			{explosionAmount}
		/>
	</Canvas>
</div>
