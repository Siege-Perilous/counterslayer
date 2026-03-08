<script lang="ts">
	// Snap target: absolute position in the container (pixels)
	interface SnapTarget {
		key: string;
		absolutePosition: number; // Position in container pixels
	}

	interface Props {
		direction: 'horizontal' | 'vertical'; // horizontal = top/bottom split, vertical = left/right split
		position: number; // Position as ratio (0-1) within containing area
		x: number; // Left edge of containing area (pixels)
		y: number; // Bottom edge of containing area (pixels)
		width: number; // Width of containing area (pixels)
		height: number; // Height of containing area (pixels)
		snapTargets?: SnapTarget[]; // Other dividers to snap to
		isSnapTarget?: boolean; // Whether another divider is snapping to this one
		onDrag: (newRatio: number) => void; // Called with new ratio (0-1)
		onSnapChange?: (snapKey: string | null) => void; // Called when snapping state changes
	}

	let {
		direction,
		position,
		x,
		y,
		width,
		height,
		snapTargets = [],
		isSnapTarget = false,
		onDrag,
		onSnapChange
	}: Props = $props();

	let isDragging = $state(false);
	let containerRef: HTMLElement | null = $state(null);

	const SNAP_THRESHOLD_PX = 6; // Snap within 6 pixels

	function handlePointerDown(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;

		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;

		// Get the parent container bounds
		const target = e.currentTarget as HTMLElement;
		const container = target.closest('.cupLayoutPreview') as HTMLElement;
		if (!container) return;

		const rect = container.getBoundingClientRect();

		let newRatio: number;
		let absolutePosition: number;

		if (direction === 'vertical') {
			// Left/right split - calculate X position
			const relativeX = e.clientX - rect.left - x;
			newRatio = Math.max(0.15, Math.min(0.85, relativeX / width));
			absolutePosition = x + newRatio * width;
		} else {
			// Top/bottom split - calculate Y position (inverted for bottom positioning)
			const relativeY = rect.bottom - e.clientY - y;
			newRatio = Math.max(0.15, Math.min(0.85, relativeY / height));
			absolutePosition = y + newRatio * height;
		}

		// Check for snap targets
		let snappedKey: string | null = null;
		for (const target of snapTargets) {
			if (Math.abs(absolutePosition - target.absolutePosition) < SNAP_THRESHOLD_PX) {
				// Snap to this target - convert back to local ratio
				if (direction === 'vertical') {
					newRatio = (target.absolutePosition - x) / width;
				} else {
					newRatio = (target.absolutePosition - y) / height;
				}
				// Clamp to valid range
				newRatio = Math.max(0.15, Math.min(0.85, newRatio));
				snappedKey = target.key;
				break;
			}
		}

		onSnapChange?.(snappedKey);
		onDrag(newRatio);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		onSnapChange?.(null);

		const target = e.currentTarget as HTMLElement;
		target.releasePointerCapture(e.pointerId);
	}

	// Calculate position style based on direction (all in pixels)
	let dividerStyle = $derived.by(() => {
		if (direction === 'vertical') {
			// Vertical divider line (for left/right split)
			const dividerX = x + position * width;
			return `left: ${dividerX}px; bottom: ${y}px; height: ${height}px; width: 8px; transform: translateX(-50%);`;
		} else {
			// Horizontal divider line (for top/bottom split)
			const dividerY = y + position * height;
			return `left: ${x}px; bottom: ${dividerY}px; width: ${width}px; height: 8px; transform: translateY(50%);`;
		}
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={containerRef}
	class="splitDivider"
	class:splitDivider--vertical={direction === 'vertical'}
	class:splitDivider--horizontal={direction === 'horizontal'}
	class:splitDivider--dragging={isDragging}
	class:splitDivider--snapTarget={isSnapTarget}
	style={dividerStyle}
	role="separator"
	aria-orientation={direction}
	aria-valuenow={Math.round(position * 100)}
	aria-valuemin={15}
	aria-valuemax={85}
	tabindex="0"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<div class="splitDivider__line"></div>
	<div class="splitDivider__handle"></div>
</div>

<style>
	.splitDivider {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		touch-action: none;
	}

	.splitDivider--vertical {
		cursor: ew-resize;
		flex-direction: column;
	}

	.splitDivider--horizontal {
		cursor: ns-resize;
		flex-direction: row;
	}

	.splitDivider__line {
		background: var(--contrastMedium);
		transition: background 0.15s ease;
	}

	.splitDivider--vertical .splitDivider__line {
		width: 2px;
		height: 100%;
	}

	.splitDivider--horizontal .splitDivider__line {
		height: 2px;
		width: 100%;
	}

	.splitDivider__handle {
		position: absolute;
		background: var(--fg);
		border-radius: 2px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.splitDivider--vertical .splitDivider__handle {
		width: 8px;
		height: 24px;
	}

	.splitDivider--horizontal .splitDivider__handle {
		width: 24px;
		height: 8px;
	}

	.splitDivider:hover .splitDivider__handle,
	.splitDivider--dragging .splitDivider__handle {
		opacity: 1;
	}

	.splitDivider:hover .splitDivider__line,
	.splitDivider--dragging .splitDivider__line {
		background: var(--fgPrimary);
	}

	.splitDivider--snapTarget .splitDivider__line {
		background: var(--fgPrimary);
	}
</style>
