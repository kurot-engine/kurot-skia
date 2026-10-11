import { BlurFilter, ColorMatrixFilter, DropShadowFilter, GlowFilter } from '@kurot/core';
import type { DisplayObject, Filter } from '@kurot/core';
import { BlendMode, Skia, TileMode } from 'react-native-skia';
import type { SkImageFilter, SkPaint } from 'react-native-skia';

import { nativeBlendMode } from './blend.js';
import { skColor } from './graphics.js';

interface EffectCache {
	key: string;
	paint: SkPaint;
	filters: SkImageFilter[];
}

function compileInnerGlow(filter: GlowFilter, dx: number, dy: number): SkImageFilter {
	const owned: { dispose(): void }[] = [];
	try {
		const shadow = Skia.ImageFilter.MakeDropShadowOnly(
			dx,
			dy,
			filter.blurX / 4,
			filter.blurY / 4,
			Float32Array.of(0, 0, 0, 1),
		);
		owned.push(shadow);
		const identityColor = Skia.ColorFilter.MakeMatrix([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
		owned.push(identityColor);
		const source = Skia.ImageFilter.MakeColorFilter(identityColor);
		owned.push(source);
		const edge = Skia.ImageFilter.MakeBlend(BlendMode.SrcOut, shadow, source);
		owned.push(edge);
		const color = skColor(filter.color);
		color[3] = Math.max(0, Math.min(1, filter.alpha * filter.strength));
		const tint = Skia.ColorFilter.MakeBlend(color, BlendMode.SrcIn);
		owned.push(tint);
		const colored = Skia.ImageFilter.MakeColorFilter(tint, edge);
		if (filter.knockout || (filter instanceof DropShadowFilter && filter.hideObject)) return colored;
		owned.push(colored);
		return Skia.ImageFilter.MakeBlend(BlendMode.SrcOver, source, colored);
	} finally {
		for (const item of owned) item.dispose();
	}
}

function compileFilter(filter: Filter): SkImageFilter {
	if (filter instanceof ColorMatrixFilter) {
		const values = filter.matrix.map((value, index) => (index % 5 === 4 ? value / 255 : value));
		const color = Skia.ColorFilter.MakeMatrix(values);
		try {
			return Skia.ImageFilter.MakeColorFilter(color);
		} finally {
			color.dispose();
		}
	}
	// Native Gaussian sigma retains variance, not parity with browser kernels.
	if (filter instanceof BlurFilter) {
		return Skia.ImageFilter.MakeBlur(filter.blurX / 4, filter.blurY / 4, TileMode.Decal);
	}
	if (filter instanceof GlowFilter) {
		const shadow = filter instanceof DropShadowFilter ? filter : undefined;
		const angle = ((shadow?.angle ?? 0) * Math.PI) / 180;
		const dx = (shadow?.distance ?? 0) * Math.cos(angle);
		const dy = (shadow?.distance ?? 0) * Math.sin(angle);
		if (filter.inner) return compileInnerGlow(filter, dx, dy);
		const color = skColor(filter.color);
		color[3] = Math.max(0, Math.min(1, filter.alpha));
		const only = Skia.ImageFilter.MakeDropShadowOnly(dx, dy, filter.blurX / 4, filter.blurY / 4, color);
		const strength = Skia.ColorFilter.MakeMatrix([
			1,
			0,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			0,
			Math.max(0, filter.strength),
			0,
		]);
		const amplified = Skia.ImageFilter.MakeColorFilter(strength, only);
		strength.dispose();
		only.dispose();
		const identityColor = Skia.ColorFilter.MakeMatrix([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
		const identity = Skia.ImageFilter.MakeColorFilter(identityColor);
		identityColor.dispose();
		try {
			const clipped = Skia.ImageFilter.MakeBlend(
				filter.inner ? BlendMode.SrcIn : BlendMode.SrcOut,
				identity,
				amplified,
			);
			amplified.dispose();
			if (filter.knockout || shadow?.hideObject) return clipped;
			const combined = Skia.ImageFilter.MakeBlend(
				BlendMode.SrcOver,
				filter.inner ? identity : clipped,
				filter.inner ? clipped : undefined,
			);
			clipped.dispose();
			return combined;
		} finally {
			identity.dispose();
		}
	}
	throw new Error(
		`Native filter '${filter.type}' requires an explicit Skia implementation; WebGL GLSL is unsupported.`,
	);
}

export class NativeEffects {
	private readonly cache = new Map<DisplayObject, EffectCache>();
	private readonly used = new Set<DisplayObject>();

	public beginFrame(): void {
		this.used.clear();
	}

	public get(object: DisplayObject): SkPaint {
		this.used.add(object);
		const key = object.blendMode + object.$filters.map(filter => filter.type + filter.toJson()).join('|');
		const previous = this.cache.get(object);
		if (previous?.key === key) return previous.paint;
		const next: EffectCache = { key, paint: Skia.Paint(), filters: [] };
		try {
			next.paint.setBlendMode(nativeBlendMode(object.blendMode));
			let composed: SkImageFilter | undefined;
			for (const filter of object.$filters) {
				const native = compileFilter(filter);
				next.filters.push(native);
				if (composed) {
					composed = Skia.ImageFilter.MakeCompose(native, composed);
					next.filters.push(composed);
				} else {
					composed = native;
				}
			}
			next.paint.setImageFilter(composed ?? null);
		} catch (error) {
			this.release(next);
			throw error;
		}
		if (previous) this.release(previous);
		this.cache.set(object, next);
		return next.paint;
	}

	public endFrame(): void {
		for (const [object, cache] of this.cache) {
			if (!this.used.has(object)) {
				this.release(cache);
				this.cache.delete(object);
			}
		}
	}

	public dispose(): void {
		this.used.clear();
		this.endFrame();
	}

	private release(cache: EffectCache): void {
		cache.paint.dispose();
		for (const filter of cache.filters) filter.dispose();
	}
}
