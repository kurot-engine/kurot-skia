import { Bitmap, BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter, Matrix, Rectangle, Shape, Sprite, Stage } from '@kurot/core';
import { SkiaRenderer } from '@kurot/skia';

import { assert, near, readGPU, rgba } from './gpu';

function box(color: number, x = 10, y = 10, width = 40, height = 40): Shape {
    const shape = new Shape();
    shape.graphics.beginFill(color);
    shape.graphics.drawRect(x, y, width, height);
    shape.graphics.endFill();
    return shape;
}

export function runEffectChecks(): void {
    const stage = new Stage();
    const renderer = new SkiaRenderer(2);
    try {
        const background = box(0x808080);
        const foreground = box(0x80c040);
        stage.addChild(background);
        stage.addChild(foreground);
        foreground.blendMode = 'multiply';
        near(rgba(readGPU(stage, renderer), 20, 20), [64, 96, 32, 255], 'multiply');
        foreground.blendMode = 'screen';
        near(rgba(readGPU(stage, renderer), 20, 20), [192, 224, 160, 255], 'screen');
        foreground.blendMode = 'destination-out';
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 0, 0, 0], 'erase');
        stage.removeChildren();

        const content = box(0xff0000, 0, 0, 60, 60);
        const mask = box(0xffffff, 0, 0, 20, 30);
        mask.x = 20;
        mask.y = 10;
        stage.addChild(content);
        stage.addChild(mask);
        content.mask = mask;
        const masked = readGPU(stage, renderer);
        near(rgba(masked, 25, 20), [255, 0, 0, 255], 'display mask relative transform');
        near(rgba(masked, 10, 20), [0, 0, 0, 0], 'display mask outside');
        mask.rotation = 30;
        readGPU(stage, renderer);
        content.mask = undefined;
        stage.removeChildren();

        const cached = new Sprite();
        const child = box(0xff0000);
        cached.addChild(child);
        cached.cacheAsTexture({ resolution: 2, scaleMode: 'nearest' });
        cached.alpha = 0.5;
        stage.addChild(cached);
        near(rgba(readGPU(stage, renderer), 20, 20), [255, 0, 0, 128], 'GPU cache alpha');
        const cache = cached.$displayList as unknown as { image?: { width(): number }; actualResolution: number };
        const first = cache.image;
        assert(first && cache.actualResolution === 2, 'cache GPU snapshot and explicit density');
        readGPU(stage, renderer);
        assert(cache.image === first, 'unchanged subtree reuses its GPU image');
        child.graphics.clear();
        child.graphics.beginFill(0x00ff00);
        child.graphics.drawRect(10, 10, 40, 40);
        child.graphics.endFill();
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 255, 0, 128], 'descendant cache invalidation');
        assert(cache.image !== first, 'changed subtree replaces its GPU snapshot');
        cached.x = 10;
        cached.alpha = 1;
        const next = cache.image;
        readGPU(stage, renderer);
        assert(cache.image === next, 'root transform and opacity do not re-rasterize cache');
        stage.removeChildren();
        readGPU(stage, renderer);
        assert(cache.image === undefined, 'absent cache releases GPU image');
        cached.cacheAsTexture(false);

        const nestedRoot = new Sprite(); const middle = new Sprite(); const nestedInk = box(0xff0000);
        middle.addChild(nestedInk); nestedRoot.addChild(middle); nestedRoot.cacheAsTexture({ resolution: 2 });
        stage.addChild(nestedRoot); near(rgba(readGPU(stage, renderer), 20, 20), [255, 0, 0, 255], 'nested cache initial content');
        nestedInk.graphics.clear(); nestedInk.graphics.beginFill(0x0000ff);
        nestedInk.graphics.drawRect(10, 10, 40, 40); nestedInk.graphics.endFill();
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 0, 255, 255], 'cache dirty propagates through ordinary containers');
        nestedInk.x = 60;
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 0, 0, 0], 'nested cache updates content bounds');
        near(rgba(readGPU(stage, renderer), 80, 20), [0, 0, 255, 255], 'nested cache renders shifted child');
        stage.removeChildren(); readGPU(stage, renderer); nestedRoot.cacheAsTexture(false);

        const colored = box(0xff0000);
        stage.addChild(colored);
        colored.filters = [new ColorMatrixFilter([
            0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
        ])];
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 255, 0, 255], 'color matrix');
        colored.filters = [new BlurFilter(8, 8)];
        assert(rgba(readGPU(stage, renderer), 9, 25)[3] > 0, 'native Gaussian blur expands ink');
        colored.filters = [new GlowFilter(0x00ff00, 1, 8, 8, 1)];
        assert(rgba(readGPU(stage, renderer), 9, 25)[1] > 0, 'native outer glow');
        colored.filters = [new DropShadowFilter(8, 0, 0x0000ff, 1, 0, 0, 1)];
        near(rgba(readGPU(stage, renderer), 55, 25), [0, 0, 255, 255], 'shadow offset');
        colored.filters = [new GlowFilter(0x00ff00, 1, 8, 8, 1, 1, true, true)];
        const inner = readGPU(stage, renderer);
        assert(rgba(inner, 10, 25)[1] > 0 && rgba(inner, 30, 30)[3] <= 2
            && rgba(inner, 9, 25)[3] === 0, 'inner knockout glow stays inside the source edge');
        stage.removeChildren();

        const gradient = new Shape();
        const matrix = new Matrix();
        matrix.createGradientBox(60, 30);
        gradient.graphics.beginGradientFill('linear', [0xff0000, 0x0000ff], [1, 1], [0, 255], matrix);
        gradient.graphics.drawRect(0, 0, 60, 30);
        gradient.graphics.endFill();
        stage.addChild(gradient);
        const ramp = readGPU(stage, renderer);
        assert(rgba(ramp, 2, 10)[0] > 230 && rgba(ramp, 57, 10)[2] > 230, 'native gradient matrix');
        gradient.tint = 0x808080;
        assert(rgba(readGPU(stage, renderer), 2, 10)[0] < 128, 'gradient tint');
        stage.removeChildren();
        const dashed = new Shape();
        dashed.graphics.lineStyle(4, 0xffffff, 1, false, 'normal', 'none', 'miter', 3, [6, 6]);
        dashed.graphics.moveTo(0, 10);
        dashed.graphics.lineTo(60, 10);
        stage.addChild(dashed);
        const dashes = readGPU(stage, renderer);
        assert(rgba(dashes, 2, 10)[3] > 200 && rgba(dashes, 9, 10)[3] === 0, 'native dash intervals');
        assert(dashed.$hitTest(2, 10) === dashed && !dashed.$hitTest(9, 10), 'dash gaps are not hit targets');
        stage.removeChildren();
        readGPU(stage, renderer);
    } finally {
        stage.removeChildren();
        renderer.dispose();
    }
    console.info('Kurot Skia: effects GPU checks passed (blend, mask, cache reuse/invalidation/disposal, filters, gradient, dash).');
}
