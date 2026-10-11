import type { DisplayObject } from '@kurot/core';
import { getRenderContentBounds } from '@kurot/core/dist/kurot/player/render-bounds.js';
import { Skia } from 'react-native-skia';
import type { SkCanvas, SkPicture } from 'react-native-skia';

import { getNativePictureCache, NativePictureCache } from './NativePictureCache.js';
import { nativeFontRevision } from './NativeFontManager.js';
import { PictureDependencies } from './picture-dependencies.js';

export interface NativePictureCacheLimits {
	maxPictures?: number;
	maxRecordedDraws?: number;
}

export interface NativePictureCacheStats {
	pictures: number;
	recordedDraws: number;
	rebuilds: number;
	hits: number;
	evictions: number;
}

class PictureEntry {
	public picture?: SkPicture;
	public dependencies?: PictureDependencies;
	public version = -1;
	public fontVersion = -1;
	public alpha = 1;
	public tint = 0xffffff;
	public draws = 0;

	public constructor(public readonly cache: NativePictureCache) {
		cache.retain(this);
	}

	public release(): void {
		this.picture?.dispose();
		this.picture = undefined;
		this.dependencies = undefined;
		this.draws = 0;
	}

	public dispose(): void {
		this.release();
		this.cache.release(this);
	}
}

/**
 * Keeps local command recordings separate from raster captures and Graphite
 * frame recordings. Limits count retained Pictures and adapter draw operations,
 * not native/GPU bytes; referenced source resources remain separately owned.
 */
export class NativePictureCacheRenderer {
	private readonly entries = new Map<NativePictureCache, PictureEntry>();
	private readonly used = new Set<PictureEntry>();
	private readonly maxPictures: number;
	private readonly maxRecordedDraws: number;
	private rebuilds = 0;
	private hits = 0;
	private evictions = 0;

	public constructor(limits: NativePictureCacheLimits = {}) {
		this.maxPictures = limits.maxPictures ?? 64;
		this.maxRecordedDraws = limits.maxRecordedDraws ?? 32768;
		for (const value of [this.maxPictures, this.maxRecordedDraws]) {
			if (!Number.isSafeInteger(value) || value < 1) {
				throw new RangeError('Native Picture limits must be positive safe integers.');
			}
		}
	}

	public get stats(): NativePictureCacheStats {
		let pictures = 0;
		let recordedDraws = 0;
		for (const entry of this.entries.values()) {
			if (entry.picture) {
				pictures++;
				recordedDraws += entry.draws;
			}
		}
		return { pictures, recordedDraws, rebuilds: this.rebuilds, hits: this.hits, evictions: this.evictions };
	}

	public beginFrame(): void {
		this.used.clear();
	}

	public draw(object: DisplayObject, canvas: SkCanvas, alpha: number, tint: number,
		render: (canvas: SkCanvas) => number): number | undefined {
		const cache = getNativePictureCache(object);
		if (!cache) return undefined;
		if (object.$displayList) throw new Error('Choose Picture or texture caching for the same object.');
		let entry = this.entries.get(cache);
		if (!entry) {
			entry = new PictureEntry(cache);
		}
		this.entries.delete(cache);
		this.entries.set(cache, entry);
		this.used.add(entry);
		const fontVersion = nativeFontRevision();
		if (!entry.picture || entry.version !== cache.version || object.$cacheDirty ||
			entry.fontVersion !== fontVersion || entry.alpha !== alpha || entry.tint !== tint || entry.dependencies?.changed) {
			const bounds = getRenderContentBounds(object, true);
			const recorder = Skia.PictureRecorder();
			let picture: SkPicture | undefined;
			try {
				// Cull bounds include descendant ink/effects, and are never used as
				// a replacement for the display tree's actual clips.
				const target = recorder.beginRecording({ x: bounds.x, y: bounds.y,
					width: Math.max(bounds.width, 1), height: Math.max(bounds.height, 1) });
				const draws = render(target);
				picture = recorder.finishRecordingAsPicture();
				const dependencies = new PictureDependencies(object);
				entry.release();
				entry.picture = picture;
				picture = undefined;
				entry.dependencies = dependencies;
				entry.draws = draws;
				entry.version = cache.version;
				entry.fontVersion = fontVersion;
				entry.alpha = alpha;
				entry.tint = tint;
				object.$cacheDirty = false;
				this.rebuilds++;
			} catch (error) {
				entry.release();
				throw error;
			} finally {
				picture?.dispose();
				recorder.dispose();
			}
		} else {
			this.hits++;
		}
		canvas.drawPicture(entry.picture);
		this.enforceLimits();
		return 1;
	}

	public endFrame(): void {
		for (const [cache, entry] of this.entries) {
			if (!this.used.has(entry) || getNativePictureCache(cache.root) !== cache) {
				entry.dispose();
				this.entries.delete(cache);
			}
		}
	}

	public dispose(): void {
		this.used.clear();
		this.endFrame();
	}

	private enforceLimits(): void {
		let { pictures, recordedDraws } = this.stats;
		for (const entry of this.entries.values()) {
			if (pictures <= this.maxPictures && recordedDraws <= this.maxRecordedDraws) return;
			if (!entry.picture) continue;
			pictures--;
			recordedDraws -= entry.draws;
			entry.release();
			this.evictions++;
		}
	}
}
