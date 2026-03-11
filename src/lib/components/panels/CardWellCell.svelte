<script lang="ts">
  import type { CellId } from '$lib/types/cardWellLayout';

  interface Props {
    id: CellId;
    trayLetter: string;
    refNumber: number; // 1-based reference number
    x: number; // Left edge in pixels
    y: number; // Bottom edge in pixels
    width: number; // Cell width in pixels (column width)
    height: number; // Cell height in pixels
    cavityWidth: number; // Actual card cavity width in pixels
    cavityHeight: number; // Actual card cavity height in pixels
    selected: boolean;
    cardSizeName?: string; // Card size name if stack assigned
    onSelect: (id: CellId) => void;
  }

  let {
    id,
    trayLetter,
    refNumber,
    x,
    y,
    width,
    height,
    cavityWidth,
    cavityHeight,
    selected,
    cardSizeName,
    onSelect
  }: Props = $props();

  // Calculate cavity position (centered within cell)
  let cavityOffsetX = $derived((width - cavityWidth) / 2);
  let cavityOffsetY = $derived((height - cavityHeight) / 2);

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
  class="cardWellCell"
  class:cardWellCell--selected={selected}
  style="left: {x}px; bottom: {y}px; width: {width}px; height: {height}px;"
  onclick={handleClick}
  onkeydown={handleKeydown}
  aria-label="Cell {trayLetter}{refNumber}"
  aria-pressed={selected}
>
  <div
    class="cardWellCell__cavity"
    class:cardWellCell__cavity--selected={selected}
    style="left: {cavityOffsetX}px; bottom: {cavityOffsetY}px; width: {cavityWidth}px; height: {cavityHeight}px;"
  >
    <span class="cardWellCell__refNumber">{trayLetter}{refNumber}</span>
    {#if cardSizeName}
      <span class="cardWellCell__cardSize">{cardSizeName}</span>
    {:else}
      <span class="cardWellCell__empty">Empty</span>
    {/if}
  </div>
</button>

<style>
  .cardWellCell {
    position: absolute;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
  }

  .cardWellCell__cavity {
    position: absolute;
    background: var(--inputBg);
    border: 1px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
    pointer-events: none;
  }

  .cardWellCell:hover .cardWellCell__cavity {
    border-color: var(--fgPrimary);
  }

  .cardWellCell__cavity--selected {
    background: var(--contrastMedium);
  }

  .cardWellCell__refNumber {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--fgMuted);
    user-select: none;
    pointer-events: none;
  }

  .cardWellCell__cavity--selected .cardWellCell__refNumber {
    color: var(--fg);
  }

  .cardWellCell__cardSize {
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

  .cardWellCell__empty {
    font-size: 0.6rem;
    color: var(--fgMuted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-style: italic;
    user-select: none;
    pointer-events: none;
    opacity: 0.6;
  }

  .cardWellCell__cavity--selected .cardWellCell__cardSize,
  .cardWellCell__cavity--selected .cardWellCell__empty {
    color: var(--fg);
  }
</style>
