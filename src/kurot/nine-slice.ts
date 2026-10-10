import type { Bitmap, Rectangle } from '@kurot/core';
import { ColorType, FilterMode, MipmapMode, Skia } from 'react-native-skia';
import type { SkCanvas, SkImage } from 'react-native-skia';

/**
 * Native nine-slice uses an entire image, so atlas frames need cached pixel crops.
 * Source images remain caller-owned; unused sources are evicted after a frame.
 */
export class NativeNineSliceRenderer {
    private readonly paint = Skia.Paint();
    private readonly frames = new Map<SkImage, Map<string, SkImage>>();
    private readonly usedImages = new Set<SkImage>();

    public beginFrame(): void {
        this.usedImages.clear();
    }

    public endFrame(): void {
        for (const [source, frames] of this.frames) {
            if (!this.usedImages.has(source)) {
                for (const frame of frames.values()) {
                    frame.dispose();
                }
                this.frames.delete(source);
            }
        }
    }

    public draw(bitmap: Bitmap, grid: Rectangle, image: SkImage, canvas: SkCanvas, alpha: number): number {
        const scale = bitmap.texture!.pixelScale;
        const width = bitmap.width - bitmap.textureWidth + bitmap.bitmapWidth * scale;
        const height = bitmap.height - bitmap.textureHeight + bitmap.bitmapHeight * scale;
        if (width <= 0 || height <= 0) {
            return 0;
        }
        const left = (grid.x - bitmap.bitmapOffsetX) / scale;
        const top = (grid.y - bitmap.bitmapOffsetY) / scale;
        const right = bitmap.bitmapWidth - left - grid.width / scale;
        const bottom = bitmap.bitmapHeight - top - grid.height / scale;
        const fallback = (left + right) * scale > width || (top + bottom) * scale > height;
        const split = [left, top, left + grid.width / scale, top + grid.height / scale];
        if (!fallback && (split.some((value) => !Number.isFinite(value)
            || Math.abs(value - Math.round(value)) > 1e-6)
            || left < 0 || top < 0 || right < 0 || bottom < 0 || grid.width <= 0 || grid.height <= 0)) {
            throw new Error('Native nine-slice requires a positive center inside the frame with integer source-pixel boundaries.');
        }
        const frame = this.getFrame(bitmap, image);
        const dest = { x: 0, y: 0, width: width / scale, height: height / scale };
        const filter = bitmap.smoothing ? FilterMode.Linear : FilterMode.Nearest;
        this.paint.setAlphaf(alpha);
        canvas.save();
        try {
            // Native borders are physical source pixels; Core's grid and trim are logical.
            canvas.translate(bitmap.bitmapOffsetX, bitmap.bitmapOffsetY);
            canvas.scale(scale, scale);
            if (fallback) {
                canvas.drawImageRectOptions(frame, {
                    x: 0, y: 0, width: bitmap.bitmapWidth, height: bitmap.bitmapHeight,
                }, dest, filter, MipmapMode.None, this.paint);
            } else {
                canvas.drawImageNine(frame, {
                    x: Math.round(split[0]), y: Math.round(split[1]),
                    width: Math.round(split[2]) - Math.round(split[0]),
                    height: Math.round(split[3]) - Math.round(split[1]),
                }, dest, filter, this.paint);
            }
            return 1;
        } finally {
            canvas.restore();
        }
    }

    public dispose(): void {
        for (const frames of this.frames.values()) {
            for (const frame of frames.values()) {
                frame.dispose();
            }
        }
        this.frames.clear();
        this.usedImages.clear();
        this.paint.dispose();
    }

    private getFrame(bitmap: Bitmap, image: SkImage): SkImage {
        if ([bitmap.bitmapX, bitmap.bitmapY, bitmap.bitmapWidth, bitmap.bitmapHeight]
            .some((value) => !Number.isInteger(value))
            || bitmap.bitmapX < 0 || bitmap.bitmapY < 0 || bitmap.bitmapWidth <= 0 || bitmap.bitmapHeight <= 0
            || bitmap.bitmapX + bitmap.bitmapWidth > image.width()
            || bitmap.bitmapY + bitmap.bitmapHeight > image.height()) {
            throw new Error('Native nine-slice requires an integer source-pixel frame inside its image.');
        }
        if (bitmap.bitmapX === 0 && bitmap.bitmapY === 0
            && bitmap.bitmapWidth === image.width() && bitmap.bitmapHeight === image.height()) {
            return image;
        }
        this.usedImages.add(image);
        let frames = this.frames.get(image);
        const key = `${bitmap.bitmapX},${bitmap.bitmapY},${bitmap.bitmapWidth},${bitmap.bitmapHeight}`;
        const cached = frames?.get(key);
        if (cached) {
            return cached;
        }
        // Copy source pixels once without an intermediate premultiplied render target.
        const info = { width: bitmap.bitmapWidth, height: bitmap.bitmapHeight,
            colorType: ColorType.RGBA_8888, alphaType: image.getImageInfo().alphaType };
        const pixels = image.readPixels(bitmap.bitmapX, bitmap.bitmapY, info);
        if (!(pixels instanceof Uint8Array)) {
            throw new Error('Skia nine-slice source crop read failed.');
        }
        const data = Skia.Data.fromBytes(pixels);
        try {
            const frame = Skia.Image.MakeImage(info, data, bitmap.bitmapWidth * 4);
            if (!frame) {
                throw new Error('Skia nine-slice source crop allocation failed.');
            }
            if (!frames) {
                frames = new Map();
                this.frames.set(image, frames);
            }
            frames.set(key, frame);
            return frame;
        } finally {
            data.dispose();
        }
    }
}
