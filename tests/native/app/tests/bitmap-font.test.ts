import { BitmapFont, BitmapText, Resource, Stage } from '@kurot/core';
import { BitmapLabel } from '@kurot/ui';
import { createSkiaTexture, getSkiaImage, SkiaRenderer } from '@kurot/skia';

import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';

export async function runBitmapFontChecks(): Promise<void> {
    const bytes = new Uint8Array(8 * 4 * 4);
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 8; x++) bytes.set(x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * 8 + x) * 4);
    }
    const image = imageFromPixels(8, 4, bytes);
    const page = createSkiaTexture(image);
    const glyph = { y: 0, width: 4, height: 4, xOffset: 1, yOffset: 1, xAdvance: 6, logicalWidth: 6, logicalHeight: 6 };
    const font = new BitmapFont(page, { version: 1, lineHeight: 6, baseline: 5, spaceAdvance: 3,
        glyphs: { A: { ...glyph, x: 0 }, B: { ...glyph, x: 4 } }, kernings: { '65,66': -1 } }, { ownsTexture: false });
    const stage = new Stage();
    const renderer = new SkiaRenderer();
    try {
        const text = new BitmapText();
        text.font = font;
        text.text = 'AB';
        stage.addChild(text);
        assert(text.getGlyphs()[1].x === 5, 'shared kernel kerning');
        near(rgba(readGPU(stage, renderer), 2, 2), [255, 0, 0, 255], 'glyph bearing');
        near(rgba(readGPU(stage, renderer), 7, 2), [0, 0, 255, 255], 'second glyph');
        text.width = 6;
        text.height = 18;
        text.text = 'AB\nA';
        assert(text.getTextLines().length === 3, 'bitmap wrapping and hard breaks');
        text.height = 6;
        assert(text.getGlyphs().length === 1, 'only complete font rows are admitted');
        text.height = 0;
        assert(!readGPU(stage, renderer).some((value) => value !== 0), 'zero height draws no glyphs');
        stage.removeChildren();
        const label = new BitmapLabel();
        label.font = font;
        label.text = 'AB';
        label.width = 40;
        label.height = 20;
        label.textAlign = 'center';
        label.verticalAlign = 'middle';
        stage.addChild(label);
        label.validateNow();
        assert(readGPU(stage, renderer).some((value, index) => index % 4 === 3 && value > 0), 'published BitmapLabel native glyphs');
        stage.removeChildren();
        readGPU(stage, renderer);
        font.dispose();
        assert(page.bitmapData && getSkiaImage(page.bitmapData), 'borrowed page survives font/renderer eviction');
    } finally {
        stage.removeChildren();
        renderer.dispose();
        font.dispose();
        page.dispose();
        image.dispose();
    }
    const resources = new Resource(); const loadedStage = new Stage(); const loadedRenderer = new SkiaRenderer();
    try {
        await resources.loadConfig('resource/resource.json', 'resource/');
        const loaded = await resources.load<BitmapFont>('native_bitmap_font');
        assert(loaded instanceof BitmapFont && resources.get('native_bitmap_font') === loaded, 'native bitmap-font Resource analyzer');
        const text = new BitmapText(); text.font = loaded; text.text = 'AB'; loadedStage.addChild(text);
        assert(text.getGlyphs()[1].x === 5 && readGPU(loadedStage, loadedRenderer).some((value, i) => i % 4 === 3 && value > 0), 'manifest font glyphs and kerning draw');
        loadedStage.removeChildren(); readGPU(loadedStage, loadedRenderer);
        assert(resources.destroy('native_bitmap_font'), 'font resource disposal');
        const reloaded = await resources.load<BitmapFont>('native_bitmap_font');
        assert(reloaded instanceof BitmapFont && reloaded !== loaded, 'font resource reload creates a fresh font/page');
    } finally { loadedStage.removeChildren(); loadedRenderer.dispose(); resources.destroyAll(); }
    console.info('Kurot Skia: bitmap font GPU checks passed (kerning, bearings, wrapping, clipping, BitmapLabel, ownership).');
}
