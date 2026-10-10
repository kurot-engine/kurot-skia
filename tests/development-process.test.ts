import { ok, throws } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { startProcess } from '../src/development/process.js';
import { eventually, textFile } from './development-fixture.js';

test('process cleanup reaches a descendant even when its parent exits first', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kurot-process-'));
    await mkdir(path.join(root, 'node_modules/.bin'), { recursive: true });
    const descendant = `process.on("SIGTERM", () => {});
require('node:fs').writeFileSync('descendant', String(process.pid)); setInterval(() => {}, 1000);`;
    const source = `const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore', env: { ...process.env, FORCE_COLOR: '1' } });
process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);`;
    const child = startProcess([process.execPath, '-e', source], root);
    try {
        await eventually(async () => Boolean(await textFile(path.join(root, 'descendant'))), 'descendant startup');
        const pid = Number(await readFile(path.join(root, 'descendant'), 'utf8'));
        ok(Number.isSafeInteger(pid) && pid > 0, 'The descendant must report a positive PID.');
        await child.stop();
        await eventually(() => {
            try { process.kill(pid, 0); return false; }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') { return true; }
                throw error;
            }
        }, 'descendant cleanup');
        throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } finally {
        await child.stop();
        await rm(root, { recursive: true, force: true });
    }
});
