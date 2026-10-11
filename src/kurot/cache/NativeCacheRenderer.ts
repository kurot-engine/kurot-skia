import type { DisplayObject } from '@kurot/core';
import { getRenderContentBounds } from '@kurot/core/dist/kurot/player/render-bounds.js';
import { FilterMode, MipmapMode, Skia } from 'react-native-skia';
import type { SkCanvas } from 'react-native-skia';

import { DisplayList } from './NativeDisplayList.js';

export class NativeCacheRenderer {
	private readonly caches = new Set<DisplayList>();
	private readonly used = new Set<DisplayList>();
	private readonly paint = Skia.Paint();
	private readonly pixelBudget = 16 * 1024 * 1024;

	public get estimatedBytes(): number {
		let bytes = 0;
		for (const cache of this.caches) {
			if (cache.image) bytes += cache.image.width() * cache.image.height() * 4;
		}
		return bytes;
	}

	public beginFrame(): void {
		this.used.clear();
	}

	public draw(
		object: DisplayObject,
		canvas: SkCanvas,
		alpha: number,
		tint: number,
		resolution: number,
		render: (canvas: SkCanvas) => number,
	): number | undefined {
		const cache = object.$displayList as unknown;
		if (!(cache instanceof DisplayList)) return undefined;
		this.used.add(cache);
		this.caches.delete(cache);
		this.caches.add(cache);
		const desiredResolution = cache.resolution ?? resolution;
		if (
			!cache.image ||
			object.$cacheDirty ||
			cache.tint !== tint ||
			Math.abs(cache.requestedResolution - desiredResolution) > 1e-6
		) {
			const bounds = getRenderContentBounds(object, true);
			if (bounds.width <= 0 || bounds.height <= 0) {
				cache.clear();
				return 0;
			}
			// Bound each capture to 4096² RGBA pixels by reducing its density.
			const scale = Math.min(desiredResolution, 4096 / bounds.width, 4096 / bounds.height);
			const width = Math.min(4096, Math.max(1, Math.ceil(bounds.width * scale)));
			const height = Math.min(4096, Math.max(1, Math.ceil(bounds.height * scale)));
			const surface = Skia.Surface.MakeOffscreen(width, height);
			if (!surface) throw new Error('Native cache GPU surface allocation failed.');
			try {
				const target = surface.getCanvas();
				target.clear(Skia.Color('transparent'));
				target.scale(scale, scale);
				target.translate(-bounds.x, -bounds.y);
				render(target);
				surface.flush();
				const image = surface.makeImageSnapshot();
				cache.clear();
				for (const previous of this.caches) {
					if (this.estimatedBytes + width * height * 4 <= this.pixelBudget * 4) break;
					if (previous !== cache) previous.clear();
				}
				cache.image = image;
				cache.x = bounds.x;
				cache.y = bounds.y;
				cache.width = width / scale;
				cache.height = height / scale;
				cache.actualResolution = scale;
				cache.requestedResolution = desiredResolution;
				cache.tint = tint;
				object.$cacheDirty = false;
			} finally {
				surface.dispose();
			}
		}
		this.paint.setAlphaf(alpha);
		canvas.drawImageRectOptions(
			cache.image!,
			{ x: 0, y: 0, width: cache.image!.width(), height: cache.image!.height() },
			{
				x: cache.x,
				y: cache.y,
				width: cache.width,
				height: cache.height,
			},
			cache.scaleMode === 'nearest' ? FilterMode.Nearest : FilterMode.Linear,
			MipmapMode.None,
			this.paint,
		);
		return 1;
	}

	public endFrame(): void {
		for (const cache of this.caches) {
			if (!this.used.has(cache)) {
				cache.clear();
				this.caches.delete(cache);
			}
		}
	}

	public dispose(): void {
		this.used.clear();
		this.endFrame();
		this.paint.dispose();
	}
}
