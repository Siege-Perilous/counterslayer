/**
 * Project layout - where each section sits inside the game container, in 3D.
 *
 * Coordinates are game container millimetres: x = left to right, y = front to back, z = up from
 * the container floor. One function resolves every section's transform and reports problems
 * (overlaps, out of bounds, above the box, floating). The scene, the project layout editor, the
 * warnings and the debug output all read from its result.
 */

import type { CardSize, CounterShape, Section, SectionPlacement, Standee } from '#lib/types/project.js';
import { arrangeSectionContents, type SectionArrangement } from './section';

const EPSILON = 0.1;

export type SectionRotation = 0 | 90 | 180 | 270;

export interface WorldBox {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface PlacedItem {
  kind: 'box' | 'looseTray';
  id: string;
  name: string;
  world: WorldBox;
}

/** A section's contents arranged in its own coordinates. Expensive to build, so cache it. */
export interface PreparedSection {
  sectionId: string;
  name: string;
  index: number;
  arrangement: SectionArrangement;
  height: number;
  /** Bounding box of the contents in section coordinates */
  local: { minX: number; minY: number; width: number; depth: number };
  items: { kind: 'box' | 'looseTray'; id: string; name: string; x: number; y: number; width: number; depth: number }[];
}

export interface PlacedSection extends PreparedSection {
  /** Front-left corner of the rotated content bounding box */
  x: number;
  y: number;
  /** Resolved height of the section's underside */
  z: number;
  rotation: SectionRotation;
  floating: boolean;
  /** 0 = on the floor, otherwise one more than the highest section underneath */
  level: number;
  /** Where the section's own (0,0) lands in the container; a rigid transform with `rotation` */
  originX: number;
  originY: number;
  world: WorldBox;
  worldItems: PlacedItem[];
  /** The placement to store for this section so it resolves to the same position again */
  placement: SectionPlacement;
}

export type LayoutIssueKind = 'overlap' | 'outOfBounds' | 'aboveBox' | 'floating';

export interface LayoutIssue {
  kind: LayoutIssueKind;
  severity: 'error' | 'warning';
  sectionId: string;
  /** Items of `sectionId` that are affected */
  itemIds: string[];
  /** For overlaps: the other section and its affected items */
  otherSectionId?: string;
  otherItemIds?: string[];
  message: string;
}

export interface LayoutContainer {
  width: number;
  depth: number;
  height?: number;
}

export interface ProjectLayout {
  /** false = no section has a placement, so sections stack as full slices in array order */
  arranged: boolean;
  container: LayoutContainer;
  sections: PlacedSection[];
  issues: LayoutIssue[];
  /** Highest point of anything in the layout */
  totalHeight: number;
}

export interface ProjectLayoutOptions {
  gameContainerWidth: number;
  gameContainerDepth: number;
  gameContainerHeight?: number;
  cardSizes: CardSize[];
  counterShapes: CounterShape[];
  standees?: Standee[];
}

/** Arrange each section's contents in its own coordinates. */
export function prepareSections(sections: Section[], options: ProjectLayoutOptions): PreparedSection[] {
  return sections.map((section, index) => {
    const arrangement = arrangeSectionContents(section, options);
    const items: PreparedSection['items'] = [
      ...arrangement.boxes.map((p) => ({
        kind: 'box' as const,
        id: p.box.id,
        name: p.box.name,
        x: p.x,
        y: p.y,
        width: p.dimensions.width,
        depth: p.dimensions.depth
      })),
      ...arrangement.looseTrays.map((p) => ({
        kind: 'looseTray' as const,
        id: p.tray.id,
        name: p.tray.name,
        x: p.x,
        y: p.y,
        width: p.dimensions.width,
        depth: p.dimensions.depth
      }))
    ];

    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    if (items.length > 0) {
      minX = Math.min(...items.map((i) => i.x));
      minY = Math.min(...items.map((i) => i.y));
      maxX = Math.max(...items.map((i) => i.x + i.width));
      maxY = Math.max(...items.map((i) => i.y + i.depth));
    }

    return {
      sectionId: section.id,
      name: section.name,
      index,
      arrangement,
      height: arrangement.sectionHeight,
      local: { minX, minY, width: maxX - minX, depth: maxY - minY },
      items
    };
  });
}

/** Footprint of a section's content bounding box after rotation. */
export function rotatedFootprint(
  local: { width: number; depth: number },
  rotation: SectionRotation
): { width: number; depth: number } {
  return rotation === 90 || rotation === 270
    ? { width: local.depth, depth: local.width }
    : { width: local.width, depth: local.depth };
}

/**
 * Map a rectangle given in section coordinates into the container, for a section whose rotated
 * bounding box has its front-left corner at (px, py).
 */
function placeRect(
  local: PreparedSection['local'],
  px: number,
  py: number,
  rotation: SectionRotation,
  rect: { x: number; y: number; width: number; depth: number }
): { x: number; y: number; width: number; depth: number } {
  const u = rect.x - local.minX;
  const v = rect.y - local.minY;
  switch (rotation) {
    case 90:
      return { x: px + local.depth - (v + rect.depth), y: py + u, width: rect.depth, depth: rect.width };
    case 180:
      return {
        x: px + local.width - (u + rect.width),
        y: py + local.depth - (v + rect.depth),
        width: rect.width,
        depth: rect.depth
      };
    case 270:
      return { x: px + v, y: py + local.width - (u + rect.width), width: rect.depth, depth: rect.width };
    default:
      return { x: px + u, y: py + v, width: rect.width, depth: rect.depth };
  }
}

/** Where the section's own (0,0) lands, so a renderer can apply one rigid transform. */
function sectionOrigin(
  local: PreparedSection['local'],
  px: number,
  py: number,
  rotation: SectionRotation
): { originX: number; originY: number } {
  switch (rotation) {
    case 90:
      return { originX: px + local.depth + local.minY, originY: py - local.minX };
    case 180:
      return { originX: px + local.width + local.minX, originY: py + local.depth + local.minY };
    case 270:
      return { originX: px - local.minY, originY: py + local.width + local.minX };
    default:
      return { originX: px - local.minX, originY: py - local.minY };
  }
}

function overlapsInPlan(
  a: { x: number; y: number; width: number; depth: number },
  b: { x: number; y: number; width: number; depth: number }
): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    a.x + a.width > b.x + EPSILON &&
    a.y < b.y + b.depth - EPSILON &&
    a.y + a.depth > b.y + EPSILON
  );
}

function sectionsOverlapInPlan(a: PlacedItem[], b: PlacedItem[]): boolean {
  return a.some((ia) => b.some((ib) => overlapsInPlan(ia.world, ib.world)));
}

/** Highest top of already-placed items directly beneath any of the given item footprints. */
function supportHeight(
  items: { x: number; y: number; width: number; depth: number }[],
  below: PlacedSection[]
): number {
  let top = 0;
  for (const other of below) {
    for (const otherItem of other.worldItems) {
      if (items.some((item) => overlapsInPlan(item, otherItem.world))) {
        top = Math.max(top, otherItem.world.z + otherItem.world.height);
      }
    }
  }
  return top;
}

/**
 * Resolve transforms and issues from prepared sections. Cheap enough to call on every drag tick.
 *
 * `placements` maps section id to placement. When it is empty the sections stack as full slices.
 * In an arranged project, a section without a placement rests on top of whatever is beneath its
 * contents (this is what a newly added section does).
 */
export function resolveProjectLayout(
  prepared: PreparedSection[],
  placements: Record<string, SectionPlacement | undefined>,
  container: LayoutContainer,
  // When sections have the same height hint, these are placed last, so a section being dragged
  // over another lands on top of it instead of sliding underneath
  placeLastIds: string[] = []
): ProjectLayout {
  const arranged = prepared.some((p) => placements[p.sectionId] !== undefined);
  const placedById: Record<string, PlacedSection> = {};
  const resolved: PlacedSection[] = [];

  const build = (
    section: PreparedSection,
    px: number,
    py: number,
    z: number,
    rotation: SectionRotation,
    floating: boolean,
    level: number
  ): PlacedSection => {
    const footprint = rotatedFootprint(section.local, rotation);
    const worldItems: PlacedItem[] = section.items.map((item) => ({
      kind: item.kind,
      id: item.id,
      name: item.name,
      world: { ...placeRect(section.local, px, py, rotation, item), z, height: section.height }
    }));
    return {
      ...section,
      x: px,
      y: py,
      z,
      rotation,
      floating,
      level,
      ...sectionOrigin(section.local, px, py, rotation),
      world: { x: px, y: py, z, width: footprint.width, depth: footprint.depth, height: section.height },
      worldItems,
      placement: { x: px, y: py, z, rotation, ...(floating ? { floating: true } : {}) }
    };
  };

  if (!arranged) {
    // Full slices: each section sits on top of the whole of the one before it.
    let z = 0;
    for (const section of prepared) {
      const placed = build(section, section.local.minX, section.local.minY, z, 0, false, section.index);
      resolved.push(placed);
      placedById[section.sectionId] = placed;
      z += section.height;
    }
  } else {
    // Lowest first, so each section can drop onto the ones already placed.
    const order = [...prepared].sort((a, b) => {
      const za = placements[a.sectionId]?.z ?? Number.POSITIVE_INFINITY;
      const zb = placements[b.sectionId]?.z ?? Number.POSITIVE_INFINITY;
      if (Math.abs(za - zb) > EPSILON) return za - zb;
      const aLast = placeLastIds.includes(a.sectionId);
      const bLast = placeLastIds.includes(b.sectionId);
      if (aLast !== bLast) return aLast ? 1 : -1;
      return a.index - b.index;
    });

    for (const section of order) {
      const placement = placements[section.sectionId];
      const rotation: SectionRotation = placement?.rotation ?? 0;
      const px = placement?.x ?? section.local.minX;
      const py = placement?.y ?? section.local.minY;
      const footprints = section.items.map((item) => placeRect(section.local, px, py, rotation, item));
      const support = supportHeight(footprints, resolved);
      const wantsFloat = placement?.floating === true;
      // Nothing can sit lower than what is underneath it: a floating section whose height is at
      // or below its support (for example after the section beneath grew taller) rests on it.
      const z = wantsFloat ? Math.max(placement.z, support) : support;
      const floating = wantsFloat && z > support + EPSILON;

      const probe = build(section, px, py, z, rotation, floating, 0);
      let level = 0;
      for (const other of resolved) {
        if (
          other.z < z + EPSILON &&
          other.worldItems.length > 0 &&
          sectionsOverlapInPlan(probe.worldItems, other.worldItems)
        ) {
          level = Math.max(level, other.level + 1);
        }
      }
      if (level === 0 && z > EPSILON) level = 1;
      probe.level = level;

      resolved.push(probe);
      placedById[section.sectionId] = probe;
    }
  }

  const sections = prepared.map((p) => placedById[p.sectionId]);
  const issues = findIssues(sections, container);
  const totalHeight = Math.max(0, ...sections.filter((s) => s.items.length > 0).map((s) => s.z + s.height));

  return { arranged, container, sections, issues, totalHeight };
}

function findIssues(sections: PlacedSection[], container: LayoutContainer): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  // Overlaps between items of different sections (errors: they block saving a layout).
  // Resolution above always rests or floats a section on top of what is beneath it, so this is a
  // safety net rather than something a user can normally reach.
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];
      if (a.z >= b.z + b.height - EPSILON || b.z >= a.z + a.height - EPSILON) continue;
      const aIds = new Set<string>();
      const bIds = new Set<string>();
      for (const ia of a.worldItems) {
        for (const ib of b.worldItems) {
          if (overlapsInPlan(ia.world, ib.world)) {
            aIds.add(ia.id);
            bIds.add(ib.id);
          }
        }
      }
      if (aIds.size > 0) {
        issues.push({
          kind: 'overlap',
          severity: 'error',
          sectionId: a.sectionId,
          itemIds: [...aIds],
          otherSectionId: b.sectionId,
          otherItemIds: [...bIds],
          message: `"${a.name}" overlaps "${b.name}"`
        });
      }
    }
  }

  for (const section of sections) {
    const outside = section.worldItems.filter(
      (item) =>
        item.world.x < -EPSILON ||
        item.world.y < -EPSILON ||
        item.world.x + item.world.width > container.width + EPSILON ||
        item.world.y + item.world.depth > container.depth + EPSILON
    );
    if (outside.length > 0) {
      issues.push({
        kind: 'outOfBounds',
        severity: 'warning',
        sectionId: section.sectionId,
        itemIds: outside.map((i) => i.id),
        message: `"${section.name}" extends outside the game container`
      });
    }

    if (container.height !== undefined && section.worldItems.length > 0) {
      const over = section.z + section.height - container.height;
      if (over > EPSILON) {
        issues.push({
          kind: 'aboveBox',
          severity: 'warning',
          sectionId: section.sectionId,
          itemIds: section.worldItems.map((i) => i.id),
          message: `"${section.name}" rises ${formatMm(over)}mm above the game container`
        });
      }
    }

    if (section.floating) {
      issues.push({
        kind: 'floating',
        severity: 'warning',
        sectionId: section.sectionId,
        itemIds: section.worldItems.map((i) => i.id),
        message: `"${section.name}" is floating with nothing underneath it`
      });
    }
  }

  return issues;
}

function formatMm(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Arrange every section and resolve the project layout from the stored placements. */
export function computeProjectLayout(sections: Section[], options: ProjectLayoutOptions): ProjectLayout {
  const prepared = prepareSections(sections, options);
  const placements: Record<string, SectionPlacement | undefined> = {};
  for (const section of sections) {
    placements[section.id] = section.placement;
  }
  return resolveProjectLayout(prepared, placements, {
    width: options.gameContainerWidth,
    depth: options.gameContainerDepth,
    height: options.gameContainerHeight
  });
}

/**
 * Tops of everything in `others` that lies beneath a section's contents in plan, at any height.
 * These are the heights the section's underside can rest on.
 */
export function getTopsBeneath(section: PlacedSection, others: PlacedSection[]): number[] {
  const tops = new Set<number>();
  for (const other of others) {
    for (const otherItem of other.worldItems) {
      if (section.worldItems.some((item) => overlapsInPlan(item.world, otherItem.world))) {
        tops.add(otherItem.world.z + otherItem.world.height);
      }
    }
  }
  return [...tops];
}

/** Whether the contents of two sections overlap when seen from above. */
export function sectionsShareFootprint(a: PlacedSection, b: PlacedSection): boolean {
  return sectionsOverlapInPlan(a.worldItems, b.worldItems);
}

/**
 * A copy of a layout with some sections moved to the given heights and every other section left
 * exactly where it is. Nothing settles: this is the picture while a section is being lifted, so
 * the lifted section may pass through others (which shows up as an overlap issue).
 */
export function withSectionHeights(
  layout: ProjectLayout,
  heights: Record<string, { z: number; floating: boolean }>
): ProjectLayout {
  const sections = layout.sections.map((section) => {
    const next = heights[section.sectionId];
    if (!next) return section;
    return {
      ...section,
      z: next.z,
      floating: next.floating,
      world: { ...section.world, z: next.z },
      worldItems: section.worldItems.map((item) => ({ ...item, world: { ...item.world, z: next.z } })),
      placement: {
        x: section.x,
        y: section.y,
        z: next.z,
        rotation: section.rotation,
        ...(next.floating ? { floating: true } : {})
      }
    };
  });
  return {
    ...layout,
    sections,
    issues: findIssues(sections, layout.container),
    totalHeight: Math.max(0, ...sections.filter((s) => s.items.length > 0).map((s) => s.z + s.height))
  };
}

/**
 * After a section's internal layout changes, move its placement so the items that did not move
 * stay where they were in the container. `before` and `after` are the content bounding boxes.
 */
export function reanchorPlacement(
  placement: SectionPlacement,
  before: PreparedSection['local'],
  after: PreparedSection['local']
): SectionPlacement {
  const moved = placeRect(before, placement.x, placement.y, placement.rotation, {
    x: after.minX,
    y: after.minY,
    width: after.width,
    depth: after.depth
  });
  return { ...placement, x: moved.x, y: moved.y };
}
