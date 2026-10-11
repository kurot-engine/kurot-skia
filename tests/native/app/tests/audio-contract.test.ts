import { Event, IOErrorEvent, Sound } from '@kurot/core';
import { registerNativeAudioBackend } from '@kurot/skia';
import type { NativeAudioAsset } from '@kurot/skia';
import { assert } from './gpu';

/**
 * Backend contract only; this does not validate a media engine or audio hardware.
 */
export async function runAudioContractChecks(): Promise<void> {
    const sound = new Sound(); let errors = 0; let completions = 0; let stops = 0; let disposed = 0;
    sound.addEventListener(IOErrorEvent.IO_ERROR, () => { errors++; });
    try {
        registerNativeAudioBackend(undefined);
        sound.load('missing.wav'); await Promise.resolve();
        assert(errors === 1, 'missing native audio backend dispatches IO error');
        const idle = sound.play(); assert(Number(errors) === 2 && idle.position === 0 && idle.volume === 1, 'not-ready Sound follows Core event contract');
        idle.stop();
        let finish: (() => void) | undefined;
        const playback = { position: .25, volume: 1, stop: (): void => { stops++; finish?.(); } };
        const asset: NativeAudioAsset = { duration: 2, dispose: (): void => { disposed++; },
            play: (start, loops, complete) => {
                assert(start === .25 && loops === 2, 'audio seconds and loop contract'); finish = complete; return playback;
            } };
        registerNativeAudioBackend({ load: async () => asset });
        const ready = new Promise<void>((resolve) => sound.once(Event.COMPLETE, () => resolve()));
        sound.load('test.wav'); await ready;
        assert(sound.length === 2, 'native audio duration');
        const channel = sound.play(.25, 2);
        channel.addEventListener(Event.SOUND_COMPLETE, () => { completions++; });
        channel.volume = 2; assert(playback.volume === 1 && channel.position === .25, 'channel volume clamp and position');
        finish?.(); finish?.(); assert(completions === 1, 'completion is dispatched once');
        channel.stop(); channel.stop(); assert(stops === 1 && Number(completions) === 1, 'stop is idempotent and suppresses completion');
        sound.close(); assert(disposed === 1, 'sound asset disposal');
        let resolveLate: ((value: NativeAudioAsset) => void) | undefined;
        registerNativeAudioBackend({ load: () => new Promise((resolve) => { resolveLate = resolve; }) });
        sound.load('slow.wav'); await Promise.resolve(); sound.close(); resolveLate?.(asset);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        assert(Number(disposed) === 2 && Number(sound.length) === 0, 'cancelled load disposes late native asset');
    } finally { sound.close(); registerNativeAudioBackend(undefined); }
    console.info('Kurot Skia: optional audio contract checks passed; no audio host/hardware acceptance.');
}
