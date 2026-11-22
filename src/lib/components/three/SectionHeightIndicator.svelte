<script lang="ts">
  /**
   * SectionHeightIndicator - vertical dimension line with the section's name and height.
   * Positioned in world space by the parent, beside the game container.
   */
  import { T } from '@threlte/core';
  import { Text } from '@threlte/extras';
  import * as THREE from 'three';

  interface Props {
    /** Base of the line (underside of the section) */
    position: [number, number, number];
    height: number;
    name: string;
    /** Which side of the container the indicator is on; text sits on the outer side */
    side?: 'left' | 'right';
    labelQuaternion?: [number, number, number, number];
    monoFont?: string;
  }

  let {
    position,
    height,
    name,
    side = 'left',
    labelQuaternion = [0, 0, 0, 1],
    monoFont = '/fonts/JetBrainsMono-Regular.ttf'
  }: Props = $props();

  let lineGeometry = $derived(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, height, 0),
      new THREE.Vector3(-3, height, 0),
      new THREE.Vector3(3, height, 0),
      new THREE.Vector3(-3, 0, 0),
      new THREE.Vector3(3, 0, 0)
    ])
  );

  let textX = $derived(side === 'left' ? -5 : 5);
  let anchorX = $derived<'left' | 'right'>(side === 'left' ? 'right' : 'left');
</script>

<T.Group position.x={position[0]} position.y={position[1]} position.z={position[2]}>
  <T.LineSegments geometry={lineGeometry}>
    <T.LineBasicMaterial color="#888888" />
  </T.LineSegments>
  <Text
    text={name}
    font={monoFont}
    fontSize={6}
    position={[textX, height / 2 + 4, 0]}
    quaternion={labelQuaternion}
    color="#ffffff"
    {anchorX}
    anchorY="middle"
  />
  <Text
    text={`${height.toFixed(1)}mm`}
    font={monoFont}
    fontSize={4}
    position={[textX, height / 2 - 4, 0]}
    quaternion={labelQuaternion}
    color="#aaaaaa"
    {anchorX}
    anchorY="middle"
  />
</T.Group>
