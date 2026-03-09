import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid, cylinder } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, scale, mirrorY, rotateX, rotateZ } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Import types from project
import type { CardSize } from '$lib/types/project';
import { DEFAULT_CARD_SIZE_IDS } from './counterTray';

// Re-export for backwards compatibility
export type CustomCardSize = CardSize;

// A single stack within a card divider tray
export interface CardDividerStack {
  cardSizeId: string; // Reference to a CardSize by ID
  count: number; // Number of cards in this stack
  label?: string; // Optional label for the stack
}

export interface CardDividerTrayParams {
  stacks: CardDividerStack[];
  orientation: 'vertical' | 'horizontal'; // Card orientation for entire tray
  stackDirection: 'sideBySide' | 'frontToBack'; // How stacks are arranged in the tray
  wallThickness: number;
  floorThickness: number;
  clearance: number; // Tolerance around cards
  rimHeight: number; // Extra height above cards
}

export const defaultCardDividerTrayParams: CardDividerTrayParams = {
  stacks: [
    { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard, count: 30, label: undefined },
    { cardSizeId: DEFAULT_CARD_SIZE_IDS.standard, count: 30, label: undefined }
  ],
  orientation: 'horizontal',
  stackDirection: 'frontToBack',
  wallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 1.5,
  rimHeight: 3.0
};

// Helper to get card dimensions from global card sizes by ID
export function getCardSize(cardSizeId: string, cardSizes: CardSize[]): CardSize | null {
  return cardSizes.find((s) => s.id === cardSizeId) || null;
}

// For visualization - position data for each stack
export interface CardDividerStackPosition {
  x: number; // Center X position within tray
  y: number; // Center Y position within tray
  z: number; // Base Z position (floor level)
  slotWidth: number; // Width of the slot (card dimension + clearance)
  slotDepth: number; // Depth of the slot based on card count
  slotHeight: number; // Height of the slot (card standing dimension)
  cardSizeId: string;
  count: number;
  label?: string;
  color: string;
  // Card dimensions for rendering
  cardWidth: number;
  cardLength: number;
  cardThickness: number;
  orientation: 'vertical' | 'horizontal';
}

export function getCardDividerTrayDimensions(
  params: CardDividerTrayParams,
  customCardSizes: CustomCardSize[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const { stacks, orientation, stackDirection, wallThickness, floorThickness, clearance, rimHeight } = params;

  if (stacks.length === 0) {
    return { width: wallThickness * 2, depth: wallThickness * 2, height: floorThickness };
  }

  let maxSlotHeight = 0;

  // Calculate slot dimensions for each stack
  const slotDimensions: { slotWidth: number; slotDepth: number; slotHeight: number }[] = [];

  for (const stack of stacks) {
    const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
    if (!cardSize) continue;

    const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

    // Calculate slot dimensions based on orientation
    // Vertical: cards stand with long edge up (card width is slot width, card length is height)
    // Horizontal: cards stand with short edge up (card length is slot width, card width is height)
    let slotWidth: number;
    let slotHeight: number;

    if (orientation === 'vertical') {
      slotWidth = cardWidth + clearance * 2;
      slotHeight = cardLength;
    } else {
      slotWidth = cardLength + clearance * 2;
      slotHeight = cardWidth;
    }

    // Slot depth is based on card count (cards stacked on top of each other)
    const slotDepth = stack.count * cardThickness + clearance * 2;

    slotDimensions.push({ slotWidth, slotDepth, slotHeight });
    maxSlotHeight = Math.max(maxSlotHeight, slotHeight);
  }

  // If no valid card sizes were found, return minimal dimensions
  if (slotDimensions.length === 0) {
    return { width: wallThickness * 2, depth: wallThickness * 2, height: floorThickness };
  }

  let trayWidth: number;
  let trayDepth: number;

  if (stackDirection === 'sideBySide') {
    // Stacks arranged horizontally (side by side along X)
    // Width = sum of all slot widths + walls between
    // Depth = max slot depth + front/back walls
    const totalSlotWidth = slotDimensions.reduce((sum, d) => sum + d.slotWidth, 0);
    const maxSlotDepth = Math.max(...slotDimensions.map((d) => d.slotDepth));

    trayWidth = wallThickness + totalSlotWidth + wallThickness * stacks.length;
    trayDepth = wallThickness * 2 + maxSlotDepth;
  } else {
    // Stacks arranged vertically (front to back along Y)
    // Width = max slot width + left/right walls
    // Depth = sum of all slot depths + walls between
    const maxSlotWidth = Math.max(...slotDimensions.map((d) => d.slotWidth));
    const totalSlotDepth = slotDimensions.reduce((sum, d) => sum + d.slotDepth, 0);

    trayWidth = wallThickness * 2 + maxSlotWidth;
    trayDepth = wallThickness + totalSlotDepth + wallThickness * stacks.length;
  }

  const trayHeight = floorThickness + maxSlotHeight + rimHeight;

  return { width: trayWidth, depth: trayDepth, height: trayHeight };
}

export function getCardDividerPositions(
  params: CardDividerTrayParams,
  customCardSizes: CustomCardSize[],
  targetHeight?: number,
  spacerHeight?: number
): CardDividerStackPosition[] {
  const { stacks: originalStacks, orientation, stackDirection, wallThickness, floorThickness, clearance } = params;

  // Reverse stacks so first item in UI list appears at front of tray
  const stacks = [...originalStacks].reverse();

  const positions: CardDividerStackPosition[] = [];
  const colors = ['#4a90a4', '#a4784a', '#4aa474', '#a44a74', '#744aa4', '#a4a44a'];

  const dims = getCardDividerTrayDimensions(params, customCardSizes);

  // Calculate effective tray height and floor position
  const baseSpacerHeight = spacerHeight ?? 0;
  let trayHeight = dims.height + baseSpacerHeight;
  if (targetHeight && targetHeight > trayHeight) {
    trayHeight = targetHeight;
  }
  const extraHeight = trayHeight - dims.height;
  const effectiveFloorHeight = floorThickness + extraHeight;

  // Calculate max slot height across all stacks for floor adjustment
  let maxSlotHeight = 0;
  for (const stack of stacks) {
    const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
    if (!cardSize) continue;
    const slotHeight = orientation === 'vertical' ? cardSize.length : cardSize.width;
    maxSlotHeight = Math.max(maxSlotHeight, slotHeight);
  }

  if (stackDirection === 'sideBySide') {
    // Stacks arranged horizontally (side by side along X)
    let currentX = wallThickness;

    for (let i = 0; i < stacks.length; i++) {
      const stack = stacks[i];
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;

      const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

      let slotWidth: number;
      let slotHeight: number;

      if (orientation === 'vertical') {
        slotWidth = cardWidth + clearance * 2;
        slotHeight = cardLength;
      } else {
        slotWidth = cardLength + clearance * 2;
        slotHeight = cardWidth;
      }

      const slotDepth = stack.count * cardThickness + clearance * 2;

      // Raise floor for shorter cards so tops are accessible
      const stackFloorHeight = effectiveFloorHeight + (maxSlotHeight - slotHeight);

      // Center the slot in Y (all slots share the same Y position, centered)
      const slotY = dims.depth / 2;
      const slotX = currentX + slotWidth / 2;

      positions.push({
        x: slotX,
        y: slotY,
        z: stackFloorHeight,
        slotWidth,
        slotDepth,
        slotHeight,
        cardSizeId: stack.cardSizeId,
        count: stack.count,
        label: stack.label,
        color: colors[i % colors.length],
        cardWidth,
        cardLength,
        cardThickness,
        orientation
      });

      currentX += slotWidth + wallThickness;
    }
  } else {
    // Stacks arranged vertically (front to back along Y)
    let currentY = wallThickness;

    // Calculate max slot width for centering
    let maxSlotWidth = 0;
    for (const stack of stacks) {
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;
      const slotWidth = orientation === 'vertical' ? cardSize.width + clearance * 2 : cardSize.length + clearance * 2;
      maxSlotWidth = Math.max(maxSlotWidth, slotWidth);
    }

    for (let i = 0; i < stacks.length; i++) {
      const stack = stacks[i];
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;

      const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

      let slotWidth: number;
      let slotHeight: number;

      if (orientation === 'vertical') {
        slotWidth = cardWidth + clearance * 2;
        slotHeight = cardLength;
      } else {
        slotWidth = cardLength + clearance * 2;
        slotHeight = cardWidth;
      }

      const slotDepth = stack.count * cardThickness + clearance * 2;

      // Raise floor for shorter cards so tops are accessible
      const stackFloorHeight = effectiveFloorHeight + (maxSlotHeight - slotHeight);

      // Center the slot in X (all slots share the same X position, centered)
      const slotX = dims.width / 2;
      const slotY = currentY + slotDepth / 2;

      positions.push({
        x: slotX,
        y: slotY,
        z: stackFloorHeight,
        slotWidth,
        slotDepth,
        slotHeight,
        cardSizeId: stack.cardSizeId,
        count: stack.count,
        label: stack.label,
        color: colors[i % colors.length],
        cardWidth,
        cardLength,
        cardThickness,
        orientation
      });

      currentY += slotDepth + wallThickness;
    }
  }

  return positions;
}

/**
 * Creates geometry for a stack label to be subtracted from the tray.
 * Labels are embossed (cut into) on walls - front wall for side-by-side, left wall for front-to-back.
 * Text is oriented perpendicular to the floor (vertical, reads bottom-to-top).
 */
function createStackLabelGeometry(
  label: string,
  slotCenterX: number,
  slotCenterY: number,
  slotWidth: number,
  slotDepth: number,
  trayHeight: number,
  floorThickness: number,
  wallThickness: number,
  stackDirection: 'sideBySide' | 'frontToBack'
): Geom3 | null {
  const trimmedLabel = label.trim();
  if (trimmedLabel.length === 0) return null;

  const textDepth = 0.6; // mm, emboss depth
  const strokeWidth = 1.0; // mm, slightly thinner for smaller labels
  const baseTextHeight = 5; // mm, base font size before scaling

  // Generate text segments
  const textSegments = vectorText({ height: baseTextHeight, align: 'center' }, trimmedLabel.toUpperCase());

  if (textSegments.length === 0) return null;

  // Create text shapes
  const textShapes: ReturnType<typeof extrudeLinear>[] = [];
  for (const segment of textSegments) {
    if (segment.length >= 2) {
      const pathObj = path2.fromPoints({ closed: false }, segment);
      const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 64 }, pathObj);
      const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
      textShapes.push(extruded);
    }
  }

  if (textShapes.length === 0) return null;

  // Calculate text bounds
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  for (const segment of textSegments) {
    for (const point of segment) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    }
  }

  const textWidth = maxX - minX + strokeWidth;
  const textHeight = maxY - minY + strokeWidth;

  // Calculate wall height available for text
  const wallHeight = trayHeight - floorThickness;
  const wallCenterZ = floorThickness + wallHeight / 2;

  // Minimum margins
  const verticalMargin = 2;
  const availableVertical = wallHeight - verticalMargin * 2;

  // Skip if wall is too short for readable text
  if (availableVertical < 3) return null;

  // Calculate scale based on text orientation
  let textScale: number;
  if (stackDirection === 'sideBySide') {
    // Horizontal text: textWidth is horizontal, textHeight is vertical
    const availableHorizontal = slotWidth - strokeWidth * 2;
    const scaleH = Math.min(1, availableHorizontal / textWidth);
    const scaleV = Math.min(1, availableVertical / textHeight);
    textScale = Math.min(scaleH, scaleV);
  } else {
    // Vertical text: textWidth becomes vertical, textHeight becomes horizontal
    const availableHorizontal = slotDepth - strokeWidth * 2;
    const scaleH = Math.min(1, availableHorizontal / textHeight);
    const scaleV = Math.min(1, availableVertical / textWidth);
    textScale = Math.min(scaleH, scaleV);
  }

  // Combine text shapes
  let combinedText = union(...textShapes);

  // Center point of original text
  const textCenterX = (minX + maxX) / 2;
  const textCenterY = (minY + maxY) / 2;

  // First center the text at origin, then scale
  combinedText = translate([-textCenterX, -textCenterY, 0], combinedText);
  combinedText = scale([textScale, textScale, 1], combinedText);

  if (stackDirection === 'sideBySide') {
    // Front wall: text horizontal (parallel to floor), visible from -Y
    // Mirror so text reads correctly when embossed
    combinedText = mirrorY(combinedText);
    // Stand text up perpendicular to floor
    combinedText = rotateX(-Math.PI / 2, combinedText);
    // Position at front wall surface
    combinedText = translate([slotCenterX, -0.1, wallCenterZ], combinedText);
  } else {
    // Left wall: text vertical (reading bottom-to-top), visible from -X
    // Mirror so text reads correctly when embossed
    combinedText = mirrorY(combinedText);
    // Rotate to be vertical (reading bottom-to-top)
    combinedText = rotateZ(-Math.PI / 2, combinedText);
    // Stand text up perpendicular to floor
    combinedText = rotateX(-Math.PI / 2, combinedText);
    // Rotate to face the left wall
    combinedText = rotateZ(-Math.PI / 2, combinedText);
    // Position at left wall surface
    combinedText = translate([-0.1, slotCenterY, wallCenterZ], combinedText);
  }

  return combinedText;
}

export function createCardDividerTray(
  params: CardDividerTrayParams,
  customCardSizes: CustomCardSize[],
  _trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true,
  showStackLabels: boolean = true
): Geom3 {
  const { stacks: originalStacks, orientation, stackDirection, wallThickness, floorThickness, clearance } = params;

  // Reverse stacks so first item in UI list appears at front of tray
  const stacks = [...originalStacks].reverse();

  if (stacks.length === 0) {
    // Empty tray - just a small box
    return translate(
      [wallThickness, wallThickness, floorThickness / 2],
      cuboid({ size: [wallThickness * 2, wallThickness * 2, floorThickness] })
    );
  }

  // Calculate dimensions
  const dims = getCardDividerTrayDimensions(params, customCardSizes);
  const spacerHeight = floorSpacerHeight ?? 0;
  let trayHeight = dims.height + spacerHeight;

  if (targetHeight && targetHeight > trayHeight) {
    trayHeight = targetHeight;
  }

  const trayWidth = dims.width;
  const trayDepth = dims.depth;

  // Create outer solid box
  const outerBox = translate(
    [trayWidth / 2, trayDepth / 2, trayHeight / 2],
    cuboid({ size: [trayWidth, trayDepth, trayHeight] })
  );

  // Calculate effective floor height - if tray is extended, raise the card floor
  // so cards are accessible from the top
  const extraHeight = trayHeight - dims.height;
  const effectiveFloorHeight = floorThickness + extraHeight;

  // Subtract individual slot cavities
  let tray = outerBox;

  // Calculate max slot height for per-stack floor adjustment
  let maxSlotHeight = 0;
  for (const stack of stacks) {
    const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
    if (!cardSize) continue;
    const slotHeight = orientation === 'vertical' ? cardSize.length : cardSize.width;
    maxSlotHeight = Math.max(maxSlotHeight, slotHeight);
  }

  if (stackDirection === 'sideBySide') {
    // Stacks arranged horizontally (side by side along X)
    let currentX = wallThickness;

    for (const stack of stacks) {
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;

      const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

      let slotWidth: number;
      let slotHeight: number;

      if (orientation === 'vertical') {
        slotWidth = cardWidth + clearance * 2;
        slotHeight = cardLength;
      } else {
        slotWidth = cardLength + clearance * 2;
        slotHeight = cardWidth;
      }

      const slotDepth = stack.count * cardThickness + clearance * 2;

      // Raise floor for shorter cards so tops are accessible
      const stackFloorHeight = effectiveFloorHeight + (maxSlotHeight - slotHeight);

      // Cavity goes from raised floor to top (open top)
      const cavityHeight = trayHeight - stackFloorHeight + 0.1;

      // Create slot cavity - centered in Y, at currentX position
      const slotCavity = translate(
        [currentX + slotWidth / 2, trayDepth / 2, stackFloorHeight + cavityHeight / 2],
        cuboid({ size: [slotWidth, slotDepth, cavityHeight] })
      );

      tray = subtract(tray, slotCavity);

      currentX += slotWidth + wallThickness;
    }
  } else {
    // Stacks arranged vertically (front to back along Y)
    let currentY = wallThickness;

    // Calculate max slot width for cavity centering
    let maxSlotWidth = 0;
    for (const stack of stacks) {
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;
      const slotWidth = orientation === 'vertical' ? cardSize.width + clearance * 2 : cardSize.length + clearance * 2;
      maxSlotWidth = Math.max(maxSlotWidth, slotWidth);
    }

    for (const stack of stacks) {
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;

      const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

      let slotWidth: number;
      let slotHeight: number;

      if (orientation === 'vertical') {
        slotWidth = cardWidth + clearance * 2;
        slotHeight = cardLength;
      } else {
        slotWidth = cardLength + clearance * 2;
        slotHeight = cardWidth;
      }

      const slotDepth = stack.count * cardThickness + clearance * 2;

      // Raise floor for shorter cards so tops are accessible
      const stackFloorHeight = effectiveFloorHeight + (maxSlotHeight - slotHeight);

      // Cavity goes from raised floor to top (open top)
      const cavityHeight = trayHeight - stackFloorHeight + 0.1;

      // Create slot cavity - centered in X, at currentY position
      const slotCavity = translate(
        [trayWidth / 2, currentY + slotDepth / 2, stackFloorHeight + cavityHeight / 2],
        cuboid({ size: [slotWidth, slotDepth, cavityHeight] })
      );

      tray = subtract(tray, slotCavity);

      currentY += slotDepth + wallThickness;
    }
  }

  // Add finger cutouts
  // Cylinder diameter = half the card's shorter dimension for vertical, longer for horizontal
  // Vertical: cards stand tall, cutout based on card width (shorter side)
  // Horizontal: cards on side, cutout based on card length (longer side)
  let maxCutoutDimension = 0;
  for (const stack of stacks) {
    const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
    if (!cardSize) continue;
    const cutoutDimension = orientation === 'vertical' ? cardSize.width : cardSize.length;
    maxCutoutDimension = Math.max(maxCutoutDimension, cutoutDimension);
  }

  const cutoutRadius = maxCutoutDimension / 4; // Diameter is half the dimension, so radius is quarter
  const cutoutCenterZ = trayHeight; // Cylinder midpoint at top of tray

  if (stackDirection === 'frontToBack') {
    // Single cylinder running along Y axis (through front wall)
    // Cylinder is centered in X, midpoint at top of tray
    const cutoutLength = trayDepth + 2; // Extend beyond tray for clean cut

    const fingerCutout = translate(
      [trayWidth / 2, trayDepth / 2, cutoutCenterZ],
      rotateX(Math.PI / 2, cylinder({ radius: cutoutRadius, height: cutoutLength, segments: 128 }))
    );
    tray = subtract(tray, fingerCutout);
  } else {
    // Side by side: One cylinder per stack, centered on each stack
    let currentX = wallThickness;
    const cutoutLength = trayDepth + 2; // Extend beyond tray for clean cut

    for (const stack of stacks) {
      const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
      if (!cardSize) continue;

      const { width: cardWidth, length: cardLength } = cardSize;
      const slotWidth = orientation === 'vertical' ? cardWidth + clearance * 2 : cardLength + clearance * 2;

      // Cutout centered on this stack
      const stackCenterX = currentX + slotWidth / 2;

      const fingerCutout = translate(
        [stackCenterX, trayDepth / 2, cutoutCenterZ],
        rotateX(Math.PI / 2, cylinder({ radius: cutoutRadius, height: cutoutLength, segments: 128 }))
      );
      tray = subtract(tray, fingerCutout);

      currentX += slotWidth + wallThickness;
    }
  }

  // Emboss tray name on bottom
  if (showEmboss && _trayName && _trayName.trim().length > 0) {
    const textDepth = 0.6;
    const strokeWidth = 1.2;
    const textHeightParam = 6;
    const margin = wallThickness * 2;

    const textSegments = vectorText({ height: textHeightParam, align: 'center' }, _trayName.trim().toUpperCase());

    if (textSegments.length > 0) {
      const textShapes: ReturnType<typeof extrudeLinear>[] = [];
      for (const segment of textSegments) {
        if (segment.length >= 2) {
          const pathObj = path2.fromPoints({ closed: false }, segment);
          const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 128 }, pathObj);
          const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
          textShapes.push(extruded);
        }
      }

      if (textShapes.length > 0) {
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;
        for (const segment of textSegments) {
          for (const point of segment) {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
          }
        }
        const textWidthCalc = maxX - minX + strokeWidth;
        const textHeightY = maxY - minY + strokeWidth;

        // Fit text within tray bounds
        const availableWidth = trayWidth - margin * 2;
        const availableDepth = trayDepth - margin * 2;
        const scaleX = Math.min(1, availableWidth / textWidthCalc);
        const scaleY = Math.min(1, availableDepth / textHeightY);
        const textScale = Math.min(scaleX, scaleY);

        const centerX = trayWidth / 2;
        const centerY = trayDepth / 2;
        const textCenterX = (minX + maxX) / 2;
        const textCenterY = (minY + maxY) / 2;

        let combinedText = union(...textShapes);
        // Mirror Y so text reads correctly when tray is flipped
        combinedText = mirrorY(combinedText);

        const positionedText = translate(
          [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
          scale([textScale, textScale, 1], combinedText)
        );
        tray = subtract(tray, positionedText);
      }
    }
  }

  // Emboss stack labels on walls
  if (showStackLabels) {
    const stackLabelCuts: Geom3[] = [];

    if (stackDirection === 'sideBySide') {
      // Labels on front wall, beneath each stack
      let currentX = wallThickness;

      for (const stack of stacks) {
        const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
        if (!cardSize) continue;

        const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

        const slotWidth = orientation === 'vertical' ? cardWidth + clearance * 2 : cardLength + clearance * 2;
        const slotDepth = stack.count * cardThickness + clearance * 2;
        const slotCenterX = currentX + slotWidth / 2;
        const slotCenterY = trayDepth / 2;

        if (stack.label?.trim()) {
          const labelGeom = createStackLabelGeometry(
            stack.label,
            slotCenterX,
            slotCenterY,
            slotWidth,
            slotDepth,
            trayHeight,
            floorThickness,
            wallThickness,
            stackDirection
          );
          if (labelGeom) stackLabelCuts.push(labelGeom);
        }

        currentX += slotWidth + wallThickness;
      }
    } else {
      // Labels on left wall, next to each stack
      let currentY = wallThickness;

      for (const stack of stacks) {
        const cardSize = getCardSize(stack.cardSizeId, customCardSizes);
        if (!cardSize) continue;

        const { width: cardWidth, length: cardLength, thickness: cardThickness } = cardSize;

        const slotWidth = orientation === 'vertical' ? cardWidth + clearance * 2 : cardLength + clearance * 2;
        const slotDepth = stack.count * cardThickness + clearance * 2;
        const slotCenterX = trayWidth / 2;
        const slotCenterY = currentY + slotDepth / 2;

        if (stack.label?.trim()) {
          const labelGeom = createStackLabelGeometry(
            stack.label,
            slotCenterX,
            slotCenterY,
            slotWidth,
            slotDepth,
            trayHeight,
            floorThickness,
            wallThickness,
            stackDirection
          );
          if (labelGeom) stackLabelCuts.push(labelGeom);
        }

        currentY += slotDepth + wallThickness;
      }
    }

    if (stackLabelCuts.length > 0) {
      tray = subtract(tray, ...stackLabelCuts);
    }
  }

  return tray;
}
