import {
  DEFAULT_CARD_SIZE_IDS,
  DEFAULT_SHAPE_IDS,
  defaultParams,
  type CounterTrayParams,
  type EdgeLoadedStackDef,
  type TopLoadedStackDef
} from '$lib/models/counterTray';
import { defaultLidParams } from '$lib/models/lid';
import {
  DEFAULT_CARD_SIZES,
  DEFAULT_COUNTER_SHAPES,
  DEFAULT_COUNTER_THICKNESS,
  TRAY_COLORS
} from '$lib/stores/project.svelte';
import type { CupLayout } from '$lib/types/cupLayout';
import { gridToSplitLayout } from '$lib/types/cupLayout';
import type { Box, CardSize, CounterShape, Layer, LegacyProject, LidParams, Project, Tray } from '$lib/types/project';
import { isLegacyProject } from '$lib/types/project';
const STORAGE_KEY = 'counter-tray-project';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function saveProject(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch (e) {
    console.error('Failed to save project:', e);
  }
}

// Merge stored lidParams with defaults to handle missing fields from older saves
function migrateLidParams(stored: Partial<LidParams> | undefined): LidParams {
  return {
    ...defaultLidParams,
    ...stored
  };
}

// Old format params that may be present in legacy data
interface LegacyTrayParams {
  squareWidth?: number;
  squareLength?: number;
  hexFlatToFlat?: number;
  circleDiameter?: number;
  triangleSide?: number;
  triangleCornerRadius?: number;
  hexPointyTop?: boolean;
  stacks?: [string, number][];
  customShapes?: LegacyCustomShape[];
  customCardSizes?: LegacyCardSize[];
}

interface LegacyCustomShape {
  name: string;
  baseShape: 'rectangle' | 'square' | 'circle' | 'hex' | 'triangle';
  width: number;
  length: number;
  cornerRadius?: number;
  pointyTop?: boolean;
}

interface LegacyCardSize {
  name: string;
  width: number;
  length: number;
  thickness: number;
}

// Legacy card tray params
interface LegacyCardTrayParams {
  cardSizeName?: string;
  cardSizeId?: string;
}

// Legacy cup tray params (old format with individual cup dimensions or rows/columns)
interface LegacyCupTrayParams {
  cupWidth?: number;
  cupDepth?: number;
  cupHeight?: number;
  rows?: number;
  columns?: number;
  trayWidth?: number;
  trayDepth?: number;
  cupCavityHeight?: number | null;
  layout?: CupLayout;
  wallThickness?: number;
  floorThickness?: number;
  cornerRadius?: number;
}

// Legacy card divider stack
interface LegacyCardDividerStack {
  cardSizeName?: string;
  cardSizeId?: string;
  count: number;
  label?: string;
}

// Build a mapping from old shape names (custom:Name) to new IDs
function buildShapeIdMapping(counterShapes: CounterShape[]): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const shape of counterShapes) {
    mapping.set(`custom:${shape.name}`, shape.id);
    mapping.set(shape.name, shape.id);
  }
  // Add mappings for old basic shape names
  mapping.set('square', DEFAULT_SHAPE_IDS.square);
  mapping.set('hex', DEFAULT_SHAPE_IDS.hex);
  mapping.set('circle', DEFAULT_SHAPE_IDS.circle);
  mapping.set('triangle', DEFAULT_SHAPE_IDS.triangle);
  return mapping;
}

// Build a mapping from old card size names to new IDs
function buildCardSizeIdMapping(cardSizes: CardSize[]): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const cardSize of cardSizes) {
    mapping.set(cardSize.name, cardSize.id);
  }
  return mapping;
}

// Extract counter shapes from old format (stored in counter tray params)
function extractCounterShapesFromLegacy(boxes: Box[]): CounterShape[] {
  // First, get the default thickness from any counter tray
  let legacyThickness = DEFAULT_COUNTER_THICKNESS;
  for (const box of boxes) {
    for (const tray of box.trays) {
      if (tray.type === 'counter') {
        const params = tray.params as CounterTrayParams;
        if (params.counterThickness && params.counterThickness > 0) {
          legacyThickness = params.counterThickness;
          break;
        }
      }
    }
    if (legacyThickness !== DEFAULT_COUNTER_THICKNESS) break;
  }

  for (const box of boxes) {
    for (const tray of box.trays) {
      const legacyParams = (tray as { params?: LegacyTrayParams }).params;
      if (legacyParams?.customShapes && legacyParams.customShapes.length > 0) {
        return legacyParams.customShapes.map((shape) => ({
          id: generateId(),
          name: shape.name,
          baseShape: shape.baseShape,
          width: shape.width,
          length: shape.length,
          thickness: legacyThickness,
          cornerRadius: shape.cornerRadius,
          pointyTop: shape.pointyTop
        }));
      }
    }
  }
  // Return defaults if no legacy shapes found
  return DEFAULT_COUNTER_SHAPES.map((s) => ({ ...s }));
}

// Extract card sizes from old format (stored in counter tray params)
function extractCardSizesFromLegacy(boxes: Box[]): CardSize[] {
  for (const box of boxes) {
    for (const tray of box.trays) {
      const legacyParams = (tray as { params?: LegacyTrayParams }).params;
      if (legacyParams?.customCardSizes && legacyParams.customCardSizes.length > 0) {
        return legacyParams.customCardSizes.map((cardSize) => ({
          id: generateId(),
          name: cardSize.name,
          width: cardSize.width,
          length: cardSize.length,
          thickness: cardSize.thickness
        }));
      }
    }
  }
  // Return defaults if no legacy card sizes found
  return DEFAULT_CARD_SIZES.map((s) => ({ ...s }));
}

// Migrate counter tray params to new format (remove customShapes/customCardSizes, update stack refs)
function migrateCounterTrayParams(
  params: CounterTrayParams & LegacyTrayParams,
  shapeIdMapping: Map<string, string>
): CounterTrayParams {
  const migrated = { ...defaultParams, ...params };

  // Handle migration from old 'stacks' field to 'topLoadedStacks'
  if (params.stacks && !params.topLoadedStacks) {
    migrated.topLoadedStacks = params.stacks as TopLoadedStackDef[];
  }

  // Ensure edgeLoadedStacks exists
  if (!migrated.edgeLoadedStacks) {
    migrated.edgeLoadedStacks = [];
  }

  // Update stack references from names to IDs
  migrated.topLoadedStacks = migrated.topLoadedStacks.map(([shapeRef, count, label]) => {
    const newId = shapeIdMapping.get(shapeRef) ?? shapeRef;
    return [newId, count, label] as TopLoadedStackDef;
  });

  migrated.edgeLoadedStacks = migrated.edgeLoadedStacks.map(([shapeRef, count, orient, label]) => {
    const newId = shapeIdMapping.get(shapeRef) ?? shapeRef;
    return [newId, count, orient, label] as EdgeLoadedStackDef;
  });

  // Remove old fields that are now at project level
  delete (migrated as LegacyTrayParams).customShapes;
  delete (migrated as LegacyTrayParams).customCardSizes;

  // Remove very old params
  delete (migrated as LegacyTrayParams).squareWidth;
  delete (migrated as LegacyTrayParams).squareLength;
  delete (migrated as LegacyTrayParams).hexFlatToFlat;
  delete (migrated as LegacyTrayParams).circleDiameter;
  delete (migrated as LegacyTrayParams).triangleSide;
  delete (migrated as LegacyTrayParams).triangleCornerRadius;
  delete (migrated as LegacyTrayParams).hexPointyTop;
  delete (migrated as LegacyTrayParams).stacks;

  // Remove deprecated extra tray params (now handled by cup trays)
  delete (migrated as { extraTrayCols?: number }).extraTrayCols;
  delete (migrated as { extraTrayRows?: number }).extraTrayRows;

  // Migrate printBedSize to gameContainerWidth/gameContainerDepth
  // Check the ORIGINAL params (not migrated) to see if it has old format
  const legacyPrintBedSize = (params as { printBedSize?: number }).printBedSize;
  const originalHasNewFormat = (params as { gameContainerWidth?: number }).gameContainerWidth !== undefined;
  if (legacyPrintBedSize !== undefined && !originalHasNewFormat) {
    migrated.gameContainerWidth = legacyPrintBedSize;
    migrated.gameContainerDepth = legacyPrintBedSize;
  }
  delete (migrated as { printBedSize?: number }).printBedSize;

  return migrated;
}

// Migrate card draw tray params to use cardSizeId
function migrateCardDrawTrayParams(
  params: LegacyCardTrayParams,
  cardSizeIdMapping: Map<string, string>
): { cardSizeId: string } {
  // If already has cardSizeId, keep it
  if (params.cardSizeId) {
    return { cardSizeId: params.cardSizeId };
  }
  // Migrate from cardSizeName
  if (params.cardSizeName) {
    const id = cardSizeIdMapping.get(params.cardSizeName);
    if (id) {
      return { cardSizeId: id };
    }
  }
  // Fallback to Standard
  return { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard };
}

// Migrate cup tray params from old format (cupWidth/cupDepth/cupHeight or rows/columns) to new format (layout)
function migrateCupTrayParams(params: LegacyCupTrayParams): {
  layout: CupLayout;
  trayWidth: number;
  trayDepth: number;
  cupCavityHeight: number | null;
  wallThickness: number;
  floorThickness: number;
  cornerRadius: number;
} {
  const wallThickness = params.wallThickness ?? 2.0;
  const floorThickness = params.floorThickness ?? 2.0;
  const cornerRadius = params.cornerRadius ?? 6;

  // Check if already has layout (new format)
  if (params.layout) {
    return {
      layout: params.layout,
      trayWidth: params.trayWidth ?? 89,
      trayDepth: params.trayDepth ?? 89,
      cupCavityHeight: params.cupCavityHeight ?? null,
      wallThickness,
      floorThickness,
      cornerRadius
    };
  }

  // Check if has rows/columns (intermediate format) - convert to layout
  if (params.rows !== undefined && params.columns !== undefined && params.trayWidth !== undefined) {
    const rows = params.rows;
    const columns = params.columns;
    return {
      layout: gridToSplitLayout(rows, columns),
      trayWidth: params.trayWidth,
      trayDepth: params.trayDepth ?? 89,
      cupCavityHeight: params.cupCavityHeight ?? null,
      wallThickness,
      floorThickness,
      cornerRadius
    };
  }

  // Oldest format: cupWidth/cupDepth/cupHeight
  const rows = params.rows ?? 2;
  const columns = params.columns ?? 2;
  const cupWidth = params.cupWidth ?? 40;
  const cupDepth = params.cupDepth ?? 40;
  const cupHeight = params.cupHeight ?? 25;

  // Calculate tray dimensions from cup dimensions
  // trayWidth = wall + (columns * cupWidth) + ((columns - 1) * wall) + wall
  const trayWidth = wallThickness + columns * cupWidth + (columns - 1) * wallThickness + wallThickness;
  const trayDepth = wallThickness + rows * cupDepth + (rows - 1) * wallThickness + wallThickness;

  return {
    layout: gridToSplitLayout(rows, columns),
    trayWidth,
    trayDepth,
    cupCavityHeight: cupHeight, // Preserve explicit height from old format
    wallThickness,
    floorThickness,
    cornerRadius
  };
}

// Migrate card divider stacks to use cardSizeId
function migrateCardDividerStacks(
  stacks: LegacyCardDividerStack[],
  cardSizeIdMapping: Map<string, string>
): Array<{ cardSizeId: string; count: number; label?: string }> {
  return stacks.map((stack) => {
    // If already has cardSizeId, keep it
    if (stack.cardSizeId) {
      return { cardSizeId: stack.cardSizeId, count: stack.count, label: stack.label };
    }
    // Migrate from cardSizeName
    if (stack.cardSizeName) {
      const id = cardSizeIdMapping.get(stack.cardSizeName);
      if (id) {
        return { cardSizeId: id, count: stack.count, label: stack.label };
      }
    }
    // Fallback to Standard
    return { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard, count: stack.count, label: stack.label };
  });
}

// Migrate a tray to ensure all fields have valid values
function migrateTray(
  tray: Tray,
  cumulativeIndex: number,
  shapeIdMapping: Map<string, string>,
  cardSizeIdMapping: Map<string, string>
): Tray {
  const trayType = (tray as { type?: string }).type;
  const color = tray.color || TRAY_COLORS[cumulativeIndex % TRAY_COLORS.length];

  if (trayType === 'card' || trayType === 'cardDraw') {
    // Card draw tray - migrate params
    const legacyParams = (tray as { params: LegacyCardTrayParams }).params;
    const migratedCardParams = migrateCardDrawTrayParams(legacyParams, cardSizeIdMapping);
    return {
      ...tray,
      type: 'cardDraw',
      color,
      params: { ...legacyParams, ...migratedCardParams }
    } as Tray;
  }

  if (trayType === 'cardDivider') {
    // Card divider tray - migrate stacks
    const params = (tray as { params: { stacks: LegacyCardDividerStack[] } }).params;
    const migratedStacks = migrateCardDividerStacks(params.stacks, cardSizeIdMapping);
    return {
      ...tray,
      type: 'cardDivider',
      color,
      params: { ...params, stacks: migratedStacks }
    } as Tray;
  }

  if (trayType === 'cup') {
    const legacyParams = (tray as { params: LegacyCupTrayParams }).params;
    return {
      ...tray,
      type: 'cup',
      color,
      params: migrateCupTrayParams(legacyParams)
    } as Tray;
  }

  if (trayType === 'cardWell') {
    // Card well tray - no migration needed, just ensure color is set
    return {
      ...tray,
      color
    } as Tray;
  }

  // Counter tray (either explicit or migrated from old format)
  return {
    ...tray,
    type: 'counter',
    color,
    params: migrateCounterTrayParams((tray as { params: CounterTrayParams & LegacyTrayParams }).params, shapeIdMapping)
  } as Tray;
}

// Migrate a box to ensure all fields have valid values
function migrateBox(
  box: Box,
  cumulativeStartIndex: number,
  shapeIdMapping: Map<string, string>,
  cardSizeIdMapping: Map<string, string>
): Box {
  return {
    ...box,
    trays: box.trays.map((tray, idx) =>
      migrateTray(tray, cumulativeStartIndex + idx, shapeIdMapping, cardSizeIdMapping)
    ),
    lidParams: migrateLidParams(box.lidParams)
  };
}

// Get all boxes from a project (handles both legacy and new formats)
function getBoxesFromProject(project: Project | LegacyProject): Box[] {
  if (isLegacyProject(project)) {
    return project.boxes;
  }
  const boxes: Box[] = [];
  for (const layer of project.layers) {
    boxes.push(...layer.boxes);
  }
  return boxes;
}

// Get all trays from a project (handles both legacy and new formats)
function _getAllTraysFromProject(project: Project | LegacyProject): Tray[] {
  const boxes = getBoxesFromProject(project);
  const trays: Tray[] = [];
  for (const box of boxes) {
    trays.push(...box.trays);
  }
  // Include loose trays if new format
  if (!isLegacyProject(project)) {
    for (const layer of project.layers) {
      trays.push(...layer.looseTrays);
    }
  }
  return trays;
}

// Migrate a full project to ensure all fields have valid values
export function migrateProjectData(project: Project | LegacyProject): Project {
  // Check if project already has new format (counterShapes/cardSizes at project level)
  const hasCounterShapesAndCardSizes =
    Array.isArray((project as { counterShapes?: unknown }).counterShapes) &&
    Array.isArray((project as { cardSizes?: unknown }).cardSizes);

  // Get all boxes (from legacy or new format)
  const allBoxes = getBoxesFromProject(project);

  let counterShapes: CounterShape[];
  let cardSizes: CardSize[];

  if (hasCounterShapesAndCardSizes) {
    // Already migrated, just ensure arrays are valid
    counterShapes = (project as { counterShapes: CounterShape[] }).counterShapes;
    cardSizes = (project as { cardSizes: CardSize[] }).cardSizes;

    // Ensure all shapes/sizes have IDs
    counterShapes = counterShapes.map((s) => (s.id ? s : { ...s, id: generateId() }));
    cardSizes = cardSizes.map((s) => (s.id ? s : { ...s, id: generateId() }));
  } else {
    // Legacy format - extract from counter tray params
    counterShapes = extractCounterShapesFromLegacy(allBoxes);
    cardSizes = extractCardSizesFromLegacy(allBoxes);
  }

  // Ensure DEFAULT_CARD_SIZES are always present (they may be missing if cardSizes was empty)
  const existingCardSizeIds = new Set(cardSizes.map((s) => s.id));
  for (const defaultSize of DEFAULT_CARD_SIZES) {
    if (!existingCardSizeIds.has(defaultSize.id)) {
      cardSizes.push({ ...defaultSize });
    }
  }

  // Ensure DEFAULT_COUNTER_SHAPES are always present (they may be missing if counterShapes was empty)
  const existingShapeIds = new Set(counterShapes.map((s) => s.id));
  for (const defaultShape of DEFAULT_COUNTER_SHAPES) {
    if (!existingShapeIds.has(defaultShape.id)) {
      counterShapes.push({ ...defaultShape });
    }
  }

  // Migrate counterShapes to include thickness if missing
  // Get default thickness from first counter tray's params, or use default
  let defaultThickness = DEFAULT_COUNTER_THICKNESS;
  for (const box of allBoxes) {
    for (const tray of box.trays) {
      if (tray.type === 'counter') {
        const params = tray.params as CounterTrayParams;
        if (params.counterThickness && params.counterThickness > 0) {
          defaultThickness = params.counterThickness;
          break;
        }
      }
    }
    if (defaultThickness !== DEFAULT_COUNTER_THICKNESS) break;
  }
  counterShapes = counterShapes.map((s) => ({
    ...s,
    thickness: s.thickness ?? defaultThickness
  }));

  // Build ID mappings for migration
  const shapeIdMapping = buildShapeIdMapping(counterShapes);
  const cardSizeIdMapping = buildCardSizeIdMapping(cardSizes);

  // Migrate globalSettings from printBedSize to gameContainerWidth/gameContainerDepth
  let globalSettings = project.globalSettings;
  if (globalSettings) {
    const legacyPrintBedSize = (globalSettings as { printBedSize?: number }).printBedSize;
    if (legacyPrintBedSize !== undefined) {
      globalSettings = {
        gameContainerWidth: legacyPrintBedSize,
        gameContainerDepth: legacyPrintBedSize
      };
    }
  }

  // Handle legacy vs new format
  if (isLegacyProject(project)) {
    // Legacy format: wrap all boxes into a single layer
    let cumulativeIndex = 0;
    const migratedBoxes = project.boxes.map((box) => {
      const migratedBox = migrateBox(box, cumulativeIndex, shapeIdMapping, cardSizeIdMapping);
      cumulativeIndex += box.trays.length;
      return migratedBox;
    });

    // Create a single layer containing all boxes
    const layerId = generateId();
    const layer: Layer = {
      id: layerId,
      name: 'Layer 1',
      boxes: migratedBoxes,
      looseTrays: []
    };

    return {
      version: 2,
      layers: [layer],
      counterShapes,
      cardSizes,
      selectedLayerId: layerId,
      selectedBoxId: project.selectedBoxId,
      selectedTrayId: project.selectedTrayId,
      globalSettings
    };
  }

  // New format: migrate boxes within layers and loose trays
  let cumulativeIndex = 0;
  const migratedLayers = project.layers.map((layer) => {
    const migratedBoxes = layer.boxes.map((box) => {
      const migratedBox = migrateBox(box, cumulativeIndex, shapeIdMapping, cardSizeIdMapping);
      cumulativeIndex += box.trays.length;
      return migratedBox;
    });

    const migratedLooseTrays = layer.looseTrays.map((tray, idx) => {
      const migrated = migrateTray(tray, cumulativeIndex + idx, shapeIdMapping, cardSizeIdMapping);
      return migrated;
    });
    cumulativeIndex += layer.looseTrays.length;

    return {
      ...layer,
      boxes: migratedBoxes,
      looseTrays: migratedLooseTrays
    };
  });

  return {
    ...project,
    version: 2,
    layers: migratedLayers,
    counterShapes,
    cardSizes,
    globalSettings
  };
}

export function loadProject(): Project | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const project = JSON.parse(data) as Project;
      // Migrate to new format
      return migrateProjectData(project);
    }
  } catch (e) {
    console.error('Failed to load project:', e);
  }
  return null;
}

export function clearProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear project:', e);
  }
}

/**
 * Export project to JSON string.
 * Use for file downloads or clipboard operations.
 */
export function exportProjectToJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Import project from JSON string.
 * Handles migration from older formats automatically.
 * @throws {Error} if JSON is invalid
 */
export function importProjectFromJson(json: string): Project {
  const data = JSON.parse(json) as Project;
  return migrateProjectData(data);
}

// Re-export save manager functions for unified API
export { batchUpdates, flushPendingSave, hasPendingSave, saveNow, scheduleSave } from '$lib/stores/saveManager';
