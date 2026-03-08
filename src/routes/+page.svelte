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
		Loader,
		addToast,
		removeToast
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
	import { createCardDrawTray, getCardDrawPositions, type CardStack } from '$lib/models/cardTray';
	import { createCardDividerTray, getCardDividerPositions } from '$lib/models/cardDividerTray';
	import { arrangeTrays, calculateTraySpacers } from '$lib/models/box';
	import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
	import {
		getGeometryWorker,
		type TrayGeometryData,
		type BoxGeometryData
	} from '$lib/utils/geometryWorker';
	import { BlobWriter, ZipWriter } from '@zip.js/zip.js';
	import {
		exportPdfReference,
		exportPdfWithScreenshots,
		type TrayScreenshot
	} from '$lib/utils/pdfGenerator';
	import type { CaptureOptions } from '$lib/utils/screenshotCapture';
	import { exportProjectToJson, importProjectFromJson } from '$lib/utils/storage';
	import {
		initProject,
		getSelectedTray,
		getSelectedBox,
		getProject,
		importProject,
		resetProject,
		getCumulativeTrayLetter,
		isCounterTray,
		isCardTray,
		isCardDividerTray,
		saveManualLayout,
		clearManualLayout
	} from '$lib/stores/project.svelte';
	import type { Project } from '$lib/types/project';
	import type { BufferGeometry } from 'three';
	import { onDestroy, untrack } from 'svelte';
	import LayoutEditorOverlay from '$lib/components/LayoutEditorOverlay.svelte';
	import {
		enterEditMode,
		exitEditMode,
		cancelChanges,
		layoutEditorState,
		getIsEditMode,
		getManualPlacements,
		rotateTray,
		getSelectedTrayId
	} from '$lib/stores/layoutEditor.svelte';
	import { findAllOverlaps } from '$lib/utils/layoutSnapping';

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
	let selectedTrayCounters = $state<(CounterStack | CardStack)[]>([]);
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
	let exportingStl = $state(false);
	let exportStlProgress = $state('');
	let exporting3mf = $state(false);
	let captureTrayLetter = $state<string | null>(null); // Override during PDF export
	let debugExporting = $state(false);

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
	let printBedSize = $derived(
		selectedTray && isCounterTray(selectedTray) ? selectedTray.params.printBedSize : 256
	);
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

		// In layout edit mode, only show trays (no box/lid since layout isn't finalized)
		const inEditMode = isLayoutEditMode;

		switch (viewMode) {
			case 'tray':
				result.tray = selectedTrayGeometry;
				break;
			case 'all':
				result.allTrays = allTrayGeometries;
				result.box = inEditMode ? null : boxGeometry;
				result.lid = inEditMode ? null : lidGeometry;
				result.showAllTrays = true;
				break;
			case 'all-no-lid':
				// Show all boxes together without lids (default view / dimensions view)
				result.allBoxes = allBoxGeometries;
				result.showAllBoxes = true;
				break;
			case 'exploded':
				result.allTrays = allTrayGeometries;
				result.box = inEditMode ? null : boxGeometry;
				result.lid = inEditMode ? null : lidGeometry;
				result.exploded = !inEditMode; // Don't explode in edit mode
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

	// Handle double-click on tray to navigate to it
	function handleTrayDoubleClick(trayId: string) {
		// Find which box contains this tray and select both box and tray
		const project = getProject();
		for (const box of project.boxes) {
			const tray = box.trays.find((t) => t.id === trayId);
			if (tray) {
				// Update both selections together to avoid inconsistent state
				project.selectedBoxId = box.id;
				project.selectedTrayId = trayId;
				break;
			}
		}
		selectionType = 'tray';
		viewMode = 'tray';
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

		// Capture hash at START of generation to handle params changing during async work
		const hashAtGenerationStart = currentStateHash;

		// Check if cache is still valid (hash matches what was used to generate it)
		const cacheValid = lastGeneratedHash && hashAtGenerationStart === lastGeneratedHash;

		// If cache valid and not forced, try to use cached geometry
		if (cacheValid && !force && allBoxGeometries.length > 0) {
			// Find the selected box in the all-boxes cache
			const cachedBox = allBoxGeometries.find((b) => b.boxId === box.id);
			if (cachedBox) {
				// Verify the cached tray count matches current state (detects tray moves)
				const currentTrayCount = box.trays.length;
				const cachedTrayCount = cachedBox.trayGeometries.length;
				if (currentTrayCount !== cachedTrayCount) {
					// Tray count mismatch - cache is stale, force regeneration
					// This can happen when a tray is moved between boxes
				} else {
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
		}

		generating = true;
		error = '';

		// Clear stale geometry when forcing regeneration (structural changes)
		// This prevents showing old geometry from deleted/moved boxes/trays
		if (force) {
			allBoxGeometries = [];
			allTrayGeometries = [];
		}

		let wasSuperseded = false;
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
			// Ignore "superseded" errors - these are expected when a newer request replaces an older one
			const message = e instanceof Error ? e.message : 'Unknown error';
			if (message === 'Superseded by newer request') {
				wasSuperseded = true;
			} else {
				error = message;
				console.error('Generation error:', e);
			}
		} finally {
			// Don't update state for superseded requests - a newer request will handle it
			if (!wasSuperseded) {
				generating = false;
				// Use the hash captured at generation start, not current
				// This prevents marking cache as valid if params changed during generation
				lastGeneratedHash = hashAtGenerationStart;
				// Only clear dirty if params haven't changed since generation started
				if (currentStateHash === hashAtGenerationStart) {
					isDirty = false;
				}
			}
		}
	}

	async function handleExportAll() {
		const project = getProject();
		if (project.boxes.length === 0) return;

		exportingStl = true;
		exportStlProgress = 'Generating STL files...';

		const loadingToast = addToast({
			data: {
				title: 'Exporting STLs',
				body: 'This may take a few moments',
				type: 'info'
			}
		});

		try {
			// Get all STL files from worker
			const files = await geometryWorker.exportAllStls();

			if (files.length === 0) {
				throw new Error('No geometry available for export');
			}

			exportStlProgress = `Creating zip (${files.length} files)...`;

			// Create zip file
			const zipBlobWriter = new BlobWriter('application/zip');
			const zipWriter = new ZipWriter(zipBlobWriter);

			for (const file of files) {
				const blob = new Blob([file.data], { type: 'application/octet-stream' });
				await zipWriter.add(file.filename, blob.stream());
			}

			const zipBlob = await zipWriter.close();

			// Download zip - use first box name or default
			const projectName =
				project.boxes[0]?.name?.toLowerCase().replace(/\s+/g, '-') || 'counterslayer';
			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${projectName}-stls.zip`;
			a.click();
			URL.revokeObjectURL(url);

			removeToast(loadingToast.id);
			addToast({
				data: {
					title: 'STL export complete',
					body: `Downloaded ${files.length} files as zip`,
					type: 'success'
				}
			});
		} catch (e) {
			removeToast(loadingToast.id);
			const message = e instanceof Error ? e.message : 'Export failed';
			addToast({
				data: {
					title: 'STL export failed',
					body: message,
					type: 'danger'
				}
			});
			console.error('Export error:', e);
		} finally {
			exportingStl = false;
			exportStlProgress = '';
		}
	}

	async function handleExport3mf() {
		const project = getProject();
		if (project.boxes.length === 0) return;

		exporting3mf = true;

		const loadingToast = addToast({
			data: {
				title: 'Exporting 3MF',
				body: 'Generating 3MF file...',
				type: 'info'
			}
		});

		try {
			const { data, filename } = await geometryWorker.export3mf();

			if (data.byteLength === 0) {
				throw new Error('No geometry available for export');
			}

			// Download file
			const blob = new Blob([data], {
				type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			removeToast(loadingToast.id);
			addToast({
				data: {
					title: '3MF export complete',
					body: `Downloaded ${filename}`,
					type: 'success'
				}
			});
		} catch (e) {
			removeToast(loadingToast.id);
			const message = e instanceof Error ? e.message : 'Export failed';
			addToast({
				data: {
					title: '3MF export failed',
					body: message,
					type: 'danger'
				}
			});
			console.error('3MF export error:', e);
		} finally {
			exporting3mf = false;
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

		const loadingToast = addToast({
			data: {
				title: 'Exporting PDF',
				body: 'Capturing tray screenshots...',
				type: 'info'
			}
		});

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

			// Get global card sizes and counter shapes from project
			const cardSizes = project.cardSizes;
			const counterShapes = project.counterShapes;

			// Capture each tray
			for (let boxIdx = 0; boxIdx < project.boxes.length; boxIdx++) {
				const box = project.boxes[boxIdx];
				const placements = arrangeTrays(box.trays, {
					customBoxWidth: box.customWidth,
					wallThickness: box.wallThickness,
					tolerance: box.tolerance,
					cardSizes,
					counterShapes,
					manualLayout: box.manualLayout
				});
				const spacerInfo = calculateTraySpacers(box, cardSizes, counterShapes);
				const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

				for (let trayIdx = 0; trayIdx < placements.length; trayIdx++) {
					const placement = placements[trayIdx];
					const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
					const spacerHeight = spacer?.floorSpacerHeight ?? 0;
					const trayLetter = getCumulativeTrayLetter(project.boxes, boxIdx, trayIdx);

					// Generate geometry for this tray based on tray type
					let jscadGeom;
					const showEmboss = placement.tray.showEmboss ?? true;
					if (isCounterTray(placement.tray)) {
						jscadGeom = createCounterTray(
							placement.tray.params,
							counterShapes,
							placement.tray.name,
							maxHeight,
							spacerHeight,
							showEmboss
						);
						selectedTrayCounters = getCounterPositions(
							placement.tray.params,
							counterShapes,
							maxHeight,
							spacerHeight
						);
					} else if (isCardDividerTray(placement.tray)) {
						const showStackLabels = placement.tray.showStackLabels ?? true;
						jscadGeom = createCardDividerTray(
							placement.tray.params,
							cardSizes,
							placement.tray.name,
							maxHeight,
							spacerHeight,
							showEmboss,
							showStackLabels
						);
						// Get card divider positions for reference labels
						const dividerPositions = getCardDividerPositions(
							placement.tray.params,
							cardSizes,
							maxHeight,
							spacerHeight
						);
						// Convert to CounterStack format for label rendering
						selectedTrayCounters = dividerPositions.map((pos) => ({
							shape: 'custom' as const,
							shapeId: pos.cardSizeId,
							customShapeName: pos.label,
							customBaseShape: 'rectangle' as const,
							x: pos.x,
							y: pos.y,
							z: pos.z,
							width: pos.slotWidth,
							length: pos.slotDepth,
							thickness: pos.cardThickness,
							count: pos.count,
							hexPointyTop: false,
							color: pos.color,
							isEdgeLoaded: true,
							isCardDivider: true,
							cardDividerHeight: pos.slotHeight,
							slotWidth: pos.slotWidth,
							slotDepth: pos.slotDepth
						}));
					} else if (isCardTray(placement.tray)) {
						jscadGeom = createCardDrawTray(
							placement.tray.params,
							cardSizes,
							placement.tray.name,
							maxHeight,
							spacerHeight,
							showEmboss
						);
						selectedTrayCounters = getCardDrawPositions(
							placement.tray.params,
							cardSizes,
							maxHeight,
							spacerHeight
						);
					} else {
						// Fallback - shouldn't happen
						continue;
					}

					// Set up scene for this tray
					selectedTrayGeometry = jscadToBufferGeometry(jscadGeom);
					captureTrayLetter = trayLetter;

					// Enable capture mode for fixed top-down label rotation
					captureFunction.setCaptureMode?.(true);

					// Wait for render (multiple frames to ensure geometry and text labels are loaded)
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => requestAnimationFrame(r));
					await new Promise((r) => setTimeout(r, 200));

					// Capture screenshot at 2x resolution for print quality (16:9 widescreen for long trays)
					// If tray is rotated in layout, swap dimensions back to get original orientation
					const boundsWidth = placement.rotated
						? placement.dimensions.depth
						: placement.dimensions.width;
					const boundsDepth = placement.rotated
						? placement.dimensions.width
						: placement.dimensions.depth;
					const dataUrl = captureFunction({
						width: 1920,
						height: 1080,
						backgroundColor: '#f0f0f0',
						bounds: {
							width: boundsWidth,
							depth: boundsDepth,
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

			removeToast(loadingToast.id);
			addToast({
				data: {
					title: 'PDF export complete',
					body: `Reference PDF with ${screenshots.length} tray screenshots`,
					type: 'success'
				}
			});
		} catch (e) {
			removeToast(loadingToast.id);
			const message = e instanceof Error ? e.message : 'Failed to export PDF';
			addToast({
				data: {
					title: 'PDF export failed',
					body: message,
					type: 'danger'
				}
			});
			console.error('PDF export error:', e);
		} finally {
			exportingPdf = false;
		}
	}

	function handleExportJson() {
		const project = getProject();
		const json = exportProjectToJson(project);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'counter-tray-project.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleDebugForClaude() {
		const project = getProject();
		const box = getSelectedBox();
		const tray = getSelectedTray();

		if (!box || !tray || !selectedTrayGeometry) {
			addToast({
				data: {
					title: 'Debug export failed',
					body: 'No tray selected or geometry not generated',
					type: 'danger'
				}
			});
			return;
		}

		debugExporting = true;

		const loadingToast = addToast({
			data: {
				title: 'Debug export',
				body: 'Analyzing geometry...',
				type: 'info'
			}
		});

		// Helper to convert ArrayBuffer to base64
		const toBase64 = (data: ArrayBuffer) =>
			btoa(new Uint8Array(data).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));

		try {
			// Export all geometries for the current box
			const stls: Record<string, string> = {};

			// Export box
			if (boxGeometry) {
				const { data } = await geometryWorker.exportBoxStl();
				stls['box'] = toBase64(data);
			}

			// Export lid
			if (lidGeometry) {
				const { data } = await geometryWorker.exportLidStl();
				stls['lid'] = toBase64(data);
			}

			// Export all trays in the current box
			for (let i = 0; i < allTrayGeometries.length; i++) {
				const trayData = allTrayGeometries[i];
				const { data } = await geometryWorker.exportTrayByIndexStl(i);
				stls[`tray_${trayData.trayLetter}_${trayData.name}`] = toBase64(data);
			}

			// Build context with all tray info including counter stacks
			const context = {
				box_name: box.name,
				box_id: box.id,
				selected_tray_name: tray.name,
				selected_tray_id: tray.id,
				selected_tray_letter: selectedTrayLetter,
				trays: allTrayGeometries.map((t) => ({
					name: t.name,
					letter: t.trayLetter,
					id: t.trayId,
					placement: t.placement,
					stacks: t.counterStacks.map((stack, idx) => ({
						ref: `${t.trayLetter}${idx + 1}`,
						shape: stack.shape === 'custom' ? stack.customShapeName : stack.shape,
						count: stack.count,
						x: Math.round(stack.x * 10) / 10,
						y: Math.round(stack.y * 10) / 10,
						width: stack.width,
						length: stack.length,
						isEdgeLoaded: stack.isEdgeLoaded || false,
						label: stack.label
					}))
				}))
			};

			// Capture Three.js screenshot if available (use current camera view)
			let screenshot: string | null = null;
			if (captureFunction) {
				try {
					// Capture at a reasonable size, preserving aspect ratio isn't critical
					// since we're using the current camera position
					screenshot = captureFunction({
						width: 1280,
						height: 960,
						backgroundColor: '#1a1a1a'
					});
				} catch (e) {
					console.warn('Screenshot capture failed:', e);
				}
			}

			// POST to debug endpoint
			const response = await fetch('/api/debug/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project,
					stls,
					context,
					screenshot
				})
			});

			const result = await response.json();

			removeToast(loadingToast.id);
			if (!result.success) {
				const errorMsg = result.error || 'Analysis failed';
				addToast({
					data: {
						title: 'Debug export failed',
						body: result.hint ? `${errorMsg} - ${result.hint}` : errorMsg,
						type: 'danger'
					}
				});
				console.error('Debug export failed:', result);
			} else {
				addToast({
					data: {
						title: 'Debug export complete',
						body: 'Files written to mesh-analysis/',
						type: 'success'
					}
				});
			}
		} catch (e) {
			removeToast(loadingToast.id);
			const message = e instanceof Error ? e.message : 'Failed to export debug info';
			addToast({
				data: {
					title: 'Debug export failed',
					body: message,
					type: 'danger'
				}
			});
			console.error('Debug export error:', e);
		} finally {
			debugExporting = false;
		}
	}

	async function handleImportJson(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = importProjectFromJson(text);
			importProject(data);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to import JSON';
			console.error('Import JSON error:', e);
		}

		input.value = '';
	}

	// Create a hash of current state to detect changes (includes all boxes for multi-box view)
	// Includes names because they are embossed on geometry
	let currentStateHash = $derived.by(() => {
		const project = getProject();
		if (project.boxes.length === 0) return '';
		return JSON.stringify({
			boxes: project.boxes.map((box) => ({
				id: box.id,
				name: box.name,
				tolerance: box.tolerance,
				wallThickness: box.wallThickness,
				floorThickness: box.floorThickness,
				lidParams: box.lidParams,
				customWidth: box.customWidth,
				customBoxHeight: box.customBoxHeight,
				fillSolidEmpty: box.fillSolidEmpty,
				trays: box.trays.map((t) => ({
					id: t.id,
					name: t.name,
					params: t.params,
					rotationOverride: t.rotationOverride,
					showEmboss: t.showEmboss,
					showStackLabels: isCardDividerTray(t) ? t.showStackLabels : undefined
				}))
			}))
		});
	});

	// Track dirty state when params change after generation
	$effect(() => {
		if (currentStateHash && lastGeneratedHash && currentStateHash !== lastGeneratedHash) {
			isDirty = true;
		}
	});

	// Track selection changes (which box/tray is selected)
	let selectionHash = $derived.by(() => {
		const project = getProject();
		return JSON.stringify({
			selectedBoxId: project.selectedBoxId,
			selectedTrayId: project.selectedTrayId
		});
	});

	// Track true structural changes (boxes/trays added, deleted, or moved)
	let structureHash = $derived.by(() => {
		const project = getProject();
		return JSON.stringify({
			boxIds: project.boxes.map((b) => b.id),
			// Include full box->tray mapping to detect moves
			boxTrayMapping: project.boxes.map((b) => ({
				boxId: b.id,
				trayIds: b.trays.map((t) => t.id)
			}))
		});
	});

	// Generate on mount (forced) and when structure changes (selection, add/delete)
	let hasInitialized = false;
	let lastSelectionHash = '';
	let lastStructureHash = '';
	$effect(() => {
		// Track both hashes separately
		const selHash = selectionHash;
		const strHash = structureHash;
		if (browser && selHash && strHash) {
			// Check if we have valid selection using direct project reads
			// This avoids potential timing issues with derived values
			const project = untrack(() => getProject());
			const hasValidSelection = project.selectedBoxId && project.selectedTrayId;

			// Verify the selected tray exists in the selected box
			const selectedBox = project.boxes.find((b) => b.id === project.selectedBoxId);
			const selectedTray = selectedBox?.trays.find((t) => t.id === project.selectedTrayId);

			if (hasValidSelection && selectedBox && selectedTray) {
				const selectionChanged = selHash !== lastSelectionHash;
				const structureChanged = strHash !== lastStructureHash;
				lastSelectionHash = selHash;
				lastStructureHash = strHash;

				if (!hasInitialized) {
					hasInitialized = true;
					regenerate(true); // Force on initial load
				} else if (structureChanged) {
					// Force regeneration only for true structural changes (add/delete/move)
					regenerate(true);
				} else if (selectionChanged) {
					// Selection-only changes should use the cache
					regenerate(false);
				}
			}
		}
	});

	function handleReset() {
		if (confirm('Reset project to defaults? This will delete all boxes and trays.')) {
			resetProject();
		}
	}

	// Layout Editor handlers - use $derived.by() to properly track reactive reads from store
	let isLayoutEditMode = $derived.by(() => layoutEditorState.isEditMode);

	function handleEnterLayoutEdit() {
		const box = getSelectedBox();
		if (!box) return;

		const project = getProject();
		const cardSizes = project.cardSizes ?? [];
		const counterShapes = project.counterShapes ?? [];

		// Get current placements (either from manual layout or auto)
		const placements = arrangeTrays(box.trays, {
			customBoxWidth: box.customWidth,
			wallThickness: box.wallThickness,
			tolerance: box.tolerance,
			cardSizes,
			counterShapes,
			manualLayout: box.manualLayout
		});

		// Calculate interior size (usable area = box dimensions minus walls)
		// The layout editor bounds should be the maximum usable interior (print bed minus walls)
		// Always use print bed size, not current box size, so user can expand layout
		const wallOffset = (box.wallThickness + box.tolerance) * 2;
		const interiorWidth = printBedSize - wallOffset;
		const interiorDepth = printBedSize - wallOffset;

		// Enter edit mode with current placements and interior bounds
		enterEditMode(placements, interiorWidth, interiorDepth);
	}

	function handleSaveLayout() {
		const box = getSelectedBox();
		if (!box) return;

		// Check for overlaps before saving
		const workingPlacements = layoutEditorState.workingPlacements;
		const overlaps = findAllOverlaps(workingPlacements);

		if (overlaps.length > 0) {
			// Find the names of overlapping trays for the error message
			const overlapNames = overlaps.map(([id1, id2]) => {
				const tray1 = workingPlacements.find((p) => p.trayId === id1);
				const tray2 = workingPlacements.find((p) => p.trayId === id2);
				return `${tray1?.name ?? 'Unknown'} and ${tray2?.name ?? 'Unknown'}`;
			});
			addToast({
				data: {
					title: 'Cannot save layout',
					body: `Trays are overlapping: ${overlapNames.join(', ')}`,
					type: 'danger'
				}
			});
			return;
		}

		const manualPlacements = getManualPlacements();

		// Save to project - box dimensions auto-calculate from tray positions
		saveManualLayout(box.id, manualPlacements);

		// Exit edit mode
		exitEditMode();

		// Regenerate geometry with new layout
		regenerate(true);
	}

	function handleCancelLayout() {
		cancelChanges();
		exitEditMode();
	}

	function handleResetAutoLayout() {
		const box = getSelectedBox();
		if (!box) return;

		// Clear manual layout
		clearManualLayout(box.id);

		// Exit edit mode
		exitEditMode();

		// Regenerate with auto layout
		regenerate(true);
	}

	function handleRotateLayout() {
		const selectedId = getSelectedTrayId();
		if (selectedId) {
			rotateTray(selectedId);
		}
	}

	// Cancel edit mode when selection changes (user navigates away)
	let lastSelectedBoxId = $state<string | null>(null);
	let lastSelectionType = $state<SelectionType>('dimensions');
	$effect(() => {
		const currentBoxId = selectedBox?.id ?? null;
		const currentSelectionType = selectionType;

		// Cancel edit mode if box changes or selection type changes away from 'box'
		if (getIsEditMode()) {
			const boxChanged = lastSelectedBoxId !== null && currentBoxId !== lastSelectedBoxId;
			const leftBoxView = lastSelectionType === 'box' && currentSelectionType !== 'box';

			if (boxChanged || leftBoxView) {
				cancelChanges();
				exitEditMode();
			}
		}

		lastSelectedBoxId = currentBoxId;
		lastSelectionType = currentSelectionType;
	});

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
							{isLayoutEditMode}
							onTrayDoubleClick={handleTrayDoubleClick}
							{generating}
						/>
					{/await}
				{/if}

				{#if generating}
					<div class="generatingOverlay">
						<Loader />
						<div class="generatingText">Generating geometry...</div>
					</div>
				{/if}

				{#if (viewMode === 'exploded' || viewMode === 'all') && !generating}
					<div class="viewToolbar">
						{#if viewMode === 'exploded' && !isLayoutEditMode}
							<div class="sliderContainer">
								<span class="sliderLabel">Explode</span>
								<InputSlider min={0} max={100} bind:value={explosionAmount} />
							</div>
						{/if}
						<LayoutEditorOverlay
							onEnterEdit={handleEnterLayoutEdit}
							onSave={handleSaveLayout}
							onCancel={handleCancelLayout}
							onResetAuto={handleResetAutoLayout}
							onRotate={handleRotateLayout}
							canEdit={(selectedBox?.trays.length ?? 0) > 1}
						/>
					</div>
				{/if}

				{#if !isLayoutEditMode}
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
										onclick={handleExportAll}
										disabled={generating || exportingStl || getProject().boxes.length === 0}
										isLoading={exportingStl}
										style="width: 100%; justify-content: flex-start;"
									>
										{exportingStl ? exportStlProgress : 'Export STLs'}
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
									{#if import.meta.env.DEV}
										<Hr />
										<Button
											variant="ghost"
											onclick={handleDebugForClaude}
											disabled={!selectedTrayGeometry || debugExporting}
											isLoading={debugExporting}
											style="width: 100%; justify-content: flex-start;"
										>
											{debugExporting ? 'Analyzing...' : 'Debug for Claude'}
										</Button>
									{/if}
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
				{/if}

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
				<EditorPanel {selectionType} {isLayoutEditMode} {printBedSize} />
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
							{isLayoutEditMode}
							onTrayDoubleClick={handleTrayDoubleClick}
							{generating}
						/>
					{/await}
				{/if}

				{#if generating}
					<div class="generatingOverlay">
						<Loader />
						<div class="generatingText">Generating geometry...</div>
					</div>
				{/if}

				{#if (viewMode === 'exploded' || viewMode === 'all') && !generating}
					<div class="viewToolbar">
						{#if viewMode === 'exploded' && !isLayoutEditMode}
							<div class="sliderContainer">
								<span class="sliderLabel">Explode</span>
								<InputSlider min={0} max={100} bind:value={explosionAmount} />
							</div>
						{/if}
						<LayoutEditorOverlay
							onEnterEdit={handleEnterLayoutEdit}
							onSave={handleSaveLayout}
							onCancel={handleCancelLayout}
							onResetAuto={handleResetAutoLayout}
							onRotate={handleRotateLayout}
							canEdit={(selectedBox?.trays.length ?? 0) > 1}
						/>
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
									onclick={handleExportAll}
									disabled={generating || exportingStl || getProject().boxes.length === 0}
									isLoading={exportingStl}
									style="width: 100%; justify-content: flex-start;"
								>
									{exportingStl ? exportStlProgress : 'Export STLs'}
								</Button>
								<Button
									variant="ghost"
									onclick={handleExport3mf}
									disabled={generating || exporting3mf || getProject().boxes.length === 0}
									isLoading={exporting3mf}
									style="width: 100%; justify-content: flex-start;"
								>
									{exporting3mf ? 'Generating 3MF...' : 'Export 3MF'}
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
								{#if import.meta.env.DEV}
									<Hr />
									<Button
										variant="ghost"
										onclick={handleDebugForClaude}
										disabled={!selectedTrayGeometry || debugExporting}
										isLoading={debugExporting}
										style="width: 100%; justify-content: flex-start;"
									>
										{debugExporting ? 'Analyzing...' : 'Debug for Claude'}
									</Button>
								{/if}
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
					{#if !isLayoutEditMode}
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
					{/if}
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
			<EditorPanel {selectionType} {isLayoutEditMode} {printBedSize} />
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
		padding: 0.25rem 0.75rem;
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
