<script lang="ts">
	import type { CupId } from '$lib/types/cupLayout';

	interface Props {
		id: CupId;
		x: number; // Left edge in percent
		y: number; // Top edge in percent
		width: number; // Width in percent
		height: number; // Height in percent
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
	class="cup-cell"
	class:selected
	style="left: {x}%; bottom: {y}%; width: {width}%; height: {height}%;"
	onclick={handleClick}
	onkeydown={handleKeydown}
	aria-label="Cup {id}"
	aria-pressed={selected}
>
	<span class="cup-label">Cup</span>
</button>

<style>
	.cup-cell {
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

	.cup-cell:hover {
		border-color: var(--fgPrimary);
	}

	.cup-cell.selected {
		background: var(--contrastMedium);
	}

	.cup-label {
		font-size: 0.65rem;
		color: var(--fgMuted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		user-select: none;
		pointer-events: none;
	}

	.cup-cell.selected .cup-label {
		color: var(--fg);
	}
</style>
