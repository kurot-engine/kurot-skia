import { Resource, Shape, Sprite, Stage, TextField, ticker } from '@kurot/core';
import type { DisplayObject } from '@kurot/core';
import { NativePictureCache, SkiaRenderer } from '@kurot/skia';
import { Skia } from 'react-native-skia';

import { installNativeUI } from '../src/ui/native-ui';
import { assert } from './gpu';
import { makeGallery } from './ui-gallery.test';
import { reportResult } from './report';

type Mode = 'ordinary' | 'image' | 'picture';
type Workload = 'ui-16' | 'text-100' | 'graphics-160';

function distribution(values: number[]): Record<string, number> {
    const sorted = [...values].sort((a, b) => a - b);
    const p = (q: number): number => Math.round(sorted[Math.ceil(sorted.length * q) - 1] * 1000) / 1000;
    return { p50: p(.5), p95: p(.95), p99: p(.99), max: sorted.at(-1)! };
}

function makeText(): Sprite {
    const root = new Sprite();
    for (let index = 0; index < 100; index++) {
        const text = new TextField(); text.text = '中 Skia ' + index; text.size = 12;
        text.width = 78; text.height = 22; text.x = index % 4 * 80; text.y = Math.floor(index / 4) * 24;
        root.addChild(text);
    }
    assert(root.numChildren === 100, 'Picture benchmark text population');
    return root;
}

function makeGraphics(): Sprite {
    const root = new Sprite();
    for (let index = 0; index < 160; index++) {
        const shape = new Shape(); shape.x = index % 8 * 40; shape.y = Math.floor(index / 8) * 30;
        shape.graphics.beginFill(0x294060); shape.graphics.drawRoundRect(0, 0, 36, 26, 6, 6);
        shape.graphics.endFill();
        for (let dot = 0; dot < 8; dot++) {
            shape.graphics.beginFill(dot % 2 ? 0x67e3bb : 0x84b7ff);
            shape.graphics.drawCircle(6 + dot % 4 * 8, 8 + Math.floor(dot / 4) * 10, 2.5);
            shape.graphics.endFill();
        }
        root.addChild(shape);
    }
    assert(root.numChildren === 160, 'Picture benchmark Graphics population');
    return root;
}

async function measure(workload: Workload, mode: Mode, moving: boolean, root: DisplayObject,
    isActive: () => boolean): Promise<void> {
    const stage = new Stage(); stage.setContentSize(360, 640);
    const scale = workload === 'ui-16' ? .56 : .94;
    root.scaleX = root.scaleY = scale; root.x = root.y = 12; stage.addChild(root);
    await Promise.resolve(); ticker.update(true); ticker.update(true);
    let cache: NativePictureCache | undefined;
    if (mode === 'image') {
        root.cacheAsTexture({ resolution: 2 });
    }
    if (mode === 'picture') {
        cache = new NativePictureCache(root);
    }
    const renderer = new SkiaRenderer(2);
    const surface = Skia.Surface.MakeOffscreen(720, 1280, { colorSpace: 'srgb' });
    assert(surface, 'Picture benchmark GPU allocation');
    const updates: number[] = []; const records: number[] = []; const waits: number[] = []; const totals: number[] = [];
    let draws = 0;
    const draw = (): void => {
        const canvas = surface.getCanvas(); canvas.clear(Skia.Color('#10192b')); canvas.save(); canvas.scale(2, 2);
        try { draws = renderer.render(stage, canvas); } finally { canvas.restore(); }
    };
    try {
        const coldStart = performance.now(); draw(); const coldRecorded = performance.now(); surface.flush(true);
        const cold = { recordMs: coldRecorded - coldStart, gpuWaitMs: performance.now() - coldRecorded };
        for (let frame = 0; frame < 150; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (!isActive()) throw new Error('Picture benchmark cancelled');
            const start = performance.now();
            if (moving) {
                root.x = 12 + Math.sin(frame / 23) * 5; root.y = 12 + Math.cos(frame / 27) * 5;
                root.scaleX = root.scaleY = scale * (1 + .06 * Math.sin(frame / 31));
                root.rotation = Math.sin(frame / 29) * 2;
            }
            const updated = performance.now(); draw(); const recorded = performance.now(); surface.flush(true);
            const end = performance.now();
            if (frame >= 30) {
                updates.push(updated - start); records.push(recorded - updated); waits.push(end - recorded); totals.push(end - start);
            }
        }
        const cacheStats = renderer.pictureCacheStats;
        if (mode === 'picture') {
            assert(cacheStats.rebuilds === 1, 'static/moving subtree records once');
        }
        const result = { name: `${workload}-${moving ? 'transform' : 'stationary'}-${mode}`, workload, mode, moving,
            samples: totals.length, draws, cold, update: distribution(updates), record: distribution(records),
            gpuWait: distribution(waits), total: distribution(totals),
            overBudgetPercent: Math.round(totals.filter(ms => ms > 1000 / 60).length / totals.length * 1000) / 10,
            rasterCacheBytes: renderer.estimatedCacheBytes, pictureCache: cacheStats };
        console.info('KUROT_PICTURE_BENCHMARK ' + JSON.stringify(result));
        await reportResult({ type: 'picture-benchmark', ...result });
    } finally {
        cache?.dispose(); root.cacheAsTexture(false); stage.removeChildren(); renderer.dispose(); surface.dispose();
    }
}

export async function runPictureBenchmarks(isActive: () => boolean): Promise<void> {
    const resources = new Resource(); const player = { render: (): void => {} };
    let restore: (() => void) | undefined;
    ticker.addPlayer(player);
    try {
        await resources.loadConfig('resource/resource.json', 'resource/'); await resources.loadGroup('preload');
        restore = installNativeUI(resources);
        await reportResult({ type: 'picture-benchmark-environment', surface: [720, 1280], density: 2,
            warmup: 30, samples: 120, timing: 'JS update/record plus synchronous offscreen GPU wait; not presented FPS',
            modes: ['ordinary', 'image', 'picture'], transforms: ['stationary', 'translation/scale/rotation'] });
        for (const workload of ['ui-16', 'text-100', 'graphics-160'] as const) {
            for (const moving of [false, true]) {
                for (const mode of ['ordinary', 'image', 'picture'] as const) {
                    const root = workload === 'ui-16' ? makeGallery() : workload === 'text-100' ? makeText() : makeGraphics();
                    await measure(workload, mode, moving, root, isActive);
                }
            }
        }
    } finally { restore?.(); ticker.removePlayer(player); resources.destroyAll(); }
}
