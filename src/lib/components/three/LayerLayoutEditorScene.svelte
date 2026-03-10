<script lang="ts">
  /**
   * LayerLayoutEditorScene - Renders the layer in edit mode with drag interaction.
   * Shows boxes and loose trays at their working positions with selection and snap guides.
   */
  import { T } from '@threlte/core';
  import { interactivity, type IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';
  import BoxAssembly from './BoxAssembly.svelte';
  import {
    layerLayoutEditorState,
    selectLayerItem,
    startDrag,
    updateDrag,
    endDrag,
    setSnapGuides,
    getEffectiveBoxDimensions,
    getEffectiveLooseTrayDimensions
  } from '$lib/stores/layerLayoutEditor.svelte';
  import { snapLayerItemPosition, type LayerItemForSnapping } from '$lib/utils/layerLayoutSnapping';
  import type { TrayPlacement } from '$lib/models/box';
  import type { CounterStack } from '$lib/models/counterTray';
  import { getProject } from '$lib/stores/project.svelte';

  interactivity();

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

  interface Props {
    allBoxGeometries: BoxGeometryData[];
    allLooseTrayGeometries: LooseTrayGeometryData[];
    gameContainerWidth: number;
    gameContainerDepth: number;
    boxWallThickness: number;
    boxTolerance: number;
    boxFloorThickness: number;
    printBedSize: number;
  }

  let {
    allBoxGeometries,
    allLooseTrayGeometries,
    gameContainerWidth,
    gameContainerDepth,
    boxWallThickness,
    boxTolerance,
    boxFloorThickness,
    printBedSize
  }: Props = $props();

  // Reactive state from layer layout editor store
  let workingBoxPlacements = $derived.by(() => layerLayoutEditorState.workingBoxPlacements);
  let workingLooseTrayPlacements = $derived.by(() => layerLayoutEditorState.workingLooseTrayPlacements);
  let selectedItemId = $derived.by(() => layerLayoutEditorState.selectedItemId);
  let selectedItemType = $derived.by(() => layerLayoutEditorState.selectedItemType);
  let snapGuides = $derived.by(() => layerLayoutEditorState.activeSnapGuides);
  let dragState = $derived.by(() => layerLayoutEditorState.dragState);

  // Hover state
  let hoveredItemId = $state<string | null>(null);

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

  // Build all items for snapping
  function getAllItemsForSnapping(): LayerItemForSnapping[] {
    const items: LayerItemForSnapping[] = [];

    for (const bp of workingBoxPlacements) {
      const dims = getEffectiveBoxDimensions(bp);
      items.push({
        id: bp.boxId,
        x: bp.x,
        y: bp.y,
        width: dims.width,
        depth: dims.depth
      });
    }

    for (const ltp of workingLooseTrayPlacements) {
      const dims = getEffectiveLooseTrayDimensions(ltp);
      items.push({
        id: ltp.trayId,
        x: ltp.x,
        y: ltp.y,
        width: dims.width,
        depth: dims.depth
      });
    }

    return items;
  }

  // Handle plane pointer move for dragging
  function handlePlanePointerMove(e: IntersectionEvent<PointerEvent>) {
    if (!dragState.isDragging || !dragState.itemId) return;

    const floorPos = e.point;
    if (!floorPos) return;

    // Convert 3D position back to 2D layer coordinates
    const worldX = floorPos.x - layerOffsetX;
    const worldY = -(floorPos.z - layerOffsetZ);

    const deltaX = worldX - dragState.startX;
    const deltaY = worldY - dragState.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only process if there's meaningful movement (threshold of 2mm)
    if (distance > 2) {
      const newX = dragState.originalItemX + deltaX;
      const newY = dragState.originalItemY + deltaY;

      // Get moving item for snapping
      let movingItem: LayerItemForSnapping | null = null;

      if (dragState.itemType === 'box') {
        const bp = workingBoxPlacements.find((p) => p.boxId === dragState.itemId);
        if (bp) {
          const dims = getEffectiveBoxDimensions(bp);
          movingItem = { id: bp.boxId, x: newX, y: newY, width: dims.width, depth: dims.depth };
        }
      } else {
        const ltp = workingLooseTrayPlacements.find((p) => p.trayId === dragState.itemId);
        if (ltp) {
          const dims = getEffectiveLooseTrayDimensions(ltp);
          movingItem = { id: ltp.trayId, x: newX, y: newY, width: dims.width, depth: dims.depth };
        }
      }

      if (movingItem) {
        // Get all other items for snapping
        const allItems = getAllItemsForSnapping().filter((i) => i.id !== movingItem!.id);
        const snapResult = snapLayerItemPosition(
          movingItem,
          newX,
          newY,
          allItems,
          gameContainerWidth,
          gameContainerDepth
        );

        // Update position via drag system (which handles position updates)
        // We need to update the start position delta to account for snapping
        updateDrag(
          dragState.startX + (snapResult.x - dragState.originalItemX),
          dragState.startY + (snapResult.y - dragState.originalItemY)
        );
        setSnapGuides(snapResult.guides);
      }
    }
  }

  function handlePlanePointerUp(_e: IntersectionEvent<PointerEvent>) {
    endDrag();
  }

  function handlePlanePointerDown(_e: IntersectionEvent<PointerEvent>) {
    // Click on background (plane) deselects
    if (!dragState.isDragging) {
      selectLayerItem('', 'box'); // Deselect
    }
  }

  // Handle item pointer down to start drag
  function handleItemPointerDown(
    e: IntersectionEvent<PointerEvent>,
    itemId: string,
    itemType: 'box' | 'looseTray',
    itemX: number,
    itemY: number
  ) {
    e.stopPropagation();

    const point = e.point;
    // Convert 3D position to 2D layer coordinates
    const startX = point ? point.x - layerOffsetX : itemX;
    const startY = point ? -(point.z - layerOffsetZ) : itemY;

    startDrag(itemId, itemType, startX, startY);
  }
</script>

<!-- Render boxes at working positions -->
{#each workingBoxPlacements as boxPlacement (boxPlacement.boxId)}
  {@const boxData = allBoxGeometries.find((b) => b.boxId === boxPlacement.boxId)}
  {@const dims = getEffectiveBoxDimensions(boxPlacement)}
  {@const isRotated = boxPlacement.rotation === 90 || boxPlacement.rotation === 270}
  {@const isSelected = selectedItemId === boxPlacement.boxId && selectedItemType === 'box'}
  {@const baseX = layerOffsetX + boxPlacement.x + dims.width / 2}
  {@const baseZ = layerOffsetZ - boxPlacement.y - dims.depth / 2}

  <T.Group position.x={baseX} position.y={0} position.z={baseZ} rotation.y={isRotated ? Math.PI / 2 : 0}>
    {#if boxData}
      <BoxAssembly
        boxGeometry={boxData.boxGeometry}
        lidGeometry={boxData.lidGeometry}
        trayGeometries={boxData.trayGeometries}
        boxDimensions={boxData.boxDimensions}
        wallThickness={boxWallThickness}
        tolerance={boxTolerance}
        floorThickness={boxFloorThickness}
        showCounters={false}
        showLid={true}
      />
    {:else}
      <!-- Fallback: simple box geometry -->
      <T.Mesh position.y={boxPlacement.height / 2}>
        <T.BoxGeometry args={[dims.width, boxPlacement.height, dims.depth]} />
        <T.MeshStandardMaterial color="#444444" roughness={0.7} metalness={0.1} />
      </T.Mesh>
    {/if}

    <!-- Invisible hit box for interaction -->
    <T.Mesh
      visible={false}
      position.y={boxPlacement.height / 2}
      onpointerdown={(e: IntersectionEvent<PointerEvent>) =>
        handleItemPointerDown(e, boxPlacement.boxId, 'box', boxPlacement.x, boxPlacement.y)}
      onpointerenter={() => {
        hoveredItemId = boxPlacement.boxId;
      }}
      onpointerleave={() => {
        hoveredItemId = null;
      }}
    >
      <T.BoxGeometry args={[dims.width, boxPlacement.height, dims.depth]} />
      <T.MeshBasicMaterial transparent opacity={0} />
    </T.Mesh>

    <!-- Selection wireframe -->
    {#if isSelected}
      {@const edgesGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.width, dims.depth, boxPlacement.height))}
      <T.LineSegments
        rotation.x={-Math.PI / 2}
        position.y={boxPlacement.height / 2}
        geometry={edgesGeom}
        oncreate={(ref) => {
          ref.computeLineDistances();
        }}
      >
        <T.LineDashedMaterial color="#ffffff" dashSize={3} gapSize={2} />
      </T.LineSegments>
    {/if}
  </T.Group>
{/each}

<!-- Render loose trays at working positions -->
{#each workingLooseTrayPlacements as trayPlacement (trayPlacement.trayId)}
  {@const looseTrayGeom = allLooseTrayGeometries.find((lt) => lt.trayId === trayPlacement.trayId)}
  {@const dims = getEffectiveLooseTrayDimensions(trayPlacement)}
  {@const isRotated = trayPlacement.rotation === 90 || trayPlacement.rotation === 270}
  {@const isSelected = selectedItemId === trayPlacement.trayId && selectedItemType === 'looseTray'}
  {@const isHovered = hoveredItemId === trayPlacement.trayId}
  {@const baseX = layerOffsetX + trayPlacement.x + (isRotated ? dims.width : 0)}
  {@const baseZ = layerOffsetZ - trayPlacement.y}

  <T.Group position.x={baseX} position.y={0} position.z={baseZ} rotation.y={isRotated ? Math.PI / 2 : 0}>
    {#if looseTrayGeom}
      <!-- Render tray geometry directly with emissive highlighting -->
      <T.Mesh geometry={looseTrayGeom.geometry} rotation.x={-Math.PI / 2}>
        <T.MeshStandardMaterial
          color={isSelected ? '#ffffff' : getTrayColor(trayPlacement.trayId, trayPlacement.color)}
          roughness={0.6}
          metalness={0.1}
          side={THREE.DoubleSide}
          emissive={isSelected ? '#2060c0' : isHovered ? '#404040' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
        />
      </T.Mesh>
    {:else}
      <!-- Fallback: simple box geometry -->
      <T.Mesh position.y={trayPlacement.height / 2}>
        <T.BoxGeometry args={[dims.width, trayPlacement.height, dims.depth]} />
        <T.MeshStandardMaterial
          color={isSelected ? '#ffffff' : trayPlacement.color}
          emissive={isSelected ? '#2060c0' : isHovered ? '#404040' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
          roughness={0.5}
          metalness={0.1}
        />
      </T.Mesh>
    {/if}

    <!-- Invisible hit box for interaction (use original dims since group handles rotation) -->
    <T.Mesh
      visible={false}
      position.x={trayPlacement.originalWidth / 2}
      position.y={trayPlacement.height / 2}
      position.z={-trayPlacement.originalDepth / 2}
      onpointerdown={(e: IntersectionEvent<PointerEvent>) =>
        handleItemPointerDown(e, trayPlacement.trayId, 'looseTray', trayPlacement.x, trayPlacement.y)}
      onpointerenter={() => {
        hoveredItemId = trayPlacement.trayId;
      }}
      onpointerleave={() => {
        hoveredItemId = null;
      }}
    >
      <T.BoxGeometry args={[trayPlacement.originalWidth, trayPlacement.height, trayPlacement.originalDepth]} />
      <T.MeshBasicMaterial transparent opacity={0} />
    </T.Mesh>

    <!-- Selection wireframe for loose tray (use original dims since group handles rotation) -->
    {#if isSelected}
      {@const edgesGeom = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(trayPlacement.originalWidth, trayPlacement.originalDepth, trayPlacement.height)
      )}
      <T.LineSegments
        rotation.x={-Math.PI / 2}
        position.x={trayPlacement.originalWidth / 2}
        position.y={trayPlacement.height / 2}
        position.z={-trayPlacement.originalDepth / 2}
        geometry={edgesGeom}
        oncreate={(ref) => {
          ref.computeLineDistances();
        }}
      >
        <T.LineDashedMaterial color="#ffffff" dashSize={3} gapSize={2} />
      </T.LineSegments>
    {/if}
  </T.Group>
{/each}

<!-- Interaction plane for drag tracking -->
<T.Mesh
  rotation.x={-Math.PI / 2}
  position.y={-0.1}
  onpointerdown={handlePlanePointerDown}
  onpointermove={handlePlanePointerMove}
  onpointerup={handlePlanePointerUp}
>
  <T.PlaneGeometry args={[printBedSize * 2, printBedSize * 2]} />
  <T.MeshBasicMaterial visible={false} />
</T.Mesh>

<!-- Snap guides -->
{#each snapGuides as guide, guideIdx (guideIdx)}
  {@const geometry = new THREE.BufferGeometry().setFromPoints(
    guide.type === 'vertical'
      ? [
          new THREE.Vector3(layerOffsetX + guide.position, 0.5, layerOffsetZ - guide.start),
          new THREE.Vector3(layerOffsetX + guide.position, 0.5, layerOffsetZ - guide.end)
        ]
      : [
          new THREE.Vector3(layerOffsetX + guide.start, 0.5, layerOffsetZ - guide.position),
          new THREE.Vector3(layerOffsetX + guide.end, 0.5, layerOffsetZ - guide.position)
        ]
  )}
  <T.Line args={[geometry]}>
    <T.LineBasicMaterial color="#00ccff" />
  </T.Line>
{/each}
