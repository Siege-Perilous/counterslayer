<script lang="ts">
  /**
   * ProjectLayoutEditorScene - interaction layer for arranging whole sections in the game
   * container. The sections themselves are drawn by the normal all-sections view from the
   * editor's live layout; this adds hit boxes, the selection outline, the lift handle and snap
   * guides, and turns pointer drags into moves.
   *
   * The camera stays free. A drag on a section slides it on the horizontal plane through the
   * point that was grabbed. The selected section also carries a gizmo with an arrow for each axis;
   * dragging an arrow moves the section along that axis only (left/right, front/back, up/down).
   */
  import { T, useThrelte } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import { onDestroy } from 'svelte';
  import * as THREE from 'three';
  import SectionMoveGizmo, { type GizmoAxis } from './SectionMoveGizmo.svelte';
  import {
    beginLayoutLift,
    endLayoutLift,
    focusLayoutSection,
    moveLayoutSection,
    projectLayoutEditorState,
    selectLayoutSection,
    setProjectLayoutDragging,
    setProjectLayoutSnapGuides,
    updateLayoutLift
  } from '#lib/stores/projectLayoutEditor.svelte.js';
  import { snapItemPosition } from '#lib/utils/editorSnapping.js';
  import { getTopsBeneath, type PlacedSection } from '#lib/models/projectLayout.js';
  import type { SnappableItem } from '#lib/types/editor.js';

  interface Props {
    gameContainerWidth: number;
    gameContainerDepth: number;
    printBedSize: number;
  }

  let { gameContainerWidth, gameContainerDepth, printBedSize }: Props = $props();

  const { camera, renderer } = useThrelte();

  // Screen-space distance (px) the pointer must travel before a press becomes a drag
  const DRAG_THRESHOLD_PX = 6;

  let layout = $derived(projectLayoutEditorState.layout);
  let selectedSectionId = $derived(projectLayoutEditorState.selectedSectionId);
  let selectedSectionIds = $derived(projectLayoutEditorState.selectedSectionIds);
  let snapGuides = $derived(projectLayoutEditorState.activeSnapGuides);
  let selectedSection = $derived(layout?.sections.find((s) => s.sectionId === selectedSectionId) ?? null);

  // The lift handle sits above anything stacked over the selected section, so it can always be
  // reached (a handle on a lower section would otherwise be buried inside the one above it)
  let liftHandleHeight = $derived.by(() => {
    if (!layout || !selectedSection) return 0;
    const ownTop = selectedSection.z + selectedSection.height;
    const above = layout.sections.filter((s) => s.sectionId !== selectedSection.sectionId);
    return Math.max(ownTop, ...getTopsBeneath(selectedSection, above));
  });

  let hoveredSectionId = $state<string | null>(null);
  // Axes whose arrow cannot be dragged from the current camera angle
  let disabledAxes = $state.raw<GizmoAxis[]>([]);

  // Game container coordinates to scene coordinates
  let offsetX = $derived(-gameContainerWidth / 2);
  let offsetZ = $derived(printBedSize / 2 + gameContainerDepth / 2);

  type Drag =
    | { kind: 'move'; sectionId: string; pointerId: number; grab: THREE.Vector3; startX: number; startY: number }
    | {
        kind: 'slide';
        axis: 'x' | 'y';
        sectionId: string;
        pointerId: number;
        grab: THREE.Vector3;
        startX: number;
        startY: number;
        normal: THREE.Vector3;
      }
    | {
        kind: 'lift';
        sectionId: string;
        pointerId: number;
        grab: THREE.Vector3;
        startZ: number;
        normal: THREE.Vector3;
      };

  // Scene direction of each gizmo axis. Container y (front to back) runs along scene -Z.
  const AXIS_DIRECTION: Record<GizmoAxis, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 0, -1),
    z: new THREE.Vector3(0, 1, 0)
  };

  let drag: Drag | null = null;
  let dragStarted = false;
  let downClient = { x: 0, y: 0 };
  let activeAxis = $state<GizmoAxis | null>(null);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();

  function rayFromEvent(event: PointerEvent): THREE.Ray {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera.current);
    return raycaster.ray;
  }

  function beginDrag(next: Drag, nativeEvent: PointerEvent) {
    drag = next;
    dragStarted = false;
    downClient = { x: nativeEvent.clientX, y: nativeEvent.clientY };
    activeAxis = next.kind === 'lift' ? 'z' : next.kind === 'slide' ? next.axis : null;
    // Stop the camera orbiting for the length of this press
    setProjectLayoutDragging(true);
    const element = renderer.domElement;
    try {
      element.setPointerCapture(nativeEvent.pointerId);
    } catch {
      // Pointer capture is best-effort (it can fail if the pointer is already released)
    }
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('pointerdown', handleExtraPointer);
  }

  function endDrag() {
    if (!drag) return;
    const element = renderer.domElement;
    try {
      element.releasePointerCapture(drag.pointerId);
    } catch {
      // Already released
    }
    element.removeEventListener('pointermove', handlePointerMove);
    element.removeEventListener('pointerup', endDrag);
    element.removeEventListener('pointercancel', endDrag);
    element.removeEventListener('pointerdown', handleExtraPointer);
    // A lift settles when it ends: the lifted section keeps its height, the rest drop into place
    if (drag.kind === 'lift') endLayoutLift();
    drag = null;
    activeAxis = null;
    setProjectLayoutDragging(false);
  }

  // A second finger means the user is pinching or panning, not dragging a section
  function handleExtraPointer(event: PointerEvent) {
    if (drag && event.pointerId !== drag.pointerId) endDrag();
  }

  // Snap a section's footprint against the other sections and the container edges
  function snapSection(section: PlacedSection, rawX: number, rawY: number) {
    const moving: SnappableItem = {
      id: section.sectionId,
      x: rawX,
      y: rawY,
      width: section.world.width,
      depth: section.world.depth
    };
    // Sections moving with this one keep their distance from it, so they are not snap targets
    const movingTogether = selectedSectionIds.includes(section.sectionId) ? selectedSectionIds : [];
    const others: SnappableItem[] = (layout?.sections ?? [])
      .filter((s) => s.sectionId !== section.sectionId && s.items.length > 0 && !movingTogether.includes(s.sectionId))
      .map((s) => ({ id: s.sectionId, x: s.world.x, y: s.world.y, width: s.world.width, depth: s.world.depth }));
    return snapItemPosition(moving, rawX, rawY, others, gameContainerWidth, gameContainerDepth, false);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId || !layout) return;

    if (!dragStarted) {
      const distance = Math.hypot(event.clientX - downClient.x, event.clientY - downClient.y);
      if (distance < DRAG_THRESHOLD_PX) return;
      dragStarted = true;
    }

    const ray = rayFromEvent(event);

    if (drag.kind === 'slide') {
      // Move along one horizontal axis: read the pointer on the plane that contains the axis and
      // faces the camera, and keep only the movement along the axis
      const { axis, startX, startY } = drag;
      plane.setFromNormalAndCoplanarPoint(drag.normal, drag.grab);
      if (!ray.intersectPlane(plane, hit)) return;
      const along = hit.sub(drag.grab).dot(AXIS_DIRECTION[axis]);
      const section = layout.sections.find((s) => s.sectionId === drag!.sectionId);
      if (!section) return;
      const snapped = snapSection(
        section,
        axis === 'x' ? startX + along : startX,
        axis === 'y' ? startY + along : startY
      );
      // Only the dragged axis may change, whatever the other axis would have snapped to
      moveLayoutSection(section.sectionId, axis === 'x' ? snapped.x : startX, axis === 'y' ? snapped.y : startY);
      setProjectLayoutSnapGuides(
        snapped.guides.filter((guide) => guide.type === (axis === 'x' ? 'vertical' : 'horizontal'))
      );
    } else if (drag.kind === 'move') {
      // Slide on the horizontal plane through the grabbed point, so that point stays under the cursor.
      // Looking almost edge-on at that plane makes the intersection unstable, so ignore those moves.
      if (Math.abs(ray.direction.y) < 0.05) return;
      plane.set(new THREE.Vector3(0, 1, 0), -drag.grab.y);
      if (!ray.intersectPlane(plane, hit)) return;

      const section = layout.sections.find((s) => s.sectionId === drag!.sectionId);
      if (!section) return;
      const rawX = drag.startX + (hit.x - drag.grab.x);
      const rawY = drag.startY - (hit.z - drag.grab.z);

      const snapped = snapSection(section, rawX, rawY);

      moveLayoutSection(section.sectionId, snapped.x, snapped.y);
      setProjectLayoutSnapGuides(snapped.guides);
    } else {
      // Lift along the vertical plane that faces the camera through the grabbed point
      plane.setFromNormalAndCoplanarPoint(drag.normal, drag.grab);
      if (!ray.intersectPlane(plane, hit)) return;
      updateLayoutLift(drag.sectionId, drag.startZ + (hit.y - drag.grab.y), true);
    }
  }

  function handleSectionPointerDown(event: IntersectionEvent<PointerEvent>, sectionId: string) {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    if (nativeEvent.button !== 0 || drag) return;
    if (nativeEvent.shiftKey) {
      // Shift+click adds or removes a section from the selection; it does not start a drag
      selectLayoutSection(sectionId, true);
      return;
    }
    // Pressing a section that is already selected with others keeps the group, so it can be dragged
    focusLayoutSection(sectionId);
    const section = layout?.sections.find((s) => s.sectionId === sectionId);
    if (!section) return;
    beginDrag(
      {
        kind: 'move',
        sectionId,
        pointerId: nativeEvent.pointerId,
        grab: event.point.clone(),
        startX: section.x,
        startY: section.y
      },
      nativeEvent
    );
  }

  function handleGizmoPointerDown(axis: GizmoAxis, event: IntersectionEvent<PointerEvent>) {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    if (nativeEvent.button !== 0 || drag || !selectedSection) return;
    // Plane through the grab point that contains the axis and faces the camera as squarely as it can
    const direction = AXIS_DIRECTION[axis];
    const toCamera = new THREE.Vector3().subVectors(camera.current.position, event.point);
    const normal = toCamera.sub(direction.clone().multiplyScalar(toCamera.dot(direction)));
    if (normal.lengthSq() < 1e-6) return;
    normal.normalize();
    const common = {
      sectionId: selectedSection.sectionId,
      pointerId: nativeEvent.pointerId,
      grab: event.point.clone(),
      normal
    };

    if (axis === 'z') {
      beginLayoutLift(selectedSection.sectionId);
      beginDrag({ kind: 'lift', startZ: selectedSection.z, ...common }, nativeEvent);
    } else {
      beginDrag({ kind: 'slide', axis, startX: selectedSection.x, startY: selectedSection.y, ...common }, nativeEvent);
    }
  }

  // Looking straight along an axis, movement along it cannot be read from the pointer
  const cameraDirection = new THREE.Vector3();
  $effect(() => {
    const interval = setInterval(() => {
      camera.current.getWorldDirection(cameraDirection);
      // within ~15 degrees of the axis
      const next = (['x', 'y', 'z'] as GizmoAxis[]).filter(
        (axis) => Math.abs(cameraDirection.dot(AXIS_DIRECTION[axis])) > 0.966
      );
      if (next.join() !== disabledAxes.join()) disabledAxes = next;
    }, 200);
    return () => clearInterval(interval);
  });

  onDestroy(() => {
    endDrag();
  });

  function outlineGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth));
    const line = new THREE.LineSegments(edges);
    line.computeLineDistances();
    return line.geometry;
  }
</script>

{#if layout}
  <!-- Click on empty floor deselects -->
  <T.Mesh
    rotation.x={-Math.PI / 2}
    position.y={-0.6}
    position.z={printBedSize / 2}
    onpointerdown={() => selectLayoutSection(null)}
  >
    <T.PlaneGeometry args={[printBedSize * 6, printBedSize * 6]} />
    <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
  </T.Mesh>

  {#each layout.sections as section (section.sectionId)}
    {@const isSelected = selectedSectionIds.includes(section.sectionId)}
    {@const isHovered = section.sectionId === hoveredSectionId}

    <!-- One hit box per item, so gaps between a section's items stay click-through -->
    {#each section.worldItems as item (item.id)}
      <T.Mesh
        position.x={offsetX + item.world.x + item.world.width / 2}
        position.y={item.world.z + item.world.height / 2}
        position.z={offsetZ - item.world.y - item.world.depth / 2}
        onpointerdown={(e: IntersectionEvent<PointerEvent>) => handleSectionPointerDown(e, section.sectionId)}
        onpointerenter={() => {
          hoveredSectionId = section.sectionId;
        }}
        onpointerleave={() => {
          if (hoveredSectionId === section.sectionId) hoveredSectionId = null;
        }}
        renderOrder={5}
      >
        <T.BoxGeometry args={[item.world.width + 1, item.world.height + 1, item.world.depth + 1]} />
        <T.MeshBasicMaterial
          color={isSelected ? '#2f7bff' : '#ffffff'}
          transparent
          opacity={isSelected ? 0.18 : isHovered ? 0.12 : 0}
          depthWrite={false}
        />
      </T.Mesh>
    {/each}

    <!-- Selection outline around the whole section -->
    {#if isSelected && section.items.length > 0}
      <T.LineSegments
        geometry={outlineGeometry(section.world.width + 2, section.height + 2, section.world.depth + 2)}
        position.x={offsetX + section.world.x + section.world.width / 2}
        position.y={section.z + section.height / 2}
        position.z={offsetZ - section.world.y - section.world.depth / 2}
        renderOrder={15}
      >
        <T.LineDashedMaterial color="#ffffff" dashSize={4} gapSize={3} depthTest={false} transparent />
      </T.LineSegments>
    {/if}
  {/each}

  <!-- Move gizmo (one arrow per axis) on the selected section -->
  {#if selectedSection && selectedSection.items.length > 0}
    <SectionMoveGizmo
      position={[
        offsetX + selectedSection.world.x + selectedSection.world.width / 2,
        liftHandleHeight,
        offsetZ - selectedSection.world.y - selectedSection.world.depth / 2
      ]}
      {activeAxis}
      {disabledAxes}
      onGrab={handleGizmoPointerDown}
    />

    <!-- While floating, show the gap down to what is underneath -->
    {#if selectedSection.floating}
      {@const footprintGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -selectedSection.z, 0)
      ])}
      <T.Line
        args={[footprintGeometry]}
        position.x={offsetX + selectedSection.world.x + selectedSection.world.width / 2}
        position.y={selectedSection.z}
        position.z={offsetZ - selectedSection.world.y - selectedSection.world.depth / 2}
      >
        <T.LineBasicMaterial color="#ffb020" depthTest={false} transparent />
      </T.Line>
    {/if}
  {/if}

  <!-- Snap guides, drawn at the height of the section being moved -->
  {#each snapGuides as guide, guideIdx (guideIdx)}
    {@const guideY = (selectedSection?.z ?? 0) + 0.5}
    {@const geometry = new THREE.BufferGeometry().setFromPoints(
      guide.type === 'vertical'
        ? [
            new THREE.Vector3(offsetX + guide.position, guideY, offsetZ - guide.start),
            new THREE.Vector3(offsetX + guide.position, guideY, offsetZ - guide.end)
          ]
        : [
            new THREE.Vector3(offsetX + guide.start, guideY, offsetZ - guide.position),
            new THREE.Vector3(offsetX + guide.end, guideY, offsetZ - guide.position)
          ]
    )}
    <T.Line args={[geometry]}>
      <T.LineBasicMaterial color="#00ccff" depthTest={false} transparent />
    </T.Line>
  {/each}
{/if}
