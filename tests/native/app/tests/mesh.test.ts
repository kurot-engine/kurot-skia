import { BlendMode, Mesh, Sprite, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';

import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';

export function runMeshChecks(): void {
    const bytes = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < bytes.length; i += 4) bytes.set([240, 120, 60, 255], i);
    const image = imageFromPixels(8, 8, bytes);
    const texture = createSkiaTexture(image);
    const stage = new Stage();
    const renderer = new SkiaRenderer();
    try {
        const mesh = new Mesh(texture);
        mesh.vertices = [10, 10, 50, 10, 50, 50, 10, 50];
        mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
        mesh.indices = [0, 1, 2, 2, 3, 0];
        mesh.updateVertices();
        stage.addChild(mesh);
        near(rgba(readGPU(stage, renderer), 20, 20), [240, 120, 60, 255], 'textured mesh quad');
        mesh.tint = 0x80ff80;
        mesh.alpha = 0.5;
        near(rgba(readGPU(stage, renderer), 20, 20), [120.47, 120, 30.12, 128], 'mesh tint and alpha');
        mesh.alpha = 1;
        mesh.tint = 0xffffff;
        mesh.vertices[0] = mesh.vertices[6] = 30;
        mesh.updateVertices();
        near(rgba(readGPU(stage, renderer), 20, 20), [0, 0, 0, 0], 'in-place geometry invalidation');
        near(rgba(readGPU(stage, renderer), 40, 20), [240, 120, 60, 255], 'updated geometry');
        const parent = new Sprite();
        parent.x = 60;
        parent.flipX = true;
        parent.addChild(mesh);
        stage.addChild(parent);
        assert(readGPU(stage, renderer).some((value, index) => index % 4 === 3 && value > 0), 'mesh transformed hierarchy');
        stage.removeChildren();
        mesh.x = -20;
        mesh.blendMode = BlendMode.ADD;
        stage.addChild(mesh);
        const under = new Mesh(texture);
        under.vertices = [0, 0, 60, 0, 60, 60, 0, 60];
        under.uvs = [...mesh.uvs];
        under.indices = [...mesh.indices];
        under.updateVertices();
        stage.addChildAt(under, 0);
        near(rgba(readGPU(stage, renderer), 15, 20), [255, 240, 120, 255], 'native additive mesh');
        stage.removeChildren();
        readGPU(stage, renderer);
        assert(image.width() === 8, 'renderer evicts mesh/shader caches without owning source');
    } finally {
        stage.removeChildren();
        renderer.dispose();
        texture.dispose();
        image.dispose();
    }
    console.info('Kurot Skia: mesh GPU checks passed (UVs, geometry invalidation, tint, alpha, transforms, additive, disposal).');
}
