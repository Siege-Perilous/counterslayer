<script lang="ts">
  import { T } from '@threlte/core';

  type LightingPreset = 'default' | 'editor' | 'capture';

  interface Props {
    preset?: LightingPreset;
  }

  let { preset = 'default' }: Props = $props();

  interface LightConfig {
    position: [number, number, number];
    intensity: number;
    castShadow?: boolean;
  }

  interface PresetConfig {
    ambient: number;
    main: LightConfig;
    fill: LightConfig | null;
    back: LightConfig | null;
  }

  // Lighting configurations for different presets
  const presets: Record<LightingPreset, PresetConfig> = {
    default: {
      ambient: 0.4,
      main: { position: [50, 100, 50], intensity: 1.5 },
      fill: { position: [-50, 50, -50], intensity: 0.5 },
      back: { position: [0, 20, -80], intensity: 0.3 }
    },
    editor: {
      ambient: 0.6,
      main: { position: [50, 100, 50], intensity: 0.8, castShadow: true },
      fill: null,
      back: null
    },
    capture: {
      ambient: 0.5,
      main: { position: [50, 100, 50], intensity: 1.2 },
      fill: { position: [-50, 50, -50], intensity: 0.4 },
      back: { position: [0, 20, -80], intensity: 0.2 }
    }
  };

  let config = $derived(presets[preset]);
</script>

<T.AmbientLight intensity={config.ambient} />
<T.DirectionalLight
  position={config.main.position}
  intensity={config.main.intensity}
  castShadow={config.main.castShadow ?? false}
/>
{#if config.fill}
  <T.DirectionalLight position={config.fill.position} intensity={config.fill.intensity} />
{/if}
{#if config.back}
  <T.DirectionalLight position={config.back.position} intensity={config.back.intensity} />
{/if}
