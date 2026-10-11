import { TextField, TextFieldType } from '@kurot/core';
import type { Stage } from '@kurot/core';
import { activeNativeInput, blurNativeInput, KurotView } from '@kurot/skia';
import type { NativeScene } from '@kurot/skia';
import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reportResult } from './report';

/**
 * Manual native keyboard acceptance uses synthetic text and real input events.
 * Observed text/selection is recorded without declaring an automatic IME pass.
 */
export function ManualInput(): ReactElement {
    const stage = useRef<Stage | undefined>(undefined);
    const fields = useRef<TextField[]>([]);
    const [status, setStatus] = useState('Tap a field or focus button.');
    const createScene = useCallback((root: Stage): NativeScene => {
        stage.current = root;
        const names = ['plain', 'password', 'restricted', 'multiline'];
        fields.current = names.map((name, index) => {
            const field = new TextField(); field.name = name; field.type = TextFieldType.INPUT;
            field.multiline = index === 3; field.x = 8; field.y = 8 + index * 50;
            field.width = 340; field.height = 44; field.size = 20; field.textColor = 0xffffff;
            field.background = true; field.backgroundColor = 0x24344a;
            field.displayAsPassword = index === 1; field.maxChars = index === 1 ? 8 : 0;
            if (index === 2) field.restrict = '0-9';
            root.addChild(field); return field;
        });
        let previous = '';
        return {
            update(): void {
                const controller = activeNativeInput(root);
                const state = fields.current.map((field) => ({ name: field.name, text: field.text,
                    selection: [field.selectionBeginIndex, field.selectionEndIndex] }));
                const signature = JSON.stringify({ focused: controller?.field.name ?? 'none', fields: state });
                if (signature === previous) return;
                previous = signature;
                const field = controller?.field;
                setStatus(field ? `${field.name}: ${JSON.stringify(field.text)}\nUTF-16 selection ${field.selectionBeginIndex}–${field.selectionEndIndex}`
                    : state.map((value) => `${value.name}: ${JSON.stringify(value.text)}`).join('\n'));
                void reportResult({ type: 'manual-input-observation', focused: controller?.field.name ?? 'none', fields: state });
            },
            dispose(): void { root.removeChildren(); fields.current = []; stage.current = undefined; },
        };
    }, []);
    const focus = (index: number): void => { fields.current[index]?.setFocus(); };
    const blur = (): void => { if (stage.current) blurNativeInput(stage.current); };
    const select = (): void => {
        const field = stage.current ? activeNativeInput(stage.current)?.field : undefined;
        field?.setSelection(2, 4);
    };
    const clear = (): void => { for (const field of fields.current) field.text = ''; };
    const error = useCallback((message: string): void => { setStatus(message); }, []);
    const actions = [{ label: 'Select 2–4', onPress: select }, { label: 'Blur', onPress: blur },
        { label: 'Clear', onPress: clear }];
    return <View style={styles.root}>
        <Text style={styles.title}>Native keyboard acceptance</Text>
        <View style={styles.buttons}>
            {['Plain', 'Password ≤8', 'Digits on blur', 'Multiline'].map((label, index) =>
                <Pressable key={label} accessibilityLabel={label} onPress={() => focus(index)} style={styles.button}>
                    <Text style={styles.label}>{label}</Text>
                </Pressable>)}
        </View>
        <View style={styles.buttons}>
            {actions.map(({ label, onPress }) =>
                <Pressable key={label} accessibilityLabel={label}
                    onPress={onPress} style={styles.button}><Text style={styles.label}>{label}</Text></Pressable>)}
        </View>
        <Text accessibilityLabel="Core input state" style={styles.status}>{status}</Text>
        <View style={styles.canvas}><KurotView width={360} height={208} createScene={createScene} onError={error} /></View>
    </View>;
}

const styles = StyleSheet.create({
    root: { flex: 1, paddingTop: 45, backgroundColor: '#080e1a' },
    title: { color: '#ffffff', fontSize: 18, margin: 8 },
    buttons: { flexDirection: 'row', flexWrap: 'wrap' },
    button: { padding: 7, margin: 3, backgroundColor: '#27466a', borderRadius: 4 },
    label: { color: '#ffffff', fontSize: 12 },
    status: { color: '#67e3bb', fontSize: 12, height: 66, margin: 8 },
    canvas: { height: 208 },
});
