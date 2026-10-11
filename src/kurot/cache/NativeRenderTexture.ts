import { Texture, textureScaleFactor } from '@kurot/core/dist/kurot/display/texture/Texture.js';
import type { DisplayObject, Graphics, Rectangle } from '@kurot/core';
import { AlphaType, ColorType, Skia } from 'react-native-skia';

import { SkiaRenderer } from '../rendering/SkiaRenderer.js';
import { createSkiaBitmapData, getSkiaImage } from '../resources/textures.js';

/**
 * Explicit captures preserve the Core texture's physical sizing contract.
 * This temporary renderer never replaces the active player's input hooks.
 */
export class RenderTexture extends Texture {
	public drawToTexture(object: DisplayObject, clipBounds?: Rectangle, scale = 1): boolean {
		if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('RenderTexture scale must be positive.');
		const bounds = clipBounds ?? object.$getOriginalBounds();
		const density = scale / textureScaleFactor;
		const width = Math.ceil((clipBounds ? bounds.width : bounds.x + bounds.width) * density);
		const height = Math.ceil((clipBounds ? bounds.height : bounds.y + bounds.height) * density);
		if (width <= 0 || height <= 0) return false;
		if (width > 4096 || height > 4096) throw new RangeError('Native RenderTexture exceeds 4096 pixels.');
		const surface = Skia.Surface.MakeOffscreen(width, height);
		if (!surface) throw new Error('Native RenderTexture GPU allocation failed.');
		const renderer = new SkiaRenderer(density, false);
		const restoreDirtyState = preserveDirtyState(object);
		try {
			const canvas = surface.getCanvas();
			canvas.clear(Skia.Color('transparent'));
			if (clipBounds) canvas.translate(-bounds.x * density, -bounds.y * density);
			canvas.scale(density, density);
			renderer.renderLocal(object, canvas);
			surface.flush();
			const data = createSkiaBitmapData(surface.makeImageSnapshot());
			const previous = this.bitmapData;
			this.setBitmapData(data);
			previous?.dispose();
			return true;
		} finally {
			try {
				renderer.dispose();
			} finally {
				restoreDirtyState();
				surface.dispose();
			}
		}
	}
	public override getPixel32(x: number, y: number): number[] {
		const image = this.bitmapData ? getSkiaImage(this.bitmapData) : undefined;
		if (!image) return [];
		const px = Math.round(x / textureScaleFactor);
		const py = Math.round(y / textureScaleFactor);
		if (px < 0 || py < 0 || px >= image.width() || py >= image.height()) return [];
		const pixels = image.readPixels(px, py, {
			width: 1,
			height: 1,
			colorType: ColorType.RGBA_8888,
			alphaType: AlphaType.Unpremul,
		});
		return pixels ? Array.from(pixels.subarray(0, 4)) : [];
	}
}

function preserveDirtyState(root: DisplayObject): () => void {
	const objects = new Map<DisplayObject, readonly [boolean, boolean]>();
	const graphics = new Map<Graphics, boolean>();
	const pending = [root];
	while (pending.length) {
		const object = pending.pop();
		if (!object || objects.has(object)) continue;
		objects.set(object, [object.$cacheDirty, object.$renderDirty]);
		const paths = object.graphics;
		if (paths) graphics.set(paths, paths.canvasCacheDirty);
		if (object.$mask) pending.push(object.$mask);
		if (object.$children) pending.push(...object.$children);
	}
	// Capture caches belong to a temporary renderer. Consuming these shared
	// flags would leave the player's existing paths, geometry or image stale.
	return (): void => {
		for (const [object, [cacheDirty, renderDirty]] of objects) {
			object.$cacheDirty = cacheDirty;
			object.$renderDirty = renderDirty;
		}
		for (const [paths, dirty] of graphics) paths.canvasCacheDirty = dirty;
	};
}
