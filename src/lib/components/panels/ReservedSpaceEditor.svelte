<script lang="ts">
  import { Input, FormControl, Spacer, Text } from '@tableslayer/ui';
  import type { ReservedTray } from '#lib/types/project.js';
  import type { ReservedSpaceParams } from '#lib/models/reservedSpace.js';

  interface Props {
    tray: ReservedTray;
    onUpdateParams: (params: ReservedSpaceParams) => void;
    // Height of the section this reserved space sits in (it is drawn at this height)
    sectionHeight?: number;
  }

  let { tray, onUpdateParams, sectionHeight }: Props = $props();

  function updateSize(key: keyof ReservedSpaceParams, raw: string) {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    onUpdateParams({ ...tray.params, [key]: parsed });
  }
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">Reserved space</h3>
    <Spacer size="0.5rem" />
    <div class="reservedSpaceEditor__inputs">
      <FormControl label="Width" name="reservedWidth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="1"
            value={tray.params.width}
            onchange={(e) => updateSize('width', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Depth" name="reservedDepth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="1"
            value={tray.params.depth}
            onchange={(e) => updateSize('depth', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Height" name="reservedHeight">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="number"
            step="1"
            min="1"
            value={tray.params.height}
            onchange={(e) => updateSize('height', e.currentTarget.value)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
    <Spacer size="0.75rem" />
    <Text size="0.875rem" color="var(--fgMuted)">
      A reserved space stands in for game parts you are not printing, such as boards, rulebooks or card boxes. It is
      never exported. Its height counts toward the height of its section, so trays beside it grow to match.
    </Text>
    {#if sectionHeight !== undefined && sectionHeight > tray.params.height + 0.05}
      <Spacer size="0.5rem" />
      <Text size="0.875rem" color="var(--fgMuted)">
        Shown at {sectionHeight.toFixed(1)}mm to match the tallest item in this section.
      </Text>
    {/if}
  </section>
</div>

<style>
  .reservedSpaceEditor__inputs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }

  .panelFormSection {
    padding: 0 0.75rem;
  }

  .section {
    margin-bottom: 1rem;
  }

  .sectionTitle {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--fgMuted);
  }
</style>
