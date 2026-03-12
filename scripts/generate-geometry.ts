/**
 * Node.js script to generate box/lid geometry directly.
 * This bypasses the browser and web worker, allowing direct iteration on geometry code.
 *
 * Usage: npx tsx scripts/generate-geometry.ts [boxId]
 *
 * Reads project.json from mesh-analysis/, generates STLs, and runs mesh-analyzer.py
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Import geometry modules
import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import stlSerializer from '@jscad/stl-serializer';
import { createCardDividerTray } from '../src/lib/models/cardDividerTray.js';
import { createCardDrawTray } from '../src/lib/models/cardTray.js';
import { createCardWellTray } from '../src/lib/models/cardWellTray.js';
import { createCounterTray } from '../src/lib/models/counterTray.js';
import { createCupTray } from '../src/lib/models/cupTray.js';
import { createBoxWithLidGrooves, createLid } from '../src/lib/models/lid.js';
import type { Box, Tray } from '../src/lib/types/project.js';
import { isCardDividerTray, isCardTray, isCardWellTray, isCounterTray, isCupTray } from '../src/lib/types/project.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generalize = (jscad.modifiers as any).generalize as (
  options: { snap?: boolean; simplify?: boolean; triangulate?: boolean },
  geom: Geom3
) => Geom3;

/**
 * Clean geometry before STL export to reduce non-manifold edges.
 * Applies snap and simplify (merge coplanar polygons).
 * Note: triangulate is omitted here since the STL serializer handles it.
 */
function cleanGeometryForExport(geom: Geom3): Geom3 {
  return generalize({ snap: true, simplify: true }, geom);
}

const MESH_ANALYSIS_DIR = join(import.meta.dirname, '..', 'mesh-analysis');

async function main() {
  // Load project.json
  const projectPath = join(MESH_ANALYSIS_DIR, 'project.json');
  if (!existsSync(projectPath)) {
    console.error('Error: mesh-analysis/project.json not found');
    console.error('Run "Debug for Claude" from the app first to generate project.json');
    process.exit(1);
  }

  const project = JSON.parse(readFileSync(projectPath, 'utf-8'));

  // Support both old (project.boxes) and new (project.layers[].boxes) structure
  const allBoxes: Box[] = [];
  const allLooseTrays: Tray[] = [];
  if (project.layers) {
    for (const layer of project.layers) {
      allBoxes.push(...(layer.boxes || []));
      allLooseTrays.push(...(layer.looseTrays || []));
    }
  } else if (project.boxes) {
    allBoxes.push(...project.boxes);
  }

  console.log(`Loaded project with ${allBoxes.length} boxes and ${allLooseTrays.length} loose trays`);

  // Check if we should generate a specific loose tray
  const targetId = process.argv[2];
  const looseTray = allLooseTrays.find((t: Tray) => t.id === targetId);

  if (looseTray) {
    // Generate just this loose tray
    console.log(`\nGenerating loose tray: "${looseTray.name}" (${looseTray.id})`);

    const safeName = looseTray.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `loose_${safeName}.stl`;
    const maxHeight = 50; // Default height for loose trays

    try {
      let trayGeom: Geom3 | null = null;
      if (isCupTray(looseTray)) {
        trayGeom = createCupTray(looseTray.params, looseTray.name, maxHeight, 0);
      } else if (isCardWellTray(looseTray)) {
        trayGeom = createCardWellTray(looseTray.params, project.cardSizes, looseTray.name, maxHeight, 0);
      } else if (isCardTray(looseTray)) {
        trayGeom = createCardDrawTray(looseTray.params, project.cardSizes, looseTray.name, maxHeight, 0);
      } else if (isCardDividerTray(looseTray)) {
        trayGeom = createCardDividerTray(looseTray.params, project.cardSizes, looseTray.name, maxHeight, 0);
      } else if (isCounterTray(looseTray)) {
        trayGeom = createCounterTray(looseTray.params, project.counterShapes, looseTray.name, maxHeight, 0);
      }

      if (trayGeom) {
        const cleanedGeom = cleanGeometryForExport(trayGeom);
        const trayStl = stlSerializer.serialize({ binary: true }, cleanedGeom);
        const trayPath = join(MESH_ANALYSIS_DIR, filename);
        writeFileSync(trayPath, Buffer.concat(trayStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer))));
        console.log(`  Written: ${filename}`);
      }
    } catch (e) {
      console.error(`  Error generating loose tray:`, e);
    }

    // Run mesh analyzer and exit
    console.log('\nRunning mesh analyzer...');
    try {
      const result = execSync('source scripts/.venv/bin/activate && python scripts/mesh-analyzer.py', {
        cwd: join(MESH_ANALYSIS_DIR, '..'),
        encoding: 'utf-8',
        shell: '/bin/bash'
      });
      console.log(result);
    } catch (e) {
      console.error('Error running mesh analyzer:', e instanceof Error ? e.message : e);
    }
    return;
  }

  // Get box ID from command line or use first box
  const boxId = targetId || allBoxes[0]?.id;
  const box: Box | undefined = allBoxes.find((b: Box) => b.id === boxId);

  if (!box) {
    console.error(`Error: Box or tray with ID "${boxId}" not found`);
    console.error('Available boxes:', allBoxes.map((b: Box) => `${b.id} (${b.name})`).join(', '));
    console.error('Available loose trays:', allLooseTrays.map((t: Tray) => `${t.id} (${t.name})`).join(', '));
    process.exit(1);
  }

  console.log(`\nGenerating geometry for box: "${box.name}" (${box.id})`);
  console.log(`  Trays: ${box.trays.length}`);
  console.log(`  Wall thickness: ${box.wallThickness}mm`);
  console.log(`  Lid params:`, box.lidParams);

  // Generate box geometry
  console.log('\nGenerating box geometry...');
  try {
    const boxGeom = createBoxWithLidGrooves(box);
    if (boxGeom) {
      const cleanedGeom = cleanGeometryForExport(boxGeom);
      const boxStl = stlSerializer.serialize({ binary: true }, cleanedGeom);
      const boxPath = join(MESH_ANALYSIS_DIR, 'box.stl');
      writeFileSync(boxPath, Buffer.concat(boxStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer))));
      console.log(`  Written: box.stl`);
    } else {
      console.log('  Warning: Box geometry is null');
    }
  } catch (e) {
    console.error('  Error generating box:', e);
  }

  // Generate lid geometry
  console.log('Generating lid geometry...');
  try {
    const lidGeom = createLid(box);
    if (lidGeom) {
      const cleanedGeom = cleanGeometryForExport(lidGeom);
      const lidStl = stlSerializer.serialize({ binary: true }, cleanedGeom);
      const lidPath = join(MESH_ANALYSIS_DIR, 'lid.stl');
      writeFileSync(lidPath, Buffer.concat(lidStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer))));
      console.log(`  Written: lid.stl`);
    } else {
      console.log('  Warning: Lid geometry is null');
    }
  } catch (e) {
    console.error('  Error generating lid:', e);
  }

  // Generate tray geometries
  console.log('Generating tray geometries...');
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Calculate max tray height (same as worker does)
  const boxInnerHeight = box.exteriorHeight - box.floorThickness;
  const maxHeight = boxInnerHeight - (box.lidParams?.thickness || 2);

  for (let i = 0; i < box.trays.length; i++) {
    const tray: Tray = box.trays[i];
    const letter = letters[i] || `T${i}`;
    const safeName = tray.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `tray_${letter}_${safeName}.stl`;

    try {
      // Dispatch to appropriate geometry generator based on tray type
      let trayGeom: Geom3 | null = null;
      if (isCupTray(tray)) {
        trayGeom = createCupTray(tray.params, tray.name, maxHeight, 0);
      } else if (isCardWellTray(tray)) {
        trayGeom = createCardWellTray(tray.params, project.cardSizes, tray.name, maxHeight, 0);
      } else if (isCardTray(tray)) {
        trayGeom = createCardDrawTray(tray.params, project.cardSizes, tray.name, maxHeight, 0);
      } else if (isCardDividerTray(tray)) {
        trayGeom = createCardDividerTray(tray.params, project.cardSizes, tray.name, maxHeight, 0);
      } else if (isCounterTray(tray)) {
        trayGeom = createCounterTray(tray.params, project.counterShapes, tray.name, maxHeight, 0);
      } else {
        // Default to counter tray for backwards compatibility
        trayGeom = createCounterTray(
          tray.params as Parameters<typeof createCounterTray>[0],
          project.counterShapes,
          tray.name,
          maxHeight,
          0
        );
      }

      if (trayGeom) {
        const cleanedGeom = cleanGeometryForExport(trayGeom);
        const trayStl = stlSerializer.serialize({ binary: true }, cleanedGeom);
        const trayPath = join(MESH_ANALYSIS_DIR, filename);
        writeFileSync(trayPath, Buffer.concat(trayStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer))));
        console.log(`  Written: ${filename}`);
      } else {
        console.log(`  Warning: Tray "${tray.name}" geometry is null/empty`);
      }
    } catch (e) {
      console.error(`  Error generating tray "${tray.name}":`, e);
    }
  }

  // Run mesh analyzer
  console.log('\nRunning mesh analyzer...');
  try {
    const result = execSync('source scripts/.venv/bin/activate && python scripts/mesh-analyzer.py', {
      cwd: join(MESH_ANALYSIS_DIR, '..'),
      encoding: 'utf-8',
      shell: '/bin/bash'
    });
    console.log(result);
  } catch (e) {
    console.error('Error running mesh analyzer:', e instanceof Error ? e.message : e);
  }

  // Extract and display ramp analysis
  console.log('\n=== RAMP ANALYSIS ===');
  const reportPath = join(MESH_ANALYSIS_DIR, 'report.json');
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    const rampAnalysis = report.expected_ramp_analysis;
    if (rampAnalysis) {
      console.log(JSON.stringify(rampAnalysis, null, 2));
    } else {
      console.log('No ramp analysis found in report');
    }
  }
}

main().catch(console.error);
