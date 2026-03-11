import { getCardScoopTrayDimensions, type CardScoopTrayParams } from '../src/lib/models/cardScoopTray.js';

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
console.log('Card dimensions: 63.5 (width) x 88.9 (length) x 0.5 (thickness)');
console.log('Stack: 30 cards = 30 * 0.5 = 15mm stack height');
console.log('');
console.log('Calculated tray dimensions:', dims);
console.log('');
console.log('Expected:');
console.log('  Width: 63.5 + 2*1.0 (clearance) + 2*2.0 (walls) = 69.5mm');
console.log('  Depth: 88.9 + 2*1.0 (clearance) + 2*2.0 (walls) = 94.9mm');
console.log('  Height: 2.0 (floor) + 15 (stack) + 3.0 (rim) = 20mm');
