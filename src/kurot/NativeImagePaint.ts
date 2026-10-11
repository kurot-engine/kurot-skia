import { BlendMode, Skia } from 'react-native-skia';
import type { SkColorFilter, SkPaint } from 'react-native-skia';

import { skColor } from './graphics.js';

/**
 * Multiplication preserves source alpha; filters are bounded and caller images
 * remain unchanged. Clearing a paint field uses Skia's null API boundary.
 */
export class NativeImagePaint {
	private readonly paint = Skia.Paint();
	private readonly tints = new Map<number, SkColorFilter>();

	public get(alpha: number, tint: number, blend = BlendMode.SrcOver): SkPaint {
		this.paint.setAlphaf(alpha);
		this.paint.setBlendMode(blend);
		let filter = this.tints.get(tint);
		if (tint !== 0xffffff && !filter) {
			if (this.tints.size >= 128) {
				const first = this.tints.keys().next().value;
				if (first !== undefined) {
					this.tints.get(first)!.dispose();
					this.tints.delete(first);
				}
			}
			filter = Skia.ColorFilter.MakeBlend(skColor(tint), BlendMode.Modulate);
			this.tints.set(tint, filter);
		}
		this.paint.setColorFilter(filter ?? null);
		return this.paint;
	}

	public dispose(): void {
		this.paint.dispose();
		for (const filter of this.tints.values()) {
			filter.dispose();
		}
		this.tints.clear();
	}
}
