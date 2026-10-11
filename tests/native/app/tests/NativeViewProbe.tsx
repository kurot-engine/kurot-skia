import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Shape, TextField, TextFieldType } from '@kurot/core';
import type { Stage } from '@kurot/core';
import { activeNativeInput, KurotView } from '@kurot/skia';
import type { FrameStats, NativeScene } from '@kurot/skia';
import { TextInput } from 'react-native';
import { reportResult } from './report';
import { assert } from './gpu';

/**
 * Exercise the actual RN Graphite view across native mounts and viewport sizes.
 * These timings count submission callbacks, not displayed hardware frames.
 */
export function NativeViewProbe({ onFinished, onFailure }: {
    onFinished(): void; onFailure(message: string): void;
}): ReactElement | undefined {
    const [step, setStep] = useState(0);
    const [visible, setVisible] = useState(true);
    const created = useRef(0); const disposed = useRef(0); const updates = useRef(0);
    const completed = useRef(false);
    const field = useRef<TextField | undefined>(undefined);
    const firstHost = useRef<unknown>(undefined);
    const createScene = useCallback((stage: Stage): NativeScene => {
        created.current++;
        const shape = new Shape(); shape.graphics.beginFill(0x67e3bb);
        shape.graphics.drawRect(0, 0, 40, 40); shape.graphics.endFill(); stage.addChild(shape);
        const edit = new TextField(); edit.type = TextFieldType.INPUT; edit.text = 'RN focus';
        edit.x = 8; edit.y = 80; edit.width = 100; edit.height = 28; edit.size = 14;
        stage.addChild(edit); field.current = edit; edit.setFocus();
        const next = new TextField(); next.type = TextFieldType.INPUT; next.text = 'Switch 🌈';
        next.x = 8; next.y = 140; next.width = 100; next.height = 28; next.size = 14;
        stage.addChild(next);
        let frames = 0;
        return {
            update(delta): void {
                updates.current++; shape.rotation += delta * 30;
                if (++frames === 20) {
                    firstHost.current = TextInput.State.currentlyFocusedInput();
                    field.current = next; next.setFocus();
                }
            },
            dispose(): void { disposed.current++; stage.removeChildren(); },
        };
    }, []);
    const stats = useCallback((value: FrameStats): void => {
        if (value.frames < 20 || completed.current) return;
        assert(value.draws > 0 && value.profile && value.profile.samples > 0
            && Number.isFinite(value.profile.totalMs.p95), 'native view records actual draws and timings');
        assert(field.current?.stage && activeNativeInput(field.current.stage)?.field === field.current
            && TextInput.State.currentlyFocusedInput(), 'Core focus reaches the mounted RN TextInput');
        assert(firstHost.current && firstHost.current !== TextInput.State.currentlyFocusedInput(),
            'switching Core fields mounts a distinct RN editing view');
        completed.current = true;
        void reportResult({ type: 'native-view', step, inputFocused: true, inputSwitched: true,
            scenesCreated: created.current, scenesDisposed: disposed.current, ...value });
        setVisible(false);
    }, [step]);
    useEffect(() => {
        if (visible) {
            const timeout = setTimeout(() => onFailure('Native view did not finish within 10 seconds'), 10000);
            return () => clearTimeout(timeout);
        }
        const deadline = performance.now() + 500;
        const verify = (): void => {
            if (TextInput.State.currentlyFocusedInput() && performance.now() < deadline) {
                frame = requestAnimationFrame(verify); return;
            }
            try {
                assert(created.current === disposed.current && created.current >= step + 1, 'KurotView releases each native scene');
                assert(updates.current > 0, 'KurotView drives scene updates');
                assert(!TextInput.State.currentlyFocusedInput(), 'RN editing focus is released after unmount');
                if (step === 2) { onFinished(); return; }
                completed.current = false; setStep(step + 1); setVisible(true);
            } catch (error) { onFailure(error instanceof Error ? error.message : String(error)); }
        };
        let frame = requestAnimationFrame(verify);
        return () => cancelAnimationFrame(frame);
    }, [visible, step, onFinished, onFailure]);
    return visible ? <KurotView width={step === 1 ? 192 : 128} height={256}
        createScene={createScene} onStats={stats} onError={onFailure} /> : undefined;
}
