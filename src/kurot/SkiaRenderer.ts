import { DisplayObjectContainer, setGraphicsHitTest } from '@kurot/core';
import type { Bitmap, BitmapText, DisplayObject, Mesh, Stage, TextField } from '@kurot/core';
import { setBitmapPixelHitTest } from '@kurot/core/dist/kurot/display/Bitmap.js';
import { AlphaType, BlendMode, ClipOp, ColorType, Skia } from 'react-native-skia';
import type { SkCanvas } from 'react-native-skia';

import { NativeBitmapRenderer } from './NativeBitmapRenderer.js';
import { NativeBitmapBatchRenderer } from './NativeBitmapBatchRenderer.js';
import { NativeCacheRenderer } from './NativeCacheRenderer.js';
import { NativeEffects } from './NativeEffects.js';
import { NativeGraphicsRenderer } from './NativeGraphicsRenderer.js';
import { NativeMeshRenderer } from './NativeMeshRenderer.js';
import { NativeParticleRenderer } from './NativeParticleRenderer.js';
import { NativeTextRenderer } from './NativeTextRenderer.js';
import { nativeBlendMode } from './blend.js';

/**
 * One native player owns Core's global hit-test hooks, like the Web player.
 * All native caches are bounded by their users' visible-frame lifecycle.
 */
export class SkiaRenderer {
	private readonly graphics = new NativeGraphicsRenderer();
	private readonly bitmap = new NativeBitmapRenderer();
	private readonly bitmapBatch = new NativeBitmapBatchRenderer();
	private readonly mesh = new NativeMeshRenderer();
	private readonly particles = new NativeParticleRenderer();
	private readonly cache = new NativeCacheRenderer();
	private readonly effects = new NativeEffects();
	private readonly maskPaint = Skia.Paint();
	private readonly text = new NativeTextRenderer();
	private readonly drawing = new Set<DisplayObject>();

	public constructor(
		private readonly resolution = 1,
		private readonly ownsHitTests = true,
		private readonly batchPrimitives = true,
	) {
		if (!Number.isFinite(resolution) || resolution <= 0)
			throw new RangeError('Native render resolution must be positive.');
		this.maskPaint.setBlendMode(BlendMode.DstIn);
		if (!ownsHitTests) return;
		setGraphicsHitTest((graphics, x, y) => this.graphics.hitTest(graphics, x, y));
		setBitmapPixelHitTest((bitmap, x, y) => this.pixelHit(bitmap, x, y));
	}

	public get estimatedCacheBytes(): number {
		return this.cache.estimatedBytes;
	}

	public render(stage: Stage | DisplayObject, canvas: SkCanvas): number {
		return this.renderFrame(stage, canvas, false);
	}

	/**
	 * Captures root content without its placement, visibility or compositing.
	 * Descendants retain their ordinary display semantics, as in Core captures.
	 */
	public renderLocal(object: DisplayObject, canvas: SkCanvas): number {
		return this.renderFrame(object, canvas, true);
	}

	public dispose(): void {
		if (this.ownsHitTests) {
			setGraphicsHitTest(() => false);
			setBitmapPixelHitTest(() => false);
		}
		this.graphics.dispose();
		this.bitmap.dispose();
		this.bitmapBatch.dispose();
		this.mesh.dispose();
		this.particles.dispose();
		this.cache.dispose();
		this.effects.dispose();
		this.maskPaint.dispose();
		this.text.dispose();
	}

	private renderFrame(object: DisplayObject, canvas: SkCanvas, local: boolean): number {
		this.graphics.beginFrame();
		this.bitmap.beginFrame();
		this.bitmapBatch.beginFrame();
		this.mesh.beginFrame();
		this.particles.beginFrame();
		this.cache.beginFrame();
		this.effects.beginFrame();
		this.text.beginFrame();
		try {
			return local ? this.drawContent(object, canvas, 1, 0xffffff) : this.draw(object, canvas, 1, 0xffffff);
		} finally {
			this.bitmap.endFrame();
			this.bitmapBatch.endFrame();
			this.mesh.endFrame();
			this.particles.endFrame();
			this.cache.endFrame();
			this.effects.endFrame();
			this.text.endFrame();
			this.graphics.endFrame();
		}
	}

	private draw(
		object: DisplayObject,
		canvas: SkCanvas,
		parentAlpha: number,
		parentTint: number,
		mask = false,
		transformed = false,
	): number {
		if (!object.visible || object.alpha <= 0 || (!mask && object.$maskedObject)) return 0;
		if (this.drawing.has(object)) throw new Error('Native display mask contains a rendering cycle.');
		this.drawing.add(object);
		const alpha = parentAlpha * object.alpha;
		const tint = object.tint === 0xffffff ? parentTint : object.tint;
		canvas.save();
		try {
			if (!transformed) {
				const matrix = object.$getMatrix();
				canvas.concat([matrix.a, matrix.c, matrix.tx, matrix.b, matrix.d, matrix.ty, 0, 0, 1]);
				canvas.translate(-object.anchorOffsetX, -object.anchorOffsetY);
				if (object.$scrollRect) {
					const rect = object.$scrollRect;
					canvas.clipRect({ x: 0, y: 0, width: rect.width, height: rect.height }, ClipOp.Intersect, true);
					canvas.translate(-rect.x, -rect.y);
				}
			}
			if (transformed && object.$scrollRect) {
				const rect = object.$scrollRect;
				canvas.clipRect(
					{ x: rect.x, y: rect.y, width: rect.width, height: rect.height },
					ClipOp.Intersect,
					true,
				);
			}
			if (object.$maskRect) {
				const rect = object.$maskRect;
				canvas.clipRect(
					{ x: rect.x, y: rect.y, width: rect.width, height: rect.height },
					ClipOp.Intersect,
					true,
				);
			}
			const displayMask = object.$mask;
			const layered =
				object.$filters.length > 0 ||
				displayMask !== undefined ||
				(object.blendMode !== 'source-over' && (object.$renderObjectType !== 2 || object.$displayList));
			if (layered) canvas.saveLayer(this.effects.get(object));
			try {
				const cached = this.cache.draw(object, canvas, alpha, tint, this.resolution, target =>
					this.drawContent(object, target, 1, tint),
				);
				let count = cached ?? this.drawContent(object, canvas, alpha, tint);
				if (displayMask) {
					const relative = object.$getInvertedConcatenatedMatrix().clone();
					relative.preMultiplyInto(displayMask.$getConcatenatedMatrix(), relative);
					canvas.saveLayer(this.maskPaint);
					try {
						canvas.concat([
							relative.a,
							relative.c,
							relative.tx,
							relative.b,
							relative.d,
							relative.ty,
							0,
							0,
							1,
						]);
						count += this.draw(displayMask, canvas, 1, 0xffffff, true, true);
					} finally {
						canvas.restore();
					}
				}
				return count;
			} finally {
				if (layered) canvas.restore();
			}
		} finally {
			canvas.restore();
			this.drawing.delete(object);
		}
	}

	private drawContent(object: DisplayObject, canvas: SkCanvas, alpha: number, tint: number): number {
		// Consumed ordinary containers must release their dirty flag so a later
		// descendant change can reach the next cached ancestor.
		object.$cacheDirty = false;
		if (object instanceof DisplayObjectContainer && object.sortableChildren) object.sortChildren();
		let count = 0;
		// Core publishes const enums, erased from JS. These tags are version-bound.
		switch (object.$renderObjectType) {
			case 3:
			case 4: {
				const graphics = object.graphics;
				if (!graphics) throw new Error('Graphics render tag has no Graphics object.');
				count += this.graphics.draw(graphics, canvas, alpha, tint);
				break;
			}
			case 1:
				count += this.bitmap.draw(object as Bitmap, canvas, alpha, tint);
				break;
			case 2:
				count += this.mesh.draw(
					object as Mesh,
					canvas,
					alpha,
					tint,
					object.$filters.length || object.$mask ? BlendMode.SrcOver : nativeBlendMode(object.blendMode),
				);
				break;
			case 5:
				count += this.text.draw(object as TextField, canvas, alpha, tint);
				break;
			case 6:
				count += this.particles.draw(object, canvas, alpha, tint);
				break;
			case 7:
				count += this.bitmap.drawGlyphs(object as BitmapText, canvas, alpha, tint);
				break;
			case 0:
				break;
			default:
				throw new Error(`Native render type ${object.$renderObjectType} is not implemented.`);
		}
		const children = object.$children ?? [];
		for (let index = 0; index < children.length;) {
			const meshes = this.batchPrimitives ? this.mesh.drawBatch(children, index, canvas, alpha, tint) : undefined;
			if (meshes) {
				count += meshes.draws;
				index = meshes.end;
				continue;
			}
			const end = this.batchPrimitives ? this.bitmapBatch.draw(children, index, canvas, alpha, tint) : undefined;
			if (end !== undefined) {
				count++;
				index = end;
			} else {
				count += this.draw(children[index], canvas, alpha, tint);
				index++;
			}
		}
		return count;
	}

	private pixelHit(bitmap: Bitmap, x: number, y: number): boolean {
		const surface = Skia.Surface.MakeOffscreen(1, 1);
		if (!surface) return false;
		try {
			const canvas = surface.getCanvas();
			canvas.clear(Skia.Color('transparent'));
			canvas.translate(-Math.floor(x), -Math.floor(y));
			if (bitmap.$renderObjectType === 2) this.mesh.draw(bitmap as Mesh, canvas, 1, 0xffffff);
			else this.bitmap.draw(bitmap, canvas, 1, 0xffffff);
			surface.flush();
			const pixels = canvas.readPixels(0, 0, {
				width: 1,
				height: 1,
				colorType: ColorType.RGBA_8888,
				alphaType: AlphaType.Unpremul,
			});
			return pixels !== null && pixels[3] > 0;
		} finally {
			surface.dispose();
		}
	}
}
