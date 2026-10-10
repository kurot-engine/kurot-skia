import { HorizontalAlign, TextFieldType } from '@kurot/core';
import type { ILineElement, TextField } from '@kurot/core';
import { ClipOp, PaintStyle, Skia, StrokeJoin } from 'react-native-skia';
import type { SkCanvas, SkParagraph } from 'react-native-skia';

import { getTextRenderPadding } from '@kurot/core/dist/kurot/text/TextRenderBounds.js';
import { getTextVerticalOffset } from '@kurot/core/dist/kurot/text/TextVerticalLayout.js';
import { skColor } from './graphics.js';
import { createParagraph, nativeFontStyle } from './paragraph.js';

interface TextRun {
    fill: SkParagraph;
    outline?: SkParagraph;
    baseline: number;
    width: number;
}

interface TextCache {
    lines: ILineElement[];
    appearance: string;
    runs: TextRun[][];
}

function disposeCache(cache: TextCache): void {
    for (const line of cache.runs) {
        for (const run of line) {
            run.fill.dispose();
            run.outline?.dispose();
        }
    }
}

/**
 * Core owns rows, baselines, alignment and clipping; SkParagraph shapes each run.
 */
export class NativeTextRenderer {
    private readonly cache = new Map<TextField, TextCache>();
    private readonly used = new Set<TextField>();
    private readonly paint = Skia.Paint();
    private readonly opacity = Skia.Paint();

    public beginFrame(): void {
        this.used.clear();
    }

    public draw(field: TextField, canvas: SkCanvas, alpha: number, tint: number): number {
        if (field.type !== TextFieldType.DYNAMIC) {
            throw new Error('Skia prototype: only dynamic TextField is supported.');
        }
        const lines = field.getLinesArr();
        const width = Number.isNaN(field.$explicitWidth) ? field.textWidth : field.$explicitWidth;
        const height = Number.isNaN(field.$explicitHeight) ? field.textHeight : field.$explicitHeight;
        if (width <= 0 || height <= 0) {
            return 0;
        }
        this.used.add(field);
        const cache = this.getCache(field, lines, tint);
        let count = 0;
        canvas.save();
        try {
            if (alpha < 1) {
                this.opacity.setAlphaf(alpha);
                canvas.saveLayer(this.opacity);
            }
            try {
                this.paint.setAntiAlias(true);
                this.paint.setStyle(PaintStyle.Fill);
                if (field.background) {
                    this.paint.setColor(skColor(field.backgroundColor, tint));
                    canvas.drawRect({ x: 0, y: 0, width, height }, this.paint);
                    count++;
                }
                if (field.border) {
                    this.paint.setColor(skColor(field.borderColor, tint));
                    this.paint.setStyle(PaintStyle.Stroke);
                    this.paint.setStrokeWidth(1);
                    canvas.drawRect({ x: 0, y: 0, width, height }, this.paint);
                    count++;
                }
                const padding = getTextRenderPadding(field);
                canvas.clipRect({ x: -padding, y: -padding, width: width + padding * 2, height: height + padding * 2 }, ClipOp.Intersect, true);
                let y = getTextVerticalOffset(field) - field.getScrollYOffset();
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const hasInk = line.inkAscent + line.inkDescent > 0;
                    const top = y + (hasInk ? line.baseline - line.inkAscent : 0);
                    const bottom = y + (hasInk ? line.baseline + line.inkDescent : line.height);
                    if (bottom > 0 && top < height) {
                        let x = field.textAlign === HorizontalAlign.RIGHT ? width - line.width
                            : field.textAlign === HorizontalAlign.CENTER ? (width - line.width) / 2 : 0;
                        for (const run of cache.runs[i]) {
                            const baselineY = y + line.baseline - run.baseline;
                            if (run.outline) {
                                run.outline.paint(canvas, x, baselineY);
                                count++;
                            }
                            run.fill.paint(canvas, x, baselineY);
                            count++;
                            x += run.width;
                        }
                    }
                    y += line.height + field.lineSpacing;
                }
            } finally {
                if (alpha < 1) {
                    canvas.restore();
                }
            }
        } finally {
            canvas.restore();
        }
        return count;
    }

    public endFrame(): void {
        for (const [field, cache] of this.cache) {
            if (!this.used.has(field)) {
                disposeCache(cache);
                this.cache.delete(field);
            }
        }
    }

    public dispose(): void {
        for (const cache of this.cache.values()) {
            disposeCache(cache);
        }
        this.cache.clear();
        this.used.clear();
        this.paint.dispose();
        this.opacity.dispose();
    }

    private getCache(field: TextField, lines: ILineElement[], tint: number): TextCache {
        const appearance = [field.textColor, field.strokeColor, field.stroke, tint].join(':');
        const previous = this.cache.get(field);
        if (previous?.lines === lines && previous.appearance === appearance) {
            return previous;
        }
        const next: TextCache = { lines, appearance, runs: [] };
        try {
            for (const line of lines) {
                const runs: TextRun[] = [];
                next.runs.push(runs);
                for (const element of line.elements) {
                    const style = element.style;
                    const font = nativeFontStyle(style?.fontFamily ?? field.fontFamily, style?.size ?? field.size,
                        style?.bold ?? field.bold, style?.italic ?? field.italic);
                    const fill = createParagraph(element.text, { ...font, color: skColor(style?.textColor ?? field.textColor, tint) });
                    const run: TextRun = { fill, width: element.width, baseline: fill.getLineMetrics()[0]?.baseline ?? 0 };
                    runs.push(run);
                    const stroke = style?.stroke ?? field.stroke;
                    if (stroke > 0) {
                        this.paint.setColor(skColor(style?.strokeColor ?? field.strokeColor, tint));
                        this.paint.setStyle(PaintStyle.Stroke);
                        this.paint.setStrokeWidth(stroke * 2);
                        this.paint.setStrokeJoin(StrokeJoin.Round);
                        run.outline = createParagraph(element.text, font, this.paint);
                    }
                }
            }
        } catch (error) {
            disposeCache(next);
            throw error;
        }
        if (previous) {
            disposeCache(previous);
        }
        this.cache.set(field, next);
        return next;
    }
}
