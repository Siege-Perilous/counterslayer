<script lang="ts">
  import type { CellId } from '$lib/types/cardScoopLayout';

  interface Props {
    id: CellId;
    refNumber: number; // 1-based reference number
    x: number; // Left edge in pixels
    y: number; // Bottom edge in pixels
    width: number; // Width in pixels
    height: number; // Height in pixels
    selected: boolean;
    cardSizeName?: string; // Card size name if stack assigned
    onSelect: (id: CellId) => void;
  }

  let { id, refNumber, x, y, width, height, selected, cardSizeName, onSelect }: Props = $props();

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
  class="cardScoopCell"
  class:cardScoopCell--selected={selected}
  style="left: {x}px; bottom: {y}px; width: {width}px; height: {height}px;"
  onclick={handleClick}
  onkeydown={handleKeydown}
  aria-label="Cell {refNumber}"
  aria-pressed={selected}
>
  <span class="cardScoopCell__refNumber">{refNumber}</span>
  {#if cardSizeName}
    <span class="cardScoopCell__cardSize">{cardSizeName}</span>
  {:else}
    <span class="cardScoopCell__empty">Empty</span>
  {/if}
</button>

<style>
  .cardScoopCell {
    position: absolute;
    background: var(--inputBg);
    border: 1px solid transparent;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
  }

  .cardScoopCell:hover {
    border-color: var(--fgPrimary);
  }

  .cardScoopCell--selected {
    background: var(--contrastMedium);
  }

  .cardScoopCell__refNumber {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fgMuted);
    user-select: none;
    pointer-events: none;
  }

  .cardScoopCell--selected .cardScoopCell__refNumber {
    color: var(--fg);
  }

  .cardScoopCell__cardSize {
    font-size: 0.6rem;
    color: var(--fgMuted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    user-select: none;
    pointer-events: none;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cardScoopCell__empty {
    font-size: 0.6rem;
    color: var(--fgMuted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-style: italic;
    user-select: none;
    pointer-events: none;
    opacity: 0.6;
  }

  .cardScoopCell--selected .cardScoopCell__cardSize,
  .cardScoopCell--selected .cardScoopCell__empty {
    color: var(--fg);
  }
</style>
