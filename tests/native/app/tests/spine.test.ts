import { Event, Mesh, Sprite, Stage } from '@kurot/core';
import { SkiaRenderer } from '@kurot/skia';
import * as spine40 from '@kurot/spine-4.0';
import * as spine41 from '@kurot/spine-4.1';
import * as spine42 from '@kurot/spine-4.2';
import * as spine43 from '@kurot/spine-4.3';

import { assert, readGPU } from './gpu';

export interface NativeSkeleton extends Sprite {
    readonly renderer: Sprite & { update(dt: number): void; readonly slotRenderers: Mesh[] };
    readonly skeletonData: { findAnimation(name: string): { duration: number } | Extract<ReturnType<spine42.SkeletonData['findAnimation']>, null> | undefined };
    play(name: string, loops?: number): { waitTrackEnd(): Promise<unknown> };
}

interface SpineSDK<Atlas, Loader, Data, Animation extends NativeSkeleton> {
    KurotAssetManager: new (prefix: string) => {
        loadTextureAtlas(path: string, success: (path: string, atlas: Atlas) => void, error: (path: string, message: string) => void): void;
        loadBinary(path: string, success: (path: string, bytes: Uint8Array) => void, error: (path: string, message: string) => void): void;
        dispose(): void;
    };
    AtlasAttachmentLoader: new (atlas: Atlas) => Loader;
    SkeletonBinary: new (loader: Loader) => { readSkeletonData(bytes: Uint8Array): Data };
    SkeletonAnimation: new (data: Data) => Animation;
}

export async function loadNativeSkeleton<Atlas, Loader, Data, Animation extends NativeSkeleton>(
    version: string, sdk: SpineSDK<Atlas, Loader, Data, Animation>,
): Promise<{ animation: Animation; dispose(): void }> {
    const manager = new sdk.KurotAssetManager(`resource/spine/${version}/`);
    try {
        const [atlas, bytes] = await Promise.all([
            new Promise<Atlas>((resolve, reject) => manager.loadTextureAtlas('spineboy.atlas', (_, value) => resolve(value),
                (_, message) => reject(new Error(message)))),
            new Promise<Uint8Array>((resolve, reject) => manager.loadBinary('spineboy-pro.skel', (_, value) => resolve(value),
                (_, message) => reject(new Error(message)))),
        ]);
        const data = new sdk.SkeletonBinary(new sdk.AtlasAttachmentLoader(atlas)).readSkeletonData(bytes);
        return { animation: new sdk.SkeletonAnimation(data), dispose: () => manager.dispose() };
    } catch (error) {
        manager.dispose();
        throw error;
    }
}

async function check(version: string, load: () => Promise<{ animation: NativeSkeleton; dispose(): void }>): Promise<void> {
    const resource = await load();
    const animation = resource.animation;
    const stage = new Stage();
    const renderer = new SkiaRenderer();
    try {
        assert(animation instanceof Sprite, `Spine ${version} host Core identity`);
        const meshes = animation.renderer.slotRenderers;
        assert(meshes.some((mesh) => mesh instanceof Mesh && mesh.visible && mesh.indices.length > 6), `Spine ${version} weighted meshes`);
        animation.x = 64;
        animation.y = 112;
        animation.scaleX = animation.scaleY = 0.16;
        assert(!animation.hasEventListener(Event.ENTER_FRAME), `Spine ${version} detached frame listener`);
        stage.addChild(animation);
        assert(animation.hasEventListener(Event.ENTER_FRAME), `Spine ${version} staged frame listener`);
        const track = animation.play('walk', 1);
        animation.renderer.update(0);
        const before = readGPU(stage, renderer);
        animation.renderer.update(180);
        const after = readGPU(stage, renderer);
        const reference = new SkiaRenderer(1, false, false);
        try {
            const expected = readGPU(stage, reference);
            const mismatch = after.findIndex((value, index) => Math.abs(value - expected[index]) > 2);
            assert(mismatch < 0, `Spine ${version} batched weighted-mesh pixels match individual draws: byte ${mismatch}`);
        } finally { reference.dispose(); }
        assert(before.some((value, index) => index % 4 === 3 && value > 0), `Spine ${version} visible GPU output`);
        assert(before.some((value, index) => value !== after[index]), `Spine ${version} animated GPU geometry`);
        let complete = false;
        const completion = track.waitTrackEnd().then(() => { complete = true; });
        animation.renderer.update((animation.skeletonData.findAnimation('walk')!.duration + 0.1) * 1000);
        await Promise.resolve();
        assert(complete, `Spine ${version} finite track completion`);
        await completion;
        stage.removeChild(animation);
        assert(!animation.hasEventListener(Event.ENTER_FRAME), `Spine ${version} remove frame listener`);
        stage.addChild(animation);
        stage.removeChild(animation);
        readGPU(stage, renderer);
    } finally {
        stage.removeChildren();
        renderer.dispose();
        resource.dispose();
    }
    console.info(`Kurot Skia: Spine ${version} native checks passed (binary, atlas, weighted mesh, animation, track, stage lifecycle).`);
}

export async function runSpineChecks(): Promise<void> {
    await check('4.0', () => loadNativeSkeleton('4.0', spine40));
    await check('4.1', () => loadNativeSkeleton('4.1', spine41));
    await check('4.2', () => loadNativeSkeleton('4.2', spine42));
    await check('4.3', () => loadNativeSkeleton('4.3', spine43));
}
