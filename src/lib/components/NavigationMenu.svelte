<script lang="ts">
	import { IconButton, Icon, ConfirmActionButton, Hr, Panel } from '@tableslayer/ui';
	import { IconX, IconPackage, IconRuler } from '@tabler/icons-svelte';
	import {
		getProject,
		getSelectedBox,
		getSelectedTray,
		selectBox,
		selectTray,
		addBox,
		deleteBox,
		addTray,
		deleteTray,
		type Box,
		type Tray
	} from '$lib/stores/project.svelte';

	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface Props {
		selectionType: SelectionType;
		onSelectionChange: (type: SelectionType) => void;
		onExpandPanel: () => void;
	}

	let { selectionType, onSelectionChange, onExpandPanel }: Props = $props();

	let project = $derived(getProject());
	let selectedBox = $derived(getSelectedBox());
	let selectedTray = $derived(getSelectedTray());

	function handleDimensionsClick() {
		onSelectionChange('dimensions');
		onExpandPanel();
	}

	function handleBoxClick(box: Box) {
		selectBox(box.id);
		onSelectionChange('box');
		onExpandPanel();
	}

	function handleTrayClick(tray: Tray, box: Box) {
		selectBox(box.id);
		selectTray(tray.id);
		onSelectionChange('tray');
		onExpandPanel();
	}

	function handleAddBox() {
		addBox();
		onSelectionChange('box');
		onExpandPanel();
	}

	function handleAddTray(boxId: string, e: Event) {
		e.stopPropagation();
		addTray(boxId);
		onSelectionChange('tray');
		onExpandPanel();
	}

	function handleDeleteBox(boxId: string) {
		deleteBox(boxId);
		// If we deleted the selected box, switch to dimensions
		if (selectedBox?.id === boxId) {
			onSelectionChange('dimensions');
		}
	}

	function handleDeleteTray(boxId: string, trayId: string) {
		deleteTray(boxId, trayId);
		// If we deleted the selected tray, switch to box view
		if (selectedTray?.id === trayId) {
			onSelectionChange('box');
		}
	}

	function getTrayStats(tray: Tray): { stacks: number; counters: number } {
		const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
		return {
			stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
			counters: topCount + edgeCount
		};
	}
</script>

<Panel class="navMenu">
	<!-- Dimensions (Globals) -->
	<button
		class="navItem navItem--dimensions {selectionType === 'dimensions' ? 'navItem--selected' : ''}"
		onclick={handleDimensionsClick}
	>
		<span class="navItemIcon">
			<Icon Icon={IconRuler} size="1rem" />
		</span>
		Dimensions
	</button>
	<Hr />

	<!-- Boxes and Trays -->
	<div class="navTree">
		{#each project.boxes as box (box.id)}
			{@const isBoxSelected = selectedBox?.id === box.id && selectionType === 'box'}

			<div class="navBoxGroup">
				<!-- Box Item -->
				<div class="navItem navItem--box {isBoxSelected ? 'navItem--selected' : ''}">
					<span class="navItemIcon">
						<Icon Icon={IconPackage} size="1rem" />
					</span>
					<button class="navItemLabel" onclick={() => handleBoxClick(box)}>
						{box.name}
					</button>
					{#if project.boxes.length > 1}
						<span class="navItemDelete">
							<ConfirmActionButton
								action={() => handleDeleteBox(box.id)}
								actionButtonText="Delete box"
								positioning={{ placement: 'right' }}
							>
								{#snippet trigger({ triggerProps })}
									<IconButton {...triggerProps} size="sm" variant="ghost" title="Delete box">
										<Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
									</IconButton>
								{/snippet}
								{#snippet actionMessage()}
									<p>Delete this box and all its trays?</p>
								{/snippet}
							</ConfirmActionButton>
						</span>
					{/if}
				</div>

				<!-- Trays within Box -->
				<div class="navTrayList">
					{#each box.trays as tray, trayIdx (tray.id)}
						{@const isTraySelected =
							selectedTray?.id === tray.id &&
							selectedBox?.id === box.id &&
							selectionType === 'tray'}
						{@const letter = String.fromCharCode(65 + trayIdx)}
						{@const stats = getTrayStats(tray)}

						<div class="navItem navItem--tray {isTraySelected ? 'navItem--selected' : ''}">
							<button
								class="navItemLabel"
								onclick={() => handleTrayClick(tray, box)}
								title="{tray.name} ({letter}: {stats.counters}c in {stats.stacks}s)"
							>
								<span class="trayLetter">{letter}</span>
								{tray.name}
							</button>
							{#if box.trays.length > 1}
								<span class="navItemDelete">
									<ConfirmActionButton
										action={() => handleDeleteTray(box.id, tray.id)}
										actionButtonText="Delete tray"
										positioning={{ placement: 'right' }}
									>
										{#snippet trigger({ triggerProps })}
											<IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
												<Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
											</IconButton>
										{/snippet}
										{#snippet actionMessage()}
											<p>Delete this tray?</p>
										{/snippet}
									</ConfirmActionButton>
								</span>
							{/if}
						</div>
					{/each}

					<!-- Add Tray Button -->
					<button
						class="navItem navItem--add navItem--tray"
						onclick={(e) => handleAddTray(box.id, e)}
					>
						<span class="addIcon">+</span>
						<span class="addLabel">Add tray</span>
					</button>
				</div>
				<Hr />
			</div>
		{/each}

		<!-- Add Box Button -->
		<button class="navItem navItem--add" onclick={handleAddBox}>
			<span class="addIcon">+</span>
			<span class="addLabel">Add box</span>
		</button>
	</div>
</Panel>

<style>
	:global(.navMenu) {
		position: fixed;
		top: 4rem;
		left: 1.5rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		padding: 0;
		min-width: 12rem;
		max-width: 16rem;
		max-height: calc(100vh - 8rem);
		overflow-y: auto;
	}

	.navItem {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
		padding: 0 0.5rem;
		font-size: 0.875rem;
		background: transparent;
		border: none;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.navItem:hover {
		background: var(--contrastLow);
	}

	.navItem--selected {
		background: var(--contrastMedium);
		font-weight: 600;
	}

	.navItem--box {
		font-weight: 500;
	}

	.navItem--add {
		color: var(--fgMuted);
	}

	.navItem--add:hover {
		color: var(--fg);
	}

	.navItemIcon,
	.trayLetter,
	.addIcon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1rem;
		color: var(--fgMuted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
	}

	.navItemIcon {
		width: 1.25rem;
	}

	.navItemLabel {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		font: inherit;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.navItemDelete {
		opacity: 0;
	}

	.navItem:hover .navItemDelete {
		opacity: 1;
	}

	.navTree {
		display: flex;
		flex-direction: column;
	}

	.navBoxGroup {
		display: flex;
		flex-direction: column;
	}

	.navTrayList {
		display: flex;
		flex-direction: column;

		.navItem {
			padding-left: 2rem;
		}
	}

	.addLabel {
		flex: 1;
	}

	/* Mobile styles */
	@media (max-width: 768px) {
		:global(.navMenu) {
			position: fixed;
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			max-width: none;
			max-height: 40vh;
			border-radius: var(--radius-2) var(--radius-2) 0 0;
			border-bottom: none;
		}
	}
</style>
