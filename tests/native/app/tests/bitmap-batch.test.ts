import { Bitmap, Rectangle, Shape, Sprite, SpriteSheet, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';
import { Skia } from 'react-native-skia';
import { assert, imageFromPixels, readGPU } from './gpu';

export function runBitmapBatchChecks(): void {
    const data = new Uint8Array(16 * 8 * 4);
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 16; x++) data.set(x < 8 ? [240, 120, 40, 255] : [40, 160, 220, 128], (y * 16 + x) * 4);
    }
    const image = imageFromPixels(16, 8, data); const page = createSkiaTexture(image, 2);
    const sheet = new SpriteSheet(page); const a = sheet.createTexture('a', 0, 0, 8, 8); const b = sheet.createTexture('b', 8, 0, 8, 8);
    const stage = new Stage(); const root = new Sprite(); root.x = root.y = 10; root.tint = 0x80ffff;
    stage.addChild(root);
    const batch = new SkiaRenderer(1, false); const single = new SkiaRenderer(1, false, false);
    try {
        for (let i = 0; i < 20; i++) {
            const bitmap = new Bitmap(i < 10 ? b : a); bitmap.x = 8 + i % 5 * 18; bitmap.y = 8 + Math.floor(i / 5) * 18;
            bitmap.rotation = i * 9; bitmap.scaleX = bitmap.scaleY = 1.4;
            bitmap.tint = i < 10 ? 0xffffff : 0xff80ff;
            bitmap.anchorOffsetX = 2; bitmap.anchorOffsetY = 1; root.addChild(bitmap);
        }
        const compare = (message: string): void => {
            const expected = readGPU(stage, single); const actual = readGPU(stage, batch);
            const mismatch = actual.findIndex((value, i) => Math.abs(value - expected[i]) > 2);
            assert(mismatch === -1, `${message}: pixel ${Math.floor(mismatch / 4) % 128},${Math.floor(mismatch / 512)} channel ${mismatch % 4}: ${actual[mismatch]} vs ${expected[mismatch]}`);
        };
        compare('batch preserves atlas density, rotation, anchors, inherited tint/alpha and source alpha');
        const surface = Skia.Surface.MakeOffscreen(128, 128); assert(surface, 'batch operation surface');
        try { assert(batch.render(stage, surface.getCanvas()) === 11, 'opaque sprites batch; transparent source frames retain individual draws'); }
        finally { surface.dispose(); }
        root.alpha = .8; compare('inherited opacity uses the single painter without alpha quantization'); root.alpha = 1;
        (root.$children[3] as Bitmap).alpha = .75; (root.$children[14] as Bitmap).tint = 0x80ff80;
        compare('different sprite opacity and tint break batches without quantizing paint colors');
        for (const child of root.$children) (child as Bitmap).smoothing = false;
        compare('batch nearest filtering matches individual sprites');
        const bitmap = root.$children[7] as Bitmap;
        bitmap.flipX = true; compare('centered flip uses ordinary drawing without changing order');
        bitmap.flipX = false; bitmap.scaleY = .7; compare('nonuniform transform uses ordinary drawing');
        bitmap.scaleY = bitmap.scaleX; bitmap.scrollRect = new Rectangle(1, 1, 2, 2); compare('clip breaks a batch');
        bitmap.scrollRect = undefined;
        const shape = new Shape(); shape.graphics.beginFill(0xffffff); shape.graphics.drawRect(0, 0, 100, 20);
        shape.graphics.endFill(); root.addChildAt(shape, 10); compare('different render kinds preserve painter order');
        root.removeChildren(); readGPU(stage, batch);
        assert(image.width() === 16, 'batch eviction does not own the source');
    } finally { stage.removeChildren(); batch.dispose(); single.dispose(); page.dispose(); image.dispose(); }
    console.info('Kurot Skia: bitmap batching GPU checks passed (single-painter pixel oracle, density, transforms, filtering, tint/alpha, fallback order, disposal).');
}
