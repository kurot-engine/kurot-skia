import { Bitmap, BitmapFillMode } from '@kurot/core';
import type { DisplayObject } from '@kurot/core';
import { AlphaType, BlendMode, ColorType, FilterMode, Skia } from 'react-native-skia';
import type { SkCanvas, SkImage, SkRSXform, SkRect } from 'react-native-skia';
import { getSkiaImage } from '../resources/textures.js';
import { NativeNineSliceRenderer } from './nine-slice.js';
import { NativeImagePaint } from './NativeImagePaint.js';
import { getNativePictureCache } from '../cache/NativePictureCache.js';

interface SpriteEntry {
	transform: SkRSXform;
	source: { x: number; y: number; width: number; height: number };
}

function eligible(object: DisplayObject | undefined): Bitmap | undefined {
	if (
		!(object instanceof Bitmap) ||
		object.$renderObjectType !== 1 ||
		!object.visible ||
		object.alpha !== 1 ||
		object.$maskedObject ||
		object.$mask ||
		object.$maskRect ||
		object.$scrollRect ||
		object.$displayList ||
		getNativePictureCache(object) ||
		object.$filters.length ||
		object.$children?.length ||
		object.blendMode !== 'source-over' ||
		object.scale9Grid ||
		object.flipX ||
		object.flipY ||
		object.fillMode !== BitmapFillMode.SCALE
	)
		return undefined;
	const texture = object.texture;
	if (
		!texture?.bitmapData ||
		texture.rotated ||
		object.bitmapOffsetX ||
		object.bitmapOffsetY ||
		texture.bitmapWidth <= 0 ||
		texture.bitmapHeight <= 0 ||
		object.width !== texture.textureWidth ||
		object.height !== texture.textureHeight ||
		texture.scaleBitmapWidth !== texture.textureWidth ||
		texture.scaleBitmapHeight !== texture.textureHeight
	)
		return undefined;
	const matrix = object.$getMatrix();
	if (Math.abs(matrix.c + matrix.b) > 1e-10 || Math.abs(matrix.d - matrix.a) > 1e-10) return undefined;
	return object;
}

function sameFrame(first: Bitmap, second: Bitmap): boolean {
	return (
		first.alpha === second.alpha &&
		first.tint === second.tint &&
		first.smoothing === second.smoothing &&
		first.bitmapX === second.bitmapX &&
		first.bitmapY === second.bitmapY &&
		first.bitmapWidth === second.bitmapWidth &&
		first.bitmapHeight === second.bitmapHeight &&
		getSkiaImage(first.texture!.bitmapData!) === getSkiaImage(second.texture!.bitmapData!)
	);
}

/**
 * Batch only adjacent ordinary sprites that preserve atlas and RSXform semantics.
 * Isolated source frames retain strict atlas-edge sampling. Trim, arbitrary
 * transforms, effects and other fill modes use the ordinary painter.
 */
export class NativeBitmapBatchRenderer {
	private readonly entries = new Map<Bitmap, SpriteEntry>();
	private readonly used = new Set<Bitmap>();
	private readonly transforms: SkRSXform[] = [];
	private readonly sources: SkRect[] = [];
	private readonly paint = new NativeImagePaint();
	private readonly frames = new NativeNineSliceRenderer();
	private readonly opaque = new WeakMap<SkImage, boolean>();

	public beginFrame(): void {
		this.used.clear();
		this.frames.beginFrame();
	}

	public draw(
		children: readonly DisplayObject[],
		start: number,
		canvas: SkCanvas,
		alpha: number,
		inheritedTint: number,
	): number | undefined {
		if (alpha !== 1) return undefined;
		const first = eligible(children[start]);
		const second = eligible(children[start + 1]);
		if (!first || !second || !sameFrame(first, second)) return undefined;
		const image = getSkiaImage(first.texture!.bitmapData!);
		if (
			!image ||
			first.bitmapWidth * first.bitmapHeight > 256 * 256 ||
			[first.bitmapX, first.bitmapY, first.bitmapWidth, first.bitmapHeight].some(v => !Number.isInteger(v)) ||
			first.bitmapX < 0 ||
			first.bitmapY < 0 ||
			first.bitmapX + first.bitmapWidth > image.width() ||
			first.bitmapY + first.bitmapHeight > image.height()
		)
			return undefined;
		// drawAtlas lacks a strict source-rectangle constraint. An isolated frame
		// preserves drawImageRect's edge clamping without bleeding nearby regions.
		const frame = this.frames.getFrame(first, image);
		if (!this.isOpaque(frame)) return undefined;
		this.transforms.length = this.sources.length = 0;
		let end = start;
		for (; end < children.length; end++) {
			const bitmap = eligible(children[end]);
			if (!bitmap || !sameFrame(first, bitmap)) break;
			const texture = bitmap.texture!;
			const matrix = bitmap.$getMatrix();
			let entry = this.entries.get(bitmap);
			if (!entry) {
				entry = { transform: Skia.RSXform(1, 0, 0, 0), source: { x: 0, y: 0, width: 0, height: 0 } };
				this.entries.set(bitmap, entry);
			}
			this.used.add(bitmap);
			entry.transform.set(
				matrix.a * texture.pixelScale,
				matrix.b * texture.pixelScale,
				matrix.tx - matrix.a * bitmap.anchorOffsetX - matrix.c * bitmap.anchorOffsetY,
				matrix.ty - matrix.b * bitmap.anchorOffsetX - matrix.d * bitmap.anchorOffsetY,
			);
			entry.source.x = 0;
			entry.source.y = 0;
			entry.source.width = texture.bitmapWidth;
			entry.source.height = texture.bitmapHeight;
			this.transforms.push(entry.transform);
			this.sources.push(entry.source);
			bitmap.$cacheDirty = false;
		}
		const tint = first.tint === 0xffffff ? inheritedTint : first.tint;
		canvas.drawAtlas(
			frame,
			this.sources,
			this.transforms,
			this.paint.get(alpha * first.alpha, tint),
			BlendMode.Modulate,
			undefined,
			{ filter: first.smoothing ? FilterMode.Linear : FilterMode.Nearest },
		);
		return end;
	}

	public endFrame(): void {
		this.frames.endFrame();
		for (const [bitmap, entry] of this.entries) {
			if (!this.used.has(bitmap)) {
				entry.transform.dispose();
				this.entries.delete(bitmap);
			}
		}
		this.transforms.length = this.sources.length = 0;
	}

	public dispose(): void {
		this.used.clear();
		this.endFrame();
		this.paint.dispose();
		this.frames.dispose();
	}

	private isOpaque(image: SkImage): boolean {
		const previous = this.opaque.get(image);
		if (previous !== undefined) return previous;
		const width = image.width();
		const height = image.height();
		let opaque = width * height <= 256 * 256;
		if (opaque && image.getImageInfo().alphaType !== AlphaType.Opaque) {
			const pixels = image.readPixels(0, 0, {
				width,
				height,
				colorType: ColorType.RGBA_8888,
				alphaType: AlphaType.Unpremul,
			});
			opaque = pixels instanceof Uint8Array && pixels.every((value, index) => index % 4 !== 3 || value === 255);
		}
		this.opaque.set(image, opaque);
		return opaque;
	}
}
