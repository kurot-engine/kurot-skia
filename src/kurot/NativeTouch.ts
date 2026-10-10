import { TouchEvent } from '@kurot/core';
import type { DisplayObject, Stage } from '@kurot/core';

interface ActiveTouch {
    target: DisplayObject;
    x: number;
    y: number;
}

/**
 * Mirrors Core's TouchHandler targeting, bubbling and release-outside contract.
 */
export class NativeTouch {
    private readonly active = new Map<number, ActiveTouch>();

    public constructor(private readonly stage: Stage) {}

    public begin(x: number, y: number, id: number): void {
        if (this.active.has(id) || this.active.size >= this.stage.maxTouches) {
            return;
        }
        const target = this.target(x, y);
        this.active.set(id, { target, x, y });
        this.dispatch(target, TouchEvent.TOUCH_BEGIN, x, y, id, true);
    }

    public move(x: number, y: number, id: number): void {
        const touch = this.active.get(id);
        if (!touch || (touch.x === x && touch.y === y)) {
            return;
        }
        touch.x = x;
        touch.y = y;
        this.dispatch(this.target(x, y), TouchEvent.TOUCH_MOVE, x, y, id, true);
    }

    public end(x: number, y: number, id: number): void {
        const touch = this.active.get(id);
        if (!touch) {
            return;
        }
        this.active.delete(id);
        const target = this.target(x, y);
        this.dispatch(target, TouchEvent.TOUCH_END, x, y, id, false);
        if (target === touch.target) {
            this.dispatch(target, TouchEvent.TOUCH_TAP, x, y, id, false);
        } else {
            this.dispatch(touch.target, TouchEvent.TOUCH_RELEASE_OUTSIDE, x, y, id, false);
        }
    }

    public cancelAll(): void {
        const touches = [...this.active];
        this.active.clear();
        for (const [id, touch] of touches) {
            this.dispatch(touch.target, TouchEvent.TOUCH_CANCEL, touch.x, touch.y, id, false);
        }
    }

    private target(x: number, y: number): DisplayObject {
        return this.stage.$hitTest(x, y) ?? this.stage;
    }

    private dispatch(target: DisplayObject, type: string, x: number, y: number, id: number, down: boolean): void {
        TouchEvent.dispatchTouchEvent(target, type, true, true, x, y, id, down);
    }
}
