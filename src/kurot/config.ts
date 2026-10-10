import * as path from 'node:path';
import { isRecord, projectPath, readJSON } from './paths.js';
import type { ProjectOptions } from './types.js';

export function resolveProjectPaths(options: ProjectOptions): {
	root: string;
	manifest: string;
	resourceDir: string;
	skinsDir: string;
	outputDir: string;
	styleFile: string;
	themeMapFile?: string;
} {
	const root = path.resolve(options.projectRoot);
	const manifest = options.manifest ?? 'resource/resource.json';
	const resourceDir = path.dirname(projectPath(root, manifest));
	const skinsDir = projectPath(root, options.skinsDir ?? path.relative(root, resourceDir));
	const outputDir = projectPath(root, options.outputDir ?? 'src/generated/kurot');
	const styleFile = projectPath(
		root,
		options.styleSheet ?? path.relative(root, path.join(resourceDir, 'config/style.json')),
	);
	if (
		outputDir === root ||
		outputDir === resourceDir ||
		outputDir === skinsDir ||
		resourceDir.startsWith(outputDir + path.sep) ||
		skinsDir.startsWith(outputDir + path.sep)
	) {
		throw new Error('Generated output must not contain authored input directories.');
	}
	const themeMapFile = options.themeMapFile === undefined ? undefined : path.resolve(root, options.themeMapFile);
	if (themeMapFile && options.themeSkins !== undefined) {
		throw new Error('Use either themeMapFile or themeSkins, not both.');
	}
	return {
		root,
		manifest,
		resourceDir,
		skinsDir,
		outputDir,
		styleFile,
		themeMapFile,
	};
}

export async function readThemeMap(file: string): Promise<Record<string, string>> {
	const raw = await readJSON(file);
	if (!isRecord(raw) || !Object.values(raw).every(value => typeof value === 'string')) {
		throw new Error(`${file}: theme map must contain a JSON object of host → skin class names`);
	}
	return raw as Record<string, string>;
}
