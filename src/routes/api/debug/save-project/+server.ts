import { json } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { RequestHandler } from './$types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
const analysisDir = join(projectRoot, 'mesh-analysis');

interface SaveProjectRequest {
  project: Record<string, unknown>;
  computedLayout: Record<string, unknown>;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data: SaveProjectRequest = await request.json();

    // Ensure analysis directory exists
    if (!existsSync(analysisDir)) {
      await mkdir(analysisDir, { recursive: true });
    }

    // Merge computedLayout into project and write
    const projectWithLayout = {
      ...data.project,
      computedLayout: data.computedLayout
    };
    await writeFile(join(analysisDir, 'project.json'), JSON.stringify(projectWithLayout, null, 2));

    return json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ success: false, error: message }, { status: 500 });
  }
};
