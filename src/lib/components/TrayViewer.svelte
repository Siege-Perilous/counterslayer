<script lang="ts">
  import { Canvas } from '@threlte/core';
  import TrayScene from './TrayScene.svelte';
  import type { BufferGeometry } from 'three';
  import type { TrayPlacement } from '$lib/models/box';
  import type { BoxPlacement, LooseTrayPlacement } from '$lib/models/layer';
  import type { CounterStack } from '$lib/models/counterTray';
  import type { CardStack } from '$lib/models/cardTray';
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

  interface LooseTrayGeometryData {
    trayId: string;
    layerId: string;
    name: string;
    color: string;
    geometry: BufferGeometry;
    dimensions: { width: number; depth: number; height: number };
    counterStacks: CounterStack[];
    trayLetter: string;
  }

  interface TrayClickInfo {
    trayId: string;
    name: string;
    letter: string;
    width: number;
    depth: number;
    height: number;
    color: string;
    type?: 'tray' | 'box'; // Default is 'tray' for backwards compatibility
  }

  // Calculate relative luminance for contrast calculation
  function getLuminance(hex: string): number {
    const rgb = hex.replace('#', '').match(/.{2}/g);
    if (!rgb) return 0;
    const [r, g, b] = rgb.map((c) => {
      const val = parseInt(c, 16) / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Get contrasting text color (black or white)
  function getContrastColor(bgColor: string): string {
    const luminance = getLuminance(bgColor);
    return luminance > 0.4 ? '#000000' : '#ffffff';
  }

  interface Props {
    geometry: BufferGeometry | null;
    allTrays?: TrayGeometryData[];
    allBoxes?: BoxGeometryData[];
    allLooseTrays?: LooseTrayGeometryData[];
    boxGeometry?: BufferGeometry | null;
    lidGeometry?: BufferGeometry | null;
    printBedSize?: number; // Legacy (deprecated) - use gameContainerWidth/gameContainerDepth
    gameContainerWidth?: number;
    gameContainerDepth?: number;
    exploded?: boolean;
    showAllTrays?: boolean;
    showAllBoxes?: boolean;
    boxWallThickness?: number;
    boxTolerance?: number;
    boxFloorThickness?: number;
    explosionAmount?: number;
    showCounters?: boolean;
    selectedTrayCounters?: (CounterStack | CardStack)[];
    selectedTrayLetter?: string;
    selectedTrayId?: string;
    triangleCornerRadius?: number;
    showReferenceLabels?: boolean;
    hidePrintBed?: boolean;
    viewTitle?: string;
    onCaptureReady?: (captureFunc: (options: CaptureOptions) => string) => void;
    isLayoutEditMode?: boolean;
    isLayerLayoutEditMode?: boolean;
    onTrayDoubleClick?: (trayId: string) => void;
    onBoxDoubleClick?: (boxId: string) => void;
    generating?: boolean;
    showLayerView?: boolean;
    layerBoxPlacements?: BoxPlacement[];
    layerLooseTrayPlacements?: LooseTrayPlacement[];
    // All layers stacked view
    showAllLayers?: boolean;
    allLayerArrangements?: Array<{
      layer: { id: string; name: string };
      arrangement: {
        boxes: BoxPlacement[];
        looseTrays: LooseTrayPlacement[];
        layerHeight: number;
      };
    }>;
    allLayersExplosionAmount?: number;
  }

  let {
    geometry,
    allTrays = [],
    allBoxes = [],
    allLooseTrays = [],
    boxGeometry = null,
    lidGeometry = null,
    printBedSize: legacyPrintBedSize,
    gameContainerWidth: propContainerWidth,
    gameContainerDepth: propContainerDepth,
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
    onCaptureReady,
    isLayoutEditMode = false,
    isLayerLayoutEditMode = false,
    onTrayDoubleClick,
    onBoxDoubleClick,
    generating = false,
    showLayerView = false,
    layerBoxPlacements = [],
    layerLooseTrayPlacements = [],
    showAllLayers = false,
    allLayerArrangements = [],
    allLayersExplosionAmount = 50
  }: Props = $props();

  // Compute actual container dimensions (prefer new props, fallback to legacy printBedSize)
  let gameContainerWidth = $derived(propContainerWidth ?? legacyPrintBedSize ?? 256);
  let gameContainerDepth = $derived(propContainerDepth ?? legacyPrintBedSize ?? 256);

  // Clicked tray info for display overlay
  let clickedTrayInfo = $state<TrayClickInfo | null>(null);
  let justClickedTray = false;

  function handleTrayClick(info: TrayClickInfo | null) {
    clickedTrayInfo = info;
    if (info) {
      // Prevent the background click handler from immediately clearing
      justClickedTray = true;
      setTimeout(() => (justClickedTray = false), 0);
    }
  }

  function handleBackgroundClick() {
    if (!justClickedTray && clickedTrayInfo && !isLayoutEditMode) {
      clickedTrayInfo = null;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="trayViewer" onclick={handleBackgroundClick} onkeydown={() => {}} role="application">
  <Canvas>
    <TrayScene
      {geometry}
      {allTrays}
      {allBoxes}
      {allLooseTrays}
      {boxGeometry}
      {lidGeometry}
      {gameContainerWidth}
      {gameContainerDepth}
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
      {isLayoutEditMode}
      {isLayerLayoutEditMode}
      onTrayClick={handleTrayClick}
      {onTrayDoubleClick}
      {onBoxDoubleClick}
      {generating}
      {showLayerView}
      {layerBoxPlacements}
      {layerLooseTrayPlacements}
      {showAllLayers}
      {allLayerArrangements}
      {allLayersExplosionAmount}
    />
  </Canvas>

  <!-- Tray/Box info overlay when clicked (non-edit mode only) -->
  {#if clickedTrayInfo && !isLayoutEditMode && !isLayerLayoutEditMode && (showAllTrays || showAllBoxes || showAllLayers || showLayerView)}
    <div class="trayInfoOverlay" class:belowToolbar={showAllTrays || showAllLayers || showLayerView}>
      {#if clickedTrayInfo.type === 'box'}
        <span class="trayLetter trayLetter--box">BOX</span>
      {:else}
        <span
          class="trayLetter"
          style="background-color: {clickedTrayInfo.color}; color: {getContrastColor(clickedTrayInfo.color)}"
        >
          {clickedTrayInfo.letter}
        </span>
      {/if}
      <span class="trayName">{clickedTrayInfo.name}</span>
      <span class="trayDims">
        {clickedTrayInfo.width.toFixed(0)} × {clickedTrayInfo.depth.toFixed(0)} × {clickedTrayInfo.height.toFixed(0)}mm
      </span>
    </div>
  {/if}
</div>

<style>
  .trayViewer {
    height: 100%;
    width: 100%;
    position: relative;
  }

  .trayInfoOverlay {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--contrastLowest);
    border-radius: var(--radius-2);
    font-size: 0.875rem;
    color: var(--fgMuted);
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .trayInfoOverlay.belowToolbar {
    top: 4.5rem;
  }

  .trayLetter {
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-1);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .trayLetter--box {
    background-color: #333333;
    color: #ffffff;
  }

  .trayName {
    font-weight: 500;
    color: var(--fg);
  }

  .trayDims {
    color: var(--fgMuted);
  }
</style>
