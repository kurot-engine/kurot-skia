import * as path from 'node:path';
import { posix } from './paths.js';
import { readThemeMap, resolveProjectPaths } from './config.js';
import { collectResources, emitAssets } from './resources.js';
import { collectSkins } from './skins.js';
import { installOutput } from './output.js';
import { generatedHeader } from './types.js';
import type { ProjectOptions, ProjectResult } from './types.js';

/**
 * Generates a static project entry without requiring an RN or Skia runtime.
 */
export async function generateProject(options: ProjectOptions): Promise<ProjectResult> {
	return generateWithInputs(options);
}

export async function generateWithInputs(
	options: ProjectOptions,
	onInput?: (file: string) => void,
): Promise<ProjectResult> {
	const { root, manifest, skinsDir, outputDir, styleFile, themeMapFile } = resolveProjectPaths(options);
	const themeSkins = themeMapFile ? await readThemeMap(themeMapFile) : (options.themeSkins ?? {});
	const resources = await collectResources(root, manifest, onInput);
	const mode = options.assetMode ?? 'metro';
	const skins = await collectSkins(
		skinsDir,
		outputDir,
		resources,
		styleFile,
		themeSkins,
		mode,
		options.styleSheet === undefined,
	);
	const files = new Map(skins.files);
	const themeConfigURL = posix(path.relative(root, path.join(outputDir, 'theme.json')));
	files.set(
		'skins.ts',
		files.get('skins.ts') + `\nexport const themeConfigURL = ${JSON.stringify(themeConfigURL)};\n`,
	);
	files.set('assets.ts', emitAssets(resources, path.join(outputDir, 'assets.ts'), mode));
	const extension = mode === 'metro' ? '' : '.js';
	files.set(
		'index.ts',
		generatedHeader +
			[
				`export { bundledAssets, resourceConfigURL, resourceRoot, remoteURLs } from "./assets${extension}";`,
				`export type { BundledAsset } from "./assets${extension}";`,
				`export { skinFactories, theme, themeConfigURL, registerSkinFactories } from "./skins${extension}";`,
				`export type { SkinFactory } from "./skins${extension}";`,
				'',
			].join('\n'),
	);
	await installOutput(outputDir, files);
	return {
		outputDir,
		resourceConfigURL: resources.manifestURL,
		assets: resources.assets.map(asset => asset.url),
		remoteURLs: resources.remoteURLs,
		skins: skins.classNames,
		files: [...files.keys()].sort(),
	};
}
