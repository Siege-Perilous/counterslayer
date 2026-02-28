<script lang="ts">
	import { browser } from '$app/environment';
	import { PaneGroup, Pane, PaneResizer, type PaneAPI } from 'paneforge';
	import {
		Button,
		Icon,
		InputCheckbox,
		InputSlider,
		Select,
		Popover,
		Hr,
		FormControl,
		Loader
	} from '@tableslayer/ui';
	import {
		IconChevronDown,
		IconChevronLeft,
		IconChevronRight,
		IconChevronUp
	} from '@tabler/icons-svelte';
	import NavigationMenu from '$lib/components/NavigationMenu.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import {
		createCounterTray,
		getCounterPositions,
		type CounterStack
	} from '$lib/models/counterTray';
	import { arrangeTrays, calculateTraySpacers } from '$lib/models/box';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import {
		getGeometryWorker,
		type TrayGeometryData,
		type BoxGeometryData
	} from '$lib/utils/geometryWorker';
	import {
		exportPdfReference,
		exportPdfWithScreenshots,
		type TrayScreenshot
	} from '$lib/utils/pdfGenerator';
	import type { CaptureOptions } from '$lib/utils/screenshotCapture';
	import {
		initProject,
		getSelectedTray,
		getSelectedBox,
		getProject,
		importProject,
		resetProject,
		getCumulativeTrayLetter
	} from '$lib/stores/project.svelte';
	import type { Project } from '$lib/types/project';
	import type { BufferGeometry } from 'three';
	import { onDestroy } from 'svelte';

	type ViewMode = 'tray' | 'all' | 'exploded' | 'all-no-lid';
	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface CommunityProject {
		id: string;
		name: string;
		author: string;
		file: string;
	}

	// Mobile detection
	$effect(() => {
		if (browser) {
			const mediaQuery = window.matchMedia('(max-width: 768px)');
			isMobile = mediaQuery.matches;

			const handleChange = (e: MediaQueryListEvent) => {
				isMobile = e.matches;
			};

			mediaQuery.addEventListener('change', handleChange);
			return () => mediaQuery.removeEventListener('change', handleChange);
		}
	});

	let viewMode = $state<ViewMode>('all-no-lid');
	let selectionType = $state<SelectionType>('dimensions');
	let isEditorCollapsed = $state(false);
	let editorPane: PaneAPI;
	let mobileNavPane: PaneAPI;
	let mobileEditorPane: PaneAPI;
	let isMobileNavCollapsed = $state(true);
	let isMobileEditorCollapsed = $state(true);
	let mobileNavSize = $state(0); // Track nav size for restore
	let mobileEditorSize = $state(0); // Track editor size for restore
	const MOBILE_PANEL_DEFAULT_SIZE = 25;
	let selectedTrayGeometry = $state<BufferGeometry | null>(null);
	let selectedTrayCounters = $state<CounterStack[]>([]);
	let allTrayGeometries = $state<TrayGeometryData[]>([]);
	let allBoxGeometries = $state<BoxGeometryData[]>([]);
	let boxGeometry = $state<BufferGeometry | null>(null);
	let lidGeometry = $state<BufferGeometry | null>(null);
	let generating = $state(false);
	let geometryWorker = getGeometryWorker();
	let error = $state('');
	let isDirty = $state(false);
	let lastGeneratedHash = $state('');
	let jsonFileInput = $state<HTMLInputElement | null>(null);
	let explosionAmount = $state(50);
	let showCounters = $state(false);
	let communityProjects = $state<CommunityProject[]>([]);
	let showReferenceLabels = $state(false);
	let hidePrintBed = $state(false);
	let isMobile = $state(false);
	let captureFunction = $state<
		(((options: CaptureOptions) => string) & { setCaptureMode?: (mode: boolean) => void }) | null
	>(null);
	let exportingPdf = $state(false);
	let captureTrayLetter = $state<string | null>(null); // Override during PDF export

	// Initialize project from localStorage and fetch community projects
	$effect(() => {
		if (browser) {
			initProject();
			// Fetch community projects manifest
			fetch('/projects/manifest.json')
				.then((res) => res.json())
				.then((data) => {
					communityProjects = data.projects ?? [];
				})
				.catch((err) => {
					console.error('Failed to load community projects:', err);
				});
		}
	});

	async function loadCommunityProject(project: CommunityProject) {
		try {
			const res = await fetch(`/projects/${project.file}`);
			const data = (await res.json()) as Project;
			importProject(data);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load project';
			console.error('Load community project error:', e);
		}
	}

	let selectedTray = $derived(getSelectedTray());
	let selectedBox = $derived(getSelectedBox());
	let printBedSize = $derived(selectedTray?.params.printBedSize ?? 256);
	let selectedTrayLetter = $derived.by(() => {
		// Use override during PDF capture
		if (captureTrayLetter) return captureTrayLetter;
		const proj = getProject();
		if (!selectedBox || !selectedTray) return 'A';
		const boxIdx = proj.boxes.findIndex((b: { id: string }) => b.id === selectedBox.id);
		const trayIdx = selectedBox.trays.findIndex((t) => t.id === selectedTray.id);
		if (boxIdx < 0 || trayIdx < 0) return 'A';
		return getCumulativeTrayLetter(proj.boxes, boxIdx, trayIdx);
	});

	// Title for the print bed based on current view
	let viewTitle = $derived.by(() => {
		if (viewMode === 'tray') {
			return selectedTray?.name ?? '';
		}
		// For box views (all, exploded), show box name
		return selectedBox?.name ?? '';
	});

	// Compute which geometries to show based on view mode
	let visibleGeometries = $derived.by(() => {
		const result: {
			tray: BufferGeometry | null;
			allTrays: TrayGeometryData[];
			allBoxes: BoxGeometryData[];
			box: BufferGeometry | null;
			lid: BufferGeometry | null;
			exploded: boolean;
			showAllTrays: boolean;
			showAllBoxes: boolean;
		} = {
			tray: null,
			allTrays: [],
			allBoxes: [],
			box: null,
			lid: null,
			exploded: false,
			showAllTrays: false,
			showAllBoxes: false
		};

		switch (viewMode) {
			case 'tray':
				result.tray = selectedTrayGeometry;
				break;
			case 'all':
				result.allTrays = allTrayGeometries;
				result.box = boxGeometry;
				result.lid = lidGeometry;
				result.showAllTrays = true;
				break;
			case 'all-no-lid':
				// Show all boxes together without lids (default view / dimensions view)
				result.allBoxes = allBoxGeometries;
				result.showAllBoxes = true;
				break;
			case 'exploded':
				result.allTrays = allTrayGeometries;
				result.box = boxGeometry;
				result.lid = lidGeometry;
				result.exploded = true;
				result.showAllTrays = true;
				break;
		}
		return result;
	});

	// Handle selection type changes - update view mode accordingly
	function handleSelectionChange(type: SelectionType) {
		selectionType = type;
		switch (type) {
			case 'dimensions':
				viewMode = 'all-no-lid';
				break;
			case 'box':
				viewMode = 'exploded';
				break;
			case 'tray':
				viewMode = 'tray';
				break;
		}
	}

	function handleExpandPanel() {
		if (isEditorCollapsed && editorPane) {
			editorPane.expand();
		}
	}

	function handleToggleCollapse() {
		if (editorPane) {
			if (isEditorCollapsed) {
				editorPane.expand();
			} else {
				editorPane.collapse();
			}
		}
	}

	function handleToggleMobileNav() {
		if (mobileNavPane) {
			if (isMobileNavCollapsed) {
				// Expand: restore to default or last size
				mobileNavPane.resize(mobileNavSize > 5 ? mobileNavSize : MOBILE_PANEL_DEFAULT_SIZE);
				isMobileNavCollapsed = false;
			} else {
				// Collapse: save current size, then resize to 0
				mobileNavSize = mobileNavPane.getSize();
				mobileNavPane.resize(0);
				isMobileNavCollapsed = true;
			}
		}
	}

	function handleToggleMobileEditor() {
		if (mobileEditorPane) {
			if (isMobileEditorCollapsed) {
				// Expand: restore to default or last size
				mobileEditorPane.resize(
					mobileEditorSize > 5 ? mobileEditorSize : MOBILE_PANEL_DEFAULT_SIZE
				);
				isMobileEditorCollapsed = false;
			} else {
				// Collapse: save current size, then resize to 0
				mobileEditorSize = mobileEditorPane.getSize();
				mobileEditorPane.resize(0);
				isMobileEditorCollapsed = true;
			}
		}
	}

	async function regenerate(force = false) {
		if (!browser) return;

		const project = getProject();
		const box = getSelectedBox();
		const tray = getSelectedTray();

		if (!box || !tray) {
			error = 'No box or tray selected';
			return;
		}

		// Check if cache is still valid (hash matches what was used to generate it)
		const cacheValid = lastGeneratedHash && currentStateHash === lastGeneratedHash;

		// If cache valid and not forced, try to use cached geometry
		if (cacheValid && !force && allBoxGeometries.length > 0) {
			// Find the selected box in the all-boxes cache
			const cachedBox = allBoxGeometries.find((b) => b.boxId === box.id);
			if (cachedBox) {
				// Find the selected tray within this box
				const cachedTray = cachedBox.trayGeometries.find((t) => t.trayId === tray.id);
				if (cachedTray) {
					// Use cached data for this box
					selectedTrayGeometry = cachedTray.geometry;
					selectedTrayCounters = cachedTray.counterStacks;
					allTrayGeometries = cachedBox.trayGeometries;
					boxGeometry = cachedBox.boxGeometry;
					lidGeometry = cachedBox.lidGeometry;
					return;
				}
			}
		}

		generating = true;
		error = '';

		try {
			// Use web worker for geometry generation (non-blocking)
			const result = await geometryWorker.generate(project, box.id, tray.id);

			selectedTrayGeometry = result.selectedTrayGeometry;
			selectedTrayCounters = result.selectedTrayCounters;
			allTrayGeometries = result.allTrayGeometries;
			boxGeometry = result.boxGeometry;
			lidGeometry = result.lidGeometry;
			allBoxGeometries = result.allBoxGeometries;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
			console.error('Generation error:', e);
		} finally {
			generating = false;
			isDirty = false;
			lastGeneratedHash = currentStateHash;
		}
	}

	async function handleExport() {
		if (!selectedTrayGeometry) return;

		try {
			const { data, filename } = await geometryWorker.exportTrayStl();
			downloadStl(data, filename);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
			console.error('Export error:', e);
		}
	}

	async function handleExportAll() {
		const box = getSelectedBox();
		if (!box) return;

		try {
			// Export box
			if (boxGeometry) {
				const { data, filename } = await geometryWorker.exportBoxStl();
				downloadStl(data, filename);
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Export lid
			if (lidGeometry) {
				const { data, filename } = await geometryWorker.exportLidStl();
				downloadStl(data, filename);
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Export all trays
			for (let i = 0; i < allTrayGeometries.length; i++) {
				const { data, filename } = await geometryWorker.exportTrayByIndexStl(i);
				downloadStl(data, filename);
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
			console.error('Export error:', e);
		}
	}

	function downloadStl(data: ArrayBuffer, filename: string) {
		const blob = new Blob([data], { type: 'application/octet-stream' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleExportPdf() {
		const project = getProject();
		if (project.boxes.length === 0) return;

		// If we don't have a capture function yet, fall back to SVG-based PDF
		if (!captureFunction) {
			await exportPdfReference(project);
			return;
		}

		exportingPdf = true;
		error = '';

		try {
			const screenshots: TrayScreenshot[] = [];

			// Save current state
			const savedViewMode = viewMode;
			const savedShowCounters = showCounters;
			const savedShowReferenceLabels = showReferenceLabels;
			const savedHidePrintBed = hidePrintBed;
			const savedGeometry = selectedTrayGeometry;
			const savedCounters = selectedTrayCounters;

			// Set up for capture mode
			viewMode = 'tray';
			showCounters = true;
			showReferenceLabels = true;
			hidePrintBed = true;

			// Capture each tray
			for (let boxIdx = 0; boxIdx < project.boxes.length; boxIdx++) {
				const box = project.boxes[boxIdx];
				const placements = arrangeTrays(box.trays, {
					customBoxWidth: box.customWidth,
					wallThickness: box.wallThickness,
					tolerance: box.tolerance
				});
				const spacerInfo = calculateTraySpacers(box);
				const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

				for (let trayIdx = 0; trayIdx < placements.length; trayIdx++) {
					const placement = placements[trayIdx];
					const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
					const spacerHeight = spacer?.floorSpacerHeight ?? 0;
					const trayLetter = getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);

					// Generate geometry for this tray
					const jscadGeom = createCounterTray(
						placement.tray.params,
						placement.tray.name,
						maxHeight,
						spacerHeight
					);

					// Set up scene for this tray
					selectedTrayGeometry = jscadToBufferGeometry(jscadGeom);
					selectedTrayCounters = getCounterPositions(
						placement.tray.params,
						maxHeight,
						spacerHeight
					);
					captureTrayLetter = trayLetter;

					// Enable capture mode for fixed top-down label rotation
					captureFunction.setCaptureMode?.(true);

					// Wait for render (multiple frames to ensure geometry and text labels are loaded)
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => setTimeout(r, 200));

					// Capture screenshot at 2x resolution for print quality (16:9 widescreen for long trays)
					const dataUrl = captureFunction({
						width: 1920,
						height: 1080,
						backgroundColor: '#f0f0f0',
						bounds: {
							width: placement.dimensions.width,
							depth: placement.dimensions.depth,
							height: placement.dimensions.height
						}
					});

					screenshots.push({
						boxIndex: boxIdx,
						trayIndex: trayIdx,
						trayLetter,
						dataUrl
					});
				}
			}

			// Restore original state
			captureFunction.setCaptureMode?.(false);
			viewMode = savedViewMode;
			showCounters = savedShowCounters;
			showReferenceLabels = savedShowReferenceLabels;
			hidePrintBed = savedHidePrintBed;
			selectedTrayGeometry = savedGeometry;
			selectedTrayCounters = savedCounters;
			captureTrayLetter = null;

			// Wait for state to restore
			await new Promise((r) => requestAnimationFrame(r));

			// Generate PDF with screenshots
			await exportPdfWithScreenshots(project, screenshots);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to export PDF';
			console.error('PDF export error:', e);
		} finally {
			exportingPdf = false;
		}
	}

	function handleExportJson() {
		const project = getProject();
		const json = JSON.stringify(project, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'counter-tray-project.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportJson(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text) as Project;
			importProject(data);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to import JSON';
			console.error('Import JSON error:', e);
		}

		input.value = '';
	}

	// Create a hash of current state to detect changes (includes all boxes for multi-box view)
	let currentStateHash = $derived.by(() => {
		const project = getProject();
		if (project.boxes.length === 0) return '';
		return JSON.stringify({
			boxes: project.boxes.map((box) => ({
				id: box.id,
				tolerance: box.tolerance,
				wallThickness: box.wallThickness,
				floorThickness: box.floorThickness,
				lidParams: box.lidParams,
				customWidth: box.customWidth,
				customBoxHeight: box.customBoxHeight,
				fillSolidEmpty: box.fillSolidEmpty,
				trays: box.trays.map((t) => ({ id: t.id, params: t.params }))
			}))
		});
	});

	// Track dirty state when params change after generation
	$effect(() => {
		if (currentStateHash && lastGeneratedHash && currentStateHash !== lastGeneratedHash) {
			isDirty = true;
		}
	});

	// Generate on mount (forced) and when tray/box selection changes (uses cache if not dirty)
	let hasInitialized = false;
	$effect(() => {
		if (browser && selectedTray && selectedBox) {
			if (!hasInitialized) {
				hasInitialized = true;
				regenerate(true); // Force on initial load
			} else {
				regenerate(); // Use cache if not dirty
			}
		}
	});

	function handleReset() {
		if (confirm('Reset project to defaults? This will delete all boxes and trays.')) {
			resetProject();
		}
	}

	// Cleanup worker on component destroy
	onDestroy(() => {
		geometryWorker.terminate();
	});
</script>

<svelte:head>
	<title>Counter Tray Generator</title>
</svelte:head>

{#if isMobile}
	<!-- MOBILE LAYOUT: Vertical PaneGroup with manual collapse control -->
	<PaneGroup direction="vertical" class="paneGroup">
		<!-- Mobile Nav Pane (top) -->
		<Pane defaultSize={0} minSize={0} maxSize={50} bind:this={mobileNavPane}>
			<div class="mobilePanelContent">
				<NavigationMenu
					{selectionType}
					onSelectionChange={handleSelectionChange}
					onExpandPanel={() => {}}
					{isMobile}
				/>
			</div>
		</Pane>

		<!-- Nav Resizer -->
		<PaneResizer class="resizer resizer--mobile">
			<button
				class="mobileCollapseBtn"
				onclick={handleToggleMobileNav}
				aria-label={isMobileNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
			>
				<Icon Icon={isMobileNavCollapsed ? IconChevronDown : IconChevronUp} />
			</button>
		</PaneResizer>

		<!-- Mobile Main View (center) -->
		<Pane defaultSize={100} minSize={20}>
			<main class="mainView">
				{#if browser}
					{#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
						<TrayViewer
							geometry={visibleGeometries.tray}
							allTrays={visibleGeometries.allTrays}
							allBoxes={visibleGeometries.allBoxes}
							boxGeometry={visibleGeometries.box}
							lidGeometry={visibleGeometries.lid}
							{printBedSize}
							exploded={visibleGeometries.exploded}
							showAllTrays={visibleGeometries.showAllTrays}
							showAllBoxes={visibleGeometries.showAllBoxes}
							boxWallThickness={selectedBox?.wallThickness ?? 3}
							boxTolerance={selectedBox?.tolerance ?? 0.5}
							boxFloorThickness={selectedBox?.floorThickness ?? 2}
							{explosionAmount}
							{showCounters}
							{selectedTrayCounters}
							{selectedTrayLetter}
							selectedTrayId={selectedTray?.id ?? ''}
							triangleCornerRadius={1.5}
							{showReferenceLabels}
							{hidePrintBed}
							{viewTitle}
							onCaptureReady={(fn) => (captureFunction = fn)}
						/>
					{/await}
				{/if}

				{#if generating}
					<div class="generatingOverlay">
						<Loader />
						<div class="generatingText">Generating geometry...</div>
					</div>
				{/if}

				{#if viewMode === 'exploded'}
					<div class="viewToolbar">
						<div class="sliderContainer">
							<span class="sliderLabel">Explode</span>
							<InputSlider min={0} max={100} bind:value={explosionAmount} />
						</div>
					</div>
				{/if}

				<div class="bottomToolbar">
					<input
						bind:this={jsonFileInput}
						type="file"
						accept=".json"
						onchange={handleImportJson}
						style="display: none;"
					/>
					<Popover positioning={{ placement: 'top-start' }}>
						{#snippet trigger()}
							<Button variant="special">
								Import / Export
								<Icon Icon={IconChevronDown} />
							</Button>
						{/snippet}
						{#snippet content()}
							<div class="popoverMenu">
								{#if communityProjects.length > 0}
									<FormControl label="Load community project" name="communityProject">
										{#snippet input({ inputProps })}
											<Select
												selected={[]}
												options={communityProjects.map((p) => ({ value: p.id, label: p.name }))}
												onSelectedChange={(selected) => {
													const project = communityProjects.find((p) => p.id === selected[0]);
													if (project) {
														loadCommunityProject(project);
													}
												}}
												{...inputProps}
											/>
										{/snippet}
									</FormControl>
									<Hr />
								{/if}
								<Button
									variant="ghost"
									onclick={() => jsonFileInput?.click()}
									style="width: 100%; justify-content: flex-start;"
								>
									Import project JSON
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportJson}
									style="width: 100%; justify-content: flex-start;"
								>
									Export project JSON
								</Button>
								<Hr />
								<Button
									variant="ghost"
									onclick={handleExport}
									disabled={generating || !selectedTrayGeometry}
									style="width: 100%; justify-content: flex-start;"
								>
									Export tray STL
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportAll}
									disabled={generating ||
										(!boxGeometry && !lidGeometry && allTrayGeometries.length === 0)}
									style="width: 100%; justify-content: flex-start;"
								>
									Export all STLs
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportPdf}
									disabled={getProject().boxes.length === 0 || exportingPdf}
									isLoading={exportingPdf}
									style="width: 100%; justify-content: flex-start;"
								>
									{exportingPdf ? 'Generating PDF...' : 'PDF reference'}
								</Button>
								<Hr />
								<Button
									variant="danger"
									onclick={handleReset}
									style="width: 100%; justify-content: flex-start;"
								>
									Clear current project
								</Button>
							</div>
						{/snippet}
					</Popover>
					<div class="toolbarRight">
						<span
							class="regenerateButton {isDirty && !generating ? 'regenerateButton--dirty' : ''}"
						>
							<Button
								variant="primary"
								onclick={() => regenerate(true)}
								isDisabled={generating}
								isLoading={generating}
							>
								Regenerate
							</Button>
						</span>
					</div>
				</div>

				{#if error}
					<div class="errorBanner">
						{error}
					</div>
				{/if}
			</main>
		</Pane>

		<!-- Editor Resizer -->
		<PaneResizer class="resizer resizer--mobile resizer--bottom">
			<button
				class="mobileCollapseBtn"
				onclick={handleToggleMobileEditor}
				aria-label={isMobileEditorCollapsed ? 'Expand editor' : 'Collapse editor'}
			>
				<Icon Icon={isMobileEditorCollapsed ? IconChevronUp : IconChevronDown} />
			</button>
		</PaneResizer>

		<!-- Mobile Editor Pane (bottom) -->
		<Pane defaultSize={0} minSize={0} maxSize={60} bind:this={mobileEditorPane}>
			<div class="mobilePanelContent">
				<EditorPanel {selectionType} />
			</div>
		</Pane>
	</PaneGroup>
{:else}
	<!-- DESKTOP LAYOUT: PaneGroup with resizable panels -->
	<NavigationMenu
		{selectionType}
		onSelectionChange={handleSelectionChange}
		onExpandPanel={handleExpandPanel}
		{isMobile}
	/>

	<PaneGroup direction="horizontal" class="paneGroup">
		<Pane defaultSize={75} minSize={30}>
			<main class="mainView">
				{#if browser}
					{#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
						<TrayViewer
							geometry={visibleGeometries.tray}
							allTrays={visibleGeometries.allTrays}
							allBoxes={visibleGeometries.allBoxes}
							boxGeometry={visibleGeometries.box}
							lidGeometry={visibleGeometries.lid}
							{printBedSize}
							exploded={visibleGeometries.exploded}
							showAllTrays={visibleGeometries.showAllTrays}
							showAllBoxes={visibleGeometries.showAllBoxes}
							boxWallThickness={selectedBox?.wallThickness ?? 3}
							boxTolerance={selectedBox?.tolerance ?? 0.5}
							boxFloorThickness={selectedBox?.floorThickness ?? 2}
							{explosionAmount}
							{showCounters}
							{selectedTrayCounters}
							{selectedTrayLetter}
							selectedTrayId={selectedTray?.id ?? ''}
							triangleCornerRadius={1.5}
							{showReferenceLabels}
							{hidePrintBed}
							{viewTitle}
							onCaptureReady={(fn) => (captureFunction = fn)}
						/>
					{/await}
				{/if}

				{#if generating}
					<div class="generatingOverlay">
						<Loader />
						<div class="generatingText">Generating geometry...</div>
					</div>
				{/if}

				{#if viewMode === 'exploded'}
					<div class="viewToolbar">
						<div class="sliderContainer">
							<span class="sliderLabel">Explode</span>
							<InputSlider min={0} max={100} bind:value={explosionAmount} />
						</div>
					</div>
				{/if}

				<div class="bottomToolbar">
					<input
						bind:this={jsonFileInput}
						type="file"
						accept=".json"
						onchange={handleImportJson}
						style="display: none;"
					/>
					<Popover positioning={{ placement: 'top-start' }}>
						{#snippet trigger()}
							<Button variant="special">
								Import / Export
								<Icon Icon={IconChevronDown} />
							</Button>
						{/snippet}
						{#snippet content()}
							<div class="popoverMenu">
								{#if communityProjects.length > 0}
									<FormControl label="Load community project" name="communityProject">
										{#snippet input({ inputProps })}
											<Select
												selected={[]}
												options={communityProjects.map((p) => ({ value: p.id, label: p.name }))}
												onSelectedChange={(selected) => {
													const project = communityProjects.find((p) => p.id === selected[0]);
													if (project) {
														loadCommunityProject(project);
													}
												}}
												{...inputProps}
											/>
										{/snippet}
									</FormControl>
									<Hr />
								{/if}
								<Button
									variant="ghost"
									onclick={() => jsonFileInput?.click()}
									style="width: 100%; justify-content: flex-start;"
								>
									Import project JSON
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportJson}
									style="width: 100%; justify-content: flex-start;"
								>
									Export project JSON
								</Button>
								<Hr />
								<Button
									variant="ghost"
									onclick={handleExport}
									disabled={generating || !selectedTrayGeometry}
									style="width: 100%; justify-content: flex-start;"
								>
									Export tray STL
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportAll}
									disabled={generating ||
										(!boxGeometry && !lidGeometry && allTrayGeometries.length === 0)}
									style="width: 100%; justify-content: flex-start;"
								>
									Export all STLs
								</Button>
								<Button
									variant="ghost"
									onclick={handleExportPdf}
									disabled={getProject().boxes.length === 0 || exportingPdf}
									isLoading={exportingPdf}
									style="width: 100%; justify-content: flex-start;"
								>
									{exportingPdf ? 'Generating PDF...' : 'PDF reference'}
								</Button>
								<Hr />
								<Button
									variant="danger"
									onclick={handleReset}
									style="width: 100%; justify-content: flex-start;"
								>
									Clear current project
								</Button>
							</div>
						{/snippet}
					</Popover>
					<div class="toolbarRight">
						<InputCheckbox
							checked={showCounters}
							onchange={(e) => (showCounters = e.currentTarget.checked)}
							label="Preview counters"
						/>
						<InputCheckbox
							checked={showReferenceLabels}
							onchange={(e) => (showReferenceLabels = e.currentTarget.checked)}
							label="Preview labels"
						/>
						<span
							class="regenerateButton {isDirty && !generating ? 'regenerateButton--dirty' : ''}"
						>
							<Button
								variant="primary"
								onclick={() => regenerate(true)}
								isDisabled={generating}
								isLoading={generating}
							>
								Regenerate
							</Button>
						</span>
					</div>
				</div>

				{#if error}
					<div class="errorBanner">
						{error}
					</div>
				{/if}
			</main>
		</Pane>

		<PaneResizer class="resizer">
			<button
				class="resizer__handle"
				aria-label={isEditorCollapsed ? 'Expand editor panel' : 'Collapse editor panel'}
				title={isEditorCollapsed ? 'Expand editor panel' : 'Collapse editor panel'}
				onclick={handleToggleCollapse}
			>
				<Icon Icon={isEditorCollapsed ? IconChevronLeft : IconChevronRight} />
			</button>
		</PaneResizer>

		<Pane
			defaultSize={25}
			minSize={15}
			maxSize={50}
			collapsible={true}
			collapsedSize={0}
			bind:this={editorPane}
			onCollapse={() => (isEditorCollapsed = true)}
			onExpand={() => (isEditorCollapsed = false)}
		>
			<EditorPanel {selectionType} />
		</Pane>
	</PaneGroup>
{/if}

<style>
	:global(.paneGroup) {
		flex: 1;
		min-height: 0;
	}

	.mainView {
		height: 100%;
		position: relative;
	}

	.viewToolbar {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sliderContainer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius-2);
		background: var(--contrastLowest);
	}

	.sliderLabel {
		font-size: 0.75rem;
		color: var(--fgMuted);
	}

	.bottomToolbar {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.toolbarLeft,
	.toolbarRight {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.popoverMenu {
		width: 13rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.errorBanner {
		position: absolute;
		top: 4rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 1rem;
		border-radius: var(--radius-2);
		background: var(--danger-900);
		color: var(--danger-200);
		font-size: 0.875rem;
	}

	.generatingOverlay {
		position: absolute;
		inset: 0;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
	}

	.generatingText {
		font-size: 1.125rem;
	}

	/* Resizer styling */
	:global(.resizer) {
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 1rem;
		z-index: 2;
		background: var(--contrastEmpty);
		border-left: var(--borderThin);
	}

	.resizer__handle {
		position: absolute;
		right: 100%;
		width: 100%;
		height: 2rem;
		cursor: pointer;
		background: var(--contrastMedium);
		margin-top: 1.5rem;
		transition: background 0.2s;
		display: flex;
		justify-content: center;
		align-items: center;
		border: none;
		color: var(--fgMuted);
	}

	:global(.resizer:hover) .resizer__handle {
		background: var(--fg);
		color: var(--bg);
	}

	/* Mobile Layout */
	.mobilePanelContent {
		height: 100%;
		overflow-y: auto;
		background: var(--bg);
	}

	/* Mobile collapse button (centered in resizer) */
	.mobileCollapseBtn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 100%;
		background: var(--contrastMedium);
		border: none;
		color: var(--fgMuted);
		cursor: pointer;
	}

	.mobileCollapseBtn:hover {
		background: var(--fg);
		color: var(--bg);
	}

	/* Mobile responsive styles */
	@media (max-width: 768px) {
		.bottomToolbar {
			left: 0.5rem;
			right: 0.5rem;
			bottom: 0.5rem;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.toolbarLeft,
		.toolbarRight {
			flex-wrap: wrap;
		}

		:global(.resizer--mobile) {
			width: 100% !important;
			height: 1.5rem !important;
			border-left: none !important;
			border-top: var(--borderThin);
			cursor: row-resize;
			background: var(--contrastLowest);
			display: flex !important;
			align-items: center !important;
			justify-content: center !important;
		}

		:global(.resizer--bottom) {
			border-top: none;
			border-bottom: var(--borderThin);
		}

		/* Remove margin and border from editor panel on mobile */
		:global(.editorPanelInner) {
			margin: 0 !important;
			border: none !important;
			border-radius: 0 !important;
		}
	}

	/* Regenerate button dirty state animation */
	.regenerateButton {
		display: contents;
	}

	.regenerateButton--dirty :global(button) {
		animation: wigglePing 3s ease-in-out infinite;
	}

	@keyframes wigglePing {
		0%,
		10%,
		100% {
			transform: rotate(0deg);
		}
		2% {
			transform: rotate(-2deg);
			border: var(--btn-borderHover);
			background: var(--btn-bgSpecial);
		}
		4% {
			transform: rotate(2deg);
			border: var(--btn-borderHover);
			background: var(--btn-bgSpecial);
		}
		6% {
			transform: rotate(-2deg);
			border: var(--btn-borderHover);
			background: var(--btn-bgSpecial);
		}
		8% {
			transform: rotate(2deg);
			border: var(--btn-borderHover);
			background: var(--btn-bgSpecial);
		}
	}
</style>
