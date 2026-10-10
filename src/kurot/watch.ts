import { watch } from 'chokidar';
import { existsSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveProjectPaths } from './config.js';
import { generateWithInputs } from './generate.js';
import type { ProjectOptions, ProjectResult } from './types.js';

export interface WatchProjectOptions {
	readonly debounceMs?: number;
	readonly onGenerated?: (result: ProjectResult) => void;
	readonly onError?: (error: Error) => void;
}

export interface ProjectWatcher {
	readonly close: () => Promise<void>;
}

/**
 * Generates once, then serializes debounced input changes. Generation errors
 * retain the last output and keep watching; close waits for pending work.
 */
export async function watchProject(
	options: ProjectOptions,
	callbacks: WatchProjectOptions = {},
): Promise<ProjectWatcher> {
	const { resourceDir, skinsDir, outputDir, styleFile, themeMapFile } = resolveProjectPaths(options);
	const debounceMs = callbacks.debounceMs ?? 100;
	if (!Number.isFinite(debounceMs) || debounceMs < 0) {
		throw new Error('debounceMs must be a finite nonnegative number.');
	}
	const base = [resourceDir, skinsDir, styleFile, ...(themeMapFile ? [themeMapFile] : [])];
	const tracked = new Set(base.map(file => path.resolve(file)));
	const discoveryTargets = new Set<string>();
	const fingerprints = new Map<string, string>();
	const settings = {
		followSymlinks: false,
		atomic: true,
		alwaysStat: true,
		awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
		ignored: (file: string): boolean => {
			const absolute = path.resolve(file);
			return (
				absolute === outputDir ||
				absolute.startsWith(outputDir + path.sep) ||
				absolute
					.split(path.sep)
					.some(part => part === 'node_modules' || part === '.git' || part.startsWith('.kurot-project-'))
			);
		},
	};
	const watcher = watch([...tracked], { ...settings, ignoreInitial: true });
	// Newly discovered files may appear while their first scan is in progress.
	const discovered = watch([], { ...settings, ignoreInitial: false });
	let closed = false;
	let ready = false;
	let dirty = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let current: Promise<void> | undefined;
	let closing: Promise<void> | undefined;
	const reportError =
		callbacks.onError ??
		((error: Error): void => {
			console.error(error.message);
		});

	function schedule(): void {
		if (closed || !ready) {
			return;
		}
		dirty = true;
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			if (!current) {
				void regenerate();
			}
		}, debounceMs);
	}

	function onChange(event: string, file: string, stats?: Stats): void {
		if (event === 'addDir' || event === 'unlinkDir') { return; }
		const absolute = path.resolve(file);
		if (event === 'unlink') {
			fingerprints.delete(absolute);
		} else if (stats) {
			const fingerprint = `${stats.ino}:${stats.size}:${stats.mtimeMs}`;
			if (fingerprints.get(absolute) === fingerprint) { return; }
			fingerprints.set(absolute, fingerprint);
		}
		schedule();
	}

	async function generate(): Promise<void> {
		try {
			const result = await generateWithInputs(options, file => {
				const covered = [resourceDir, skinsDir].some(directory =>
					file === directory || file.startsWith(directory + path.sep));
				if (!closed && !covered && !tracked.has(file)) {
					tracked.add(file);
					let target = file;
					while (!existsSync(path.dirname(target))) {
						target = path.dirname(target);
					}
					if (!discoveryTargets.has(target)) {
						discoveryTargets.add(target);
						discovered.add(target);
					}
				}
			});
			if (!closed) {
				callbacks.onGenerated?.(result);
			}
		} catch (error) {
			if (!closed) {
				reportError(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}

	function regenerate(): Promise<void> {
		dirty = false;
		current = generate().finally(() => {
			current = undefined;
			if (dirty && !closed) {
				schedule();
			}
		});
		return current;
	}

	function close(): Promise<void> {
		if (!closing) {
			closed = true;
			if (timer) {
				clearTimeout(timer);
			}
			closing = (async (): Promise<void> => {
				await Promise.all([watcher.close(), discovered.close()]);
				await current;
			})();
		}
		return closing;
	}

	watcher.on('all', onChange);
	discovered.on('all', (event, file, stats) => {
		if (tracked.has(path.resolve(file))) { onChange(event, file, stats); }
	});
	discovered.on('error', error => {
		reportError(error instanceof Error ? error : new Error(String(error)));
	});
	try {
		await new Promise<void>((resolve, reject) => {
			watcher.once('ready', resolve);
			watcher.once('error', reject);
		});
		watcher.removeAllListeners('error');
		watcher.on('error', error => {
			reportError(error instanceof Error ? error : new Error(String(error)));
		});
		for (const [directory, entries] of Object.entries(watcher.getWatched())) {
			for (const entry of entries) {
				const file = path.join(directory, entry);
				try {
					const stats = await stat(file);
					if (stats.isFile()) { fingerprints.set(file, `${stats.ino}:${stats.size}:${stats.mtimeMs}`); }
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
				}
			}
		}
		ready = true;
		await regenerate();
		return { close };
	} catch (error) {
		await close();
		throw error;
	}
}
