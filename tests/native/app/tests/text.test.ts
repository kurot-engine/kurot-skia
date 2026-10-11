import { HorizontalAlign, Rectangle, Sprite, Stage, TextField, TextFieldType, VerticalAlign } from '@kurot/core';
import { AlphaType, ColorType, Skia } from 'react-native-skia';

import { measureTextMetrics } from '@kurot/skia';
import { SkiaRenderer } from '@kurot/skia';
import { createParagraph, nativeFontStyle } from '@kurot/skia';

const width = 256;
const height = 192;

interface Ink {
    left: number;
    right: number;
    top: number;
    bottom: number;
    pixels: Uint8Array;
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Native text check failed: ${message}`);
    }
}

function render(stage: Stage, renderer: SkiaRenderer): Ink {
    const surface = Skia.Surface.Make(width, height);
    assert(!!surface, 'native raster surface');
    try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('transparent'));
        renderer.render(stage, canvas);
        const image = surface.makeImageSnapshot();
        try {
            const pixels = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
            assert(pixels instanceof Uint8Array, 'native RGBA pixel readback');
            let left = width;
            let right = -1;
            let top = height;
            let bottom = -1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (pixels[(y * width + x) * 4 + 3] > 16) {
                        left = Math.min(left, x);
                        right = Math.max(right, x);
                        top = Math.min(top, y);
                        bottom = Math.max(bottom, y);
                    }
                }
            }
            return { left, right, top, bottom, pixels };
        } finally {
            image.dispose();
        }
    } finally {
        surface.dispose();
    }
}

/**
 * Checks Core layout against native shaped glyphs and independently read raster pixels.
 */
export function runTextChecks(): void {
    const defaultField = new TextField();
    defaultField.text = 'Hello 中文';
    assert(defaultField.textWidth > 0 && defaultField.textHeight === 30, 'Core default Arial resolves through native fallback');
    const metrics = measureTextMetrics('Kurot 中文', 'sans-serif', 24, false, false);
    const spaced = measureTextMetrics('Kurot 中文 ', 'sans-serif', 24, false, false);
    const empty = measureTextMetrics('', 'sans-serif', 24, false, false);
    assert(metrics.width > 50 && metrics.actualBoundingBoxAscent > 0, 'native advances and ink');
    assert(spaced.width > metrics.width, 'trailing spaces count toward advance width');
    assert(empty.width === 0 && empty.actualBoundingBoxAscent === 0
        && empty.fontBoundingBoxAscent === metrics.fontBoundingBoxAscent, 'stable nominal font frame');

    const paragraph = createParagraph('Kurot 中文', nativeFontStyle('sans-serif', 24, false, false));
    try {
        let runs = 0;
        paragraph.extendedVisit((_line, info) => {
            if (info) {
                try {
                    runs++;
                    assert(info.glyphs.every((glyph) => glyph !== 0), 'fallback finds every glyph');
                } finally {
                    info.font.dispose();
                }
            }
        });
        assert(runs >= 2, 'CJK system-font fallback');
    } finally {
        paragraph.dispose();
    }

    const field = new TextField();
    field.fontFamily = 'sans-serif';
    field.size = 24;
    field.width = 200;
    field.height = 100;
    field.x = field.y = 20;
    field.text = '中文 Kurot';
    field.multiline = false;
    field.textAlign = HorizontalAlign.CENTER;
    const stage = new Stage();
    stage.addChild(field);
    const renderer = new SkiaRenderer();
    try {
        const middle = render(stage, renderer);
        assert(middle.right > middle.left && Math.abs((middle.top + middle.bottom + 1) / 2 - 70) <= 2, 'default middle centers actual ink');
        assert(Math.abs((middle.left + middle.right + 1) / 2 - 120) <= 3, 'horizontal center');
        field.verticalAlign = VerticalAlign.TOP;
        const top = render(stage, renderer);
        assert(Math.abs(top.top - 20) <= 2, 'top aligns glyph block');
        field.verticalAlign = VerticalAlign.BOTTOM;
        const bottom = render(stage, renderer);
        assert(Math.abs(bottom.bottom + 1 - 120) <= 2, 'bottom aligns glyph block');

        field.textColor = 0xff0000;
        const red = render(stage, renderer);
        const pixel = red.pixels.findIndex((_value, index) => index % 4 === 3 && red.pixels[index] > 128) - 3;
        assert(pixel >= 0 && red.pixels[pixel] > 200 && red.pixels[pixel + 1] < 10, 'color changes invalidate cached paragraph paint');
        const nominalWidth = field.textWidth;
        field.stroke = 3;
        field.strokeColor = 0x00ff00;
        const outlined = render(stage, renderer);
        assert(outlined.top < bottom.top && outlined.bottom > bottom.bottom && field.textWidth === nominalWidth, 'outline expands ink without changing nominal measurement');

        field.stroke = 0;
        field.verticalAlign = VerticalAlign.TOP;
        field.textAlign = HorizontalAlign.LEFT;
        field.textFlow = [
            { text: '大', style: { size: 32, bold: true, textColor: 0x67e3bb } },
            { text: 'small 中文', style: { size: 16, italic: true, textColor: 0x72adff } },
        ];
        assert(field.getLinesArr()[0].height === 32 && render(stage, renderer).right > 20, 'mixed-size rich runs share the Core baseline');
        const cachedLines = field.getLinesArr();
        const measured = field.measureText(45);
        assert(measured.width > 0 && field.getLinesArr() === cachedLines, 'independent measurement preserves live line cache');
        field.invalidateTextMetrics();
        assert(field.getLinesArr() !== cachedLines, 'explicit font-metric invalidation');

        field.text = '中文自动换行 Hello world 👨‍👩‍👧‍👦 emoji';
        field.size = 20;
        field.width = 82;
        field.multiline = true;
        field.wordWrap = true;
        field.lineSpacing = 5;
        const lines = field.getLinesArr();
        assert(lines.length > 2 && lines.reduce((total, line) => total + line.charNum, 0) === field.text.length, 'Core wraps and retains UTF-16 offsets');
        assert(lines.some((line) => line.elements.some((element) => element.text.includes('👨‍👩‍👧‍👦'))), 'emoji grapheme stays intact');
        assert(render(stage, renderer).bottom < 20 + field.height + 3, 'fixed-height clipping');
        field.scrollV = 2;
        assert(field.getScrollYOffset() > 0 && render(stage, renderer).right > 20, 'scrollV draws later rows');
        field.multiline = false;
        field.text = 'first\nsecond';
        assert(field.getLinesArr().length === 1 && field.getLinesArr()[0].elements[0].text === 'first', 'single-line hard-break contract');

        field.text = 'Alpha';
        field.textColor = 0xffffff;
        field.tint = 0x00ff00;
        field.alpha = 0.4;
        const tinted = render(stage, renderer);
        let maxAlpha = 0;
        for (let index = 3; index < tinted.pixels.length; index += 4) {
            maxAlpha = Math.max(maxAlpha, tinted.pixels[index]);
        }
        assert(maxAlpha > 70 && maxAlpha <= 103, 'text opacity applies once');
        stage.removeChild(field);
        const parent = new Sprite();
        parent.scrollRect = new Rectangle(0, 0, 60, 50);
        parent.addChild(field);
        stage.addChild(parent);
        const clipped = render(stage, renderer);
        assert(clipped.right < 60 && clipped.bottom < 50, 'external clip stays exact');
        stage.removeChildren();
        assert(render(stage, renderer).right === -1, 'removed text evicts native paragraphs');
        const input = new TextField();
        input.type = TextFieldType.INPUT;
        input.text = 'Native input';
        stage.addChild(input);
        assert(render(stage, renderer).right > 0, 'unfocused input renders without DOM');
        stage.removeChildren();

    } finally {
        stage.removeChildren();
        renderer.dispose();
    }
    console.info('Kurot Skia: native text checks passed (fallback, metrics, wrapping, alignment, rich text, outline, cache, alpha, clip).');
}
