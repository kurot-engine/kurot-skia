import { Shape, Sprite, Stage } from '@kurot/core';
import { ScrollView } from '@kurot/game';
import { NativeTouch, SkiaRenderer } from '@kurot/skia';
import { assert, near, readGPU, rgba } from './gpu';

export function runScrollViewChecks(): void {
    const stage = new Stage(); stage.setContentSize(128, 128);
    const renderer = new SkiaRenderer(); const input = new NativeTouch(stage);
    const content = new Sprite(); const shape = new Shape();
    shape.graphics.beginFill(0xff0000); shape.graphics.drawRect(0, 0, 40, 100); shape.graphics.endFill();
    shape.graphics.beginFill(0x0000ff); shape.graphics.drawRect(0, 100, 40, 100); shape.graphics.endFill();
    content.addChild(shape);
    const scroll = new ScrollView(); scroll.x = scroll.y = 10; scroll.width = scroll.height = 40;
    scroll.bounces = false; scroll.scrollBeginThreshold = 2; scroll.setContent(content); stage.addChild(scroll);
    try {
        assert(scroll.scrollBottom === 160, 'Game ScrollView content extent');
        near(rgba(readGPU(stage, renderer), 20, 20), [255, 0, 0, 255], 'ScrollView top');
        scroll.setScrollTop(120);
        const scrolled = readGPU(stage, renderer);
        near(rgba(scrolled, 20, 20), [0, 0, 255, 255], 'ScrollView moved content');
        near(rgba(scrolled, 20, 55), [0, 0, 0, 0], 'ScrollView viewport clip');
        scroll.scrollTop = 100;
        input.begin(25, 35, 91); input.move(25, 20, 91);
        assert(scroll.scrollTop > 100, 'native touch scrolls Game ScrollView');
        input.end(25, 20, 91);
        scroll.setScrollTop(500);
        assert(scroll.scrollTop === 160, 'non-bouncing scroll clamps');
        scroll.removeContent();
        assert(!scroll.content && scroll.numChildren === 0, 'ScrollView content cleanup');
        stage.removeChildren(); readGPU(stage, renderer);
    } finally { input.cancelAll(); stage.removeChildren(); renderer.dispose(); }
    console.info('Kurot Skia: Game ScrollView GPU checks passed (bounds, scrolling, viewport clip, touch, cleanup).');
}
