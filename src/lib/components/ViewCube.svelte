<script lang="ts">
  import { Canvas } from '@threlte/core';
  import ViewCubeScene from './ViewCubeScene.svelte';

  interface Props {
    cameraQuaternion?: [number, number, number, number];
    onSelectAngle?: (angle: string) => void;
    visible?: boolean;
  }

  let { cameraQuaternion = [0, 0, 0, 1], onSelectAngle, visible = true }: Props = $props();

  function handleSelectAngle(angle: string) {
    onSelectAngle?.(angle);
  }
</script>

{#if visible}
  <div class="viewCube">
    <Canvas>
      <ViewCubeScene {cameraQuaternion} onSelectAngle={handleSelectAngle} />
    </Canvas>
  </div>
{/if}

<style>
  .viewCube {
    position: absolute;
    top: 0.5rem;
    right: 1.5rem;
    width: 100px;
    height: 100px;
    z-index: 100;
    pointer-events: auto;
  }

  .viewCube :global(canvas) {
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .viewCube {
      display: none;
    }
  }
</style>
