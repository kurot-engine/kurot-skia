import { deepEqual, equal, match, rejects, ok } from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { generateProject } from '../src/kurot/index.js';

const skin = (name: string): string => `<Skin xmlns="https://kurot.dev/ui/1" class="${name}" states="up,down">
  <Image id="background" source="atlas.frame" source.down="atlas.frame"/>
  <Label id="caption" text="原皮肤" textColor="@style:colors:caption"/>
  <Group id="body"><layout><HorizontalLayout gap="8"/></layout></Group>
</Skin>`;

interface Fixture {
    readonly root: string;
    readonly output: string;
    readonly write: (file: string, value: string | object) => Promise<void>;
}

async function fixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kurot-project-test-'));
    const write = async (file: string, value: string | object): Promise<void> => {
        const absolute = path.join(root, file);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
        await write('resource/resource.json', {
            groups: [{ name: 'preload', keys: 'logo,atlas' }],
            resources: [
                { name: 'logo', type: 'image', url: 'assets/logo.png' },
                { name: 'atlas', type: 'sheet', url: 'assets/nested/sheet.json',
                    subkeys: { frame: { scale9grid: '1,1,2,2' } } },
                { name: 'story', type: 'text', url: 'text/story.txt' },
                { name: 'online', type: 'image', url: 'https://example.com/online.png' },
            ],
        });
        await write('resource/assets/logo.png', 'image fixture');
        await write('resource/assets/nested/sheet.json', { file: '../atlas.png', resolution: 2, frames: {} });
        await write('resource/assets/atlas.png', 'atlas fixture');
        await write('resource/text/story.txt', '文字\n`template` ${literal}');
        await write('resource/config/style.json', {
            schemaVersion: 1,
            fonts: { default: 'primary', families: { primary: {
                fallback: ['Arial'], faces: [{ url: 'assets/font.ttf', weight: 400 }],
            } } },
            colors: { caption: '#123456' },
        });
        await write('resource/ui/ButtonSkin.kui.xml', skin('skins.ButtonSkin'));
        await write('resource/other/deep/PanelSkin.kui.xml', skin('skins.PanelSkin'));
        await run({ root, output: path.join(root, 'src/generated/kurot'), write });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

function evaluate(source: string, context: Record<string, unknown> = {}): Record<string, unknown> {
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: Record<string, unknown> = {};
    runInNewContext(output, { exports, ...context });
    return exports;
}

test('generates all resources, sheet dependencies, nested skins and restored registrations', async () => {
    await fixture(async ({ root, output }) => {
        const before = await readFile(path.join(root, 'resource/resource.json'), 'utf8');
        const result = await generateProject({ projectRoot: root });
        deepEqual(result.skins, ['skins.PanelSkin', 'skins.ButtonSkin']);
        equal(result.assets.length, 5);
        deepEqual(result.remoteURLs, ['https://example.com/online.png']);
        ok(result.assets.includes('resource/assets/nested/../atlas.png'));
        const required: string[] = [];
        const assetModule = evaluate(await readFile(path.join(output, 'assets.ts'), 'utf8'), {
            require: (file: string): number => { required.push(file); return 7; },
        });
        const assets = assetModule.bundledAssets as Record<string, { kind: string; value?: unknown; source?: number }>;
        equal(assets['resource/text/story.txt'].value, '文字\n`template` ${literal}');
        equal(assets['resource/assets/nested/../atlas.png'].source, 7);
        deepEqual(required.sort(), ['../../../resource/assets/atlas.png', '../../../resource/assets/logo.png']);
        equal(await readFile(path.join(root, 'resource/resource.json'), 'utf8'), before);
        const compiled = await readFile(path.join(output, 'skins/ui/ButtonSkin.ts'), 'utf8');
        match(compiled, /createButtonSkin\(\): Skin/);
        match(compiled, /new Skin\(\) as Skin & Record<string, unknown>/);
        match(compiled, /skin\["caption"\] = caption/);
        match(compiled, /new HorizontalLayout\(\)/);
        ok(!compiled.includes('.setPart('));
        match(compiled, /new Rectangle\(1, 1, 2, 2\)/);
        match(compiled, /new State\("down"/);
        ok(!compiled.includes('@style:colors:caption'));
        const theme = JSON.parse(await readFile(path.join(output, 'theme.json'), 'utf8')) as { skins: object };
        deepEqual(theme.skins, { Panel: 'skins.PanelSkin', Button: 'skins.ButtonSkin' });
        const factory = (): object => ({});
        const registryModule = evaluate(await readFile(path.join(output, 'skins.ts'), 'utf8'), {
            require: (): object => ({ createButtonSkin: factory, createPanelSkin: factory }),
        });
        const registry: Record<string, unknown> = { 'skins.ButtonSkin': 'previous' };
        equal(registryModule.themeConfigURL, 'src/generated/kurot/theme.json');
        const register = registryModule.registerSkinFactories as (value: Record<string, unknown>) => () => void;
        const restore = register(registry);
        equal(registry['skins.ButtonSkin'], factory);
        equal(registry['skins.PanelSkin'], factory);
        restore();
        deepEqual(registry, { 'skins.ButtonSkin': 'previous' });
    });
});

test('identical inputs are deterministic and removed skins do not leave stale output', async () => {
    await fixture(async ({ root, output }) => {
        const first = await generateProject({ projectRoot: root });
        const before = await Promise.all(first.files.map(file => readFile(path.join(output, file), 'utf8')));
        const second = await generateProject({ projectRoot: root });
        deepEqual(first, second);
        deepEqual(await Promise.all(second.files.map(file => readFile(path.join(output, file), 'utf8'))), before);
        await rm(path.join(root, 'resource/other/deep/PanelSkin.kui.xml'));
        const result = await generateProject({ projectRoot: root });
        deepEqual(result.skins, ['skins.ButtonSkin']);
        await rejects(readFile(path.join(output, 'skins/other/deep/PanelSkin.ts')), { code: 'ENOENT' });
    });
});

test('missing images and invalid KUI preserve the previous generated entry', async () => {
    await fixture(async ({ root, output, write }) => {
        await generateProject({ projectRoot: root });
        const before = await readFile(path.join(output, 'skins.ts'), 'utf8');
        await rm(path.join(root, 'resource/assets/atlas.png'));
        await rejects(generateProject({ projectRoot: root }), /atlas\.png/);
        equal(await readFile(path.join(output, 'skins.ts'), 'utf8'), before);
        await write('resource/assets/atlas.png', 'restored');
        await write('resource/ui/invalid.kui.xml', '<Skin class="skins.Invalid"><UnknownThing/></Skin>');
        await rejects(generateProject({ projectRoot: root }), /invalid\.kui\.xml/);
        equal(await readFile(path.join(output, 'skins.ts'), 'utf8'), before);
    });
});

test('rejects duplicate skin classes and requires an explicit choice for ambiguous default skins', async () => {
    await fixture(async ({ root, write }) => {
        await write('resource/ui/duplicate.kui.xml', skin('skins.ButtonSkin'));
        await rejects(generateProject({ projectRoot: root }), /Duplicate skin class/);
        await write('resource/ui/duplicate.kui.xml', skin('alternate.ButtonSkin'));
        await rejects(generateProject({ projectRoot: root }), /Ambiguous default Button/);
        const result = await generateProject({ projectRoot: root, themeSkins: { Button: 'alternate.ButtonSkin' } });
        equal(result.skins.length, 3);
        await rejects(generateProject({ projectRoot: root, themeSkins: { Button: 'missing.Skin' } }), /Invalid theme mapping/);
    });
});

test('does not overwrite authored files or accept output containing the resource tree', async () => {
    await fixture(async ({ root, write }) => {
        await rejects(generateProject({ projectRoot: root, outputDir: 'resource' }), /authored input/);
        await write('src/generated/kurot/manual.ts', 'authored');
        await rejects(generateProject({ projectRoot: root }), /kurot-project\.json/);
        await rm(path.join(root, 'src/generated/kurot/manual.ts'));
        await generateProject({ projectRoot: root });
        await write('src/generated/kurot/manual.ts', 'authored');
        await rejects(generateProject({ projectRoot: root }), /Authored file/);
    });
});

test('supports bitmap font page dependencies and sound assets without native runtime dependencies', async () => {
    await fixture(async ({ root, write, output }) => {
        await write('resource/resource.json', { resources: [
            { name: 'font', type: 'font', url: 'font/font.fnt' },
            { name: 'sound', type: 'sound', url: 'sound/click.mp3' },
        ], groups: [] });
        await write('resource/font/font.fnt', {
            file: 'page.png', frames: { A: { x: 0, y: 0, w: 10, h: 10, offX: 0, offY: 0 } },
        });
        await write('resource/font/page.png', 'page');
        await write('resource/sound/click.mp3', 'sound');
        const result = await generateProject({ projectRoot: root, assetMode: 'url' });
        ok(result.assets.includes('resource/font/page.png'));
        const source = await readFile(path.join(output, 'assets.ts'), 'utf8');
        match(source, /kind: "file", source: new URL/);
        ok(!source.includes('require('));
        ok(!source.includes('react-native'));
    });
});

test('rejects unsupported resource kinds, legacy sheet subkeys and project traversal', async () => {
    await fixture(async ({ root, write }) => {
        await write('resource/resource.json', { resources: [{ name: 'custom', type: 'custom', url: 'asset' }] });
        await rejects(generateProject({ projectRoot: root }), /Unsupported resource type/);
        await write('resource/resource.json', { resources: [{ name: 'atlas', type: 'sheet', url: 'asset', subkeys: 'a,b' }] });
        await rejects(generateProject({ projectRoot: root }), /subkeys must be an object/);
        await write('resource/resource.json', { resources: [{ name: 'bad', type: 'image', url: '../../outside.png' }] });
        await rejects(generateProject({ projectRoot: root }), /inside project/);
    });
});
