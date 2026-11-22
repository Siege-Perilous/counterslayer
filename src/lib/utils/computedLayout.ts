/**
 * Computed layout for debugging: where everything sits in the game container, written into
 * mesh-analysis/project.json next to the project itself. Built from the same project layout the
 * 3D view uses, so positions here match what is on screen.
 *
 * Box and loose tray x/y/z are game container coordinates (after the section's own placement and
 * rotation). localX/localY/localRotation are the item's position inside its section.
 */
import type { TrayPlacement } from '#lib/models/box.js';
import type { ProjectLayout } from '#lib/models/projectLayout.js';

interface BoxGeometryInfo {
  boxId: string;
  trayGeometries: { trayId: string; name: string; color: string; trayLetter?: string; placement: TrayPlacement }[];
}

interface LooseTrayGeometryInfo {
  trayId: string;
  trayLetter: string;
}

export function buildComputedLayout(
  layout: ProjectLayout,
  allBoxGeometries: BoxGeometryInfo[],
  allLooseTrayGeometries: LooseTrayGeometryInfo[],
  selection?: { selectedBoxId: string | null; selectedTrayId: string | null }
) {
  return {
    timestamp: new Date().toISOString(),
    ...(selection ?? {}),
    gameContainer: {
      width: layout.container.width,
      depth: layout.container.depth,
      height: layout.container.height ?? null
    },
    // false = no section has a placement, so sections stack as full slices in order
    arranged: layout.arranged,
    totalHeight: layout.totalHeight,
    issues: layout.issues.map((issue) => ({
      kind: issue.kind,
      severity: issue.severity,
      sectionId: issue.sectionId,
      otherSectionId: issue.otherSectionId ?? null,
      message: issue.message
    })),
    sections: layout.sections.map((placed) => {
      const world = (id: string) => placed.worldItems.find((item) => item.id === id)?.world;
      return {
        sectionId: placed.sectionId,
        sectionName: placed.name,
        sectionHeight: placed.height,
        // Position of the section's content bounding box in the game container
        x: placed.world.x,
        y: placed.world.y,
        z: placed.z,
        width: placed.world.width,
        depth: placed.world.depth,
        rotation: placed.rotation,
        floating: placed.floating,
        level: placed.level,
        boxes: placed.arrangement.boxes.map((bp) => {
          const boxGeom = allBoxGeometries.find((bg) => bg.boxId === bp.box.id);
          const w = world(bp.box.id);
          return {
            boxId: bp.box.id,
            boxName: bp.box.name,
            x: w?.x ?? bp.x,
            y: w?.y ?? bp.y,
            z: placed.z,
            width: w?.width ?? bp.dimensions.width,
            depth: w?.depth ?? bp.dimensions.depth,
            height: bp.dimensions.height,
            rotation: bp.rotation,
            localX: bp.x,
            localY: bp.y,
            interior: {
              width: bp.dimensions.width - bp.box.wallThickness * 2,
              depth: bp.dimensions.depth - bp.box.wallThickness * 2
            },
            trays:
              boxGeom?.trayGeometries.map((t) => ({
                trayId: t.trayId,
                name: t.name,
                letter: t.trayLetter,
                color: t.color,
                // Position inside the box interior
                x: t.placement.x,
                y: t.placement.y,
                xInBox: t.placement.x,
                yInBox: t.placement.y,
                width: t.placement.dimensions.width,
                depth: t.placement.dimensions.depth,
                height: t.placement.dimensions.height,
                rotated: t.placement.rotated
              })) ?? []
          };
        }),
        looseTrays: placed.arrangement.looseTrays.map((ltp) => {
          const looseGeom = allLooseTrayGeometries.find((lg) => lg.trayId === ltp.tray.id);
          const w = world(ltp.tray.id);
          const reserved = ltp.tray.type === 'reserved';
          return {
            trayId: ltp.tray.id,
            name: ltp.tray.name,
            // Reserved spaces are not printed and have no letter
            letter: reserved ? null : (looseGeom?.trayLetter ?? '?'),
            reserved,
            color: ltp.tray.color,
            x: w?.x ?? ltp.x,
            y: w?.y ?? ltp.y,
            z: placed.z,
            width: w?.width ?? ltp.dimensions.width,
            depth: w?.depth ?? ltp.dimensions.depth,
            height: ltp.dimensions.height,
            rotation: ltp.rotation,
            localX: ltp.x,
            localY: ltp.y
          };
        })
      };
    })
  };
}
