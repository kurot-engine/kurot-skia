import { readFile, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { copyChanged, mirrorDirectory } from './files.js';

interface PackageInfo {
	readonly name: string;
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly bin?: Record<string, string>;
}

async function readPackage(root: string): Promise<PackageInfo> {
	return JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as PackageInfo;
}

/**
 * Only the explicitly declared local file dependency may receive build output.
 * pnpm retains ownership of the dependency graph, links and executable shims.
 */
export async function localPackage(root: string, project: string): Promise<string> {
	const library = await readPackage(root);
	const app = await readPackage(project);
	const declaration = app.dependencies?.[library.name] ?? app.devDependencies?.[library.name];
	if (
		!declaration?.startsWith('file:') ||
		(await realpath(path.resolve(project, declaration.slice(5)))) !== (await realpath(root))
	) {
		throw new Error(`${project} must declare ${library.name} as a file dependency on ${root}.`);
	}
	const installed = await realpath(path.join(project, 'node_modules', library.name));
	if ((await readPackage(installed)).name !== library.name || installed === (await realpath(root))) {
		throw new Error(`Expected an installed file package for ${library.name}, not a source checkout link.`);
	}
	return installed;
}

export async function installedCLI(installed: string): Promise<string> {
	const bin = (await readPackage(installed)).bin?.['kurot-project'];
	if (!bin) {
		throw new Error('The installed package has no kurot-project command.');
	}
	const cli = path.resolve(installed, bin);
	if (!cli.startsWith(installed + path.sep)) {
		throw new Error('Invalid kurot-project command path.');
	}
	return cli;
}

export async function syncLocalPackage(root: string, project: string): Promise<string[]> {
	const installed = await localPackage(root, project);
	const changed = (await mirrorDirectory(path.join(root, 'dist'), path.join(installed, 'dist'))).map(
		file => `dist/${file.split(path.sep).join('/')}`,
	);
	for (const file of ['README.md', 'CHANGELOG.md', 'package.json']) {
		if (await copyChanged(path.join(root, file), path.join(installed, file))) {
			changed.push(file);
		}
	}
	await mirrorDirectory(path.join(root, 'docs'), path.join(installed, 'docs'));
	return changed;
}
