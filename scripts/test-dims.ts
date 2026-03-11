import { getCardScoopTrayDimensions, type CardScoopTrayParams } from '../src/lib/models/cardScoopTray.js';
import { splitCell } from '../src/lib/types/cardScoopLayout.js';

// Single cell
const singleCell: CardScoopTrayParams = {
  layout: { root: { type: 'cell', id: 'cell1' } },
  stacks: [{ id: 's1', cellId: 'cell1', cardSizeId: 'std', count: 30, rotation: 0 }],
  trayWidthOverride: null, trayDepthOverride: null,
  wallThickness: 2.0, floorThickness: 2.0, clearance: 1.0, rimHeight: 3.0
};

// Vertical split (2 cells side by side)
const vertSplit: CardScoopTrayParams = {
  layout: splitCell({ root: { type: 'cell', id: 'cell1' } }, 'cell1', 'vertical'),
  stacks: [
    { id: 's1', cellId: 'cell1', cardSizeId: 'std', count: 30, rotation: 0 },
    { id: 's2', cellId: 'cell2', cardSizeId: 'std', count: 30, rotation: 0 }
  ],
  trayWidthOverride: null, trayDepthOverride: null,
  wallThickness: 2.0, floorThickness: 2.0, clearance: 1.0, rimHeight: 3.0
};

// Fix cell IDs after split
const splitLayout = vertSplit.layout;
if (splitLayout.root.type === 'split') {
  vertSplit.stacks[0].cellId = (splitLayout.root.first as any).id;
  vertSplit.stacks[1].cellId = (splitLayout.root.second as any).id;
}

const cardSizes = [{ id: 'std', name: 'Standard', width: 63.5, length: 88.9, thickness: 0.5 }];

console.log('Card: 63.5 x 88.9mm');
console.log('');

const dims1 = getCardScoopTrayDimensions(singleCell, cardSizes);
console.log('Single cell:');
console.log('  Expected width: 63.5 + 2 + 4 = 69.5mm');
console.log('  Actual:', dims1);

const dims2 = getCardScoopTrayDimensions(vertSplit, cardSizes);
console.log('');
console.log('Vertical split (2 cells side by side):');
console.log('  Expected width: 2*(63.5+2) + 1*2 + 2*2 = 131 + 2 + 4 = 137mm');
console.log('  Actual:', dims2);
