import { TouchEvent } from '@kurot/core';
import type { DisplayObject, Stage } from '@kurot/core';

import { hitTestNative } from './native-hit.js';

interface ActiveTouch {
	target: DisplayObject;
	x: number;
	y: number;
}

/**
 * Mirrors Core's TouchHandler targeting, bubbling and release-outside contract.
 */
export class NativeTouch {
	private pending = Promise.resolve();
	private generation = 0;
	private readonly active = new Map<number, ActiveTouch>();

	public constructor(private readonly stage: Stage) {}

	public begin(x: number, y: number, id: number): Promise<void> {
		return this.enqueue(async generation => {
			if (this.active.has(id) || this.active.size >= this.stage.maxTouches) {
				return;
			}
			const target = await this.target(x, y);
			if (generation !== this.generation) {
				return;
			}
			this.active.set(id, { target, x, y });
			this.dispatch(target, TouchEvent.TOUCH_BEGIN, x, y, id, true);
		});
	}

	public move(x: number, y: number, id: number): Promise<void> {
		return this.enqueue(async generation => {
			const touch = this.active.get(id);
			if (!touch || (touch.x === x && touch.y === y)) {
				return;
			}
			const target = await this.target(x, y);
			if (generation !== this.generation) {
				return;
			}
			touch.x = x;
			touch.y = y;
			this.dispatch(target, TouchEvent.TOUCH_MOVE, x, y, id, true);
		});
	}

	public end(x: number, y: number, id: number): Promise<void> {
		return this.enqueue(async generation => {
			const touch = this.active.get(id);
			if (!touch) {
				return;
			}
			const target = await this.target(x, y);
			if (generation !== this.generation) {
				return;
			}
			this.active.delete(id);
			this.dispatch(target, TouchEvent.TOUCH_END, x, y, id, false);
			if (target === touch.target) {
				this.dispatch(target, TouchEvent.TOUCH_TAP, x, y, id, false);
			} else {
				this.dispatch(touch.target, TouchEvent.TOUCH_RELEASE_OUTSIDE, x, y, id, false);
			}
		});
	}

	public cancelAll(): void {
		this.generation++;
		const touches = [...this.active];
		this.active.clear();
		for (const [id, touch] of touches) {
			this.dispatch(touch.target, TouchEvent.TOUCH_CANCEL, touch.x, touch.y, id, false);
		}
	}

	private enqueue(action: (generation: number) => Promise<void>): Promise<void> {
		const generation = this.generation;
		const task = this.pending.then(() => generation === this.generation ? action(generation) : undefined);
		this.pending = task.catch(() => {});
		return task;
	}

	private async target(x: number, y: number): Promise<DisplayObject> {
		return (await hitTestNative(this.stage, x, y)) ?? this.stage;
	}

	private dispatch(target: DisplayObject, type: string, x: number, y: number, id: number, down: boolean): void {
		TouchEvent.dispatchTouchEvent(target, type, true, true, x, y, id, down);
	}
}
