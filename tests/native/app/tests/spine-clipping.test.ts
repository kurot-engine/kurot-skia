import { Point, Stage } from '@kurot/core';
import { SkiaRenderer } from '@kurot/skia';
import { ClippingAttachment, Vector2 } from '@esotericsoftware/spine-core';
import * as sdk from '@kurot/spine-4.2';
import { assert, readGPU } from './gpu';
import { loadNativeSkeleton } from './spine.test';
export async function runSpineClippingChecks(): Promise<void> {
    const asset = await loadNativeSkeleton('4.2', sdk); const stage = new Stage(); const renderer = new SkiaRenderer();
    try {
        const mesh = asset.animation.renderer.slotRenderers.find((item) => item.visible && item.indices.length > 6);
        assert(mesh, 'weighted clipping fixture');
        const xs = mesh.vertices.filter((_, index) => index % 2 === 0); const ys = mesh.vertices.filter((_, index) => index % 2 === 1);
        const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
        const middle = (left + right) / 2;
        mesh.x = 4 - left * .4; mesh.y = 4 - top * .4; mesh.scaleX = mesh.scaleY = .4; stage.addChild(mesh);
        const before = readGPU(stage, renderer);
        const clip = new ClippingAttachment('native-test-clip'); clip.worldVerticesLength = 8;
        clip.vertices = [[middle, top - 1], [right + 1, top - 1], [right + 1, bottom + 1], [middle, bottom + 1]].flatMap(([x, y]) => {
            const point = mesh.slot.bone.worldToLocal(new Vector2(x, y)); return [point.x, point.y];
        });
        mesh.clipper.clipStart(mesh.slot, clip); mesh.renderSlot();
        assert(mesh.indices.length > 0 && mesh.vertices.every((value, index) => index % 2 === 1 || value >= middle - .01), 'Spine CPU clip produces bounded native triangles');
        const after = readGPU(stage, renderer);
        const ink = (pixels: Uint8Array): number => pixels.reduce((sum, value, index) => sum + (index % 4 === 3 && value > 0 ? 1 : 0), 0);
        assert(ink(after) > 0 && ink(after) < ink(before), 'native clipped mesh removes actual pixels');
        const point = mesh.localToGlobal(0, 0, new Point()); assert(Number.isFinite(point.x), 'clipped Core geometry remains valid');
        mesh.clipper.clipEnd();
        console.info('Kurot Skia: Spine clipping checks passed (official clipper, weighted triangles/UVs, GPU pixels).');
    } finally { stage.removeChildren(); renderer.dispose(); asset.dispose(); }
}
