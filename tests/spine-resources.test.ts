import { deepEqual, equal, match, rejects } from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateProject } from '../src/generator/index.js';

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'kurot-spine-resources-'));
    try {
        await mkdir(join(root, 'resource/spine'), { recursive: true });
        await writeFile(join(root, 'resource/resource.json'), JSON.stringify({ groups: [], resources: [
            { name: 'skeleton', type: 'text', url: 'spine/hero.skel' },
            { name: 'atlas', type: 'text', url: 'spine/hero.atlas' },
            { name: 'font', type: 'text', url: 'font.ttf' },
            { name: 'dragon', type: 'text', url: 'dragon.dbbin' },
        ] }));
        await writeFile(join(root, 'resource/spine/hero.skel'), Buffer.from([0, 255, 128, 10, 1]));
        await writeFile(join(root, 'resource/font.ttf'), Buffer.from([1, 0, 254, 13]));
        await writeFile(join(root, 'resource/dragon.dbbin'), Buffer.from([68, 66, 68, 84, 0, 255]));
        await writeFile(join(root, 'resource/spine/hero.atlas'), 'page-a.png\nsize: 4,4\nfilter: Linear,Linear\nregion\n  bounds: 0,0,2,2\n\npage-b.png\nsize: 4,4\nregion-b\n  bounds: 0,0,2,2\n');
        await writeFile(join(root, 'resource/spine/page-a.png'), 'a');
        await writeFile(join(root, 'resource/spine/page-b.png'), 'b');
        await run(root);
    } finally { await rm(root, { recursive: true, force: true }); }
}
test('generator bundles lossless skeleton/font bytes and all Spine atlas pages', async () => {
    await fixture(async (root) => {
        const result = await generateProject({ projectRoot: root });
        const output = await readFile(join(root, 'src/generated/kurot/assets.ts'), 'utf8');
        match(output, /base64: "AP\+ACgE="/); match(output, /base64: "AQD\+DQ=="/);
        equal(output.includes('base64: ' + JSON.stringify(Buffer.from([68, 66, 68, 84, 0, 255]).toString('base64'))), true);
        match(output, /page-a\.png/); match(output, /page-b\.png/);
        const inputs = result.assets;
        for (const file of ['hero.skel', 'hero.atlas', 'page-a.png', 'page-b.png']) equal(inputs.includes('resource/spine/' + file), true);
        await writeFile(join(root, 'resource/spine/hero.skel'), Buffer.from([0, 255, 128, 10, 2]));
        await generateProject({ projectRoot: root });
        match(await readFile(join(root, 'src/generated/kurot/assets.ts'), 'utf8'), /base64: "AP\+ACgI="/);
    });
});
test('missing or unsafe Spine pages preserve the last complete generated output', async () => {
    await fixture(async (root) => {
        await generateProject({ projectRoot: root });
        const path = join(root, 'src/generated/kurot/assets.ts'); const original = await readFile(path);
        for (const page of ['missing.png', '../../../outside.png', 'size: 4,4']) {
            await writeFile(join(root, 'resource/spine/hero.atlas'), page + '\nsize: 4,4\n');
            await rejects(generateProject({ projectRoot: root }));
            deepEqual(await readFile(path), original);
        }
    });
});

test('watch regenerates binary bytes and discovers replacement Spine page dependencies', async () => {
    await fixture(async (root) => {
        const { watchProject } = await import('../src/generator/index.js');
        const { waitFor } = await import('./watch-fixture.js');
        let count = 0; const errors: Error[] = [];
        const watcher = await watchProject({ projectRoot: root }, {
            onGenerated: () => { count++; }, onError: (error) => { errors.push(error); },
        });
        try {
            const before = count;
            await writeFile(join(root, 'resource/spine/hero.skel'), Buffer.from([9, 255, 0]));
            await waitFor(() => count > before, 'binary regeneration');
            match(await readFile(join(root, 'src/generated/kurot/assets.ts'), 'utf8'), /base64: "Cf8A"/);
            await writeFile(join(root, 'resource/spine/page-c.png'), 'c');
            await writeFile(join(root, 'resource/spine/hero.atlas'), 'page-c.png\nsize: 4,4\n');
            const pageStart = count;
            await waitFor(() => count > pageStart, 'new Spine page');
            const pageGenerated = count;
            await writeFile(join(root, 'resource/spine/page-c.png'), 'updated c');
            await waitFor(() => count > pageGenerated, 'newly discovered page update');
            equal(errors.length, 0);
        } finally { await watcher.close(); }
    });
});
