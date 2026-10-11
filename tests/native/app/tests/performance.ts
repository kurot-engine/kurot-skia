import { Bitmap, BitmapFont, BitmapText, Resource, Sprite, SpriteSheet, Stage, TextField, ticker } from '@kurot/core';
import { MovieClip, MovieClipDataFactory, ParticleSystem } from '@kurot/game';
import { createSkiaTexture, NativeSpineAnimationCache, SkiaRenderer } from '@kurot/skia';
import * as spine42 from '@kurot/spine-4.2';
import { Skia } from 'react-native-skia';
import { Platform } from 'react-native';
import { ArrayCollection, List, VerticalLayout } from '@kurot/ui';
import { makeGallery, Row } from './ui-gallery.test';
import { installNativeUI } from '../src/ui/native-ui';
import { assert, imageFromPixels } from './gpu';
import { reportResult } from './report';
import { loadNativeSkeleton } from './spine.test';

type Distribution = { p50: number; p95: number; p99: number; max: number };
export interface BenchmarkResult {
    name: string; draws: number; samples: number; overBudgetPercent: number; update: Distribution; record: Distribution; gpuWait: Distribution; total: Distribution;
}
function distribution(values: number[]): Distribution {
    values.sort((a, b) => a - b);
    const p = (q: number): number => Math.round(values[Math.ceil(values.length * q) - 1] * 1000) / 1000;
    return { p50: p(.5), p95: p(.95), p99: p(.99), max: values.at(-1)! };
}
async function benchmark(name: string, stage: Stage, update: (frame: number) => void, isActive: () => boolean): Promise<BenchmarkResult> {
    const renderer = new SkiaRenderer(2);
    const surface = Skia.Surface.MakeOffscreen(720, 1280, { colorSpace: 'srgb' });
    assert(surface, 'benchmark GPU allocation');
    const updates: number[] = []; const records: number[] = []; const waits: number[] = []; const totals: number[] = [];
    let draws = 0;
    try {
        for (let frame = 0; frame < 150; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (!isActive()) throw new Error('Benchmark cancelled');
            const start = performance.now(); update(frame); const updated = performance.now();
            const canvas = surface.getCanvas(); canvas.clear(Skia.Color('#10192b')); canvas.save(); canvas.scale(2, 2);
            try { draws = renderer.render(stage, canvas); } finally { canvas.restore(); }
            const recorded = performance.now(); surface.flush(true); const end = performance.now();
            if (frame >= 30) { updates.push(updated - start); records.push(recorded - updated); waits.push(end - recorded); totals.push(end - start); }
        }
        const result = { name, draws, samples: totals.length, overBudgetPercent: Math.round(totals.filter((ms) => ms > 1000 / 60).length / totals.length * 1000) / 10, update: distribution(updates), record: distribution(records),
            gpuWait: distribution(waits), total: distribution(totals) };
        console.info('KUROT_BENCHMARK ' + JSON.stringify(result));
        await reportResult({ type: 'benchmark', ...result });
        return result;
    } finally { renderer.dispose(); surface.dispose(); }
}
export async function runBenchmarks(isActive: () => boolean = () => true): Promise<BenchmarkResult[]> {
    console.info(`KUROT_BENCHMARK_ENV ${JSON.stringify({ platform: Platform.OS, version: Platform.Version, development: __DEV__,
        target: '60 FPS / 16.67 ms', surface: '720x1280 offscreen GPU, synchronous flush, 30 warmup + 120 samples', device: 'simulator/emulator; not a Release hardware gate' })}`);
    const image = imageFromPixels(16, 16, new Uint8Array(16 * 16 * 4).fill(255));
    const texture = createSkiaTexture(image); const stage = new Stage(); stage.setContentSize(360, 640);
    const results: BenchmarkResult[] = [];
    const add = (object: Bitmap | BitmapText | TextField | MovieClip, index: number): void => {
        object.x = index % 20 * 18; object.y = Math.floor(index / 20) % 40 * 16; stage.addChild(object);
    };
    const measure = (name: string, root: Stage, update: (frame: number) => void): Promise<BenchmarkResult> => benchmark(name, root, update, isActive);
    try {
        for (const count of [100, 500, 1000]) {
            stage.removeChildren();
            for (let i = 0; i < count; i++) add(new Bitmap(texture), i);
            results.push(await measure(`sprites-${count}`, stage, (frame) => {
                stage.$children.forEach((child, index) => { child.rotation = (frame + index) % 360; });
            }));
        }
        stage.removeChildren(); const sheet = new SpriteSheet(texture); const frameTexture = sheet.createTexture('frame', 0, 0, 16, 16);
        for (const count of [1000, 5000]) {
            const particles = new ParticleSystem(frameTexture, 100); particles.maxParticles = count; particles.setCurrentParticles(count);
            assert(particles.numParticles === count, 'benchmark particle population'); stage.addChild(particles);
            results.push(await measure(`particles-${count}`, stage, (frame) => {
                particles.particles.forEach((particle, index) => { particle.x = index % 20 * 18; particle.y = (Math.floor(index / 20) + frame) % 40 * 16; });
            }));
            particles.stop(true); stage.removeChildren();
        }
        const factory = new MovieClipDataFactory({ res: { a: { x: 0, y: 0, w: 8, h: 16 }, b: { x: 8, y: 0, w: 8, h: 16 } },
            mc: { run: { frameRate: 60, frames: [{ res: 'a' }, { res: 'b' }] } } }, texture);
        const clips = Array.from({ length: 100 }, (_, i) => { const clip = new MovieClip(factory.generateMovieClipData('run')); add(clip, i); return clip; });
        results.push(await measure('movieclips-100', stage, (frame) => { clips.forEach((clip) => clip.gotoAndStop(frame % 2 + 1)); }));
        stage.removeChildren();
        for (let i = 0; i < 100; i++) { const text = new TextField(); text.size = 14; text.width = 120; text.height = 20; text.text = '中文 Text ' + i; add(text, i); }
        results.push(await measure('text-static-100', stage, () => {}));
        results.push(await measure('text-changing-100', stage, (frame) => {
            stage.$children.forEach((child, index) => { (child as TextField).text = 'Score ' + (frame + index); });
        }));
        const cached = new Sprite(); for (const child of [...stage.$children]) cached.addChild(child); stage.addChild(cached);
        cached.cacheAsTexture({ resolution: 2 }); results.push(await measure('text-cached-100', stage, () => {})); stage.removeChildren();
        const glyph = { x: 0, y: 0, width: 6, height: 8, xOffset: 0, yOffset: 0, xAdvance: 8, logicalWidth: 8, logicalHeight: 8 };
        const font = new BitmapFont(texture, { version: 1, lineHeight: 12, baseline: 8, spaceAdvance: 4,
            glyphs: Object.fromEntries('0123456789'.split('').map((key) => [key, glyph])), kernings: {} }, { ownsTexture: false });
        try {
            for (let i = 0; i < 100; i++) { const text = new BitmapText(); text.font = font; text.width = 80; text.height = 12; add(text, i); }
            results.push(await measure('bitmaptext-changing-100', stage, (frame) => {
                stage.$children.forEach((child, index) => { (child as BitmapText).text = String(100 + frame + index); });
            })); stage.removeChildren();
        } finally { font.dispose(); }
        const skeleton = await loadNativeSkeleton('4.2', spine42);
        try {
            for (const count of [1, 5, 20]) {
                const animations = Array.from({ length: count }, (_, i) => {
                    const animation = new spine42.SkeletonAnimation(skeleton.animation.skeletonData);
                    animation.x = 30 + i % 5 * 70; animation.y = 120 + Math.floor(i / 5) * 140;
                    animation.scaleX = animation.scaleY = .16; animation.play('walk', -1); stage.addChild(animation); return animation;
                });
                results.push(await measure(`spine-4.2-${count}`, stage, () => { animations.forEach((animation) => animation.renderer.update(1000 / 60)); }));
                if (count === 20) {
                    animations.forEach((animation, index) => animation.renderer.update(index * 61));
                    results.push(await measure('spine-4.2-20-staggered', stage,
                        () => { animations.forEach((animation) => animation.renderer.update(1000 / 60)); }));
                }
                stage.removeChildren();
            }
            const bakeStart = performance.now();
            const cache = new NativeSpineAnimationCache({
                createSource: () => new spine42.SkeletonAnimation(skeleton.animation.skeletonData), animation: 'walk', sampleRate: 60,
            });
            await reportResult({ type: 'spine-cache-build', animation: 'walk', sampleRate: cache.sampleRate,
                frames: cache.frameCount, durationMs: cache.durationMs, geometryBytes: cache.geometryBytes,
                bakeMs: performance.now() - bakeStart, geometry: 'frozen JS numeric payload; excludes objects/native buffers/atlas' });
            try {
                const animations = Array.from({ length: 20 }, (_, i) => {
                    const animation = cache.createPlayer({ autoUpdate: false });
                    animation.x = 30 + i % 5 * 70; animation.y = 120 + Math.floor(i / 5) * 140;
                    animation.scaleX = animation.scaleY = .16; stage.addChild(animation); return animation;
                });
                assert(animations.length === 20 && stage.numChildren === 20, 'cached Spine benchmark population');
                results.push(await measure('spine-4.2-cache60-20', stage,
                    () => { animations.forEach((animation) => animation.advanceTime(1000 / 60)); }));
                animations.forEach((animation, index) => animation.advanceTime(index * 61));
                results.push(await measure('spine-4.2-cache60-20-staggered', stage,
                    () => { animations.forEach((animation) => animation.advanceTime(1000 / 60)); }));
                stage.removeChildren();
            } finally { cache.dispose(); }
        } finally { skeleton.dispose(); }
        const resources = new Resource(); const player = { render: (): void => {} };
        ticker.addPlayer(player); let restore: (() => void) | undefined;
        try {
            await resources.loadConfig('resource/resource.json', 'resource/'); await resources.loadGroup('preload');
            restore = installNativeUI(resources); await Promise.resolve();
            const gallery = makeGallery();
            gallery.scaleX = gallery.scaleY = Math.min(stage.stageWidth / gallery.width, stage.stageHeight / gallery.height);
            stage.addChild(gallery); ticker.update(true);
            results.push(await measure('ui-gallery-16', stage, () => ticker.update(true)));
            stage.removeChildren();
            const list = new List(); list.width = 320; list.height = 240; list.itemRenderer = Row;
            list.scrollEnabled = true;
            const layout = new VerticalLayout(); layout.gap = 0; list.layout = layout; list.useVirtualLayout = true;
            list.dataProvider = new ArrayCollection(Array.from({ length: 5000 }, (_, i) => 'row ' + i));
            stage.addChild(list); ticker.update(true);
            results.push(await measure('ui-virtual-list-5000', stage, (frame) => {
                list.scrollV = frame * 48; ticker.update(true);
                assert(list.$children.length < 30, 'benchmark visible list population');
            }));
            stage.removeChildren();
        } finally { restore?.(); ticker.removePlayer(player); resources.destroyAll(); }
        return results;
    } finally { stage.removeChildren(); texture.dispose(); image.dispose(); }
}
