<script lang="ts">
  /**
   * LayerContent - Renders a layer's content: boxes and loose trays arranged on the game container footprint.
   * Parent provides vertical position via T.Group wrapping.
   * Internal positioning is relative to the layer's local origin.
   */
  import { T } from '@threlte/core';
  import { Text, type IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';
  import BoxAssembly from './BoxAssembly.svelte';
  import TrayInBox from './TrayInBox.svelte';
  import type { BoxPlacement, LooseTrayPlacement } from '$lib/models/layer';
  import type { TrayPlacement } from '$lib/models/box';
  import type { CounterStack } from '$lib/models/counterTray';
  import { TRAY_COLORS, getProject } from '$lib/stores/project.svelte';

  interface TrayGeometryData {
    trayId: string;
    name: string;
    color: string;
    geometry: THREE.BufferGeometry;
    placement: TrayPlacement;
    counterStacks: CounterStack[];
    trayLetter?: string;
  }

  interface BoxGeometryData {
    boxId: string;
    boxName: string;
    boxGeometry: THREE.BufferGeometry | null;
    lidGeometry: THREE.BufferGeometry | null;
    trayGeometries: TrayGeometryData[];
    boxDimensions: { width: number; depth: number; height: number };
  }

  interface LooseTrayGeometryData {
    trayId: string;
    layerId: string;
    name: string;
    color: string;
    geometry: THREE.BufferGeometry;
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
    type?: 'tray' | 'box';
  }

  interface Props {
    boxPlacements: BoxPlacement[];
    looseTrayPlacements: LooseTrayPlacement[];
    allBoxGeometries: BoxGeometryData[];
    allLooseTrayGeometries: LooseTrayGeometryData[];
    gameContainerWidth: number;
    gameContainerDepth: number;
    printBedSize: number;
    wallThickness?: number;
    tolerance?: number;
    floorThickness?: number;
    showCounters?: boolean;
    showLid?: boolean;
    layerName?: string;
    layerHeight?: number;
    showLabel?: boolean;
    labelQuaternion?: [number, number, number, number];
    monoFont?: string;
    onTrayClick?: (info: TrayClickInfo | null) => void;
    onTrayDoubleClick?: (trayId: string) => void;
    onBoxDoubleClick?: (boxId: string) => void;
    horizontalExplosion?: number; // 0 = no explosion, 1 = full explosion
    layerBaseOffset?: number; // Base offset for entire layer (higher layers get pushed out more)
  }

  let {
    boxPlacements,
    looseTrayPlacements,
    allBoxGeometries,
    allLooseTrayGeometries,
    gameContainerWidth,
    gameContainerDepth,
    printBedSize,
    wallThickness = 3,
    tolerance = 0.5,
    floorThickness = 2,
    showCounters = false,
    showLid = true,
    layerName = '',
    layerHeight = 0,
    showLabel = false,
    labelQuaternion = [0, 0, 0, 1],
    monoFont = '/fonts/JetBrainsMono-Regular.ttf',
    onTrayClick,
    onTrayDoubleClick,
    onBoxDoubleClick,
    horizontalExplosion = 0,
    layerBaseOffset = 0
  }: Props = $props();

  // Layer content offset (center on game container)
  let layerOffsetX = $derived(-gameContainerWidth / 2);
  let layerOffsetZ = $derived(printBedSize / 2 + gameContainerDepth / 2);

  // Get live tray color from project store
  function getTrayColor(trayId: string, fallbackColor: string): string {
    const project = getProject();
    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        const tray = box.trays.find((t) => t.id === trayId);
        if (tray?.color) return tray.color;
      }
      const looseTray = layer.looseTrays.find((t) => t.id === trayId);
      if (looseTray?.color) return looseTray.color;
    }
    return fallbackColor;
  }

  // Calculate max height across all boxes for label positioning
  let maxBoxHeight = $derived.by(() => {
    return boxPlacements.reduce((max, bp) => Math.max(max, bp.dimensions.height), 0);
  });

  // Calculate explosion offset for an item based on its position relative to container center
  function calculateExplosionOffset(
    itemCenterX: number,
    itemCenterZ: number,
    containerWidth: number,
    containerDepth: number,
    explosionPhase: number
  ): { offsetX: number; offsetZ: number } {
    if (explosionPhase <= 0 && layerBaseOffset <= 0) return { offsetX: 0, offsetZ: 0 };

    // Calculate item center relative to container center
    const centerX = itemCenterX - containerWidth / 2;
    const centerZ = itemCenterZ - containerDepth / 2;

    // Explosion distance scales with phase (max 100mm at edges)
    // Higher layers get a larger explosionPhase multiplier from parent
    const explosionDistance = 100 * explosionPhase;

    // Scale by distance from center (items further from center move more)
    const normalizedX = centerX / (containerWidth / 2);
    const normalizedZ = centerZ / (containerDepth / 2);

    // Base offset pushes all items outward from center based on their direction
    // This ensures higher layers always move farther out regardless of item position
    const directionX = centerX === 0 ? 0 : centerX > 0 ? 1 : -1;
    const directionZ = centerZ === 0 ? 0 : centerZ > 0 ? 1 : -1;
    // If item is exactly at center, push it diagonally outward
    const baseX = directionX === 0 && directionZ === 0 ? layerBaseOffset * 0.707 : directionX * layerBaseOffset;
    const baseZ = directionX === 0 && directionZ === 0 ? layerBaseOffset * 0.707 : directionZ * layerBaseOffset;

    return {
      offsetX: normalizedX * explosionDistance + baseX,
      offsetZ: normalizedZ * explosionDistance + baseZ
    };
  }
</script>

<!-- Render boxes with actual geometry -->
{#each boxPlacements as boxPlacement (boxPlacement.box.id)}
  {@const boxData = allBoxGeometries.find((b) => b.boxId === boxPlacement.box.id)}
  {@const boxHeight = boxPlacement.dimensions.height}
  {@const isRotated = boxPlacement.rotation === 90 || boxPlacement.rotation === 270}
  {@const itemCenterX = boxPlacement.x + boxPlacement.dimensions.width / 2}
  {@const itemCenterZ = boxPlacement.y + boxPlacement.dimensions.depth / 2}
  {@const explosion = calculateExplosionOffset(
    itemCenterX,
    itemCenterZ,
    gameContainerWidth,
    gameContainerDepth,
    horizontalExplosion
  )}
  {@const baseX = layerOffsetX + boxPlacement.x + boxPlacement.dimensions.width / 2 + explosion.offsetX}
  {@const baseZ = layerOffsetZ - boxPlacement.y - boxPlacement.dimensions.depth / 2 - explosion.offsetZ}

  <!-- Group for entire box assembly - rotation applied to group -->
  <T.Group position.x={baseX} position.y={0} position.z={baseZ} rotation.y={isRotated ? Math.PI / 2 : 0}>
    {#if boxData}
      <BoxAssembly
        boxGeometry={boxData.boxGeometry}
        lidGeometry={boxData.lidGeometry}
        trayGeometries={boxData.trayGeometries}
        boxDimensions={boxData.boxDimensions}
        boxId={boxPlacement.box.id}
        boxName={boxPlacement.box.name}
        {wallThickness}
        {tolerance}
        {floorThickness}
        {showCounters}
        {showLid}
        {onTrayClick}
        {onTrayDoubleClick}
        onBoxClick={onBoxDoubleClick}
        allowInnerTrayClicks={false}
      />
    {:else}
      <!-- Fallback: simple box geometry if actual geometry not available -->
      <T.Mesh
        position.y={boxHeight / 2}
        onclick={(e: IntersectionEvent<MouseEvent>) => {
          e.stopPropagation();
          onTrayClick?.({
            trayId: boxPlacement.box.id,
            name: boxPlacement.box.name,
            letter: '',
            width: boxPlacement.dimensions.width,
            depth: boxPlacement.dimensions.depth,
            height: boxHeight,
            color: '#444444',
            type: 'box'
          });
        }}
        ondblclick={(e: IntersectionEvent<MouseEvent>) => {
          e.stopPropagation();
          onBoxDoubleClick?.(boxPlacement.box.id);
        }}
      >
        <T.BoxGeometry args={[boxPlacement.dimensions.width, boxHeight, boxPlacement.dimensions.depth]} />
        <T.MeshStandardMaterial color="#444444" roughness={0.7} metalness={0.1} />
      </T.Mesh>
    {/if}
  </T.Group>

  <!-- Box label -->
  {#if showLabel}
    <Text
      text={boxPlacement.box.name}
      font={monoFont}
      fontSize={6}
      position={[baseX, boxHeight + 5, baseZ]}
      quaternion={labelQuaternion}
      color="#ffffff"
      anchorX="center"
      anchorY="bottom"
    />
  {/if}
{/each}

<!-- Render loose trays with actual geometry -->
{#each looseTrayPlacements as trayPlacement (trayPlacement.tray.id)}
  {@const looseTrayGeom = allLooseTrayGeometries.find((lt) => lt.trayId === trayPlacement.tray.id)}
  {@const trayHeight = trayPlacement.dimensions.height}
  {@const trayColor = trayPlacement.tray.color || TRAY_COLORS[0]}
  {@const isRotated = trayPlacement.rotation === 90 || trayPlacement.rotation === 270}
  {@const itemCenterX = trayPlacement.x + trayPlacement.dimensions.width / 2}
  {@const itemCenterZ = trayPlacement.y + trayPlacement.dimensions.depth / 2}
  {@const explosion = calculateExplosionOffset(
    itemCenterX,
    itemCenterZ,
    gameContainerWidth,
    gameContainerDepth,
    horizontalExplosion
  )}
  {@const baseX = layerOffsetX + trayPlacement.x + (isRotated ? trayPlacement.dimensions.width : 0) + explosion.offsetX}
  {@const baseZ = layerOffsetZ - trayPlacement.y - explosion.offsetZ}

  {#if looseTrayGeom}
    <!-- Render actual tray geometry -->
    <T.Group position.x={baseX} position.y={0} position.z={baseZ} rotation.y={isRotated ? Math.PI / 2 : 0}>
      <TrayInBox
        geometry={looseTrayGeom.geometry}
        color={getTrayColor(trayPlacement.tray.id, trayColor)}
        counterStacks={looseTrayGeom.counterStacks}
        {showCounters}
        trayId={trayPlacement.tray.id}
        trayName={trayPlacement.tray.name}
        trayLetter={looseTrayGeom.trayLetter}
        onClick={onTrayClick}
        onDoubleClick={onTrayDoubleClick}
        width={trayPlacement.dimensions.width}
        depth={trayPlacement.dimensions.depth}
        height={trayHeight}
      />
    </T.Group>
  {:else}
    <!-- Fallback: simple box geometry if actual geometry not available -->
    {@const fallbackX = layerOffsetX + trayPlacement.x + trayPlacement.dimensions.width / 2 + explosion.offsetX}
    {@const fallbackZ = layerOffsetZ - trayPlacement.y - trayPlacement.dimensions.depth / 2 - explosion.offsetZ}
    <T.Mesh
      position.x={fallbackX}
      position.y={trayHeight / 2}
      position.z={fallbackZ}
      rotation.y={isRotated ? Math.PI / 2 : 0}
    >
      <T.BoxGeometry args={[trayPlacement.dimensions.width, trayHeight, trayPlacement.dimensions.depth]} />
      <T.MeshStandardMaterial color={trayColor} roughness={0.5} metalness={0.1} />
    </T.Mesh>
  {/if}

  <!-- Tray label -->
  {#if showLabel}
    {@const labelX = layerOffsetX + trayPlacement.x + trayPlacement.dimensions.width / 2 + explosion.offsetX}
    {@const labelZ = layerOffsetZ - trayPlacement.y - trayPlacement.dimensions.depth / 2 - explosion.offsetZ}
    <Text
      text={trayPlacement.tray.name}
      font={monoFont}
      fontSize={4}
      position={[labelX, trayHeight + 3, labelZ]}
      quaternion={labelQuaternion}
      color="#ffffff"
      anchorX="center"
      anchorY="bottom"
    />
  {/if}
{/each}

<!-- Layer height indicator and label (offset from bed edge, at front) -->
{#if showLabel && layerName}
  {@const indicatorExplosionOffset = 100 * horizontalExplosion}
  {@const indicatorX = -gameContainerWidth / 2 - 15 - indicatorExplosionOffset}
  {@const indicatorZ = printBedSize / 2 + gameContainerDepth / 2}
  {@const displayHeight = layerHeight || maxBoxHeight}
  {@const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(indicatorX, 0, indicatorZ),
    new THREE.Vector3(indicatorX, displayHeight, indicatorZ)
  ])}

  <!-- Vertical height indicator line -->
  <T.Line geometry={lineGeometry}>
    <T.LineBasicMaterial color="#888888" linewidth={2} />
  </T.Line>

  <!-- Top tick mark -->
  <T.Line
    geometry={new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(indicatorX - 3, displayHeight, indicatorZ),
      new THREE.Vector3(indicatorX + 3, displayHeight, indicatorZ)
    ])}
  >
    <T.LineBasicMaterial color="#888888" />
  </T.Line>

  <!-- Bottom tick mark -->
  <T.Line
    geometry={new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(indicatorX - 3, 0, indicatorZ),
      new THREE.Vector3(indicatorX + 3, 0, indicatorZ)
    ])}
  >
    <T.LineBasicMaterial color="#888888" />
  </T.Line>

  <!-- Layer name label -->
  <Text
    text={layerName}
    font={monoFont}
    fontSize={6}
    position={[indicatorX - 5, displayHeight / 2 + 4, indicatorZ]}
    quaternion={labelQuaternion}
    color="#ffffff"
    anchorX="right"
    anchorY="middle"
  />

  <!-- Layer height value -->
  <Text
    text={`${displayHeight.toFixed(1)}mm`}
    font={monoFont}
    fontSize={4}
    position={[indicatorX - 5, displayHeight / 2 - 4, indicatorZ]}
    quaternion={labelQuaternion}
    color="#aaaaaa"
    anchorX="right"
    anchorY="middle"
  />
{/if}
