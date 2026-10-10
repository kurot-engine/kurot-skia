import { equal, rejects, ok } from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { test } from 'node:test';
import { buildLibrary } from '../src/development/build.js';
import { mirrorDirectory } from '../src/development/files.js';
import { localPackage } from '../src/development/package.js';
import { developmentFixture } from './development-fixture.js';

test('library compilation retains good output on native errors and removes deleted modules after recovery', async () => {
    const fixture = await developmentFixture();
    try {
        await buildLibrary(fixture.root);
        const output = path.join(fixture.root, 'dist/kurot/index.js');
        const before = await readFile(output, 'utf8');
        await fixture.write('src/kurot/index.ts', 'export const value: string = 123;\n');
        await fixture.write('src/generator/index.ts', 'export const generator = "changed";\n');
        await rejects(buildLibrary(fixture.root), /not assignable/);
        equal(await readFile(output, 'utf8'), before);
        ok(!(await readFile(path.join(fixture.root, 'dist/generator/index.js'), 'utf8')).includes('changed'));
        await fixture.write('src/kurot/index.ts', 'export { scene } from "./scene.js";\n');
        await fixture.write('src/kurot/scene.ts', 'export const scene = "new module";\n');
        await buildLibrary(fixture.root);
        const removed = path.join(fixture.root, 'dist/kurot/scene.js');
        ok(existsSync(removed));
        await rm(path.join(fixture.root, 'src/kurot/scene.ts'));
        await fixture.write('src/kurot/index.ts', 'export const value = "recovered";\n');
        await buildLibrary(fixture.root);
        equal(existsSync(removed), false);
        equal(existsSync(removed.replace('.js', '.d.ts')), false);
    } finally { await fixture.dispose(); }
});

test('output synchronization preserves unchanged files and replaces hardlinks without writing through them', async () => {
    const fixture = await developmentFixture();
    try {
        const source = path.join(fixture.root, 'dist');
        const target = path.join(fixture.project, 'installed');
        await fixture.write('dist/keep.js', 'keep');
        await fixture.write('dist/change.js', 'new');
        await mkdir(target);
        const external = path.join(fixture.project, 'shared-store-file');
        await writeFile(external, 'old');
        await link(external, path.join(target, 'change.js'));
        await writeFile(path.join(target, 'keep.js'), 'keep');
        await writeFile(path.join(target, 'obsolete.js'), 'obsolete');
        const unchanged = await stat(path.join(target, 'keep.js'));
        const changes = await mirrorDirectory(source, target);
        ok(changes.includes('change.js'));
        ok(changes.includes('obsolete.js'));
        equal(await readFile(external, 'utf8'), 'old');
        equal(await readFile(path.join(target, 'change.js'), 'utf8'), 'new');
        equal((await stat(path.join(target, 'keep.js'))).ino, unchanged.ino);
        equal((await stat(path.join(target, 'keep.js'))).mtimeMs, unchanged.mtimeMs);
    } finally { await fixture.dispose(); }
});

test('local synchronization rejects a consumer that does not declare this source checkout', async () => {
    const fixture = await developmentFixture();
    try {
        await writeFile(path.join(fixture.project, 'package.json'), '{"dependencies":{"@kurot/skia":"0.1.0"}}');
        await rejects(localPackage(fixture.root, fixture.project), /must declare.*file dependency/);
    } finally { await fixture.dispose(); }
});
