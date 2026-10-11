import { EventDispatcher } from '@kurot/core/dist/kurot/events/EventDispatcher.js';
import { Event } from '@kurot/core/dist/kurot/events/Event.js';
import { IOErrorEvent } from '@kurot/core/dist/kurot/events/IOErrorEvent.js';
import type { SoundEvents } from '@kurot/core';

import { getNativeAsset } from './native-assets.js';

export const SoundType = { MUSIC: 'music', EFFECT: 'effect' } as const;

export interface NativeAudioPlayback {
	readonly position: number;
	volume: number;
	stop(): void;
}

export interface NativeAudioAsset {
	readonly duration: number;
	/**
	 * Seconds and Core loop counts: nonpositive repeats indefinitely, positive counts
	 * are total plays. Completion fires only after the final natural ending.
	 */
	play(startTime: number, loops: number, onComplete: () => void): NativeAudioPlayback;
	dispose(): void;
}

export interface NativeAudioBackend {
	load(source: number | string): Promise<NativeAudioAsset>;
}

let backend: NativeAudioBackend | undefined;

/**
 * Audio stays optional. An application can connect its native media host without
 * making Expo or a particular audio engine a dependency of the Skia root.
 */
export function registerNativeAudioBackend(value: NativeAudioBackend | undefined): void {
	backend = value;
}

export class SoundChannel extends EventDispatcher {
	private playback?: NativeAudioPlayback;
	private level = 1;
	private stopped = false;
	private completed = false;

	public constructor(asset: NativeAudioAsset | undefined, startTime: number, loops: number) {
		super();
		this.playback = asset?.play(startTime, loops, () => {
			if (this.stopped || this.completed) return;
			this.completed = true;
			this.dispatchEventWith(Event.SOUND_COMPLETE);
		});
	}

	public get position(): number {
		return this.playback?.position ?? 0;
	}

	public get volume(): number {
		return this.level;
	}

	public set volume(value: number) {
		this.level = Math.max(0, Math.min(1, value));
		if (this.playback) this.playback.volume = this.level;
	}

	public stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.playback?.stop();
		this.playback = undefined;
	}
}

export class Sound extends EventDispatcher<SoundEvents> {
	public type: (typeof SoundType)[keyof typeof SoundType] = SoundType.EFFECT;
	private asset?: NativeAudioAsset;
	private generation = 0;

	public get length(): number {
		return this.asset?.duration ?? 0;
	}

	public load(url: string): void {
		this.close();
		const generation = this.generation;
		const bundled = getNativeAsset(url);
		const source = bundled?.kind === 'file' ? bundled.source : url;
		const loader = backend;
		if (!loader) {
			queueMicrotask(() => {
				if (generation === this.generation) IOErrorEvent.dispatchIOErrorEvent(this);
			});
			return;
		}
		void Promise.resolve()
			.then(() => loader.load(source))
			.then(
				asset => {
					if (generation !== this.generation) {
						asset.dispose();
						return;
					}
					this.asset = asset;
					this.dispatchEventWith(Event.COMPLETE);
				},
				() => {
					if (generation === this.generation) IOErrorEvent.dispatchIOErrorEvent(this);
				},
			);
	}

	public play(startTime = 0, loops = 0): SoundChannel {
		if (!this.asset) IOErrorEvent.dispatchIOErrorEvent(this);
		return new SoundChannel(this.asset, startTime, loops);
	}

	public close(): void {
		this.generation++;
		this.asset?.dispose();
		this.asset = undefined;
	}
}
