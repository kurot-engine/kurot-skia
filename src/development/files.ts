import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

async function files(directory: string): Promise<string[]> {
    const result: string[] = [];
    let entries: Dirent[];
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return result; }
        throw error;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            for (const file of await files(path.join(directory, entry.name))) {
                result.push(path.join(entry.name, file));
            }
        } else if (entry.isFile()) {
            result.push(entry.name);
        } else {
            throw new Error(`Unexpected symlink or special file in compiled output: ${path.join(directory, entry.name)}`);
        }
    }
    return result;
}

/**
 * Replaces changed files atomically, breaking pnpm hardlinks rather than writing
 * through them. Unchanged bytes retain their inode and modification time.
 */
export async function copyChanged(source: string, destination: string): Promise<boolean> {
    const content = await readFile(source);
    try {
        if (content.equals(await readFile(destination))) { return false; }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
    }
    await mkdir(path.dirname(destination), { recursive: true });
    const staging = `${destination}.${randomUUID()}.tmp`;
    try {
        await writeFile(staging, content);
        await rename(staging, destination);
    } finally {
        await rm(staging, { force: true });
    }
    return true;
}

/**
 * Mirrors an exclusively generated directory, including additions and removals.
 */
export async function mirrorDirectory(source: string, destination: string): Promise<string[]> {
    await lstat(source);
    const inputs = await files(source);
    const retained = new Set(inputs);
    const changed: string[] = [];
    for (const file of inputs) {
        if (await copyChanged(path.join(source, file), path.join(destination, file))) {
            changed.push(file);
        }
    }
    for (const file of await files(destination)) {
        if (!retained.has(file)) {
            await rm(path.join(destination, file));
            changed.push(file);
        }
    }
    return changed;
}
