import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
const analysisDir = join(projectRoot, 'mesh-analysis');
const scriptsDir = join(projectRoot, 'scripts');

interface TrayInfo {
	name: string;
	letter: string;
	id: string;
	placement: unknown;
}

interface AnalyzeRequest {
	project: unknown;
	stls: Record<string, string>; // name -> Base64-encoded STL binary
	context: {
		box_name: string;
		box_id: string;
		selected_tray_name: string;
		selected_tray_id: string;
		selected_tray_letter: string;
		trays: TrayInfo[];
	};
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

		// Write context.json
		const context = {
			...data.context,
			timestamp: new Date().toISOString()
		};
		await writeFile(join(analysisDir, 'context.json'), JSON.stringify(context, null, 2));

		// Write project.json
		await writeFile(join(analysisDir, 'project.json'), JSON.stringify(data.project, null, 2));

		// Decode and write all STLs
		const stlFiles: string[] = [];
		for (const [name, base64Data] of Object.entries(data.stls)) {
			const safeFilename = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.stl';
			const stlBuffer = Buffer.from(base64Data, 'base64');
			await writeFile(join(analysisDir, safeFilename), stlBuffer);
			stlFiles.push(safeFilename);
		}

		// Write manifest of STL files
		await writeFile(join(analysisDir, 'stl-manifest.json'), JSON.stringify(stlFiles, null, 2));

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

		// Run Python analyzer
		const venvPython = join(scriptsDir, '.venv', 'bin', 'python');
		const analyzerScript = join(scriptsDir, 'mesh-analyzer.py');

		// Check if venv exists
		const pythonPath = existsSync(venvPython) ? venvPython : 'python3';

		const result = await new Promise<{ success: boolean; output: string; error?: string }>(
			(resolve) => {
				const proc = spawn(pythonPath, [analyzerScript, analysisDir], {
					cwd: scriptsDir,
					env: { ...process.env }
				});

				let stdout = '';
				let stderr = '';

				proc.stdout.on('data', (data) => {
					stdout += data.toString();
				});

				proc.stderr.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						resolve({ success: true, output: stdout });
					} else {
						resolve({
							success: false,
							output: stdout,
							error: stderr || `Process exited with code ${code}`
						});
					}
				});

				proc.on('error', (err) => {
					resolve({
						success: false,
						output: stdout,
						error: `Failed to spawn process: ${err.message}`
					});
				});
			}
		);

		if (!result.success) {
			return json(
				{
					success: false,
					error: result.error,
					output: result.output,
					hint: 'Make sure Python venv is set up: cd scripts && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt'
				},
				{ status: 500 }
			);
		}

		return json({
			success: true,
			message: 'Analysis complete. Files written to mesh-analysis/',
			output: result.output
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ success: false, error: message }, { status: 500 });
	}
};
