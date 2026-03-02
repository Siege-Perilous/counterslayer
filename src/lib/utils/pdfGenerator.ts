import { jsPDF } from 'jspdf';
import { arrangeTrays, getCustomCardSizesFromBox } from '$lib/models/box';
import {
	getCounterPositions,
	type CounterStack,
	type TopLoadedStackDef,
	type EdgeLoadedStackDef
} from '$lib/models/counterTray';
import { getCardPositions } from '$lib/models/cardTray';
import type { Box, Project } from '$lib/types/project';
import { isCardTray } from '$lib/types/project';

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

// Screenshot data structure for each tray
export interface TrayScreenshot {
	boxIndex: number;
	trayIndex: number;
	trayLetter: string;
	dataUrl: string;
}

// PDF data interfaces
export interface PdfStackData {
	refCode: string;
	label: string;
	count: number;
	shape: 'square' | 'hex' | 'circle' | 'triangle' | 'custom';
	x: number; // Center X position in tray
	y: number; // Center Y position in tray
	width: number; // X dimension of the counter
	length: number; // Y dimension of the counter
}

export interface PdfTrayData {
	letter: string; // Tray letter prefix (A, B, C...)
	name: string;
	x: number; // Position in box
	y: number;
	width: number;
	depth: number;
	stacks: PdfStackData[];
}

export interface PdfBoxData {
	boxIndex: number;
	name: string;
	width: number;
	depth: number;
	trays: PdfTrayData[];
}

export interface PdfData {
	projectName: string;
	boxes: PdfBoxData[];
}

// Generate stack label from definition
function generateStackLabel(shapeRef: string, count: number, customLabel?: string): string {
	if (customLabel) return customLabel;

	// Generate default label from shape and count
	const shapeName = shapeRef.startsWith('custom:') ? shapeRef.substring(7) : shapeRef;
	return `${shapeName} x${count}`;
}

// Match counter position to stack definition and get label
function findStackLabel(
	counterStack: CounterStack,
	topLoadedStacks: TopLoadedStackDef[],
	edgeLoadedStacks: EdgeLoadedStackDef[],
	usedTopIndices: Set<number>,
	usedEdgeIndices: Set<number>
): { label: string; usedIndex: number; isEdge: boolean } {
	const shapeRef =
		counterStack.shape === 'custom' ? `custom:${counterStack.customShapeName}` : counterStack.shape;

	if (counterStack.isEdgeLoaded) {
		// Match against edge-loaded stacks
		for (let i = 0; i < edgeLoadedStacks.length; i++) {
			if (usedEdgeIndices.has(i)) continue;
			const [defShape, defCount, , defLabel] = edgeLoadedStacks[i];
			if (defCount === counterStack.count && defShape === shapeRef) {
				usedEdgeIndices.add(i);
				return {
					label: generateStackLabel(shapeRef, counterStack.count, defLabel),
					usedIndex: i,
					isEdge: true
				};
			}
		}
	} else {
		// Match against top-loaded stacks
		for (let i = 0; i < topLoadedStacks.length; i++) {
			if (usedTopIndices.has(i)) continue;
			const [defShape, defCount, defLabel] = topLoadedStacks[i];
			if (defCount === counterStack.count && defShape === shapeRef) {
				usedTopIndices.add(i);
				return {
					label: generateStackLabel(shapeRef, counterStack.count, defLabel),
					usedIndex: i,
					isEdge: false
				};
			}
		}
	}

	// No match found, generate default label
	return {
		label: generateStackLabel(shapeRef, counterStack.count),
		usedIndex: -1,
		isEdge: counterStack.isEdgeLoaded ?? false
	};
}

// Extract PDF data from project
export function extractPdfData(project: Project): PdfData {
	const boxes: PdfBoxData[] = [];

	for (let boxIndex = 0; boxIndex < project.boxes.length; boxIndex++) {
		const box = project.boxes[boxIndex];
		const customCardSizes = getCustomCardSizesFromBox(box);

		// Get tray placements
		const placements = arrangeTrays(box.trays, {
			customBoxWidth: box.customWidth,
			wallThickness: box.wallThickness,
			tolerance: box.tolerance,
			customCardSizes
		});

		// Calculate box dimensions
		let maxX = 0;
		let maxY = 0;
		for (const p of placements) {
			maxX = Math.max(maxX, p.x + p.dimensions.width);
			maxY = Math.max(maxY, p.y + p.dimensions.depth);
		}

		const trays: PdfTrayData[] = [];

		for (let trayIndex = 0; trayIndex < placements.length; trayIndex++) {
			const placement = placements[trayIndex];
			const tray = placement.tray;
			const trayLetter = getTrayLetter(getCumulativeTrayIndex(project.boxes, boxIndex, trayIndex));

			// Get counter positions based on tray type
			let counterPositions: CounterStack[];
			let topLoadedStacks: TopLoadedStackDef[] = [];
			let edgeLoadedStacks: EdgeLoadedStackDef[] = [];

			if (isCardTray(tray)) {
				// Convert card positions to CounterStack format for PDF generation
				const cardStacks = getCardPositions(tray.params, customCardSizes);
				counterPositions = cardStacks.map((stack) => ({
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
					color: stack.color
				}));
			} else {
				counterPositions = getCounterPositions(tray.params);
				topLoadedStacks = tray.params.topLoadedStacks || [];
				edgeLoadedStacks = tray.params.edgeLoadedStacks || [];
			}

			const stacks: PdfStackData[] = [];

			// Track which stack definitions have been used
			const usedTopIndices = new Set<number>();
			const usedEdgeIndices = new Set<number>();

			// Process all counter positions in order
			let stackIndex = 1;
			for (const counterStack of counterPositions) {
				const { label } = findStackLabel(
					counterStack,
					topLoadedStacks,
					edgeLoadedStacks,
					usedTopIndices,
					usedEdgeIndices
				);

				// Calculate center position
				let centerX: number;
				let centerY: number;

				if (counterStack.isEdgeLoaded) {
					// For edge-loaded, position is the slot start, get center
					centerX = counterStack.x + (counterStack.slotWidth ?? 0) / 2;
					centerY = counterStack.y + (counterStack.slotDepth ?? 0) / 2;
				} else {
					// For top-loaded, position is already the center
					centerX = counterStack.x;
					centerY = counterStack.y;
				}

				stacks.push({
					refCode: `${trayLetter}${stackIndex}`,
					label,
					count: counterStack.count,
					shape: counterStack.shape,
					x: centerX,
					y: centerY,
					width: counterStack.width,
					length: counterStack.length
				});
				stackIndex++;
			}

			trays.push({
				letter: trayLetter,
				name: tray.name,
				x: placement.x,
				y: placement.y,
				width: placement.dimensions.width,
				depth: placement.dimensions.depth,
				stacks
			});
		}

		boxes.push({
			boxIndex,
			name: box.name,
			width: maxX,
			depth: maxY,
			trays
		});
	}

	return {
		projectName: 'Counter Tray Project',
		boxes
	};
}

// A4 page dimensions
const PAGE_WIDTH = 210; // mm
const PAGE_HEIGHT = 297; // mm
const MARGIN_TOP = 15;
const MARGIN_BOTTOM = 15;
const MARGIN_LEFT = 15;
const MARGIN_RIGHT = 15;
const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Screenshot image dimensions for PDF (in mm) - 16:9 aspect ratio
const SCREENSHOT_WIDTH = 160;
const SCREENSHOT_HEIGHT = 90;

// Generate PDF with isometric screenshots
export async function generatePdfWithScreenshots(
	data: PdfData,
	screenshots: TrayScreenshot[]
): Promise<void> {
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	});

	let currentY = MARGIN_TOP;
	let isFirstBox = true;

	// Group screenshots by box and tray
	const screenshotMap = new Map<string, string>();
	for (const ss of screenshots) {
		screenshotMap.set(`${ss.boxIndex}-${ss.trayIndex}`, ss.dataUrl);
	}

	for (const box of data.boxes) {
		const titleHeight = 10;
		const trayNameHeight = 8;
		const screenshotMargin = 5;
		const tableHeaderHeight = 8;
		const tableRowHeight = 6;
		const traySpacing = 12;
		const boxSpacing = 15;

		// Each tray gets its own section with screenshot above table
		for (let trayIdx = 0; trayIdx < box.trays.length; trayIdx++) {
			const tray = box.trays[trayIdx];
			const screenshotKey = `${box.boxIndex}-${trayIdx}`;
			const screenshot = screenshotMap.get(screenshotKey);

			// Calculate height needed for this tray section (screenshot + table stacked vertically)
			const trayTableHeight = tableHeaderHeight + tray.stacks.length * tableRowHeight;
			const sectionHeight =
				(trayIdx === 0 ? titleHeight : 0) +
				trayNameHeight +
				SCREENSHOT_HEIGHT +
				screenshotMargin +
				trayTableHeight +
				traySpacing;

			// Check if we need a new page
			if (!isFirstBox && currentY + sectionHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
				doc.addPage();
				currentY = MARGIN_TOP;
				isFirstBox = true;
			}

			// Draw box title only for first tray or after page break
			if (trayIdx === 0 || currentY === MARGIN_TOP) {
				doc.setFontSize(14);
				doc.setFont('courier', 'bold');
				doc.text(`Box ${box.boxIndex + 1}: ${box.name}`, MARGIN_LEFT, currentY);
				currentY += titleHeight;
				isFirstBox = false;
			}

			// Draw tray name
			doc.setFontSize(11);
			doc.setFont('courier', 'bold');
			doc.text(tray.name, MARGIN_LEFT, currentY);
			currentY += trayNameHeight;

			// Embed screenshot (centered)
			const screenshotX = MARGIN_LEFT + (USABLE_WIDTH - SCREENSHOT_WIDTH) / 2;
			if (screenshot) {
				doc.addImage(screenshot, 'PNG', screenshotX, currentY, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT);
			} else {
				doc.setDrawColor(200, 200, 200);
				doc.setFillColor(245, 245, 245);
				doc.rect(screenshotX, currentY, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, 'FD');
				doc.setFontSize(8);
				doc.setFont('courier', 'normal');
				doc.setTextColor(150, 150, 150);
				doc.text(
					'No preview',
					screenshotX + SCREENSHOT_WIDTH / 2,
					currentY + SCREENSHOT_HEIGHT / 2,
					{ align: 'center' }
				);
				doc.setTextColor(0, 0, 0);
			}
			currentY += SCREENSHOT_HEIGHT + screenshotMargin;

			// Draw reference table below screenshot
			const tableX = MARGIN_LEFT;
			const colRefEnd = tableX + 20;
			const colCountEnd = tableX + 45;
			const colStack = tableX + 50;
			const tableWidth = USABLE_WIDTH;

			// Table header
			doc.setFontSize(10);
			doc.setFont('courier', 'bold');
			doc.text('Ref', colRefEnd, currentY, { align: 'right' });
			doc.text('Count', colCountEnd, currentY, { align: 'right' });
			doc.text('Stack Name', colStack, currentY);
			currentY += 2;

			// Header line
			doc.setDrawColor(0, 0, 0);
			doc.setLineWidth(0.5);
			doc.line(tableX, currentY, tableX + tableWidth, currentY);
			currentY += tableHeaderHeight - 2;

			// Table rows
			let rowIndex = 0;
			for (const stack of tray.stacks) {
				// Check if we need a new page mid-table
				if (currentY + tableRowHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
					doc.addPage();
					currentY = MARGIN_TOP;

					// Redraw table header on new page
					doc.setFont('courier', 'bold');
					doc.text('Ref', colRefEnd, currentY, { align: 'right' });
					doc.text('Count', colCountEnd, currentY, { align: 'right' });
					doc.text('Stack Name', colStack, currentY);
					currentY += 2;
					doc.line(tableX, currentY, tableX + tableWidth, currentY);
					currentY += tableHeaderHeight - 2;
					rowIndex = 0;
				}

				// Zebra stripe
				if (rowIndex % 2 === 1) {
					doc.setFillColor(245, 245, 245);
					doc.rect(tableX, currentY - 4, tableWidth, tableRowHeight, 'F');
				}

				doc.setFont('courier', 'normal');
				doc.text(stack.refCode, colRefEnd, currentY, { align: 'right' });
				doc.text(stack.count.toString(), colCountEnd, currentY, { align: 'right' });
				doc.text(stack.label, colStack, currentY);

				currentY += tableRowHeight;
				rowIndex++;
			}

			currentY += traySpacing;
		}

		currentY += boxSpacing;
	}

	// Generate filename from project name
	const filename = `${data.projectName.toLowerCase().replace(/\s+/g, '-')}-reference.pdf`;
	doc.save(filename);
}

// Generate PDF from extracted data (legacy SVG approach - kept for fallback)
export async function generatePdf(data: PdfData): Promise<void> {
	// Dynamic import to handle ESM/CommonJS compatibility
	const { generateBoxDiagramSvg, getBoxDiagramDimensions } = await import('./svgDiagramGenerator');
	const svg2pdfModule = await import('svg2pdf.js');
	const svg2pdf = svg2pdfModule.svg2pdf;

	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: 'a4'
	});

	let currentY = MARGIN_TOP;
	let isFirstBox = true;

	for (const box of data.boxes) {
		// Calculate diagram scale to fit available width
		const maxDiagramWidth = USABLE_WIDTH;
		const maxDiagramHeight = 70;
		const scale = Math.min(maxDiagramWidth / box.width, maxDiagramHeight / box.depth);

		// Get actual SVG dimensions (which account for normalization and label space)
		const diagramDims = getBoxDiagramDimensions(box, scale);
		const diagramWidth = diagramDims.width;
		const diagramHeight = diagramDims.height;

		// Calculate total content height for this box
		const titleHeight = 10;
		const diagramMargin = 10;
		const tableHeaderHeight = 8;
		const tableRowHeight = 6;
		const totalStacks = box.trays.reduce((sum, t) => sum + t.stacks.length, 0);
		const tableHeight = tableHeaderHeight + totalStacks * tableRowHeight;
		const boxSpacing = 15;

		const contentHeight = titleHeight + diagramHeight + diagramMargin + tableHeight + boxSpacing;

		// Check if we need a new page
		if (!isFirstBox && currentY + contentHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
			doc.addPage();
			currentY = MARGIN_TOP;
		}
		isFirstBox = false;

		// Draw box title
		doc.setFontSize(14);
		doc.setFont('courier', 'bold');
		doc.text(`Box ${box.boxIndex + 1}: ${box.name}`, MARGIN_LEFT, currentY);
		currentY += titleHeight;

		// Generate and embed SVG diagram
		const svgString = generateBoxDiagramSvg(box, scale);
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
		const svgElement = svgDoc.documentElement;

		// Embed SVG into PDF at its actual size
		await svg2pdf(svgElement, doc, {
			x: MARGIN_LEFT,
			y: currentY,
			width: diagramWidth,
			height: diagramHeight
		});
		currentY += diagramHeight + diagramMargin;

		// Table column positions: Ref, Count, Stack Name
		const colRefEnd = MARGIN_LEFT + 15; // Right edge for Ref column
		const colCountEnd = MARGIN_LEFT + 35; // Right edge for Count column
		const colStack = MARGIN_LEFT + 40; // Left edge for Stack Name
		const tableWidth = 165;
		const trayTitleHeight = 8;

		// Draw a table for each tray
		for (const tray of box.trays) {
			// Check if we need a new page for this tray's table
			const trayTableHeight =
				trayTitleHeight + tableHeaderHeight + tray.stacks.length * tableRowHeight;
			if (currentY + trayTableHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
				doc.addPage();
				currentY = MARGIN_TOP;
			}

			// Tray title
			doc.setFontSize(11);
			doc.setFont('courier', 'bold');
			doc.text(tray.name, MARGIN_LEFT, currentY);
			currentY += trayTitleHeight;

			// Table header
			doc.setFontSize(10);
			doc.setFont('courier', 'bold');
			doc.text('Ref', colRefEnd, currentY, { align: 'right' });
			doc.text('Count', colCountEnd, currentY, { align: 'right' });
			doc.text('Stack Name', colStack, currentY);
			currentY += 2;

			// Header line
			doc.setDrawColor(0, 0, 0);
			doc.setLineWidth(0.5);
			doc.line(MARGIN_LEFT, currentY, MARGIN_LEFT + tableWidth, currentY);
			currentY += tableHeaderHeight - 2;

			// Table rows with zebra striping
			let rowIndex = 0;
			for (const stack of tray.stacks) {
				// Check if we need a new page for table rows
				if (currentY + tableRowHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
					doc.addPage();
					currentY = MARGIN_TOP;

					// Redraw table header on new page
					doc.setFont('courier', 'bold');
					doc.text('Ref', colRefEnd, currentY, { align: 'right' });
					doc.text('Count', colCountEnd, currentY, { align: 'right' });
					doc.text('Stack Name', colStack, currentY);
					currentY += 2;
					doc.line(MARGIN_LEFT, currentY, MARGIN_LEFT + tableWidth, currentY);
					currentY += tableHeaderHeight - 2;
					rowIndex = 0;
				}

				// Zebra stripe
				if (rowIndex % 2 === 1) {
					doc.setFillColor(245, 245, 245);
					doc.rect(MARGIN_LEFT, currentY - 4, tableWidth, tableRowHeight, 'F');
				}

				// Row content
				doc.setFont('courier', 'normal');
				doc.text(stack.refCode, colRefEnd, currentY, { align: 'right' });
				doc.text(stack.count.toString(), colCountEnd, currentY, { align: 'right' });
				doc.text(stack.label, colStack, currentY);

				currentY += tableRowHeight;
				rowIndex++;
			}

			currentY += 8; // Space between tray tables
		}

		currentY += boxSpacing;
	}

	// Generate filename from project name
	const filename = `${data.projectName.toLowerCase().replace(/\s+/g, '-')}-reference.pdf`;
	doc.save(filename);
}

// Main export function to be called from UI (legacy SVG approach)
export async function exportPdfReference(project: Project): Promise<void> {
	const data = extractPdfData(project);
	await generatePdf(data);
}

// Export PDF with screenshots
export async function exportPdfWithScreenshots(
	project: Project,
	screenshots: TrayScreenshot[]
): Promise<void> {
	const data = extractPdfData(project);
	await generatePdfWithScreenshots(data, screenshots);
}
