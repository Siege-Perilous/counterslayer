<script lang="ts">
  /**
   * TrayLidMesh - A tray's own sliding lid, seated on the tray.
   * Lives in the tray's local frame (same parent group as the tray mesh, origin at the tray's
   * front-left-bottom corner). The lid geometry is in print orientation (top plate down), so it is
   * flipped over and dropped onto the tray rim, the same way BoxAssembly seats a box lid.
   */
  import { T } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import * as THREE from 'three';

  interface Props {
    lidGeometry: THREE.BufferGeometry;
    trayGeometry: THREE.BufferGeometry;
    color: string;
    onclick?: (e: IntersectionEvent<MouseEvent>) => void;
    ondblclick?: (e: IntersectionEvent<MouseEvent>) => void;
  }

  let { lidGeometry, trayGeometry, color, onclick, ondblclick }: Props = $props();

  function getBounds(geom: THREE.BufferGeometry): THREE.Box3 {
    geom.computeBoundingBox();
    return geom.boundingBox ?? new THREE.Box3();
  }

  let lidBounds = $derived(getBounds(lidGeometry));
  let trayBounds = $derived(getBounds(trayGeometry));

  let lidWidth = $derived(lidBounds.max.x - lidBounds.min.x);
  let lidDepth = $derived(lidBounds.max.y - lidBounds.min.y);
  // The lid is a top plate plus a lip of the same height; only the plate sits above the tray
  let plateThickness = $derived((lidBounds.max.z - lidBounds.min.z) / 2);
  let lidTopY = $derived(trayBounds.max.z + plateThickness);

  // The lid slides along its longer side. Flipping it over mirrors it front-to-back, which is
  // only right when it slides along X; otherwise turn it half a turn so the open end lines up.
  let slidesAlongX = $derived(lidWidth > lidDepth);
</script>

<T.Mesh
  geometry={lidGeometry}
  rotation.x={Math.PI / 2}
  rotation.z={slidesAlongX ? 0 : Math.PI}
  position.x={slidesAlongX ? 0 : lidWidth}
  position.y={lidTopY}
  position.z={slidesAlongX ? -lidDepth : 0}
  {onclick}
  {ondblclick}
>
  <T.MeshStandardMaterial {color} roughness={0.5} metalness={0.1} side={THREE.DoubleSide} />
</T.Mesh>
