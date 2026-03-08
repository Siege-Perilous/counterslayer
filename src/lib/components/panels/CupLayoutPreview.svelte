<script lang="ts">
	import type { CupLayout, CupLayoutNode, CupId } from '$lib/types/cupLayout';
	import { isCupLeaf, isCupSplit } from '$lib/types/cupLayout';
	import CupCell from './CupCell.svelte';
	import SplitDivider from './SplitDivider.svelte';

	interface Props {
		layout: CupLayout;
		selectedCupId: CupId | null;
		trayWidth: number; // Tray width in mm
		trayDepth: number; // Tray depth in mm
		onSelectCup: (id: CupId) => void;
		onUpdateRatio: (splitPath: string, newRatio: number) => void;
	}

	let { layout, selectedCupId, trayWidth, trayDepth, onSelectCup, onUpdateRatio }: Props = $props();

	// Track container dimensions
	let containerWidth = $state(0);
	let containerHeight = $state(0);

	// Fixed pixel gap between cups
	const GAP_PX = 8;
	// Inset from container edges to prevent border clipping
	const EDGE_INSET = 1;

	// Data structure for rendered elements (all in pixels)
	interface RenderedCup {
		id: CupId;
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface RenderedDivider {
		key: string;
		splitPath: string;
		direction: 'horizontal' | 'vertical';
		ratio: number; // Original ratio (0-1)
		absolutePosition: number; // Absolute position in container (pixels)
		x: number;
		y: number;
		width: number;
		height: number;
	}

	// Compute rendered elements from layout tree (in pixels)
	let renderedElements = $derived.by(() => {
		const cups: RenderedCup[] = [];
		const dividers: RenderedDivider[] = [];

		// Need valid dimensions to compute
		if (containerWidth === 0 || containerHeight === 0) {
			return { cups, dividers };
		}

		function traverse(
			node: CupLayoutNode,
			x: number,
			y: number,
			width: number,
			height: number,
			splitPath: string
		): void {
			if (isCupLeaf(node)) {
				cups.push({
					id: node.id,
					x: Math.round(x),
					y: Math.round(y),
					width: Math.round(width),
					height: Math.round(height)
				});
				return;
			}

			if (isCupSplit(node)) {
				if (node.direction === 'vertical') {
					// Left/right split
					const leftWidth = width * node.ratio - GAP_PX / 2;
					const rightWidth = width * (1 - node.ratio) - GAP_PX / 2;
					const rightX = x + leftWidth + GAP_PX;

					traverse(node.first, x, y, leftWidth, height, `${splitPath}-L`);
					traverse(node.second, rightX, y, rightWidth, height, `${splitPath}-R`);

					// Add divider
					const absolutePosition = x + node.ratio * width;
					dividers.push({
						key: `${splitPath}-div`,
						splitPath,
						direction: 'vertical',
						ratio: node.ratio,
						absolutePosition,
						x,
						y,
						width,
						height
					});
				} else {
					// Top/bottom split
					const bottomHeight = height * node.ratio - GAP_PX / 2;
					const topHeight = height * (1 - node.ratio) - GAP_PX / 2;
					const topY = y + bottomHeight + GAP_PX;

					traverse(node.first, x, y, width, bottomHeight, `${splitPath}-L`);
					traverse(node.second, x, topY, width, topHeight, `${splitPath}-R`);

					// Add divider
					const absolutePosition = y + node.ratio * height;
					dividers.push({
						key: `${splitPath}-div`,
						splitPath,
						direction: 'horizontal',
						ratio: node.ratio,
						absolutePosition,
						x,
						y,
						width,
						height
					});
				}
			}
		}

		// Start with edge inset to prevent border clipping
		traverse(
			layout.root,
			EDGE_INSET,
			EDGE_INSET,
			containerWidth - 2 * EDGE_INSET,
			containerHeight - 2 * EDGE_INSET,
			'root'
		);

		return { cups, dividers };
	});

	// Track which divider is being snapped to
	let snapTargetKey = $state<string | null>(null);

	// Compute snap targets for a divider (other dividers on same axis)
	function getSnapTargets(dividerKey: string, direction: 'horizontal' | 'vertical') {
		return renderedElements.dividers
			.filter((d) => d.key !== dividerKey && d.direction === direction)
			.map((d) => ({ key: d.key, absolutePosition: d.absolutePosition }));
	}

	function handleDividerDrag(splitPath: string, newRatio: number) {
		onUpdateRatio(splitPath, newRatio);
	}

	function handleSnapChange(key: string | null) {
		snapTargetKey = key;
	}
</script>

<div
	class="cupLayoutPreview"
	style="aspect-ratio: {trayWidth} / {trayDepth};"
	bind:clientWidth={containerWidth}
	bind:clientHeight={containerHeight}
>
	{#each renderedElements.cups as cup (cup.id)}
		<CupCell
			id={cup.id}
			x={cup.x}
			y={cup.y}
			width={cup.width}
			height={cup.height}
			selected={selectedCupId === cup.id}
			onSelect={onSelectCup}
		/>
	{/each}

	{#each renderedElements.dividers as divider (divider.key)}
		<SplitDivider
			direction={divider.direction}
			position={divider.ratio}
			x={divider.x}
			y={divider.y}
			width={divider.width}
			height={divider.height}
			snapTargets={getSnapTargets(divider.key, divider.direction)}
			isSnapTarget={snapTargetKey === divider.key}
			onDrag={(ratio) => handleDividerDrag(divider.splitPath, ratio)}
			onSnapChange={handleSnapChange}
		/>
	{/each}
</div>

<style>
	.cupLayoutPreview {
		position: relative;
		width: 100%;
		overflow: hidden;
	}
</style>
