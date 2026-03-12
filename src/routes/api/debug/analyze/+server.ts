import { json } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { RequestHandler } from './$types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
const analysisDir = join(projectRoot, 'mesh-analysis');

interface ComputedLayout {
  timestamp: string;
  selectedBoxId: string | null;
  selectedTrayId: string;
  boxes: Array<{
    boxId: string;
    boxName: string;
    exterior: { width: number; depth: number; height: number };
    interior: { width: number; depth: number; height: number };
    trays: Array<{
      trayId: string;
      name: string;
      letter: string;
      color: string;
      x: number;
      y: number;
      width: number;
      depth: number;
      height: number;
      rotated: boolean;
      flushFront: boolean;
      flushLeft: boolean;
      flushBack: boolean;
      flushRight: boolean;
      stacks: unknown[];
    }>;
  }>;
  looseTrays: Array<{
    trayId: string;
    layerId: string;
    name: string;
    letter: string;
    color: string;
    width: number;
    depth: number;
    height: number;
    stacks: unknown[];
  }>;
}

interface AnalyzeRequest {
  project: Record<string, unknown>;
  stls: Record<string, string>; // name -> Base64-encoded STL binary
  computedLayout: ComputedLayout;
  screenshot?: string; // Base64-encoded data URL
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data: AnalyzeRequest = await request.json();

    // Ensure analysis directory exists and is clean
    if (existsSync(analysisDir)) {
      // Remove old files but keep .gitignore
      const { readdir, unlink } = await import('fs/promises');
      const files = await readdir(analysisDir);
      for (const file of files) {
        if (file !== '.gitignore') {
          await unlink(join(analysisDir, file));
        }
      }
    } else {
      await mkdir(analysisDir, { recursive: true });
    }

    // Merge computedLayout into project and write as single file
    const projectWithLayout = {
      ...data.project,
      computedLayout: data.computedLayout
    };
    await writeFile(join(analysisDir, 'project.json'), JSON.stringify(projectWithLayout, null, 2));

    // Decode and write all STLs
    const stlFiles: string[] = [];
    for (const [name, base64Data] of Object.entries(data.stls)) {
      const safeFilename = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.stl';
      const stlBuffer = Buffer.from(base64Data, 'base64');
      await writeFile(join(analysisDir, safeFilename), stlBuffer);
      stlFiles.push(safeFilename);
    }

    // Save Three.js screenshot if provided
    if (data.screenshot) {
      // Screenshot is a data URL like "data:image/png;base64,..."
      const matches = data.screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const imageData = matches[2];
        const imageBuffer = Buffer.from(imageData, 'base64');
        await writeFile(join(analysisDir, 'app-screenshot.png'), imageBuffer);
      }
    }

    return json({
      success: true,
      message: 'Debug files written to mesh-analysis/',
      files: ['project.json', ...stlFiles]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ success: false, error: message }, { status: 500 });
  }
};
