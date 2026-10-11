import { Sprite } from '@kurot/core';
import type { Stage } from '@kurot/core';
import type { NativeScene } from '@kurot/skia';
import * as spine42 from '@kurot/spine-4.2';

import { loadNativeSkeleton } from './spine.test';

export interface SpineDemoOptions {
    count: 1 | 20;
    animation: 'walk' | 'run' | 'jump';
    staggered: boolean;
    paused: boolean;
}

export interface SpineDemoScene extends NativeScene {
    configure(options: SpineDemoOptions): void;
}

export function createSpineDemoScene(stage: Stage, initial: SpineDemoOptions,
    onReady: () => void, onError: (message: string) => void): SpineDemoScene {
    let options = initial;
    let disposed = false;
    let resource: { animation: spine42.SkeletonAnimation; dispose(): void } | undefined;
    let actors: spine42.SkeletonAnimation[] = [];
    const bounds = new Map<SpineDemoOptions['animation'], { x: number; y: number; width: number; height: number }>();

    const animationBounds = (): { x: number; y: number; width: number; height: number } => {
        const cached = bounds.get(options.animation);
        if (cached) return cached;
        const seed = resource!.animation;
        const duration = seed.skeletonData.findAnimation(options.animation)?.duration;
        if (duration === undefined) throw new Error(`Missing Spine animation: ${options.animation}`);
        seed.play(options.animation, 0);
        let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
        for (let frame = 0; frame <= 60; frame++) {
            seed.renderer.update(frame === 0 ? 0 : duration * 1000 / 60);
            const pose = seed.skeleton.getBoundsRect();
            left = Math.min(left, pose.x); top = Math.min(top, -pose.y - pose.height);
            right = Math.max(right, pose.x + pose.width); bottom = Math.max(bottom, -pose.y);
        }
        seed.stopAll();
        const measured = { x: left, y: top, width: right - left, height: bottom - top };
        bounds.set(options.animation, measured);
        return measured;
    };

    const rebuild = (): void => {
        if (!resource) return;
        for (const actor of actors) { actor.stopAll(); }
        stage.removeChildren();
        const data = resource.animation.skeletonData;
        const rows = options.count === 1 ? 1 : 4;
        const columns = options.count === 1 ? 1 : 5;
        const cellWidth = stage.stageWidth / columns;
        const cellHeight = stage.stageHeight / rows;
        const padding = options.count === 1 ? 16 : 6;
        const extent = animationBounds();
        const scale = Math.min((cellWidth - padding * 2) / extent.width,
            (cellHeight - padding * 2) / extent.height);
        const background = new Sprite();
        background.graphics.lineStyle(1, 0x3d526f, 0.7);
        for (let row = 0; row < rows; row++) {
            const y = (row + 1) * cellHeight - padding;
            background.graphics.moveTo(12, y);
            background.graphics.lineTo(stage.stageWidth - 12, y);
        }
        stage.addChild(background);
        actors = Array.from({ length: options.count }, (_, index) => {
            const actor = new spine42.SkeletonAnimation(data);
            actor.scaleX = actor.scaleY = scale;
            actor.x = index % columns * cellWidth + (cellWidth - extent.width * scale) / 2 - extent.x * scale;
            actor.y = (Math.floor(index / columns) + 1) * cellHeight - padding - (extent.y + extent.height) * scale;
            actor.setMix(0.15);
            stage.addChild(actor);
            return actor;
        });
    };
    const play = (): void => {
        for (const [index, actor] of actors.entries()) {
            actor.play(options.animation, 0);
            actor.renderer.update(options.staggered ? index * 61 : 0);
        }
    };
    const configure = (next: SpineDemoOptions): void => {
        if (disposed) return;
        const rebuildActors = next.count !== options.count || next.animation !== options.animation;
        const replay = rebuildActors || next.animation !== options.animation || next.staggered !== options.staggered;
        options = next;
        if (rebuildActors) rebuild();
        if (replay) play();
        for (const actor of actors) { actor.setTimeScale(options.paused ? 0 : 1); }
    };

    void loadNativeSkeleton('4.2', spine42).then((loaded) => {
        if (disposed) { loaded.dispose(); return; }
        resource = loaded;
        rebuild();
        play();
        for (const actor of actors) { actor.setTimeScale(options.paused ? 0 : 1); }
        onReady();
    }).catch((error: unknown) => {
        if (!disposed) onError(error instanceof Error ? error.message : String(error));
    });

    return {
        configure,
        update(): void {},
        dispose(): void {
            disposed = true;
            stage.removeChildren();
            for (const actor of actors) { actor.stopAll(); }
            actors = [];
            resource?.dispose();
            resource = undefined;
        },
    };
}
