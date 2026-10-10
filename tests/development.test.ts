import { equal, match, ok, throws } from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';
import { developmentFixture, eventually, launchDevelopment, textFile } from './development-fixture.js';

test('development watches additions, removals and recovery; restarts tools and cleans up on Ctrl+C', async () => {
    const fixture = await developmentFixture();
    const program = `const fs = require('node:fs');
if (!fs.existsSync('resource-ready')) process.exit(8);
fs.appendFileSync('server-runs', process.pid + '\\n'); setInterval(() => {}, 1000);`;
    const child = launchDevelopment(fixture, [process.execPath, '-e', program]);
    const serverRuns = (): Promise<string> => textFile(path.join(fixture.project, 'server-runs'));
    const generatorRuns = (): Promise<string> => textFile(path.join(fixture.project, 'generator-runs'));
    const lines = (value: string): string[] => value.trim().split('\n').filter(Boolean);
    const installed = path.join(fixture.project, 'node_modules/@kurot/skia/dist/kurot');
    try {
        await eventually(async () => lines(await serverRuns()).length === 1, 'initial developer command');
        equal(lines(await generatorRuns()).length, 1);
        await fixture.write('src/kurot/new-scene.ts', 'export const scene = "added";\n');
        await fixture.write('src/kurot/index.ts', 'export { scene } from "./new-scene.js";\n');
        await eventually(() => existsSync(path.join(installed, 'new-scene.js')), 'new module synchronization');
        equal(lines(await serverRuns()).length, 1);
        const before = await readFile(path.join(installed, 'index.js'), 'utf8');
        await fixture.write('src/kurot/index.ts', 'export const value: string = 123;\n');
        await eventually(() => child.output().includes('not assignable'), 'compilation error');
        equal(await readFile(path.join(installed, 'index.js'), 'utf8'), before);
        await rm(path.join(fixture.root, 'src/kurot/new-scene.ts'));
        await fixture.write('src/kurot/index.ts', 'export const value = "recovered";\n');
        await eventually(async () => (await textFile(path.join(installed, 'index.js'))).includes('recovered')
            && !existsSync(path.join(installed, 'new-scene.js')), 'recovered build and stale module removal');
        await fixture.write('src/generator/cli.ts', (await readFile(path.join(fixture.root, 'src/generator/cli.ts'), 'utf8'))
            .replace('initial:', 'updated:'));
        await eventually(async () => (await generatorRuns()).includes('updated:'), 'new generator process');
        equal(lines(await serverRuns()).length, 1);
        await fixture.write('src/metro.cts', 'export const version = 2;\n');
        await eventually(async () => lines(await serverRuns()).length === 2, 'Metro configuration restart');
        const serverPids = lines(await serverRuns()).map(Number);
        const generatorPids = lines(await generatorRuns()).map(line => Number(line.split(':')[1]));
        child.stop('SIGINT');
        equal(await child.done, 130);
        for (const pid of [...serverPids, ...generatorPids]) {
            throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        }
    } finally {
        child.stop();
        await child.done;
        await fixture.dispose();
    }
});

test('development command receives literal arguments after generation and forwards its exit code', async () => {
    const fixture = await developmentFixture();
    const child = launchDevelopment(fixture, [process.execPath, '-e',
        'console.log("DEV_ARGUMENT=" + process.argv[1]); process.exit(7);', 'space $literal argument']);
    try {
        equal(await child.done, 7);
        match(child.output(), /DEV_ARGUMENT=space \$literal argument/);
        ok(existsSync(path.join(fixture.project, 'resource-ready')));
        const pid = Number((await textFile(path.join(fixture.project, 'generator-runs'))).trim().split(':')[1]);
        throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } finally {
        child.stop();
        await child.done;
        await fixture.dispose();
    }
});

test('an invalid initial library build keeps watching and starts the app only after recovery', async () => {
    const fixture = await developmentFixture();
    await fixture.write('src/kurot/index.ts', 'export const value: string = 123;\n');
    const child = launchDevelopment(fixture, [process.execPath, '-e', 'console.log("RECOVERED_APP");']);
    try {
        await eventually(() => child.output().includes('not assignable'), 'initial library failure');
        equal(child.output().includes('RECOVERED_APP'), false);
        await fixture.write('src/kurot/index.ts', 'export const value = "fixed";\n');
        equal(await child.done, 0);
        match(child.output(), /RECOVERED_APP/);
    } finally {
        child.stop();
        await child.done;
        await fixture.dispose();
    }
});
