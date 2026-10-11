import { equal, match, throws } from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { waitFor, watchFixture } from './watch-fixture.js';

const cli = fileURLToPath(new URL('../src/generator/cli.js', import.meta.url));

function launch(root: string, command: string[] = []): {
    output: () => string; done: Promise<number>; stop: (signal?: NodeJS.Signals) => void;
} {
    const child = spawn(process.execPath, [cli, '--project', root, '--watch', ...command], {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let ended = false;
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    const done = new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill('SIGKILL'); reject(new Error(`CLI did not terminate within 30 seconds:\n${output}`));
        }, 30000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('close', code => { clearTimeout(timeout); ended = true; resolve(code ?? -1); });
    });
    return {
        output: (): string => output, done,
        stop: (signal: NodeJS.Signals = 'SIGTERM'): void => { if (!ended) { child.kill(signal); } },
    };
}

test('watch CLI generates before starting its command, preserves arguments and forwards its exit code', async () => {
    const fixture = await watchFixture();
    const program = `const fs = require('node:fs');
        const file = fs.readFileSync('src/generated/kurot/assets.ts', 'utf8');
        if (!file.includes('resource/logo.png')) process.exit(9);
        console.log('literal-argument:', process.argv[1]); process.exit(7);`;
    const child = launch(fixture.root, ['--', process.execPath, '-e', program, 'space $literal argument']);
    try {
        equal(await child.done, 7);
        match(child.output(), /Generated 4 local assets, 1 skins/);
        match(child.output(), /literal-argument: space \$literal argument/);
    } finally {
        child.stop('SIGKILL');
        await fixture.dispose();
    }
});

test('watch CLI waits for initial input recovery before starting the dev command', async () => {
    const fixture = await watchFixture();
    const manifest = await readFile(path.join(fixture.root, 'resource/resource.json'), 'utf8');
    await fixture.write('resource/resource.json', '{');
    const child = launch(fixture.root, ['--', process.execPath, '-e', 'console.log("DEV_STARTED")']);
    try {
        await waitFor(() => child.output().includes('still watching'), 'initial CLI error');
        equal(child.output().includes('DEV_STARTED'), false);
        await fixture.write('resource/resource.json', manifest);
        equal(await child.done, 0);
        match(child.output(), /DEV_STARTED/);
    } finally {
        child.stop('SIGKILL');
        await fixture.dispose();
    }
});

test('stopping the watch CLI terminates the dev command and releases its watcher', async () => {
    const fixture = await watchFixture();
    const program = `process.on('SIGTERM', () => {
        require('node:fs').writeFileSync('child-stopped', 'stopped'); process.exit(0);
    }); console.log('DEV_PID=' + process.pid); setInterval(() => {}, 1000);`;
    const child = launch(fixture.root, ['--', process.execPath, '-e', program]);
    try {
        await waitFor(() => child.output().includes('DEV_PID='), 'running dev command');
        const pid = Number(/DEV_PID=(\d+)/.exec(child.output())?.[1]);
        child.stop();
        equal(await child.done, 143);
        equal(await readFile(path.join(fixture.root, 'child-stopped'), 'utf8'), 'stopped');
        throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } finally {
        child.stop('SIGKILL');
        await fixture.dispose();
    }
});

test('standalone watch exits on Ctrl+C and a missing dev command closes with an error', async () => {
    const fixture = await watchFixture();
    const standalone = launch(fixture.root);
    try {
        await waitFor(() => standalone.output().includes('Watching project inputs'), 'standalone watcher');
        standalone.stop('SIGINT');
        equal(await standalone.done, 130);
        const missing = launch(fixture.root, ['--', 'kurot-missing-dev-command']);
        equal(await missing.done, 1);
        match(missing.output(), /ENOENT/);
    } finally {
        standalone.stop('SIGKILL');
        await fixture.dispose();
    }
});
