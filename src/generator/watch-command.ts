import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { watchProject } from './watch.js';
import type { ProjectWatcher } from './watch.js';
import type { ProjectOptions, ProjectResult } from './types.js';

export function logGenerated(result: ProjectResult): void {
	console.info(`Generated ${result.assets.length} local assets, ${result.skins.length} skins → ${result.outputDir}`);
	process.send?.({ type: 'kurot-generated' });
	if (result.remoteURLs.length) {
		console.info(`${result.remoteURLs.length} remote URLs remain runtime-loaded.`);
	}
}

/**
 * Starts the command after the first successful generation, shares its terminal,
 * and closes the watcher when the command exits or receives a stop signal.
 */
export async function runWatchCommand(options: ProjectOptions, command: readonly string[]): Promise<void> {
	const controller = new AbortController();
	let watcher: ProjectWatcher | undefined;
	let child: ChildProcess | undefined;
	let childDone: Promise<void> | undefined;
	let childEnded = false;
	let exitCode = 0;
	let stopSignal: NodeJS.Signals = 'SIGTERM';
	const onInterrupt = (): void => {
		exitCode = 130;
		stopSignal = 'SIGINT';
		controller.abort();
	};
	const onTerminate = (): void => {
		exitCode = 143;
		controller.abort();
	};
	process.once('SIGINT', onInterrupt);
	process.once('SIGTERM', onTerminate);
	try {
		watcher = await watchProject(options, {
			onGenerated: result => {
				logGenerated(result);
				if (!child && command.length && !controller.signal.aborted) {
					child = spawn(command[0], command.slice(1), {
						stdio: 'inherit',
						cwd: path.resolve(options.projectRoot),
						shell: process.platform === 'win32',
					});
					childDone = new Promise<void>(resolve => {
						child?.once('error', error => {
							console.error(error.message);
							childEnded = true;
							exitCode = 1;
							controller.abort();
							resolve();
						});
						child?.once('exit', (code, signal) => {
							childEnded = true;
							if (!controller.signal.aborted) {
								exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
								controller.abort();
							}
							resolve();
						});
					});
				}
			},
			onError: error => {
				console.error(`Generation failed; still watching: ${error.message}`);
			},
		});
		console.info('Watching project inputs. Press Ctrl+C to stop.');
		if (!controller.signal.aborted) {
			await new Promise<void>(resolve => {
				controller.signal.addEventListener('abort', () => resolve(), {
					once: true,
				});
			});
		}
	} finally {
		if (child && !childEnded) {
			child.kill(stopSignal);
		}
		const forceStop =
			child && !childEnded
				? setTimeout(() => {
						child?.kill('SIGKILL');
					}, 5000)
				: undefined;
		forceStop?.unref();
		try {
			await watcher?.close();
			await childDone;
		} finally {
			if (forceStop) {
				clearTimeout(forceStop);
			}
			process.removeListener('SIGINT', onInterrupt);
			process.removeListener('SIGTERM', onTerminate);
			process.exitCode = exitCode;
		}
	}
}
