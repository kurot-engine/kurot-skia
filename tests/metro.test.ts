import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { CustomResolutionContext, CustomResolver, Resolution } from 'metro-resolver';
import { createKurotResolver } from '../src/metro.cjs';

const library = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const core = realpathSync(path.join(library, 'node_modules/@kurot/core'));
const ui = realpathSync(path.join(library, 'node_modules/@kurot/ui'));

async function fixture(includeUI = true): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'kurot-metro-'));
    await mkdir(path.join(root, 'node_modules/@kurot'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{"name":"native-consumer"}');
    await symlink(core, path.join(root, 'node_modules/@kurot/core'));
    if (includeUI) {
        await symlink(ui, path.join(root, 'node_modules/@kurot/ui'));
    }
    await symlink(library, path.join(root, 'node_modules/@kurot/skia'));
    return root;
}

function context(originModulePath: string, resolveRequest: CustomResolver): CustomResolutionContext {
    // Only these context fields are read by the adapter; Metro owns the others.
    return { originModulePath, resolveRequest } as unknown as CustomResolutionContext;
}

function sourceFile(resolution: Resolution): string {
    assert.equal(resolution.type, 'sourceFile');
    assert.ok('filePath' in resolution);
    assert.ok(existsSync(resolution.filePath));
    return resolution.filePath;
}

test('Metro uses one host Core and redirects its browser ports to installed native modules', async () => {
    const root = await fixture();
    try {
        const fallback: CustomResolver = () => ({ type: 'empty' });
        const resolve = createKurotResolver(root);
        const native = path.join(library, 'dist/kurot');
        const appContext = context(path.join(root, 'App.tsx'), fallback);
        assert.equal(sourceFile(resolve(appContext, '@kurot/core', 'android')), path.join(native, 'core-native.js'));
        assert.equal(sourceFile(resolve(appContext, '@kurot/core', 'ios')), path.join(native, 'core-native.js'));
        const origin = path.join(core, 'dist/kurot/resource/Resource.js');
        for (const [module, port] of [
            ['net/ImageLoader.js', 'NativeImageLoader.js'],
            ['net/HttpRequest.js', 'NativeHttpRequest.js'],
            ['text/TextMeasurer.js', 'NativeTextMeasurer.js'],
            ['text/TextSegmentation.js', 'NativeTextSegmentation.js'],
            ['text/InputController.js', 'NativeInputController.js'],
            ['media/Sound.js', 'NativeSound.js'],
            ['media/SoundChannel.js', 'NativeSound.js'],
            ['resource/analyzers/SoundAnalyzer.js', 'NativeSoundAnalyzer.js'],
            ['resource/analyzers/FontAnalyzer.js', 'NativeFontAnalyzer.js'],
            ['utils/FontManager.js', 'NativeFontManager.js'],
            ['display/texture/RenderTexture.js', 'NativeRenderTexture.js'],
            ['player/canvas/DisplayList.js', 'NativeDisplayList.js'],
        ]) {
            const request = path.relative(path.dirname(origin), path.join(core, 'dist/kurot', module));
            assert.equal(sourceFile(resolve(context(origin, fallback), request, 'android')), path.join(native, port));
        }
        const uiOrigin = path.join(ui, 'dist/kurot/components/Component.js');
        assert.equal(sourceFile(resolve(context(uiOrigin, fallback), '../core/Theme.js', 'ios')), path.join(native, 'NativeTheme.js'));
        const nativeOrigin = path.join(native, 'NativeHttpRequest.js');
        assert.equal(sourceFile(resolve(context(nativeOrigin, fallback), '@kurot/core/dist/kurot/net/HttpRequest.js', 'android')),
            path.join(core, 'dist/kurot/net/HttpRequest.js'));
        assert.throws(() => resolve(context(nativeOrigin, fallback), '@kurot/core/dist/../../package.json', 'android'), /Invalid native Core module/);
        assert.deepEqual(resolve(appContext, '@kurot/core/dist/kurot/net/HttpRequest.js', 'android'), { type: 'empty' });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('Metro composes the host resolver and leaves web and unrelated modules to it', async () => {
    const root = await fixture(false);
    try {
        const calls: string[] = [];
        const fallback: CustomResolver = (_context, name) => {
            calls.push(`default:${name}`);
            return { type: 'empty' };
        };
        const previous: CustomResolver = (_context, name) => {
            calls.push(`previous:${name}`);
            return { type: 'empty' };
        };
        const app = context(path.join(root, 'App.tsx'), fallback);
        const resolve = createKurotResolver(root, previous);
        resolve(app, '@kurot/core', 'web');
        resolve(app, 'application-module', 'android');
        assert.deepEqual(calls, ['previous:@kurot/core', 'previous:application-module']);
        createKurotResolver(root)(app, 'application-module', 'ios');
        assert.equal(calls.at(-1), 'default:application-module');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('Metro rejects unvalidated SDK versions before using their private module layout', async () => {
    const root = await fixture();
    try {
        const uiLink = path.join(root, 'node_modules/@kurot/ui');
        await rm(uiLink);
        await mkdir(uiLink);
        await writeFile(path.join(uiLink, 'package.json'), '{"version":"3.4.0"}');
        assert.throws(() => createKurotResolver(root), /requires @kurot\/ui 3\.5\.0; found 3\.4\.0/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
