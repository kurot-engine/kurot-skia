import { Bitmap, BitmapData, DisplayObject, registerFontMapping, Shape, Sprite, Stage, TextField } from '@kurot/core';
import { createSkiaTexture, NativePictureCache, SkiaRenderer } from '@kurot/skia';
import type { SkCanvas, SkPicture } from 'react-native-skia';
import { assert, imageFromPixels, readGPU, rgba, near } from './gpu';
import { box, equalPixels } from './picture-cache.test';

function disposed(picture: SkPicture): boolean {
    try { picture.serialize(); return false; } catch { return true; }
}

function observe(seen: SkPicture[]): (canvas: SkCanvas) => SkCanvas {
    return canvas => new Proxy(canvas, {
        get(target, property): unknown {
            if (property === 'drawPicture') {
                return (picture: SkPicture): void => { seen.push(picture); target.drawPicture(picture); };
            }
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

export function runPictureLifecycleChecks(): void {
    const stage = new Stage(); const root = new Sprite(); root.addChild(box(0xff0000)); stage.addChild(root);
    const renderer = new SkiaRenderer(); const seen: SkPicture[] = [];
    const previousDirty = DisplayObject.$onRenderableDirty;
    let dirtyNotifications = 0;
    const previousObserver = (): void => { dirtyNotifications++; };
    DisplayObject.$onRenderableDirty = previousObserver;
    let cache = new NativePictureCache(root);
    const capture = (): Uint8Array => readGPU(stage, renderer, 128, 128, observe(seen));
    try {
        capture(); const first = seen.at(-1)!;
        cache.invalidate(); assert(disposed(first), 'explicit invalidation releases Picture immediately');
        capture(); assert(seen.at(-1) !== first, 'invalidation replaces Picture');
        const second = seen.at(-1)!; cache.dispose(); cache.dispose();
        assert(disposed(second) && renderer.pictureCacheStats.pictures === 0, 'idempotent handle disposal');
        assert(DisplayObject.$onRenderableDirty === previousObserver, 'previous dirty observer restored');
        cache = new NativePictureCache(root); capture(); const absent = seen.at(-1)!;
        root.x = 1; assert(dirtyNotifications > 0, 'previous dirty observer receives updates');
        stage.removeChild(root); capture(); assert(disposed(absent), 'unused frame releases Picture');
        stage.addChild(root); capture(); const final = seen.at(-1)!;
        renderer.dispose(); assert(disposed(final), 'renderer disposal releases Picture');
    } finally {
        cache.dispose(); renderer.dispose(); stage.removeChildren();
        DisplayObject.$onRenderableDirty = previousDirty;
    }

    const resourceRenderer = new SkiaRenderer(); const offstage = new Sprite();
    const image = imageFromPixels(8, 8, new Uint8Array(8 * 8 * 4).fill(255));
    const texture = createSkiaTexture(image); const bitmap = new Bitmap(texture); offstage.addChild(bitmap);
    const imageCache = new NativePictureCache(offstage);
    try {
        readGPU(offstage, resourceRenderer); const initial = resourceRenderer.pictureCacheStats.rebuilds;
        BitmapData.invalidate(texture.bitmapData);
        readGPU(offstage, resourceRenderer);
        assert(resourceRenderer.pictureCacheStats.rebuilds === initial + 1, 'offstage source version invalidates');
        texture.dispose(); const afterDispose = readGPU(offstage, resourceRenderer);
        near(rgba(afterDispose, 2, 2), [0, 0, 0, 0], 'disposed source removes recorded pixels');
    } finally { imageCache.dispose(); resourceRenderer.dispose(); texture.dispose(); image.dispose(); }

    const nestedRenderer = new SkiaRenderer(); const outer = new Sprite(); const inner = new Sprite();
    const child = box(0x00ff00); inner.addChild(child); outer.addChild(inner);
    const outerCache = new NativePictureCache(outer); const innerCache = new NativePictureCache(inner);
    try {
        readGPU(outer, nestedRenderer); readGPU(outer, nestedRenderer); readGPU(outer, nestedRenderer);
        near(rgba(readGPU(outer, nestedRenderer), 2, 2), [0, 255, 0, 255], 'nested native Picture ownership');
        innerCache.invalidate(); readGPU(outer, nestedRenderer);
        child.x = 50;
        near(rgba(readGPU(outer, nestedRenderer), 2, 2), [0, 0, 0, 0], 'nested dirty propagation');
        near(rgba(readGPU(outer, nestedRenderer), 52, 2), [0, 255, 0, 255], 'nested dirty new placement');
        innerCache.dispose(); readGPU(outer, nestedRenderer);
        near(rgba(readGPU(outer, nestedRenderer), 52, 2), [0, 255, 0, 255], 'nested disable invalidates parent');
    } finally { innerCache.dispose(); outerCache.dispose(); nestedRenderer.dispose(); }

    const rasterParent = new Sprite(); const pictureChild = new Sprite(); const rasterInk = box(0xff0000);
    pictureChild.addChild(rasterInk); rasterParent.addChild(pictureChild); rasterParent.cacheAsTexture(true);
    const mixed = new NativePictureCache(pictureChild); const mixedRenderer = new SkiaRenderer();
    try {
        readGPU(rasterParent, mixedRenderer);
        Object.defineProperty(rasterInk, '$alpha', { value: .5, writable: true });
        mixed.invalidate();
        near(rgba(readGPU(rasterParent, mixedRenderer), 2, 2), [255, 0, 0, 128], 'explicit invalidation reaches image ancestor');
    } finally { mixed.dispose(); mixedRenderer.dispose(); rasterParent.cacheAsTexture(false); }

    const limited = new SkiaRenderer(1, false, true, { maxPictures: 1, maxRecordedDraws: 2 });
    const limitsStage = new Stage(); const a = box(0xff0000); const b = box(0x0000ff, 50);
    limitsStage.addChild(a); limitsStage.addChild(b);
    const ca = new NativePictureCache(a); const cb = new NativePictureCache(b);
    try {
        const pixels = readGPU(limitsStage, limited);
        near(rgba(pixels, 2, 2), [255, 0, 0, 255], 'evicted commands survive submitted frame');
        near(rgba(pixels, 52, 2), [0, 0, 255, 255], 'last retained Picture');
        assert(limited.pictureCacheStats.pictures === 1 && limited.pictureCacheStats.evictions > 0, 'Picture count limit');
        a.graphics.beginFill(0xffffff); a.graphics.drawRect(0, 32, 10, 10); a.graphics.drawRect(12, 32, 10, 10);
        readGPU(limitsStage, limited);
        assert(limited.pictureCacheStats.recordedDraws <= 2, 'recorded draw limit');
    } finally { ca.dispose(); cb.dispose(); limited.dispose(); limitsStage.removeChildren(); }

    const fontRoot = new TextField(); fontRoot.text = 'Native123'; fontRoot.size = 18;
    fontRoot.fontFamily = 'PictureTestFont'; fontRoot.width = 120; fontRoot.height = 40;
    const fontRenderer = new SkiaRenderer(); const fontCache = new NativePictureCache(fontRoot);
    try {
        readGPU(fontRoot, fontRenderer); const initial = fontRenderer.pictureCacheStats.rebuilds;
        registerFontMapping('PictureTestFont', 'resource/assets/fonts/ChakraPetch-Regular.ttf');
        fontRoot.invalidateTextMetrics(); readGPU(fontRoot, fontRenderer);
        assert(fontRenderer.pictureCacheStats.rebuilds === initial + 1, 'font readiness and metrics invalidation');
        registerFontMapping('PictureTestFont', 'resource/assets/fonts/ChakraPetch-Bold.ttf');
        readGPU(fontRoot, fontRenderer);
        assert(fontRenderer.pictureCacheStats.rebuilds === initial + 2, 'font revision invalidates replay');
    } finally { fontCache.dispose(); fontRenderer.dispose(); }

    const failedRoot = new Sprite(); const failedChild = new Shape(); failedRoot.addChild(failedChild);
    const failedCache = new NativePictureCache(failedRoot); const failureRenderer = new SkiaRenderer();
    try {
        Object.defineProperty(failedChild, '$renderObjectType', { value: 99, writable: true });
        let failed = false;
        try { readGPU(failedRoot, failureRenderer); } catch { failed = true; }
        assert(failed && failureRenderer.pictureCacheStats.pictures === 0, 'failed recording retains no Picture');
        Object.defineProperty(failedChild, '$renderObjectType', { value: 3 });
        failedChild.graphics.beginFill(0xffffff); failedChild.graphics.drawRect(0, 0, 10, 10);
        near(rgba(readGPU(failedRoot, failureRenderer), 2, 2), [255, 255, 255, 255], 'retry after recording failure');
    } finally { failedCache.dispose(); failureRenderer.dispose(); }

    const standalone = box(0xffffff); standalone.cacheAsTexture(true);
    let conflict = false;
    try { new NativePictureCache(standalone); } catch { conflict = true; }
    finally { standalone.cacheAsTexture(false); }
    assert(conflict, 'same root cache modes fail explicitly');
    const plain = new SkiaRenderer(1, false); const opted = new NativePictureCache(standalone);
    try {
        const pixels = readGPU(standalone, plain);
        standalone.cacheAsTexture(true); let lateConflict = false;
        try { readGPU(standalone, plain); } catch { lateConflict = true; }
        assert(lateConflict, 'texture caching enabled after Picture fails explicitly');
        standalone.cacheAsTexture(false); opted.dispose();
        equalPixels(pixels, readGPU(standalone, plain), 'disable restores ordinary drawing');
    } finally { opted.dispose(); plain.dispose(); }
    console.info('Kurot Skia: Picture resources/disposal/budgets/failure checks passed.');
}
