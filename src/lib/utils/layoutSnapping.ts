/**
 * Layout Snapping Utility
 * Handles grid snapping, face-to-face snapping, and overlap detection
 */

import type { EditorTrayPlacement, SnapGuide } from '$lib/stores/layoutEditor.svelte';
import { getEffectiveDimensions } from '$lib/stores/layoutEditor.svelte';

// Snap thresholds
const GRID_SIZE = 1; // 1mm grid
const FACE_SNAP_THRESHOLD = 5; // 5mm threshold for face-to-face snapping

export interface SnapResult {
	x: number;
	y: number;
	guides: SnapGuide[];
}

/**
 * Apply snapping to a position
 * Face-to-face snapping takes precedence over grid snapping
 */
export function snapPosition(
	movingTray: EditorTrayPlacement,
	newX: number,
	newY: number,
	allPlacements: EditorTrayPlacement[],
	printBedSize: number
): SnapResult {
	const guides: SnapGuide[] = [];
	const movingDims = getEffectiveDimensions(movingTray);

	// Calculate edges of moving tray at proposed position
	const movingLeft = newX;
	const movingRight = newX + movingDims.width;
	const movingFront = newY;
	const movingBack = newY + movingDims.depth;

	let snappedX = newX;
	let snappedY = newY;
	let xSnapped = false;
	let ySnapped = false;

	// Try face-to-face snapping first (higher priority)
	for (const other of allPlacements) {
		if (other.trayId === movingTray.trayId) continue;

		const otherDims = getEffectiveDimensions(other);
		const otherLeft = other.x;
		const otherRight = other.x + otherDims.width;
		const otherFront = other.y;
		const otherBack = other.y + otherDims.depth;

		// X-axis face snapping
		if (!xSnapped) {
			// Snap moving right edge to other left edge
			if (Math.abs(movingRight - otherLeft) < FACE_SNAP_THRESHOLD) {
				snappedX = otherLeft - movingDims.width;
				xSnapped = true;
				// Add vertical guide at snap position
				const guideY = Math.min(movingFront, otherFront);
				const guideEndY = Math.max(movingBack, otherBack);
				guides.push({
					type: 'vertical',
					position: otherLeft,
					start: guideY,
					end: guideEndY
				});
			}
			// Snap moving left edge to other right edge
			else if (Math.abs(movingLeft - otherRight) < FACE_SNAP_THRESHOLD) {
				snappedX = otherRight;
				xSnapped = true;
				const guideY = Math.min(movingFront, otherFront);
				const guideEndY = Math.max(movingBack, otherBack);
				guides.push({
					type: 'vertical',
					position: otherRight,
					start: guideY,
					end: guideEndY
				});
			}
			// Snap moving left to other left (alignment)
			else if (Math.abs(movingLeft - otherLeft) < FACE_SNAP_THRESHOLD) {
				snappedX = otherLeft;
				xSnapped = true;
				guides.push({
					type: 'vertical',
					position: otherLeft,
					start: Math.min(movingFront, otherFront),
					end: Math.max(movingBack, otherBack)
				});
			}
			// Snap moving right to other right (alignment)
			else if (Math.abs(movingRight - otherRight) < FACE_SNAP_THRESHOLD) {
				snappedX = otherRight - movingDims.width;
				xSnapped = true;
				guides.push({
					type: 'vertical',
					position: otherRight,
					start: Math.min(movingFront, otherFront),
					end: Math.max(movingBack, otherBack)
				});
			}
		}

		// Y-axis face snapping
		if (!ySnapped) {
			// Snap moving back edge to other front edge
			if (Math.abs(movingBack - otherFront) < FACE_SNAP_THRESHOLD) {
				snappedY = otherFront - movingDims.depth;
				ySnapped = true;
				const guideX = Math.min(movingLeft, otherLeft);
				const guideEndX = Math.max(movingRight, otherRight);
				guides.push({
					type: 'horizontal',
					position: otherFront,
					start: guideX,
					end: guideEndX
				});
			}
			// Snap moving front edge to other back edge
			else if (Math.abs(movingFront - otherBack) < FACE_SNAP_THRESHOLD) {
				snappedY = otherBack;
				ySnapped = true;
				const guideX = Math.min(movingLeft, otherLeft);
				const guideEndX = Math.max(movingRight, otherRight);
				guides.push({
					type: 'horizontal',
					position: otherBack,
					start: guideX,
					end: guideEndX
				});
			}
			// Snap moving front to other front (alignment)
			else if (Math.abs(movingFront - otherFront) < FACE_SNAP_THRESHOLD) {
				snappedY = otherFront;
				ySnapped = true;
				guides.push({
					type: 'horizontal',
					position: otherFront,
					start: Math.min(movingLeft, otherLeft),
					end: Math.max(movingRight, otherRight)
				});
			}
			// Snap moving back to other back (alignment)
			else if (Math.abs(movingBack - otherBack) < FACE_SNAP_THRESHOLD) {
				snappedY = otherBack - movingDims.depth;
				ySnapped = true;
				guides.push({
					type: 'horizontal',
					position: otherBack,
					start: Math.min(movingLeft, otherLeft),
					end: Math.max(movingRight, otherRight)
				});
			}
		}
	}

	// Apply grid snapping if face snap didn't trigger
	if (!xSnapped) {
		snappedX = Math.round(snappedX / GRID_SIZE) * GRID_SIZE;
	}
	if (!ySnapped) {
		snappedY = Math.round(snappedY / GRID_SIZE) * GRID_SIZE;
	}

	// Constrain to print bed bounds
	snappedX = Math.max(0, Math.min(snappedX, printBedSize - movingDims.width));
	snappedY = Math.max(0, Math.min(snappedY, printBedSize - movingDims.depth));

	return { x: snappedX, y: snappedY, guides };
}

/**
 * Check if two placements overlap (AABB collision)
 */
export function checkOverlap(
	placement1: EditorTrayPlacement,
	placement2: EditorTrayPlacement
): boolean {
	const dims1 = getEffectiveDimensions(placement1);
	const dims2 = getEffectiveDimensions(placement2);

	const left1 = placement1.x;
	const right1 = placement1.x + dims1.width;
	const front1 = placement1.y;
	const back1 = placement1.y + dims1.depth;

	const left2 = placement2.x;
	const right2 = placement2.x + dims2.width;
	const front2 = placement2.y;
	const back2 = placement2.y + dims2.depth;

	// Check for non-overlap (if any is true, no overlap)
	if (right1 <= left2 || right2 <= left1) return false;
	if (back1 <= front2 || back2 <= front1) return false;

	return true;
}

/**
 * Check if a placement overlaps with any other placement
 */
export function hasAnyOverlap(
	placement: EditorTrayPlacement,
	allPlacements: EditorTrayPlacement[]
): boolean {
	for (const other of allPlacements) {
		if (other.trayId === placement.trayId) continue;
		if (checkOverlap(placement, other)) return true;
	}
	return false;
}

/**
 * Check if a placement is within print bed bounds
 */
export function isWithinBounds(
	placement: EditorTrayPlacement,
	printBedSize: number
): boolean {
	const dims = getEffectiveDimensions(placement);
	return (
		placement.x >= 0 &&
		placement.y >= 0 &&
		placement.x + dims.width <= printBedSize &&
		placement.y + dims.depth <= printBedSize
	);
}

/**
 * Validate a proposed position (no overlaps, within bounds)
 */
export function isValidPosition(
	movingTray: EditorTrayPlacement,
	newX: number,
	newY: number,
	allPlacements: EditorTrayPlacement[],
	printBedSize: number
): boolean {
	// Create a temporary placement with the new position
	const testPlacement: EditorTrayPlacement = {
		...movingTray,
		x: newX,
		y: newY
	};

	// Check bounds
	if (!isWithinBounds(testPlacement, printBedSize)) {
		return false;
	}

	// Check overlaps
	if (hasAnyOverlap(testPlacement, allPlacements)) {
		return false;
	}

	return true;
}
