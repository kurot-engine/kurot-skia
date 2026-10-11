import { BitmapFillMode } from '@kurot/core';
import type { Bitmap, BitmapText, Texture } from '@kurot/core';
import { drawUnscaledBitmapFill } from '@kurot/core/dist/kurot/player/bitmap-fill.js';
import { FilterMode, MipmapMode } from 'react-native-skia';
import type { SkCanvas, SkImage, SkPaint, SkRect } from 'react-native-skia';

import { NativeImagePaint } from './NativeImagePaint.js';
import { NativeNineSliceRenderer } from './nine-slice.js';
import { getSkiaImage } from '../resources/textures.js';

export function drawImageRegion(
	canvas: SkCanvas,
	image: SkImage,
	source: SkRect,
	destination: SkRect,
	smoothing: boolean,
	rotated: boolean,
	paint: SkPaint,
): void {
	const filter = smoothing ? FilterMode.Linear : FilterMode.Nearest;
	if (!rotated) {
		canvas.drawImageRectOptions(image, source, destination, filter, MipmapMode.None, paint);
		return;
	}
	canvas.save();
	try {
		canvas.translate(destination.x, destination.y + destination.height);
		canvas.rotate(-90, 0, 0);
		canvas.drawImageRectOptions(
			image,
			{ ...source, width: source.height, height: source.width },
			{
				x: 0,
				y: 0,
				width: destination.height,
				height: destination.width,
			},
			filter,
			MipmapMode.None,
			paint,
		);
	} finally {
		canvas.restore();
	}
}

export class NativeBitmapRenderer {
	private readonly paint = new NativeImagePaint();
	private readonly nineSlice = new NativeNineSliceRenderer();

	public beginFrame(): void {
		this.nineSlice.beginFrame();
	}

	public endFrame(): void {
		this.nineSlice.endFrame();
	}

	public draw(bitmap: Bitmap, canvas: SkCanvas, alpha: number, tint: number): number {
		const texture = bitmap.texture;
		const image = texture?.bitmapData && getSkiaImage(texture.bitmapData);
		if (
			!texture ||
			!texture.bitmapData ||
			bitmap.width <= 0 ||
			bitmap.height <= 0 ||
			bitmap.textureWidth <= 0 ||
			bitmap.textureHeight <= 0
		) {
			return 0;
		}
		if (!image) {
			throw new Error('A native Bitmap requires a SkImage bound with createSkiaTexture/createSkiaBitmapData.');
		}
		const paint = this.paint.get(alpha, tint);
		if (bitmap.fillMode === BitmapFillMode.SCALE) {
			if (bitmap.scale9Grid) {
				return this.nineSlice.draw(bitmap, bitmap.scale9Grid, image, canvas, alpha, paint);
			}
			const sx = bitmap.width / bitmap.textureWidth;
			const sy = bitmap.height / bitmap.textureHeight;
			drawImageRegion(
				canvas,
				image,
				{
					x: bitmap.bitmapX,
					y: bitmap.bitmapY,
					width: bitmap.bitmapWidth,
					height: bitmap.bitmapHeight,
				},
				{
					x: bitmap.bitmapOffsetX * sx,
					y: bitmap.bitmapOffsetY * sy,
					width: bitmap.bitmapWidth * texture.pixelScale * sx,
					height: bitmap.bitmapHeight * texture.pixelScale * sy,
				},
				bitmap.smoothing,
				texture.rotated,
				paint,
			);
			return 1;
		}
		let count = 0;
		drawUnscaledBitmapFill(bitmap, bitmap.width, bitmap.height, (x, y, width, height, dx, dy, dw, dh) => {
			drawImageRegion(
				canvas,
				image,
				{ x, y, width, height },
				{ x: dx, y: dy, width: dw, height: dh },
				bitmap.smoothing,
				texture.rotated,
				paint,
			);
			count++;
		});
		return count;
	}

	public drawGlyphs(text: BitmapText, canvas: SkCanvas, alpha: number, tint: number): number {
		const font = text.font;
		if (!font) return 0;
		const paint = this.paint.get(alpha, tint);
		let count = 0;
		for (const glyph of text.getGlyphs()) {
			const texture = font.getTexture(glyph.character);
			if (!texture || texture.bitmapWidth <= 0 || texture.bitmapHeight <= 0) continue;
			const image = texture.bitmapData && getSkiaImage(texture.bitmapData);
			if (!image) throw new Error('A native bitmap font requires a native page texture.');
			drawImageRegion(
				canvas,
				image,
				{ x: texture.bitmapX, y: texture.bitmapY, width: texture.bitmapWidth, height: texture.bitmapHeight },
				{
					x: glyph.x + texture.offsetX,
					y: glyph.y + texture.offsetY,
					width: texture.scaleBitmapWidth,
					height: texture.scaleBitmapHeight,
				},
				text.smoothing,
				false,
				paint,
			);
			count++;
		}
		return count;
	}

	public drawTexture(texture: Texture, canvas: SkCanvas, alpha: number, tint: number): void {
		const image = texture.bitmapData && getSkiaImage(texture.bitmapData);
		if (!image) throw new Error('A native particle requires a native texture.');
		drawImageRegion(
			canvas,
			image,
			{ x: texture.bitmapX, y: texture.bitmapY, width: texture.bitmapWidth, height: texture.bitmapHeight },
			{
				x: texture.offsetX,
				y: texture.offsetY,
				width: texture.scaleBitmapWidth,
				height: texture.scaleBitmapHeight,
			},
			true,
			texture.rotated,
			this.paint.get(alpha, tint),
		);
	}

	public dispose(): void {
		this.paint.dispose();
		this.nineSlice.dispose();
	}
}
