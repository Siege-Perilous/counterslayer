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
  import { IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp } from '@tabler/icons-svelte';
  import NavigationMenu from '$lib/components/NavigationMenu.svelte';
  import EditorPanel from '$lib/components/EditorPanel.svelte';
  import { createCounterTray, getCounterPositions, type CounterStack } from '$lib/models/counterTray';
  import { createCardDrawTray, getCardDrawPositions, type CardStack } from '$lib/models/cardTray';
  import { createCardDividerTray, getCardDividerPositions } from '$lib/models/cardDividerTray';
  import { arrangeTrays, calculateTraySpacers, getTrayDimensionsForTray } from '$lib/models/box';
  import { createCupTray } from '$lib/models/cupTray';
  import { arrangeLayerContents, type BoxPlacement, type LooseTrayPlacement } from '$lib/models/layer';
  import { jscadToBufferGeometry } from '$lib/utils/jscadToThree';
  import {
    getGeometryWorker,
    type TrayGeometryData,
    type BoxGeometryData,
    type LooseTrayGeometryData
  } from '$lib/utils/geometryWorker';
  import { BlobWriter, ZipWriter } from '@zip.js/zip.js';
  import { exportPdfReference, exportPdfWithScreenshots, type TrayScreenshot } from '$lib/utils/pdfGenerator';
  import type { CaptureOptions } from '$lib/utils/screenshotCapture';
  import { exportProjectToJson, importProjectFromJson } from '$lib/utils/storage';
  import {
    initProject,
    getSelectedTray,
    getSelectedBox,
    getSelectedLayer,
    getProject,
    getGlobalSettings,
    importProject,
    resetProject,
    getTrayLetterById,
    getAllBoxes,
    getAllLooseTrays,
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCupTray,
    findTrayLocation,
    saveManualLayout,
    clearManualLayout
  } from '$lib/stores/project.svelte';
  import type { Project } from '$lib/types/project';
  import type { BufferGeometry } from 'three';
  import { onDestroy, untrack } from 'svelte';
  import LayoutEditorOverlay from '$lib/components/LayoutEditorOverlay.svelte';
  import LayerLayoutEditorOverlay from '$lib/components/LayerLayoutEditorOverlay.svelte';
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
  import {
    enterLayerEditMode,
    exitLayerEditMode,
    cancelLayerChanges,
    layerLayoutEditorState,
    getManualLayerPlacements,
    rotateSelectedItem
  } from '$lib/stores/layerLayoutEditor.svelte';
  import { saveLayerLayout, clearLayerLayout, selectTray, selectBox, selectLayer } from '$lib/stores/project.svelte';
  import { findLayerOverlaps, type LayerItemForSnapping } from '$lib/utils/layerLayoutSnapping';

  type ViewMode = 'tray' | 'all' | 'exploded' | 'all-no-lid' | 'layer';
  type SelectionType = 'dimensions' | 'layer' | 'box' | 'tray';

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
  let editorPane = $state<PaneAPI>();
  let mobileNavPane = $state<PaneAPI>();
  let mobileEditorPane = $state<PaneAPI>();
  let isMobileNavCollapsed = $state(true);
  let isMobileEditorCollapsed = $state(true);
  let mobileNavSize = $state(0); // Track nav size for restore
  let mobileEditorSize = $state(0); // Track editor size for restore
  const MOBILE_PANEL_DEFAULT_SIZE = 25;
  let selectedTrayGeometry = $state<BufferGeometry | null>(null);
  let selectedTrayCounters = $state<(CounterStack | CardStack)[]>([]);
  let allTrayGeometries = $state<TrayGeometryData[]>([]);
  let allBoxGeometries = $state<BoxGeometryData[]>([]);
  let allLooseTrayGeometries = $state<LooseTrayGeometryData[]>([]);
  let boxGeometry = $state<BufferGeometry | null>(null);
  let lidGeometry = $state<BufferGeometry | null>(null);
  let generating = $state(false);
  let geometryWorker = getGeometryWorker();
  let error = $state('');
  let isDirty = $state(false);
  let lastGeneratedHash = $state('');
  let jsonFileInput = $state<HTMLInputElement | null>(null);
  let explosionAmount = $state(50);
  let allLayersExplosionAmount = $state(50); // Default to current behavior (20mm separation)
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

  // Debug mode URL params for Playwright capture
  interface DebugParams {
    debugMode: boolean;
    cameraPreset?: string;
    cameraPosition?: [number, number, number];
    cameraLookAt?: [number, number, number];
    cameraZoom: number;
    debugMarkers: Array<{ name: string; pos: [number, number, number]; color: string }>;
    hideUI: boolean;
  }

  let debugParams = $state<DebugParams>({
    debugMode: false,
    cameraZoom: 1,
    debugMarkers: [],
    hideUI: false
  });

  // Parse URL params for debug mode
  $effect(() => {
    if (!browser) return;

    const params = new URLSearchParams(window.location.search);
    const debug = params.get('debug') === '1';

    if (debug) {
      const angle = params.get('angle') || undefined;
      const posStr = params.get('pos');
      const lookAtStr = params.get('lookAt');
      const zoomStr = params.get('zoom');
      const markersStr = params.get('markers');
      const hideUI = params.get('hideUI') === '1';
      const viewParam = params.get('view') as ViewMode | null;
      const trayIdParam = params.get('trayId');
      const boxIdParam = params.get('boxId');
      const layerIdParam = params.get('layerId');

      // Select specific items by ID from URL params
      if (trayIdParam) {
        selectTray(trayIdParam);
        viewMode = 'tray';
      } else if (boxIdParam) {
        selectBox(boxIdParam);
        viewMode = 'exploded';
      } else if (layerIdParam) {
        selectLayer(layerIdParam);
        viewMode = 'layer';
      } else if (viewParam && ['tray', 'layer', 'exploded', 'all', 'all-no-lid'].includes(viewParam)) {
        // Set view mode from URL parameter
        viewMode = viewParam;
      }

      // Parse position "x,y,z"
      let cameraPosition: [number, number, number] | undefined;
      if (posStr) {
        const parts = posStr.split(',').map(Number);
        if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
          cameraPosition = parts as [number, number, number];
        }
      }

      // Parse lookAt "x,y,z"
      let cameraLookAt: [number, number, number] | undefined;
      if (lookAtStr) {
        const parts = lookAtStr.split(',').map(Number);
        if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
          cameraLookAt = parts as [number, number, number];
        }
      }

      // Parse zoom
      const cameraZoom = zoomStr ? parseFloat(zoomStr) : 1;

      // Parse markers (base64 JSON)
      let debugMarkers: Array<{ name: string; pos: [number, number, number]; color: string }> = [];
      if (markersStr) {
        try {
          const decoded = atob(markersStr);
          const parsed = JSON.parse(decoded);
          // Convert object format to array format
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            debugMarkers = Object.entries(parsed).map(([name, value]) => {
              const v = value as { pos: [number, number, number]; color: string };
              return { name, pos: v.pos, color: v.color };
            });
          }
        } catch (e) {
          console.warn('Failed to parse markers:', e);
        }
      }

      debugParams = {
        debugMode: true,
        cameraPreset: angle,
        cameraPosition,
        cameraLookAt,
        cameraZoom,
        debugMarkers,
        hideUI
      };
    } else {
      debugParams = {
        debugMode: false,
        cameraZoom: 1,
        debugMarkers: [],
        hideUI: false
      };
    }
  });

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
      regenerate(true);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load project';
      console.error('Load community project error:', e);
    }
  }

  let selectedTray = $derived(getSelectedTray());
  let selectedBox = $derived(getSelectedBox());
  let selectedLayer = $derived(getSelectedLayer());
  let globalSettings = $derived(getGlobalSettings());
  let gameContainerWidth = $derived(globalSettings.gameContainerWidth);
  let gameContainerDepth = $derived(globalSettings.gameContainerDepth);
  let selectedTrayLetter = $derived.by(() => {
    // Use override during PDF capture
    if (captureTrayLetter) return captureTrayLetter;
    const proj = getProject();
    if (!selectedTray) return 'A';
    return getTrayLetterById(proj.layers, selectedTray.id) || 'A';
  });

  // Title for the print bed based on current view
  let viewTitle = $derived.by(() => {
    if (viewMode === 'tray') {
      return selectedTray?.name ?? '';
    }
    if (viewMode === 'layer') {
      return selectedLayer?.name ?? '';
    }
    // For box views (all, exploded), show box name
    return selectedBox?.name ?? '';
  });

  // Compute layer arrangement when in layer view
  let layerArrangement = $derived.by(() => {
    if (viewMode !== 'layer' || !selectedLayer) return null;
    const project = getProject();
    return arrangeLayerContents(selectedLayer, {
      gameContainerWidth,
      gameContainerDepth,
      cardSizes: project.cardSizes || [],
      counterShapes: project.counterShapes || []
    });
  });

  // Compute arrangements for ALL layers (for stacked view in dimensions mode)
  let allLayerArrangements = $derived.by(() => {
    if (viewMode !== 'all-no-lid') return [];
    const project = getProject();
    return project.layers.map((layer) => ({
      layer: { id: layer.id, name: layer.name },
      arrangement: arrangeLayerContents(layer, {
        gameContainerWidth,
        gameContainerDepth,
        cardSizes: project.cardSizes || [],
        counterShapes: project.counterShapes || []
      })
    }));
  });

  // Compute which geometries to show based on view mode
  let visibleGeometries = $derived.by(() => {
    const result: {
      tray: BufferGeometry | null;
      allTrays: TrayGeometryData[];
      allBoxes: BoxGeometryData[];
      allLooseTrays: LooseTrayGeometryData[];
      box: BufferGeometry | null;
      lid: BufferGeometry | null;
      exploded: boolean;
      showAllTrays: boolean;
      showAllBoxes: boolean;
      showLayerView: boolean;
      layerBoxPlacements: BoxPlacement[];
      layerLooseTrayPlacements: LooseTrayPlacement[];
      // All layers stacked view
      showAllLayers: boolean;
      allLayerArrangements: Array<{
        layer: { id: string; name: string };
        arrangement: {
          boxes: BoxPlacement[];
          looseTrays: LooseTrayPlacement[];
          layerHeight: number;
        };
      }>;
    } = {
      tray: null,
      allTrays: [],
      allBoxes: [],
      allLooseTrays: [],
      box: null,
      lid: null,
      exploded: false,
      showAllTrays: false,
      showAllBoxes: false,
      showLayerView: false,
      layerBoxPlacements: [],
      layerLooseTrayPlacements: [],
      showAllLayers: false,
      allLayerArrangements: []
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
        // Show all layers stacked vertically with lids (dimensions view)
        result.showAllLayers = true;
        result.allLayerArrangements = allLayerArrangements;
        result.allBoxes = allBoxGeometries;
        result.allLooseTrays = allLooseTrayGeometries;
        break;
      case 'exploded':
        result.allTrays = allTrayGeometries;
        result.box = inEditMode ? null : boxGeometry;
        result.lid = inEditMode ? null : lidGeometry;
        result.exploded = !inEditMode; // Don't explode in edit mode
        result.showAllTrays = true;
        break;
      case 'layer':
        // Show layer view with boxes and loose trays arranged on game container
        if (layerArrangement) {
          result.showLayerView = true;
          result.layerBoxPlacements = layerArrangement.boxes;
          result.layerLooseTrayPlacements = layerArrangement.looseTrays;
          // Include allBoxes and allLooseTrays so we can render actual geometry
          result.allBoxes = allBoxGeometries;
          result.allLooseTrays = allLooseTrayGeometries;
        }
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
      case 'layer':
        viewMode = 'layer';
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
    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        const tray = box.trays.find((t) => t.id === trayId);
        if (tray) {
          // Update both selections together to avoid inconsistent state
          project.selectedBoxId = box.id;
          project.selectedTrayId = trayId;
          selectionType = 'tray';
          viewMode = 'tray';
          return;
        }
      }
      // Also check loose trays
      const looseTray = layer.looseTrays.find((t) => t.id === trayId);
      if (looseTray) {
        // Clear box selection for loose trays
        project.selectedBoxId = null;
        project.selectedTrayId = trayId;
        selectionType = 'tray';
        viewMode = 'tray';
        return;
      }
    }
  }

  // Handle double-click on box to navigate to it
  function handleBoxDoubleClick(boxId: string) {
    const project = getProject();
    for (const layer of project.layers) {
      const box = layer.boxes.find((b) => b.id === boxId);
      if (box) {
        project.selectedBoxId = boxId;
        // Select the first tray in the box if available
        if (box.trays.length > 0) {
          project.selectedTrayId = box.trays[0].id;
        }
        selectionType = 'box';
        viewMode = 'exploded';
        return;
      }
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
        mobileEditorPane.resize(mobileEditorSize > 5 ? mobileEditorSize : MOBILE_PANEL_DEFAULT_SIZE);
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

    if (!tray) {
      error = 'No tray selected';
      return;
    }

    // Check if this is a loose tray (not in a box)
    const trayLocation = findTrayLocation(project, tray.id);
    const isLoose = trayLocation && trayLocation.boxId === null;

    // For boxed trays, we need a box
    if (!isLoose && !box) {
      error = 'No box selected';
      return;
    }

    // Capture hash at START of generation to handle params changing during async work
    const hashAtGenerationStart = currentStateHash;

    // Check if cache is still valid (hash matches what was used to generate it)
    const cacheValid = lastGeneratedHash && hashAtGenerationStart === lastGeneratedHash;

    // If cache valid and not forced, try to use cached geometry
    if (cacheValid && !force) {
      // Handle loose trays
      if (isLoose && allLooseTrayGeometries.length > 0) {
        const cachedLooseTray = allLooseTrayGeometries.find((t) => t.trayId === tray.id);
        if (cachedLooseTray) {
          selectedTrayGeometry = cachedLooseTray.geometry;
          selectedTrayCounters = cachedLooseTray.counterStacks;
          // For loose trays, allTrayGeometries is just this tray
          allTrayGeometries = [
            {
              trayId: cachedLooseTray.trayId,
              name: cachedLooseTray.name,
              color: cachedLooseTray.color,
              geometry: cachedLooseTray.geometry,
              placement: {
                tray,
                x: 0,
                y: 0,
                rotated: false,
                dimensions: cachedLooseTray.dimensions
              },
              counterStacks: cachedLooseTray.counterStacks,
              trayLetter: cachedLooseTray.trayLetter
            }
          ];
          boxGeometry = null;
          lidGeometry = null;
          console.debug('[Geometry Cache] Hit for loose tray:', tray.id);
          return;
        } else {
          console.debug('[Geometry Cache] Loose tray not found in cache:', {
            lookingFor: tray.id,
            availableLooseTrays: allLooseTrayGeometries.map((t) => t.trayId)
          });
        }
      }

      // Handle boxed trays
      if (!isLoose && allBoxGeometries.length > 0 && box) {
        // Find the selected box in the all-boxes cache
        const cachedBox = allBoxGeometries.find((b) => b.boxId === box.id);
        if (cachedBox) {
          // Verify the cached tray count matches current state (detects tray moves)
          const currentTrayCount = box.trays.length;
          const cachedTrayCount = cachedBox.trayGeometries.length;
          if (currentTrayCount !== cachedTrayCount) {
            // Tray count mismatch - cache is stale, force regeneration
            // This can happen when a tray is moved between boxes
            console.debug('[Geometry Cache] Tray count mismatch:', { currentTrayCount, cachedTrayCount });
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
              console.debug('[Geometry Cache] Hit for boxed tray:', tray.id);
              return;
            } else {
              // Tray not found in cache - this shouldn't happen normally
              console.debug('[Geometry Cache] Tray not found in cache:', {
                lookingFor: tray.id,
                availableTrays: cachedBox.trayGeometries.map((t) => t.trayId)
              });
            }
          }
        } else {
          console.debug('[Geometry Cache] Box not found in cache:', {
            lookingFor: box.id,
            availableBoxes: allBoxGeometries.map((b) => b.boxId)
          });
        }
      }
    } else if (!force) {
      // Log why cache was skipped
      console.debug('[Geometry Cache] Skipped:', {
        cacheValid,
        isLoose,
        hasBoxGeometries: allBoxGeometries.length > 0,
        hasLooseTrayGeometries: allLooseTrayGeometries.length > 0,
        hasBox: !!box,
        hashMatch: lastGeneratedHash === hashAtGenerationStart
      });
    }

    console.debug('[Geometry Worker] Calling worker:', {
      force,
      trayId: tray.id,
      boxId: box?.id ?? '(loose)',
      cacheValid,
      hashMatch: lastGeneratedHash === hashAtGenerationStart
    });

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
      // Use web worker for geometry generation (handles both boxed and loose trays)
      // Pass empty string for boxId if it's a loose tray - worker handles this case
      const result = await geometryWorker.generate(project, box?.id ?? '', tray.id);

      selectedTrayGeometry = result.selectedTrayGeometry;
      selectedTrayCounters = result.selectedTrayCounters;
      allTrayGeometries = result.allTrayGeometries;
      boxGeometry = result.boxGeometry;
      lidGeometry = result.lidGeometry;
      allBoxGeometries = result.allBoxGeometries;
      allLooseTrayGeometries = result.allLooseTrayGeometries;
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

        // Auto-save project.json in dev mode for Claude debugging
        if (import.meta.env.DEV) {
          saveProjectForDebug();
        }
      }
    }
  }

  /** Save project.json with computed layout for Claude debugging (dev only) */
  async function saveProjectForDebug() {
    try {
      const project = getProject();

      // Compute layer arrangements to get global positions
      const layerArrangements = project.layers.map((layer) =>
        arrangeLayerContents(layer, {
          gameContainerWidth,
          gameContainerDepth,
          cardSizes: project.cardSizes || [],
          counterShapes: project.counterShapes || []
        })
      );

      const computedLayout = {
        timestamp: new Date().toISOString(),
        gameContainer: { width: gameContainerWidth, depth: gameContainerDepth },
        layers: project.layers.map((layer, layerIdx) => {
          const arrangement = layerArrangements[layerIdx];
          return {
            layerId: layer.id,
            layerName: layer.name,
            layerHeight: arrangement.layerHeight,
            boxes: arrangement.boxes.map((bp) => {
              const boxGeom = allBoxGeometries.find((bg) => bg.boxId === bp.box.id);
              return {
                boxId: bp.box.id,
                boxName: bp.box.name,
                x: bp.x,
                y: bp.y,
                width: bp.dimensions.width,
                depth: bp.dimensions.depth,
                height: bp.dimensions.height,
                rotation: bp.rotation,
                trays:
                  boxGeom?.trayGeometries.map((t) => ({
                    trayId: t.trayId,
                    name: t.name,
                    letter: t.trayLetter,
                    x: t.placement.x,
                    y: t.placement.y,
                    width: t.placement.dimensions.width,
                    depth: t.placement.dimensions.depth
                  })) ?? []
              };
            }),
            looseTrays: arrangement.looseTrays.map((ltp) => {
              const looseGeom = allLooseTrayGeometries.find((lg) => lg.trayId === ltp.tray.id);
              return {
                trayId: ltp.tray.id,
                name: ltp.tray.name,
                letter: looseGeom?.trayLetter ?? '?',
                x: ltp.x,
                y: ltp.y,
                width: ltp.dimensions.width,
                depth: ltp.dimensions.depth,
                rotation: ltp.rotation
              };
            })
          };
        })
      };

      await fetch('/api/debug/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, computedLayout })
      });
    } catch (e) {
      // Silently ignore - this is just for debugging convenience
      console.debug('[Debug Save] Failed:', e);
    }
  }

  async function handleExportAll() {
    const allBoxes = getAllBoxes();
    const allLooseTrays = getAllLooseTrays();
    if (allBoxes.length === 0 && allLooseTrays.length === 0) return;

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

      // Download zip - use first box name, first loose tray name, or default
      const projectName =
        allBoxes[0]?.name?.toLowerCase().replace(/\s+/g, '-') ||
        allLooseTrays[0]?.name?.toLowerCase().replace(/\s+/g, '-') ||
        'counterslayer';
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}-stls.zip`;
      a.click();
      URL.revokeObjectURL(url);

      removeToast(loadingToast);
      addToast({
        data: {
          title: 'STL export complete',
          body: `Downloaded ${files.length} files as zip`,
          type: 'success'
        }
      });
    } catch (e) {
      removeToast(loadingToast);
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
    if (getAllBoxes().length === 0 && getAllLooseTrays().length === 0) return;

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

      removeToast(loadingToast);
      addToast({
        data: {
          title: '3MF export complete',
          body: `Downloaded ${filename}`,
          type: 'success'
        }
      });
    } catch (e) {
      removeToast(loadingToast);
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
    const allBoxes = getAllBoxes();
    const allLooseTrays = getAllLooseTrays();
    if (allBoxes.length === 0 && allLooseTrays.length === 0) return;

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
      for (let boxIdx = 0; boxIdx < allBoxes.length; boxIdx++) {
        const box = allBoxes[boxIdx];
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
          const trayLetter = getTrayLetterById(project.layers, placement.tray.id) || 'A';

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
            selectedTrayCounters = getCounterPositions(placement.tray.params, counterShapes, maxHeight, spacerHeight);
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
            const dividerPositions = getCardDividerPositions(placement.tray.params, cardSizes, maxHeight, spacerHeight);
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
            selectedTrayCounters = getCardDrawPositions(placement.tray.params, cardSizes, maxHeight, spacerHeight);
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
          const boundsWidth = placement.rotated ? placement.dimensions.depth : placement.dimensions.width;
          const boundsDepth = placement.rotated ? placement.dimensions.width : placement.dimensions.depth;
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

      // Capture loose trays
      for (let looseIdx = 0; looseIdx < allLooseTrays.length; looseIdx++) {
        const looseTray = allLooseTrays[looseIdx];
        const trayLetter = getTrayLetterById(project.layers, looseTray.id) || 'A';
        const dims = getTrayDimensionsForTray(looseTray, cardSizes, counterShapes);
        const maxHeight = dims.height;
        const spacerHeight = 0; // No spacer for loose trays

        // Generate geometry for this tray based on tray type
        let jscadGeom;
        const showEmboss = looseTray.showEmboss ?? true;
        if (isCounterTray(looseTray)) {
          jscadGeom = createCounterTray(
            looseTray.params,
            counterShapes,
            looseTray.name,
            maxHeight,
            spacerHeight,
            showEmboss
          );
          selectedTrayCounters = getCounterPositions(looseTray.params, counterShapes, maxHeight, spacerHeight);
        } else if (isCardDividerTray(looseTray)) {
          const showStackLabels = looseTray.showStackLabels ?? true;
          jscadGeom = createCardDividerTray(
            looseTray.params,
            cardSizes,
            looseTray.name,
            maxHeight,
            spacerHeight,
            showEmboss,
            showStackLabels
          );
          const dividerPositions = getCardDividerPositions(looseTray.params, cardSizes, maxHeight, spacerHeight);
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
        } else if (isCardTray(looseTray)) {
          jscadGeom = createCardDrawTray(
            looseTray.params,
            cardSizes,
            looseTray.name,
            maxHeight,
            spacerHeight,
            showEmboss
          );
          selectedTrayCounters = getCardDrawPositions(looseTray.params, cardSizes, maxHeight, spacerHeight);
        } else if (isCupTray(looseTray)) {
          jscadGeom = createCupTray(looseTray.params, looseTray.name, maxHeight, spacerHeight, showEmboss);
          selectedTrayCounters = []; // Cup trays don't have counter positions
        } else {
          continue;
        }

        // Set up scene for this tray
        selectedTrayGeometry = jscadToBufferGeometry(jscadGeom);
        captureTrayLetter = trayLetter;

        // Enable capture mode for fixed top-down label rotation
        captureFunction.setCaptureMode?.(true);

        // Wait for render
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => setTimeout(r, 200));

        // Capture screenshot
        const dataUrl = captureFunction({
          width: 1920,
          height: 1080,
          backgroundColor: '#f0f0f0',
          bounds: {
            width: dims.width,
            depth: dims.depth,
            height: dims.height
          }
        });

        screenshots.push({
          boxIndex: -1, // -1 indicates loose tray
          trayIndex: looseIdx,
          trayLetter,
          dataUrl
        });
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

      removeToast(loadingToast);
      addToast({
        data: {
          title: 'PDF export complete',
          body: `Reference PDF with ${screenshots.length} tray screenshots`,
          type: 'success'
        }
      });
    } catch (e) {
      removeToast(loadingToast);
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

    // Check if this is a loose tray
    const trayLocation = tray ? findTrayLocation(project, tray.id) : null;
    const isLoose = trayLocation && trayLocation.boxId === null;

    // For loose trays, we don't need a box
    if (!tray || !selectedTrayGeometry) {
      addToast({
        data: {
          title: 'Debug export failed',
          body: 'No tray selected or geometry not generated',
          type: 'danger'
        }
      });
      return;
    }

    // For boxed trays, we need a box
    if (!isLoose && !box) {
      addToast({
        data: {
          title: 'Debug export failed',
          body: 'No box selected',
          type: 'danger'
        }
      });
      return;
    }

    debugExporting = true;

    const loadingToast = addToast({
      data: {
        title: 'Debug export',
        body: 'Exporting files...',
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

      // Compute layer arrangements to get global positions
      const layerArrangements = project.layers.map((layer) =>
        arrangeLayerContents(layer, {
          gameContainerWidth,
          gameContainerDepth,
          cardSizes: project.cardSizes || [],
          counterShapes: project.counterShapes || []
        })
      );

      // Build computed layout with global positions for ALL items
      const computedLayout = {
        timestamp: new Date().toISOString(),
        selectedBoxId: box?.id ?? null,
        selectedTrayId: tray.id,
        gameContainer: {
          width: gameContainerWidth,
          depth: gameContainerDepth
        },
        layers: project.layers.map((layer, layerIdx) => {
          const arrangement = layerArrangements[layerIdx];
          return {
            layerId: layer.id,
            layerName: layer.name,
            layerHeight: arrangement.layerHeight,
            boxes: arrangement.boxes.map((bp) => {
              const boxGeom = allBoxGeometries.find((bg) => bg.boxId === bp.box.id);
              const interiorWidth = bp.dimensions.width - bp.box.wallThickness * 2;
              const interiorDepth = bp.dimensions.depth - bp.box.wallThickness * 2;
              return {
                boxId: bp.box.id,
                boxName: bp.box.name,
                x: bp.x,
                y: bp.y,
                width: bp.dimensions.width,
                depth: bp.dimensions.depth,
                height: bp.dimensions.height,
                rotation: bp.rotation,
                interior: { width: interiorWidth, depth: interiorDepth },
                trays:
                  boxGeom?.trayGeometries.map((t) => ({
                    trayId: t.trayId,
                    name: t.name,
                    letter: t.trayLetter,
                    color: t.color,
                    xInBox: t.placement.x,
                    yInBox: t.placement.y,
                    width: t.placement.dimensions.width,
                    depth: t.placement.dimensions.depth,
                    height: t.placement.dimensions.height,
                    rotated: t.placement.rotated
                  })) ?? []
              };
            }),
            looseTrays: arrangement.looseTrays.map((ltp) => {
              const looseGeom = allLooseTrayGeometries.find((lg) => lg.trayId === ltp.tray.id);
              return {
                trayId: ltp.tray.id,
                name: ltp.tray.name,
                letter: looseGeom?.trayLetter ?? '?',
                color: ltp.tray.color,
                x: ltp.x,
                y: ltp.y,
                width: ltp.dimensions.width,
                depth: ltp.dimensions.depth,
                height: ltp.dimensions.height,
                rotation: ltp.rotation
              };
            })
          };
        })
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
          computedLayout,
          screenshot
        })
      });

      const result = await response.json();

      removeToast(loadingToast);
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
      removeToast(loadingToast);
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
      regenerate(true);
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
    const allBoxes = getAllBoxes();
    if (allBoxes.length === 0) return '';
    return JSON.stringify({
      layers: project.layers.map((layer) => ({
        id: layer.id,
        boxes: layer.boxes.map((box) => ({
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
        })),
        looseTrays: layer.looseTrays.map((t) => ({
          id: t.id,
          name: t.name,
          params: t.params,
          showEmboss: t.showEmboss
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

  // Track true structural changes (layers/boxes/trays added, deleted, or moved)
  let structureHash = $derived.by(() => {
    const project = getProject();
    return JSON.stringify({
      layerIds: project.layers.map((l) => l.id),
      // Include full layer->box->tray mapping to detect moves
      layerMapping: project.layers.map((l) => ({
        layerId: l.id,
        boxes: l.boxes.map((b) => ({
          boxId: b.id,
          trayIds: b.trays.map((t) => t.id)
        })),
        looseTrayIds: l.looseTrays.map((t) => t.id)
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

      // Verify the selected tray exists in the selected box (or is a loose tray)
      let _selectedBox = null;
      let selectedTray = null;
      for (const layer of project.layers) {
        const box = layer.boxes.find((b) => b.id === project.selectedBoxId);
        if (box) {
          _selectedBox = box;
          selectedTray = box.trays.find((t) => t.id === project.selectedTrayId);
          break;
        }
        // Check loose trays
        const looseTray = layer.looseTrays.find((t) => t.id === project.selectedTrayId);
        if (looseTray) {
          selectedTray = looseTray;
          break;
        }
      }

      // Valid selection: either a tray in a box, or a loose tray
      // For loose trays, selectedBox is null but selectedTray is set
      if (selectedTray) {
        const selectionChanged = selHash !== lastSelectionHash;
        const structureChanged = strHash !== lastStructureHash;
        lastSelectionHash = selHash;
        lastStructureHash = strHash;

        if (!hasInitialized) {
          hasInitialized = true;
          console.debug('[Geometry Trigger] Initial load - forcing regeneration');
          regenerate(true); // Force on initial load
        } else if (structureChanged) {
          // Force regeneration only for true structural changes (add/delete/move)
          console.debug('[Geometry Trigger] Structure changed - forcing regeneration');
          regenerate(true);
        } else if (selectionChanged) {
          // Selection-only changes should use the cache
          console.debug('[Geometry Trigger] Selection changed - using cache');
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
    const interiorWidth = gameContainerWidth - wallOffset;
    const interiorDepth = gameContainerDepth - wallOffset;

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

  // Layer Layout Editor handlers
  let isLayerLayoutEditMode = $derived.by(() => layerLayoutEditorState.isEditMode);

  function handleEnterLayerLayoutEdit() {
    const layer = getSelectedLayer();
    if (!layer) return;

    const project = getProject();
    const cardSizes = project.cardSizes ?? [];
    const counterShapes = project.counterShapes ?? [];

    // Get current layer arrangement
    const arrangement = arrangeLayerContents(layer, {
      gameContainerWidth,
      gameContainerDepth,
      cardSizes,
      counterShapes
    });

    enterLayerEditMode(arrangement.boxes, arrangement.looseTrays, gameContainerWidth, gameContainerDepth);
  }

  function handleSaveLayerLayout() {
    const layer = getSelectedLayer();
    if (!layer) return;

    // Build items for overlap check
    const items: LayerItemForSnapping[] = [];
    for (const bp of layerLayoutEditorState.workingBoxPlacements) {
      const isRotated = bp.rotation === 90 || bp.rotation === 270;
      items.push({
        id: bp.boxId,
        x: bp.x,
        y: bp.y,
        width: isRotated ? bp.originalDepth : bp.originalWidth,
        depth: isRotated ? bp.originalWidth : bp.originalDepth
      });
    }
    for (const ltp of layerLayoutEditorState.workingLooseTrayPlacements) {
      const isRotated = ltp.rotation === 90 || ltp.rotation === 270;
      items.push({
        id: ltp.trayId,
        x: ltp.x,
        y: ltp.y,
        width: isRotated ? ltp.originalDepth : ltp.originalWidth,
        depth: isRotated ? ltp.originalWidth : ltp.originalDepth
      });
    }

    const overlaps = findLayerOverlaps(items);

    if (overlaps.length > 0) {
      const allPlacements = [
        ...layerLayoutEditorState.workingBoxPlacements.map((p) => ({ id: p.boxId, name: p.name })),
        ...layerLayoutEditorState.workingLooseTrayPlacements.map((p) => ({ id: p.trayId, name: p.name }))
      ];
      const overlapNames = overlaps.map(([id1, id2]) => {
        const item1 = allPlacements.find((p) => p.id === id1);
        const item2 = allPlacements.find((p) => p.id === id2);
        return `${item1?.name ?? 'Unknown'} and ${item2?.name ?? 'Unknown'}`;
      });
      addToast({
        data: {
          title: 'Cannot save layout',
          body: `Items are overlapping: ${overlapNames.join(', ')}`,
          type: 'danger'
        }
      });
      return;
    }

    const placements = getManualLayerPlacements();
    saveLayerLayout(layer.id, placements.boxes, placements.looseTrays);
    exitLayerEditMode();
    regenerate(true);
  }

  function handleCancelLayerLayout() {
    cancelLayerChanges();
    exitLayerEditMode();
  }

  function handleResetAutoLayerLayout() {
    const layer = getSelectedLayer();
    if (!layer) return;

    clearLayerLayout(layer.id);
    exitLayerEditMode();
    regenerate(true);
  }

  function handleRotateLayerItem() {
    rotateSelectedItem();
  }

  // Auto-cancel layer edit mode when navigating away
  let lastSelectedLayerId = $state<string | null>(null);
  $effect(() => {
    const currentLayerId = selectedLayer?.id ?? null;
    const currentViewMode = viewMode;

    if (layerLayoutEditorState.isEditMode) {
      const layerChanged = lastSelectedLayerId !== null && currentLayerId !== lastSelectedLayerId;
      const leftLayerView = currentViewMode !== 'layer';

      if (layerChanged || leftLayerView) {
        cancelLayerChanges();
        exitLayerEditMode();
      }
    }

    lastSelectedLayerId = currentLayerId;
  });

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
  <title>Counter Slayer - design inserts for your board games</title>
  <meta
    name="description"
    content="Design and 3D print custom inserts for board game boxes to organize your components. Create trays for cards, tokens, and miniatures with adjustable layouts."
  />
</svelte:head>

{#if isMobile}
  <!-- MOBILE LAYOUT: Vertical PaneGroup with manual collapse control -->
  <PaneGroup direction="vertical" class="paneGroup">
    <!-- Mobile Nav Pane (top) -->
    <Pane defaultSize={0} minSize={0} maxSize={50} bind:this={mobileNavPane}>
      <div class="mobilePanelContent">
        <NavigationMenu {selectionType} onSelectionChange={handleSelectionChange} onExpandPanel={() => {}} {isMobile} />
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
              allLooseTrays={visibleGeometries.allLooseTrays}
              boxGeometry={visibleGeometries.box}
              lidGeometry={visibleGeometries.lid}
              {gameContainerWidth}
              {gameContainerDepth}
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
              {isLayerLayoutEditMode}
              onTrayDoubleClick={handleTrayDoubleClick}
              onBoxDoubleClick={handleBoxDoubleClick}
              showLayerView={visibleGeometries.showLayerView}
              layerBoxPlacements={visibleGeometries.layerBoxPlacements}
              layerLooseTrayPlacements={visibleGeometries.layerLooseTrayPlacements}
              showAllLayers={visibleGeometries.showAllLayers}
              allLayerArrangements={visibleGeometries.allLayerArrangements}
              {allLayersExplosionAmount}
              {generating}
              debugMode={debugParams.debugMode}
              cameraPreset={debugParams.cameraPreset}
              cameraPosition={debugParams.cameraPosition}
              cameraLookAt={debugParams.cameraLookAt}
              cameraZoom={debugParams.cameraZoom}
              debugMarkers={debugParams.debugMarkers}
              hideUI={debugParams.hideUI}
            />
          {/await}
        {/if}

        {#if generating && !debugParams.hideUI}
          <div class="generatingOverlay">
            <Loader />
            <div class="generatingText">Generating geometry...</div>
          </div>
        {/if}

        {#if !generating}
          <div data-testid="geometry-ready" style="display: none;"></div>
        {/if}

        {#if viewMode === 'layer' && !generating}
          <div class="viewToolbar">
            <LayerLayoutEditorOverlay
              onEnterEdit={handleEnterLayerLayoutEdit}
              onSave={handleSaveLayerLayout}
              onCancel={handleCancelLayerLayout}
              onResetAuto={handleResetAutoLayerLayout}
              onRotate={handleRotateLayerItem}
              canEdit={(layerArrangement?.boxes.length ?? 0) + (layerArrangement?.looseTrays.length ?? 0) > 1}
            />
          </div>
        {/if}

        {#if viewMode === 'all-no-lid' && !generating && allLayerArrangements.length > 1}
          <div class="viewToolbar">
            <div class="sliderContainer">
              <span class="sliderLabel">Explode</span>
              <InputSlider min={0} max={100} bind:value={allLayersExplosionAmount} />
            </div>
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

        {#if !isLayoutEditMode && !isLayerLayoutEditMode}
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
                  <Button variant="ghost" onclick={handleExportJson} style="width: 100%; justify-content: flex-start;">
                    Export project JSON
                  </Button>
                  <Hr />
                  <Button
                    variant="ghost"
                    onclick={handleExportAll}
                    disabled={generating ||
                      exportingStl ||
                      (getAllBoxes().length === 0 && getAllLooseTrays().length === 0)}
                    isLoading={exportingStl}
                    style="width: 100%; justify-content: flex-start;"
                  >
                    {exportingStl ? exportStlProgress : 'Export STLs'}
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleExportPdf}
                    disabled={(getAllBoxes().length === 0 && getAllLooseTrays().length === 0) || exportingPdf}
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
                      {debugExporting ? 'Exporting...' : 'Debug for Claude'}
                    </Button>
                  {/if}
                  <Hr />
                  <Button variant="danger" onclick={handleReset} style="width: 100%; justify-content: flex-start;">
                    Clear current project
                  </Button>
                </div>
              {/snippet}
            </Popover>
            <div class="toolbarRight">
              <span class="regenerateButton {isDirty && !generating ? 'regenerateButton--dirty' : ''}">
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
        <EditorPanel {selectionType} {isLayoutEditMode} {gameContainerWidth} {gameContainerDepth} />
      </div>
    </Pane>
  </PaneGroup>
{:else}
  <!-- DESKTOP LAYOUT: PaneGroup with resizable panels -->
  {#if !debugParams.hideUI}
    <NavigationMenu
      {selectionType}
      onSelectionChange={handleSelectionChange}
      onExpandPanel={handleExpandPanel}
      {isMobile}
    />
  {/if}

  <PaneGroup direction="horizontal" class="paneGroup">
    <Pane defaultSize={debugParams.hideUI ? 100 : 75} minSize={30}>
      <main class="mainView">
        {#if browser}
          {#await import('$lib/components/TrayViewer.svelte') then { default: TrayViewer }}
            <TrayViewer
              geometry={visibleGeometries.tray}
              allTrays={visibleGeometries.allTrays}
              allBoxes={visibleGeometries.allBoxes}
              allLooseTrays={visibleGeometries.allLooseTrays}
              boxGeometry={visibleGeometries.box}
              lidGeometry={visibleGeometries.lid}
              {gameContainerWidth}
              {gameContainerDepth}
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
              {isLayerLayoutEditMode}
              onTrayDoubleClick={handleTrayDoubleClick}
              onBoxDoubleClick={handleBoxDoubleClick}
              showLayerView={visibleGeometries.showLayerView}
              layerBoxPlacements={visibleGeometries.layerBoxPlacements}
              layerLooseTrayPlacements={visibleGeometries.layerLooseTrayPlacements}
              showAllLayers={visibleGeometries.showAllLayers}
              allLayerArrangements={visibleGeometries.allLayerArrangements}
              {allLayersExplosionAmount}
              {generating}
              debugMode={debugParams.debugMode}
              cameraPreset={debugParams.cameraPreset}
              cameraPosition={debugParams.cameraPosition}
              cameraLookAt={debugParams.cameraLookAt}
              cameraZoom={debugParams.cameraZoom}
              debugMarkers={debugParams.debugMarkers}
              hideUI={debugParams.hideUI}
            />
          {/await}
        {/if}

        {#if generating && !debugParams.hideUI}
          <div class="generatingOverlay">
            <Loader />
            <div class="generatingText">Generating geometry...</div>
          </div>
        {/if}

        {#if !generating}
          <div data-testid="geometry-ready" style="display: none;"></div>
        {/if}

        {#if viewMode === 'layer' && !generating && !debugParams.hideUI}
          <div class="viewToolbar">
            <LayerLayoutEditorOverlay
              onEnterEdit={handleEnterLayerLayoutEdit}
              onSave={handleSaveLayerLayout}
              onCancel={handleCancelLayerLayout}
              onResetAuto={handleResetAutoLayerLayout}
              onRotate={handleRotateLayerItem}
              canEdit={(layerArrangement?.boxes.length ?? 0) + (layerArrangement?.looseTrays.length ?? 0) > 1}
            />
          </div>
        {/if}

        {#if viewMode === 'all-no-lid' && !generating && !debugParams.hideUI}
          <div class="viewToolbar">
            <div class="sliderContainer">
              <span class="sliderLabel">Explode</span>
              <InputSlider min={0} max={100} bind:value={allLayersExplosionAmount} />
            </div>
          </div>
        {/if}

        {#if (viewMode === 'exploded' || viewMode === 'all') && !generating && !debugParams.hideUI}
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

        {#if !debugParams.hideUI}
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
                  <Button variant="ghost" onclick={handleExportJson} style="width: 100%; justify-content: flex-start;">
                    Export project JSON
                  </Button>
                  <Hr />
                  <Button
                    variant="ghost"
                    onclick={handleExportAll}
                    disabled={generating ||
                      exportingStl ||
                      (getAllBoxes().length === 0 && getAllLooseTrays().length === 0)}
                    isLoading={exportingStl}
                    style="width: 100%; justify-content: flex-start;"
                  >
                    {exportingStl ? exportStlProgress : 'Export STLs'}
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleExport3mf}
                    disabled={generating ||
                      exporting3mf ||
                      (getAllBoxes().length === 0 && getAllLooseTrays().length === 0)}
                    isLoading={exporting3mf}
                    style="width: 100%; justify-content: flex-start;"
                  >
                    {exporting3mf ? 'Generating 3MF...' : 'Export 3MF'}
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={handleExportPdf}
                    disabled={(getAllBoxes().length === 0 && getAllLooseTrays().length === 0) || exportingPdf}
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
                      {debugExporting ? 'Exporting...' : 'Debug for Claude'}
                    </Button>
                  {/if}
                  <Hr />
                  <Button variant="danger" onclick={handleReset} style="width: 100%; justify-content: flex-start;">
                    Clear current project
                  </Button>
                </div>
              {/snippet}
            </Popover>
            {#if !isLayoutEditMode && !isLayerLayoutEditMode}
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
        {/if}

        {#if error && !debugParams.hideUI}
          <div class="errorBanner">
            {error}
          </div>
        {/if}
      </main>
    </Pane>

    {#if !debugParams.hideUI}
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
        <EditorPanel {selectionType} {isLayoutEditMode} {gameContainerWidth} {gameContainerDepth} />
      </Pane>
    {/if}
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
