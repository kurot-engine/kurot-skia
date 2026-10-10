import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

export function posix(value: string): string {
    return value.split(path.sep).join('/');
}

export function projectPath(root: string, relative: string): string {
    const absolute = path.resolve(root, relative);
    const within = path.relative(root, absolute);
    if (within.startsWith(`..${path.sep}`) || within === '..' || path.isAbsolute(within)) {
        throw new Error(`Path must stay inside project: ${relative}`);
    }
    return absolute;
}

export function modulePath(from: string, to: string): string {
    const relative = posix(path.relative(path.dirname(from), to));
    return relative.startsWith('.') ? relative : `./${relative}`;
}

export function isRemoteURL(value: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
}

export async function readJSON(file: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) {
        throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function scanFiles(directory: string, optional = false): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await scanFiles(file));
        } else if (entry.isFile()) {
            files.push(file);
        } else {
            throw new Error(`Symlinks and special files are not supported in scanned directories: ${file}`);
        }
    }
    return files;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
