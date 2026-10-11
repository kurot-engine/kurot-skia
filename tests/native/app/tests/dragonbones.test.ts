import { Mesh, Sprite, Stage } from '@kurot/core';
import { KurotFactory, dragonBones } from '@kurot/dragonbones';
import { createSkiaTexture, getSkiaImage, SkiaRenderer } from '@kurot/skia';
import { makeAtlas, makeSkeleton } from './dragonbones-fixture';
import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';

export function runDragonBonesChecks(): void {
    const pixels = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) pixels.set([240, 80, 40, 255], (y * 128 + x) * 4);
    }
    const image = imageFromPixels(128, 128, pixels);
    const page = createSkiaTexture(image);
    const stage = new Stage(); const renderer = new SkiaRenderer();
    try {
        for (const options of [{}, { texture: 'rotated' }, { texture: 'trimmed' }, { mesh: true },
            { mesh: true, weighted: true }, { nested: true }, { color: { rM: 50, gM: 100, bM: 100, aM: 50 } }]) {
            const factory = new KurotFactory({ autoUpdate: false });
            try {
                factory.parseSkeleton(makeSkeleton(options)); factory.parseAtlas(makeAtlas(), page);
                const display = factory.buildArmatureDisplay('main');
                assert(display instanceof Sprite, 'DragonBones shares the host Core');
                const mesh: unknown = display.armature.getSlot('slot')?.display;
                if (!options.nested) assert(mesh instanceof Mesh, 'DragonBones image and mesh native primitive');
                stage.addChild(display);
                const before = readGPU(stage, renderer);
                assert(before.some((value, i) => i % 4 === 3 && value > 0), 'DragonBones atlas geometry has GPU pixels');
                if (options.color) near(rgba(before, 10, 20), [120, 80, 40, 128], 'DragonBones tint and alpha');
                if (options.weighted) {
                    assert(mesh instanceof Mesh && mesh.matrix.tx === 0 && mesh.vertices[0] === 10, 'weighted coordinates applied once');
                }
                if (options.mesh && !options.weighted) {
                    const slot = display.armature.getSlot('slot');
                    assert(slot?._displayFrame, 'DragonBones deform frame');
                    slot._displayFrame.deformVertices.splice(0, 8, 3, 4, 0, 0, 0, 0, 0, 0);
                    slot._verticesDirty = true; factory.advanceTime(1 / 60);
                    assert(mesh instanceof Mesh && mesh.vertices[0] === 3 && mesh.vertices[1] === 4, 'native deform invalidation');
                    readGPU(stage, renderer);
                }
                let completed = 0;
                display.addDBEventListener(dragonBones.EventObject.COMPLETE, () => { completed++; });
                display.animation.play('move', 1); factory.advanceTime(0.25);
                const moving = readGPU(stage, renderer);
                assert(moving.some((value, i) => value !== before[i]), 'DragonBones animated GPU geometry');
                factory.advanceTime(1);
                assert(completed === 1, 'DragonBones completion event');
                stage.removeChildren(); readGPU(stage, renderer); display.dispose();
                assert(factory.displayCount === 0 && display.disposed, 'DragonBones root and nested disposal');
            } finally { stage.removeChildren(); factory.dispose(); }
        }
        assert(page.bitmapData && getSkiaImage(page.bitmapData), 'DragonBones disposal preserves borrowed page');
    } finally { stage.removeChildren(); renderer.dispose(); page.dispose(); image.dispose(); }
    console.info('Kurot Skia: DragonBones GPU checks passed (image, rotated/trimmed atlas, weighted/deform mesh, nested, animation, tint, ownership).');
}
