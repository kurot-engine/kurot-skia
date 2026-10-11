import { frameProfile } from './frame-stats.js';
import type { FrameProfile, FrameTiming } from './frame-stats.js';
import type { NativeFrameResult } from './native-frame.js';

export interface NativeScene {
	update(deltaSeconds: number): void;
	dispose(): void;
}

export interface FrameStats {
	fps: number;
	draws: number;
	frames: number;
	profile?: FrameProfile;
}

interface FrameCallbacks {
	update(deltaSeconds: number): void;
	draw(): NativeFrameResult;
	onStats?(stats: FrameStats): void;
	onError(message: string): void;
}

/**
 * Core's ticker calls render; the host owns ticker registration and resources.
 * A failed loop remains stopped until the host creates a new scene.
 */
export class NativeFrameLoop {
	private readonly timings: FrameTiming[] = [];
	private previousTime = 0;
	private statsTime = 0;
	private frames = 0;
	private intervalFrames = 0;
	private running = false;
	private failed = false;

	public constructor(
		private readonly callbacks: FrameCallbacks,
		private readonly now: () => number = () => performance.now(),
	) {}

	public start(): boolean {
		if (this.running || this.failed) return false;
		this.previousTime = this.now();
		this.statsTime = this.previousTime;
		this.intervalFrames = 0;
		this.timings.length = 0;
		this.running = true;
		return true;
	}

	public stop(): void {
		this.running = false;
	}

	public render(): void {
		if (!this.running) return;
		const now = this.now();
		const delta = Math.min((now - this.previousTime) / 1000, 0.05);
		this.previousTime = now;
		try {
			this.callbacks.update(delta);
			const updated = this.now();
			const { draws, recordedAt } = this.callbacks.draw();
			const submitted = this.now();
			if (this.callbacks.onStats) {
				this.timings.push({
					updateMs: updated - now,
					recordMs: recordedAt - updated,
					submitMs: submitted - recordedAt,
					totalMs: submitted - now,
				});
			}
			this.frames++;
			this.intervalFrames++;
			if (now - this.statsTime >= 1000) {
				this.callbacks.onStats?.({
					fps: Math.round((this.intervalFrames * 1000) / (now - this.statsTime)),
					draws,
					frames: this.frames,
					profile: frameProfile(this.timings),
				});
				this.timings.length = 0;
				this.intervalFrames = 0;
				this.statsTime = now;
			}
		} catch (error) {
			this.failed = true;
			this.stop();
			this.callbacks.onError(error instanceof Error ? error.message : String(error));
		}
	}
}
