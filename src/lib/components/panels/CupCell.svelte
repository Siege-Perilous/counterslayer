<script lang="ts">
	import type { CupId } from '$lib/types/cupLayout';

	interface Props {
		id: CupId;
		x: number; // Left edge in pixels
		y: number; // Bottom edge in pixels
		width: number; // Width in pixels
		height: number; // Height in pixels
		selected: boolean;
		onSelect: (id: CupId) => void;
	}

	let { id, x, y, width, height, selected, onSelect }: Props = $props();

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		onSelect(id);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(id);
		}
	}
</script>

<button
	class="cupCell"
	class:cupCell--selected={selected}
	style="left: {x}px; bottom: {y}px; width: {width}px; height: {height}px;"
	onclick={handleClick}
	onkeydown={handleKeydown}
	aria-label="Cup {id}"
	aria-pressed={selected}
>
	<span class="cupCell__label">Cup</span>
</button>

<style>
	.cupCell {
		position: absolute;
		background: var(--inputBg);
		border: 1px solid transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
	}

	.cupCell:hover {
		border-color: var(--fgPrimary);
	}

	.cupCell--selected {
		background: var(--contrastMedium);
	}

	.cupCell__label {
		font-size: 0.65rem;
		color: var(--fgMuted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		user-select: none;
		pointer-events: none;
	}

	.cupCell--selected .cupCell__label {
		color: var(--fg);
	}
</style>
