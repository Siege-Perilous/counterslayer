/**
 * Node.js script to generate box/lid geometry directly.
 * This bypasses the browser and web worker, allowing direct iteration on geometry code.
 *
 * Usage: npx tsx scripts/generate-geometry.ts [boxId]
 *
 * Reads project.json from mesh-analysis/, generates STLs, and runs mesh-analyzer.py
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Import geometry modules
import { createBoxWithLidGrooves, createLid } from '../src/lib/models/lid.js';
import { createCounterTray } from '../src/lib/models/counterTray.js';
import type { Box, Tray } from '../src/lib/types/project.js';
import stlSerializer from '@jscad/stl-serializer';

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
	console.log(`Loaded project with ${project.boxes?.length || 0} boxes`);

	// Get box ID from command line or use first box
	const boxId = process.argv[2] || project.boxes?.[0]?.id;
	const box: Box | undefined = project.boxes?.find((b: Box) => b.id === boxId);

	if (!box) {
		console.error(`Error: Box with ID "${boxId}" not found`);
		console.error(
			'Available boxes:',
			project.boxes?.map((b: Box) => `${b.id} (${b.name})`).join(', ')
		);
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
			const boxStl = stlSerializer.serialize({ binary: true }, boxGeom);
			const boxPath = join(MESH_ANALYSIS_DIR, 'box.stl');
			writeFileSync(
				boxPath,
				Buffer.concat(boxStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer)))
			);
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
			const lidStl = stlSerializer.serialize({ binary: true }, lidGeom);
			const lidPath = join(MESH_ANALYSIS_DIR, 'lid.stl');
			writeFileSync(
				lidPath,
				Buffer.concat(lidStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer)))
			);
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
			// createCounterTray returns a single geometry, not an array
			const trayGeom = createCounterTray(tray.params, tray.name, maxHeight, 0);
			if (trayGeom) {
				const trayStl = stlSerializer.serialize({ binary: true }, trayGeom);
				const trayPath = join(MESH_ANALYSIS_DIR, filename);
				writeFileSync(
					trayPath,
					Buffer.concat(trayStl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer)))
				);
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
		const result = execSync(
			'source scripts/.venv/bin/activate && python scripts/mesh-analyzer.py',
			{ cwd: join(MESH_ANALYSIS_DIR, '..'), encoding: 'utf-8', shell: '/bin/bash' }
		);
		console.log(result);
	} catch (e: any) {
		console.error('Error running mesh analyzer:', e.message);
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
