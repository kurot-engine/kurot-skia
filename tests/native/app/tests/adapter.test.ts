import { Rectangle, Shape, Sprite, Stage, TouchEvent } from '@kurot/core';

import { NativeTouch } from '@kurot/skia';
import { createViewport } from '@kurot/skia';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`Native adapter check failed: ${message}`);
    }
}

/**
 * Run against the real native SkPath hit-test hook in a development build.
 */
export function runAdapterChecks(): void {
    const viewport = createViewport(320, 400, 360, 500);
    assert(viewport.scale === 0.8 && viewport.x === 16 && viewport.y === 0, 'aspect-preserving viewport');
    const stage = new Stage();
    stage.maxTouches = 1;
    const parent = new Sprite();
    parent.x = 41;
    parent.y = 37;
    parent.scaleX = 1.3;
    parent.rotation = 31;
    const circle = new Shape();
    circle.x = 12;
    circle.y = 19;
    circle.anchorOffsetX = 3;
    circle.touchEnabled = true;
    circle.graphics.beginFill(0xffffff);
    circle.graphics.drawCircle(0, 0, 12);
    circle.graphics.endFill();
    parent.addChild(circle);
    stage.addChild(parent);
    const center = circle.localToGlobal(0, 0);
    const corner = circle.localToGlobal(10, 10);
    assert(stage.$hitTest(center.x, center.y) === circle, 'nested rotation, scale and anchor hit');
    assert(stage.$hitTest(corner.x, corner.y) !== circle, 'circle rejects bounding-box corners');
    parent.scrollRect = new Rectangle(5, 7, 50, 50);
    const scrolled = circle.localToGlobal(0, 0);
    assert(stage.$hitTest(scrolled.x, scrolled.y) === circle, 'scroll offsets in input coordinates');
    parent.scrollRect = undefined;

    const events: string[] = [];
    circle.addEventListener(TouchEvent.TOUCH_BEGIN, (event) => {
        assert(Math.abs(event.localX) < 0.00001 && Math.abs(event.localY) < 0.00001, 'touch local coordinates');
        events.push('begin');
    });
    parent.addEventListener(TouchEvent.TOUCH_BEGIN, () => events.push('bubble'));
    circle.addEventListener(TouchEvent.TOUCH_CANCEL, () => events.push('cancel'));
    circle.addEventListener(TouchEvent.TOUCH_TAP, () => events.push('tap'));
    circle.addEventListener(TouchEvent.TOUCH_RELEASE_OUTSIDE, () => events.push('outside'));
    const input = new NativeTouch(stage);
    input.begin(center.x, center.y, 1);
    input.begin(center.x, center.y, 2);
    input.cancelAll();
    input.end(center.x, center.y, 1);
    assert(events.join(',') === 'begin,bubble,cancel', 'maxTouches and cancellation suppress taps');
    input.begin(center.x, center.y, 3);
    input.end(center.x, center.y, 3);
    assert(events.at(-1) === 'tap', 'tap targeting');
    input.begin(center.x, center.y, 4);
    input.end(center.x + 1000, center.y, 4);
    assert(events.at(-1) === 'outside', 'release-outside targeting');

    circle.graphics.clear();
    circle.graphics.beginFill(0xffffff);
    circle.graphics.drawRect(0, 0, 20, 10);
    circle.graphics.endFill();
    circle.flipX = true;
    const reflected = circle.localToGlobal(2, 5);
    assert(stage.$hitTest(reflected.x, reflected.y) === circle, 'dirty Graphics rebuild and centered flip');
    stage.removeChildren();
    console.info('Kurot Skia: native adapter checks passed (viewport, paths, transforms, input).');
}
