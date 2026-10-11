import type { DisplayObject, Matrix, Texture } from '@kurot/core';
import { numberToBlendMode } from '@kurot/core/dist/kurot/display/enums/BlendMode.js';
import { BlendMode, FilterMode, Skia } from 'react-native-skia';
import type { SkCanvas, SkColor, SkRect, SkRSXform } from 'react-native-skia';

import { nativeBlendMode } from './blend.js';
import { skColor } from './graphics.js';
import { NativeNineSliceRenderer } from './nine-slice.js';
import { getSkiaImage } from '../resources/textures.js';

interface Particle {
	alpha: number;
	blendMode: number;
	$getMatrix(regX: number, regY: number): Matrix;
}

interface ParticleDisplay extends DisplayObject {
	texture: Texture;
	numParticles: number;
	readonly particles: readonly Particle[];
}

interface ParticleCache {
	transforms: SkRSXform[];
	colors: SkColor[];
	sources: SkRect[];
}

/**
 * Adjacent particles with the same blend use one native atlas operation.
 * Transforms are retained across frames, avoiding one JSI allocation per particle.
 */
export class NativeParticleRenderer {
	private readonly cache = new Map<DisplayObject, ParticleCache>();
	private readonly used = new Set<DisplayObject>();
	private readonly paint = Skia.Paint();
	private readonly frames = new NativeNineSliceRenderer();

	public beginFrame(): void {
		this.used.clear();
		this.frames.beginFrame();
	}

	public draw(object: DisplayObject, canvas: SkCanvas, alpha: number, tint: number): number {
		const system = object as ParticleDisplay;
		const texture = system.texture;
		if (system.numParticles === 0 || !texture.bitmapData) return 0;
		const image = getSkiaImage(texture.bitmapData);
		if (!image) throw new Error('A native particle system requires a native texture.');
		// drawAtlas has no strict source constraint; isolate and unrotate atlas pixels once.
		const frame = this.frames.getFrame(
			{
				texture,
				bitmapX: texture.bitmapX,
				bitmapY: texture.bitmapY,
				bitmapWidth: texture.bitmapWidth,
				bitmapHeight: texture.bitmapHeight,
			},
			image,
		);
		this.used.add(system);
		let cache = this.cache.get(system);
		if (!cache) {
			cache = { transforms: [], colors: [], sources: [] };
			this.cache.set(system, cache);
		}
		const source = { x: 0, y: 0, width: texture.bitmapWidth, height: texture.bitmapHeight };
		const scale = texture.pixelScale;
		for (let i = 0; i < system.numParticles; i++) {
			const particle = system.particles[i];
			const matrix = particle.$getMatrix(texture.textureWidth / 2, texture.textureHeight / 2);
			const tx = matrix.tx + matrix.a * texture.offsetX + matrix.c * texture.offsetY;
			const ty = matrix.ty + matrix.b * texture.offsetX + matrix.d * texture.offsetY;
			const a = matrix.a * scale;
			const b = matrix.b * scale;
			if (cache.transforms[i]) {
				cache.transforms[i].set(a, b, tx, ty);
			} else {
				cache.transforms.push(Skia.RSXform(a, b, tx, ty));
				cache.colors.push(skColor(tint));
			}
			const color = cache.colors[i];
			color[0] = ((tint >> 16) & 255) / 255;
			color[1] = ((tint >> 8) & 255) / 255;
			color[2] = (tint & 255) / 255;
			color[3] = particle.alpha;
			cache.sources[i] = source;
		}
		let draws = 0;
		for (let start = 0; start < system.numParticles;) {
			const mode = system.particles[start].blendMode;
			let end = start + 1;
			while (end < system.numParticles && system.particles[end].blendMode === mode) end++;
			this.paint.setAlphaf(alpha);
			this.paint.setBlendMode(nativeBlendMode(numberToBlendMode(mode)));
			canvas.drawAtlas(
				frame,
				cache.sources.slice(start, end),
				cache.transforms.slice(start, end),
				this.paint,
				BlendMode.Modulate,
				cache.colors.slice(start, end),
				{ filter: FilterMode.Linear },
			);
			draws++;
			start = end;
		}
		return draws;
	}

	public endFrame(): void {
		this.frames.endFrame();
		for (const [object, cache] of this.cache) {
			if (!this.used.has(object)) {
				for (const transform of cache.transforms) transform.dispose();
				this.cache.delete(object);
			}
		}
	}

	public dispose(): void {
		this.used.clear();
		this.endFrame();
		this.paint.dispose();
		this.frames.dispose();
	}
}
