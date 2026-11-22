import defaultProjectJson from '#lib/data/defaultProject.json';
import { defaultCardDividerTrayParams, type CardDividerTrayParams } from '#lib/models/cardDividerTray.js';
import { defaultCardDrawTrayParams, type CardDrawTrayParams } from '#lib/models/cardTray.js';
import { createDefaultCardWellTrayParams, type CardWellTrayParams } from '#lib/models/cardWellTray.js';
import {
  DEFAULT_CARD_SIZE_IDS,
  DEFAULT_SHAPE_IDS,
  defaultParams,
  type CounterTrayParams
} from '#lib/models/counterTray.js';
import { defaultCupTrayParams, type CupTrayParams } from '#lib/models/cupTray.js';
import { defaultLidParams } from '#lib/models/lid.js';
import { defaultReservedSpaceParams, type ReservedSpaceParams } from '#lib/models/reservedSpace.js';
import { defaultStandeeTrayParams, type StandeeTrayParams } from '#lib/models/standeeTray.js';
import { saveNow, scheduleSave } from '#lib/stores/saveManager.js';
import type {
  Box,
  CardDividerTray,
  CardDrawTray,
  CardSize,
  CardTray,
  CardWellTray,
  CounterShape,
  CounterTray,
  CupTray,
  LidParams,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Project,
  ReservedTray,
  Section,
  SectionPlacement,
  Standee,
  StandeeTray,
  Tray
} from '#lib/types/project.js';
import {
  findTrayLocation,
  isCardDividerTray,
  isCardDrawTray,
  isCardTray,
  isCardWellTray,
  isCounterTray,
  isCupTray,
  isLooseTray,
  isReservedTray,
  isStandeeTray
} from '#lib/types/project.js';
import { loadProject, migrateProjectData } from '#lib/utils/storage.js';

export {
  findTrayLocation,
  isCardDividerTray,
  isCardDrawTray,
  isCardTray,
  isCardWellTray,
  isCounterTray,
  isCupTray,
  isLooseTray,
  isReservedTray,
  isStandeeTray
};
export type {
  Box,
  CardDividerTray,
  CardDrawTray,
  CardSize,
  CardTray,
  CardWellTray,
  CounterShape,
  CounterTray,
  CupTray,
  LidParams,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Project,
  ReservedTray,
  Section,
  SectionPlacement,
  Standee,
  StandeeTray,
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

// Default standee IDs (stable so references survive re-imports)
export const DEFAULT_STANDEE_IDS = {
  standard: 'standee-standard'
};

// Default standees (global)
export const DEFAULT_STANDEES: Standee[] = [
  {
    id: DEFAULT_STANDEE_IDS.standard,
    name: 'Standard',
    baseRadius: 9,
    baseThickness: 3,
    standeeHeight: 40,
    standeeWidth: 25,
    standeeThickness: 1.5
  }
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Generate a tray letter based on cumulative index across all sections.
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
 * Get cumulative tray index across all sections.
 * Order: For each section, count box trays first, then loose trays.
 */
export function getCumulativeTrayIndexForTray(sections: Section[], trayId: string): number {
  let cumulative = 0;
  for (const section of sections) {
    // Count box trays
    for (const box of section.boxes) {
      for (const tray of box.trays) {
        if (tray.id === trayId) {
          return cumulative;
        }
        cumulative++;
      }
    }
    // Count loose trays. Reserved spaces are not printed, so they take no letter.
    for (const tray of section.looseTrays) {
      if (tray.id === trayId) {
        return cumulative;
      }
      if (tray.type !== 'reserved') cumulative++;
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
 * Get tray letter for a specific tray by ID, cumulative across all sections.
 */
export function getTrayLetterById(sections: Section[], trayId: string): string {
  return getTrayLetter(getCumulativeTrayIndexForTray(sections, trayId));
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
 * Get total tray count across all sections (boxes + loose trays).
 */
function getTotalTrayCount(sections: Section[]): number {
  let total = 0;
  for (const section of sections) {
    for (const box of section.boxes) {
      total += box.trays.length;
    }
    total += section.looseTrays.filter((tray) => tray.type !== 'reserved').length;
  }
  return total;
}

/**
 * Get the next color for a new tray based on total tray count across all sections.
 */
function getNextTrayColor(sections: Section[]): string {
  const totalTrays = getTotalTrayCount(sections);
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

function createDefaultCardWellTray(name: string, color: string, cardSizes?: CardSize[]): CardWellTray {
  const params = createDefaultCardWellTrayParams();
  // Use the first available card size for the initial stack
  const cardSizeId = cardSizes?.[0]?.id ?? DEFAULT_CARD_SIZE_IDS.standard;
  if (params.stacks.length > 0) {
    params.stacks[0].cardSizeId = cardSizeId;
  }
  return {
    id: generateId(),
    type: 'cardWell',
    name,
    color,
    rotationOverride: 'auto',
    params
  };
}

function createDefaultStandeeTray(name: string, color: string, standees?: Standee[]): StandeeTray {
  // Use the first available standee, falling back to the default ID
  const standeeId = standees?.[0]?.id ?? DEFAULT_STANDEE_IDS.standard;
  return {
    id: generateId(),
    type: 'standee',
    name,
    color,
    rotationOverride: 'auto',
    params: { ...defaultStandeeTrayParams, standeeId }
  };
}

// Hatch colour for reserved spaces (they are not printed, so they sit outside the tray palette)
export const RESERVED_SPACE_COLOR = '#8a8f98';

function createDefaultReservedTray(name: string): ReservedTray {
  return {
    id: generateId(),
    type: 'reserved',
    name,
    color: RESERVED_SPACE_COLOR,
    rotationOverride: 'auto',
    params: { ...defaultReservedSpaceParams }
  };
}

// Legacy alias for backwards compatibility
function _createDefaultCardTray(name: string, color: string): CardDrawTray {
  return createDefaultCardDrawTray(name, color);
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

function createDefaultSection(name: string): Section {
  return {
    id: generateId(),
    name,
    boxes: [],
    looseTrays: []
  };
}

function createDefaultProject(): Project {
  // Deep clone the JSON to avoid mutations affecting the original
  return JSON.parse(JSON.stringify(defaultProjectJson)) as Project;
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

export function getSections(): Section[] {
  return project.sections;
}

export function getSelectedSection(): Section | null {
  if (!project.selectedSectionId) return null;
  return project.sections.find((l) => l.id === project.selectedSectionId) ?? null;
}

/**
 * Get all boxes from all sections.
 */
export function getAllBoxes(): Box[] {
  const boxes: Box[] = [];
  for (const section of project.sections) {
    boxes.push(...section.boxes);
  }
  return boxes;
}

/**
 * Get all loose trays from all sections.
 */
export function getAllLooseTrays(): Tray[] {
  const looseTrays: Tray[] = [];
  for (const section of project.sections) {
    looseTrays.push(...section.looseTrays);
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
  // Search across all sections
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === project.selectedBoxId);
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

  // Check loose trays across all sections
  for (const section of project.sections) {
    const looseTray = section.looseTrays.find((t) => t.id === project.selectedTrayId);
    if (looseTray) return looseTray;
  }

  // Check all box trays
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === project.selectedTrayId);
      if (tray) return tray;
    }
  }

  return null;
}

// Selection
export function selectSection(sectionId: string): void {
  project.selectedSectionId = sectionId;
  const section = project.sections.find((l) => l.id === sectionId);
  if (section) {
    // Select first box if available, otherwise first loose tray
    if (section.boxes.length > 0) {
      project.selectedBoxId = section.boxes[0].id;
      if (section.boxes[0].trays.length > 0) {
        project.selectedTrayId = section.boxes[0].trays[0].id;
      } else {
        project.selectedTrayId = null;
      }
    } else if (section.looseTrays.length > 0) {
      project.selectedBoxId = null;
      project.selectedTrayId = section.looseTrays[0].id;
    } else {
      project.selectedBoxId = null;
      project.selectedTrayId = null;
    }
  }
  autosave();
}

export function selectBox(boxId: string): void {
  project.selectedBoxId = boxId;
  // Find the section containing this box
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
    if (box) {
      project.selectedSectionId = section.id;
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
  // Find and update selected section and box based on tray location
  const location = findTrayLocation(project, trayId);
  if (location) {
    project.selectedSectionId = location.sectionId;
    project.selectedBoxId = location.boxId;
  }
  autosave();
}

// Section operations
export function addSection(): Section {
  const sectionNumber = project.sections.length + 1;
  const section = createDefaultSection(`Section ${sectionNumber}`);
  project.sections.push(section);
  project.selectedSectionId = section.id;
  project.selectedBoxId = null;
  project.selectedTrayId = null;
  autosave();
  return section;
}

export function deleteSection(sectionId: string): void {
  // Don't allow deleting the last section
  if (project.sections.length <= 1) return;

  const index = project.sections.findIndex((l) => l.id === sectionId);
  if (index === -1) return;

  project.sections.splice(index, 1);

  // Update selection
  if (project.selectedSectionId === sectionId) {
    const newIndex = Math.min(index, project.sections.length - 1);
    const newSection = project.sections[newIndex];
    project.selectedSectionId = newSection.id;
    // Select first box or loose tray in the new section
    if (newSection.boxes.length > 0) {
      project.selectedBoxId = newSection.boxes[0].id;
      project.selectedTrayId = newSection.boxes[0].trays[0]?.id ?? null;
    } else if (newSection.looseTrays.length > 0) {
      project.selectedBoxId = null;
      project.selectedTrayId = newSection.looseTrays[0].id;
    } else {
      project.selectedBoxId = null;
      project.selectedTrayId = null;
    }
  }
  autosave();
}

export function updateSection(sectionId: string, updates: Partial<Omit<Section, 'id' | 'boxes' | 'looseTrays'>>): void {
  const section = project.sections.find((l) => l.id === sectionId);
  if (section) {
    Object.assign(section, updates);
    autosave();
  }
}

// Box operations
export function addBox(sectionId?: string, requestedTrayType: TrayType = 'counter'): Box {
  // A box cannot hold a reserved space; start it with a counter tray instead
  const trayType: TrayType = requestedTrayType === 'reserved' ? 'counter' : requestedTrayType;
  // Find the target section
  const targetSectionId = sectionId ?? project.selectedSectionId ?? project.sections[0]?.id;
  const section = project.sections.find((l) => l.id === targetSectionId);
  if (!section) {
    // Create a section if none exists
    const newSection = createDefaultSection('Section 1');
    project.sections.push(newSection);
    return addBox(newSection.id, trayType);
  }

  const boxNumber = getAllBoxes().length + 1;
  const box = createDefaultBox(`Box ${boxNumber}`);
  const color = getNextTrayColor(project.sections);

  let tray: Tray;
  if (trayType === 'cardDraw' || trayType === 'card') {
    tray = createDefaultCardDrawTray('Card Draw 1', color, project.cardSizes);
  } else if (trayType === 'cardDivider') {
    tray = createDefaultCardDividerTray('Card Divider 1', color, project.cardSizes);
  } else if (trayType === 'cup') {
    tray = createDefaultCupTray('Cup Tray 1', color);
  } else if (trayType === 'cardWell') {
    tray = createDefaultCardWellTray('Card Well 1', color, project.cardSizes);
  } else if (trayType === 'standee') {
    tray = createDefaultStandeeTray('Standee Tray 1', color, project.standees);
  } else {
    tray = createDefaultCounterTray('Tray 1', color, project.counterShapes);
    // Inherit global params (including customShapes) from existing counter trays
    const globalParams = getGlobalParamsFromExisting();
    tray.params = { ...tray.params, ...globalParams };
  }

  box.trays.push(tray);
  section.boxes.push(box);
  project.selectedSectionId = section.id;
  project.selectedBoxId = box.id;
  project.selectedTrayId = tray.id;
  autosave();
  return box;
}

export function deleteBox(boxId: string): void {
  // Find the box across all sections
  for (const section of project.sections) {
    const index = section.boxes.findIndex((b) => b.id === boxId);
    if (index !== -1) {
      section.boxes.splice(index, 1);

      // Update selection
      if (project.selectedBoxId === boxId) {
        if (section.boxes.length > 0) {
          const newIndex = Math.min(index, section.boxes.length - 1);
          project.selectedBoxId = section.boxes[newIndex].id;
          project.selectedTrayId = section.boxes[newIndex].trays[0]?.id ?? null;
        } else if (section.looseTrays.length > 0) {
          project.selectedBoxId = null;
          project.selectedTrayId = section.looseTrays[0].id;
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
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
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
  for (const section of project.sections) {
    // Check box trays
    for (const box of section.boxes) {
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
    for (const tray of section.looseTrays) {
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
// 'reserved' (a reserved space) can only be added directly to a section, never to a box.
export type TrayType = 'counter' | 'cardDraw' | 'cardDivider' | 'cup' | 'cardWell' | 'standee' | 'reserved' | 'card';

// Loose tray operations
export function addLooseTray(sectionId?: string, trayType: TrayType = 'counter'): Tray | null {
  // Find the target section
  const targetSectionId = sectionId ?? project.selectedSectionId ?? project.sections[0]?.id;
  const section = project.sections.find((l) => l.id === targetSectionId);
  if (!section) return null;

  const trayNumber = section.looseTrays.length + 1;
  const color = getNextTrayColor(project.sections);

  let tray: Tray;
  if (trayType === 'cardDraw' || trayType === 'card') {
    tray = createDefaultCardDrawTray(`Loose Card ${trayNumber}`, color, project.cardSizes);
  } else if (trayType === 'cardDivider') {
    tray = createDefaultCardDividerTray(`Loose Divider ${trayNumber}`, color, project.cardSizes);
  } else if (trayType === 'cup') {
    tray = createDefaultCupTray(`Loose Cups ${trayNumber}`, color);
  } else if (trayType === 'cardWell') {
    tray = createDefaultCardWellTray(`Loose Well ${trayNumber}`, color, project.cardSizes);
  } else if (trayType === 'standee') {
    tray = createDefaultStandeeTray(`Loose Standees ${trayNumber}`, color, project.standees);
  } else if (trayType === 'reserved') {
    const reservedNumber = section.looseTrays.filter((t) => t.type === 'reserved').length + 1;
    tray = createDefaultReservedTray(`Reserved space ${reservedNumber}`);
  } else {
    tray = createDefaultCounterTray(`Loose Tray ${trayNumber}`, color, project.counterShapes);
    // Inherit global params (including customShapes) from existing counter trays
    const globalParams = getGlobalParamsFromExisting();
    tray.params = { ...tray.params, ...globalParams };
  }

  section.looseTrays.push(tray);
  project.selectedSectionId = section.id;
  project.selectedBoxId = null;
  project.selectedTrayId = tray.id;

  autosave();
  return tray;
}

export function deleteLooseTray(trayId: string): void {
  for (const section of project.sections) {
    const index = section.looseTrays.findIndex((t) => t.id === trayId);
    if (index !== -1) {
      section.looseTrays.splice(index, 1);

      // Update selection
      if (project.selectedTrayId === trayId) {
        if (section.looseTrays.length > 0) {
          const newIndex = Math.min(index, section.looseTrays.length - 1);
          project.selectedTrayId = section.looseTrays[newIndex].id;
        } else if (section.boxes.length > 0) {
          project.selectedBoxId = section.boxes[0].id;
          project.selectedTrayId = section.boxes[0].trays[0]?.id ?? null;
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
  // Reserved spaces live directly in a section
  if (trayType === 'reserved') return null;
  // Find the box across all sections
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
    if (box) {
      const trayNumber = box.trays.length + 1;
      const color = getNextTrayColor(project.sections);

      let tray: Tray;
      if (trayType === 'cardDraw' || trayType === 'card') {
        tray = createDefaultCardDrawTray(`Card Draw ${trayNumber}`, color, project.cardSizes);
      } else if (trayType === 'cardDivider') {
        tray = createDefaultCardDividerTray(`Card Divider ${trayNumber}`, color, project.cardSizes);
      } else if (trayType === 'cup') {
        tray = createDefaultCupTray(`Cup Tray ${trayNumber}`, color);
      } else if (trayType === 'cardWell') {
        tray = createDefaultCardWellTray(`Card Well ${trayNumber}`, color, project.cardSizes);
      } else if (trayType === 'standee') {
        tray = createDefaultStandeeTray(`Standee Tray ${trayNumber}`, color, project.standees);
      } else {
        tray = createDefaultCounterTray(`Tray ${trayNumber}`, color, project.counterShapes);
        // Inherit global params (including customShapes) from existing counter trays
        const globalParams = getGlobalParamsFromExisting();
        tray.params = { ...tray.params, ...globalParams };
      }

      box.trays.push(tray);
      project.selectedSectionId = section.id;
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

  // Find the box across all sections
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
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
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray) {
        Object.assign(tray, updates);
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray) {
      Object.assign(looseTray, updates);
      autosave();
      return;
    }
  }
}

// Set tray rotation override ('auto' | 0 | 90)
export function setTrayRotation(trayId: string, rotation: 'auto' | 0 | 90): void {
  for (const section of project.sections) {
    // Check box trays
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray) {
        tray.rotationOverride = rotation;
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray) {
      looseTray.rotationOverride = rotation;
      autosave();
      return;
    }
  }
}

// Update counter tray params
export function updateTrayParams(trayId: string, params: CounterTrayParams): void {
  for (const section of project.sections) {
    // Check box trays
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCounterTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    // Check loose trays
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
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
    for (const section of project.sections) {
      for (const box of section.boxes) {
        for (const tray of box.trays) {
          if (isCounterTray(tray)) {
            tray.params.topLoadedStacks = tray.params.topLoadedStacks.filter(([shapeId]) => shapeId !== id);
            tray.params.edgeLoadedStacks = tray.params.edgeLoadedStacks.filter(([shapeId]) => shapeId !== id);
          }
        }
      }
      for (const tray of section.looseTrays) {
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

// Standee operations (global)
export function getStandees(): Standee[] {
  return project.standees;
}

export function getStandee(id: string): Standee | null {
  return project.standees.find((s) => s.id === id) ?? null;
}

export function addStandee(standee: Omit<Standee, 'id'>): Standee {
  const newStandee: Standee = { ...standee, id: generateId() };
  project.standees.push(newStandee);
  autosave();
  return newStandee;
}

export function updateStandee(id: string, updates: Partial<Omit<Standee, 'id'>>): void {
  const standee = project.standees.find((s) => s.id === id);
  if (standee) {
    Object.assign(standee, updates);
    autosave();
  }
}

export function deleteStandee(id: string): void {
  const index = project.standees.findIndex((s) => s.id === id);
  if (index < 0) return;
  project.standees.splice(index, 1);

  // Re-point any standee trays that referenced the deleted standee to the first
  // remaining standee so geometry keeps generating.
  const fallbackId = project.standees[0]?.id ?? '';
  const repoint = (tray: Tray) => {
    if (isStandeeTray(tray) && tray.params.standeeId === id) {
      tray.params.standeeId = fallbackId;
    }
  };
  for (const section of project.sections) {
    for (const box of section.boxes) {
      for (const tray of box.trays) repoint(tray);
    }
    for (const tray of section.looseTrays) repoint(tray);
  }
  autosave();
}

// Default global settings
export const DEFAULT_GLOBAL_SETTINGS = {
  gameContainerWidth: 256,
  gameContainerDepth: 256
};

// Global settings operations
export function getGlobalSettings(): {
  gameContainerWidth: number;
  gameContainerDepth: number;
  gameContainerHeight?: number;
} {
  // If project has explicit global settings, use those
  if (project.globalSettings) {
    return {
      gameContainerWidth: project.globalSettings.gameContainerWidth,
      gameContainerDepth: project.globalSettings.gameContainerDepth,
      gameContainerHeight: project.globalSettings.gameContainerHeight
    };
  }
  // Otherwise, try to get from existing counter tray
  for (const section of project.sections) {
    for (const box of section.boxes) {
      for (const tray of box.trays) {
        if (isCounterTray(tray)) {
          return {
            gameContainerWidth: tray.params.gameContainerWidth,
            gameContainerDepth: tray.params.gameContainerDepth
          };
        }
      }
    }
    for (const tray of section.looseTrays) {
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

export function updateGlobalSettings(updates: {
  gameContainerWidth?: number;
  gameContainerDepth?: number;
  // null clears the height (no height check)
  gameContainerHeight?: number | null;
}): void {
  // Initialize global settings if not present. Start from the effective values so that setting
  // one field does not reset the others to defaults.
  if (!project.globalSettings) {
    const current = getGlobalSettings();
    project.globalSettings = {
      gameContainerWidth: current.gameContainerWidth,
      gameContainerDepth: current.gameContainerDepth
    };
  }
  // The height belongs to the project only; it is not copied into counter trays.
  if (updates.gameContainerHeight === null) {
    delete project.globalSettings.gameContainerHeight;
  } else if (updates.gameContainerHeight !== undefined) {
    project.globalSettings.gameContainerHeight = updates.gameContainerHeight;
  }
  // Update project-level settings
  if (updates.gameContainerWidth !== undefined) {
    project.globalSettings.gameContainerWidth = updates.gameContainerWidth;
  }
  if (updates.gameContainerDepth !== undefined) {
    project.globalSettings.gameContainerDepth = updates.gameContainerDepth;
  }

  // Propagate to all counter trays (these are "global" params)
  for (const section of project.sections) {
    for (const box of section.boxes) {
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
    for (const tray of section.looseTrays) {
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
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCardDrawTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
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
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCardDividerTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCardDividerTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Update cup tray params
export function updateCupTrayParams(trayId: string, params: CupTrayParams): void {
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCupTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCupTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Update card well tray params
export function updateCardWellTrayParams(trayId: string, params: CardWellTrayParams): void {
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isCardWellTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isCardWellTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Update reserved space dimensions (reserved spaces are always loose in a section)
export function updateReservedTrayParams(trayId: string, params: ReservedSpaceParams): void {
  for (const section of project.sections) {
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isReservedTray(looseTray)) {
      looseTray.params = params;
      autosave();
      return;
    }
  }
}

// Update standee tray params
export function updateStandeeTrayParams(trayId: string, params: StandeeTrayParams): void {
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray && isStandeeTray(tray)) {
        tray.params = params;
        autosave();
        return;
      }
    }
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray && isStandeeTray(looseTray)) {
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

// Move a tray to a different box (or create a new box in the same section)
export function moveTray(trayId: string, targetBoxId: string | 'new'): void {
  // Find the tray and its current location
  let sourceTray: Tray | null = null;
  let sourceBox: Box | null = null;
  let sourceSection: Section | null = null;
  let sourceIndex = -1;
  let isLoose = false;

  for (const section of project.sections) {
    // Check boxes
    for (const box of section.boxes) {
      const trayIndex = box.trays.findIndex((t) => t.id === trayId);
      if (trayIndex !== -1) {
        sourceTray = box.trays[trayIndex];
        sourceBox = box;
        sourceSection = section;
        sourceIndex = trayIndex;
        break;
      }
    }
    if (sourceTray) break;

    // Check loose trays
    const looseTrayIndex = section.looseTrays.findIndex((t) => t.id === trayId);
    if (looseTrayIndex !== -1) {
      sourceTray = section.looseTrays[looseTrayIndex];
      sourceSection = section;
      sourceIndex = looseTrayIndex;
      isLoose = true;
      break;
    }
  }

  if (!sourceTray || !sourceSection) return;
  // Reserved spaces live directly in a section, never in a box
  if (isReservedTray(sourceTray)) return;

  // Determine target box
  let targetBox: Box;
  if (targetBoxId === 'new') {
    // Create a new box in the same section
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
    sourceSection.boxes.push(targetBox);
  } else {
    // Find target box across all sections
    let found: Box | null = null;
    for (const section of project.sections) {
      const box = section.boxes.find((b) => b.id === targetBoxId);
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
    sourceSection.looseTrays.splice(sourceIndex, 1);
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

// Move a box to a different section (or create a new section)
export function moveBoxToSection(boxId: string, targetSectionId: string | 'new'): void {
  let sourceBox: Box | null = null;
  let sourceSection: Section | null = null;
  let sourceIndex = -1;

  for (const section of project.sections) {
    const boxIndex = section.boxes.findIndex((b) => b.id === boxId);
    if (boxIndex !== -1) {
      sourceBox = section.boxes[boxIndex];
      sourceSection = section;
      sourceIndex = boxIndex;
      break;
    }
  }

  if (!sourceBox || !sourceSection) return;

  // Determine target section
  let targetSection: Section;
  if (targetSectionId === 'new') {
    // Create a new section
    const sectionNumber = project.sections.length + 1;
    targetSection = createDefaultSection(`Section ${sectionNumber}`);
    project.sections.push(targetSection);
  } else {
    const found = project.sections.find((l) => l.id === targetSectionId);
    if (!found || found.id === sourceSection.id) return;
    targetSection = found;
  }

  // Remove from source section
  sourceSection.boxes.splice(sourceIndex, 1);

  // Add to target section
  targetSection.boxes.push(sourceBox);

  // Update selection
  project.selectedSectionId = targetSection.id;
  project.selectedBoxId = sourceBox.id;

  autosave();
}

// Move a loose tray into a box
export function moveLooseTrayToBox(trayId: string, targetBoxId: string): void {
  let sourceTray: Tray | null = null;
  let sourceSection: Section | null = null;
  let sourceIndex = -1;

  for (const section of project.sections) {
    const trayIndex = section.looseTrays.findIndex((t) => t.id === trayId);
    if (trayIndex !== -1) {
      sourceTray = section.looseTrays[trayIndex];
      sourceSection = section;
      sourceIndex = trayIndex;
      break;
    }
  }

  if (!sourceTray || !sourceSection) return;
  // Reserved spaces live directly in a section, never in a box
  if (isReservedTray(sourceTray)) return;

  // Find target box
  let targetBox: Box | null = null;
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === targetBoxId);
    if (box) {
      targetBox = box;
      break;
    }
  }

  if (!targetBox) return;

  // Remove from loose trays
  sourceSection.looseTrays.splice(sourceIndex, 1);

  // Add to target box
  targetBox.trays.push(sourceTray);

  // Update selection
  project.selectedBoxId = targetBox.id;
  project.selectedTrayId = sourceTray.id;

  autosave();
}

// Move a tray from a box to loose, or move a loose tray to a different section
export function moveTrayToLoose(trayId: string, targetSectionId?: string): void {
  let sourceTray: Tray | null = null;
  let sourceBox: Box | null = null;
  let sourceSection: Section | null = null;
  let sourceIndex = -1;
  let isLooseTray = false;

  // First, check if tray is in a box
  for (const section of project.sections) {
    for (const box of section.boxes) {
      const trayIndex = box.trays.findIndex((t) => t.id === trayId);
      if (trayIndex !== -1) {
        sourceTray = box.trays[trayIndex];
        sourceBox = box;
        sourceSection = section;
        sourceIndex = trayIndex;
        break;
      }
    }
    if (sourceTray) break;
  }

  // If not found in a box, check loose trays
  if (!sourceTray) {
    for (const section of project.sections) {
      const looseIndex = section.looseTrays.findIndex((t) => t.id === trayId);
      if (looseIndex !== -1) {
        sourceTray = section.looseTrays[looseIndex];
        sourceSection = section;
        sourceIndex = looseIndex;
        isLooseTray = true;
        break;
      }
    }
  }

  if (!sourceTray || !sourceSection) return;

  const targetSection = targetSectionId
    ? (project.sections.find((l) => l.id === targetSectionId) ?? sourceSection)
    : sourceSection;

  // If already loose and moving to same section, nothing to do
  if (isLooseTray && targetSection.id === sourceSection.id) return;

  // Remove from source
  if (isLooseTray) {
    sourceSection.looseTrays.splice(sourceIndex, 1);
  } else if (sourceBox) {
    sourceBox.trays.splice(sourceIndex, 1);
  }

  // Add to target section's loose trays
  targetSection.looseTrays.push(sourceTray);

  // Update selection
  project.selectedSectionId = targetSection.id;
  project.selectedBoxId = null;
  project.selectedTrayId = sourceTray.id;

  autosave();
}

// Import project from JSON data
export function importProject(data: Project): void {
  // Run migrations to ensure all fields have proper defaults (handles older exported files)
  project = migrateProjectData(data);
  // Ensure selection is valid
  if (project.sections.length > 0) {
    // Ensure selectedSectionId is valid
    const selectedSection = project.sections.find((l) => l.id === project.selectedSectionId);
    if (!selectedSection) {
      project.selectedSectionId = project.sections[0].id;
    }
    const section = project.sections.find((l) => l.id === project.selectedSectionId);
    if (section) {
      // Ensure selectedBoxId is valid
      if (project.selectedBoxId) {
        const selectedBox = section.boxes.find((b) => b.id === project.selectedBoxId);
        if (!selectedBox) {
          if (section.boxes.length > 0) {
            project.selectedBoxId = section.boxes[0].id;
          } else {
            project.selectedBoxId = null;
          }
        }
      }
      // Ensure selectedTrayId is valid (or set default if not set)
      const needsTraySelection = !project.selectedTrayId || !findTrayLocation(project, project.selectedTrayId);
      if (needsTraySelection) {
        // Find first available tray
        if (section.boxes.length > 0 && section.boxes[0].trays.length > 0) {
          project.selectedBoxId = section.boxes[0].id;
          project.selectedTrayId = section.boxes[0].trays[0].id;
        } else if (section.looseTrays.length > 0) {
          project.selectedBoxId = null;
          project.selectedTrayId = section.looseTrays[0].id;
        } else {
          project.selectedTrayId = null;
        }
      }
    }
  } else {
    project.selectedSectionId = null;
    project.selectedBoxId = null;
    project.selectedTrayId = null;
  }
  autosave();
}

// Manual layout operations
import type { ManualTrayPlacement } from '#lib/types/project.js';

// Save manual tray layout for a box (box dimensions auto-calculate from tray positions)
export function saveManualLayout(boxId: string, placements: ManualTrayPlacement[]): void {
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
    if (box) {
      box.manualLayout = placements;
      autosave();
      return;
    }
  }
}

// Clear manual layout for a box (reverts to auto bin-packing)
export function clearManualLayout(boxId: string): void {
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
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
  for (const section of project.sections) {
    const box = section.boxes.find((b) => b.id === boxId);
    if (box) return box.manualLayout;
  }
  return undefined;
}

// Save manual section layout (box and loose tray positions)
export function saveSectionLayout(
  sectionId: string,
  boxPlacements: ManualBoxPlacement[],
  looseTrayPlacements: ManualLooseTrayPlacement[]
): void {
  const section = project.sections.find((l) => l.id === sectionId);
  if (!section) return;

  section.manualLayout = {
    boxes: boxPlacements,
    looseTrays: looseTrayPlacements
  };

  autosave();
}

// Clear manual section layout (reverts to auto arrangement)
export function clearSectionLayout(sectionId: string): void {
  const section = project.sections.find((l) => l.id === sectionId);
  if (!section) return;

  section.manualLayout = undefined;
  autosave();
}

// Whether any section has a position in the game container (project layout)
export function hasProjectLayout(): boolean {
  return project.sections.some((s) => s.placement !== undefined);
}

// Save the position of every section in the game container
export function saveProjectLayout(placements: Record<string, SectionPlacement>): void {
  for (const section of project.sections) {
    const placement = placements[section.id];
    if (placement) {
      section.placement = { ...placement };
    }
  }
  autosave();
}

// Move one section's placement (used to keep a section in place when its own layout changes)
export function setSectionPlacement(sectionId: string, placement: SectionPlacement | undefined): void {
  const section = project.sections.find((l) => l.id === sectionId);
  if (!section) return;
  if (placement) {
    section.placement = { ...placement };
  } else {
    delete section.placement;
  }
  autosave();
}

// Clear the project layout (sections go back to stacking as full slices)
export function clearProjectLayout(): void {
  for (const section of project.sections) {
    delete section.placement;
  }
  autosave();
}

// Get manual section layout
export function getSectionLayout(
  sectionId: string
): { boxes: ManualBoxPlacement[]; looseTrays: ManualLooseTrayPlacement[] } | undefined {
  const section = project.sections.find((l) => l.id === sectionId);
  return section?.manualLayout;
}

// Deep clone helper for duplicating objects
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Duplicate a tray (works for both box trays and loose trays)
export function duplicateTray(trayId: string): Tray | null {
  // Find the tray and its location
  for (const section of project.sections) {
    // Check box trays
    for (const box of section.boxes) {
      const trayIndex = box.trays.findIndex((t) => t.id === trayId);
      if (trayIndex !== -1) {
        const originalTray = box.trays[trayIndex];
        const newTray: Tray = deepClone(originalTray);
        newTray.id = generateId();
        newTray.name = `${originalTray.name} copy`;
        newTray.color = getNextTrayColor(project.sections);

        // Insert after the original tray
        box.trays.splice(trayIndex + 1, 0, newTray);

        // Clear manual layout since we added a tray
        box.manualLayout = undefined;
        box.customWidth = undefined;
        box.customDepth = undefined;

        // Select the new tray
        project.selectedSectionId = section.id;
        project.selectedBoxId = box.id;
        project.selectedTrayId = newTray.id;

        autosave();
        return newTray;
      }
    }

    // Check loose trays
    const looseTrayIndex = section.looseTrays.findIndex((t) => t.id === trayId);
    if (looseTrayIndex !== -1) {
      const originalTray = section.looseTrays[looseTrayIndex];
      const newTray: Tray = deepClone(originalTray);
      newTray.id = generateId();
      newTray.name = `${originalTray.name} copy`;
      newTray.color = getNextTrayColor(project.sections);

      // Insert after the original tray
      section.looseTrays.splice(looseTrayIndex + 1, 0, newTray);

      // Select the new tray
      project.selectedSectionId = section.id;
      project.selectedBoxId = null;
      project.selectedTrayId = newTray.id;

      autosave();
      return newTray;
    }
  }

  return null;
}

// Duplicate a box (including all its trays)
export function duplicateBox(boxId: string): Box | null {
  for (const section of project.sections) {
    const boxIndex = section.boxes.findIndex((b) => b.id === boxId);
    if (boxIndex !== -1) {
      const originalBox = section.boxes[boxIndex];
      const newBox: Box = deepClone(originalBox);

      // Generate new IDs for box and all trays
      newBox.id = generateId();
      newBox.name = `${originalBox.name} copy`;
      newBox.manualLayout = undefined;
      newBox.customWidth = undefined;
      newBox.customDepth = undefined;

      // Generate new IDs and colors for all trays
      for (const tray of newBox.trays) {
        tray.id = generateId();
        tray.color = getNextTrayColor(project.sections);
      }

      // Insert after the original box
      section.boxes.splice(boxIndex + 1, 0, newBox);

      // Clear section manual layout since we added a box
      section.manualLayout = undefined;

      // Select the new box
      project.selectedSectionId = section.id;
      project.selectedBoxId = newBox.id;
      project.selectedTrayId = newBox.trays[0]?.id ?? null;

      autosave();
      return newBox;
    }
  }

  return null;
}

// Duplicate a section (including all boxes and loose trays)
export function duplicateSection(sectionId: string): Section | null {
  const sectionIndex = project.sections.findIndex((l) => l.id === sectionId);
  if (sectionIndex === -1) return null;

  const originalSection = project.sections[sectionIndex];
  const newSection: Section = deepClone(originalSection);

  // Generate new IDs
  newSection.id = generateId();
  newSection.name = `${originalSection.name} copy`;
  newSection.manualLayout = undefined;
  if (originalSection.placement) {
    // Same spot in the container, resting directly on top of the original
    newSection.placement = {
      x: originalSection.placement.x,
      y: originalSection.placement.y,
      z: originalSection.placement.z + 0.001,
      rotation: originalSection.placement.rotation
    };
  }

  // Generate new IDs for all boxes and their trays
  for (const box of newSection.boxes) {
    box.id = generateId();
    box.manualLayout = undefined;
    box.customWidth = undefined;
    box.customDepth = undefined;
    for (const tray of box.trays) {
      tray.id = generateId();
      tray.color = getNextTrayColor(project.sections);
    }
  }

  // Generate new IDs for all loose trays
  for (const tray of newSection.looseTrays) {
    tray.id = generateId();
    tray.color = getNextTrayColor(project.sections);
  }

  // Insert after the original section
  project.sections.splice(sectionIndex + 1, 0, newSection);

  // Select the new section
  project.selectedSectionId = newSection.id;
  project.selectedBoxId = newSection.boxes[0]?.id ?? null;
  project.selectedTrayId = newSection.boxes[0]?.trays[0]?.id ?? newSection.looseTrays[0]?.id ?? null;

  autosave();
  return newSection;
}
