/**
 * Web Worker for geometry generation
 * Runs JSCAD operations off the main thread to prevent UI freezing
 */

import jscad from '@jscad/modeling';
import {
	createCounterTray,
	getCounterPositions,
	type CounterStack,
	type CustomCardSize
} from '$lib/models/counterTray';
import { createCardDrawTray, getCardDrawPositions } from '$lib/models/cardTray';
import { createCardDividerTray, getCardDividerPositions } from '$lib/models/cardDividerTray';
import { createBoxWithLidGrooves, createLid } from '$lib/models/lid';
import {
	arrangeTrays,
	calculateTraySpacers,
	getBoxDimensions,
	validateCustomDimensions,
	type TrayPlacement
} from '$lib/models/box';
import stlSerializer from '@jscad/stl-serializer';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { Box, Tray, CardSize, CounterShape } from '$lib/types/project';
import { isCardTray, isCardDividerTray } from '$lib/types/project';

const { geom3 } = jscad.geometries;

/**
 * Generate a tray letter based on cumulative index across all boxes.
 * A-Z for first 26, then AA, BB, CC... for 26+
 */
function getTrayLetter(index: number): string {
	if (index < 26) {
		return String.fromCharCode(65 + index);
	}
	const letter = String.fromCharCode(65 + (index % 26));
	const repeat = Math.floor(index / 26) + 1;
	return letter.repeat(repeat);
}

/**
 * Get cumulative tray index across all boxes.
 */
function getCumulativeTrayIndex(boxes: Box[], boxIndex: number, trayIndex: number): number {
	let cumulative = 0;
	for (let i = 0; i < boxIndex; i++) {
		cumulative += boxes[i].trays.length;
	}
	return cumulative + trayIndex;
}

// Message types
interface GenerateMessage {
	type: 'generate';
	id: number;
	project: {
		boxes: Box[];
		cardSizes?: CardSize[];
		counterShapes?: CounterShape[];
	};
	selectedBoxId: string;
	selectedTrayId: string;
}

interface ExportStlMessage {
	type: 'export-stl';
	id: number;
	target: 'tray' | 'box' | 'lid' | 'all-tray';
	trayIndex?: number; // For all-tray exports
}

interface ExportAllStlsMessage {
	type: 'export-all-stls';
	id: number;
}

type WorkerMessage = GenerateMessage | ExportStlMessage | ExportAllStlsMessage;

// Geometry data to transfer back (raw arrays for BufferGeometry reconstruction)
interface GeometryData {
	positions: Float32Array;
	normals: Float32Array;
}

interface TrayGeometryResult {
	trayId: string;
	name: string;
	color: string;
	geometry: GeometryData;
	placement: TrayPlacement;
	counterStacks: CounterStack[];
	trayLetter: string;
}

interface BoxGeometryResult {
	boxId: string;
	boxName: string;
	boxGeometry: GeometryData | null;
	lidGeometry: GeometryData | null;
	trayGeometries: TrayGeometryResult[];
	boxDimensions: { width: number; depth: number; height: number };
}

interface GenerateResult {
	type: 'generate-result';
	id: number;
	selectedTrayGeometry: GeometryData;
	selectedTrayCounters: CounterStack[];
	allTrayGeometries: TrayGeometryResult[];
	boxGeometry: GeometryData | null;
	lidGeometry: GeometryData | null;
	allBoxGeometries: BoxGeometryResult[];
	error?: string;
}

interface ExportStlResult {
	type: 'export-stl-result';
	id: number;
	data: ArrayBuffer;
	filename: string;
	error?: string;
}

interface StlFile {
	filename: string;
	data: ArrayBuffer;
}

interface ExportAllStlsResult {
	type: 'export-all-stls-result';
	id: number;
	files: StlFile[];
	error?: string;
}

// Cache the last generated JSCAD geometries for STL export
let cachedSelectedTray: Geom3 | null = null;
let cachedBox: Geom3 | null = null;
let cachedLid: Geom3 | null = null;
let cachedAllTrays: { jscadGeom: Geom3; name: string }[] = [];
let cachedBoxName = '';

// Cache for all boxes (for export all)
interface CachedBoxData {
	boxName: string;
	boxGeom: Geom3 | null;
	lidGeom: Geom3 | null;
	trays: { jscadGeom: Geom3; name: string }[];
}
let cachedAllBoxes: CachedBoxData[] = [];

/**
 * Sanitize a string for use in filenames (replace slashes, spaces, etc.)
 */
function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[/\\]+/g, '-') // Replace slashes with dashes
		.replace(/\s+/g, '-') // Replace spaces with dashes
		.replace(/-+/g, '-') // Collapse multiple dashes
		.replace(/^-|-$/g, ''); // Trim leading/trailing dashes
}

/**
 * Create tray geometry based on tray type
 */
function createTrayGeometry(
	tray: Tray,
	cardSizes: CustomCardSize[],
	counterShapes: CounterShape[],
	maxHeight: number,
	spacerHeight: number
): Geom3 {
	if (isCardDividerTray(tray)) {
		return createCardDividerTray(tray.params, cardSizes, tray.name, maxHeight, spacerHeight);
	}
	if (isCardTray(tray)) {
		return createCardDrawTray(tray.params, cardSizes, tray.name, maxHeight, spacerHeight);
	}
	// Default to counter tray
	return createCounterTray(tray.params, counterShapes, tray.name, maxHeight, spacerHeight);
}

/**
 * Get stack positions based on tray type (returns CounterStack[] for compatibility)
 */
function getTrayPositions(
	tray: Tray,
	cardSizes: CustomCardSize[],
	counterShapes: CounterShape[],
	maxHeight: number,
	spacerHeight: number
): CounterStack[] {
	if (isCardDividerTray(tray)) {
		// Convert CardDividerStackPosition to CounterStack format for visualization
		const dividerStacks = getCardDividerPositions(tray.params, cardSizes, maxHeight, spacerHeight);
		return dividerStacks.map((stack) => {
			// For card divider: cards stand on edge
			// vertical orientation: cards stand with long edge up (cardLength is height)
			// horizontal orientation: cards stand with short edge up (cardWidth is height)
			const isVertical = stack.orientation === 'vertical';

			// For vertical: standingHeight=cardLength, frontWidth=cardWidth
			// For horizontal: standingHeight=cardWidth, frontWidth=cardLength
			const standingHeight = isVertical ? stack.cardLength : stack.cardWidth;
			const frontWidth = isVertical ? stack.cardWidth : stack.cardLength;

			// getCardDividerPositions returns CENTER positions, but TrayScene expects:
			// - x to be the LEFT EDGE of the slot
			// - y to be the FRONT EDGE of the slot
			// Convert from center to edge positions
			const edgeX = stack.x - stack.slotWidth / 2;
			const edgeY = stack.y - stack.slotDepth / 2;

			return {
				shape: 'custom' as const,
				customShapeName: stack.label ?? 'Card',
				customBaseShape: 'rectangle' as const,
				x: edgeX,
				y: edgeY,
				z: stack.z,
				// For card dividers with crosswise orientation:
				// Box geometry args = [length, standingHeight, thickness]
				// length = X dimension (front-facing width of card)
				// width = not directly used, but set for consistency
				width: frontWidth,
				length: frontWidth,
				thickness: stack.cardThickness,
				count: stack.count,
				hexPointyTop: false,
				color: stack.color,
				// For card divider: cards are standing on edge
				isEdgeLoaded: true,
				edgeOrientation: 'crosswise' as const,
				slotWidth: stack.slotWidth,
				slotDepth: stack.slotDepth,
				// Mark as card divider so TrayScene uses cardDividerHeight for Y
				isCardDivider: true,
				cardDividerHeight: standingHeight
			};
		});
	}
	if (isCardTray(tray)) {
		// Convert CardStack to CounterStack format for visualization
		const cardStacks = getCardDrawPositions(tray.params, cardSizes, maxHeight, spacerHeight);
		return cardStacks.map((stack) => ({
			shape: 'custom' as const,
			customShapeName: 'Card',
			customBaseShape: 'rectangle' as const,
			x: stack.x,
			y: stack.y,
			z: stack.z,
			width: stack.width,
			length: stack.length,
			thickness: stack.thickness,
			count: stack.count,
			hexPointyTop: false,
			color: stack.color,
			slopeAngle: stack.slopeAngle,
			innerWidth: stack.innerWidth,
			innerLength: stack.innerLength
		}));
	}
	// Default to counter tray
	return getCounterPositions(tray.params, counterShapes, maxHeight, spacerHeight);
}

/**
 * Convert JSCAD geometry to raw position and normal arrays
 */
function jscadToArrays(jscadGeom: Geom3): GeometryData {
	const polygons = geom3.toPolygons(jscadGeom);

	const positions: number[] = [];
	const normals: number[] = [];

	for (const polygon of polygons) {
		const vertices = polygon.vertices;

		if (vertices.length < 3) continue;

		const v0 = vertices[0];
		const v1 = vertices[1];
		const v2 = vertices[2];

		const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
		const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

		const normal = [
			edge1[1] * edge2[2] - edge1[2] * edge2[1],
			edge1[2] * edge2[0] - edge1[0] * edge2[2],
			edge1[0] * edge2[1] - edge1[1] * edge2[0]
		];

		const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
		if (len > 0) {
			normal[0] /= len;
			normal[1] /= len;
			normal[2] /= len;
		}

		// Triangulate the polygon (fan triangulation)
		for (let i = 1; i < vertices.length - 1; i++) {
			positions.push(v0[0], v0[1], v0[2]);
			positions.push(vertices[i][0], vertices[i][1], vertices[i][2]);
			positions.push(vertices[i + 1][0], vertices[i + 1][1], vertices[i + 1][2]);

			normals.push(normal[0], normal[1], normal[2]);
			normals.push(normal[0], normal[1], normal[2]);
			normals.push(normal[0], normal[1], normal[2]);
		}
	}

	return {
		positions: new Float32Array(positions),
		normals: new Float32Array(normals)
	};
}

/**
 * Generate all geometries for the project
 */
function handleGenerate(msg: GenerateMessage): void {
	const { id, project, selectedBoxId, selectedTrayId } = msg;

	try {
		const selectedBoxIndex = project.boxes.findIndex((b) => b.id === selectedBoxId);
		const box = selectedBoxIndex >= 0 ? project.boxes[selectedBoxIndex] : undefined;
		const tray = box?.trays.find((t) => t.id === selectedTrayId);

		if (!box || !tray) {
			self.postMessage({
				type: 'generate-result',
				id,
				error: 'No box or tray selected'
			} as GenerateResult);
			return;
		}

		// Validate custom dimensions
		const validation = validateCustomDimensions(box);
		if (!validation.valid) {
			self.postMessage({
				type: 'generate-result',
				id,
				error: validation.errors.join('; ')
			} as GenerateResult);
			return;
		}

		// Get card sizes and counter shapes from project level (global)
		const cardSizes = project.cardSizes ?? [];
		const counterShapes = project.counterShapes ?? [];

		// Generate all trays with their placements for selected box
		const placements = arrangeTrays(box.trays, {
			customBoxWidth: box.customWidth,
			wallThickness: box.wallThickness,
			tolerance: box.tolerance,
			cardSizes,
			counterShapes
		});

		const spacerInfo = calculateTraySpacers(box, cardSizes, counterShapes);
		const maxHeight = Math.max(...placements.map((p) => p.dimensions.height));

		// Find spacer for selected tray
		const selectedSpacer = spacerInfo.find((s) => s.trayId === tray.id);
		const selectedSpacerHeight = selectedSpacer?.floorSpacerHeight ?? 0;

		// Generate selected tray
		cachedSelectedTray = createTrayGeometry(
			tray,
			cardSizes,
			counterShapes,
			maxHeight,
			selectedSpacerHeight
		);
		const selectedTrayGeometry = jscadToArrays(cachedSelectedTray);
		const selectedTrayCounters = getTrayPositions(
			tray,
			cardSizes,
			counterShapes,
			maxHeight,
			selectedSpacerHeight
		);

		// Generate all trays for selected box
		cachedAllTrays = [];
		const allTrayGeometries: TrayGeometryResult[] = placements.map((placement, index) => {
			const spacer = spacerInfo.find((s) => s.trayId === placement.tray.id);
			const spacerHeight = spacer?.floorSpacerHeight ?? 0;
			const jscadGeom = createTrayGeometry(
				placement.tray,
				cardSizes,
				counterShapes,
				maxHeight,
				spacerHeight
			);

			cachedAllTrays.push({ jscadGeom, name: placement.tray.name });

			return {
				trayId: placement.tray.id,
				name: placement.tray.name,
				color: placement.tray.color,
				geometry: jscadToArrays(jscadGeom),
				placement,
				counterStacks: getTrayPositions(
					placement.tray,
					cardSizes,
					counterShapes,
					maxHeight,
					spacerHeight
				),
				trayLetter: getTrayLetter(getCumulativeTrayIndex(project.boxes, selectedBoxIndex, index))
			};
		});

		// Generate box and lid
		cachedBox = createBoxWithLidGrooves(box, cardSizes, counterShapes);
		cachedLid = createLid(box, cardSizes, counterShapes);
		cachedBoxName = box.name;

		const boxGeometry = cachedBox ? jscadToArrays(cachedBox) : null;
		const lidGeometry = cachedLid ? jscadToArrays(cachedLid) : null;

		// Generate geometries for ALL boxes (for all-no-lid view) and cache JSCAD for STL export
		cachedAllBoxes = [];
		const allBoxGeometries: BoxGeometryResult[] = project.boxes.map((projectBox, boxIndex) => {
			const boxValidation = validateCustomDimensions(projectBox);
			if (!boxValidation.valid) {
				console.warn(`Box "${projectBox.name}" validation failed:`, boxValidation.errors);
			}

			const boxJscad = createBoxWithLidGrooves(projectBox, cardSizes, counterShapes);
			const boxBufferGeom = boxJscad ? jscadToArrays(boxJscad) : null;
			const lidJscad = createLid(projectBox, cardSizes, counterShapes);
			const lidBufferGeom = lidJscad ? jscadToArrays(lidJscad) : null;
			const boxDims = getBoxDimensions(projectBox);

			// Use the global cardSizes and counterShapes
			const boxPlacements = arrangeTrays(projectBox.trays, {
				customBoxWidth: projectBox.customWidth,
				wallThickness: projectBox.wallThickness,
				tolerance: projectBox.tolerance,
				cardSizes,
				counterShapes
			});

			const boxSpacerInfo = calculateTraySpacers(projectBox, cardSizes, counterShapes);
			const boxMaxHeight = Math.max(...boxPlacements.map((p) => p.dimensions.height), 0);

			// Cache JSCAD geometries for this box's trays
			const cachedTraysForBox: { jscadGeom: Geom3; name: string }[] = [];

			const trayGeoms: TrayGeometryResult[] = boxPlacements.map((placement, index) => {
				const spacer = boxSpacerInfo.find((s) => s.trayId === placement.tray.id);
				const spacerHeight = spacer?.floorSpacerHeight ?? 0;
				const jscadGeom = createTrayGeometry(
					placement.tray,
					cardSizes,
					counterShapes,
					boxMaxHeight,
					spacerHeight
				);

				// Cache for STL export
				cachedTraysForBox.push({ jscadGeom, name: placement.tray.name });

				return {
					trayId: placement.tray.id,
					name: placement.tray.name,
					color: placement.tray.color,
					geometry: jscadToArrays(jscadGeom),
					placement,
					counterStacks: getTrayPositions(
						placement.tray,
						cardSizes,
						counterShapes,
						boxMaxHeight,
						spacerHeight
					),
					trayLetter: getTrayLetter(getCumulativeTrayIndex(project.boxes, boxIndex, index))
				};
			});

			// Cache this box's JSCAD geometries for export
			cachedAllBoxes.push({
				boxName: projectBox.name,
				boxGeom: boxJscad,
				lidGeom: lidJscad,
				trays: cachedTraysForBox
			});

			return {
				boxId: projectBox.id,
				boxName: projectBox.name,
				boxGeometry: boxBufferGeom,
				lidGeometry: lidBufferGeom,
				trayGeometries: trayGeoms,
				boxDimensions: boxDims ?? { width: 0, depth: 0, height: 0 }
			};
		});

		// Collect all transferable arrays
		const transferables: Transferable[] = [
			selectedTrayGeometry.positions.buffer as ArrayBuffer,
			selectedTrayGeometry.normals.buffer as ArrayBuffer
		];

		for (const tray of allTrayGeometries) {
			transferables.push(tray.geometry.positions.buffer as ArrayBuffer);
			transferables.push(tray.geometry.normals.buffer as ArrayBuffer);
		}

		if (boxGeometry) {
			transferables.push(boxGeometry.positions.buffer as ArrayBuffer);
			transferables.push(boxGeometry.normals.buffer as ArrayBuffer);
		}

		if (lidGeometry) {
			transferables.push(lidGeometry.positions.buffer as ArrayBuffer);
			transferables.push(lidGeometry.normals.buffer as ArrayBuffer);
		}

		for (const boxData of allBoxGeometries) {
			if (boxData.boxGeometry) {
				transferables.push(boxData.boxGeometry.positions.buffer as ArrayBuffer);
				transferables.push(boxData.boxGeometry.normals.buffer as ArrayBuffer);
			}
			if (boxData.lidGeometry) {
				transferables.push(boxData.lidGeometry.positions.buffer as ArrayBuffer);
				transferables.push(boxData.lidGeometry.normals.buffer as ArrayBuffer);
			}
			for (const tray of boxData.trayGeometries) {
				transferables.push(tray.geometry.positions.buffer as ArrayBuffer);
				transferables.push(tray.geometry.normals.buffer as ArrayBuffer);
			}
		}

		const result: GenerateResult = {
			type: 'generate-result',
			id,
			selectedTrayGeometry,
			selectedTrayCounters,
			allTrayGeometries,
			boxGeometry,
			lidGeometry,
			allBoxGeometries
		};

		self.postMessage(result, { transfer: transferables });
	} catch (e) {
		self.postMessage({
			type: 'generate-result',
			id,
			error: e instanceof Error ? e.message : 'Unknown error'
		} as GenerateResult);
	}
}

/**
 * Export geometry to STL
 */
function handleExportStl(msg: ExportStlMessage): void {
	const { id, target, trayIndex } = msg;

	try {
		let geom: Geom3 | null = null;
		let filename = 'export.stl';

		switch (target) {
			case 'tray':
				geom = cachedSelectedTray;
				filename = 'tray.stl';
				break;
			case 'box':
				geom = cachedBox;
				filename = `${sanitizeFilename(cachedBoxName)}-box.stl`;
				break;
			case 'lid':
				geom = cachedLid;
				filename = `${sanitizeFilename(cachedBoxName)}-lid.stl`;
				break;
			case 'all-tray':
				if (trayIndex !== undefined && cachedAllTrays[trayIndex]) {
					geom = cachedAllTrays[trayIndex].jscadGeom;
					filename = `${sanitizeFilename(cachedBoxName)}-${sanitizeFilename(cachedAllTrays[trayIndex].name)}.stl`;
				}
				break;
		}

		if (!geom) {
			self.postMessage({
				type: 'export-stl-result',
				id,
				error: 'No geometry available for export'
			} as ExportStlResult);
			return;
		}

		const stlData = stlSerializer.serialize({ binary: true }, geom);
		const blob = new Blob(stlData, { type: 'application/octet-stream' });

		// Convert blob to ArrayBuffer
		blob
			.arrayBuffer()
			.then((buffer) => {
				self.postMessage(
					{
						type: 'export-stl-result',
						id,
						data: buffer,
						filename
					} as ExportStlResult,
					{ transfer: [buffer] }
				);
			})
			.catch((e) => {
				self.postMessage({
					type: 'export-stl-result',
					id,
					error: e instanceof Error ? e.message : 'Failed to convert STL data'
				} as ExportStlResult);
			});
	} catch (e) {
		self.postMessage({
			type: 'export-stl-result',
			id,
			error: e instanceof Error ? e.message : 'Unknown error'
		} as ExportStlResult);
	}
}

/**
 * Export all STLs for all boxes
 */
async function handleExportAllStls(msg: ExportAllStlsMessage): Promise<void> {
	const { id } = msg;

	try {
		if (cachedAllBoxes.length === 0) {
			self.postMessage({
				type: 'export-all-stls-result',
				id,
				files: [],
				error: 'No geometry available for export. Please generate geometry first.'
			} as ExportAllStlsResult);
			return;
		}

		const files: StlFile[] = [];
		const transferables: ArrayBuffer[] = [];

		for (const boxData of cachedAllBoxes) {
			const boxPrefix = sanitizeFilename(boxData.boxName);

			// Export box
			if (boxData.boxGeom) {
				const stlData = stlSerializer.serialize({ binary: true }, boxData.boxGeom);
				const blob = new Blob(stlData, { type: 'application/octet-stream' });
				const buffer = await blob.arrayBuffer();
				files.push({ filename: `${boxPrefix}-box.stl`, data: buffer });
				transferables.push(buffer);
			}

			// Export lid
			if (boxData.lidGeom) {
				const stlData = stlSerializer.serialize({ binary: true }, boxData.lidGeom);
				const blob = new Blob(stlData, { type: 'application/octet-stream' });
				const buffer = await blob.arrayBuffer();
				files.push({ filename: `${boxPrefix}-lid.stl`, data: buffer });
				transferables.push(buffer);
			}

			// Export trays
			for (const tray of boxData.trays) {
				const stlData = stlSerializer.serialize({ binary: true }, tray.jscadGeom);
				const blob = new Blob(stlData, { type: 'application/octet-stream' });
				const buffer = await blob.arrayBuffer();
				const trayName = sanitizeFilename(tray.name);
				files.push({ filename: `${boxPrefix}-${trayName}.stl`, data: buffer });
				transferables.push(buffer);
			}
		}

		self.postMessage(
			{
				type: 'export-all-stls-result',
				id,
				files
			} as ExportAllStlsResult,
			{ transfer: transferables }
		);
	} catch (e) {
		self.postMessage({
			type: 'export-all-stls-result',
			id,
			files: [],
			error: e instanceof Error ? e.message : 'Unknown error during export'
		} as ExportAllStlsResult);
	}
}

// Message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
	const msg = event.data;

	switch (msg.type) {
		case 'generate':
			handleGenerate(msg);
			break;
		case 'export-stl':
			handleExportStl(msg);
			break;
		case 'export-all-stls':
			handleExportAllStls(msg);
			break;
	}
};
