import type { Graphics } from '@kurot/core';
import { AlphaType, ColorType, Skia } from 'react-native-skia';
import type { SkCanvas } from 'react-native-skia';

import { compileGraphics, disposeGraphics, skColor } from './graphics.js';
import type { GraphicsDraw } from './graphics.js';
import { NativeImagePaint } from './NativeImagePaint.js';

export class NativeGraphicsRenderer {
	private readonly graphics = new Map<Graphics, GraphicsDraw[]>();
	private readonly used = new Set<Graphics>();
	private readonly gradientPaint = new NativeImagePaint();

	public beginFrame(): void {
		this.used.clear();
	}

	public draw(graphics: Graphics, canvas: SkCanvas, alpha: number, tint: number): number {
		const draws = this.getGraphics(graphics);
		for (const draw of draws) {
			const paint = draw.shader ? this.gradientPaint.get(draw.alpha * alpha, tint) : draw.paint;
			if (draw.shader) {
				paint.setShader(draw.shader);
			} else {
				paint.setColor(skColor(draw.color, tint));
				paint.setAlphaf(draw.alpha * alpha);
			}
			canvas.drawPath(draw.path, paint);
			if (draw.shader) paint.setShader(null);
		}
		return draws.length;
	}

	public hitTest(graphics: Graphics, x: number, y: number): boolean {
		return this.getGraphics(graphics).some(draw =>
			draw.dashed ? this.dashHit(draw, x, y) : draw.hitPath.contains(x, y),
		);
	}

	public endFrame(): void {
		for (const [graphics, draws] of this.graphics) {
			if (!this.used.has(graphics)) {
				disposeGraphics(draws);
				this.graphics.delete(graphics);
			}
		}
	}

	public dispose(): void {
		for (const draws of this.graphics.values()) disposeGraphics(draws);
		this.graphics.clear();
		this.gradientPaint.dispose();
	}

	private getGraphics(graphics: Graphics): GraphicsDraw[] {
		this.used.add(graphics);
		let draws = this.graphics.get(graphics);
		if (!draws || graphics.canvasCacheDirty) {
			const next = compileGraphics(graphics);
			if (draws) disposeGraphics(draws);
			draws = next;
			this.graphics.set(graphics, draws);
			graphics.canvasCacheDirty = false;
		}
		return draws;
	}

	private dashHit(draw: GraphicsDraw, x: number, y: number): boolean {
		if (!draw.hitPath.contains(x, y)) return false;
		const surface = Skia.Surface.MakeOffscreen(1, 1);
		if (!surface) return false;
		const paint = draw.paint.copy();
		try {
			paint.setAlphaf(1);
			const canvas = surface.getCanvas();
			canvas.clear(Skia.Color('transparent'));
			canvas.translate(-Math.floor(x), -Math.floor(y));
			canvas.drawPath(draw.path, paint);
			surface.flush();
			const pixels = canvas.readPixels(0, 0, {
				width: 1,
				height: 1,
				colorType: ColorType.RGBA_8888,
				alphaType: AlphaType.Unpremul,
			});
			return pixels !== null && pixels[3] > 0;
		} finally {
			paint.dispose();
			surface.dispose();
		}
	}
}
