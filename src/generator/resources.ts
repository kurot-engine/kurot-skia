import { parseBitmapFont } from '@kurot/bitmap-font';
import { parseUIResourceConfigEntries } from '@kurot/ui-document';
import type { UIResourceConfigEntry } from '@kurot/ui-document';
import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { isRecord, isRemoteURL, modulePath, posix, projectPath, readJSON } from './paths.js';
import { generatedHeader } from './types.js';
import type { CollectedAsset } from './types.js';

export interface ProjectResources {
	readonly entries: readonly UIResourceConfigEntry[];
	readonly assets: readonly CollectedAsset[];
	readonly remoteURLs: readonly string[];
	readonly manifestURL: string;
	readonly resourceRoot: string;
}

/**
 * Retains authored logical URLs, including non-normalized sheet-relative paths.
 * The physical filesystem path is resolved separately for static bundling.
 */
export async function collectResources(
	root: string,
	manifest: string,
	onInput?: (file: string) => void,
): Promise<ProjectResources> {
	const manifestPath = projectPath(root, manifest);
	onInput?.(manifestPath);
	const manifestURL = posix(path.relative(root, manifestPath));
	const folder = path.posix.dirname(manifestURL);
	const resourceRoot = folder === '.' ? '' : `${folder}/`;
	const raw = await readJSON(manifestPath);
	const entries = parseUIResourceConfigEntries(raw);
	const assets = new Map<string, CollectedAsset>();
	const remoteURLs = new Set<string>();

	async function add(url: string, kind: CollectedAsset['kind']): Promise<CollectedAsset | undefined> {
		if (isRemoteURL(url)) {
			remoteURLs.add(url);
			return undefined;
		}
		if (!url || url.includes('?') || url.includes('#') || url.includes('\\')) {
			throw new Error(`Local asset URL must be a plain relative path: ${url}`);
		}
		const physical = projectPath(root, url);
		onInput?.(physical);
		const previous = assets.get(url);
		if (previous) {
			if (previous.kind !== kind) {
				throw new Error(`Conflicting resource kinds for ${url}: ${previous.kind}, ${kind}`);
			}
			return previous;
		}
		if (!(await stat(physical)).isFile()) {
			throw new Error(`Resource is not a file: ${url}`);
		}
		const value =
			kind === 'json' ? await readJSON(physical) : kind === 'text' ? await readFile(physical, 'utf8') : undefined;
		const asset: CollectedAsset = { url, path: physical, kind, value };
		assets.set(url, asset);
		return asset;
	}

	await add(manifestURL, 'json');
	for (const entry of entries) {
		if (!entry.url) {
			throw new Error(`Resource URL is empty: ${entry.name}`);
		}
		const url = isRemoteURL(entry.url) ? entry.url : resourceRoot + entry.url;
		const kind = resourceKind(entry.type);
		const asset = await add(url, kind);
		if (asset && (entry.type === 'sheet' || entry.type === 'font')) {
			const file = entry.type === 'font' ? parseBitmapFont(asset.value).file : sheetFile(asset.value, url);
			if (!file) {
				throw new Error(`Font must reference an image file: ${url}`);
			}
			const imageURL = isRemoteURL(file) ? file : url.slice(0, url.lastIndexOf('/') + 1) + file;
			await add(imageURL, 'image');
		}
	}
	return {
		entries,
		assets: [...assets.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)),
		remoteURLs: [...remoteURLs].sort(),
		manifestURL,
		resourceRoot,
	};
}

export function emitAssets(resources: ProjectResources, output: string, mode: 'metro' | 'url'): string {
	const lines = [
		generatedHeader,
		'export type BundledAsset =',
		'    | { readonly kind: "json"; readonly value: unknown }',
		'    | { readonly kind: "text"; readonly value: string }',
		`    | { readonly kind: "image" | "file"; readonly source: ${mode === 'metro' ? 'number' : 'string'} };`,
		'',
		`export const resourceConfigURL = ${JSON.stringify(resources.manifestURL)};`,
		`export const resourceRoot = ${JSON.stringify(resources.resourceRoot)};`,
		'',
	];
	for (const [index, asset] of resources.assets.entries()) {
		if (asset.kind === 'json') {
			lines.push(`const json${index}: unknown = JSON.parse(${JSON.stringify(JSON.stringify(asset.value))});`);
		}
	}
	lines.push('', 'export const bundledAssets = {');
	for (const [index, asset] of resources.assets.entries()) {
		let payload: string;
		if (asset.kind === 'json') {
			payload = `value: json${index}`;
		} else if (asset.kind === 'text') {
			payload = `value: ${JSON.stringify(asset.value)}`;
		} else {
			const specifier = JSON.stringify(modulePath(output, asset.path));
			payload =
				mode === 'metro'
					? `source: require(${specifier}) as number`
					: `source: new URL(${specifier}, import.meta.url).href`;
		}
		lines.push(`    [${JSON.stringify(asset.url)}]: { kind: ${JSON.stringify(asset.kind)}, ${payload} },`);
	}
	lines.push(
		'} as const satisfies Readonly<Record<string, BundledAsset>>;',
		'',
		`export const remoteURLs: readonly string[] = ${JSON.stringify(resources.remoteURLs)};`,
		'',
	);
	return lines.join('\n');
}

function resourceKind(type: string): CollectedAsset['kind'] {
	switch (type) {
		case 'sheet':
		case 'json':
			return 'json';
		case 'font':
		case 'text':
			return 'text';
		case 'image':
			return 'image';
		case 'sound':
			return 'file';
		default:
			throw new Error(`Unsupported resource type: ${type}. Add a build-time handler before generating.`);
	}
}

function sheetFile(value: unknown, url: string): string {
	if (!isRecord(value) || typeof value.file !== 'string' || !value.file) {
		throw new Error(`Sheet must reference a nonempty image file: ${url}`);
	}
	return value.file;
}
