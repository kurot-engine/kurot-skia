import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';

export interface ManagedProcess {
    readonly child: ChildProcess;
    readonly done: Promise<number>;
    stop(signal?: NodeJS.Signals): Promise<void>;
}

/**
 * A separate POSIX process group lets cleanup reach Expo's descendants too.
 */
export function startProcess(command: readonly string[], cwd: string, ipc = false): ManagedProcess {
    if (!command.length) { throw new Error('A development command is required.'); }
    const child = spawn(command[0], command.slice(1), {
        cwd, detached: process.platform !== 'win32', shell: process.platform === 'win32',
        env: { ...process.env, PATH: path.join(cwd, 'node_modules/.bin') + path.delimiter + process.env.PATH },
        stdio: ipc ? ['ignore', 'inherit', 'inherit', 'ipc'] : 'inherit',
    });
    let ended = false;
    let stopping: Promise<void> | undefined;
    const done = new Promise<number>((resolve, reject) => {
        child.once('error', error => { ended = true; reject(error); });
        child.once('close', (code, signal) => {
            ended = true;
            resolve(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
        });
    });
    function kill(signal: NodeJS.Signals): void {
        if (!child.pid || (ended && process.platform === 'win32')) { return; }
        try {
            if (process.platform === 'win32') { child.kill(signal); }
            else { process.kill(-child.pid, signal); }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') { throw error; }
        }
    }
    function stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
        if (!stopping) {
            kill(signal);
            const force = setTimeout(() => kill('SIGKILL'), 5000);
            force.unref();
            stopping = done.then(() => {}, () => {}).finally(() => {
                clearTimeout(force);
                kill('SIGKILL');
            });
        }
        return stopping;
    }
    return { child, done, stop };
}

export async function runProcess(command: readonly string[], cwd: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) { return; }
    const child = startProcess(command, cwd);
    const stop = (): void => { void child.stop(); };
    signal.addEventListener('abort', stop, { once: true });
    try {
        const code = await child.done;
        if (code !== 0 && !signal.aborted) { throw new Error(`${command[0]} exited with code ${code}.`); }
    } finally {
        signal.removeEventListener('abort', stop);
        await child.stop();
    }
}
