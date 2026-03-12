<script lang="ts">
  import { Canvas } from '@threlte/core';
  import TrayTypePreviewScene from './three/TrayTypePreviewScene.svelte';
  import type { TrayType } from '$lib/stores/project.svelte';

  interface Props {
    trayType: TrayType;
  }

  let { trayType }: Props = $props();
</script>

<div class="trayTypePreview">
  <Canvas>
    <TrayTypePreviewScene {trayType} />
  </Canvas>
</div>

<style>
  .trayTypePreview {
    width: 200px;
    height: 150px;
  }
</style>
