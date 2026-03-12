<script lang="ts">
  import * as THREE from 'three';

  interface Props {
    cameraQuaternion?: [number, number, number, number];
    onSelectAngle?: (angle: string) => void;
    visible?: boolean;
  }

  let {
    cameraQuaternion = [0, 0, 0, 1],
    onSelectAngle,
    visible = true
  }: Props = $props();

  // Face definitions - cube is 50px, faces are at ±25px from center
  // Note: TOP/BOTTOM transforms are swapped because CSS Y-axis is inverted vs Three.js
  const faces = [
    { name: 'FRONT', angle: 'front', transform: 'rotateY(0deg) translateZ(25px)' },
    { name: 'BACK', angle: 'back', transform: 'rotateY(180deg) translateZ(25px)' },
    { name: 'LEFT', angle: 'left', transform: 'rotateY(-90deg) translateZ(25px)' },
    { name: 'RIGHT', angle: 'right', transform: 'rotateY(90deg) translateZ(25px)' },
    { name: 'BOTTOM', angle: 'bottom', transform: 'rotateX(-90deg) translateZ(25px)' },
    { name: 'TOP', angle: 'top', transform: 'rotateX(90deg) translateZ(25px)' }
  ];

  // Corner definitions - positioned at cube vertices
  // Cube is 50x50 with faces at ±25px from center.
  // Corner buttons are 8x8, positioned so their center is at the vertex.
  // translate3d positions the element's top-left corner, so offset by -4 in X/Y.
  // Vertices: front-right-top = (25, -25, 25), centered button at (21, -29, 25)
  const corners = [
    { angle: 'iso', x: 21, y: -29, z: 25 },        // front-right-top
    { angle: 'iso-left', x: -29, y: -29, z: 25 },  // front-left-top
    { angle: 'iso-back', x: -29, y: -29, z: -25 }, // back-left-top
    { angle: 'iso-right', x: 21, y: -29, z: -25 }  // back-right-top
  ];

  // Convert camera quaternion to CSS 3D matrix
  // Three.js uses Y-up, CSS uses Y-down, so we need to flip the Y axis
  let cubeTransform = $derived.by(() => {
    const q = new THREE.Quaternion(
      cameraQuaternion[0],
      cameraQuaternion[1],
      cameraQuaternion[2],
      cameraQuaternion[3]
    );

    // Create rotation matrix from inverse quaternion (camera looks at scene, cube shows what camera sees)
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q.invert());

    // Flip Y axis to convert from Three.js (Y-up) to CSS (Y-down)
    // This is done by negating the Y row and Y column of the rotation matrix
    const m = matrix.elements;
    // Negate elements involving Y (indices 1, 4, 5, 6, 7, 9, 13)
    // Row 1 (Y row): indices 1, 5, 9, 13
    // Column 1 (Y column): indices 4, 5, 6, 7
    // But we only negate Y row and column of the rotation part (3x3 upper-left)
    m[1] = -m[1];
    m[4] = -m[4];
    m[6] = -m[6];
    m[9] = -m[9];

    // CSS matrix3d uses column-major order, same as Three.js
    return `matrix3d(${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]},${m[6]},${m[7]},${m[8]},${m[9]},${m[10]},${m[11]},${m[12]},${m[13]},${m[14]},${m[15]})`;
  });

  function handleFaceClick(angle: string) {
    onSelectAngle?.(angle);
  }

  function handleCornerClick(angle: string) {
    onSelectAngle?.(angle);
  }
</script>

{#if visible}
  <div class="viewCube">
    <div class="viewCube__scene">
      <div class="viewCube__cube" style="transform: {cubeTransform}">
        <!-- Faces -->
        {#each faces as face}
          <button
            class="viewCube__face"
            style="transform: {face.transform}"
            onclick={() => handleFaceClick(face.angle)}
            aria-label="View from {face.name}"
          >
            <span class="viewCube__label">{face.name}</span>
          </button>
        {/each}

        <!-- Corner click zones - positioned at cube vertices -->
        {#each corners as corner}
          <button
            class="viewCube__corner"
            style="transform: translate3d({corner.x}px, {corner.y}px, {corner.z}px)"
            onclick={() => handleCornerClick(corner.angle)}
            aria-label="Isometric view"
          ></button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .viewCube {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 80px;
    height: 80px;
    z-index: 100;
    pointer-events: auto;
  }

  .viewCube__scene {
    width: 100%;
    height: 100%;
    perspective: 300px;
  }

  .viewCube__cube {
    width: 50px;
    height: 50px;
    position: relative;
    transform-style: preserve-3d;
    margin: 15px auto;
    /* No transition - snaps instantly to avoid gimbal lock spin issues */
  }

  .viewCube__face {
    position: absolute;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(40, 40, 45, 0.85);
    border: 1px solid rgba(100, 100, 110, 0.6);
    cursor: pointer;
    backface-visibility: hidden;
    transition: background 0.15s, border-color 0.15s;
    padding: 0;
    font-family: inherit;
  }

  .viewCube__face:hover {
    background: rgba(60, 120, 200, 0.9);
    border-color: rgba(100, 160, 255, 0.8);
  }

  .viewCube__label {
    font-size: 8px;
    font-weight: 600;
    color: rgba(200, 200, 210, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .viewCube__face:hover .viewCube__label {
    color: #ffffff;
  }

  .viewCube__corner {
    position: absolute;
    width: 8px;
    height: 8px;
    background: rgba(80, 80, 90, 0.9);
    border: 1px solid rgba(120, 120, 130, 0.8);
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
    padding: 0;
    transform-style: preserve-3d;
  }

  .viewCube__corner:hover {
    background: rgba(60, 120, 200, 0.95);
    border-color: rgba(100, 160, 255, 0.9);
  }
</style>
