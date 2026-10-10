import { deepEqual, equal, match, ok, rejects } from 'node:assert/strict';
import { readFile, rename, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { watchProject } from '../src/generator/index.js';
import type { ProjectResult } from '../src/generator/index.js';
import { skinXML, styleJSON, waitFor, watchFixture } from './watch-fixture.js';

test('watches images, atlas descriptors, manifest and nested skin additions, moves and removals', async () => {
    const fixture = await watchFixture();
    const results: ProjectResult[] = [];
    const errors: Error[] = [];
    const watcher = await watchProject({ projectRoot: fixture.root, outputDir: 'resource/generated' }, {
        onGenerated: result => { results.push(result); }, onError: error => { errors.push(error); },
    });
    const output = path.join(fixture.root, 'resource/generated');
    try {
        equal(results.length, 1);
        await delay(600);
        equal(results.length, 1, 'generated output must not trigger a watch loop');
        await fixture.write('resource/logo.tmp', 'replacement image');
        await rename(path.join(fixture.root, 'resource/logo.tmp'), path.join(fixture.root, 'resource/logo.png'));
        await waitFor(() => results.length >= 2, 'atomic image replacement');
        const count = results.length;
        await fixture.write('resource/sheet.json', JSON.stringify({ file: 'second.png', frames: {} }));
        await fixture.write('resource/second.png', 'second atlas');
        await waitFor(() => results.at(-1)?.assets.includes('resource/second.png') === true, 'atlas page discovery');
        ok(results.length > count);
        const beforeImage = results.length;
        await fixture.write('resource/second.png', 'updated second atlas');
        await waitFor(() => results.length > beforeImage, 'discovered atlas image changes');
        await fixture.write('resource/ui/deep/PanelSkin.kui.xml', skinXML('skins.PanelSkin'));
        await waitFor(() => results.at(-1)?.skins.includes('skins.PanelSkin') === true, 'nested skin addition');
        await rename(path.join(fixture.root, 'resource/ui/deep/PanelSkin.kui.xml'),
            path.join(fixture.root, 'resource/ui/deep/Renamed.kui.xml'));
        await waitFor(() => results.at(-1)?.files.includes('skins/ui/deep/Renamed.ts') === true, 'skin move');
        await rejects(readFile(path.join(output, 'skins/ui/deep/PanelSkin.ts')), { code: 'ENOENT' });
        await rm(path.join(fixture.root, 'resource/ui/deep/Renamed.kui.xml'));
        await waitFor(() => results.at(-1)?.skins.length === 1, 'skin removal');
        await fixture.write('resource/resource.json', JSON.stringify({ resources: [
            { name: 'story', type: 'text', url: '../external/story.txt' },
        ], groups: [] }));
        await waitFor(() => errors.length > 0, 'missing new dependency error');
        await fixture.write('external/story.txt', 'outside resource tree');
        await waitFor(() => results.at(-1)?.assets.includes('resource/../external/story.txt') === true,
            'missing external dependency creation');
        const beforeText = results.length;
        await fixture.write('external/story.txt', 'changed external text');
        await waitFor(() => results.length > beforeText, 'external text modification');
        match(await readFile(path.join(output, 'assets.ts'), 'utf8'), /changed external text/);
    } finally {
        await watcher.close();
        await fixture.dispose();
    }
});

test('debounces bursts, preserves output on invalid saves, recovers and closes without later writes', async () => {
    const fixture = await watchFixture();
    let generated = 0;
    const errors: Error[] = [];
    const watcher = await watchProject({ projectRoot: fixture.root }, {
        onGenerated: () => { generated++; }, onError: error => { errors.push(error); },
    });
    const file = path.join(fixture.root, 'src/generated/kurot/skins/ui/ButtonSkin.ts');
    try {
        const previous = await readFile(file, 'utf8');
        await fixture.write('resource/ui/ButtonSkin.kui.xml', '<Skin><Broken>');
        await waitFor(() => errors.length > 0, 'invalid skin error');
        equal(generated, 1);
        equal(await readFile(file, 'utf8'), previous);
        for (let index = 0; index < 5; index++) {
            await fixture.write('resource/ui/ButtonSkin.kui.xml', skinXML('skins.ButtonSkin', `save-${index}`));
            await delay(20);
        }
        await waitFor(() => generated === 2, 'coalesced final save');
        match(await readFile(file, 'utf8'), /save-4/);
        await delay(600);
        equal(generated, 2);
        await fixture.write('resource/ui/ButtonSkin.kui.xml', skinXML('skins.ButtonSkin', 'pending-close'));
        await Promise.all([watcher.close(), watcher.close()]);
        await delay(400);
        equal(generated, 2);
        match(await readFile(file, 'utf8'), /save-4/);
    } finally {
        await watcher.close();
        await fixture.dispose();
    }
});

test('recovers an invalid initial manifest and reloads external style and theme files', async () => {
    const fixture = await watchFixture();
    const manifest = await readFile(path.join(fixture.root, 'resource/resource.json'), 'utf8');
    await fixture.write('resource/resource.json', '{');
    await fixture.write('settings/theme.json', '{"Button":"skins.ButtonSkin"}');
    const results: ProjectResult[] = [];
    const errors: Error[] = [];
    const watcher = await watchProject({ projectRoot: fixture.root,
        styleSheet: 'settings/style.json', themeMapFile: 'settings/theme.json' }, {
        onGenerated: result => { results.push(result); }, onError: error => { errors.push(error); },
    });
    try {
        equal(results.length, 0);
        equal(errors.length, 1);
        await fixture.write('resource/resource.json', manifest);
        await fixture.write('settings/style.json', styleJSON('#123456'));
        await waitFor(() => results.length > 0, 'initial error recovery');
        await fixture.write('resource/ui/ButtonSkin.kui.xml',
            '<Skin xmlns="https://kurot.dev/ui/1" class="skins.ButtonSkin"><Label textColor="@style:colors:caption"/></Skin>');
        const beforeStyle = results.length;
        await fixture.write('settings/style.json', styleJSON('#FF0000'));
        await waitFor(() => results.length > beforeStyle, 'external style modification');
        const output = path.join(fixture.root, 'src/generated/kurot');
        match(await readFile(path.join(output, 'skins/ui/ButtonSkin.ts'), 'utf8'), /16711680/);
        await fixture.write('resource/ui/Alternative.kui.xml', skinXML('skins.Alternative'));
        await fixture.write('settings/theme.json', '{"Button":"skins.Alternative"}');
        await waitFor(() => results.at(-1)?.skins.includes('skins.Alternative') === true, 'new mapped skin');
        const theme = JSON.parse(await readFile(path.join(output, 'theme.json'), 'utf8')) as { skins: object };
        deepEqual(theme.skins, { Button: 'skins.Alternative' });
    } finally {
        await watcher.close();
        await fixture.dispose();
    }
});
