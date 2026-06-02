<script lang="ts">
  import { Button, Icon, ConfirmActionButton } from '@tableslayer/ui';
  import { IconCopy, IconTrash } from '@tabler/icons-svelte';

  type SelectionType = 'dimensions' | 'layer' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    canDelete: boolean;
    onDuplicate: () => void;
    onDelete: () => void;
  }

  let { selectionType, canDelete, onDuplicate, onDelete }: Props = $props();

  let deleteMessage = $derived.by(() => {
    switch (selectionType) {
      case 'layer':
        return 'Delete this layer and all its contents?';
      case 'box':
        return 'Delete this box and all its trays?';
      case 'tray':
        return 'Delete this tray?';
      default:
        return 'Delete this item?';
    }
  });
</script>

{#if selectionType !== 'dimensions'}
  <div class="panelBottomBar">
    <Button variant="ghost" size="sm" onclick={onDuplicate}>
      {#snippet start()}
        <Icon Icon={IconCopy} size="1rem" />
      {/snippet}
      Duplicate
    </Button>

    {#if canDelete}
      <span class="deleteButtonWrapper">
        <ConfirmActionButton
          action={onDelete}
          actionButtonText="Delete"
          positioning={{ placement: 'top-end' }}
          portal=".appContainer"
        >
          {#snippet trigger({ triggerProps })}
            <Button {...triggerProps} variant="ghost" size="sm">
              {#snippet start()}
                <Icon Icon={IconTrash} size="1rem" />
              {/snippet}
              Delete
            </Button>
          {/snippet}
          {#snippet actionMessage()}
            <p>{deleteMessage}</p>
          {/snippet}
        </ConfirmActionButton>
      </span>
    {/if}
  </div>
{/if}

<style>
  .panelBottomBar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: var(--borderThin);
    flex-shrink: 0;
  }

  .deleteButtonWrapper {
    position: relative;
  }
</style>
