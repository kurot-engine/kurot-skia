import { Resource, SpriteSheet, Texture } from '@kurot/core';

import { Event } from '@kurot/core';
import { IOErrorEvent } from '@kurot/core';
import { NativeImageLoader as ImageLoader } from '@kurot/skia';
import { NativeHttpRequest as HttpRequest } from '@kurot/skia';
import { getNativeAsset } from '@kurot/skia';
import { getSkiaImage } from '@kurot/skia';

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Native resource check failed: ${message}`);
    }
}

/**
 * Exercises the published Resource and analyzers with real native image decoding.
 */
export async function runResourceChecks(): Promise<void> {
    const resources = new Resource();
    try {
        await resources.loadConfig('resource/resource.json', 'resource/');
        const progress: number[] = [];
        await Promise.all([
            resources.loadGroup('preload', 0, (loaded) => progress.push(loaded)),
            resources.loadGroup('preload'),
        ]);
        assert(progress.join(',') === '1,2', 'group progress and queued duplicate loads');
        const image = resources.get<Texture>('mascot_png');
        const sheet = resources.get<SpriteSheet>('kui');
        const frame = resources.get<Texture>('kui.checkbox_selected');
        assert(image instanceof Texture && sheet instanceof SpriteSheet && frame instanceof Texture, 'native image and sheet');
        assert(frame === resources.get('checkbox_selected') && frame === sheet.getTexture('checkbox_selected'), 'both subkey forms');
        assert(frame.resolution === 2 && frame.textureWidth === 28 && frame.textureHeight === 28, 'physical atlas / logical 2x size');
        assert(await resources.load('mascot_png') === image, 'cached load identity');
        const imageData = image.bitmapData;
        const sheetData = frame.bitmapData;
        assert(imageData !== undefined && sheetData !== undefined, 'bitmap data');
        assert(sheetData.width === 512 && getSkiaImage(sheetData) !== undefined, 'decoded original atlas');
        frame.dispose();
        assert(getSkiaImage(sheetData) !== undefined, 'child texture does not release shared atlas');

        resources.destroyGroup('preload');
        assert(resources.get('mascot_png') === undefined && resources.get('checkbox_selected') === undefined
            && resources.get('kui.checkbox_selected') === undefined, 'group and subkey eviction');
        assert(getSkiaImage(imageData) === undefined && getSkiaImage(sheetData) === undefined, 'native source disposal');
        imageData.dispose();
        sheetData.dispose();
        await resources.loadConfig('resource/resource.json', 'resource/');
        await resources.loadGroup('preload');
        assert(resources.get('mascot_png') !== image && resources.get('kui') !== sheet, 'reload after destruction');
        const asset = getNativeAsset('resource/resource.json');
        assert(asset?.kind === 'json' && JSON.stringify(asset.value).includes('"url":"assets/ui/kui/kui.json"'), 'manifest is not mutated');

        resources.addResource({ name: 'missing_png', type: 'image', url: 'resource/assets/missing.png' });
        let rejected = false;
        try {
            await resources.load('missing_png');
        } catch {
            rejected = true;
        }
        assert(rejected && resources.get('missing_png') === undefined, 'missing image rejects without caching');

        const request = new HttpRequest();
        let completions = 0;
        request.addEventListener(Event.COMPLETE, () => completions++);
        request.open('resource/resource.json');
        request.send();
        request.abort();
        await Promise.resolve();
        assert(completions === 0 && request.response === undefined, 'cancel bundled request');

        const loader = new ImageLoader();
        loader.addEventListener(Event.COMPLETE, () => completions++);
        loader.addEventListener(IOErrorEvent.IO_ERROR, () => completions++);
        loader.load('resource/assets/kurot-logo.png');
        loader.close();
        // Await the same decoder queue so a cancelled result has time to settle.
        const probe = new ImageLoader();
        await new Promise<void>((resolve, reject) => {
            probe.addEventListener(Event.COMPLETE, () => resolve());
            probe.addEventListener(IOErrorEvent.IO_ERROR, () => reject(new Error('Probe image failed')));
            probe.load('resource/assets/kurot-logo.png');
        });
        probe.data?.dispose();
        assert(completions === 0 && loader.data === undefined, 'cancelled decode emits no completion');
        console.info('Kurot Skia: native resource checks passed (manifest, image, 2x atlas, cache, disposal, reload, errors, cancellation).');
    } finally {
        resources.destroyAll();
    }
}
