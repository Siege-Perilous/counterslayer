<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TrayScene from './TrayScene.svelte';
	import type { BufferGeometry } from 'three';
	import type { TrayPlacement } from '$lib/models/box';
	import type { CounterStack } from '$lib/models/counterTray';
	import type { CaptureOptions } from '$lib/utils/screenshotCapture';

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
		selectedTrayId?: string;
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
		selectedTrayId = '',
		triangleCornerRadius = 1.5,
		showReferenceLabels = false,
		hidePrintBed = false,
		viewTitle = '',
		onCaptureReady
	}: Props = $props();
</script>

<div class="trayViewer">
	<Canvas>
		<TrayScene
			{geometry}
			{allTrays}
			{allBoxes}
			{boxGeometry}
			{lidGeometry}
			{printBedSize}
			{exploded}
			{showAllTrays}
			{showAllBoxes}
			{boxWallThickness}
			{boxTolerance}
			{boxFloorThickness}
			{explosionAmount}
			{showCounters}
			{selectedTrayCounters}
			{selectedTrayLetter}
			{selectedTrayId}
			{triangleCornerRadius}
			{showReferenceLabels}
			{hidePrintBed}
			{viewTitle}
			{onCaptureReady}
		/>
	</Canvas>
</div>

<style>
	.trayViewer {
		height: 100%;
		width: 100%;
	}
</style>
