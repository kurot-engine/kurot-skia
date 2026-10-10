import { Event, Stage, ticker } from '@kurot/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { ClipOp, Skia, SkiaGraphiteView } from 'react-native-skia';
import type { SkiaGraphiteViewRef } from 'react-native-skia';

import { NativeTouch } from './NativeTouch.js';
import { SkiaRenderer } from './SkiaRenderer.js';
import { createViewport } from './viewport.js';

export interface NativeScene {
    update(deltaSeconds: number): void;
    dispose(): void;
}

export interface FrameStats {
    fps: number;
    draws: number;
    frames: number;
}

export interface KurotViewProps {
    width: number;
    height?: number;
    createScene(stage: Stage): NativeScene;
    onStats?(stats: FrameStats): void;
    onError(message: string): void;
}

export function KurotView({ width, height, createScene, onStats, onError }: KurotViewProps): ReactElement {
    const view = useRef<SkiaGraphiteViewRef | undefined>(undefined);
    const input = useRef<NativeTouch | undefined>(undefined);
    const [size, setSize] = useState({ width: 0, height: 0 });
    // Omitting height fills the native view while retaining logical width.
    const stageHeight = height ?? (size.width > 0 ? width * size.height / size.width : 0);

    useEffect(() => {
        if (!view.current || size.width <= 0 || size.height <= 0) {
            return;
        }
        const context = view.current.getContext();
        const renderer = new SkiaRenderer();
        const stage = new Stage();
        stage.setContentSize(width, stageHeight);
        stage.frameRate = 60;
        const touch = new NativeTouch(stage);
        input.current = touch;
        let scene: NativeScene;
        try {
            scene = createScene(stage);
        } catch (error) {
            input.current = undefined;
            stage.removeChildren();
            renderer.dispose();
            context.dispose();
            onError(error instanceof Error ? error.message : String(error));
            return;
        }
        const viewport = createViewport(context.width, context.height, width, stageHeight);
        let previousTime = performance.now();
        let statsTime = previousTime;
        let frames = 0;
        let intervalFrames = 0;
        let running = false;
        let failed = false;
        const player = {
            render: (): void => {
                const now = performance.now();
                const delta = Math.min((now - previousTime) / 1000, 0.05);
                previousTime = now;
                try {
                    scene.update(delta);
                    const canvas = context.beginRecording();
                    let draws = 0;
                    try {
                        canvas.clear(Skia.Color('#10192b'));
                        canvas.translate(viewport.x, viewport.y);
                        canvas.scale(viewport.scale, viewport.scale);
                        canvas.clipRect({ x: 0, y: 0, width, height: stageHeight }, ClipOp.Intersect, true);
                        draws = renderer.render(stage, canvas);
                    } finally {
                        const recording = context.finishRecording();
                        context.submit(recording);
                        recording.dispose();
                    }
                    frames++;
                    intervalFrames++;
                    if (now - statsTime >= 1000) {
                        onStats?.({ fps: Math.round(intervalFrames * 1000 / (now - statsTime)), draws, frames });
                        intervalFrames = 0;
                        statsTime = now;
                    }
                } catch (error) {
                    failed = true;
                    stop();
                    const message = error instanceof Error ? error.message : String(error);
                    console.error(message);
                    onError(message);
                }
            },
        };
        const stop = (): void => {
            touch.cancelAll();
            ticker.removePlayer(player);
            ticker.stop();
            running = false;
        };
        const start = (): void => {
            if (running || failed) {
                return;
            }
            previousTime = performance.now();
            statsTime = previousTime;
            intervalFrames = 0;
            running = true;
            ticker.addPlayer(player);
            ticker.start();
        };
        if (AppState.currentState === 'active') {
            start();
        }
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                stage.dispatchEventWith(Event.ACTIVATE);
                start();
            } else {
                stage.dispatchEventWith(Event.DEACTIVATE);
                stop();
            }
        });
        return () => {
            subscription.remove();
            stop();
            input.current = undefined;
            scene.dispose();
            stage.removeChildren();
            renderer.dispose();
            context.dispose();
        };
    }, [width, stageHeight, size, createScene, onStats, onError]);

    const forward = (event: GestureResponderEvent, action: 'begin' | 'move' | 'end'): void => {
        const viewport = createViewport(size.width, size.height, width, stageHeight);
        for (const touch of event.nativeEvent.changedTouches) {
            const x = (touch.locationX - viewport.x) / viewport.scale;
            const y = (touch.locationY - viewport.y) / viewport.scale;
            if (action === 'begin' && (x < 0 || y < 0 || x > width || y > stageHeight)) {
                continue;
            }
            input.current?.[action](x, y, Number(touch.identifier));
        }
    };

    return (
        <View
            style={styles.surface}
            onLayout={({ nativeEvent: { layout } }) => setSize((previous) =>
                previous.width === layout.width && previous.height === layout.height
                    ? previous : { width: layout.width, height: layout.height })}
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onTouchStart={(event) => forward(event, 'begin')}
            onTouchMove={(event) => forward(event, 'move')}
            onTouchEnd={(event) => forward(event, 'end')}
            onTouchCancel={() => input.current?.cancelAll()}
            onResponderTerminate={() => input.current?.cancelAll()}
        >
            <SkiaGraphiteView ref={(native) => { view.current = native ?? undefined; }}
                style={styles.canvas} pointerEvents="none" opaque />
        </View>
    );
}

const styles = StyleSheet.create({ surface: { flex: 1, overflow: 'hidden' }, canvas: { flex: 1 } });
