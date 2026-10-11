import { BlendMode, BlurFilter, Mesh, Rectangle, Shape, Sprite, SpriteSheet, Stage } from '@kurot/core';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';
import { Skia } from 'react-native-skia';
import { assert, imageFromPixels, readGPU } from './gpu';

export function runMeshBatchChecks(): void {
    const bytes = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) bytes.set([20 + x * 12, 30 + y * 10, 200, 40 + (x + y) % 8 * 30], (y * 16 + x) * 4);
    }
    const image = imageFromPixels(16, 16, bytes); const page = createSkiaTexture(image, 2);
    const sheet = new SpriteSheet(page); const a = sheet.createTexture('a', 0, 0, 8, 8);
    const b = sheet.createTexture('b', 8, 0, 8, 8); b.rotated = true;
    const stage = new Stage(); const root = new Sprite(); stage.addChild(root);
    const meshes = Array.from({ length: 4 }, (_, i) => {
        const mesh = new Mesh(i % 2 ? b : a);
        mesh.vertices = [8 + i * 10, 8 + i * 8, 65 + i * 10, 8, 65, 65 + i * 8, 8, 65];
        mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1]; mesh.indices = [0, 1, 2, 2, 3, 0];
        mesh.updateVertices(); root.addChild(mesh); return mesh;
    });
    const batch = new SkiaRenderer();
    const compare = (message: string): void => {
        const actual = readGPU(stage, batch);
        const reference = new SkiaRenderer(1, false, false);
        try {
            const expected = readGPU(stage, reference);
            const mismatch = actual.findIndex((value, index) => Math.abs(value - expected[index]) > 2);
            assert(mismatch < 0, `${message}: pixel ${Math.floor(mismatch / 4) % 128},${Math.floor(mismatch / 512)} channel ${mismatch % 4}: ${actual[mismatch]} vs ${expected[mismatch]}`);
        } finally { reference.dispose(); }
    };
    const draws = (): number => {
        const surface = Skia.Surface.MakeOffscreen(128, 128); assert(surface, 'mesh batch GPU allocation');
        try { return batch.render(stage, surface.getCanvas()); } finally { surface.dispose(); }
    };
    try {
        compare('ordered overlapping meshes retain translucent pixels, distinct frames and rotated density UVs');
        assert(draws() === 1, 'four compatible meshes use one native vertex draw');
        const duplicate = new Sprite(); duplicate.x = 12.25; duplicate.y = 16.5; duplicate.tint = 0x80ff80;
        duplicate.rotation = -9; stage.addChild(duplicate);
        const copies = meshes.map((mesh) => {
            const copy = new Mesh(mesh.texture); copy.vertices = mesh.vertices.slice(); copy.uvs = mesh.uvs.slice();
            copy.indices = mesh.indices.slice(); copy.updateVertices(); duplicate.addChild(copy); return copy;
        });
        compare('independent actors share geometry while retaining different transforms and paint');
        copies[1].vertices[0] += 12; copies[1].updateVertices();
        compare('diverging poses do not reuse another actor geometry');
        stage.removeChild(root); compare('removing one actor retains other shared native owners');
        stage.addChildAt(root, 0); compare('reattachment retains geometry and painter order');
        stage.removeChild(duplicate); compare('eviction releases only the removed actor buffers');
        root.x = 16.25; root.y = 4.5; root.rotation = 12; root.scaleX = .7; root.scaleY = 1.1;
        root.tint = 0x80ffff; root.alpha = .6;
        for (const mesh of meshes) mesh.alpha = .47;
        compare('parent transforms and fractional paint alpha/tint do not quantize per-vertex colors');
        compare('unchanged batched geometry remains reusable');
        meshes[1].vertices[0] += 24; meshes[1].uvs[0] = .4; meshes[1].updateVertices();
        compare('in-place position and UV edits invalidate merged geometry');
        meshes[1].indices = [0, 1, 3]; meshes[1].updateVertices(); compare('changed clipping topology retains order');
        meshes[1].visible = false; compare('hidden slots preserve order and membership');
        meshes[1].visible = true; meshes[2].tint = 0xff8080; compare('tint changes split runs');
        meshes[2].tint = 0xffffff; meshes[2].alpha = .8; compare('alpha changes split runs');
        meshes[2].alpha = .47; meshes[2].smoothing = false; compare('sampling changes split runs');
        meshes[2].smoothing = true; meshes[2].blendMode = BlendMode.ADD; compare('mixed additive slots split runs');
        for (const mesh of meshes) mesh.blendMode = BlendMode.ADD;
        compare('ordered additive meshes share a paint');
        for (const mesh of meshes) mesh.blendMode = BlendMode.NORMAL;
        meshes[2].x = 3; compare('local transform falls back'); meshes[2].x = 0;
        meshes[2].anchorOffsetX = 2; compare('local anchor falls back'); meshes[2].anchorOffsetX = 0;
        meshes[2].scrollRect = new Rectangle(0, 0, 35, 35); compare('local clips split runs'); meshes[2].scrollRect = undefined;
        meshes[2].filters = [new BlurFilter(2, 2)]; compare('local effects split runs'); meshes[2].filters = [];
        const shape = new Shape(); shape.graphics.beginFill(0xffffff); shape.graphics.drawRect(10, 10, 40, 40);
        shape.graphics.endFill(); root.addChildAt(shape, 2); compare('different render kinds preserve painter order');
        root.removeChild(shape); root.filters = [new BlurFilter(2, 2)]; compare('parent layer retains batching semantics'); root.filters = [];
        root.x = root.y = root.rotation = 0; root.scaleX = root.scaleY = root.alpha = 1;
        meshes[0].pixelHitTest = true; meshes[0].touchEnabled = true;
        meshes[0].vertices[0] += 12; meshes[0].updateVertices();
        assert(meshes[0].$hitTest(35, 25), 'native pixel hit consumes changed individual geometry');
        compare('pixel hit does not leave stale merged geometry');
        root.removeChildren(); readGPU(stage, batch); assert(image.width() === 16, 'run eviction borrows source images');
        for (const mesh of [...meshes].reverse()) root.addChild(mesh);
        compare('evicted runs rebuild after reattachment and changed draw order');
    } finally { stage.removeChildren(); batch.dispose(); page.dispose(); image.dispose(); }
    console.info('Kurot Skia: ordered Mesh batching GPU oracle passed (alpha/tint, UVs, topology, order, fallback, cache and lifecycle).');
}
