<script lang="ts">
	import { browser } from '$app/environment';
	import { PaneGroup, Pane, PaneResizer, type PaneAPI } from 'paneforge';
	import {
		Button,
		IconButton,
		Icon,
		InputCheckbox,
		Select,
		Popover,
		Hr,
		Link,
		FormControl,
		Loader
	} from '@tableslayer/ui';
	import {
		IconSun,
		IconMoon,
		IconChevronDown,
		IconChevronLeft,
		IconChevronRight
	} from '@tabler/icons-svelte';
	import NavigationMenu from '$lib/components/NavigationMenu.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import {
		createCounterTray,
		getCounterPositions,
		type CounterStack
	} from '$lib/models/counterTray';
	import { createBoxWithLidGrooves, createLid } from '$lib/models/lid';
	import {
		arrangeTrays,
		validateCustomDimensions,
		calculateTraySpacers,
		getBoxDimensions,
		arrangeBoxes,
		type TrayPlacement
	} from '$lib/models/box';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import { exportStl } from '$lib/utils/exportStl';
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
		resetProject
	} from '$lib/stores/project.svelte';
	import type { Project } from '$lib/types/project';
	import type { BufferGeometry } from 'three';
	import type { Geom3 } from '@jscad/modeling/src/geometries/types';
	import { setContext } from 'svelte';

	type ViewMode = 'tray' | 'all' | 'exploded' | 'all-no-lid';
	type SelectionType = 'dimensions' | 'box' | 'tray';

	interface CommunityProject {
		id: string;
		name: string;
		author: string;
		file: string;
	}

	interface TrayGeometryData {
		trayId: string;
		name: string;
		geometry: BufferGeometry;
		jscadGeom: Geom3;
		placement: TrayPlacement;
		counterStacks: CounterStack[];
		trayLetter: string;
	}

	interface BoxGeometryData {
		boxId: string;
		boxName: string;
		boxGeometry: BufferGeometry | null;
		trayGeometries: TrayGeometryData[];
		boxDimensions: { width: number; depth: number; height: number };
	}

	// Theme state - get from context if available, otherwise use local state
	let mode = $state<'light' | 'dark'>('dark');

	// Initialize mode from localStorage
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem('counterslayer-theme');
			if (saved === 'light' || saved === 'dark') {
				mode = saved;
			}
		}
	});

	function toggleTheme() {
		mode = mode === 'dark' ? 'light' : 'dark';
		if (browser) {
			localStorage.setItem('counterslayer-theme', mode);
		}
	}

	// Set context for child components
	setContext('theme', {
		get mode() {
			return mode;
		},
		toggle: toggleTheme
	});

	let viewMode = $state<ViewMode>('all-no-lid');
	let selectionType = $state<SelectionType>('dimensions');
	let isEditorCollapsed = $state(false);
	let editorPane: PaneAPI;
	let selectedTrayGeometry = $state<BufferGeometry | null>(null);
	let selectedTrayCounters = $state<CounterStack[]>([]);
	let allTrayGeometries = $state<TrayGeometryData[]>([]);
	let allBoxGeometries = $state<BoxGeometryData[]>([]);
	let boxGeometry = $state<BufferGeometry | null>(null);
	let lidGeometry = $state<BufferGeometry | null>(null);
	let jscadSelectedTray = $state<Geom3 | null>(null);
	let jscadBox = $state<Geom3 | null>(null);
	let jscadLid = $state<Geom3 | null>(null);
	let generating = $state(false);
	let error = $state('');
	let isDirty = $state(false);
	let lastGeneratedHash = $state('');
	let jsonFileInput = $state<HTMLInputElement | null>(null);
	let explosionAmount = $state(0);
	let showCounters = $state(false);
	let communityProjects = $state<CommunityProject[]>([]);
	let showReferenceLabels = $state(false);
	let hidePrintBed = $state(false);
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
		if (!selectedBox || !selectedTray) return 'A';
		const idx = selectedBox.trays.findIndex((t) => t.id === selectedTray.id);
		return String.fromCharCode(65 + (idx >= 0 ? idx : 0));
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

	async function regenerate() {
		if (!browser) return;

		const project = getProject();
		const box = getSelectedBox();
		const tray = getSelectedTray();

		if (!box || !tray) {
			error = 'No box or tray selected';
			return;
		}

		generating = true;
		error = '';

		await new Promise((resolve) => setTimeout(resolve, 10));

		try {
			// Validate custom dimensions before generation
			const validation = validateCustomDimensions(box);
			if (!validation.valid) {
				error = validation.errors.join('; ');
				generating = false;
				return;
			}

			// Generate all trays with their placements for selected box
			const placements = arrangeTrays(box.trays, {
				customBoxWidth: box.customWidth,
				wallThickness: box.wallThickness,
				tolerance: box.tolerance
			});

			// Calculate floor spacers for each tray (for custom box height)
			const spacerInfo = calculateTraySpacers(box);

			// Calculate max height so all trays are normalized to box interior height
			const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

			// Find spacer for selected tray
			const selectedSpacer = spacerInfo.find((s) => s.trayId === tray.id);
			const selectedSpacerHeight = selectedSpacer?.floorSpacerHeight ?? 0;

			// Generate selected tray at box height (all trays in a box share the same height)
			jscadSelectedTray = createCounterTray(
				tray.params,
				tray.name,
				maxHeight,
				selectedSpacerHeight
			);
			selectedTrayGeometry = jscadToBufferGeometry(jscadSelectedTray);
			selectedTrayCounters = getCounterPositions(tray.params, maxHeight, selectedSpacerHeight);

			// Generate all trays at box height with floor spacers (for selected box)
			allTrayGeometries = placements.map((placement, index) => {
				const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
				const spacerHeight = spacer?.floorSpacerHeight ?? 0;
				const jscadGeom = createCounterTray(
					placement.tray.params,
					placement.tray.name,
					maxHeight,
					spacerHeight
				);
				return {
					trayId: placement.tray.id,
					name: placement.tray.name,
					geometry: jscadToBufferGeometry(jscadGeom),
					jscadGeom,
					placement,
					counterStacks: getCounterPositions(placement.tray.params, maxHeight, spacerHeight),
					trayLetter: String.fromCharCode(65 + index)
				};
			});

			// Generate box with lid grooves (for selected box)
			jscadBox = createBoxWithLidGrooves(box);
			boxGeometry = jscadBox ? jscadToBufferGeometry(jscadBox) : null;

			// Generate lid (for selected box)
			jscadLid = createLid(box);
			lidGeometry = jscadLid ? jscadToBufferGeometry(jscadLid) : null;

			// Generate geometries for ALL boxes (for all-no-lid view)
			allBoxGeometries = project.boxes.map((projectBox) => {
				// Validate box dimensions
				const boxValidation = validateCustomDimensions(projectBox);
				if (!boxValidation.valid) {
					console.warn(`Box "${projectBox.name}" validation failed:`, boxValidation.errors);
				}

				// Generate box geometry
				const boxJscad = createBoxWithLidGrooves(projectBox);
				const boxBufferGeom = boxJscad ? jscadToBufferGeometry(boxJscad) : null;

				// Get box dimensions
				const boxDims = getBoxDimensions(projectBox);

				// Generate tray placements and geometries for this box
				const boxPlacements = arrangeTrays(projectBox.trays, {
					customBoxWidth: projectBox.customWidth,
					wallThickness: projectBox.wallThickness,
					tolerance: projectBox.tolerance
				});

				const boxSpacerInfo = calculateTraySpacers(projectBox);
				const boxMaxHeight = Math.max(...boxPlacements.map((p) => p.dimensions.height), 0);

				const trayGeoms: TrayGeometryData[] = boxPlacements.map((placement, index) => {
					const spacer = boxSpacerInfo.find((s) => s.trayId === placement.tray.id);
					const spacerHeight = spacer?.floorSpacerHeight ?? 0;
					const jscadGeom = createCounterTray(
						placement.tray.params,
						placement.tray.name,
						boxMaxHeight,
						spacerHeight
					);
					return {
						trayId: placement.tray.id,
						name: placement.tray.name,
						geometry: jscadToBufferGeometry(jscadGeom),
						jscadGeom,
						placement,
						counterStacks: getCounterPositions(placement.tray.params, boxMaxHeight, spacerHeight),
						trayLetter: String.fromCharCode(65 + index)
					};
				});

				return {
					boxId: projectBox.id,
					boxName: projectBox.name,
					boxGeometry: boxBufferGeom,
					trayGeometries: trayGeoms,
					boxDimensions: boxDims ?? { width: 0, depth: 0, height: 0 }
				};
			});
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
			console.error('Generation error:', e);
		} finally {
			generating = false;
			isDirty = false;
			lastGeneratedHash = currentStateHash;
		}
	}

	function handleExport() {
		if (!jscadSelectedTray) return;

		const tray = getSelectedTray();
		const filename = `${tray?.name.toLowerCase().replace(/\s+/g, '-') ?? 'tray'}.stl`;

		exportStl(jscadSelectedTray, filename);
	}

	async function handleExportAll() {
		const box = getSelectedBox();
		if (!box) return;

		const baseName = box.name.toLowerCase().replace(/\s+/g, '-');

		// Export box
		if (jscadBox) {
			exportStl(jscadBox, `${baseName}-box.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Export lid
		if (jscadLid) {
			exportStl(jscadLid, `${baseName}-lid.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Export all trays
		for (const trayData of allTrayGeometries) {
			const trayName = trayData.name.toLowerCase().replace(/\s+/g, '-');
			exportStl(trayData.jscadGeom, `${baseName}-${trayName}.stl`);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
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
					const trayLetter = String.fromCharCode(65 + trayIdx);

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
						trayLetter: String.fromCharCode(65 + trayIdx),
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

	// Generate on mount and when tray/box selection changes
	$effect(() => {
		if (browser && selectedTray && selectedBox) {
			regenerate();
		}
	});

	function handleReset() {
		if (confirm('Reset project to defaults? This will delete all boxes and trays.')) {
			resetProject();
		}
	}
</script>

<svelte:head>
	<title>Counter Tray Generator</title>
</svelte:head>

<div class="appContainer {mode}">
	<!-- Header -->
	<div class="appHeader">
		<div style="display: flex; align-items: center; gap: 0.25rem;">
			<h1 style="display: contents;">Counter Slayer</h1>
			by
			<Link href="https://davesnider.com" target="_blank" rel="noopener noreferrer"
				>Dave Snider</Link
			>
		</div>
		<div style="display: flex; align-items: center; gap: 0.75rem;">
			<Link href="https://youtu.be/82d_-vjFpKw" target="_blank" rel="noopener noreferrer"
				>Tutorial</Link
			>
			<Link
				href="https://github.com/Siege-Perilous/counterslayer"
				target="_blank"
				rel="noopener noreferrer">GitHub</Link
			>
			<IconButton variant="ghost" onclick={toggleTheme} size="sm">
				<Icon Icon={mode === 'dark' ? IconSun : IconMoon} />
			</IconButton>
		</div>
	</div>

	<div class="appContent">
		<!-- Navigation Menu (floating top-left) -->
		<NavigationMenu
			{selectionType}
			onSelectionChange={handleSelectionChange}
			onExpandPanel={handleExpandPanel}
		/>

		<PaneGroup direction="horizontal" class="paneGroup">
			<!-- Main 3D View Pane -->
			<Pane defaultSize={75} minSize={40}>
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
								triangleCornerRadius={selectedTray?.params.triangleCornerRadius ?? 1.5}
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

					<!-- Explosion slider (only visible when box is selected) -->
					{#if viewMode === 'exploded'}
						<div class="viewToolbar">
							<div class="sliderContainer">
								<span class="sliderLabel">Explode</span>
								<input
									type="range"
									min="0"
									max="100"
									bind:value={explosionAmount}
									class="rangeSlider"
								/>
							</div>
						</div>
					{/if}

					<!-- Bottom toolbar -->
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
										disabled={generating || !jscadSelectedTray}
										style="width: 100%; justify-content: flex-start;"
									>
										Export tray STL
									</Button>
									<Button
										variant="ghost"
										onclick={handleExportAll}
										disabled={generating ||
											(!jscadBox && !jscadLid && allTrayGeometries.length === 0)}
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
							<span class="regenerateButton {isDirty && !generating ? 'regenerateButton--dirty' : ''}">
								<Button
									variant="primary"
									onclick={regenerate}
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

			<!-- Resizer with collapse button -->
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

			<!-- Editor Panel Pane (collapsible) -->
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
	</div>
</div>

<style>
	.appContainer {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg);
		color: var(--fg);
	}

	.appHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: var(--borderThin);
		font-size: 0.875rem;
		color: var(--fgMuted);
		flex-shrink: 0;
	}

	.appContent {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

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

	.rangeSlider {
		height: 0.25rem;
		width: 6rem;
		appearance: none;
		border-radius: 9999px;
		background: var(--contrastMedium);
		cursor: pointer;
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

	/* Mobile responsive styles */
	@media (max-width: 768px) {
		.appContent {
			flex-direction: column;
		}

		.bottomToolbar {
			left: 0.5rem;
			right: 0.5rem;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.toolbarLeft,
		.toolbarRight {
			flex-wrap: wrap;
		}

		:global(.resizer) {
			width: 100% !important;
			height: 2rem !important;
			flex-direction: row;
		}

		.resizer__handle {
			width: 4rem !important;
			height: 100% !important;
			margin-top: 0 !important;
			margin-left: 50%;
			transform: translateX(-50%);
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
