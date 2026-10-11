import { SpriteSheet, Stage } from '@kurot/core';
import { ParticleSystem } from '@kurot/game';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';

import { assert, imageFromPixels, readGPU } from './gpu';

export function runParticleAtlasChecks(): void {
    for (const density of [1, 2]) {
        for (const rotated of [false, true]) {
            const width = 4 * density; const height = 2 * density;
            const upright = new Uint8Array(width * height * 4);
            const atlas = new Uint8Array(32 * 32 * 4);
            for (let i = 0; i < atlas.length; i += 4) atlas.set([255, 0, 255, 255], i);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const color = [40 + x * 10, 180 - y * 10, 40, 255];
                    upright.set(color, (y * width + x) * 4);
                    const dx = rotated ? height - 1 - y : x;
                    const dy = rotated ? x : y;
                    atlas.set(color, ((3 + dy) * 32 + 2 + dx) * 4);
                }
            }
            const image = imageFromPixels(32, 32, atlas);
            const referenceImage = imageFromPixels(width, height, upright);
            const sheet = new SpriteSheet(createSkiaTexture(image, density));
            const referenceSheet = new SpriteSheet(createSkiaTexture(referenceImage, density));
            const texture = sheet.createTexture('trim', 2, 3, width, height,
                density, 2 * density, 6 * density, 5 * density);
            texture.rotated = rotated;
            const reference = referenceSheet.createTexture('trim', 0, 0, width, height,
                density, 2 * density, 6 * density, 5 * density);
            const actualStage = new Stage(); const expectedStage = new Stage();
            const actual = new ParticleSystem(texture, 100);
            const expected = new ParticleSystem(reference, 100);
            const renderer = new SkiaRenderer();
            try {
                for (const system of [actual, expected]) {
                    system.setCurrentParticles(3);
                    system.tint = 0x80ffff;
                    system.particles.forEach((particle, index) => {
                        particle.x = 20.3 + index * 30; particle.y = 30.7;
                        particle.rotation = index * 23; particle.scale = 3.7;
                        particle.alpha = index === 1 ? .5 : 1;
                        particle.blendMode = index === 2 ? 1 : 0;
                    });
                }
                actualStage.addChild(actual); expectedStage.addChild(expected);
                const target = readGPU(actualStage, renderer);
                const oracle = readGPU(expectedStage, renderer);
                const mismatch = target.findIndex((value, index) => Math.abs(value - oracle[index]) > 2);
                assert(mismatch === -1, `particle atlas edges ${density}/${rotated}: channel ${mismatch}, ${target[mismatch]} != ${oracle[mismatch]}`);
                actualStage.removeChildren(); readGPU(actualStage, renderer);
                assert(image.width() === 32, 'particle cache eviction retains the borrowed atlas');
            } finally {
                actual.stop(true); expected.stop(true);
                actualStage.removeChildren(); expectedStage.removeChildren(); renderer.dispose();
                sheet.dispose(); referenceSheet.dispose(); image.dispose(); referenceImage.dispose();
            }
        }
    }
    console.info('Kurot Skia: particle GPU checks passed (isolated-frame oracle, atlas edges, rotation, trim, density, alpha, tint, blend, eviction).');
}
