<script lang="ts">
  /**
   * SectionMoveGizmo - three double-headed arrows above the selected section, one per axis
   * (six directions). Dragging an arrow moves the section along that axis only: red = left/right
   * (x), green = front/back (y), blue = up/down (z). The parent owns the drag; this draws the
   * arrows and reports the pointer going down on one.
   */
  import { T, useTask, useThrelte } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';

  export type GizmoAxis = 'x' | 'y' | 'z';

  interface Props {
    /** Where the gizmo stands: centre of the top of the section (or of the stack above it) */
    position: [number, number, number];
    activeAxis?: GizmoAxis | null;
    /** Axes that cannot be dragged from the current camera angle */
    disabledAxes?: GizmoAxis[];
    onGrab: (axis: GizmoAxis, event: IntersectionEvent<PointerEvent>) => void;
  }

  let { position, activeAxis = null, disabledAxes = [], onGrab }: Props = $props();

  const { camera } = useThrelte();

  let hoveredAxis = $state<GizmoAxis | null>(null);
  // Keep the gizmo a constant size on screen
  let scale = $state(1);
  const basePosition = new THREE.Vector3();

  useTask(() => {
    basePosition.set(position[0], position[1], position[2]);
    const distance = camera.current.position.distanceTo(basePosition);
    const next = Math.max(0.35, distance / 420);
    if (Math.abs(next - scale) > 0.01) scale = next;
  });

  // Half-length of each arrow and height of the gizmo's centre above its base
  const REACH = 26;
  const CENTER_HEIGHT = REACH + 8;

  // Each arrow is modelled along +Y and turned onto its axis. Container y (front/back) runs
  // along scene -Z; the arrow is symmetric, so the sign does not matter here.
  const axes: { axis: GizmoAxis; color: string; rotation: [number, number, number] }[] = [
    { axis: 'x', color: '#e5484d', rotation: [0, 0, -Math.PI / 2] },
    { axis: 'y', color: '#30a46c', rotation: [Math.PI / 2, 0, 0] },
    { axis: 'z', color: '#2f7bff', rotation: [0, 0, 0] }
  ];

  function colorFor(axis: GizmoAxis, base: string): string {
    if (disabledAxes.includes(axis)) return '#777777';
    if (activeAxis === axis) return '#ffffff';
    if (hoveredAxis === axis) return new THREE.Color(base).lerp(new THREE.Color('#ffffff'), 0.45).getStyle();
    return base;
  }
</script>

<T.Group position.x={position[0]} position.y={position[1]} position.z={position[2]} {scale}>
  <T.Group position.y={CENTER_HEIGHT}>
    {#each axes as { axis, color, rotation } (axis)}
      {@const disabled = disabledAxes.includes(axis)}
      {@const shown = colorFor(axis, color)}
      <!-- While one arrow is being dragged, fade the other two -->
      {@const opacity = disabled ? 0.4 : activeAxis && activeAxis !== axis ? 0.25 : 1}
      <T.Group rotation.x={rotation[0]} rotation.y={rotation[1]} rotation.z={rotation[2]}>
        <!-- Shaft -->
        <T.Mesh renderOrder={20}>
          <T.CylinderGeometry args={[1.4, 1.4, REACH * 2 - 16, 12]} />
          <T.MeshBasicMaterial color={shown} depthTest={false} transparent {opacity} />
        </T.Mesh>
        <!-- Arrow heads at both ends -->
        <T.Mesh position.y={REACH - 4} renderOrder={20}>
          <T.ConeGeometry args={[4.5, 9, 16]} />
          <T.MeshBasicMaterial color={shown} depthTest={false} transparent {opacity} />
        </T.Mesh>
        <T.Mesh position.y={-(REACH - 4)} rotation.x={Math.PI} renderOrder={20}>
          <T.ConeGeometry args={[4.5, 9, 16]} />
          <T.MeshBasicMaterial color={shown} depthTest={false} transparent {opacity} />
        </T.Mesh>
        <!-- Generous invisible grab volumes on each half (easier to hit, especially by touch).
             The middle is left out so the three arrows do not fight over the crossing point. -->
        {#if !disabled}
          {#each [1, -1] as side (side)}
            <T.Mesh
              position.y={side * (REACH / 2 + 3)}
              onpointerdown={(e: IntersectionEvent<PointerEvent>) => onGrab(axis, e)}
              onpointerenter={() => {
                hoveredAxis = axis;
              }}
              onpointerleave={() => {
                if (hoveredAxis === axis) hoveredAxis = null;
              }}
            >
              <T.CylinderGeometry args={[7, 7, REACH - 4, 12]} />
              <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
            </T.Mesh>
          {/each}
        {/if}
      </T.Group>
    {/each}
    <!-- Centre marker -->
    <T.Mesh renderOrder={21}>
      <T.SphereGeometry args={[2.6, 16, 12]} />
      <T.MeshBasicMaterial color="#ffffff" depthTest={false} transparent />
    </T.Mesh>
  </T.Group>
</T.Group>
