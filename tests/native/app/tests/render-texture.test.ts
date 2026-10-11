import { Mesh, Rectangle, RenderTexture, Shape, Sprite, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';
import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';
export function runRenderTextureChecks(): void {
    const renderer = new SkiaRenderer(); const stage = new Stage(); const texture = new RenderTexture();
    const shape = new Shape(); shape.graphics.beginFill(0x20c040); shape.graphics.drawRect(0, 0, 20, 20); shape.graphics.endFill();
    shape.x = 50; shape.rotation = 45; stage.addChild(shape);
    try {
        assert(texture.drawToTexture(shape, new Rectangle(2, 2, 8, 8), 2), 'native local clip capture');
        assert(texture.textureWidth === 16 && texture.textureHeight === 16, 'physical scale contract');
        near(texture.getPixel32(4, 4), [32, 192, 64, 255], 'native RGBA capture');
        assert(shape.x === 50 && shape.rotation === 45, 'capture preserves tree');
        assert(shape.$hitTest(50, 10), 'capture does not replace active hit hooks');
        shape.anchorOffsetX = 8; shape.anchorOffsetY = 6; shape.scaleX = 0; shape.alpha = 0; shape.visible = false;
        assert(texture.drawToTexture(shape), 'local capture accepts a singular or hidden root');
        near(texture.getPixel32(1, 1), [32, 192, 64, 255], 'local capture ignores root anchor and opacity');
        shape.anchorOffsetX = shape.anchorOffsetY = 0; shape.scaleX = 1; shape.alpha = 1; shape.visible = true;
        shape.graphics.clear(); shape.graphics.beginFill(0xe04020); shape.graphics.drawRect(0, 0, 20, 20); shape.graphics.endFill();
        assert(texture.drawToTexture(shape), 'capture replacement'); near(texture.getPixel32(4, 4), [224, 64, 32, 255], 'new snapshot');
        assert(!texture.drawToTexture(shape, new Rectangle(0, 0, 0, 0)), 'empty capture preserves output');
        texture.dispose(); assert(texture.getPixel32(0, 0).length === 0, 'capture disposal');
        readGPU(stage, renderer);
        checkSharedRendererCapture();
        console.info('Kurot Skia: RenderTexture checks passed (GPU capture, physical scale, clip, readback, replacement, hooks, dirty graphics/cache/mesh, disposal).');
    } finally { stage.removeChildren(); renderer.dispose(); texture.dispose(); }
}

function checkSharedRendererCapture(): void {
    const renderer = new SkiaRenderer(); const stage = new Stage(); const capture = new RenderTexture();
    const image = imageFromPixels(1, 1, new Uint8Array([240, 120, 60, 255]));
    const texture = createSkiaTexture(image);
    try {
        const shape = new Shape(); stage.addChild(shape);
        fill(shape, 0x2040e0);
        near(rgba(readGPU(stage, renderer), 9, 9), [32, 64, 224, 255], 'primary graphics initial frame');
        fill(shape, 0xe04020);
        assert(capture.drawToTexture(shape), 'changed graphics capture');
        near(rgba(readGPU(stage, renderer), 9, 9), [224, 64, 32, 255], 'capture preserves primary graphics update');

        stage.removeChildren();
        const cached = new Sprite(); cached.addChild(shape); cached.cacheAsBitmap = true; stage.addChild(cached);
        near(rgba(readGPU(stage, renderer), 9, 9), [224, 64, 32, 255], 'primary cached initial frame');
        fill(shape, 0x20c040);
        assert(capture.drawToTexture(cached), 'changed cached root capture');
        near(rgba(readGPU(stage, renderer), 9, 9), [32, 192, 64, 255], 'capture preserves primary cached subtree update');

        stage.removeChildren();
        const mesh = new Mesh(texture); mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1]; mesh.indices = [0, 1, 2, 2, 3, 0];
        mesh.vertices = [8, 8, 16, 8, 16, 16, 8, 16]; mesh.updateVertices(); stage.addChild(mesh);
        near(rgba(readGPU(stage, renderer), 9, 9), [240, 120, 60, 255], 'primary mesh initial frame');
        mesh.vertices = [28, 8, 36, 8, 36, 16, 28, 16]; mesh.updateVertices();
        assert(capture.drawToTexture(mesh, new Rectangle(0, 0, 40, 24)), 'changed mesh capture');
        const pixels = readGPU(stage, renderer);
        near(rgba(pixels, 9, 9), [0, 0, 0, 0], 'captured mesh leaves old geometry');
        near(rgba(pixels, 29, 9), [240, 120, 60, 255], 'capture preserves primary mesh update');
    } finally {
        stage.removeChildren(); renderer.dispose(); capture.dispose(); texture.dispose(); image.dispose();
    }
}

function fill(shape: Shape, color: number): void {
    shape.graphics.clear(); shape.graphics.beginFill(color); shape.graphics.drawRect(0, 0, 20, 20); shape.graphics.endFill();
}
