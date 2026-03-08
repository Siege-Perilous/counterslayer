<script lang="ts">
	import type { CupLayout, CupLayoutNode, CupId } from '$lib/types/cupLayout';
	import { isCupLeaf, isCupSplit } from '$lib/types/cupLayout';
	import CupCell from './CupCell.svelte';
	import SplitDivider from './SplitDivider.svelte';

	interface Props {
		layout: CupLayout;
		selectedCupId: CupId | null;
		wallThickness: number; // Wall thickness in mm (for calculating gap percentages)
		trayWidth: number; // Tray width in mm
		trayDepth: number; // Tray depth in mm
		onSelectCup: (id: CupId) => void;
		onUpdateRatio: (splitPath: string, newRatio: number) => void;
	}

	let {
		layout,
		selectedCupId,
		wallThickness,
		trayWidth,
		trayDepth,
		onSelectCup,
		onUpdateRatio
	}: Props = $props();

	// Calculate gap percentage based on wall thickness
	let gapPercentX = $derived((wallThickness / trayWidth) * 100);
	let gapPercentY = $derived((wallThickness / trayDepth) * 100);

	// Data structure for rendered elements
	interface RenderedCup {
		id: CupId;
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface RenderedDivider {
		key: string;
		splitPath: string; // Path to the split node in the tree (e.g., "root", "root-L")
		direction: 'horizontal' | 'vertical';
		position: number; // Position in percent within containing area
		absolutePosition: number; // Absolute position in container (percent)
		x: number;
		y: number;
		width: number;
		height: number;
	}

	// Compute rendered elements from layout tree
	let renderedElements = $derived.by(() => {
		const cups: RenderedCup[] = [];
		const dividers: RenderedDivider[] = [];

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
					x,
					y,
					width,
					height
				});
				return;
			}

			if (isCupSplit(node)) {
				const gapX = gapPercentX;
				const gapY = gapPercentY;

				if (node.direction === 'vertical') {
					// Left/right split
					const leftWidth = width * node.ratio - gapX / 2;
					const rightWidth = width * (1 - node.ratio) - gapX / 2;
					const rightX = x + leftWidth + gapX;

					traverse(node.first, x, y, leftWidth, height, `${splitPath}-L`);
					traverse(node.second, rightX, y, rightWidth, height, `${splitPath}-R`);

					// Add divider
					const absolutePosition = x + node.ratio * width;
					dividers.push({
						key: `${splitPath}-div`,
						splitPath,
						direction: 'vertical',
						position: node.ratio * 100,
						absolutePosition,
						x,
						y,
						width,
						height
					});
				} else {
					// Top/bottom split
					const topHeight = height * node.ratio - gapY / 2;
					const bottomHeight = height * (1 - node.ratio) - gapY / 2;
					const bottomY = y + topHeight + gapY;

					traverse(node.first, x, y, width, topHeight, `${splitPath}-L`);
					traverse(node.second, x, bottomY, width, bottomHeight, `${splitPath}-R`);

					// Add divider
					const absolutePosition = y + node.ratio * height;
					dividers.push({
						key: `${splitPath}-div`,
						splitPath,
						direction: 'horizontal',
						position: node.ratio * 100,
						absolutePosition,
						x,
						y,
						width,
						height
					});
				}
			}
		}

		// Start at full bounds (no outer padding in preview - cups fill the area)
		traverse(layout.root, 0, 0, 100, 100, 'root');

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

	function handleDividerDrag(splitPath: string, newPosition: number) {
		// Convert position (0-100) to ratio (0-1)
		onUpdateRatio(splitPath, newPosition / 100);
	}

	function handleSnapChange(key: string | null) {
		snapTargetKey = key;
	}
</script>

<div class="cup-layout-preview" style="aspect-ratio: {trayWidth} / {trayDepth};">
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
			position={divider.position}
			x={divider.x}
			y={divider.y}
			width={divider.width}
			height={divider.height}
			snapTargets={getSnapTargets(divider.key, divider.direction)}
			isSnapTarget={snapTargetKey === divider.key}
			onDrag={(pos) => handleDividerDrag(divider.splitPath, pos)}
			onSnapChange={handleSnapChange}
		/>
	{/each}
</div>

<style>
	.cup-layout-preview {
		position: relative;
		width: 100%;
		overflow: hidden;
	}
</style>
