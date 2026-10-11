import type { Mesh, Sprite } from '@kurot/core';
import { BlendMode } from '@kurot/core';
import { NativeSpineCachedAnimation } from './NativeSpineCachedAnimation.js';
import { captureSpinePose, spineFrameCount, spineFrameIndex } from './spine-cache-data.js';
import type { SpineCacheScope, SpinePoseSnapshot } from './spine-cache-data.js';

/**
 * Structural adapter for the existing published Spine SDK; no SDK dependency
 * or global runtime patch is needed. Each factory call must return a fresh,
 * detached source with its final skin configured and no external listeners.
 */
export interface NativeSpineCacheSource extends Sprite {
	readonly renderer: Sprite & { update(dtMs: number): void; readonly slotRenderers: Mesh[] };
	readonly skeletonData: { findAnimation(name: string): unknown };
	play(name: string, loops?: number): unknown;
	stopAll(): void;
}
export interface NativeSpineAnimationCacheOptions {
	createSource(): NativeSpineCacheSource;
	animation: string;
	sampleRate?: number;
	maxFrames?: number;
	maxBytes?: number;
}

/**
 * One immutable, precomputed looping action/skin shared by many native actors.
 * Geometry is sampled, not rasterized; atlas textures remain caller-owned.
 * This explicit mode does not expose a live skeleton, mixing or timeline events.
 */
export class NativeSpineAnimationCache {
	public readonly animation: string;
	public readonly sampleRate: number;
	public readonly durationMs: number;
	public readonly frameCount: number;
	public readonly geometryBytes: number;
	public readonly rendererScale: readonly [number, number];
	private readonly scope: SpineCacheScope = { active: true };
	private readonly poses: SpinePoseSnapshot[] = [];
	private readonly players = new Set<NativeSpineCachedAnimation>();

	public constructor(options: NativeSpineAnimationCacheOptions) {
		this.animation = options.animation;
		this.sampleRate = options.sampleRate ?? 60;
		const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid Spine cache byte budget.');
		const source = options.createSource();
		if (source.parent) throw new Error('Spine cache source must be newly created and detached.');
		let bytes = 0;
		try {
			const action = source.skeletonData.findAnimation(options.animation);
			if (
				typeof action !== 'object' ||
				!action ||
				!('duration' in action) ||
				typeof action.duration !== 'number'
			) {
				throw new Error(`Unknown Spine cache animation: ${options.animation}`);
			}
			this.durationMs = action.duration * 1000;
			this.frameCount = spineFrameCount(this.durationMs, this.sampleRate, options.maxFrames ?? 600);
			const renderer = source.renderer;
			if (
				source.numChildren !== 1 ||
				source.getChildAt(0) !== renderer ||
				source.x ||
				source.y ||
				source.rotation ||
				source.skewX ||
				source.skewY ||
				source.scaleX !== 1 ||
				source.scaleY !== 1 ||
				source.alpha !== 1 ||
				source.tint !== 0xffffff ||
				!source.visible ||
				source.anchorOffsetX ||
				source.anchorOffsetY ||
				source.blendMode !== BlendMode.NORMAL ||
				source.$filters.length ||
				source.$mask ||
				source.$maskRect ||
				source.$scrollRect ||
				source.$displayList
			) {
				throw new Error('Spine cache factory must return an unmodified detached player.');
			}
			if (
				renderer.x ||
				renderer.y ||
				renderer.rotation ||
				renderer.skewX ||
				renderer.skewY ||
				renderer.anchorOffsetX ||
				renderer.anchorOffsetY ||
				renderer.alpha !== 1 ||
				renderer.tint !== 0xffffff ||
				!renderer.visible ||
				renderer.flipX ||
				renderer.flipY ||
				renderer.blendMode !== BlendMode.NORMAL ||
				renderer.$filters.length ||
				renderer.$mask ||
				renderer.$maskRect ||
				renderer.$scrollRect ||
				renderer.$displayList ||
				renderer.$children?.length !== renderer.slotRenderers.length
			) {
				throw new Error('Spine cache source must contain only unmodified slot meshes.');
			}
			this.rendererScale = [renderer.scaleX, renderer.scaleY];
			source.play(options.animation, -1);
			renderer.update(0);
			for (let frame = 0; frame < this.frameCount; frame++) {
				if (frame) {
					renderer.update(1000 / this.sampleRate);
				}
				const snapshot = captureSpinePose(renderer.slotRenderers, this.scope, maxBytes - bytes);
				this.poses.push(snapshot.pose);
				bytes += snapshot.bytes;
			}
			this.geometryBytes = bytes;
		} catch (error) {
			this.scope.active = false;
			this.poses.length = 0;
			throw error;
		} finally {
			source.stopAll();
		}
	}

	public createPlayer(options: { autoUpdate?: boolean } = {}): NativeSpineCachedAnimation {
		this.assertActive();
		return new NativeSpineCachedAnimation(this, options.autoUpdate ?? true);
	}

	public dispose(): void {
		if (!this.scope.active) return;
		this.scope.active = false;
		for (const player of this.players) {
			player.dispose();
		}
		this.players.clear();
		this.poses.length = 0;
	}

	/**
	 * Internal player access; consumers should use seek/advanceTime on a player.
	 */
	public poseAt(timeMs: number): { pose: SpinePoseSnapshot; frame: number } {
		this.assertActive();
		const frame = spineFrameIndex(timeMs, this.durationMs, this.sampleRate, this.frameCount);
		return { pose: this.poses[frame], frame };
	}

	public releasePlayer(player: NativeSpineCachedAnimation): void {
		this.players.delete(player);
	}

	public registerPlayer(player: NativeSpineCachedAnimation): void {
		this.assertActive();
		this.players.add(player);
	}

	private assertActive(): void {
		if (!this.scope.active) throw new Error('Spine animation cache has been disposed.');
	}
}
