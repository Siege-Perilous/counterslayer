<script lang="ts">
  /**
   * BoxAssembly - Renders a complete box assembly: box geometry + lid + all internal trays.
   * Parent provides position/rotation via T.Group wrapping.
   * All internal positioning is relative to (0,0,0) at the box center.
   */
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import TrayInBox from './TrayInBox.svelte';
  import type { TrayPlacement } from '$lib/models/box';
  import type { CounterStack } from '$lib/models/counterTray';
  import { getTrayLetter, getProject, TRAY_COLORS } from '$lib/stores/project.svelte';

  interface TrayGeometryData {
    trayId: string;
    name: string;
    color: string;
    geometry: THREE.BufferGeometry;
    placement: TrayPlacement;
    counterStacks: CounterStack[];
    trayLetter?: string;
  }

  interface TrayClickInfo {
    trayId: string;
    name: string;
    letter: string;
    width: number;
    depth: number;
    height: number;
    color: string;
  }

  interface Props {
    boxGeometry: THREE.BufferGeometry | null;
    lidGeometry: THREE.BufferGeometry | null;
    trayGeometries: TrayGeometryData[];
    boxDimensions: { width: number; depth: number; height: number };
    wallThickness?: number;
    tolerance?: number;
    floorThickness?: number;
    showCounters?: boolean;
    showLid?: boolean;
    triangleCornerRadius?: number;
    onTrayClick?: (info: TrayClickInfo | null) => void;
    onTrayDoubleClick?: (trayId: string) => void;
    onBoxClick?: () => void;
    // Index offset for tray letter calculation
    trayIndexOffset?: number;
  }

  let {
    boxGeometry,
    lidGeometry,
    trayGeometries,
    boxDimensions,
    wallThickness = 3,
    tolerance = 0.5,
    floorThickness = 2,
    showCounters = false,
    showLid = true,
    triangleCornerRadius = 1.5,
    onTrayClick,
    onTrayDoubleClick,
    onBoxClick,
    trayIndexOffset = 0
  }: Props = $props();

  // Helper to get geometry bounds
  function getGeomBounds(geom: THREE.BufferGeometry | null): THREE.Box3 | null {
    if (!geom) return null;
    geom.computeBoundingBox();
    return geom.boundingBox;
  }

  // Computed geometry bounds
  let boxGeomBounds = $derived(getGeomBounds(boxGeometry));
  let lidGeomBounds = $derived(getGeomBounds(lidGeometry));

  // Box centering offsets (center geometry at group origin)
  let boxCenterX = $derived(boxGeomBounds ? -(boxGeomBounds.max.x + boxGeomBounds.min.x) / 2 : 0);
  let boxCenterZ = $derived(boxGeomBounds ? (boxGeomBounds.max.y + boxGeomBounds.min.y) / 2 : 0);

  // Lid positioning - use actual geometry bounds for slide direction
  let boxHeight = $derived(boxDimensions.height);
  // Calculate actual geometry width/depth from bounds (like original TrayScene code)
  let geomWidth = $derived(boxGeomBounds ? boxGeomBounds.max.x - boxGeomBounds.min.x : boxDimensions.width);
  let geomDepth = $derived(boxGeomBounds ? boxGeomBounds.max.y - boxGeomBounds.min.y : boxDimensions.depth);
  let slidesAlongX = $derived(geomWidth > geomDepth);
  let lidRotZ = $derived(slidesAlongX ? 0 : Math.PI);
  let baseLidCenterX = $derived(lidGeomBounds ? -(lidGeomBounds.max.x + lidGeomBounds.min.x) / 2 : 0);
  let baseLidCenterZ = $derived(lidGeomBounds ? -(lidGeomBounds.max.y + lidGeomBounds.min.y) / 2 : 0);
  let lidCenterX = $derived(slidesAlongX ? baseLidCenterX : -baseLidCenterX);
  let lidCenterZ = $derived(slidesAlongX ? baseLidCenterZ : -baseLidCenterZ);

  // Get live tray color from project store
  function getTrayColor(trayId: string, fallbackIndex: number): string {
    const project = getProject();
    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        const tray = box.trays.find((t) => t.id === trayId);
        if (tray?.color) return tray.color;
      }
      const looseTray = layer.looseTrays.find((t) => t.id === trayId);
      if (looseTray?.color) return looseTray.color;
    }
    return TRAY_COLORS[fallbackIndex % TRAY_COLORS.length];
  }
</script>

<!-- Box mesh -->
{#if boxGeometry}
  <T.Mesh
    geometry={boxGeometry}
    rotation.x={-Math.PI / 2}
    position.x={boxCenterX}
    position.y={0}
    position.z={boxCenterZ}
    onclick={() => {
      onTrayClick?.(null);
      onBoxClick?.();
    }}
  >
    <T.MeshStandardMaterial color="#333333" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
  </T.Mesh>
{/if}

<!-- Lid on top of box (flipped vertically, overlapping box walls) -->
{#if showLid && lidGeometry}
  <T.Mesh
    geometry={lidGeometry}
    rotation.x={Math.PI / 2}
    rotation.z={lidRotZ}
    position.x={lidCenterX}
    position.y={boxHeight}
    position.z={lidCenterZ}
  >
    <T.MeshStandardMaterial color="#444444" roughness={0.5} metalness={0.1} side={THREE.DoubleSide} />
  </T.Mesh>
{/if}

<!-- Trays inside the box -->
{#each trayGeometries as trayData, trayIndex (trayData.trayId)}
  {@const placement = trayData.placement}
  {@const isRotated = placement.rotated}
  {@const trayX =
    boxCenterX +
    (boxGeomBounds?.min.x ?? 0) +
    wallThickness +
    tolerance +
    placement.x +
    (isRotated ? placement.dimensions.width : 0)}
  {@const trayZ = boxCenterZ - (boxGeomBounds?.min.y ?? 0) - wallThickness - tolerance - placement.y}
  {@const cumulativeTrayIdx = trayIndexOffset + trayIndex}
  <T.Group position.x={trayX} position.y={floorThickness} position.z={trayZ} rotation.y={isRotated ? Math.PI / 2 : 0}>
    <TrayInBox
      geometry={trayData.geometry}
      color={getTrayColor(trayData.trayId, trayIndex)}
      counterStacks={trayData.counterStacks}
      {showCounters}
      trayId={trayData.trayId}
      trayName={trayData.name}
      trayLetter={trayData.trayLetter ?? getTrayLetter(cumulativeTrayIdx)}
      {triangleCornerRadius}
      onClick={onTrayClick}
      onDoubleClick={onTrayDoubleClick}
      width={placement.dimensions.width}
      depth={placement.dimensions.depth}
      height={placement.dimensions.height}
    />
  </T.Group>
{/each}
