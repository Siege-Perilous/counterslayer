import { defaultCardDividerTrayParams, type CardDividerTrayParams } from '$lib/models/cardDividerTray';
import { defaultCardDrawTrayParams, type CardDrawTrayParams } from '$lib/models/cardTray';
import {
  DEFAULT_CARD_SIZE_IDS,
  DEFAULT_SHAPE_IDS,
  defaultParams,
  type CounterTrayParams
} from '$lib/models/counterTray';
import { defaultCupTrayParams, type CupTrayParams } from '$lib/models/cupTray';
import { defaultLidParams } from '$lib/models/lid';
import { saveNow, scheduleSave } from '$lib/stores/saveManager';
import type {
  Box,
  CardDividerTray,
  CardDrawTray,
  CardSize,
  CardTray,
  CounterShape,
  CounterTray,
  CupTray,
  Layer,
  LidParams,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Project,
  Tray
} from '$lib/types/project';
import {
  findTrayLocation,
  isCardDividerTray,
  isCardDrawTray,
  isCardTray,
  isCounterTray,
  isCupTray,
  isLooseTray
} from '$lib/types/project';
import { loadProject, migrateProjectData } from '$lib/utils/storage';

export { findTrayLocation, isCardDividerTray, isCardDrawTray, isCardTray, isCounterTray, isCupTray, isLooseTray };
export type {
  Box,
  CardDividerTray,
  CardDrawTray,
  CardSize,
  CardTray,
  CounterShape,
  CounterTray,
  CupTray,
  Layer,
  LidParams,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Project,
  Tray
};

// Default counter thickness (used when migrating old shapes without thickness)
export const DEFAULT_COUNTER_THICKNESS = 1.3;

// Default counter shapes (global)
export const DEFAULT_COUNTER_SHAPES: CounterShape[] = [
  {
    id: DEFAULT_SHAPE_IDS.square,
    name: 'Square',
    baseShape: 'square',
    width: 15.9,
    length: 15.9,
    thickness: DEFAULT_COUNTER_THICKNESS
  },
  {
    id: DEFAULT_SHAPE_IDS.hex,
    name: 'Hex',
    baseShape: 'hex',
    width: 15.9,
    length: 15.9,
    thickness: DEFAULT_COUNTER_THICKNESS,
    pointyTop: false
  },
  {
    id: DEFAULT_SHAPE_IDS.circle,
    name: 'Circle',
    baseShape: 'circle',
    width: 15.9,
    length: 15.9,
    thickness: DEFAULT_COUNTER_THICKNESS
  },
  {
    id: DEFAULT_SHAPE_IDS.triangle,
    name: 'Triangle',
    baseShape: 'triangle',
    width: 15.9,
    length: 15.9,
    thickness: DEFAULT_COUNTER_THICKNESS,
    cornerRadius: 1.5
  }
];

// Default card sizes (global)
export const DEFAULT_CARD_SIZES: CardSize[] = [
  { id: DEFAULT_CARD_SIZE_IDS.standard, name: 'Standard', width: 66, length: 91, thickness: 0.5 },
  {
    id: DEFAULT_CARD_SIZE_IDS.miniAmerican,
    name: 'Mini American',
    width: 44,
    length: 66,
    thickness: 0.5
  },
  {
    id: DEFAULT_CARD_SIZE_IDS.miniEuropean,
    name: 'Mini European',
    width: 47,
    length: 71,
    thickness: 0.5
  },
  { id: DEFAULT_CARD_SIZE_IDS.euro, name: 'Euro', width: 62, length: 95, thickness: 0.5 },
  { id: DEFAULT_CARD_SIZE_IDS.japanese, name: 'Japanese', width: 62, length: 89, thickness: 0.5 },
  { id: DEFAULT_CARD_SIZE_IDS.tarot, name: 'Tarot', width: 73, length: 123, thickness: 0.5 },
  { id: DEFAULT_CARD_SIZE_IDS.square, name: 'Square', width: 73, length: 73, thickness: 0.5 }
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Generate a tray letter based on cumulative index across all layers.
 * A-Z for first 26, then AA, BB, CC... for 26+
 */
export function getTrayLetter(index: number): string {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  // For 26+, use AA, BB, CC, etc.
  const letter = String.fromCharCode(65 + (index % 26));
  const repeat = Math.floor(index / 26) + 1;
  return letter.repeat(repeat);
}

/**
 * Get cumulative tray index across all layers.
 * Order: For each layer, count box trays first, then loose trays.
 */
export function getCumulativeTrayIndexForTray(layers: Layer[], trayId: string): number {
  let cumulative = 0;
  for (const layer of layers) {
    // Count box trays
    for (const box of layer.boxes) {
      for (const tray of box.trays) {
        if (tray.id === trayId) {
          return cumulative;
        }
        cumulative++;
      }
    }
    // Count loose trays
    for (const tray of layer.looseTrays) {
      if (tray.id === trayId) {
        return cumulative;
      }
      cumulative++;
    }
  }
  return cumulative;
}

/**
 * Legacy: Get cumulative tray index across all boxes (for backwards compatibility).
 * @deprecated Use getCumulativeTrayIndexForTray instead
 */
export function getCumulativeTrayIndex(boxes: Box[], boxIndex: number, trayIndex: number): number {
  let cumulative = 0;
  for (let i = 0; i < boxIndex; i++) {
    cumulative += boxes[i].trays.length;
  }
  return cumulative + trayIndex;
}

/**
 * Get tray letter for a specific tray by ID, cumulative across all layers.
 */
export function getTrayLetterById(layers: Layer[], trayId: string): string {
  return getTrayLetter(getCumulativeTrayIndexForTray(layers, trayId));
}

/**
 * Legacy: Get tray letter for a specific tray, cumulative across all boxes.
 * @deprecated Use getTrayLetterById instead
 */
export function getCumulativeTrayLetter(boxes: Box[], boxIndex: number, trayIndex: number): string {
  return getTrayLetter(getCumulativeTrayIndex(boxes, boxIndex, trayIndex));
}

// Color palette for trays
export const TRAY_COLORS = ['#c9503c', '#3d7a6a', '#d4956a', '#7c5c4a', '#a36b5a', '#5a7c6a'];

/**
 * Get total tray count across all layers (boxes + loose trays).
 */
function getTotalTrayCount(layers: Layer[]): number {
  let total = 0;
  for (const layer of layers) {
    for (const box of layer.boxes) {
      total += box.trays.length;
    }
    total += layer.looseTrays.length;
  }
  return total;
}

/**
 * Get the next color for a new tray based on total tray count across all layers.
 */
function getNextTrayColor(layers: Layer[]): string {
  const totalTrays = getTotalTrayCount(layers);
  return TRAY_COLORS[totalTrays % TRAY_COLORS.length];
}

function createDefaultCounterTray(name: string, color: string, counterShapes?: CounterShape[]): CounterTray {
  // Build a mapping from default shape IDs to project shape IDs
  const shapeIdMap: Record<string, string> = {};
  if (counterShapes && counterShapes.length > 0) {
    // Map default IDs to actual project IDs by matching names or falling back to first available
    const defaultToName: Record<string, string> = {
      [DEFAULT_SHAPE_IDS.square]: 'Square',
      [DEFAULT_SHAPE_IDS.hex]: 'Hex',
      [DEFAULT_SHAPE_IDS.circle]: 'Circle',
      [DEFAULT_SHAPE_IDS.triangle]: 'Triangle'
    };
    for (const [defaultId, name] of Object.entries(defaultToName)) {
      const match = counterShapes.find((s) => s.name === name);
      shapeIdMap[defaultId] = match?.id ?? counterShapes[0].id;
    }
  }

  const mapShapeId = (id: string) => shapeIdMap[id] ?? id;

  return {
    id: generateId(),
    type: 'counter',
    name,
    color,
    rotationOverride: 'auto',
    params: {
      ...defaultParams,
      topLoadedStacks: defaultParams.topLoadedStacks.map(([shapeId, count, label]) => [
        mapShapeId(shapeId),
        count,
        label
      ]),
      edgeLoadedStacks: defaultParams.edgeLoadedStacks.map(([shapeId, count, orientation, label]) => [
        mapShapeId(shapeId),
        count,
        orientation,
        label
      ])
    }
  };
}

function createDefaultCardDrawTray(name: string, color: string, cardSizes?: CardSize[]): CardDrawTray {
  // Use the first available card size, falling back to default ID
  const cardSizeId = cardSizes?.[0]?.id ?? DEFAULT_CARD_SIZE_IDS.standard;
  return {
    id: generateId(),
    type: 'cardDraw',
    name,
    color,
    rotationOverride: 'auto',
    params: { ...defaultCardDrawTrayParams, cardSizeId }
  };
}

function createDefaultCardDividerTray(name: string, color: string, cardSizes?: CardSize[]): CardDividerTray {
  // Use the first available card size, falling back to default ID
  const cardSizeId = cardSizes?.[0]?.id ?? DEFAULT_CARD_SIZE_IDS.standard;
  return {
    id: generateId(),
    type: 'cardDivider',
    name,
    color,
    rotationOverride: 'auto',
    params: {
      ...defaultCardDividerTrayParams,
      stacks: defaultCardDividerTrayParams.stacks.map((stack) => ({
        ...stack,
        cardSizeId
      }))
    }
  };
}

function createDefaultCupTray(name: string, color: string): CupTray {
  return {
    id: generateId(),
    type: 'cup',
    name,
    color,
    rotationOverride: 'auto',
    params: { ...defaultCupTrayParams }
  };
}

// Legacy alias for backwards compatibility
function _createDefaultCardTray(name: string, color: string): CardDrawTray {
  return createDefaultCardDrawTray(name, color);
}

// Backwards compatibility alias
function createDefaultTray(name: string, color: string, counterShapes?: CounterShape[]): CounterTray {
  return createDefaultCounterTray(name, color, counterShapes);
}

function createDefaultBox(name: string): Box {
  return {
    id: generateId(),
    name,
    trays: [],
    tolerance: 0.5,
    wallThickness: 3.0,
    floorThickness: 2.0,
    fillSolidEmpty: true,
    lidParams: { ...defaultLidParams }
  };
}

function createDefaultLayer(name: string): Layer {
  return {
    id: generateId(),
    name,
    boxes: [],
    looseTrays: []
  };
}

function createDefaultProject(): Project {
  // Create the layer
  const layer = createDefaultLayer('Layer 1');

  // Create a box with 2 trays
  const box = createDefaultBox('Game box');
  const counterTray = createDefaultTray('Counter tray', TRAY_COLORS[0]);
  const cardDrawTray = createDefaultCardDrawTray('Card draw', TRAY_COLORS[1]);
  // Set card draw tray to hold 25 cards
  cardDrawTray.params = { ...cardDrawTray.params, cardCount: 25 };
  box.trays.push(counterTray);
  box.trays.push(cardDrawTray);
  layer.boxes.push(box);

  // Create a loose cup tray
  const cupTray = createDefaultCupTray('Segmented cups', TRAY_COLORS[2]);
  layer.looseTrays.push(cupTray);

  return {
    version: 2,
    layers: [layer],
    counterShapes: DEFAULT_COUNTER_SHAPES.map((s) => ({ ...s })),
    cardSizes: DEFAULT_CARD_SIZES.map((s) => ({ ...s })),
    selectedLayerId: layer.id,
    selectedBoxId: box.id,
    selectedTrayId: counterTray.id
  };
}

// Reactive state
let project = $state<Project>(createDefaultProject());

// Initialize from localStorage
export function initProject(): void {
  const saved = loadProject();
  if (saved) {
    project = saved;
  }
}

// Auto-save helper (now uses debounced save manager)
function autosave(): void {
  scheduleSave(project);
}

// Force immediate save (use before page unload or critical operations)
export function saveProjectNow(): void {
  saveNow(project);
}

// Getters
export function getProject(): Project {
  return project;
}

export function getLayers(): Layer[] {
  return project.layers;
}

export function getSelectedLayer(): Layer | null {
  if (!project.selectedLayerId) return null;
  return project.layers.find((l) => l.id === project.selectedLayerId) ?? null;
}

/**
 * Get all boxes from all layers.
 */
export function getAllBoxes(): Box[] {
  const boxes: Box[] = [];
  for (const layer of project.layers) {
    boxes.push(...layer.boxes);
  }
  return boxes;
}

/**
 * Get all loose trays from all layers.
 */
export function getAllLooseTrays(): Tray[] {
  const looseTrays: Tray[] = [];
  for (const layer of project.layers) {
    looseTrays.push(...layer.looseTrays);
  }
  return looseTrays;
}

/**
 * Legacy: Get all boxes (backwards compatibility).
 * @deprecated Use getAllBoxes instead
 */
export function getBoxes(): Box[] {
  return getAllBoxes();
}

export function getSelectedBox(): Box | null {
  if (!project.selectedBoxId) return null;
  // Search across all layers
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === project.selectedBoxId);
    if (box) return box;
  }
  return null;
}

export function getSelectedTray(): Tray | null {
  if (!project.selectedTrayId) return null;

  // First check if it's in the selected box
  const selectedBox = getSelectedBox();
  if (selectedBox) {
    const tray = selectedBox.trays.find((t) => t.id === project.selectedTrayId);
    if (tray) return tray;
  }

  // Check loose trays across all layers
  for (const layer of project.layers) {
    const looseTray = layer.looseTrays.find((t) => t.id === project.selectedTrayId);
    if (looseTray) return looseTray;
  }

  // Check all box trays
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === project.selectedTrayId);
      if (tray) return tray;
    }
  }

  return null;
}

// Selection
export function selectLayer(layerId: string): void {
  project.selectedLayerId = layerId;
  const layer = project.layers.find((l) => l.id === layerId);
  if (layer) {
    // Select first box if available, otherwise first loose tray
    if (layer.boxes.length > 0) {
      project.selectedBoxId = layer.boxes[0].id;
      if (layer.boxes[0].trays.length > 0) {
        project.selectedTrayId = layer.boxes[0].trays[0].id;
      } else {
        project.selectedTrayId = null;
      }
    } else if (layer.looseTrays.length > 0) {
      project.selectedBoxId = null;
      project.selectedTrayId = layer.looseTrays[0].id;
    } else {
      project.selectedBoxId = null;
      project.selectedTrayId = null;
    }
  }
  autosave();
}

export function selectBox(boxId: string): void {
  project.selectedBoxId = boxId;
  // Find the layer containing this box
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      project.selectedLayerId = layer.id;
      if (box.trays.length > 0) {
        project.selectedTrayId = box.trays[0].id;
      } else {
        project.selectedTrayId = null;
      }
      break;
    }
  }
  autosave();
}

export function selectTray(trayId: string): void {
  project.selectedTrayId = trayId;
  // Find and update selected layer and box based on tray location
  const location = findTrayLocation(project, trayId);
  if (location) {
    project.selectedLayerId = location.layerId;
    project.selectedBoxId = location.boxId;
  }
  autosave();
}

// Layer operations
export function addLayer(): Layer {
  const layerNumber = project.layers.length + 1;
  const layer = createDefaultLayer(`Layer ${layerNumber}`);
  project.layers.push(layer);
  project.selectedLayerId = layer.id;
  project.selectedBoxId = null;
  project.selectedTrayId = null;
  autosave();
  return layer;
}

export function deleteLayer(layerId: string): void {
  // Don't allow deleting the last layer
  if (project.layers.length <= 1) return;

  const index = project.layers.findIndex((l) => l.id === layerId);
  if (index === -1) return;

  project.layers.splice(index, 1);

  // Update selection
  if (project.selectedLayerId === layerId) {
    const newIndex = Math.min(index, project.layers.length - 1);
    const newLayer = project.layers[newIndex];
    project.selectedLayerId = newLayer.id;
    // Select first box or loose tray in the new layer
    if (newLayer.boxes.length > 0) {
      project.selectedBoxId = newLayer.boxes[0].id;
      project.selectedTrayId = newLayer.boxes[0].trays[0]?.id ?? null;
    } else if (newLayer.looseTrays.length > 0) {
      project.selectedBoxId = null;
      project.selectedTrayId = newLayer.looseTrays[0].id;
    } else {
      project.selectedBoxId = null;
      project.selectedTrayId = null;
    }
  }
  autosave();
}

export function updateLayer(layerId: string, updates: Partial<Omit<Layer, 'id' | 'boxes' | 'looseTrays'>>): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (layer) {
    Object.assign(layer, updates);
    autosave();
  }
}

// Box operations
export function addBox(layerId?: string, trayType: TrayType = 'counter'): Box {
  // Find the target layer
  const targetLayerId = layerId ?? project.selectedLayerId ?? project.layers[0]?.id;
  const layer = project.layers.find((l) => l.id === targetLayerId);
  if (!layer) {
    // Create a layer if none exists
    const newLayer = createDefaultLayer('Layer 1');
    project.layers.push(newLayer);
    return addBox(newLayer.id, trayType);
  }

  const boxNumber = getAllBoxes().length + 1;
  const box = createDefaultBox(`Box ${boxNumber}`);
  const color = getNextTrayColor(project.layers);

  let tray: Tray;
  if (trayType === 'cardDraw' || trayType === 'card') {
    tray = createDefaultCardDrawTray('Card Draw 1', color, project.cardSizes);
  } else if (trayType === 'cardDivider') {
    tray = createDefaultCardDividerTray('Card Divider 1', color, project.cardSizes);
  } else if (trayType === 'cup') {
    tray = createDefaultCupTray('Cup Tray 1', color);
  } else {
    tray = createDefaultCounterTray('Tray 1', color, project.counterShapes);
    // Inherit global params (including customShapes) from existing counter trays
    const globalParams = getGlobalParamsFromExisting();
    tray.params = { ...tray.params, ...globalParams };
  }

  box.trays.push(tray);
  layer.boxes.push(box);
  project.selectedLayerId = layer.id;
  project.selectedBoxId = box.id;
  project.selectedTrayId = tray.id;
  autosave();
  return box;
}

export function deleteBox(boxId: string): void {
  // Find the box across all layers
  for (const layer of project.layers) {
    const index = layer.boxes.findIndex((b) => b.id === boxId);
    if (index !== -1) {
      layer.boxes.splice(index, 1);

      // Update selection
      if (project.selectedBoxId === boxId) {
        if (layer.boxes.length > 0) {
          const newIndex = Math.min(index, layer.boxes.length - 1);
          project.selectedBoxId = layer.boxes[newIndex].id;
          project.selectedTrayId = layer.boxes[newIndex].trays[0]?.id ?? null;
        } else if (layer.looseTrays.length > 0) {
          project.selectedBoxId = null;
          project.selectedTrayId = layer.looseTrays[0].id;
        } else {
          project.selectedBoxId = null;
          project.selectedTrayId = null;
        }
      }
      autosave();
      return;
    }
  }
}

export function updateBox(boxId: string, updates: Partial<Omit<Box, 'id' | 'trays'>>): void {
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      Object.assign(box, updates);
      autosave();
      return;
    }
  }
}

// Global params that should be shared across counter trays
const GLOBAL_PARAM_KEYS: (keyof CounterTrayParams)[] = [
  'clearance',
  'wallThickness',
  'floorThickness',
  'rimHeight',
  'cutoutRatio',
  'cutoutMax',
  'gameContainerWidth',
  'gameContainerDepth'
];

// Get current global params from any existing counter tray
function getGlobalParamsFromExisting(): Partial<CounterTrayParams> {
  for (const layer of project.layers) {
    // Check box trays
    for (const box of layer.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          const existingParams = tray.params;
          const globalParams: Partial<CounterTrayParams> = {};
          for (const key of GLOBAL_PARAM_KEYS) {
            (globalParams as Record<string, unknown>)[key] = existingParams[key];
          }
          return globalParams;
        }
      }
    }
    // Check loose trays
    for (const tray of layer.looseTrays) {
      if (isCounterTray(tray)) {
        const existingParams = tray.params;
        const globalParams: Partial<CounterTrayParams> = {};
        for (const key of GLOBAL_PARAM_KEYS) {
          (globalParams as Record<string, unknown>)[key] = existingParams[key];
        }
        return globalParams;
      }
    }
  }
  return {};
}

// Tray type for addTray function
export type TrayType = 'counter' | 'cardDraw' | 'cardDivider' | 'cup' | 'card';

// Loose tray operations
export function addLooseTray(layerId?: string, trayType: TrayType = 'counter'): Tray | null {
  // Find the target layer
  const targetLayerId = layerId ?? project.selectedLayerId ?? project.layers[0]?.id;
  const layer = project.layers.find((l) => l.id === targetLayerId);
  if (!layer) return null;

  const trayNumber = layer.looseTrays.length + 1;
  const color = getNextTrayColor(project.layers);

  let tray: Tray;
  if (trayType === 'cardDraw' || trayType === 'card') {
    tray = createDefaultCardDrawTray(`Loose Card ${trayNumber}`, color, project.cardSizes);
  } else if (trayType === 'cardDivider') {
    tray = createDefaultCardDividerTray(`Loose Divider ${trayNumber}`, color, project.cardSizes);
  } else if (trayType === 'cup') {
    tray = createDefaultCupTray(`Loose Cups ${trayNumber}`, color);
  } else {
    tray = createDefaultCounterTray(`Loose Tray ${trayNumber}`, color, project.counterShapes);
    // Inherit global params (including customShapes) from existing counter trays
    const globalParams = getGlobalParamsFromExisting();
    tray.params = { ...tray.params, ...globalParams };
  }

  layer.looseTrays.push(tray);
  project.selectedLayerId = layer.id;
  project.selectedBoxId = null;
  project.selectedTrayId = tray.id;

  autosave();
  return tray;
}

export function deleteLooseTray(trayId: string): void {
  for (const layer of project.layers) {
    const index = layer.looseTrays.findIndex((t) => t.id === trayId);
    if (index !== -1) {
      layer.looseTrays.splice(index, 1);

      // Update selection
      if (project.selectedTrayId === trayId) {
        if (layer.looseTrays.length > 0) {
          const newIndex = Math.min(index, layer.looseTrays.length - 1);
          project.selectedTrayId = layer.looseTrays[newIndex].id;
        } else if (layer.boxes.length > 0) {
          project.selectedBoxId = layer.boxes[0].id;
          project.selectedTrayId = layer.boxes[0].trays[0]?.id ?? null;
        } else {
          project.selectedTrayId = null;
        }
      }
      autosave();
      return;
    }
  }
}

// Tray operations (within boxes)
export function addTray(boxId: string, trayType: TrayType = 'counter'): Tray | null {
  // Find the box across all layers
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      const trayNumber = box.trays.length + 1;
      const color = getNextTrayColor(project.layers);

      let tray: Tray;
      if (trayType === 'cardDraw' || trayType === 'card') {
        tray = createDefaultCardDrawTray(`Card Draw ${trayNumber}`, color, project.cardSizes);
      } else if (trayType === 'cardDivider') {
        tray = createDefaultCardDividerTray(`Card Divider ${trayNumber}`, color, project.cardSizes);
      } else if (trayType === 'cup') {
        tray = createDefaultCupTray(`Cup Tray ${trayNumber}`, color);
      } else {
        tray = createDefaultCounterTray(`Tray ${trayNumber}`, color, project.counterShapes);
        // Inherit global params (including customShapes) from existing counter trays
        const globalParams = getGlobalParamsFromExisting();
        tray.params = { ...tray.params, ...globalParams };
      }

      box.trays.push(tray);
      project.selectedLayerId = layer.id;
      project.selectedBoxId = boxId;
      project.selectedTrayId = tray.id;

      // Clear manual layout and custom dimensions so auto layout takes over
      box.manualLayout = undefined;
      box.customWidth = undefined;
      box.customDepth = undefined;

      autosave();
      return tray;
    }
  }
  return null;
}

export function deleteTray(boxId: string, trayId: string): void {
  // Check if this is a loose tray
  const location = findTrayLocation(project, trayId);
  if (location && location.boxId === null) {
    deleteLooseTray(trayId);
    return;
  }

  // Find the box across all layers
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      const index = box.trays.findIndex((t) => t.id === trayId);
      if (index === -1) return;

      box.trays.splice(index, 1);

      // Clear manual layout and custom dimensions so auto layout takes over
      box.manualLayout = undefined;
      box.customWidth = undefined;
      box.customDepth = undefined;

      // Update selection
      if (project.selectedTrayId === trayId) {
        if (box.trays.length > 0) {
          const newIndex = Math.min(index, box.trays.length - 1);
          project.selectedTrayId = box.trays[newIndex].id;
        } else {
          project.selectedTrayId = null;
        }
      }
      autosave();
      return;
    }
  }
}

export function updateTray(trayId: string, updates: Partial<Omit<Tray, 'id'>>): void {
  // Check box trays
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray) {
        Object.assign(tray, updates);
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray) {
      Object.assign(looseTray, updates);
      autosave();
      return;
    }
  }
}

// Set tray rotation override ('auto' | 0 | 90)
export function setTrayRotation(trayId: string, rotation: 'auto' | 0 | 90): void {
  for (const layer of project.layers) {
    // Check box trays
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray) {
        tray.rotationOverride = rotation;
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray) {
      looseTray.rotationOverride = rotation;
      autosave();
      return;
    }
  }
}

// Update counter tray params
export function updateTrayParams(trayId: string, params: CounterTrayParams): void {
  for (const layer of project.layers) {
    // Check box trays
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCounterTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCounterTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Counter shape operations (global)
export function getCounterShapes(): CounterShape[] {
  return project.counterShapes;
}

export function getCounterShape(id: string): CounterShape | null {
  return project.counterShapes.find((s) => s.id === id) ?? null;
}

export function addCounterShape(shape: Omit<CounterShape, 'id'>): CounterShape {
  const newShape: CounterShape = { ...shape, id: generateId() };
  project.counterShapes.push(newShape);
  autosave();
  return newShape;
}

export function updateCounterShape(id: string, updates: Partial<Omit<CounterShape, 'id'>>): void {
  const shape = project.counterShapes.find((s) => s.id === id);
  if (shape) {
    Object.assign(shape, updates);
    autosave();
  }
}

export function deleteCounterShape(id: string): void {
  const index = project.counterShapes.findIndex((s) => s.id === id);
  if (index >= 0) {
    project.counterShapes.splice(index, 1);
    // Remove stacks referencing this shape from all counter trays (boxes and loose)
    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        for (const tray of box.trays) {
          if (isCounterTray(tray)) {
            tray.params.topLoadedStacks = tray.params.topLoadedStacks.filter(([shapeId]) => shapeId !== id);
            tray.params.edgeLoadedStacks = tray.params.edgeLoadedStacks.filter(([shapeId]) => shapeId !== id);
          }
        }
      }
      for (const tray of layer.looseTrays) {
        if (isCounterTray(tray)) {
          tray.params.topLoadedStacks = tray.params.topLoadedStacks.filter(([shapeId]) => shapeId !== id);
          tray.params.edgeLoadedStacks = tray.params.edgeLoadedStacks.filter(([shapeId]) => shapeId !== id);
        }
      }
    }
    autosave();
  }
}

// Card size operations (global)
export function getCardSizes(): CardSize[] {
  return project.cardSizes;
}

export function getCardSize(id: string): CardSize | null {
  return project.cardSizes.find((s) => s.id === id) ?? null;
}

export function addCardSize(cardSize: Omit<CardSize, 'id'>): CardSize {
  const newCardSize: CardSize = { ...cardSize, id: generateId() };
  project.cardSizes.push(newCardSize);
  autosave();
  return newCardSize;
}

export function updateCardSize(id: string, updates: Partial<Omit<CardSize, 'id'>>): void {
  const cardSize = project.cardSizes.find((s) => s.id === id);
  if (cardSize) {
    Object.assign(cardSize, updates);
    autosave();
  }
}

export function deleteCardSize(id: string): void {
  const index = project.cardSizes.findIndex((s) => s.id === id);
  if (index >= 0) {
    project.cardSizes.splice(index, 1);
    // Note: We don't auto-delete card trays using this size - let them show an error
    autosave();
  }
}

// Default global settings
export const DEFAULT_GLOBAL_SETTINGS = {
  gameContainerWidth: 256,
  gameContainerDepth: 256
};

// Global settings operations
export function getGlobalSettings(): { gameContainerWidth: number; gameContainerDepth: number } {
  // If project has explicit global settings, use those
  if (project.globalSettings) {
    return {
      gameContainerWidth: project.globalSettings.gameContainerWidth,
      gameContainerDepth: project.globalSettings.gameContainerDepth
    };
  }
  // Otherwise, try to get from existing counter tray
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          return {
            gameContainerWidth: tray.params.gameContainerWidth,
            gameContainerDepth: tray.params.gameContainerDepth
          };
        }
      }
    }
    for (const tray of layer.looseTrays) {
      if (isCounterTray(tray)) {
        return {
          gameContainerWidth: tray.params.gameContainerWidth,
          gameContainerDepth: tray.params.gameContainerDepth
        };
      }
    }
  }
  // Fall back to defaults
  return DEFAULT_GLOBAL_SETTINGS;
}

export function updateGlobalSettings(updates: { gameContainerWidth?: number; gameContainerDepth?: number }): void {
  // Initialize global settings if not present
  if (!project.globalSettings) {
    project.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
  }
  // Update project-level settings
  if (updates.gameContainerWidth !== undefined) {
    project.globalSettings.gameContainerWidth = updates.gameContainerWidth;
  }
  if (updates.gameContainerDepth !== undefined) {
    project.globalSettings.gameContainerDepth = updates.gameContainerDepth;
  }

  // Propagate to all counter trays (these are "global" params)
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          if (updates.gameContainerWidth !== undefined) {
            tray.params.gameContainerWidth = updates.gameContainerWidth;
          }
          if (updates.gameContainerDepth !== undefined) {
            tray.params.gameContainerDepth = updates.gameContainerDepth;
          }
        }
      }
    }
    for (const tray of layer.looseTrays) {
      if (isCounterTray(tray)) {
        if (updates.gameContainerWidth !== undefined) {
          tray.params.gameContainerWidth = updates.gameContainerWidth;
        }
        if (updates.gameContainerDepth !== undefined) {
          tray.params.gameContainerDepth = updates.gameContainerDepth;
        }
      }
    }
  }
  autosave();
}

// Update card draw tray params
export function updateCardDrawTrayParams(trayId: string, params: CardDrawTrayParams): void {
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCardDrawTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCardDrawTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Legacy alias for backwards compatibility
export const updateCardTrayParams = updateCardDrawTrayParams;

// Update card divider tray params
export function updateCardDividerTrayParams(trayId: string, params: CardDividerTrayParams): void {
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCardDividerTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCardDividerTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Update cup tray params
export function updateCupTrayParams(trayId: string, params: CupTrayParams): void {
  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCupTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = layer.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCupTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Reset project
export function resetProject(): void {
  project = createDefaultProject();
  autosave();
}

// Move a tray to a different box (or create a new box in the same layer)
export function moveTray(trayId: string, targetBoxId: string | 'new'): void {
  // Find the tray and its current location
  let sourceTray: Tray | null = null;
  let sourceBox: Box | null = null;
  let sourceLayer: Layer | null = null;
  let sourceIndex = -1;
  let isLoose = false;

  for (const layer of project.layers) {
    // Check boxes
    for (const box of layer.boxes) {
      const trayIndex = box.trays.findIndex((t) => t.id === trayId);
      if (trayIndex !== -1) {
        sourceTray = box.trays[trayIndex];
        sourceBox = box;
        sourceLayer = layer;
        sourceIndex = trayIndex;
        break;
      }
    }
    if (sourceTray) break;

    // Check loose trays
    const looseTrayIndex = layer.looseTrays.findIndex((t) => t.id === trayId);
    if (looseTrayIndex !== -1) {
      sourceTray = layer.looseTrays[looseTrayIndex];
      sourceLayer = layer;
      sourceIndex = looseTrayIndex;
      isLoose = true;
      break;
    }
  }

  if (!sourceTray || !sourceLayer) return;

  // Determine target box
  let targetBox: Box;
  if (targetBoxId === 'new') {
    // Create a new box in the same layer
    const boxNumber = getAllBoxes().length + 1;
    targetBox = {
      id: generateId(),
      name: `Box ${boxNumber}`,
      trays: [],
      tolerance: sourceBox?.tolerance ?? 0.5,
      wallThickness: sourceBox?.wallThickness ?? 3.0,
      floorThickness: sourceBox?.floorThickness ?? 2.0,
      fillSolidEmpty: true,
      lidParams: sourceBox ? { ...sourceBox.lidParams } : { ...defaultLidParams }
    };
    sourceLayer.boxes.push(targetBox);
  } else {
    // Find target box across all layers
    let found: Box | null = null;
    for (const layer of project.layers) {
      const box = layer.boxes.find((b) => b.id === targetBoxId);
      if (box) {
        found = box;
        break;
      }
    }
    if (!found || (sourceBox && found.id === sourceBox.id)) return; // Can't move to same box
    targetBox = found;
  }

  // Remove from source
  if (isLoose) {
    sourceLayer.looseTrays.splice(sourceIndex, 1);
  } else if (sourceBox) {
    sourceBox.trays.splice(sourceIndex, 1);
  }

  // Add to target box
  targetBox.trays.push(sourceTray);

  // Update selection to follow the moved tray
  project.selectedBoxId = targetBox.id;
  project.selectedTrayId = sourceTray.id;

  autosave();
}

// Move a box to a different layer (or create a new layer)
export function moveBoxToLayer(boxId: string, targetLayerId: string | 'new'): void {
  let sourceBox: Box | null = null;
  let sourceLayer: Layer | null = null;
  let sourceIndex = -1;

  for (const layer of project.layers) {
    const boxIndex = layer.boxes.findIndex((b) => b.id === boxId);
    if (boxIndex !== -1) {
      sourceBox = layer.boxes[boxIndex];
      sourceLayer = layer;
      sourceIndex = boxIndex;
      break;
    }
  }

  if (!sourceBox || !sourceLayer) return;

  // Determine target layer
  let targetLayer: Layer;
  if (targetLayerId === 'new') {
    // Create a new layer
    const layerNumber = project.layers.length + 1;
    targetLayer = createDefaultLayer(`Layer ${layerNumber}`);
    project.layers.push(targetLayer);
  } else {
    const found = project.layers.find((l) => l.id === targetLayerId);
    if (!found || found.id === sourceLayer.id) return;
    targetLayer = found;
  }

  // Remove from source layer
  sourceLayer.boxes.splice(sourceIndex, 1);

  // Add to target layer
  targetLayer.boxes.push(sourceBox);

  // Update selection
  project.selectedLayerId = targetLayer.id;
  project.selectedBoxId = sourceBox.id;

  autosave();
}

// Move a loose tray into a box
export function moveLooseTrayToBox(trayId: string, targetBoxId: string): void {
  let sourceTray: Tray | null = null;
  let sourceLayer: Layer | null = null;
  let sourceIndex = -1;

  for (const layer of project.layers) {
    const trayIndex = layer.looseTrays.findIndex((t) => t.id === trayId);
    if (trayIndex !== -1) {
      sourceTray = layer.looseTrays[trayIndex];
      sourceLayer = layer;
      sourceIndex = trayIndex;
      break;
    }
  }

  if (!sourceTray || !sourceLayer) return;

  // Find target box
  let targetBox: Box | null = null;
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === targetBoxId);
    if (box) {
      targetBox = box;
      break;
    }
  }

  if (!targetBox) return;

  // Remove from loose trays
  sourceLayer.looseTrays.splice(sourceIndex, 1);

  // Add to target box
  targetBox.trays.push(sourceTray);

  // Update selection
  project.selectedBoxId = targetBox.id;
  project.selectedTrayId = sourceTray.id;

  autosave();
}

// Move a tray from a box to loose (in the same or specified layer)
export function moveTrayToLoose(trayId: string, targetLayerId?: string): void {
  let sourceTray: Tray | null = null;
  let sourceBox: Box | null = null;
  let sourceLayer: Layer | null = null;
  let sourceIndex = -1;

  for (const layer of project.layers) {
    for (const box of layer.boxes) {
      const trayIndex = box.trays.findIndex((t) => t.id === trayId);
      if (trayIndex !== -1) {
        sourceTray = box.trays[trayIndex];
        sourceBox = box;
        sourceLayer = layer;
        sourceIndex = trayIndex;
        break;
      }
    }
    if (sourceTray) break;
  }

  if (!sourceTray || !sourceBox || !sourceLayer) return;

  const targetLayer = targetLayerId ? (project.layers.find((l) => l.id === targetLayerId) ?? sourceLayer) : sourceLayer;

  // Remove from source box
  sourceBox.trays.splice(sourceIndex, 1);

  // Add to loose trays
  targetLayer.looseTrays.push(sourceTray);

  // Update selection
  project.selectedLayerId = targetLayer.id;
  project.selectedBoxId = null;
  project.selectedTrayId = sourceTray.id;

  autosave();
}

// Import project from JSON data
export function importProject(data: Project): void {
  // Run migrations to ensure all fields have proper defaults (handles older exported files)
  project = migrateProjectData(data);
  // Ensure selection is valid
  if (project.layers.length > 0) {
    // Ensure selectedLayerId is valid
    const selectedLayer = project.layers.find((l) => l.id === project.selectedLayerId);
    if (!selectedLayer) {
      project.selectedLayerId = project.layers[0].id;
    }
    const layer = project.layers.find((l) => l.id === project.selectedLayerId);
    if (layer) {
      // Ensure selectedBoxId is valid
      if (project.selectedBoxId) {
        const selectedBox = layer.boxes.find((b) => b.id === project.selectedBoxId);
        if (!selectedBox) {
          if (layer.boxes.length > 0) {
            project.selectedBoxId = layer.boxes[0].id;
          } else {
            project.selectedBoxId = null;
          }
        }
      }
      // Ensure selectedTrayId is valid (or set default if not set)
      const needsTraySelection = !project.selectedTrayId || !findTrayLocation(project, project.selectedTrayId);
      if (needsTraySelection) {
        // Find first available tray
        if (layer.boxes.length > 0 && layer.boxes[0].trays.length > 0) {
          project.selectedBoxId = layer.boxes[0].id;
          project.selectedTrayId = layer.boxes[0].trays[0].id;
        } else if (layer.looseTrays.length > 0) {
          project.selectedBoxId = null;
          project.selectedTrayId = layer.looseTrays[0].id;
        } else {
          project.selectedTrayId = null;
        }
      }
    }
  } else {
    project.selectedLayerId = null;
    project.selectedBoxId = null;
    project.selectedTrayId = null;
  }
  autosave();
}

// Manual layout operations
import type { ManualTrayPlacement } from '$lib/types/project';

// Save manual tray layout for a box (box dimensions auto-calculate from tray positions)
export function saveManualLayout(boxId: string, placements: ManualTrayPlacement[]): void {
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      box.manualLayout = placements;
      autosave();
      return;
    }
  }
}

// Clear manual layout for a box (reverts to auto bin-packing)
export function clearManualLayout(boxId: string): void {
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) {
      box.manualLayout = undefined;
      // Optionally clear custom dimensions to let auto-sizing take over
      box.customWidth = undefined;
      box.customDepth = undefined;
      autosave();
      return;
    }
  }
}

// Get manual layout for a box
export function getManualLayout(boxId: string): ManualTrayPlacement[] | undefined {
  for (const layer of project.layers) {
    const box = layer.boxes.find((b) => b.id === boxId);
    if (box) return box.manualLayout;
  }
  return undefined;
}

// Save manual layer layout (box and loose tray positions)
export function saveLayerLayout(
  layerId: string,
  boxPlacements: ManualBoxPlacement[],
  looseTrayPlacements: ManualLooseTrayPlacement[]
): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  layer.manualLayout = {
    boxes: boxPlacements,
    looseTrays: looseTrayPlacements
  };

  autosave();
}

// Clear manual layer layout (reverts to auto arrangement)
export function clearLayerLayout(layerId: string): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  layer.manualLayout = undefined;
  autosave();
}

// Get manual layer layout
export function getLayerLayout(
  layerId: string
): { boxes: ManualBoxPlacement[]; looseTrays: ManualLooseTrayPlacement[] } | undefined {
  const layer = project.layers.find((l) => l.id === layerId);
  return layer?.manualLayout;
}
