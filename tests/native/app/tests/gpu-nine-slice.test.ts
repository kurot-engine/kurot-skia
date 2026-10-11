import { Bitmap, Rectangle, Resource, SpriteSheet, Stage } from '@kurot/core';
import type { Texture } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';
import { AlphaType, ColorType, Skia } from 'react-native-skia';
import type { SkImage } from 'react-native-skia';

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`GPU nine-slice check failed: ${message}`);
    }
}

function readGPU(stage: Stage, renderer: SkiaRenderer, scale: number,
    width = 320, height = 240): Uint8Array {
    const surface = Skia.Surface.MakeOffscreen(width, height, { colorSpace: 'srgb' });
    assert(!!surface, 'GPU surface allocation');
    try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('transparent'));
        canvas.translate(1.25, 0.625);
        canvas.scale(scale, scale);
        renderer.render(stage, canvas);
        surface.flush(true);
        const image = surface.makeImageSnapshot();
        try {
            // Native Skia 3.3 exposes this JSI probe but omits it from the TS interface.
            const probe = image as SkImage & { isTextureBacked(): boolean };
            assert(probe.isTextureBacked(), 'snapshot must be GPU-backed; no raster fallback');
            const pixels = image.readPixels(0, 0, {
                width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul,
            });
            assert(pixels instanceof Uint8Array, 'GPU RGBA readback');
            return pixels;
        } finally {
            image.dispose();
        }
    } finally {
        surface.dispose();
    }
}

const regions = [
    [240, 30, 30, 255], [180, 90, 30, 255], [30, 30, 240, 255],
    [30, 180, 90, 255], [240, 240, 240, 255], [180, 30, 90, 255],
    [30, 240, 30, 255], [30, 90, 180, 255], [240, 240, 30, 255],
];

function uniformAtlas(resolution: number, alpha: number, patterned = false): SkImage {
    const width = 96;
    const bytes = new Uint8Array(width * width * 4);
    for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
            const inside = x >= 8 * resolution && x < 40 * resolution
                && y >= 8 * resolution && y < 40 * resolution;
            const column = x < 16 * resolution ? 0 : x < 32 * resolution ? 1 : 2;
            const row = y < 16 * resolution ? 0 : y < 32 * resolution ? 1 : 2;
            bytes.set(inside ? patterned ? regions[row * 3 + column] : [20, 135, 232, alpha]
                : [255, 0, 255, 255], (y * width + x) * 4);
        }
    }
    const data = Skia.Data.fromBytes(bytes);
    try {
        const image = Skia.Image.MakeImage({
            width, height: width, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul,
        }, data, width * 4);
        assert(!!image, 'atlas fixture');
        return image;
    } finally {
        data.dispose();
    }
}

function compareInterior(bitmap: Bitmap, sliced: Uint8Array, reference: Uint8Array,
    scale: number, description: string): void {
    let checked = 0;
    for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 320; x++) {
            const point = bitmap.globalToLocal((x + 0.5 - 1.25) / scale, (y + 0.5 - 0.625) / scale);
            if (point.x < 2 || point.x > bitmap.width - 2 || point.y < 2 || point.y > bitmap.height - 2) {
                continue;
            }
            const index = (y * 320 + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
                assert(Math.abs(sliced[index + channel] - reference[index + channel]) <= 2,
                    `${description}: seam or atlas bleed at (${x}, ${y}), channel ${channel}: `
                    + `${sliced[index + channel]} versus ${reference[index + channel]}`);
            }
            checked++;
        }
    }
    assert(checked > 1000, `${description}: interior coverage includes both seam axes and intersections`);
}

function checkUniformAtlas(renderer: SkiaRenderer): number {
    const stage = new Stage();
    let cases = 0;
    try {
        for (const resolution of [1, 2]) {
            for (const sourceAlpha of [255, 128]) {
                const image = uniformAtlas(resolution, sourceAlpha);
                const texture = createSkiaTexture(image, resolution);
                const sheet = new SpriteSheet(texture);
                try {
                    const frame = sheet.createTexture('flat', 8 * resolution, 8 * resolution,
                        32 * resolution, 32 * resolution);
                    const bitmap = new Bitmap(frame);
                    bitmap.x = 30.25;
                    bitmap.y = 24.5;
                    bitmap.width = 104;
                    bitmap.height = 56;
                    bitmap.alpha = sourceAlpha === 255 ? 1 : 0.65;
                    const grid = new Rectangle(8, 8, 16, 16);
                    stage.addChild(bitmap);
                    for (const smoothing of [false, true]) {
                        bitmap.smoothing = smoothing;
                        for (const transform of [
                            { scale: 1.37, rotation: 0, flipX: false },
                            { scale: 1.117, rotation: 17, flipX: false },
                            { scale: 1.37, rotation: -13, flipX: true },
                        ]) {
                            bitmap.rotation = transform.rotation;
                            bitmap.flipX = transform.flipX;
                            bitmap.scale9Grid = grid;
                            const sliced = readGPU(stage, renderer, transform.scale);
                            bitmap.scale9Grid = undefined;
                            const reference = readGPU(stage, renderer, transform.scale);
                            compareInterior(bitmap, sliced, reference, transform.scale,
                                `density ${resolution}, alpha ${sourceAlpha}, smoothing ${smoothing}, `
                                + `scale ${transform.scale}, rotation ${transform.rotation}, flip ${transform.flipX}`);
                            cases++;
                        }
                    }
                    stage.removeChild(bitmap);
                } finally {
                    stage.removeChildren();
                    sheet.dispose();
                    image.dispose();
                }
            }
        }
    } finally {
        stage.removeChildren();
    }
    return cases;
}

function checkGeometry(renderer: SkiaRenderer): number {
    const stage = new Stage();
    const scale = 1.37;
    let cases = 0;
    for (const resolution of [1, 2]) {
        const image = uniformAtlas(resolution, 255, true);
        const texture = createSkiaTexture(image, resolution);
        const sheet = new SpriteSheet(texture);
        try {
            for (const trimmed of [false, true]) {
                const ox = trimmed ? 4 : 0;
                const oy = trimmed ? 6 : 0;
                const frame = sheet.createTexture(`pattern-${trimmed}`, 8 * resolution, 8 * resolution,
                    32 * resolution, 32 * resolution, ox * resolution, oy * resolution,
                    (32 + 2 * ox) * resolution, (32 + 2 * oy) * resolution);
                const bitmap = new Bitmap(frame);
                bitmap.x = 30.25;
                bitmap.y = 24.5;
                bitmap.smoothing = false;
                bitmap.scale9Grid = new Rectangle(ox + 8, oy + 8, 16, 16);
                stage.addChild(bitmap);
                for (const size of [104, 16, 12]) {
                    bitmap.width = size + 2 * ox;
                    bitmap.height = (size === 104 ? 56 : size) + 2 * oy;
                    const pixels = readGPU(stage, renderer, scale);
                    const sample = (x: number, y: number, expected: number[]): void => {
                        const px = Math.floor(1.25 + (bitmap.x + x) * scale);
                        const py = Math.floor(0.625 + (bitmap.y + y) * scale);
                        const index = (py * 320 + px) * 4;
                        assert(expected.every((value, channel) => Math.abs(value - pixels[index + channel]) <= 2),
                            `density ${resolution}, trim ${trimmed}, size ${size}: region at (${x}, ${y})`);
                    };
                    if (size === 104) {
                        const xs = [ox + 4, ox + 52, ox + 100];
                        const ys = [oy + 4, oy + 28, oy + 52];
                        for (let row = 0; row < 3; row++) {
                            for (let column = 0; column < 3; column++) {
                                sample(xs[column], ys[row], regions[row * 3 + column]);
                            }
                        }
                    } else if (size === 16) {
                        // Both stretched axes collapse; the four fixed corners still fill the frame.
                        sample(ox + 4, oy + 4, regions[0]);
                        sample(ox + 12, oy + 4, regions[2]);
                        sample(ox + 4, oy + 12, regions[6]);
                        sample(ox + 12, oy + 12, regions[8]);
                    } else {
                        // Below fixed border size Core scales the whole frame, including its center.
                        sample(ox + 6, oy + 6, regions[4]);
                    }
                    if (trimmed) {
                        sample(2, oy + size / 2, [0, 0, 0, 0]);
                    }
                    cases++;
                }
                stage.removeChild(bitmap);
            }
        } finally {
            stage.removeChildren();
            sheet.dispose();
            image.dispose();
        }
    }
    return cases;
}

async function checkButtonAtlas(renderer: SkiaRenderer): Promise<number> {
    const resources = new Resource();
    const stage = new Stage();
    let cases = 0;
    try {
        await resources.loadConfig('resource/resource.json', 'resource/');
        await resources.loadGroup('preload');
        for (const name of ['button_up', 'button_down', 'button_disabled']) {
            const texture = resources.get<Texture>(`kui.${name}`);
            assert(!!texture && texture.resolution === 2, `${name}: original 2× KUI frame`);
            const bitmap = new Bitmap(texture);
            bitmap.x = 10.25;
            bitmap.y = 5.5;
            bitmap.width = 280;
            bitmap.height = 56;
            stage.addChild(bitmap);
            for (const alpha of [1, 0.5]) {
                bitmap.alpha = alpha;
                for (const scale of [1.117, 3.35]) {
                    bitmap.scale9Grid = new Rectangle(16, 16, 16, 16);
                    const sliced = readGPU(stage, renderer, scale, 1024, 256);
                    bitmap.scale9Grid = undefined;
                    const reference = readGPU(stage, renderer, scale, 1024, 256);
                    // This band is uniform in the authored PNG and crosses both horizontal joins.
                    for (let y = Math.ceil(0.625 + (bitmap.y + 8) * scale);
                        y < 0.625 + (bitmap.y + 48) * scale; y++) {
                        for (let x = Math.ceil(1.25 + (bitmap.x + 100) * scale);
                            x < 1.25 + (bitmap.x + 180) * scale; x++) {
                            const index = (y * 1024 + x) * 4;
                            for (let channel = 0; channel < 4; channel++) {
                                assert(Math.abs(sliced[index + channel] - reference[index + channel]) <= 2,
                                    `${name}, alpha ${alpha}, scale ${scale}: horizontal seam at (${x}, ${y})`);
                            }
                        }
                    }
                    cases++;
                }
            }
            stage.removeChild(bitmap);
        }
    } finally {
        stage.removeChildren();
        resources.destroyAll();
    }
    return cases;
}

/**
 * Reads real Graphite GPU pixels, including fractional joins that CPU integer tests miss.
 */
export async function runGPUNineSliceChecks(): Promise<void> {
    const renderer = new SkiaRenderer();
    try {
        const cases = checkUniformAtlas(renderer) + checkGeometry(renderer) + await checkButtonAtlas(renderer);
        console.info(`Kurot Skia: GPU nine-slice checks passed (${cases} cases: density, filtering, alpha, rotation, flip, trim, borders, KUI).`);
    } finally {
        renderer.dispose();
    }
}
