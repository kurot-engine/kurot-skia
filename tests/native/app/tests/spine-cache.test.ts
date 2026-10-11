import { Event, Stage } from '@kurot/core';
import { NativeSpineAnimationCache, SkiaRenderer } from '@kurot/skia';
import type { NativeSpineCacheSource } from '@kurot/skia';
import * as spine40 from '@kurot/spine-4.0';
import * as spine41 from '@kurot/spine-4.1';
import * as spine42 from '@kurot/spine-4.2';
import * as spine43 from '@kurot/spine-4.3';
import { Skia } from 'react-native-skia';
import { assert, readGPU } from './gpu';
import { loadNativeSkeleton } from './spine.test';

interface CacheFixture { createSource(): NativeSpineCacheSource; dispose(): void }
function throws(action: () => unknown, message: string): void {
    let failed = false;
    try { action(); } catch { failed = true; }
    assert(failed, message);
}
function compare(actual: Uint8Array, expected: Uint8Array, message: string): void {
    const mismatch = actual.findIndex((value, index) => Math.abs(value - expected[index]) > 2);
    assert(mismatch < 0, `${message}: byte ${mismatch}, ${actual[mismatch]} vs ${expected[mismatch]}`);
}
function advance(source: NativeSpineCacheSource, frame: number, rate: number): void {
    source.play('walk', -1); source.renderer.update(0);
    for (let i = 0; i < frame; i++) { source.renderer.update(1000 / rate); }
}
async function check(version: string, load: () => Promise<CacheFixture>): Promise<void> {
    const fixture = await load(); const stage = new Stage();
    const renderer = new SkiaRenderer(); const reference = new SkiaRenderer(1, false, false);
    const cache = new NativeSpineAnimationCache({ createSource: fixture.createSource, animation: 'walk' });
    const a = cache.createPlayer({ autoUpdate: false }); const b = cache.createPlayer({ autoUpdate: false });
    const live = fixture.createSource(); const other = fixture.createSource();
    const position = (object: NativeSpineCacheSource | typeof a, second = false): void => {
        object.x = second ? 86 : 40; object.y = 114;
        object.scaleX = second ? -.12 : .13; object.scaleY = .13;
        object.rotation = second ? -4 : 0; object.alpha = second ? .57 : 1; object.tint = second ? 0x80ffff : 0xffffff;
    };
    for (const object of [a, live]) { position(object); }
    for (const object of [b, other]) { position(object, true); }
    try {
        assert(cache.frameCount > 10 && cache.geometryBytes > 0, `Spine ${version} populated sampled geometry`);
        for (const frame of [0, 1, 7, 20, cache.frameCount - 1]) {
            a.seek(frame * 1000 / 60); b.seek((frame * 1000 / 60 + 61) % cache.durationMs);
            stage.addChild(a); stage.addChild(b); const actual = readGPU(stage, renderer);
            stage.removeChildren(); advance(live, Math.round(a.sampleTimeMs * 60 / 1000), 60);
            advance(other, Math.round(b.sampleTimeMs * 60 / 1000), 60);
            stage.addChild(live); stage.addChild(other); const expected = readGPU(stage, reference); stage.removeChildren();
            compare(actual, expected, `Spine ${version} sampled weighted poses, phases and paint`);
            assert(actual.some((value, index) => index % 4 === 3 && value), `Spine ${version} cache visible pixels`);
        }
        a.seek(61); b.seek(270); const time = a.sampleTimeMs;
        a.paused = true; a.advanceTime(100); assert(a.sampleTimeMs === time && b.sampleTimeMs !== time, 'independent paused phases');
        a.paused = false; a.setTimeScale(2); a.advanceTime(100); assert(a.currentTimeMs === 261, 'cache time scale');
        a.seek(cache.durationMs + 61); assert(a.sampleTimeMs === time, 'cache loop wrap');
        a.seek(-1); assert(a.sampleTimeMs === (cache.frameCount - 1) * 1000 / 60, 'cache negative seek');
        throws(() => a.seek(NaN), 'invalid cache seek'); throws(() => a.advanceTime(-1), 'invalid cache delta');
        const tracked = cache.createPlayer(); stage.addChild(tracked);
        assert(tracked.hasEventListener(Event.ENTER_FRAME), 'cached player attaches ticker');
        stage.removeChild(tracked); assert(!tracked.hasEventListener(Event.ENTER_FRAME), 'cached player detaches ticker');
        stage.addChild(tracked); tracked.dispose(); assert(!tracked.parent && !tracked.hasEventListener(Event.ENTER_FRAME), 'cache player disposal detaches');
        throws(() => tracked.advanceTime(1), 'disposed player rejects updates');
        const vertices = a.renderer.$children![0];
        assert(Object.isFrozen((vertices as typeof live.renderer.slotRenderers[0]).vertices), 'shared slot arrays are frozen');
        throws(() => new NativeSpineAnimationCache({ createSource: fixture.createSource, animation: 'walk', maxBytes: 1 }), 'cache byte budget enforced');
        throws(() => new NativeSpineAnimationCache({ createSource: fixture.createSource, animation: 'walk', maxFrames: 1 }), 'cache frame budget enforced');
        throws(() => new NativeSpineAnimationCache({ createSource: fixture.createSource, animation: 'missing' }), 'unknown cache action rejected');
        throws(() => new NativeSpineAnimationCache({ createSource: () => {
            const source = fixture.createSource(); source.renderer.x = 3; return source;
        }, animation: 'walk' }), 'modified source transforms cannot silently disappear in cached playback');

        const clean = new SkiaRenderer(); const make = Skia.MakeVertices; let allocations = 0;
        Skia.MakeVertices = (...args: Parameters<typeof make>): ReturnType<typeof make> => { allocations++; return make.apply(Skia, args); };
        try {
            a.seek(0); b.seek(0); stage.addChild(a); stage.addChild(b); readGPU(stage, clean);
            const initial = allocations; assert(initial > 0, 'cache builds native vertices');
            a.seek(100); b.seek(100); readGPU(stage, clean); assert(allocations > initial, 'different cache pose has distinct native geometry');
            const changed = allocations;
            a.seek(0); b.seek(0); readGPU(stage, clean); assert(allocations === changed, 'cached native pose reused across frames and actors');
            stage.removeChild(a); readGPU(stage, clean); assert(allocations === changed, 'one actor disposal preserves shared native owner');
        } finally { Skia.MakeVertices = make; clean.dispose(); stage.removeChildren(); }
        cache.dispose(); cache.dispose(); assert(!a.renderer.numChildren && !b.renderer.numChildren, 'cache disposes live player geometry');
        throws(() => cache.createPlayer(), 'disposed cache rejects players');
        throws(() => a.seek(0), 'disposed cache player rejects seek');
        readGPU(stage, renderer);
        const fresh = fixture.createSource(); position(fresh); stage.addChild(fresh); fresh.play('walk', -1);
        assert(readGPU(stage, renderer).some((value, index) => index % 4 === 3 && value), 'cache disposal borrows original atlas textures');
        stage.removeChildren(); fresh.stopAll();
    } finally { stage.removeChildren(); cache.dispose(); live.stopAll(); other.stopAll(); renderer.dispose(); reference.dispose(); fixture.dispose(); }
    console.info(`Kurot Skia: Spine ${version} shared cache passed (sample-time GPU oracle, phases, native reuse, bounds and lifecycle).`);
}

export async function runSpineCacheChecks(): Promise<void> {
    await check('4.0', async () => {
        const asset = await loadNativeSkeleton('4.0', spine40);
        return { createSource: () => new spine40.SkeletonAnimation(asset.animation.skeletonData), dispose: asset.dispose };
    });
    await check('4.1', async () => {
        const asset = await loadNativeSkeleton('4.1', spine41);
        return { createSource: () => new spine41.SkeletonAnimation(asset.animation.skeletonData), dispose: asset.dispose };
    });
    await check('4.2', async () => {
        const asset = await loadNativeSkeleton('4.2', spine42);
        return { createSource: () => new spine42.SkeletonAnimation(asset.animation.skeletonData), dispose: asset.dispose };
    });
    await check('4.3', async () => {
        const asset = await loadNativeSkeleton('4.3', spine43);
        return { createSource: () => new spine43.SkeletonAnimation(asset.animation.skeletonData), dispose: asset.dispose };
    });
}
