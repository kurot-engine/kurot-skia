import * as path from 'node:path';
import { posix, projectPath } from './paths.js';
import { collectResources, emitAssets } from './resources.js';
import { collectSkins } from './skins.js';
import { installOutput } from './output.js';
import { generatedHeader } from './types.js';
import type { ProjectOptions, ProjectResult } from './types.js';

export type { ProjectOptions, ProjectResult } from './types.js';

/**
 * Generates a static project entry without requiring an RN or Skia runtime.
 */
export async function generateProject(options: ProjectOptions): Promise<ProjectResult> {
    const root = path.resolve(options.projectRoot);
    const manifest = options.manifest ?? 'resource/resource.json';
    const resourceDir = path.dirname(projectPath(root, manifest));
    const skinsDir = projectPath(root, options.skinsDir ?? path.relative(root, resourceDir));
    const outputDir = projectPath(root, options.outputDir ?? 'src/generated/kurot');
    const styleFile = projectPath(root, options.styleSheet ?? path.relative(root, path.join(resourceDir, 'config/style.json')));
    if (outputDir === root || outputDir === resourceDir || outputDir === skinsDir
        || resourceDir.startsWith(outputDir + path.sep) || skinsDir.startsWith(outputDir + path.sep)) {
        throw new Error('Generated output must not contain authored input directories.');
    }
    const resources = await collectResources(root, manifest);
    const mode = options.assetMode ?? 'metro';
    const skins = await collectSkins(skinsDir, outputDir, resources, styleFile, options.themeSkins ?? {}, mode,
        options.styleSheet === undefined);
    const files = new Map(skins.files);
    const themeConfigURL = posix(path.relative(root, path.join(outputDir, 'theme.json')));
    files.set('skins.ts', files.get('skins.ts') + `\nexport const themeConfigURL = ${JSON.stringify(themeConfigURL)};\n`);
    files.set('assets.ts', emitAssets(resources, path.join(outputDir, 'assets.ts'), mode));
    const extension = mode === 'metro' ? '' : '.js';
    files.set('index.ts', generatedHeader + [
        `export { bundledAssets, resourceConfigURL, resourceRoot, remoteURLs } from "./assets${extension}";`,
        `export type { BundledAsset } from "./assets${extension}";`,
        `export { skinFactories, theme, themeConfigURL, registerSkinFactories } from "./skins${extension}";`,
        `export type { SkinFactory } from "./skins${extension}";`, '',
    ].join('\n'));
    await installOutput(outputDir, files);
    return {
        outputDir, resourceConfigURL: resources.manifestURL,
        assets: resources.assets.map(asset => asset.url), remoteURLs: resources.remoteURLs,
        skins: skins.classNames, files: [...files.keys()].sort(),
    };
}
