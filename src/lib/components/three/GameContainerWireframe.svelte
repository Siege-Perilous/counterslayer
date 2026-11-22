<script lang="ts">
  /**
   * GameContainerWireframe - dashed outline of the game container's interior volume.
   * Drawn only when the container has a height. The top turns red when contents rise above it.
   */
  import { T } from '@threlte/core';
  import { Text } from '@threlte/extras';
  import * as THREE from 'three';

  interface Props {
    width: number;
    depth: number;
    height: number;
    /** Centre of the container floor */
    position?: [number, number, number];
    /** Something rises above the container */
    exceeded?: boolean;
    /** Fade the outline (used while the view is exploded and no longer to scale) */
    dimmed?: boolean;
    labelQuaternion?: [number, number, number, number];
    monoFont?: string;
  }

  let {
    width,
    depth,
    height,
    position = [0, 0, 0],
    exceeded = false,
    dimmed = false,
    labelQuaternion = [0, 0, 0, 1],
    monoFont = '/fonts/JetBrainsMono-Regular.ttf'
  }: Props = $props();

  const NORMAL_COLOR = '#c9503c';
  const EXCEEDED_COLOR = '#ff3b30';

  function dashedSegments(points: [number, number, number][]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    // LineDashedMaterial needs per-vertex line distances
    const distances: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const a = new THREE.Vector3(...points[i]);
      const b = new THREE.Vector3(...points[i + 1]);
      distances.push(0, a.distanceTo(b));
    }
    geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(distances, 1));
    return geometry;
  }

  // Four vertical edges
  let uprightGeometry = $derived.by(() => {
    const hw = width / 2;
    const hd = depth / 2;
    return dashedSegments([
      [-hw, 0, -hd],
      [-hw, height, -hd],
      [hw, 0, -hd],
      [hw, height, -hd],
      [hw, 0, hd],
      [hw, height, hd],
      [-hw, 0, hd],
      [-hw, height, hd]
    ]);
  });

  // Top rectangle
  let topGeometry = $derived.by(() => {
    const hw = width / 2;
    const hd = depth / 2;
    return dashedSegments([
      [-hw, height, -hd],
      [hw, height, -hd],
      [hw, height, -hd],
      [hw, height, hd],
      [hw, height, hd],
      [-hw, height, hd],
      [-hw, height, hd],
      [-hw, height, -hd]
    ]);
  });

  let opacity = $derived(dimmed ? 0.25 : 0.9);
</script>

<T.Group position.x={position[0]} position.y={position[1]} position.z={position[2]}>
  <T.LineSegments geometry={uprightGeometry}>
    <T.LineDashedMaterial color={NORMAL_COLOR} dashSize={4} gapSize={3} transparent {opacity} />
  </T.LineSegments>
  <T.LineSegments geometry={topGeometry}>
    <T.LineDashedMaterial
      color={exceeded ? EXCEEDED_COLOR : NORMAL_COLOR}
      dashSize={4}
      gapSize={3}
      transparent
      opacity={exceeded ? 1 : opacity}
    />
  </T.LineSegments>
  <Text
    text={`${height}mm`}
    font={monoFont}
    fontSize={5}
    position={[width / 2 + 4, height, depth / 2]}
    quaternion={labelQuaternion}
    color={exceeded ? EXCEEDED_COLOR : NORMAL_COLOR}
    fillOpacity={dimmed ? 0.4 : 1}
    anchorX="left"
    anchorY="middle"
  />
</T.Group>
