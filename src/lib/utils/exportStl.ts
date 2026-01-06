import stlSerializer from '@jscad/stl-serializer';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

export function exportStl(geometry: Geom3, filename: string = 'counter-tray.stl') {
	// Serialize to binary STL (handle both ESM and CommonJS module formats)
	const serialize = stlSerializer.serialize || (stlSerializer as unknown as { default: typeof stlSerializer }).default?.serialize;
	const rawData = serialize({ binary: true }, geometry);

	// Convert to blob
	const blob = new Blob(rawData, { type: 'application/octet-stream' });

	// Trigger download
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
