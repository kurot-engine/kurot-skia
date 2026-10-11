import { Bitmap, BitmapFillMode, SpriteSheet, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';

import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';

export function runBitmapChecks(): void {
    const renderer = new SkiaRenderer();
    const stage = new Stage();
    const colors = [[220, 80, 40, 255], [40, 160, 220, 255], [0, 0, 0, 0], [180, 220, 80, 128]];
    let cases = 0;
    try {
        for (const density of [1, 2]) {
            for (const rotated of [false, true]) {
                const bytes = new Uint8Array(32 * 32 * 4);
                for (let i = 0; i < bytes.length; i += 4) bytes.set([255, 0, 255, 255], i);
                for (let y = 0; y < 2 * density; y++) {
                    for (let x = 0; x < 4 * density; x++) {
                        const dx = rotated ? 2 * density - 1 - y : x;
                        const dy = rotated ? x : y;
                        bytes.set(colors[Math.floor(x / density)], ((3 + dy) * 32 + 2 + dx) * 4);
                    }
                }
                const image = imageFromPixels(32, 32, bytes);
                const sheet = new SpriteSheet(createSkiaTexture(image, density));
                const texture = sheet.createTexture('trim', 2, 3, 4 * density, 2 * density,
                    density, 2 * density, 6 * density, 5 * density);
                texture.rotated = rotated;
                try {
                    for (const mode of [BitmapFillMode.SCALE, BitmapFillMode.REPEAT, BitmapFillMode.CLIP]) {
                        for (const tint of [0xffffff, 0x80ff80]) {
                            const bitmap = new Bitmap(texture);
                            bitmap.smoothing = false;
                            bitmap.fillMode = mode;
                            bitmap.width = 12;
                            bitmap.height = 10;
                            bitmap.tint = tint;
                            stage.addChild(bitmap);
                            const pixels = readGPU(stage, renderer);
                            for (let y = 0; y < 12; y++) {
                                for (let x = 0; x < 14; x++) {
                                    let px = x + 0.5;
                                    let py = y + 0.5;
                                    if (mode === BitmapFillMode.SCALE) { px /= 2; py /= 2; }
                                    if (mode === BitmapFillMode.REPEAT) { px %= 6; py %= 5; }
                                    const inside = x < 12 && y < 10 && px >= 1 && px < 5 && py >= 2 && py < 4;
                                    const expected = inside ? [...colors[Math.floor(px - 1)]] : [0, 0, 0, 0];
                                    if (expected[3] > 0) {
                                        expected[0] *= ((tint >> 16) & 255) / 255;
                                        expected[1] *= ((tint >> 8) & 255) / 255;
                                        expected[2] *= (tint & 255) / 255;
                                    }
                                    near(rgba(pixels, x, y), expected, `fill ${density}/${rotated}/${mode}/${tint} at ${x},${y}`);
                                }
                            }
                            bitmap.pixelHitTest = true;
                            bitmap.touchEnabled = true;
                            assert(bitmap.$hitTest(mode === 'scale' ? 3 : 1.5, mode === 'scale' ? 5 : 2.5) === bitmap, 'opaque native pixel hit');
                            assert(bitmap.$hitTest(mode === 'scale' ? 7 : 3.5, mode === 'scale' ? 5 : 2.5) === undefined, 'transparent native pixel miss');
                            stage.removeChildren();
                            cases++;
                        }
                    }
                    const bitmap = new Bitmap(texture);
                    bitmap.smoothing = false;
                    bitmap.scale9Grid = undefined;
                    bitmap.alpha = 0.5;
                    stage.addChild(bitmap);
                    near(rgba(readGPU(stage, renderer), 1, 2), [220, 80, 40, 128], 'source alpha is multiplied once');
                    stage.removeChildren();
                } finally {
                    sheet.dispose();
                    image.dispose();
                }
            }
        }
    } finally {
        stage.removeChildren();
        renderer.dispose();
    }
    console.info(`Kurot Skia: bitmap GPU checks passed (${cases} trim/density/rotation/fill/tint cases, alpha, pixel hits).`);
}
