<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import { COUNTER_MATERIAL, SLEEVE_MATERIAL, INNER_CARD_MATERIAL } from '$lib/three/materials';

  interface Props {
    // Shape type
    shape: 'square' | 'rectangle' | 'circle' | 'hex' | 'triangle';
    // Position
    posX: number;
    posY: number;
    posZ: number;
    // Dimensions
    width: number;
    length: number;
    thickness: number;
    // Appearance
    color: string;
    // Shape-specific
    hexPointyTop?: boolean;
    triangleGeometry?: THREE.BufferGeometry | null;
    // Orientation for edge-loaded
    isEdgeLoaded?: boolean;
    edgeOrientation?: 'lengthwise' | 'crosswise';
    standingHeight?: number;
    // Top-loaded specific
    slopeAngle?: number;
    rowAssignment?: 'front' | 'back';
    // Sleeved card support
    isSleevedCard?: boolean;
    innerWidth?: number;
    innerLength?: number;
    sleeveColor?: string;
    innerCardColor?: string;
  }

  let {
    shape,
    posX,
    posY,
    posZ,
    width,
    length,
    thickness,
    color,
    hexPointyTop = false,
    triangleGeometry,
    isEdgeLoaded = false,
    edgeOrientation = 'lengthwise',
    standingHeight,
    slopeAngle = 0,
    rowAssignment,
    isSleevedCard = false,
    innerWidth,
    innerLength,
    sleeveColor,
    innerCardColor
  }: Props = $props();

  // Calculate effective standing height for edge-loaded counters
  const effectiveHeight = $derived(standingHeight ?? width);
</script>

{#if isEdgeLoaded}
  <!-- Edge-loaded counter (standing up) -->
  {#if edgeOrientation === 'lengthwise'}
    {#if shape === 'square' || shape === 'rectangle'}
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
        <T.BoxGeometry args={[thickness, effectiveHeight, length]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'circle'}
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.z={Math.PI / 2}>
        <T.CylinderGeometry args={[width / 2, width / 2, thickness, 32]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'hex'}
      <T.Mesh
        position.x={posX}
        position.y={posY}
        position.z={posZ}
        rotation.z={Math.PI / 2}
        rotation.x={hexPointyTop ? 0 : Math.PI / 6}
      >
        <T.CylinderGeometry args={[width / 2, width / 2, thickness, 6]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'triangle' && triangleGeometry}
      <T.Mesh
        geometry={triangleGeometry}
        position.x={posX}
        position.y={posY}
        position.z={posZ}
        rotation.y={Math.PI / 2}
        rotation.x={Math.PI}
      >
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {/if}
  {:else}
    <!-- crosswise orientation -->
    {#if shape === 'square' || shape === 'rectangle'}
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
        <T.BoxGeometry args={[length, effectiveHeight, thickness]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'circle'}
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.x={Math.PI / 2}>
        <T.CylinderGeometry args={[width / 2, width / 2, thickness, 32]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'hex'}
      <T.Mesh
        position.x={posX}
        position.y={posY}
        position.z={posZ}
        rotation.x={Math.PI / 2}
        rotation.y={hexPointyTop ? Math.PI / 6 : 0}
      >
        <T.CylinderGeometry args={[width / 2, width / 2, thickness, 6]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {:else if shape === 'triangle' && triangleGeometry}
      <T.Mesh geometry={triangleGeometry} position.x={posX} position.y={posY} position.z={posZ} rotation.x={Math.PI}>
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {/if}
  {/if}
{:else}
  <!-- Top-loaded counter (laying flat) -->
  {#if shape === 'square' || shape === 'rectangle'}
    {#if isSleevedCard && innerWidth && innerLength}
      <!-- Sleeved card: transparent sleeve with inner card -->
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.x={slopeAngle}>
        <T.BoxGeometry args={[width, thickness, length]} />
        <T.MeshStandardMaterial
          color={sleeveColor}
          transparent={SLEEVE_MATERIAL.transparent}
          opacity={SLEEVE_MATERIAL.opacity}
          roughness={SLEEVE_MATERIAL.roughness}
          metalness={SLEEVE_MATERIAL.metalness}
        />
      </T.Mesh>
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.x={slopeAngle}>
        <T.BoxGeometry args={[innerWidth, thickness * 0.6, innerLength]} />
        <T.MeshStandardMaterial
          color={innerCardColor}
          roughness={INNER_CARD_MATERIAL.roughness}
          metalness={INNER_CARD_MATERIAL.metalness}
        />
      </T.Mesh>
    {:else}
      <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.x={slopeAngle}>
        <T.BoxGeometry args={[width, thickness, length]} />
        <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
      </T.Mesh>
    {/if}
  {:else if shape === 'circle'}
    <T.Mesh position.x={posX} position.y={posY} position.z={posZ}>
      <T.CylinderGeometry args={[width / 2, width / 2, thickness, 32]} />
      <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
    </T.Mesh>
  {:else if shape === 'hex'}
    <T.Mesh position.x={posX} position.y={posY} position.z={posZ} rotation.y={hexPointyTop ? 0 : Math.PI / 6}>
      <T.CylinderGeometry args={[width / 2, width / 2, thickness, 6]} />
      <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
    </T.Mesh>
  {:else if shape === 'triangle' && triangleGeometry}
    {@const isBackRow = rowAssignment === 'back'}
    <T.Mesh
      geometry={triangleGeometry}
      position.x={posX}
      position.y={posY}
      position.z={posZ}
      rotation.x={-Math.PI / 2}
      rotation.y={Math.PI}
      rotation.z={isBackRow ? Math.PI : 0}
    >
      <T.MeshStandardMaterial {color} roughness={COUNTER_MATERIAL.roughness} metalness={COUNTER_MATERIAL.metalness} />
    </T.Mesh>
  {/if}
{/if}
