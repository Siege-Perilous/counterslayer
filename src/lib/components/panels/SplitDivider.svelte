<script lang="ts">
	// Snap target: absolute position in the container (percent)
	interface SnapTarget {
		key: string;
		absolutePosition: number; // Position in container percent (0-100)
	}

	interface Props {
		direction: 'horizontal' | 'vertical'; // horizontal = top/bottom split, vertical = left/right split
		position: number; // Position in percent (0-100)
		x: number; // Left edge of containing area (percent)
		y: number; // Top edge of containing area (percent)
		width: number; // Width of containing area (percent)
		height: number; // Height of containing area (percent)
		snapTargets?: SnapTarget[]; // Other dividers to snap to
		isSnapTarget?: boolean; // Whether another divider is snapping to this one
		onDrag: (newPosition: number) => void; // Called with new position in percent (0-100)
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

	const SNAP_THRESHOLD = 3; // Snap within 3% of target

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
		const container = target.closest('.cup-layout-preview') as HTMLElement;
		if (!container) return;

		const rect = container.getBoundingClientRect();

		let newPosition: number;
		let absolutePosition: number;

		if (direction === 'vertical') {
			// Left/right split - calculate X position
			const containerX = rect.left + (x / 100) * rect.width;
			const containerWidth = (width / 100) * rect.width;
			const relativeX = e.clientX - containerX;
			newPosition = Math.max(15, Math.min(85, (relativeX / containerWidth) * 100));
			// Convert to absolute position in container
			absolutePosition = x + (newPosition / 100) * width;
		} else {
			// Top/bottom split - calculate Y position (inverted for bottom positioning)
			const containerBottom = rect.bottom - (y / 100) * rect.height;
			const containerHeight = (height / 100) * rect.height;
			const relativeY = containerBottom - e.clientY;
			newPosition = Math.max(15, Math.min(85, (relativeY / containerHeight) * 100));
			// Convert to absolute position in container
			absolutePosition = y + (newPosition / 100) * height;
		}

		// Check for snap targets
		let snappedKey: string | null = null;
		for (const target of snapTargets) {
			if (Math.abs(absolutePosition - target.absolutePosition) < SNAP_THRESHOLD) {
				// Snap to this target - convert back to local position
				if (direction === 'vertical') {
					newPosition = ((target.absolutePosition - x) / width) * 100;
				} else {
					newPosition = ((target.absolutePosition - y) / height) * 100;
				}
				// Clamp to valid range
				newPosition = Math.max(15, Math.min(85, newPosition));
				snappedKey = target.key;
				break;
			}
		}

		onSnapChange?.(snappedKey);
		onDrag(newPosition);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		onSnapChange?.(null);

		const target = e.currentTarget as HTMLElement;
		target.releasePointerCapture(e.pointerId);
	}

	// Calculate position style based on direction
	let dividerStyle = $derived.by(() => {
		if (direction === 'vertical') {
			// Vertical divider line (for left/right split)
			const dividerX = x + (position / 100) * width;
			return `left: ${dividerX}%; bottom: ${y}%; height: ${height}%; width: 8px; transform: translateX(-50%);`;
		} else {
			// Horizontal divider line (for top/bottom split)
			const dividerY = y + (position / 100) * height;
			return `left: ${x}%; bottom: ${dividerY}%; width: ${width}%; height: 8px; transform: translateY(50%);`;
		}
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={containerRef}
	class="split-divider"
	class:vertical={direction === 'vertical'}
	class:horizontal={direction === 'horizontal'}
	class:dragging={isDragging}
	class:snap-target={isSnapTarget}
	style={dividerStyle}
	role="separator"
	aria-orientation={direction}
	aria-valuenow={position}
	aria-valuemin={15}
	aria-valuemax={85}
	tabindex="0"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<div class="divider-line"></div>
	<div class="divider-handle"></div>
</div>

<style>
	.split-divider {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		touch-action: none;
	}

	.split-divider.vertical {
		cursor: ew-resize;
		flex-direction: column;
	}

	.split-divider.horizontal {
		cursor: ns-resize;
		flex-direction: row;
	}

	.divider-line {
		background: var(--contrastMedium);
		transition: background 0.15s ease;
	}

	.split-divider.vertical .divider-line {
		width: 2px;
		height: 100%;
	}

	.split-divider.horizontal .divider-line {
		height: 2px;
		width: 100%;
	}

	.divider-handle {
		position: absolute;
		background: var(--fg);
		border-radius: 2px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.split-divider.vertical .divider-handle {
		width: 8px;
		height: 24px;
	}

	.split-divider.horizontal .divider-handle {
		width: 24px;
		height: 8px;
	}

	.split-divider:hover .divider-handle,
	.split-divider.dragging .divider-handle {
		opacity: 1;
	}

	.split-divider:hover .divider-line,
	.split-divider.dragging .divider-line {
		background: var(--fgPrimary);
	}

	.split-divider.snap-target .divider-line {
		background: var(--fgPrimary);
	}
</style>
