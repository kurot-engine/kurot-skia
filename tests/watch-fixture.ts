import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const skinXML = (name: string, text = 'initial'): string =>
    `<Skin xmlns="https://kurot.dev/ui/1" class="${name}"><Label text="${text}"/></Skin>`;

export function styleJSON(caption: string): string {
    return JSON.stringify({ schemaVersion: 1, colors: { caption }, fonts: {
        default: 'primary', families: { primary: {
            fallback: ['Arial'], faces: [{ url: 'font.ttf', weight: 400 }],
        } },
    } });
}

export async function watchFixture(): Promise<{
    root: string; write: (file: string, text: string) => Promise<void>; dispose: () => Promise<void>;
}> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kurot watch test '));
    const write = async (file: string, text: string): Promise<void> => {
        const absolute = path.join(root, file);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, text);
    };
    await write('resource/resource.json', JSON.stringify({ resources: [
        { name: 'logo', type: 'image', url: 'logo.png' },
        { name: 'sheet', type: 'sheet', url: 'sheet.json' },
    ], groups: [] }));
    await write('resource/logo.png', 'image');
    await write('resource/sheet.json', JSON.stringify({ file: 'atlas.png', frames: {} }));
    await write('resource/atlas.png', 'atlas');
    await write('resource/ui/ButtonSkin.kui.xml', skinXML('skins.ButtonSkin'));
    return { root, write, dispose: (): Promise<void> => rm(root, { recursive: true, force: true }) };
}

export async function waitFor(check: () => boolean, description: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!check()) {
        if (Date.now() > deadline) { throw new Error(`Timed out waiting for ${description}`); }
        await delay(20);
    }
}
