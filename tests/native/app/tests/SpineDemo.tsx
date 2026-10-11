import type { Stage } from '@kurot/core';
import { KurotView } from '@kurot/skia';
import type { FrameStats, NativeScene } from '@kurot/skia';
import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createSpineDemoScene } from './spine-demo-scene';
import type { SpineDemoOptions, SpineDemoScene } from './spine-demo-scene';

const initial: SpineDemoOptions = { count: 1, animation: 'run', staggered: false, paused: false };

export function SpineDemo(): ReactElement {
    const scene = useRef<SpineDemoScene | undefined>(undefined);
    const options = useRef(initial);
    const [selection, setSelection] = useState(initial);
    const [status, setStatus] = useState('Loading Spineboy…');
    const [stats, setStats] = useState<FrameStats>();
    const error = useCallback((message: string): void => { setStatus(message); }, []);
    const createScene = useCallback((stage: Stage): NativeScene => {
        const current = createSpineDemoScene(stage, options.current,
            () => setStatus('Binary skeleton + atlas · shared textures'), error);
        scene.current = current;
        return {
            update(delta): void { current.update(delta); },
            dispose(): void { scene.current = undefined; current.dispose(); },
        };
    }, [error]);
    const onStats = useCallback((value: FrameStats): void => { setStats(value); }, []);
    const configure = (change: Partial<SpineDemoOptions>): void => {
        const next = { ...options.current, ...change };
        options.current = next;
        setSelection(next);
        scene.current?.configure(next);
    };
    const button = (label: string, selected: boolean, onPress: () => void): ReactElement => (
        <Pressable key={label} accessibilityLabel={label} accessibilityRole="button"
            accessibilityState={{ selected }} onPress={onPress}
            style={[styles.button, selected && styles.selected]}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
        </Pressable>
    );

    return <View style={styles.root}>
        <View style={styles.header}>
            <Text style={styles.eyebrow}>KUROT / NATIVE SKIA</Text>
            <Text style={styles.title}>Spineboy 4.2</Text>
            <Text style={styles.status}>{status}</Text>
        </View>
        <View style={styles.canvas}>
            <KurotView width={360} createScene={createScene} onStats={onStats} onError={error} />
        </View>
        <View style={styles.controls}>
            <Text style={styles.metrics}>{selection.count} actor{selection.count === 1 ? '' : 's'} · {stats?.fps ?? '—'} submissions/s · {stats?.draws ?? '—'} draw ops</Text>
            <View style={styles.row}>
                {([1, 20] as const).map((count) => button(`${count} 个角色`, selection.count === count, () => configure({ count })))}
                {button(selection.paused ? '继续' : '暂停', selection.paused, () => configure({ paused: !selection.paused }))}
            </View>
            <View style={styles.row}>
                {(['walk', 'run', 'jump'] as const).map((animation) => button(animation,
                    selection.animation === animation, () => configure({ animation })))}
            </View>
            <View style={styles.row}>
                {button('同步相位', !selection.staggered, () => configure({ staggered: false }))}
                {button('不同相位', selection.staggered, () => configure({ staggered: true }))}
            </View>
        </View>
    </View>;
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#10192b', paddingTop: 62, paddingBottom: 34 },
    header: { paddingHorizontal: 24, paddingBottom: 14 },
    eyebrow: { color: '#77c7ee', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    title: { color: '#f4f7ff', fontSize: 30, fontWeight: '700', marginTop: 8 },
    status: { color: '#96a9c4', fontSize: 12, marginTop: 8 },
    canvas: { flex: 1 },
    controls: { paddingHorizontal: 20, paddingTop: 14 },
    metrics: { color: '#96a9c4', fontSize: 12, marginBottom: 14, fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    button: { flex: 1, paddingVertical: 12, backgroundColor: '#21314b', borderRadius: 9, alignItems: 'center' },
    selected: { backgroundColor: '#77c7ee' },
    label: { color: '#e4ebf6', fontSize: 14, fontWeight: '600' },
    selectedLabel: { color: '#102039' },
});
