<script lang="ts">
  /**
   * StandeeMesh - renders a single standee preview: a round base disc against a side wall with a
   * rectangular figure standing perpendicular to it, leaning by the slot angle.
   * Positions are passed in tray-local scene coordinates (Y up), matching the other previews.
   */
  import { T } from '@threlte/core';
  import { COUNTER_MATERIAL } from '$lib/three/materials';

  interface Props {
    posX: number; // base disc centre (scene X = tray width)
    posY: number; // figure axis height (scene Y, up)
    posZ: number; // slot position (scene Z = tray depth)
    baseRadius: number;
    baseThickness: number;
    figureWidth: number; // vertical extent of the figure
    figureLength: number; // how far the figure reaches inward (across the width)
    figureThickness: number;
    figureDir: number; // +1 / -1: X direction the figure points
    tilt: number; // signed lean angle (radians)
    color: string;
  }

  let {
    posX,
    posY,
    posZ,
    baseRadius,
    baseThickness,
    figureWidth,
    figureLength,
    figureThickness,
    figureDir,
    tilt,
    color
  }: Props = $props();

  const baseColor = '#9aa0a6'; // plastic base
  // Centre of the figure: offset inward from the base along the width (X).
  const figX = $derived(posX + figureDir * (baseThickness / 2 + figureLength / 2));
</script>

<!-- Round base: cylinder with its axis along X (against the side wall) -->
<T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.z={Math.PI / 2}>
  <T.CylinderGeometry args={[baseRadius, baseRadius, baseThickness, 32]} />
  <T.MeshStandardMaterial
    color={baseColor}
    roughness={COUNTER_MATERIAL.roughness}
    metalness={COUNTER_MATERIAL.metalness}
  />
</T.Mesh>

<!-- Figure: a thin rectangle reaching inward (X), standing tall (Y), thin in depth (Z), leaning by tilt -->
<T.Group position.x={figX} position.y={posY} position.z={posZ} rotation.x={tilt}>
  <T.Mesh>
    <T.BoxGeometry args={[figureLength, figureWidth, figureThickness]} />
    <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
  </T.Mesh>
</T.Group>
