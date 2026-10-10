import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const library = fileURLToPath(new URL('../..', import.meta.url));

export interface DevelopmentFixture {
    readonly root: string;
    readonly project: string;
    write(file: string, value: string): Promise<void>;
    dispose(): Promise<void>;
}

export async function developmentFixture(): Promise<DevelopmentFixture> {
    const directory = await mkdtemp(path.join(tmpdir(), 'kurot development '));
    const root = path.join(directory, 'library');
    const project = path.join(directory, 'app');
    const write = async (file: string, value: string): Promise<void> => {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), value);
    };
    await write('package.json', JSON.stringify({
        name: '@kurot/skia', version: '0.1.0', type: 'module',
        exports: {
            '.': './dist/kurot/index.js', './generator': './dist/generator/index.js',
            './metro': './dist/metro.cjs',
        },
        bin: { 'kurot-project': './dist/generator/cli.js' },
        files: ['dist', 'README.md', 'CHANGELOG.md', 'docs'],
    }));
    await write('tsconfig.json', JSON.stringify({ compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
        skipLibCheck: true, declaration: true, rootDir: 'src', outDir: 'dist', types: ['node'],
    }, include: ['src/generator/**/*.ts', 'src/*.cts'] }));
    await write('tsconfig.native.json', JSON.stringify({ extends: './tsconfig.json',
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' }, include: ['src/kurot/**/*.ts'],
    }));
    await write('src/kurot/index.ts', 'export const value = "initial";\n');
    await write('src/metro.cts', 'export const version = 1;\n');
    await write('src/generator/index.ts', 'export const generator = "initial";\n');
    await write('src/generator/cli.ts', `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[process.argv.indexOf('--project') + 1];
appendFileSync(join(root, 'generator-runs'), 'initial:' + process.pid + '\\n');
writeFileSync(join(root, 'resource-ready'), 'ready');
process.send?.({ type: 'kurot-generated' });
setInterval(() => {}, 1000);
`);
    await write('README.md', 'Library fixture\n');
    await write('CHANGELOG.md', 'Fixture changes\n');
    await write('docs/guide.md', 'Fixture guide\n');
    await symlink(path.join(library, 'node_modules'), path.join(root, 'node_modules'));
    await mkdir(project);
    await writeFile(path.join(project, 'package.json'), JSON.stringify({
        name: 'development-consumer', private: true, dependencies: { '@kurot/skia': 'file:../library' },
    }));
    return { root, project, write, dispose: (): Promise<void> => rm(directory, { recursive: true, force: true }) };
}

export async function eventually(check: () => Promise<boolean> | boolean, label: string): Promise<void> {
    const deadline = Date.now() + 20000;
    while (!await check()) {
        if (Date.now() > deadline) { throw new Error(`Timed out waiting for ${label}.`); }
        await delay(50);
    }
}

export async function textFile(file: string): Promise<string> {
    try { return await readFile(file, 'utf8'); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return ''; }
        throw error;
    }
}

export function launchDevelopment(fixture: DevelopmentFixture, command: readonly string[]): {
    output(): string; done: Promise<number>; stop(signal?: NodeJS.Signals): void;
} {
    const runner = new URL('../src/development/runner.js', import.meta.url).href;
    const source = `import { runDevelopment } from ${JSON.stringify(runner)};
process.exitCode = await runDevelopment(JSON.parse(process.argv[1]));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, JSON.stringify({
        libraryRoot: fixture.root, projectRoot: fixture.project, command,
    })], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let ended = false;
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    const done = new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => { ended = true; resolve(code ?? -1); });
    });
    return { output: (): string => output, done,
        stop: (signal: NodeJS.Signals = 'SIGTERM'): void => { if (!ended) { child.kill(signal); } },
    };
}
