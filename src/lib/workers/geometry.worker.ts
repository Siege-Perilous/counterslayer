/**
 * Web Worker for geometry generation
 * Runs JSCAD operations off the main thread to prevent UI freezing
 */

import {
  arrangeTrays,
  calculateTraySpacers,
  getSharedTrayHeight,
  getTrayDimensionsForTray,
  validateCustomDimensions,
  type TrayPlacement
} from '#lib/models/box.js';
import { createCardDividerTray, getCardDividerPositions } from '#lib/models/cardDividerTray.js';
import { createCardDrawTray, getCardDrawPositions } from '#lib/models/cardTray.js';
import { createCardWellTray, getCardWellPositions } from '#lib/models/cardWellTray.js';
import {
  createCounterTray,
  getCounterPositions,
  type CounterStack,
  type CustomCardSize
} from '#lib/models/counterTray.js';
import { createCupTray, createCupTrayLid } from '#lib/models/cupTray.js';
import { createBoxWithLidGrooves, createLid } from '#lib/models/lid.js';
import { getReservedSpaceDimensions } from '#lib/models/reservedSpace.js';
import { calculateSectionHeight } from '#lib/models/section.js';
import { createStandeeTray, getStandeePositions } from '#lib/models/standeeTray.js';
import type { Box, CardSize, CounterShape, Section, Standee, Tray } from '#lib/types/project.js';
import {
  isCardDividerTray,
  isCardTray,
  isCardWellTray,
  isCupTray,
  isReservedTray,
  isStandeeTray
} from '#lib/types/project.js';
import { repairTJunctions } from '#lib/utils/meshRepair.js';
import threemfSerializer from '@jscad/3mf-serializer';
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import stlSerializer from '@jscad/stl-serializer';

const { geom3 } = jscad.geometries;
const { cuboid } = jscad.primitives;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generalize = (jscad.modifiers as any).generalize as (
  options: { snap?: boolean; simplify?: boolean; triangulate?: boolean },
  geom: Geom3
) => Geom3;

/**
 * Clean geometry before STL export to reduce non-manifold edges.
 * Applies snap and simplify (merge coplanar polygons).
 * Then closes T-junctions so slicers do not report non-manifold edges (output is triangles).
 */
function cleanGeometryForExport(geom: Geom3): Geom3 {
  // generalize() does not close the T-junctions booleans leave behind; repairTJunctions does
  return repairTJunctions(generalize({ snap: true, simplify: true }, geom));
}

/**
 * Generate a tray letter based on cumulative index across all sections.
 * A-Z for first 26, then AA, BB, CC... for 26+
 */
function getTrayLetter(index: number): string {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  const letter = String.fromCharCode(65 + (index % 26));
  const repeat = Math.floor(index / 26) + 1;
  return letter.repeat(repeat);
}

/**
 * Get all boxes from all sections.
 */
function getAllBoxes(sections: Section[]): Box[] {
  const boxes: Box[] = [];
  for (const section of sections) {
    boxes.push(...section.boxes);
  }
  return boxes;
}

/**
 * Get cumulative tray index across all sections.
 * Order: For each section, count box trays first, then loose trays.
 */
function getCumulativeTrayIndexForTray(sections: Section[], trayId: string): number {
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
      if (!isReservedTray(tray)) cumulative++;
    }
  }
  return cumulative;
}

/**
 * Calculate unified section height for a section.
 * All items in a section should have the same total height for proper stacking.
 *
 * The section height is the maximum of:
 * - All box exterior heights (including floor, walls, lid groove)
 * - All loose tray content heights
 *
 * For loose trays to match box height, they are generated at the section height.
 * For boxes to match a taller loose tray, their interior trays need to grow.
 */
function calculateUnifiedSectionHeight(
  section: Section,
  cardSizes: CardSize[],
  counterShapes: CounterShape[],
  standees: Standee[] = []
): number {
  return calculateSectionHeight(section, { cardSizes, counterShapes, standees });
}

/**
 * Calculate the required interior tray height for a box to match a target section height.
 * The lid slides into the box - only the flat top (lid thickness) sticks above.
 * Box body = section height - lid thickness (visible part)
 * Box interior = box body - floor thickness
 * Required tray height = box interior
 */
function getRequiredTrayHeightForBox(box: Box, targetSectionHeight: number): number {
  // Only the lid thickness (flat top) sticks above the box, not the full lid height
  const lidThickness = box.lidParams?.thickness ?? 2;
  const floorThickness = box.floorThickness;

  // Box body = section height - lid visible height
  // Tray height = box interior = box body - floor
  const requiredTrayHeight = targetSectionHeight - lidThickness - floorThickness;

  // Return at least 0 (shouldn't happen in practice)
  return Math.max(requiredTrayHeight, 0);
}

// Message types
interface GenerateMessage {
  type: 'generate';
  id: number;
  project: {
    sections: Section[];
    cardSizes?: CardSize[];
    counterShapes?: CounterShape[];
    standees?: Standee[];
  };
  selectedBoxId: string;
  selectedTrayId: string;
}

interface ExportStlMessage {
  type: 'export-stl';
  id: number;
  target: 'tray' | 'box' | 'lid' | 'all-tray';
  trayIndex?: number; // For all-tray exports
}

interface ExportAllStlsMessage {
  type: 'export-all-stls';
  id: number;
}

interface Export3mfMessage {
  type: 'export-3mf';
  id: number;
}

type WorkerMessage = GenerateMessage | ExportStlMessage | ExportAllStlsMessage | Export3mfMessage;

// Geometry data to transfer back (raw arrays for BufferGeometry reconstruction)
interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
}

interface TrayGeometryResult {
  trayId: string;
  name: string;
  color: string;
  geometry: GeometryData;
  // The tray's own lid (cup trays with a lid), in print orientation
  lidGeometry?: GeometryData | null;
  placement: TrayPlacement;
  counterStacks: CounterStack[];
  trayLetter: string;
}

interface BoxGeometryResult {
  boxId: string;
  boxName: string;
  boxGeometry: GeometryData | null;
  lidGeometry: GeometryData | null;
  trayGeometries: TrayGeometryResult[];
  boxDimensions: { width: number; depth: number; height: number };
}

interface LooseTrayGeometryResult {
  trayId: string;
  sectionId: string;
  name: string;
  color: string;
  geometry: GeometryData;
  // The tray's own lid (cup trays with a lid), in print orientation
  lidGeometry?: GeometryData | null;
  dimensions: { width: number; depth: number; height: number };
  counterStacks: CounterStack[];
  trayLetter: string;
}

interface GenerateResult {
  type: 'generate-result';
  id: number;
  selectedTrayGeometry: GeometryData;
  selectedTrayCounters: CounterStack[];
  allTrayGeometries: TrayGeometryResult[];
  boxGeometry: GeometryData | null;
  lidGeometry: GeometryData | null;
  allBoxGeometries: BoxGeometryResult[];
  allLooseTrayGeometries: LooseTrayGeometryResult[];
  error?: string;
}

interface ExportStlResult {
  type: 'export-stl-result';
  id: number;
  data: ArrayBuffer;
  filename: string;
  error?: string;
}

interface StlFile {
  filename: string;
  data: ArrayBuffer;
}

interface ExportAllStlsResult {
  type: 'export-all-stls-result';
  id: number;
  files: StlFile[];
  error?: string;
}

interface Export3mfResult {
  type: 'export-3mf-result';
  id: number;
  data: ArrayBuffer;
  filename: string;
  error?: string;
}

interface GenerationProgressMessage {
  type: 'generation-progress';
  id: number;
  current: number;
  total: number;
  currentItem: string;
}

// Cache the last generated JSCAD geometries for STL export
let cachedSelectedTray: Geom3 | null = null;
let cachedBox: Geom3 | null = null;
let cachedLid: Geom3 | null = null;
let cachedAllTrays: { jscadGeom: Geom3; name: string }[] = [];
let cachedBoxName = '';

// Cache for all boxes (for export all)
interface CachedBoxData {
  boxName: string;
  boxGeom: Geom3 | null;
  lidGeom: Geom3 | null;
  trays: { jscadGeom: Geom3; name: string }[];
}
let cachedAllBoxes: CachedBoxData[] = [];

// Cache for all loose trays (for export all)
interface CachedLooseTrayData {
  trayName: string;
  trayGeom: Geom3;
}
let cachedAllLooseTrays: CachedLooseTrayData[] = [];

/**
 * Sanitize a string for use in filenames (replace slashes, spaces, etc.)
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[/\\]+/g, '-') // Replace slashes with dashes
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, ''); // Trim leading/trailing dashes
}

/**
 * Create tray geometry based on tray type
 */
function createTrayGeometry(
  tray: Tray,
  cardSizes: CustomCardSize[],
  counterShapes: CounterShape[],
  maxHeight: number,
  spacerHeight: number,
  standees: Standee[] = []
): Geom3 {
  const showEmboss = tray.showEmboss ?? true;
  if (isReservedTray(tray)) {
    // A reserved space has no printable geometry. This plain block is for display only and
    // must never reach an export (callers keep it out of the export caches).
    const dims = getReservedSpaceDimensions(tray.params);
    const height = Math.max(maxHeight, dims.height);
    return cuboid({ size: [dims.width, dims.depth, height], center: [dims.width / 2, dims.depth / 2, height / 2] });
  }
  if (isCupTray(tray)) {
    return createCupTray(tray.params, tray.name, maxHeight, spacerHeight, showEmboss);
  }
  if (isStandeeTray(tray)) {
    return createStandeeTray(tray.params, standees, tray.name, maxHeight, spacerHeight, showEmboss);
  }
  if (isCardWellTray(tray)) {
    return createCardWellTray(tray.params, cardSizes, tray.name, maxHeight, spacerHeight, showEmboss);
  }
  if (isCardDividerTray(tray)) {
    const showStackLabels = tray.showStackLabels ?? true;
    return createCardDividerTray(
      tray.params,
      cardSizes,
      tray.name,
      maxHeight,
      spacerHeight,
      showEmboss,
      showStackLabels
    );
  }
  if (isCardTray(tray)) {
    return createCardDrawTray(tray.params, cardSizes, tray.name, maxHeight, spacerHeight, showEmboss);
  }
  // Default to counter tray
  return createCounterTray(tray.params, counterShapes, tray.name, maxHeight, spacerHeight, showEmboss);
}

/**
 * The tray's own lid, for tray types that can have one (cup trays), or null.
 * The lid does not depend on the tray's height.
 */
function createTrayLidGeometry(tray: Tray): Geom3 | null {
  if (isCupTray(tray)) {
    return createCupTrayLid(tray.params, tray.name);
  }
  return null;
}

/** Export name for a tray's own lid */
function trayLidName(trayName: string): string {
  return `${trayName}-lid`;
}

/**
 * Get stack positions based on tray type (returns CounterStack[] for compatibility)
 */
function getTrayPositions(
  tray: Tray,
  cardSizes: CustomCardSize[],
  counterShapes: CounterShape[],
  maxHeight: number,
  spacerHeight: number,
  standees: Standee[] = []
): CounterStack[] {
  if (isCupTray(tray) || isReservedTray(tray)) {
    // Cup trays don't have counter previews - the cups themselves are the containers.
    // Reserved spaces are plain blocks with nothing in them.
    return [];
  }
  if (isStandeeTray(tray)) {
    // Each standee = a round base disc with a perpendicular rectangular figure, leaning in its slot.
    const placed = getStandeePositions(tray.params, standees, maxHeight, spacerHeight);
    return placed.map((s) => ({
      shape: 'custom' as const,
      customShapeName: 'Standee',
      customBaseShape: 'rectangle' as const,
      x: s.x,
      y: s.y,
      z: s.z,
      width: s.figureWidth,
      length: s.figureLength,
      thickness: s.figureThickness,
      count: 1,
      hexPointyTop: false,
      color: '#c9a36a',
      isStandee: true,
      standeeBaseRadius: s.baseRadius,
      standeeBaseThickness: s.baseThickness,
      standeeFigureDir: s.figureDir,
      standeeTilt: s.tilt
    }));
  }
  if (isCardWellTray(tray)) {
    // Convert card well positions to CounterStack format for visualization
    const wellStacks = getCardWellPositions(tray.params, cardSizes, maxHeight, spacerHeight);
    return wellStacks.map((stack) => ({
      shape: 'custom' as const,
      customShapeName: stack.label,
      customBaseShape: 'rectangle' as const,
      x: stack.x,
      y: stack.y,
      z: stack.z,
      width: stack.width,
      length: stack.length,
      thickness: stack.thickness,
      count: stack.count,
      hexPointyTop: false,
      color: '#5588aa',
      innerWidth: stack.innerWidth,
      innerLength: stack.innerLength
    }));
  }
  if (isCardDividerTray(tray)) {
    // Convert CardDividerStackPosition to CounterStack format for visualization
    const dividerStacks = getCardDividerPositions(tray.params, cardSizes, maxHeight, spacerHeight);
    return dividerStacks.map((stack) => {
      // For card divider: cards stand on edge
      // vertical orientation: cards stand with long edge up (cardLength is height)
      // horizontal orientation: cards stand with short edge up (cardWidth is height)
      const isVertical = stack.orientation === 'vertical';

      // For vertical: standingHeight=cardLength, frontWidth=cardWidth
      // For horizontal: standingHeight=cardWidth, frontWidth=cardLength
      const standingHeight = isVertical ? stack.cardLength : stack.cardWidth;
      const frontWidth = isVertical ? stack.cardWidth : stack.cardLength;

      // getCardDividerPositions returns CENTER positions, but TrayScene expects:
      // - x to be the LEFT EDGE of the slot
      // - y to be the FRONT EDGE of the slot
      // Convert from center to edge positions
      const edgeX = stack.x - stack.slotWidth / 2;
      const edgeY = stack.y - stack.slotDepth / 2;

      return {
        shape: 'custom' as const,
        customShapeName: stack.label ?? 'Card',
        customBaseShape: 'rectangle' as const,
        x: edgeX,
        y: edgeY,
        z: stack.z,
        // For card dividers with crosswise orientation:
        // Box geometry args = [length, standingHeight, thickness]
        // length = X dimension (front-facing width of card)
        // width = not directly used, but set for consistency
        width: frontWidth,
        length: frontWidth,
        thickness: stack.cardThickness,
        count: stack.count,
        hexPointyTop: false,
        color: stack.color,
        // For card divider: cards are standing on edge
        isEdgeLoaded: true,
        edgeOrientation: 'crosswise' as const,
        slotWidth: stack.slotWidth,
        slotDepth: stack.slotDepth,
        // Mark as card divider so TrayScene uses cardDividerHeight for Y
        isCardDivider: true,
        cardDividerHeight: standingHeight
      };
    });
  }
  if (isCardTray(tray)) {
    // Convert CardStack to CounterStack format for visualization
    const cardStacks = getCardDrawPositions(tray.params, cardSizes, maxHeight, spacerHeight);
    return cardStacks.map((stack) => ({
      shape: 'custom' as const,
      customShapeName: 'Card',
      customBaseShape: 'rectangle' as const,
      x: stack.x,
      y: stack.y,
      z: stack.z,
      width: stack.width,
      length: stack.length,
      thickness: stack.thickness,
      count: stack.count,
      hexPointyTop: false,
      color: stack.color,
      slopeAngle: stack.slopeAngle,
      innerWidth: stack.innerWidth,
      innerLength: stack.innerLength
    }));
  }
  // Default to counter tray
  return getCounterPositions(tray.params, counterShapes, maxHeight, spacerHeight);
}

/**
 * Convert JSCAD geometry to raw position and normal arrays
 */
function jscadToArrays(jscadGeom: Geom3): GeometryData {
  const polygons = geom3.toPolygons(jscadGeom);

  const positions: number[] = [];
  const normals: number[] = [];

  for (const polygon of polygons) {
    const vertices = polygon.vertices;

    if (vertices.length < 3) continue;

    const v0 = vertices[0];
    const v1 = vertices[1];
    const v2 = vertices[2];

    const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0]
    ];

    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (len > 0) {
      normal[0] /= len;
      normal[1] /= len;
      normal[2] /= len;
    }

    // Triangulate the polygon (fan triangulation)
    for (let i = 1; i < vertices.length - 1; i++) {
      positions.push(v0[0], v0[1], v0[2]);
      positions.push(vertices[i][0], vertices[i][1], vertices[i][2]);
      positions.push(vertices[i + 1][0], vertices[i + 1][1], vertices[i + 1][2]);

      normals.push(normal[0], normal[1], normal[2]);
      normals.push(normal[0], normal[1], normal[2]);
      normals.push(normal[0], normal[1], normal[2]);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals)
  };
}

/**
 * Find a box by ID across all sections
 */
function findBoxById(sections: Section[], boxId: string): Box | undefined {
  for (const section of sections) {
    const box = section.boxes.find((b) => b.id === boxId);
    if (box) return box;
  }
  return undefined;
}

/**
 * Find a tray by ID across all sections (boxes and loose trays)
 */
function findTrayById(sections: Section[], trayId: string): Tray | undefined {
  for (const section of sections) {
    // Check boxes
    for (const box of section.boxes) {
      const tray = box.trays.find((t) => t.id === trayId);
      if (tray) return tray;
    }
    // Check loose trays
    const looseTray = section.looseTrays.find((t) => t.id === trayId);
    if (looseTray) return looseTray;
  }
  return undefined;
}

/**
 * Generate all geometries for the project
 */
function handleGenerate(msg: GenerateMessage): void {
  const { id, project, selectedBoxId, selectedTrayId } = msg;
  const timings: { name: string; ms: number }[] = [];
  const time = (name: string, fn: () => void) => {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    timings.push({ name, ms: elapsed });
  };

  try {
    const box = selectedBoxId ? findBoxById(project.sections, selectedBoxId) : undefined;
    const tray = findTrayById(project.sections, selectedTrayId);

    if (!tray) {
      self.postMessage({
        type: 'generate-result',
        id,
        error: 'No tray selected'
      } as GenerateResult);
      return;
    }

    // Get card sizes, counter shapes and standees from project level (global)
    const cardSizes = project.cardSizes ?? [];
    const counterShapes = project.counterShapes ?? [];
    const standees = project.standees ?? [];

    // Pre-calculate unified section heights for all sections FIRST
    // All items in a section should have the same total exterior height for proper stacking
    const sectionHeights = new Map<string, number>();
    for (const section of project.sections) {
      const sectionHeight = calculateUnifiedSectionHeight(section, cardSizes, counterShapes, standees);
      sectionHeights.set(section.id, sectionHeight);
    }

    // Helper to find which section contains a box
    function findSectionForBox(boxId: string): Section | undefined {
      return project.sections.find((section) => section.boxes.some((b) => b.id === boxId));
    }

    // Helper to find which section contains a loose tray
    function findSectionForLooseTray(trayId: string): Section | undefined {
      return project.sections.find((section) => section.looseTrays.some((t) => t.id === trayId));
    }

    // If tray is in a box, generate box-related geometry
    let selectedTrayGeometry: GeometryData;
    let selectedTrayCounters: CounterStack[];
    let allTrayGeometries: TrayGeometryResult[] = [];
    let boxGeometry: GeometryData | null = null;
    let lidGeometry: GeometryData | null = null;

    if (box) {
      // Validate custom dimensions
      const validation = validateCustomDimensions(box, cardSizes, counterShapes, standees);
      if (!validation.valid) {
        self.postMessage({
          type: 'generate-result',
          id,
          error: validation.errors.join('; ')
        } as GenerateResult);
        return;
      }

      // Find the section containing this box and get the unified section height
      const selectedBoxSection = findSectionForBox(box.id);
      const selectedSectionHeight = selectedBoxSection ? (sectionHeights.get(selectedBoxSection.id) ?? 0) : 0;

      // Calculate the required tray height to match the section height
      const requiredTrayHeight = getRequiredTrayHeightForBox(box, selectedSectionHeight);

      // Generate all trays with their placements for selected box
      const placements = arrangeTrays(box.trays, {
        customBoxWidth: box.customWidth,
        wallThickness: box.wallThickness,
        tolerance: box.tolerance,
        cardSizes,
        counterShapes,
        standees,
        manualLayout: box.manualLayout
      });

      const spacerInfo = calculateTraySpacers(box, cardSizes, counterShapes, standees);
      // Use the section-adjusted tray height instead of natural height
      const naturalMaxHeight = getSharedTrayHeight(
        placements.map((p) => ({ tray: p.tray, height: p.dimensions.height }))
      );
      const maxHeight = selectedSectionHeight > 0 ? requiredTrayHeight : naturalMaxHeight;

      // Find spacer for selected tray
      const selectedSpacer = spacerInfo.find((s) => s.trayId === tray.id);
      const selectedSpacerHeight = selectedSpacer?.floorSpacerHeight ?? 0;

      // Generate selected tray
      cachedSelectedTray = createTrayGeometry(
        tray,
        cardSizes,
        counterShapes,
        maxHeight,
        selectedSpacerHeight,
        standees
      );
      selectedTrayGeometry = jscadToArrays(cachedSelectedTray);
      selectedTrayCounters = getTrayPositions(
        tray,
        cardSizes,
        counterShapes,
        maxHeight,
        selectedSpacerHeight,
        standees
      );

      // Generate all trays for selected box
      cachedAllTrays = [];
      allTrayGeometries = placements.map((placement) => {
        const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
        const spacerHeight = spacer?.floorSpacerHeight ?? 0;
        let jscadGeom!: Geom3;
        time(`createTray (${placement.tray.name})`, () => {
          jscadGeom = createTrayGeometry(placement.tray, cardSizes, counterShapes, maxHeight, spacerHeight, standees);
        });

        cachedAllTrays.push({ jscadGeom, name: placement.tray.name });
        const trayLid = createTrayLidGeometry(placement.tray);

        return {
          trayId: placement.tray.id,
          name: placement.tray.name,
          color: placement.tray.color,
          geometry: jscadToArrays(jscadGeom),
          lidGeometry: trayLid ? jscadToArrays(trayLid) : null,
          placement: {
            ...placement,
            dimensions: {
              ...placement.dimensions,
              height: maxHeight
            }
          },
          counterStacks: getTrayPositions(placement.tray, cardSizes, counterShapes, maxHeight, spacerHeight, standees),
          trayLetter: getTrayLetter(getCumulativeTrayIndexForTray(project.sections, placement.tray.id))
        };
      });

      // Generate box and lid - pass section height so box exterior matches section
      time(`createBoxWithLidGrooves (${box.name})`, () => {
        cachedBox = createBoxWithLidGrooves(box, cardSizes, counterShapes, selectedSectionHeight, standees);
      });
      time(`createLid (${box.name})`, () => {
        cachedLid = createLid(box, cardSizes, counterShapes, standees);
      });
      cachedBoxName = box.name;

      boxGeometry = cachedBox ? jscadToArrays(cachedBox) : null;
      lidGeometry = cachedLid ? jscadToArrays(cachedLid) : null;
    } else {
      // Loose tray - no box context
      // Find the section containing this loose tray and get the unified section height
      const looseTraySection = findSectionForLooseTray(tray.id);
      const looseTraySectionHeight = looseTraySection ? (sectionHeights.get(looseTraySection.id) ?? 0) : 0;

      // Calculate tray dimensions for proper sizing
      const trayDims = getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees);
      const naturalHeight = trayDims.height;
      // Use section height if available, otherwise use natural height
      const maxHeight = looseTraySectionHeight > 0 ? looseTraySectionHeight : naturalHeight;
      const spacerHeight = 0; // No spacer for loose trays

      // Generate standalone tray
      cachedSelectedTray = createTrayGeometry(tray, cardSizes, counterShapes, maxHeight, spacerHeight, standees);
      selectedTrayGeometry = jscadToArrays(cachedSelectedTray);
      selectedTrayCounters = getTrayPositions(tray, cardSizes, counterShapes, maxHeight, spacerHeight, standees);

      cachedAllTrays = [{ jscadGeom: cachedSelectedTray, name: tray.name }];
      if (isReservedTray(tray)) {
        // Display only: leave nothing in the export caches for a reserved space
        cachedSelectedTray = null;
        cachedAllTrays = [];
      }
      cachedBox = null;
      cachedLid = null;
      cachedBoxName = '';
      const selectedTrayLid = createTrayLidGeometry(tray);

      // Add the loose tray to allTrayGeometries with proper dimensions
      allTrayGeometries = [
        {
          trayId: tray.id,
          name: tray.name,
          color: tray.color,
          geometry: selectedTrayGeometry,
          lidGeometry: selectedTrayLid ? jscadToArrays(selectedTrayLid) : null,
          placement: {
            tray,
            x: 0,
            y: 0,
            rotated: false,
            dimensions: { width: trayDims.width, depth: trayDims.depth, height: maxHeight }
          },
          counterStacks: selectedTrayCounters,
          trayLetter: getTrayLetter(getCumulativeTrayIndexForTray(project.sections, tray.id))
        }
      ];
    }

    // Get all boxes from all sections
    const allBoxes = getAllBoxes(project.sections);

    // Count all loose trays for progress tracking
    const allLooseTrays = project.sections.flatMap((section) => section.looseTrays);
    const totalOperations = allBoxes.length + allLooseTrays.length;
    let currentOperation = 0;

    // Generate geometries for ALL boxes (for all-no-lid view) and cache JSCAD for STL export
    cachedAllBoxes = [];
    const allBoxGeometries: BoxGeometryResult[] = [];

    for (const projectBox of allBoxes) {
      // Send progress update
      currentOperation++;
      self.postMessage({
        type: 'generation-progress',
        id,
        current: currentOperation,
        total: totalOperations,
        currentItem: projectBox.name
      } as GenerationProgressMessage);
      const boxValidation = validateCustomDimensions(projectBox, cardSizes, counterShapes, standees);
      if (!boxValidation.valid) {
        console.warn(`Box "${projectBox.name}" validation failed:`, boxValidation.errors);
      }

      // Find this box's section and get the unified section height
      const boxSection = findSectionForBox(projectBox.id);
      const sectionHeight = boxSection ? (sectionHeights.get(boxSection.id) ?? 0) : 0;

      // Calculate the required tray height to match the section height
      // This ensures all boxes in a section have the same exterior height
      const requiredTrayHeight = getRequiredTrayHeightForBox(projectBox, sectionHeight);

      // Generate box and lid - pass target height for box to match section height
      let boxJscad: Geom3 | null = null;
      let lidJscad: Geom3 | null = null;
      time(`createBoxWithLidGrooves (${projectBox.name})`, () => {
        boxJscad = createBoxWithLidGrooves(projectBox, cardSizes, counterShapes, sectionHeight, standees);
      });
      const boxBufferGeom = boxJscad ? jscadToArrays(boxJscad) : null;
      // Lid dimensions are fixed (2x wall thickness) and don't depend on section height
      time(`createLid (${projectBox.name})`, () => {
        lidJscad = createLid(projectBox, cardSizes, counterShapes, standees);
      });
      const lidBufferGeom = lidJscad ? jscadToArrays(lidJscad) : null;

      // Use the global cardSizes and counterShapes
      const boxPlacements = arrangeTrays(projectBox.trays, {
        customBoxWidth: projectBox.customWidth,
        wallThickness: projectBox.wallThickness,
        tolerance: projectBox.tolerance,
        cardSizes,
        counterShapes,
        standees,
        manualLayout: projectBox.manualLayout
      });

      const boxSpacerInfo = calculateTraySpacers(projectBox, cardSizes, counterShapes, standees);
      // Use the required tray height from section calculation, not just the box's natural height
      const maxNaturalTrayHeight = getSharedTrayHeight(
        boxPlacements.map((p) => ({ tray: p.tray, height: p.dimensions.height }))
      );
      const boxMaxHeight = Math.max(requiredTrayHeight, maxNaturalTrayHeight);

      // Cache JSCAD geometries for this box's trays
      const cachedTraysForBox: { jscadGeom: Geom3; name: string }[] = [];

      const trayGeoms: TrayGeometryResult[] = boxPlacements.map((placement) => {
        const spacer = boxSpacerInfo.find((s) => s.trayId === placement.tray.id);
        const spacerHeight = spacer?.floorSpacerHeight ?? 0;
        const jscadGeom = createTrayGeometry(
          placement.tray,
          cardSizes,
          counterShapes,
          boxMaxHeight,
          spacerHeight,
          standees
        );

        // Cache for STL export
        cachedTraysForBox.push({ jscadGeom, name: placement.tray.name });
        const trayLid = createTrayLidGeometry(placement.tray);
        if (trayLid) {
          cachedTraysForBox.push({ jscadGeom: trayLid, name: trayLidName(placement.tray.name) });
        }

        return {
          trayId: placement.tray.id,
          name: placement.tray.name,
          color: placement.tray.color,
          geometry: jscadToArrays(jscadGeom),
          lidGeometry: trayLid ? jscadToArrays(trayLid) : null,
          placement: {
            ...placement,
            dimensions: {
              ...placement.dimensions,
              height: boxMaxHeight
            }
          },
          counterStacks: getTrayPositions(
            placement.tray,
            cardSizes,
            counterShapes,
            boxMaxHeight,
            spacerHeight,
            standees
          ),
          trayLetter: getTrayLetter(getCumulativeTrayIndexForTray(project.sections, placement.tray.id))
        };
      });

      // Cache this box's JSCAD geometries for export
      cachedAllBoxes.push({
        boxName: projectBox.name,
        boxGeom: boxJscad,
        lidGeom: lidJscad,
        trays: cachedTraysForBox
      });

      // Add box dimensions using the section height (so all boxes in section report same height)
      allBoxGeometries.push({
        boxId: projectBox.id,
        boxName: projectBox.name,
        boxGeometry: boxBufferGeom,
        lidGeometry: lidBufferGeom,
        trayGeometries: trayGeoms,
        boxDimensions: { width: projectBox.customWidth ?? 0, depth: projectBox.customDepth ?? 0, height: sectionHeight }
      });
    }

    // Generate geometries for all loose trays across all sections
    cachedAllLooseTrays = [];
    const allLooseTrayGeometries: LooseTrayGeometryResult[] = [];

    for (const section of project.sections) {
      // Get the unified section height - loose trays match box exterior height
      const sectionHeight = sectionHeights.get(section.id) ?? 0;

      for (const looseTray of section.looseTrays) {
        // Send progress update
        currentOperation++;
        self.postMessage({
          type: 'generation-progress',
          id,
          current: currentOperation,
          total: totalOperations,
          currentItem: looseTray.name
        } as GenerationProgressMessage);

        // Calculate tray dimensions for width/depth
        const trayDims = getTrayDimensionsForTray(looseTray, cardSizes, counterShapes, standees);
        // Use section height for the tray height so loose trays match box exterior height
        const maxHeight = sectionHeight > 0 ? sectionHeight : trayDims.height;
        const spacerHeight = 0; // No spacer for loose trays

        // Generate tray geometry at the section height
        const jscadGeom = createTrayGeometry(looseTray, cardSizes, counterShapes, maxHeight, spacerHeight, standees);

        // Cache for STL export (reserved spaces are not printed, so they are never exported)
        const trayLid = createTrayLidGeometry(looseTray);
        if (!isReservedTray(looseTray)) {
          cachedAllLooseTrays.push({
            trayName: looseTray.name,
            trayGeom: jscadGeom
          });
          if (trayLid) {
            cachedAllLooseTrays.push({ trayName: trayLidName(looseTray.name), trayGeom: trayLid });
          }
        }

        // Add to result
        allLooseTrayGeometries.push({
          trayId: looseTray.id,
          sectionId: section.id,
          name: looseTray.name,
          color: looseTray.color,
          geometry: jscadToArrays(jscadGeom),
          lidGeometry: trayLid ? jscadToArrays(trayLid) : null,
          dimensions: { width: trayDims.width, depth: trayDims.depth, height: maxHeight },
          counterStacks: getTrayPositions(looseTray, cardSizes, counterShapes, maxHeight, spacerHeight, standees),
          trayLetter: getTrayLetter(getCumulativeTrayIndexForTray(project.sections, looseTray.id))
        });
      }
    }

    // Collect all transferable arrays (use Set to avoid duplicates when same geometry is referenced multiple times)
    const transferableSet = new Set<ArrayBuffer>();

    transferableSet.add(selectedTrayGeometry.positions.buffer as ArrayBuffer);
    transferableSet.add(selectedTrayGeometry.normals.buffer as ArrayBuffer);

    const addTrayLid = (lid: GeometryData | null | undefined) => {
      if (!lid) return;
      transferableSet.add(lid.positions.buffer as ArrayBuffer);
      transferableSet.add(lid.normals.buffer as ArrayBuffer);
    };

    for (const tray of allTrayGeometries) {
      transferableSet.add(tray.geometry.positions.buffer as ArrayBuffer);
      transferableSet.add(tray.geometry.normals.buffer as ArrayBuffer);
      addTrayLid(tray.lidGeometry);
    }

    if (boxGeometry) {
      transferableSet.add(boxGeometry.positions.buffer as ArrayBuffer);
      transferableSet.add(boxGeometry.normals.buffer as ArrayBuffer);
    }

    if (lidGeometry) {
      transferableSet.add(lidGeometry.positions.buffer as ArrayBuffer);
      transferableSet.add(lidGeometry.normals.buffer as ArrayBuffer);
    }

    for (const boxData of allBoxGeometries) {
      if (boxData.boxGeometry) {
        transferableSet.add(boxData.boxGeometry.positions.buffer as ArrayBuffer);
        transferableSet.add(boxData.boxGeometry.normals.buffer as ArrayBuffer);
      }
      if (boxData.lidGeometry) {
        transferableSet.add(boxData.lidGeometry.positions.buffer as ArrayBuffer);
        transferableSet.add(boxData.lidGeometry.normals.buffer as ArrayBuffer);
      }
      for (const tray of boxData.trayGeometries) {
        transferableSet.add(tray.geometry.positions.buffer as ArrayBuffer);
        transferableSet.add(tray.geometry.normals.buffer as ArrayBuffer);
        addTrayLid(tray.lidGeometry);
      }
    }

    // Add loose tray geometry transferables
    for (const looseTray of allLooseTrayGeometries) {
      transferableSet.add(looseTray.geometry.positions.buffer as ArrayBuffer);
      transferableSet.add(looseTray.geometry.normals.buffer as ArrayBuffer);
      addTrayLid(looseTray.lidGeometry);
    }

    const transferables: Transferable[] = Array.from(transferableSet);

    // Log performance timings
    if (timings.length > 0) {
      const totalMs = timings.reduce((sum, t) => sum + t.ms, 0);
      console.group(`[Geometry Worker] Generation complete (${totalMs.toFixed(0)}ms total)`);
      // Sort by time descending to show slowest first
      const sorted = [...timings].sort((a, b) => b.ms - a.ms);
      for (const t of sorted) {
        const pct = ((t.ms / totalMs) * 100).toFixed(1);
        console.log(`${t.ms.toFixed(0)}ms (${pct}%) - ${t.name}`);
      }
      console.groupEnd();
    }

    const result: GenerateResult = {
      type: 'generate-result',
      id,
      selectedTrayGeometry,
      selectedTrayCounters,
      allTrayGeometries,
      boxGeometry,
      lidGeometry,
      allBoxGeometries,
      allLooseTrayGeometries
    };

    self.postMessage(result, { transfer: transferables });
  } catch (e) {
    self.postMessage({
      type: 'generate-result',
      id,
      error: e instanceof Error ? e.message : 'Unknown error'
    } as GenerateResult);
  }
}

/**
 * Export geometry to STL
 */
function handleExportStl(msg: ExportStlMessage): void {
  const { id, target, trayIndex } = msg;

  try {
    let geom: Geom3 | null = null;
    let filename = 'export.stl';

    switch (target) {
      case 'tray':
        geom = cachedSelectedTray;
        filename = 'tray.stl';
        break;
      case 'box':
        geom = cachedBox;
        filename = `${sanitizeFilename(cachedBoxName)}-box.stl`;
        break;
      case 'lid':
        geom = cachedLid;
        filename = `${sanitizeFilename(cachedBoxName)}-lid.stl`;
        break;
      case 'all-tray':
        if (trayIndex !== undefined && cachedAllTrays[trayIndex]) {
          geom = cachedAllTrays[trayIndex].jscadGeom;
          filename = `${sanitizeFilename(cachedBoxName)}-${sanitizeFilename(cachedAllTrays[trayIndex].name)}.stl`;
        }
        break;
    }

    if (!geom) {
      self.postMessage({
        type: 'export-stl-result',
        id,
        error: 'No geometry available for export'
      } as ExportStlResult);
      return;
    }

    const cleanedGeom = cleanGeometryForExport(geom);
    const stlData = stlSerializer.serialize({ binary: true }, cleanedGeom);
    const blob = new Blob(stlData, { type: 'application/octet-stream' });

    // Convert blob to ArrayBuffer
    blob
      .arrayBuffer()
      .then((buffer) => {
        self.postMessage(
          {
            type: 'export-stl-result',
            id,
            data: buffer,
            filename
          } as ExportStlResult,
          { transfer: [buffer] }
        );
      })
      .catch((e) => {
        self.postMessage({
          type: 'export-stl-result',
          id,
          error: e instanceof Error ? e.message : 'Failed to convert STL data'
        } as ExportStlResult);
      });
  } catch (e) {
    self.postMessage({
      type: 'export-stl-result',
      id,
      error: e instanceof Error ? e.message : 'Unknown error'
    } as ExportStlResult);
  }
}

/**
 * Get a unique filename by appending a number suffix if needed
 */
function getUniqueFilename(baseFilename: string, usedFilenames: Set<string>): string {
  if (!usedFilenames.has(baseFilename)) {
    usedFilenames.add(baseFilename);
    return baseFilename;
  }

  // Extract the name and extension
  const lastDotIndex = baseFilename.lastIndexOf('.');
  const name = lastDotIndex > 0 ? baseFilename.slice(0, lastDotIndex) : baseFilename;
  const ext = lastDotIndex > 0 ? baseFilename.slice(lastDotIndex) : '';

  // Find a unique number suffix
  let counter = 2;
  let uniqueFilename = `${name}-${counter}${ext}`;
  while (usedFilenames.has(uniqueFilename)) {
    counter++;
    uniqueFilename = `${name}-${counter}${ext}`;
  }

  usedFilenames.add(uniqueFilename);
  return uniqueFilename;
}

/**
 * Export all STLs for all boxes
 */
async function handleExportAllStls(msg: ExportAllStlsMessage): Promise<void> {
  const { id } = msg;

  try {
    if (cachedAllBoxes.length === 0 && cachedAllLooseTrays.length === 0) {
      self.postMessage({
        type: 'export-all-stls-result',
        id,
        files: [],
        error: 'No geometry available for export. Please generate geometry first.'
      } as ExportAllStlsResult);
      return;
    }

    const files: StlFile[] = [];
    const transferables: ArrayBuffer[] = [];
    const usedFilenames = new Set<string>();

    // Export boxes and their contents
    for (const boxData of cachedAllBoxes) {
      const boxPrefix = sanitizeFilename(boxData.boxName);

      // Export box
      if (boxData.boxGeom) {
        const cleanedGeom = cleanGeometryForExport(boxData.boxGeom);
        const stlData = stlSerializer.serialize({ binary: true }, cleanedGeom);
        const blob = new Blob(stlData, { type: 'application/octet-stream' });
        const buffer = await blob.arrayBuffer();
        const filename = getUniqueFilename(`${boxPrefix}-box.stl`, usedFilenames);
        files.push({ filename, data: buffer });
        transferables.push(buffer);
      }

      // Export lid
      if (boxData.lidGeom) {
        const cleanedGeom = cleanGeometryForExport(boxData.lidGeom);
        const stlData = stlSerializer.serialize({ binary: true }, cleanedGeom);
        const blob = new Blob(stlData, { type: 'application/octet-stream' });
        const buffer = await blob.arrayBuffer();
        const filename = getUniqueFilename(`${boxPrefix}-lid.stl`, usedFilenames);
        files.push({ filename, data: buffer });
        transferables.push(buffer);
      }

      // Export trays in boxes
      for (const tray of boxData.trays) {
        const cleanedGeom = cleanGeometryForExport(tray.jscadGeom);
        const stlData = stlSerializer.serialize({ binary: true }, cleanedGeom);
        const blob = new Blob(stlData, { type: 'application/octet-stream' });
        const buffer = await blob.arrayBuffer();
        const trayName = sanitizeFilename(tray.name);
        const filename = getUniqueFilename(`${boxPrefix}-${trayName}.stl`, usedFilenames);
        files.push({ filename, data: buffer });
        transferables.push(buffer);
      }
    }

    // Export loose trays
    for (const looseTray of cachedAllLooseTrays) {
      const cleanedGeom = cleanGeometryForExport(looseTray.trayGeom);
      const stlData = stlSerializer.serialize({ binary: true }, cleanedGeom);
      const blob = new Blob(stlData, { type: 'application/octet-stream' });
      const buffer = await blob.arrayBuffer();
      const trayName = sanitizeFilename(looseTray.trayName);
      const filename = getUniqueFilename(`${trayName}.stl`, usedFilenames);
      files.push({ filename, data: buffer });
      transferables.push(buffer);
    }

    self.postMessage(
      {
        type: 'export-all-stls-result',
        id,
        files
      } as ExportAllStlsResult,
      { transfer: transferables }
    );
  } catch (e) {
    self.postMessage({
      type: 'export-all-stls-result',
      id,
      files: [],
      error: e instanceof Error ? e.message : 'Unknown error during export'
    } as ExportAllStlsResult);
  }
}

/**
 * Export all geometries to a single 3MF file
 * 3MF supports multiple objects in a single file with names and colors
 */
async function handleExport3mf(msg: Export3mfMessage): Promise<void> {
  const { id } = msg;

  try {
    if (cachedAllBoxes.length === 0 && cachedAllLooseTrays.length === 0) {
      self.postMessage({
        type: 'export-3mf-result',
        id,
        data: new ArrayBuffer(0),
        filename: '',
        error: 'No geometry available for export. Please generate geometry first.'
      } as Export3mfResult);
      return;
    }

    // Collect all geometries with their names and bounds
    const namedGeometries: { geom: Geom3; name: string }[] = [];
    const usedNames = new Set<string>();

    // Helper to get unique name (reusing the same pattern as getUniqueFilename but without extension)
    const getUniqueName = (baseName: string): string => {
      if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
      }
      let counter = 2;
      let uniqueName = `${baseName}-${counter}`;
      while (usedNames.has(uniqueName)) {
        counter++;
        uniqueName = `${baseName}-${counter}`;
      }
      usedNames.add(uniqueName);
      return uniqueName;
    };

    // Add boxes and their contents
    for (const boxData of cachedAllBoxes) {
      const boxPrefix = sanitizeFilename(boxData.boxName);

      // Add box
      if (boxData.boxGeom) {
        const cleanedGeom = cleanGeometryForExport(boxData.boxGeom);
        namedGeometries.push({ geom: cleanedGeom, name: getUniqueName(`${boxPrefix}-box`) });
      }

      // Add lid
      if (boxData.lidGeom) {
        const cleanedGeom = cleanGeometryForExport(boxData.lidGeom);
        namedGeometries.push({ geom: cleanedGeom, name: getUniqueName(`${boxPrefix}-lid`) });
      }

      // Add trays in boxes
      for (const tray of boxData.trays) {
        const cleanedGeom = cleanGeometryForExport(tray.jscadGeom);
        const trayName = sanitizeFilename(tray.name);
        namedGeometries.push({
          geom: cleanedGeom,
          name: getUniqueName(`${boxPrefix}-${trayName}`)
        });
      }
    }

    // Add loose trays
    for (const looseTray of cachedAllLooseTrays) {
      const cleanedGeom = cleanGeometryForExport(looseTray.trayGeom);
      const trayName = sanitizeFilename(looseTray.trayName);
      namedGeometries.push({
        geom: cleanedGeom,
        name: getUniqueName(trayName)
      });
    }

    if (namedGeometries.length === 0) {
      self.postMessage({
        type: 'export-3mf-result',
        id,
        data: new ArrayBuffer(0),
        filename: '',
        error: 'No geometry available for export'
      } as Export3mfResult);
      return;
    }

    // Arrange geometries in a grid layout so they don't overlap
    const spacing = 10; // mm between objects
    const { translate } = jscad.transforms;
    const { measureBoundingBox } = jscad.measurements;

    // Calculate bounds for each geometry and arrange in rows
    let currentX = 0;
    let currentY = 0;
    let rowMaxDepth = 0;
    const maxRowWidth = 300; // Start a new row after this width

    const arrangedGeometries: Geom3[] = [];

    for (const { geom, name } of namedGeometries) {
      const bounds = measureBoundingBox(geom);
      const width = bounds[1][0] - bounds[0][0];
      const depth = bounds[1][1] - bounds[0][1];

      // Check if we need to start a new row
      if (currentX > 0 && currentX + width > maxRowWidth) {
        currentX = 0;
        currentY += rowMaxDepth + spacing;
        rowMaxDepth = 0;
      }

      // Translate geometry to its position (move min corner to currentX, currentY)
      const offsetX = currentX - bounds[0][0];
      const offsetY = currentY - bounds[0][1];
      const translatedGeom = translate([offsetX, offsetY, -bounds[0][2]], geom);

      // Set the name attribute for 3MF
      (translatedGeom as Geom3 & { name?: string }).name = name;
      arrangedGeometries.push(translatedGeom);

      // Update position for next object
      currentX += width + spacing;
      rowMaxDepth = Math.max(rowMaxDepth, depth);
    }

    // Serialize all geometries to a single 3MF file
    const threemfData = threemfSerializer.serialize(
      {
        unit: 'millimeter',
        metadata: true,
        compress: true // This creates a proper 3MF ZIP package
      },
      ...arrangedGeometries
    );

    const blob = new Blob(threemfData, {
      type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
    });
    const buffer = await blob.arrayBuffer();

    // Use first box name for filename
    const projectName = cachedAllBoxes[0]?.boxName?.toLowerCase().replace(/\s+/g, '-') || 'counterslayer';

    self.postMessage(
      {
        type: 'export-3mf-result',
        id,
        data: buffer,
        filename: `${projectName}.3mf`
      } as Export3mfResult,
      { transfer: [buffer] }
    );
  } catch (e) {
    self.postMessage({
      type: 'export-3mf-result',
      id,
      data: new ArrayBuffer(0),
      filename: '',
      error: e instanceof Error ? e.message : 'Unknown error during 3MF export'
    } as Export3mfResult);
  }
}

// Message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'generate':
      handleGenerate(msg);
      break;
    case 'export-stl':
      handleExportStl(msg);
      break;
    case 'export-all-stls':
      handleExportAllStls(msg);
      break;
    case 'export-3mf':
      handleExport3mf(msg);
      break;
  }
};
