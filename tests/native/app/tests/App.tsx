import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import '../src/resources/bundled';
import { KurotView, SkiaRenderer } from '@kurot/skia';
import { reportResult } from './report';
import { runBenchmarks } from './performance';
import { createGalleryScene } from './gallery';
import { runAdapterChecks } from './adapter.test';
import { runResourceChecks } from './resources.test';
import { runTextChecks } from './text.test';
import { runUIChecks } from './ui.test';
import { runGPUNineSliceChecks } from './gpu-nine-slice.test';
import { runNineSliceCacheChecks } from './nine-slice-cache.test';
import { runBitmapChecks } from './bitmap.test';
import { runMeshChecks } from './mesh.test';
import { runGameChecks } from './game.test';
import { runSpineChecks } from './spine.test';
import { runEffectChecks } from './effects.test';
import { runSpineClippingChecks } from './spine-clipping.test';
import { runRenderTextureChecks } from './render-texture.test';
import { runFontChecks } from './fonts.test';
import { runGalleryChecks } from './ui-gallery.test';
import { runBitmapFontChecks } from './bitmap-font.test';
import { runDragonBonesChecks } from './dragonbones.test';
import { runScrollViewChecks } from './scroll-view.test';
import { runAudioContractChecks } from './audio-contract.test';
import { NativeViewProbe } from './NativeViewProbe';
import { runBitmapBatchChecks } from './bitmap-batch.test';
import { runParticleAtlasChecks } from './particles.test';
import { ManualInput } from './ManualInput';
import { runMeshBatchChecks } from './mesh-batch.test';
import { SpineDemo } from './SpineDemo';
import { runSpineCacheChecks } from './spine-cache.test';
import { runPictureCacheChecks } from './picture-cache.test';
import { runPictureLifecycleChecks } from './picture-cache-lifecycle.test';
import { runPictureBenchmarks } from './picture-performance';

const probeOnly = process.env.EXPO_PUBLIC_KUROT_PROBE_ONLY === '1';
const inputOnly = process.env.EXPO_PUBLIC_KUROT_INPUT_ONLY === '1';
const spineDemo = process.env.EXPO_PUBLIC_KUROT_SPINE_DEMO === '1';

/**
 * Separate device test entry: runs against Skia JSI, not mocked Node bindings.
 */
export function App(): ReactElement {
    const [result, setResult] = useState('Running native tests…');
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [probe, setProbe] = useState(false);
    const finishProbe = useCallback((): void => {
        setProbe(false); setReady(true);
        setResult(probeOnly ? 'PASS · mounted RN input / view probe'
            : 'PASS · Game / Spine / DragonBones / 16 skins\nGPU pixels, resources, text, editing, native view lifecycle');
        void reportResult({ type: probeOnly ? 'probe-complete' : 'complete', result: 'pass' });
    }, []);
    const failProbe = useCallback((message: string): void => {
        setProbe(false); setFailed(true); setResult(`FAIL\n${message}`);
        void reportResult({ type: 'failure', message });
    }, []);

    useEffect(() => {
        if (inputOnly || spineDemo) return;
        if (probeOnly) { setResult('Running mounted RN input / view probe…'); setProbe(true); return; }
        let mounted = true;
        setReady(false);
        const run = async (): Promise<void> => {
            if (!mounted) return;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const renderer = new SkiaRenderer();
            try {
                runAdapterChecks();
                runTextChecks();
                await runResourceChecks();
                await runUIChecks();
                await runGPUNineSliceChecks();
                runNineSliceCacheChecks();
                runBitmapChecks();
                runBitmapBatchChecks();
                runMeshChecks();
                runMeshBatchChecks();
                runEffectChecks();
                await runBitmapFontChecks();
                await runGameChecks();
                runParticleAtlasChecks();
                runScrollViewChecks();
                runDragonBonesChecks();
                await runAudioContractChecks();
                await runSpineChecks();
                await runSpineClippingChecks();
                await runSpineCacheChecks();
                await runGalleryChecks();
                await runFontChecks();
                runRenderTextureChecks();
                runPictureCacheChecks();
                runPictureLifecycleChecks();
                console.info('KUROT_FUNCTIONAL_PASS');
                await reportResult({ type: 'functional', result: 'pass' });
                if (mounted) setResult('PASS · functional tests\nRunning GPU performance benchmarks…');
                await runBenchmarks(() => mounted);
                await runPictureBenchmarks(() => mounted);
            } finally {
                renderer.dispose();
            }
        };
        const host = globalThis as unknown as { kurotNativeSuite?: Promise<void> };
        const current = (host.kurotNativeSuite ?? Promise.resolve()).then(run);
        host.kurotNativeSuite = current.catch(() => {});
        void current.then(() => {
            if (mounted) {
                setFailed(false);
                setResult('PASS · functional tests and diagnostics\nChecking native view mount / resize / cleanup…');
                setProbe(true);
            }
        }, (error: unknown) => {
            if (!mounted) return;
            const message = error instanceof Error ? error.message : String(error);
            console.info('Native failure:', message);
            void reportResult({ type: 'failure', message });
            console.error(`Kurot Skia: native tests failed: ${error instanceof Error ? error.stack ?? message : message}`);
            if (mounted) {
                setFailed(true);
                setResult(`FAIL\n${message}`);
            }
        });
        return () => {
            mounted = false;
        };
    }, []);

    if (spineDemo) return <SpineDemo />;
    if (inputOnly) return <ManualInput />;
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Kurot native tests</Text>
            <Text style={[styles.result, failed && styles.failed]}>{result}</Text>
            {probe && <NativeViewProbe onFinished={finishProbe} onFailure={failProbe} />}
            {ready && <KurotView width={512} height={1024} createScene={createGalleryScene} onError={reportError} />}
        </View>
    );
}

function reportError(message: string): void { console.error(message); }

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#080e1a', paddingTop: 50, paddingBottom: 20 },
    title: { color: '#f4f7ff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
    result: { color: '#67e3bb', fontSize: 12, lineHeight: 18 },
    failed: { color: '#ffb0b0' },
});
