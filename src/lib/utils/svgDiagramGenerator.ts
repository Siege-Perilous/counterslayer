import type { PdfBoxData } from './pdfGenerator';

const LABEL_HEIGHT = 8; // Space above each tray row for labels
const TRAY_GAP = 8; // Vertical gap between tray rows
const CELL_PADDING = 0; // Padding inside each stack cell

// Generate top-view SVG diagram for a box
export function generateBoxDiagramSvg(box: PdfBoxData, scale: number): string {
	// Find min x/y to normalize positions to start at 0
	const minX = Math.min(...box.trays.map((t) => t.x));
	const minY = Math.min(...box.trays.map((t) => t.y));

	// Calculate actual content bounds
	const maxX = Math.max(...box.trays.map((t) => t.x + t.width)) - minX;
	const maxY = Math.max(...box.trays.map((t) => t.y + t.depth)) - minY;

	const contentWidth = maxX * scale;

	// Find unique Y positions (tray rows) to add label space and gaps
	const trayRows = [...new Set(box.trays.map((t) => t.y - minY))].sort((a, b) => a - b);
	const labelSpace = trayRows.length * LABEL_HEIGHT;
	const gapSpace = (trayRows.length - 1) * TRAY_GAP;

	const contentHeight = maxY * scale + labelSpace + gapSpace;
	const width = contentWidth + 1;
	const height = contentHeight + 1;

	const fontSize = 3;
	const trayLabelFontSize = 6;

	let svgContent = '';

	// Calculate Y offset for each row (to make room for labels and gaps)
	const getYOffset = (trayY: number): number => {
		const normalizedY = trayY - minY;
		const rowIndex = trayRows.indexOf(normalizedY);
		const labelOffset = (rowIndex + 1) * LABEL_HEIGHT;
		const gapOffset = rowIndex * TRAY_GAP;
		return labelOffset + gapOffset;
	};

	// Draw trays
	for (const tray of box.trays) {
		const yOffset = getYOffset(tray.y);
		const trayX = (tray.x - minX) * scale;
		const trayY = (tray.y - minY) * scale + yOffset;
		const trayWidth = tray.width * scale;
		const trayHeight = tray.depth * scale;

		// Tray fill (black background)
		svgContent += `<rect x="${trayX}" y="${trayY}" width="${trayWidth}" height="${trayHeight}" fill="#000"/>`;

		// Tray name label above the tray
		const labelX = trayX;
		const labelY = trayY - 2;
		svgContent += `<text x="${labelX}" y="${labelY}" font-family="Courier, monospace" font-size="${trayLabelFontSize}" fill="#000">${escapeXml(tray.name)}</text>`;

		// Draw stack markers (flip Y within tray for top-down view)
		for (const stack of tray.stacks) {
			const markerX = (tray.x - minX + stack.x) * scale;
			// Flip Y so front of tray (low Y) appears at bottom of diagram
			const flippedStackY = tray.depth - stack.y;
			const markerY = (tray.y - minY + flippedStackY) * scale + yOffset;

			// Use actual stack dimensions
			const stackWidth = stack.width * scale;
			const stackLength = stack.length * scale;

			svgContent += drawShapeMarker(
				stack.shape,
				markerX,
				markerY,
				stackWidth,
				stackLength,
				CELL_PADDING
			);
			svgContent += `<text x="${markerX}" y="${markerY + fontSize / 3}" font-family="Courier, monospace" font-size="${fontSize}" font-weight="bold" fill="#000" text-anchor="middle">${escapeXml(stack.refCode)}</text>`;
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgContent}</svg>`;
}

// Get the actual dimensions of the diagram for a box
export function getBoxDiagramDimensions(
	box: PdfBoxData,
	scale: number
): { width: number; height: number } {
	const minX = Math.min(...box.trays.map((t) => t.x));
	const minY = Math.min(...box.trays.map((t) => t.y));
	const maxX = Math.max(...box.trays.map((t) => t.x + t.width)) - minX;
	const maxY = Math.max(...box.trays.map((t) => t.y + t.depth)) - minY;

	const trayRows = [...new Set(box.trays.map((t) => t.y - minY))].sort((a, b) => a - b);
	const labelSpace = trayRows.length * LABEL_HEIGHT;
	const gapSpace = (trayRows.length - 1) * TRAY_GAP;

	return {
		width: maxX * scale + 1,
		height: maxY * scale + labelSpace + gapSpace + 1
	};
}

function drawShapeMarker(
	shape: 'square' | 'hex' | 'circle' | 'custom',
	cx: number,
	cy: number,
	width: number,
	length: number,
	padding: number = 0
): string {
	// Apply padding to shrink the shape while keeping it centered
	const paddedWidth = width - padding * 2;
	const paddedLength = length - padding * 2;
	const halfW = paddedWidth / 2;
	const halfL = paddedLength / 2;

	switch (shape) {
		case 'square':
		case 'custom':
			return `<rect x="${cx - halfW}" y="${cy - halfL}" width="${paddedWidth}" height="${paddedLength}" fill="#fff"/>`;
		case 'hex': {
			// Use the smaller dimension for hex radius (flat-to-flat)
			const hexRadius = Math.min(halfW, halfL);
			return `<polygon points="${generateHexagonPoints(cx, cy, hexRadius)}" fill="#fff"/>`;
		}
		case 'circle':
		default: {
			const circleRadius = Math.min(halfW, halfL);
			return `<circle cx="${cx}" cy="${cy}" r="${circleRadius}" fill="#fff"/>`;
		}
	}
}

function generateHexagonPoints(cx: number, cy: number, size: number): string {
	const points: string[] = [];
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
	}
	return points.join(' ');
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
