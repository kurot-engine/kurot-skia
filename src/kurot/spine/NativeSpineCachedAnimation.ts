import { Event, Mesh, Sprite } from '@kurot/core';
import type { Stage } from '@kurot/core';
import type { NativeSpineAnimationCache } from './NativeSpineAnimationCache.js';
import { bindSpinePose } from './spine-cache-data.js';

/**
 * Independent clock and display transforms over a shared sampled animation.
 * Slot geometry is immutable. Dispose the player before releasing atlas assets.
 */
export class NativeSpineCachedAnimation extends Sprite {
	public readonly renderer = new Sprite();
	public paused = false;
	private readonly meshes: Mesh[] = [];
	private timeMs = 0;
	private timeScale = 1;
	private frame = -1;
	private lastTime = 0;
	private disposed = false;
	private readonly handleFrame = (): void => {
		const now = Date.now();
		this.advanceTime(Math.max(0, now - this.lastTime));
		this.lastTime = now;
	};

	public constructor(
		private readonly cache: NativeSpineAnimationCache,
		private readonly autoUpdate = true,
	) {
		super();
		this.renderer.sortableChildren = true;
		[this.renderer.scaleX, this.renderer.scaleY] = cache.rendererScale;
		for (const slot of cache.poseAt(0).pose.slots) {
			const mesh = new Mesh(slot.texture);
			this.meshes.push(mesh);
			this.renderer.addChild(mesh);
		}
		this.addChild(this.renderer);
		this.seek(0);
		cache.registerPlayer(this);
	}

	public get sampleTimeMs(): number {
		return (this.frame * 1000) / this.cache.sampleRate;
	}
	public get currentTimeMs(): number {
		return this.timeMs;
	}

	public seek(timeMs: number): void {
		this.assertActive();
		const { pose, frame } = this.cache.poseAt(timeMs);
		this.timeMs = ((timeMs % this.cache.durationMs) + this.cache.durationMs) % this.cache.durationMs;
		if (frame === this.frame) return;
		this.frame = frame;
		for (let index = 0; index < this.meshes.length; index++) {
			const mesh = this.meshes[index];
			const slot = pose.slots[index];
			mesh.vertices = slot.vertices;
			mesh.uvs = slot.uvs;
			mesh.indices = slot.indices;
			mesh.texture = slot.texture;
			mesh.visible = slot.visible;
			mesh.alpha = slot.alpha;
			mesh.tint = slot.tint;
			mesh.smoothing = slot.smoothing;
			mesh.blendMode = slot.blendMode;
			mesh.zIndex = slot.zIndex;
			bindSpinePose(mesh, pose, index);
			mesh.updateVertices();
		}
	}

	public advanceTime(deltaMs: number): void {
		this.assertActive();
		if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Spine delta must be finite and nonnegative.');
		if (!this.paused) {
			this.seek(this.timeMs + deltaMs * this.timeScale);
		}
	}

	public setTimeScale(scale: number): void {
		if (!Number.isFinite(scale) || scale < 0) throw new Error('Spine time scale must be finite and nonnegative.');
		this.timeScale = scale;
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.removeEventListener(Event.ENTER_FRAME, this.handleFrame);
		this.parent?.removeChild(this);
		this.renderer.removeChildren();
		this.meshes.length = 0;
		this.cache.releasePlayer(this);
	}

	public override $onAddToStage(stage: Stage, nestLevel: number): void {
		this.assertActive();
		super.$onAddToStage(stage, nestLevel);
		this.lastTime = Date.now();
		if (this.autoUpdate) {
			this.addEventListener(Event.ENTER_FRAME, this.handleFrame);
		}
	}

	public override $onRemoveFromStage(): void {
		super.$onRemoveFromStage();
		this.removeEventListener(Event.ENTER_FRAME, this.handleFrame);
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('Cached Spine player has been disposed.');
	}
}
