import { writeFileSync } from 'fs';
import { join } from 'path';
import stlSerializer from '@jscad/stl-serializer';
import { createCardScoopTray, getCardScoopTrayDimensions, type CardScoopTrayParams } from '../src/lib/models/cardScoopTray.js';

const params: CardScoopTrayParams = {
  layout: { root: { type: 'cell', id: 'cell1' } },
  stacks: [{ id: 'stack1', cellId: 'cell1', cardSizeId: 'card-standard', count: 30, rotation: 0 }],
  trayWidthOverride: null,
  trayDepthOverride: null,
  wallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 1.0,
  rimHeight: 3.0
};

const cardSizes = [{ id: 'card-standard', name: 'Standard', width: 63.5, length: 88.9, thickness: 0.5 }];

const dims = getCardScoopTrayDimensions(params, cardSizes);
console.log('Generating tray with natural height:', dims);

// Use actual calculated height, not an override
const geom = createCardScoopTray(params, cardSizes, 'Test Scoop', undefined, 0);
const stl = stlSerializer.serialize({ binary: true }, geom);
const outPath = join(import.meta.dirname, '..', 'mesh-analysis', 'scoop-natural.stl');
writeFileSync(outPath, Buffer.concat(stl.map((b: BlobPart) => Buffer.from(b as ArrayBuffer))));
console.log('Written:', outPath);
