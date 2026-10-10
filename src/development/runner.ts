import { watch } from 'chokidar';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { buildLibrary } from './build.js';
import { installedCLI, localPackage, syncLocalPackage } from './package.js';
import { runProcess, startProcess } from './process.js';
import type { ManagedProcess } from './process.js';

export interface DevelopmentOptions {
    readonly libraryRoot: string;
    readonly projectRoot: string;
    readonly command: readonly string[];
}

/**
 * Watches library source, synchronizes the installed file package and runs the
 * installed generator alongside the application's development command.
 */
export async function runDevelopment(options: DevelopmentOptions): Promise<number> {
    const root = path.resolve(options.libraryRoot);
    const project = path.resolve(options.projectRoot);
    const controller = new AbortController();
    let exitCode = 0;
    let ready = false;
    let dirty = false;
    let installed = false;
    let metadata = '';
    let generator: ManagedProcess | undefined;
    let server: ManagedProcess | undefined;
    let generatorReady = false;
    let current: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupt = (): void => { exitCode = 130; controller.abort(); };
    const terminate = (): void => { exitCode = 143; controller.abort(); };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const watcher = watch([
        path.join(root, 'src'), path.join(root, 'tsconfig.json'),
        path.join(root, 'tsconfig.native.json'), path.join(root, 'package.json'),
        path.join(root, 'tsconfig.development.json'),
    ], { ignoreInitial: true, atomic: true, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });

    function report(error: unknown): void {
        console.error(`Library update failed; still watching: ${error instanceof Error ? error.message : String(error)}`);
    }

    function watchExit(child: ManagedProcess, kind: 'generator' | 'server'): void {
        void child.done.then(code => {
            if (!controller.signal.aborted && child === (kind === 'generator' ? generator : server)) {
                exitCode = kind === 'generator' ? (code || 1) : code;
                controller.abort();
            }
        }, error => {
            report(error);
            if (!controller.signal.aborted && child === (kind === 'generator' ? generator : server)) {
                exitCode = 1;
                controller.abort();
            }
        });
    }

    function startServer(): void {
        if (!server && generatorReady && !controller.signal.aborted) {
            server = startProcess(options.command, project);
            watchExit(server, 'server');
        }
    }

    async function startGenerator(): Promise<void> {
        const previous = generator;
        generator = undefined;
        generatorReady = false;
        await previous?.stop();
        if (controller.signal.aborted) { return; }
        const directory = await localPackage(root, project);
        const child = startProcess([process.execPath, await installedCLI(directory), '--project', project, '--watch'], project, true);
        generator = child;
        child.child.on('message', (message: unknown) => {
            if (message && typeof message === 'object'
                && 'type' in message && message.type === 'kurot-generated' && child === generator) {
                generatorReady = true;
                startServer();
            }
        });
        watchExit(child, 'generator');
    }

    async function rebuild(): Promise<void> {
        try {
            await buildLibrary(root);
            if (controller.signal.aborted) { return; }
            const manifest = await readFile(path.join(root, 'package.json'), 'utf8');
            const packageChanged = metadata !== manifest;
            if (!installed || packageChanged) {
                await runProcess(['pnpm', 'install', '--ignore-scripts', '--offline'], project, controller.signal);
                if (controller.signal.aborted) { return; }
                installed = true;
            }
            const changed = await syncLocalPackage(root, project);
            const restartServer = packageChanged || changed.includes('dist/metro.cjs');
            if (restartServer) {
                const previous = server;
                server = undefined;
                await previous?.stop();
            }
            metadata = manifest;
            console.info(`Library compiled and synchronized (${changed.length} changed files).`);
            if (!generator || packageChanged || changed.some(file => file.startsWith('dist/generator/'))) {
                await startGenerator();
            }
            startServer();
        } catch (error) {
            report(error);
        }
    }

    function regenerate(): Promise<void> {
        dirty = false;
        current = rebuild().finally(() => {
            current = undefined;
            if (dirty && !controller.signal.aborted) { schedule(); }
        });
        return current;
    }

    function schedule(): void {
        if (controller.signal.aborted || !ready) { return; }
        dirty = true;
        if (timer) { clearTimeout(timer); }
        timer = setTimeout(() => {
            timer = undefined;
            if (!current) { void regenerate(); }
        }, 120);
    }

    watcher.on('all', schedule);
    watcher.on('error', report);
    try {
        await new Promise<void>((resolve, reject) => {
            watcher.once('ready', resolve);
            watcher.once('error', reject);
        });
        ready = true;
        await regenerate();
        console.info('Watching library source and project resources. Press Ctrl+C to stop.');
        if (!controller.signal.aborted) {
            await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
        }
    } finally {
        controller.abort();
        if (timer) { clearTimeout(timer); }
        await watcher.close();
        const children = [generator, server];
        generator = undefined;
        server = undefined;
        await Promise.all(children.map(child => child?.stop(exitCode === 130 ? 'SIGINT' : 'SIGTERM')));
        await current;
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
    }
    return exitCode;
}
