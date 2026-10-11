import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { isRecord, posix, readJSON, scanFiles } from './paths.js';

const marker = '.kurot-project.json';

/**
 * Only replaces an owned generated directory, after all inputs compile.
 * Unrecognized files prevent replacement rather than being silently removed.
 */
export async function installOutput(output: string, files: ReadonlyMap<string, string>): Promise<void> {
	const existing = await scanFiles(output, true);
	if (existing.length) {
		const ownership = await readJSON(path.join(output, marker));
		if (
			!isRecord(ownership) ||
			ownership.generator !== '@kurot/skia/generator' ||
			!Array.isArray(ownership.files)
		) {
			throw new Error(`Output directory is not owned by this generator: ${output}`);
		}
		const owned = new Set([...ownership.files, marker]);
		for (const file of existing) {
			if (!owned.has(posix(path.relative(output, file)))) {
				throw new Error(`Authored file found in generated output: ${file}`);
			}
		}
	}
	await mkdir(path.dirname(output), { recursive: true });
	const staging = await mkdtemp(path.join(path.dirname(output), '.kurot-project-'));
	const backup = `${staging}.previous`;
	let moved = false;
	try {
		for (const [relative, content] of files) {
			const file = path.join(staging, relative);
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, content);
		}
		await writeFile(
			path.join(staging, marker),
			JSON.stringify(
				{
					generator: '@kurot/skia/generator',
					files: [...files.keys()].sort(),
				},
				undefined,
				2,
			) + '\n',
		);
		try {
			await rename(output, backup);
			moved = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
		try {
			await rename(staging, output);
		} catch (error) {
			if (moved) {
				await rename(backup, output);
			}
			throw error;
		}
		if (moved) {
			await rm(backup, { recursive: true });
		}
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}
