import { Bitmap, BitmapFillMode, DisplayObjectContainer, setGraphicsHitTest } from '@kurot/core';
import type { DisplayObject, Graphics, Stage, TextField } from '@kurot/core';
import { ClipOp, FilterMode, MipmapMode, Skia } from 'react-native-skia';
import type { SkCanvas } from 'react-native-skia';

import { compileGraphics, disposeGraphics, skColor } from './graphics.js';
import type { GraphicsDraw } from './graphics.js';
import { getSkiaImage } from './textures.js';
import { NativeTextRenderer } from './NativeTextRenderer.js';
import { NativeNineSliceRenderer } from './nine-slice.js';

/**
 * One native player owns Core's global Graphics hit-test hook, like its web Player.
 */
export class SkiaRenderer {
    private readonly graphics = new Map<Graphics, GraphicsDraw[]>();
    private readonly bitmapPaint = Skia.Paint();
    private readonly nineSlice = new NativeNineSliceRenderer();
    private readonly text = new NativeTextRenderer();
    private usedGraphics = new Set<Graphics>();

    public constructor() {
        setGraphicsHitTest((graphics, x, y) => this.getGraphics(graphics)
            .some((draw) => draw.hitPath.contains(x, y)));
    }

    public render(stage: Stage, canvas: SkCanvas): number {
        this.usedGraphics = new Set();
        this.text.beginFrame();
        const count = this.draw(stage, canvas, 1, 0xffffff);
        this.text.endFrame();
        for (const [graphics, draws] of this.graphics) {
            if (!this.usedGraphics.has(graphics)) {
                disposeGraphics(draws);
                this.graphics.delete(graphics);
            }
        }
        return count;
    }

    public dispose(): void {
        setGraphicsHitTest(() => false);
        for (const draws of this.graphics.values()) {
            disposeGraphics(draws);
        }
        this.graphics.clear();
        this.bitmapPaint.dispose();
        this.nineSlice.dispose();
        this.text.dispose();
    }

    private draw(object: DisplayObject, canvas: SkCanvas, parentAlpha: number, parentTint: number): number {
        if (!object.visible || object.alpha <= 0 || object.$maskedObject) {
            return 0;
        }
        if (object.$filters.length || object.$mask || object.$displayList || object.blendMode !== 'source-over') {
            throw new Error('Skia prototype: filters, display masks, caches and blend modes need native adapters.');
        }
        if (object instanceof DisplayObjectContainer && object.sortableChildren) {
            object.sortChildren();
        }
        const alpha = parentAlpha * object.alpha;
        const tint = object.tint === 0xffffff ? parentTint : object.tint;
        const matrix = object.$getMatrix();
        canvas.save();
        try {
            canvas.concat([matrix.a, matrix.c, matrix.tx, matrix.b, matrix.d, matrix.ty, 0, 0, 1]);
            canvas.translate(-object.anchorOffsetX, -object.anchorOffsetY);
            if (object.$scrollRect) {
                const rect = object.$scrollRect;
                canvas.clipRect({ x: 0, y: 0, width: rect.width, height: rect.height }, ClipOp.Intersect, true);
                canvas.translate(-rect.x, -rect.y);
            }
            if (object.$maskRect) {
                const rect = object.$maskRect;
                canvas.clipRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ClipOp.Intersect, true);
            }
            let count = 0;
            // Core's const enum is erased in its published JS; these are its stable render tags.
            switch (object.$renderObjectType) {
                case 3:
                case 4: {
                    const graphics = object.graphics;
                    if (!graphics) {
                        throw new Error('Graphics render tag has no Graphics object.');
                    }
                    for (const draw of this.getGraphics(graphics)) {
                        draw.paint.setColor(skColor(draw.color, tint));
                        draw.paint.setAlphaf(draw.alpha * alpha);
                        canvas.drawPath(draw.path, draw.paint);
                        count++;
                    }
                    break;
                }
                case 1:
                    count += this.drawBitmap(object as Bitmap, canvas, alpha, tint);
                    break;
                case 5:
                    count += this.text.draw(object as TextField, canvas, alpha, tint);
                    break;
                case 0:
                    break;
                default:
                    throw new Error(`Skia prototype: render type ${object.$renderObjectType} is not implemented.`);
            }
            for (const child of object.$children ?? []) {
                count += this.draw(child, canvas, alpha, tint);
            }
            return count;
        } finally {
            canvas.restore();
        }
    }

    private getGraphics(graphics: Graphics): GraphicsDraw[] {
        this.usedGraphics.add(graphics);
        let draws = this.graphics.get(graphics);
        if (!draws || graphics.canvasCacheDirty) {
            const next = compileGraphics(graphics);
            if (draws) {
                disposeGraphics(draws);
            }
            draws = next;
            this.graphics.set(graphics, draws);
            graphics.canvasCacheDirty = false;
        }
        return draws;
    }

    private drawBitmap(bitmap: Bitmap, canvas: SkCanvas, alpha: number, tint: number): number {
        if (!bitmap.texture || !bitmap.bitmapData) {
            return 0;
        }
        if (bitmap.fillMode !== BitmapFillMode.SCALE || bitmap.texture.rotated || tint !== 0xffffff || bitmap.pixelHitTest) {
            throw new Error('Skia prototype: Bitmap supports unrotated scale/nine-slice textures without tint/pixel hits.');
        }
        const image = getSkiaImage(bitmap.bitmapData);
        if (!image) {
            throw new Error('Use createSkiaTexture() to bind a native SkImage to a Kurot Texture.');
        }
        if (bitmap.textureWidth <= 0 || bitmap.textureHeight <= 0 || bitmap.width <= 0 || bitmap.height <= 0) {
            return 0;
        }
        if (bitmap.scale9Grid) {
            return this.nineSlice.draw(bitmap, bitmap.scale9Grid, image, canvas, alpha);
        }
        this.bitmapPaint.setAlphaf(alpha);
        const scaleX = bitmap.width / bitmap.textureWidth;
        const scaleY = bitmap.height / bitmap.textureHeight;
        canvas.drawImageRectOptions(image, {
            x: bitmap.bitmapX, y: bitmap.bitmapY, width: bitmap.bitmapWidth, height: bitmap.bitmapHeight,
        }, {
            x: bitmap.bitmapOffsetX * scaleX, y: bitmap.bitmapOffsetY * scaleY,
            width: bitmap.bitmapWidth * bitmap.texture.pixelScale * scaleX,
            height: bitmap.bitmapHeight * bitmap.texture.pixelScale * scaleY,
        }, bitmap.smoothing ? FilterMode.Linear : FilterMode.Nearest, MipmapMode.None, this.bitmapPaint);
        return 1;
    }
}
