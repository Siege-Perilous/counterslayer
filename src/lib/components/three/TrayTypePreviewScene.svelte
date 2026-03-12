<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
  import SceneLighting from './SceneLighting.svelte';
  import type { TrayType } from '$lib/stores/project.svelte';
  import * as THREE from 'three';

  interface Props {
    trayType: TrayType;
  }

  let { trayType }: Props = $props();

  // Set transparent background
  const { renderer } = useThrelte();
  $effect(() => {
    if (renderer) {
      renderer.setClearColor(0x000000, 0);
    }
  });

  // Map tray types to STL file paths
  const stlPaths: Record<string, string> = {
    counter: '/stls/counter.stl',
    cardDraw: '/stls/card-draw.stl',
    cardDivider: '/stls/card-divider.stl',
    cardWell: '/stls/card-well.stl',
    cup: '/stls/cups.stl'
  };

  // Uniform tray color
  const trayColor = '#666666';

  // Load the STL geometry
  let loadedGeometry = $state<THREE.BufferGeometry | null>(null);

  $effect(() => {
    const path = stlPaths[trayType] || stlPaths.counter;
    const loader = new STLLoader();
    loader.load(path, (geometry) => {
      // Center the geometry
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (box) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
      }
      loadedGeometry = geometry;
    });
  });

  // Calculate scale to fit the model in view
  let modelScale = $derived.by(() => {
    if (!loadedGeometry) return 1;
    loadedGeometry.computeBoundingBox();
    const box = loadedGeometry.boundingBox;
    if (!box) return 1;
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    // Target size around 40 units
    return 40 / maxDim;
  });

  // Rotation animation
  let groupRef = $state<THREE.Group | undefined>(undefined);
  let time = 0;

  useTask((delta) => {
    if (!groupRef) return;
    time += delta * 0.5;
    // Gentle tumble: slow Y rotation with subtle X oscillation
    groupRef.rotation.y = time;
    groupRef.rotation.x = Math.sin(time * 0.7) * 0.15;
  });
</script>

<!-- Camera positioned for isometric view, centered on model -->
<T.PerspectiveCamera makeDefault position={[50, 35, 50]} fov={35} oncreate={(ref) => ref.lookAt(0, 0, 0)} />

<SceneLighting preset="default" />

<!-- Rotating group for geometry -->
<T.Group bind:ref={groupRef}>
  {#if loadedGeometry}
    <T.Mesh geometry={loadedGeometry} scale={modelScale} rotation.x={-Math.PI / 2}>
      <T.MeshStandardMaterial color={trayColor} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
    </T.Mesh>
  {/if}
</T.Group>
