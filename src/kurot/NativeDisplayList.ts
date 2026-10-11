import type { CacheAsTextureOptions, DisplayObject } from '@kurot/core';
import type { SkImage } from 'react-native-skia';

/**
 * Core retains dirty propagation; the native renderer owns capture and may
 * evict GPU images when a cached subtree is absent from a frame.
 */
export class DisplayList {
	public static create(root: DisplayObject): DisplayList {
		return new DisplayList(root);
	}

	public static release(cache: DisplayList): void {
		cache.clear();
	}

	public image?: SkImage;
	public x = 0;
	public y = 0;
	public width = 0;
	public height = 0;
	public resolution?: number;
	public actualResolution = 1;
	public requestedResolution = 1;
	public scaleMode: 'linear' | 'nearest' = 'linear';
	public tint = 0xffffff;

	private constructor(public readonly root: DisplayObject) {}

	public configure(options: CacheAsTextureOptions = {}): void {
		this.resolution =
			options.resolution !== undefined && Number.isFinite(options.resolution) && options.resolution > 0
				? options.resolution
				: undefined;
		this.scaleMode = options.scaleMode === 'nearest' ? 'nearest' : 'linear';
		this.root.$cacheDirty = true;
	}

	public clear(): void {
		this.image?.dispose();
		this.image = undefined;
	}
}
