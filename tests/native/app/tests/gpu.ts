import type { DisplayObject } from '@kurot/core';
import { SkiaRenderer } from '@kurot/skia';
import { AlphaType, ColorType, Skia } from 'react-native-skia';
import type { SkImage } from 'react-native-skia';

export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

export function imageFromPixels(width: number, height: number, pixels: Uint8Array): SkImage {
    const data = Skia.Data.fromBytes(pixels);
    try {
        const image = Skia.Image.MakeImage({ width, height, colorType: ColorType.RGBA_8888,
            alphaType: AlphaType.Unpremul }, data, width * 4);
        assert(image, 'RGBA fixture allocation');
        return image;
    } finally {
        data.dispose();
    }
}

export function readGPU(object: DisplayObject, renderer: SkiaRenderer, width = 128, height = 128): Uint8Array {
    const surface = Skia.Surface.MakeOffscreen(width, height, { colorSpace: 'srgb' });
    assert(surface, 'GPU allocation');
    try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('transparent'));
        renderer.render(object, canvas);
        surface.flush(true);
        const image = surface.makeImageSnapshot();
        try {
            assert((image as SkImage & { isTextureBacked(): boolean }).isTextureBacked(), 'GPU backing required');
            const pixels = image.readPixels(0, 0, { width, height,
                colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
            assert(pixels instanceof Uint8Array, 'GPU readback');
            return pixels;
        } finally {
            image.dispose();
        }
    } finally {
        surface.dispose();
    }
}

export function rgba(pixels: Uint8Array, x: number, y: number, width = 128): number[] {
    return [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
}

export function near(actual: readonly number[], expected: readonly number[], description: string, tolerance = 2): void {
    assert(actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance),
        `${description}: ${actual.join(',')} != ${expected.join(',')}`);
}
