/**
 * Project Layout Editor Store
 * Working state while arranging whole sections inside the game container (x, y, z, rotation).
 * Nothing is written to the project until the layout is saved.
 *
 * Each section moves on its own. Lifting one leaves every other section exactly where it is
 * until the lift ends; then the layout settles (sections drop onto whatever is now beneath
 * them). To move several sections as one, select them together (Shift+click).
 */

import {
  getTopsBeneath,
  resolveProjectLayout,
  rotatedFootprint,
  sectionsShareFootprint,
  withSectionHeights,
  type LayoutContainer,
  type PlacedSection,
  type PreparedSection,
  type ProjectLayout,
  type SectionRotation
} from '#lib/models/projectLayout.js';
import type { SnapGuide } from '#lib/types/editor.js';
import type { SectionPlacement } from '#lib/types/project.js';

// How close (mm) a lifted section must be to a resting height to snap to it
const LIFT_SNAP_THRESHOLD = 5;
const EPSILON = 0.1;
// Larger than the layout's height tolerance, so a nudged hint sorts strictly below an equal one
const ORDER_NUDGE = 0.2;

type Placements = Record<string, SectionPlacement>;

interface LiftState {
  /** The layout when the lift began. Sections that are not being lifted stay as they are here. */
  frozen: ProjectLayout;
  ids: string[];
  heights: Record<string, { z: number; floating: boolean }>;
}

let isEditMode = $state(false);
let isDragging = $state(false);
// Selected sections; the last one is the primary (it carries the lift handle and the X/Y/Z fields)
let selectedSectionIds = $state.raw<string[]>([]);
let prepared = $state.raw<PreparedSection[]>([]);
let container = $state.raw<LayoutContainer>({ width: 0, depth: 0 });
let workingPlacements = $state.raw<Placements>({});
let activeSnapGuides = $state.raw<SnapGuide[]>([]);
// The sections last moved: they land on top when they tie with another section's height
let lastMovedIds = $state.raw<string[]>([]);
let liftState = $state.raw<LiftState | null>(null);

const settledLayout = $derived<ProjectLayout | null>(
  isEditMode ? resolveProjectLayout(prepared, workingPlacements, container, lastMovedIds) : null
);

// While a lift is in progress, show the lifted sections at their new heights and nothing else moved
const layout = $derived<ProjectLayout | null>(
  liftState ? withSectionHeights(liftState.frozen, liftState.heights) : settledLayout
);

export const projectLayoutEditorState = {
  get isEditMode() {
    return isEditMode;
  },
  get isDragging() {
    return isDragging;
  },
  /** The primary selected section (last one selected) */
  get selectedSectionId() {
    return selectedSectionIds.length > 0 ? selectedSectionIds[selectedSectionIds.length - 1] : null;
  },
  get selectedSectionIds() {
    return selectedSectionIds;
  },
  /** Live layout for the working placements (null when not editing) */
  get layout() {
    return layout;
  },
  get activeSnapGuides() {
    return activeSnapGuides;
  }
};

/**
 * Store the resolved position of every section back as its placement. This keeps resting
 * sections' height hints in step with what they rest on, so the next move starts from what is
 * on screen.
 */
function commit(placements: Placements, movedIds: string[] = []): void {
  const resolved = resolveProjectLayout(prepared, placements, container, movedIds);
  const next: Placements = {};
  for (const section of resolved.sections) {
    next[section.sectionId] = section.placement;
  }
  lastMovedIds = movedIds;
  workingPlacements = next;
}

/** The sections a drag on `sectionId` moves: the whole selection if it is part of it. */
function movingGroup(sectionId: string): string[] {
  return selectedSectionIds.includes(sectionId) ? selectedSectionIds : [sectionId];
}

/** Start editing from the layout currently shown (arranged, or stacked as full slices). */
export function enterProjectLayoutEdit(current: ProjectLayout): void {
  prepared = current.sections.map((s) => ({
    sectionId: s.sectionId,
    name: s.name,
    index: s.index,
    arrangement: s.arrangement,
    height: s.height,
    local: s.local,
    items: s.items
  }));
  container = current.container;
  const placements: Placements = {};
  for (const section of current.sections) {
    placements[section.sectionId] = section.placement;
  }
  selectedSectionIds = [];
  activeSnapGuides = [];
  liftState = null;
  isDragging = false;
  isEditMode = true;
  commit(placements);
}

export function exitProjectLayoutEdit(): void {
  isEditMode = false;
  isDragging = false;
  selectedSectionIds = [];
  activeSnapGuides = [];
  liftState = null;
  prepared = [];
  workingPlacements = {};
  lastMovedIds = [];
}

/**
 * Select a section. With `additive` (Shift+click) the section is added to, or removed from, the
 * current selection, so several sections can be moved together.
 */
export function selectLayoutSection(sectionId: string | null, additive = false): void {
  if (sectionId === null) {
    selectedSectionIds = [];
  } else if (!additive) {
    selectedSectionIds = [sectionId];
  } else if (selectedSectionIds.includes(sectionId)) {
    selectedSectionIds = selectedSectionIds.filter((id) => id !== sectionId);
  } else {
    selectedSectionIds = [...selectedSectionIds, sectionId];
  }
}

/** Make a section the primary selection without dropping the others selected with it. */
export function focusLayoutSection(sectionId: string): void {
  if (!selectedSectionIds.includes(sectionId)) {
    selectedSectionIds = [sectionId];
  } else {
    selectedSectionIds = [...selectedSectionIds.filter((id) => id !== sectionId), sectionId];
  }
}

export function setProjectLayoutDragging(dragging: boolean): void {
  isDragging = dragging;
  if (!dragging) activeSnapGuides = [];
}

export function setProjectLayoutSnapGuides(guides: SnapGuide[]): void {
  activeSnapGuides = guides;
}

/**
 * Slide a section to a new x/y. If it is part of a multi-selection, the other selected sections
 * move by the same amount. A resting section stays resting and climbs onto (or drops off)
 * whatever is beneath it; a floating section keeps its height.
 */
export function moveLayoutSection(sectionId: string, x: number, y: number): void {
  const current = workingPlacements[sectionId];
  if (!current) return;
  const dx = x - current.x;
  const dy = y - current.y;
  const group = movingGroup(sectionId);
  const next: Placements = { ...workingPlacements };
  for (const id of group) {
    const placement = workingPlacements[id];
    if (placement) next[id] = { ...placement, x: placement.x + dx, y: placement.y + dy };
  }
  commit(next, group);
}

/**
 * Begin lifting a section (and anything selected with it). Until the lift ends, every other
 * section stays exactly where it is.
 */
export function beginLayoutLift(sectionId: string): void {
  if (!settledLayout) return;
  const ids = movingGroup(sectionId);
  const heights: LiftState['heights'] = {};
  for (const section of settledLayout.sections) {
    if (ids.includes(section.sectionId)) heights[section.sectionId] = { z: section.z, floating: section.floating };
  }
  liftState = { frozen: settledLayout, ids, heights };
}

/**
 * Move the lifted sections so that `sectionId`'s underside is at `rawZ`. With `snap`, the lift
 * snaps to the floor, to the top of anything beneath the lifted sections, and to flush with the
 * top of the container.
 */
export function updateLayoutLift(sectionId: string, rawZ: number, snap: boolean): void {
  if (!liftState) return;
  const { frozen, ids } = liftState;
  const members = frozen.sections.filter((s) => ids.includes(s.sectionId));
  const others = frozen.sections.filter((s) => !ids.includes(s.sectionId));
  const primary = members.find((s) => s.sectionId === sectionId);
  if (!primary) return;

  // Nothing goes below the floor
  const lowest = Math.min(...members.map((s) => s.z));
  let dz = Math.max(rawZ - primary.z, -lowest);

  const topsBeneath: Record<string, number[]> = {};
  for (const member of members) topsBeneath[member.sectionId] = getTopsBeneath(member, others);

  if (snap) {
    let best: number | null = null;
    for (const member of members) {
      const restingHeights = [0, ...topsBeneath[member.sectionId]];
      if (container.height !== undefined && container.height - member.height > 0) {
        restingHeights.push(container.height - member.height);
      }
      for (const height of restingHeights) {
        const candidate = height - member.z;
        if (candidate < -lowest - EPSILON) continue;
        if (
          Math.abs(candidate - dz) < LIFT_SNAP_THRESHOLD &&
          (best === null || Math.abs(candidate - dz) < Math.abs(best - dz))
        ) {
          best = candidate;
        }
      }
    }
    dz = best ?? Math.round(primary.z + dz) - primary.z;
  }

  const heights: LiftState['heights'] = {};
  for (const member of members) {
    const z = member.z + dz;
    // Clear of everything underneath (not counting sections lifted with it) means floating,
    // unless it is sitting on another section in the same lift
    const clearOfOthers = z > Math.max(0, ...topsBeneath[member.sectionId]) + EPSILON;
    const carried = members.some(
      (other) =>
        other.sectionId !== member.sectionId &&
        Math.abs(other.z + other.height - member.z) < EPSILON &&
        sectionsShareFootprint(member, other)
    );
    heights[member.sectionId] = { z, floating: clearOfOthers && !carried };
  }
  liftState = { frozen, ids, heights };
}

/** Finish a lift: the lifted sections keep their new heights and the layout settles around them. */
export function endLayoutLift(): void {
  if (!liftState) return;
  const { ids, heights } = liftState;
  const next: Placements = { ...workingPlacements };
  for (const id of ids) {
    const placement = workingPlacements[id];
    const height = heights[id];
    if (!placement || !height) continue;
    next[id] = {
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      // A resting section brought level with (or below) another section's underside goes
      // beneath it, so nudge its ordering hint just under: lowering a section to the floor
      // slides it under whatever was there. The stored height is the resolved one, not this hint.
      z: height.floating ? height.z : height.z - ORDER_NUDGE,
      ...(height.floating ? { floating: true } : {})
    };
  }
  liftState = null;
  commit(next);
}

/** Set the height of one section's underside exactly (the Z field). */
export function setLayoutSectionHeight(sectionId: string, z: number): void {
  const selection = selectedSectionIds;
  // A typed height applies to this section alone, even when others are selected with it
  selectedSectionIds = [sectionId];
  beginLayoutLift(sectionId);
  updateLayoutLift(sectionId, z, false);
  endLayoutLift();
  selectedSectionIds = selection;
}

/** Let a floating section fall onto whatever is beneath it. */
export function dropLayoutSection(sectionId: string): void {
  const current = workingPlacements[sectionId];
  if (!current) return;
  // Resting, sorted after everything else: it lands on the highest thing beneath it
  commit(
    {
      ...workingPlacements,
      [sectionId]: { x: current.x, y: current.y, rotation: current.rotation, z: current.z }
    },
    [sectionId]
  );
}

/** Turn the primary selected section a quarter turn about the centre of its footprint. */
export function rotateSelectedLayoutSection(): void {
  const sectionId = projectLayoutEditorState.selectedSectionId;
  if (!sectionId || !settledLayout) return;
  const current = workingPlacements[sectionId];
  const section: PlacedSection | undefined = settledLayout.sections.find((s) => s.sectionId === sectionId);
  if (!current || !section) return;

  const rotation = ((current.rotation + 90) % 360) as SectionRotation;
  const before = rotatedFootprint(section.local, current.rotation);
  const after = rotatedFootprint(section.local, rotation);
  const x = Math.round(current.x + before.width / 2 - after.width / 2);
  const y = Math.round(current.y + before.depth / 2 - after.depth / 2);
  commit({ ...workingPlacements, [sectionId]: { ...current, x, y, rotation } }, [sectionId]);
}

/** Placements to save: the resolved position of every section. */
export function getProjectLayoutPlacements(): Record<string, SectionPlacement> {
  return { ...workingPlacements };
}
