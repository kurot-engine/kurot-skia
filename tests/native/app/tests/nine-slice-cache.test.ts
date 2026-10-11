import { Bitmap, Rectangle, SpriteSheet, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';
import { AlphaType, ColorType, Skia } from 'react-native-skia';
import type { SkCanvas, SkImage } from 'react-native-skia';

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Native nine-slice cache check failed: ${message}`);
    }
}

function isDisposed(image: SkImage): boolean {
    try {
        image.width();
        return false;
    } catch {
        return true;
    }
}

function captureNineImages(canvas: SkCanvas, seen: SkImage[]): SkCanvas {
    return new Proxy(canvas, {
        get(target, property): unknown {
            if (property === 'drawImageNine') {
                const record: SkCanvas['drawImageNine'] = (...args): void => {
                    seen.push(args[0]);
                    target.drawImageNine(...args);
                };
                return record;
            }
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

/**
 * Verifies real native image reuse and disposal without exposing cache internals.
 */
export function runNineSliceCacheChecks(): void {
    const data = Skia.Data.fromBytes(new Uint8Array(32 * 32 * 4).fill(255));
    const image = Skia.Image.MakeImage({
        width: 32, height: 32, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul,
    }, data, 32 * 4);
    data.dispose();
    assert(!!image, 'source image allocation');
    const surface = Skia.Surface.MakeOffscreen(80, 80);
    assert(!!surface, 'GPU surface allocation');
    const renderer = new SkiaRenderer();
    const sheet = new SpriteSheet(createSkiaTexture(image));
    const stage = new Stage();
    const seen: SkImage[] = [];
    const canvas = captureNineImages(surface.getCanvas(), seen);
    try {
        const a = sheet.createTexture('a', 4, 4, 8, 8);
        const b = sheet.createTexture('b', 16, 4, 8, 8);
        const bitmap = new Bitmap(a);
        bitmap.scale9Grid = new Rectangle(2, 2, 4, 4);
        bitmap.width = 40;
        bitmap.height = 24;
        stage.addChild(bitmap);
        renderer.render(stage, canvas);
        const first = seen[0];
        assert(first !== image && first.width() === 8 && first.height() === 8, 'crop excludes the atlas');
        renderer.render(stage, canvas);
        assert(seen[1] === first, 'unchanged source region reuses the same native image');
        bitmap.width = 48;
        bitmap.smoothing = false;
        bitmap.scale9Grid = new Rectangle(1, 1, 6, 6);
        renderer.render(stage, canvas);
        assert(seen[2] === first, 'size, filtering and grid changes reuse source pixels');
        bitmap.texture = b;
        renderer.render(stage, canvas);
        const second = seen[3];
        assert(second !== first, 'a different atlas region gets a different image');
        bitmap.texture = a;
        renderer.render(stage, canvas);
        assert(seen[4] === first, 'switching skin frames preserves earlier crops of an active atlas');
        stage.removeChildren();
        renderer.render(stage, canvas);
        assert(isDisposed(first) && isDisposed(second), 'unused source evicts every owned crop');
        assert(image.width() === 32, 'eviction retains the caller-owned atlas');
        stage.addChild(bitmap);
        renderer.render(stage, canvas);
        const recreated = seen[5];
        assert(recreated !== first, 'an evicted frame is recreated on reuse');
        bitmap.scale9Grid = new Rectangle(1.25, 1, 6, 6);
        let rejected = false;
        try {
            renderer.render(stage, canvas);
        } catch (error) {
            rejected = error instanceof Error && error.message.includes('integer source-pixel boundaries');
        }
        assert(rejected, 'fractional physical splits fail explicitly instead of being silently rounded');
        bitmap.scale9Grid = new Rectangle(1, 1, 6, 6);
        renderer.render(stage, canvas);
        const finalFrame = seen.at(-1)!;
        surface.flush(true);
        renderer.dispose();
        assert(isDisposed(finalFrame) && image.width() === 32, 'renderer disposal releases crops only');
        console.info('Kurot Skia: native nine-slice cache checks passed (reuse, skin changes, eviction, disposal, split validation).');
    } finally {
        renderer.dispose();
        stage.removeChildren();
        sheet.dispose();
        surface.dispose();
        image.dispose();
    }
}
