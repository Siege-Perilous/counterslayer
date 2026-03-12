#!/usr/bin/env npx tsx
/**
 * Playwright-based view capture script for debugging geometry.
 * Replaces Python render-view.py with browser-based rendering.
 *
 * Usage:
 *   npx tsx scripts/capture-view.ts --angle iso
 *   npx tsx scripts/capture-view.ts --angle front --zoom 2
 *   npx tsx scripts/capture-view.ts --pos "100,80,150" --look-at "0,25,50"
 *   npx tsx scripts/capture-view.ts --markers mesh-analysis/markers.json --angle iso
 *   npx tsx scripts/capture-view.ts --angle top --out mesh-analysis/view-top.png
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result: {
    angle?: string;
    pos?: string;
    lookAt?: string;
    zoom?: number;
    markers?: string;
    out?: string;
    port?: number;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--angle':
        result.angle = next;
        i++;
        break;
      case '--pos':
        result.pos = next;
        i++;
        break;
      case '--look-at':
        result.lookAt = next;
        i++;
        break;
      case '--zoom':
        result.zoom = parseFloat(next);
        i++;
        break;
      case '--markers':
        result.markers = next;
        i++;
        break;
      case '--out':
        result.out = next;
        i++;
        break;
      case '--port':
        result.port = parseInt(next);
        i++;
        break;
      case '--help':
      case '-h':
        console.log(`
Capture view from the Counter Slayer app.

Usage:
  npx tsx scripts/capture-view.ts [options]

Options:
  --angle <preset>     Camera preset: front, back, left, right, top, bottom,
                       iso, iso-back, iso-left, iso-right
  --pos "x,y,z"        Custom camera position (Three.js Y-up coords)
  --look-at "x,y,z"    Camera look-at target
  --zoom <number>      Zoom multiplier (default: 1)
  --markers <file>     JSON file with colored markers
  --out <file>         Output file (default: mesh-analysis/view.png)
  --port <number>      Dev server port (default: 5175)

Examples:
  npx tsx scripts/capture-view.ts --angle iso
  npx tsx scripts/capture-view.ts --angle front --zoom 2
  npx tsx scripts/capture-view.ts --pos "100,80,150" --look-at "0,25,50"

Markers JSON format:
  {
    "point_name": { "pos": [x, y, z], "color": "red" }
  }

Colors: red, green, blue, yellow, cyan, magenta, orange, white
`);
        process.exit(0);
    }
  }

  return result;
}

async function captureView() {
  const args = parseArgs();
  const port = args.port ?? 5175;
  const outputPath = args.out ?? 'mesh-analysis/view.png';

  // Build URL with debug parameters
  const params = new URLSearchParams();
  params.set('debug', '1');
  params.set('hideUI', '1');

  if (args.angle) {
    params.set('angle', args.angle);
  }
  if (args.pos) {
    params.set('pos', args.pos);
  }
  if (args.lookAt) {
    params.set('lookAt', args.lookAt);
  }
  if (args.zoom) {
    params.set('zoom', args.zoom.toString());
  }

  // Load markers from file if specified
  if (args.markers) {
    try {
      const markersPath = path.resolve(args.markers);
      const markersJson = fs.readFileSync(markersPath, 'utf-8');
      const markersData = JSON.parse(markersJson);
      // Encode as base64 for URL safety
      const encoded = Buffer.from(JSON.stringify(markersData)).toString('base64');
      params.set('markers', encoded);
    } catch (e) {
      console.error(`Failed to load markers file: ${args.markers}`, e);
      process.exit(1);
    }
  }

  const url = `http://localhost:${port}/?${params.toString()}`;
  console.log('Capturing:', url);

  // Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await page.goto(url);

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Wait for geometry to generate
    await page.waitForTimeout(2000);

    // Additional wait for WebGL to render
    await page.waitForTimeout(500);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Capture screenshot
    await page.screenshot({ path: outputPath });
    console.log('Screenshot saved to:', outputPath);
  } catch (e) {
    console.error('Capture failed:', e);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

captureView().catch((e) => {
  console.error(e);
  process.exit(1);
});
