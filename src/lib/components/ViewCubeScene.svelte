<script lang="ts">
  import { T } from '@threlte/core';
  import { Text, interactivity, type IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';

  // Enable interactivity for pointer events
  interactivity();

  interface Props {
    cameraQuaternion: [number, number, number, number];
    onSelectAngle: (angle: string) => void;
  }

  let { cameraQuaternion, onSelectAngle }: Props = $props();

  // Face definitions
  const faces = [
    {
      name: 'FRONT',
      angle: 'front',
      position: [0, 0, 0.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number]
    },
    {
      name: 'BACK',
      angle: 'back',
      position: [0, 0, -0.5] as [number, number, number],
      rotation: [0, Math.PI, 0] as [number, number, number]
    },
    {
      name: 'RIGHT',
      angle: 'right',
      position: [0.5, 0, 0] as [number, number, number],
      rotation: [0, Math.PI / 2, 0] as [number, number, number]
    },
    {
      name: 'LEFT',
      angle: 'left',
      position: [-0.5, 0, 0] as [number, number, number],
      rotation: [0, -Math.PI / 2, 0] as [number, number, number]
    },
    {
      name: 'TOP',
      angle: 'top',
      position: [0, 0.5, 0] as [number, number, number],
      rotation: [-Math.PI / 2, 0, 0] as [number, number, number]
    },
    {
      name: 'BOTTOM',
      angle: 'bottom',
      position: [0, -0.5, 0] as [number, number, number],
      rotation: [Math.PI / 2, 0, 0] as [number, number, number]
    }
  ];

  // Corner definitions - top 4 corners for isometric views
  const corners = [
    { angle: 'iso', position: [0.5, 0.5, 0.5] as [number, number, number] },
    { angle: 'iso-left', position: [-0.5, 0.5, 0.5] as [number, number, number] },
    { angle: 'iso-back', position: [-0.5, 0.5, -0.5] as [number, number, number] },
    { angle: 'iso-right', position: [0.5, 0.5, -0.5] as [number, number, number] }
  ];

  // Edge definitions for wireframe
  const edges = [
    // Top edges
    { start: [-0.5, 0.5, 0.5], end: [0.5, 0.5, 0.5] },
    { start: [0.5, 0.5, 0.5], end: [0.5, 0.5, -0.5] },
    { start: [0.5, 0.5, -0.5], end: [-0.5, 0.5, -0.5] },
    { start: [-0.5, 0.5, -0.5], end: [-0.5, 0.5, 0.5] },
    // Bottom edges
    { start: [-0.5, -0.5, 0.5], end: [0.5, -0.5, 0.5] },
    { start: [0.5, -0.5, 0.5], end: [0.5, -0.5, -0.5] },
    { start: [0.5, -0.5, -0.5], end: [-0.5, -0.5, -0.5] },
    { start: [-0.5, -0.5, -0.5], end: [-0.5, -0.5, 0.5] },
    // Vertical edges
    { start: [-0.5, -0.5, 0.5], end: [-0.5, 0.5, 0.5] },
    { start: [0.5, -0.5, 0.5], end: [0.5, 0.5, 0.5] },
    { start: [0.5, -0.5, -0.5], end: [0.5, 0.5, -0.5] },
    { start: [-0.5, -0.5, -0.5], end: [-0.5, 0.5, -0.5] }
  ];

  // Create edge geometry
  function createEdgeGeometry(start: number[], end: number[]) {
    const points = [new THREE.Vector3(start[0], start[1], start[2]), new THREE.Vector3(end[0], end[1], end[2])];
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  // Hover states
  let hoveredFace = $state<string | null>(null);
  let hoveredCorner = $state<string | null>(null);

  // Colors matching app theme
  const colors = {
    face: '#2a2a2d',
    faceHover: '#555560',
    edge: '#3a3a3d',
    text: '#c8c8d2',
    corner: '#707078'
  };
</script>

<T.PerspectiveCamera makeDefault position={[0, 0, 4]} fov={30} />
<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[2, 3, 4]} intensity={0.8} />

<!-- Cube group that rotates with camera -->
<T.Group quaternion={[-cameraQuaternion[0], -cameraQuaternion[1], -cameraQuaternion[2], cameraQuaternion[3]]}>
  <!-- Faces -->
  {#each faces as face (face.angle)}
    <T.Group position={face.position} rotation={face.rotation}>
      <T.Mesh
        onclick={() => onSelectAngle(face.angle)}
        onpointerenter={() => (hoveredFace = face.angle)}
        onpointerleave={() => (hoveredFace = null)}
      >
        <T.PlaneGeometry args={[0.95, 0.95]} />
        <T.MeshStandardMaterial
          color={hoveredFace === face.angle ? colors.faceHover : colors.face}
          transparent
          opacity={0.9}
        />
      </T.Mesh>
      <!-- Face label -->
      <Text
        text={face.name}
        fontSize={0.18}
        position={[0, 0, 0.01]}
        color={colors.text}
        anchorX="center"
        anchorY="middle"
        fontWeight={700}
      />
    </T.Group>
  {/each}

  <!-- Wireframe edges -->
  {#each edges as edge, i (i)}
    <T.Line geometry={createEdgeGeometry(edge.start, edge.end)}>
      <T.LineBasicMaterial color={colors.edge} />
    </T.Line>
  {/each}

  <!-- Corner cubes - visible cube only appears on hover -->
  {#each corners as corner (corner.angle)}
    <T.Group position={corner.position}>
      <!-- Invisible hit area (always active) -->
      <T.Mesh
        onclick={(e: IntersectionEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelectAngle(corner.angle);
        }}
        onpointerenter={() => (hoveredCorner = corner.angle)}
        onpointerleave={() => (hoveredCorner = null)}
      >
        <T.BoxGeometry args={[0.25, 0.25, 0.25]} />
        <T.MeshBasicMaterial transparent opacity={0} />
      </T.Mesh>
      <!-- Visible cube (only on hover) -->
      {#if hoveredCorner === corner.angle}
        <T.Mesh>
          <T.BoxGeometry args={[0.2, 0.2, 0.2]} />
          <T.MeshStandardMaterial color={colors.corner} />
        </T.Mesh>
      {/if}
    </T.Group>
  {/each}
</T.Group>
