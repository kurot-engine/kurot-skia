import { BlurFilter, Rectangle, Shape, Sprite, Stage, TextField } from '@kurot/core';
import { NativePictureCache, SkiaRenderer } from '@kurot/skia';
import { assert, near, readGPU, rgba } from './gpu';

export function box(color: number, x = 0, y = 0): Shape {
    const shape = new Shape();
    shape.x = x; shape.y = y;
    shape.graphics.beginFill(color); shape.graphics.drawRect(0, 0, 36, 30); shape.graphics.endFill();
    return shape;
}

export function equalPixels(actual: Uint8Array, expected: Uint8Array, name: string): void {
    assert(actual.length === expected.length, name + ' dimensions');
    for (let index = 0; index < actual.length; index++) {
        assert(Math.abs(actual[index] - expected[index]) <= 2,
            `${name} at channel ${index}: ${actual[index]} != ${expected[index]}`);
    }
}

export function runPictureCacheChecks(): void {
    const stage = new Stage(); const root = new Sprite(); stage.addChild(root);
    const first = box(0xf07030, 8, 8); const second = box(0x30b0e0, 20, 18);
    first.alpha = .6; second.alpha = .7; root.addChild(first); root.addChild(second);
    const text = new TextField(); text.text = 'Hi 中'; text.size = 15; text.width = 100; text.height = 26;
    text.y = 58; text.stroke = 1; root.addChild(text);
    const renderer = new SkiaRenderer();
    const ordinaryPixels = (): Uint8Array => {
        const reference = new SkiaRenderer(1, false);
        try { return readGPU(stage, reference); } finally { reference.dispose(); }
    };
    let cache: NativePictureCache | undefined;
    const compare = (name: string): void => {
        const ordinary = ordinaryPixels();
        cache = new NativePictureCache(root);
        try { equalPixels(readGPU(stage, renderer), ordinary, name); }
        finally { cache.dispose(); cache = undefined; }
    };
    try {
        const ordinary = ordinaryPixels();
        cache = new NativePictureCache(root);
        equalPixels(readGPU(stage, renderer), ordinary, 'initial text/Graphics');
        const initial = renderer.pictureCacheStats.rebuilds;
        readGPU(stage, renderer);
        assert(renderer.pictureCacheStats.rebuilds === initial && renderer.pictureCacheStats.hits > 0, 'Picture hit');
        // Primitive owners evict their unused Paragraph/path wrappers after a
        // hit. The Picture must keep its own native drawing resources alive.
        equalPixels(readGPU(stage, renderer), ordinary, 'replay after primitive eviction');
        root.x = 3.25; root.y = 2.75; root.scaleX = 1.2; root.scaleY = .9; root.rotation = 7;
        readGPU(stage, renderer);
        assert(renderer.pictureCacheStats.rebuilds === initial, 'root placement reuses Picture');
        root.alpha = .5;
        const translucent = readGPU(stage, renderer);
        assert(renderer.pictureCacheStats.rebuilds === initial + 1, 'root alpha re-records per-child opacity');
        cache.dispose(); cache = undefined;
        equalPixels(translucent, ordinaryPixels(), 'overlapping root opacity');
        root.alpha = 1; root.x = root.y = root.rotation = 0; root.scaleX = root.scaleY = 1;
        cache = new NativePictureCache(root);
        readGPU(stage, renderer);
        first.graphics.clear(); first.graphics.beginFill(0x10e050); first.graphics.drawRect(0, 0, 36, 30);
        near(rgba(readGPU(stage, renderer), 10, 10), [16, 224, 80, 153], 'descendant Graphics invalidation');
        text.text = 'Changed'; text.size = 12; readGPU(stage, renderer);
        const changed = readGPU(stage, renderer); cache.dispose(); cache = undefined;
        equalPixels(changed, ordinaryPixels(), 'text invalidation');
        compare('rebuilt contents');
        cache = new NativePictureCache(root); readGPU(stage, renderer);
        const added = box(0xffffff, 76, 8); root.addChild(added);
        near(rgba(readGPU(stage, renderer), 80, 12), [255, 255, 255, 255], 'root addChild invalidation');
        root.removeChild(added);
        near(rgba(readGPU(stage, renderer), 80, 12), [0, 0, 0, 0], 'root removeChild invalidation');
        root.sortableChildren = true; first.alpha = second.alpha = 1;
        readGPU(stage, renderer); first.zIndex = 2;
        near(rgba(readGPU(stage, renderer), 25, 25), [16, 224, 80, 255], 'zIndex invalidation');
        root.tint = 0x80a0c0; readGPU(stage, renderer);
        const tinted = readGPU(stage, renderer); cache.dispose(); cache = undefined;
        equalPixels(tinted, ordinaryPixels(), 'inherited tint');
        root.tint = 0xffffff; root.scrollRect = new Rectangle(6, 4, 74, 90);
        second.filters = [new BlurFilter(2, 2)];
        compare('scroll clip and descendant blur');
        const mask = box(0xffffff, 10, 10); stage.addChild(mask); second.mask = mask;
        compare('external descendant mask');
        cache = new NativePictureCache(root); readGPU(stage, renderer);
        root.x = 7.5; const movingMask = readGPU(stage, renderer);
        cache.dispose(); cache = undefined;
        equalPixels(movingMask, ordinaryPixels(), 'root movement relative to external mask');
        root.x = 0; cache = new NativePictureCache(root); readGPU(stage, renderer);
        mask.x += 15; const masked = readGPU(stage, renderer); cache.dispose(); cache = undefined;
        equalPixels(masked, ordinaryPixels(), 'external mask changes');
        second.mask = undefined; stage.removeChild(mask); second.filters = [];
        root.scrollRect = undefined;
        const maskParent = new Sprite(); const maskGroup = new Sprite(); const maskInk = box(0xffffff, 10, 10);
        maskGroup.addChild(maskInk); maskParent.addChild(maskGroup); stage.addChild(maskParent); second.mask = maskGroup;
        cache = new NativePictureCache(root); readGPU(stage, renderer);
        maskInk.x += 12; const changedMaskChild = readGPU(stage, renderer);
        cache.dispose(); cache = undefined;
        equalPixels(changedMaskChild, ordinaryPixels(), 'external mask descendant changes');
        cache = new NativePictureCache(root); readGPU(stage, renderer);
        maskParent.x = 9.25; const changedMaskParent = readGPU(stage, renderer);
        cache.dispose(); cache = undefined;
        equalPixels(changedMaskParent, ordinaryPixels(), 'external mask ancestor transform');
        second.mask = undefined; stage.removeChild(maskParent);
        // A primitive can itself be a cache root, independently of a container.
        const own = new NativePictureCache(text);
        try {
            readGPU(stage, renderer); text.text = 'Own root'; const pixels = readGPU(stage, renderer);
            own.dispose(); equalPixels(pixels, ordinaryPixels(), 'root text change');
        } finally { own.dispose(); }
        cache = new NativePictureCache(root); readGPU(stage, renderer);
        const before = renderer.pictureCacheStats.rebuilds; cache.invalidate(); readGPU(stage, renderer);
        assert(renderer.pictureCacheStats.rebuilds === before + 1, 'explicit invalidation');
        stage.removeChildren(); readGPU(stage, renderer);
        assert(renderer.pictureCacheStats.pictures === 0, 'absent roots evicted');
        cache.dispose(); cache = undefined;
        console.info('Kurot Skia: Picture pixels/dirty checks passed.');
    } finally { cache?.dispose(); stage.removeChildren(); renderer.dispose(); }
}
