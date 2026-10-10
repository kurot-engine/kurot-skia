import type { Bitmap, Rectangle } from '@kurot/core';
import { FilterMode, MipmapMode, Skia, TileMode } from 'react-native-skia';
import type { SkCanvas, SkImage, SkRuntimeEffect } from 'react-native-skia';

const source = `
uniform shader image;
uniform float4 sourceX;
uniform float4 sourceY;
uniform float4 destinationX;
uniform float4 destinationY;

float mapAxis(float position, float4 src, float4 dst) {
    float2 s;
    float2 d;
    if (dst.y > dst.x && position < dst.y) {
        s = src.xy;
        d = dst.xy;
    } else if (dst.z > dst.y && (position < dst.z || dst.w <= dst.z)) {
        s = src.yz;
        d = dst.yz;
    } else {
        s = src.zw;
        d = dst.zw;
    }
    if (s.y <= s.x || d.y <= d.x) {
        return -1.0;
    }
    float coordinate = mix(s.x, s.y, (position - d.x) / (d.y - d.x));
    float inset = min(0.5, (s.y - s.x) * 0.5);
    return clamp(coordinate, s.x + inset, s.y - inset);
}

half4 main(float2 position) {
    float2 coordinate = float2(mapAxis(position.x, sourceX, destinationX),
                               mapAxis(position.y, sourceY, destinationY));
    if (coordinate.x < 0.0 || coordinate.y < 0.0) {
        return half4(0.0);
    }
    return image.eval(coordinate);
}
`;

/**
 * Samples Core's nine regions in one primitive. Shared edges never receive
 * separate coverage/blending, including Graphite's rotated GPU rectangles.
 */
export class NativeNineSliceRenderer {
    private readonly paint = Skia.Paint();
    private effect: SkRuntimeEffect | undefined;

    public draw(bitmap: Bitmap, grid: Rectangle, image: SkImage, canvas: SkCanvas, alpha: number): number {
        const scale = bitmap.texture!.pixelScale;
        const width = bitmap.width - bitmap.textureWidth + bitmap.bitmapWidth * scale;
        const height = bitmap.height - bitmap.textureHeight + bitmap.bitmapHeight * scale;
        if (width <= 0 || height <= 0) {
            return 0;
        }
        const ox = bitmap.bitmapOffsetX;
        const oy = bitmap.bitmapOffsetY;
        const left = (grid.x - ox) / scale;
        const top = (grid.y - oy) / scale;
        const right = bitmap.bitmapWidth - left - grid.width / scale;
        const bottom = bitmap.bitmapHeight - top - grid.height / scale;
        // Retain Core's scale fallback when the destination cannot fit fixed borders.
        const fallback = (left + right) * scale > width || (top + bottom) * scale > height;
        const sx = [bitmap.bitmapX, bitmap.bitmapX + (fallback ? 0 : left),
            bitmap.bitmapX + bitmap.bitmapWidth - (fallback ? 0 : right), bitmap.bitmapX + bitmap.bitmapWidth];
        const sy = [bitmap.bitmapY, bitmap.bitmapY + (fallback ? 0 : top),
            bitmap.bitmapY + bitmap.bitmapHeight - (fallback ? 0 : bottom), bitmap.bitmapY + bitmap.bitmapHeight];
        const dx = [ox, ox + (fallback ? 0 : left * scale),
            ox + width - (fallback ? 0 : right * scale), ox + width];
        const dy = [oy, oy + (fallback ? 0 : top * scale),
            oy + height - (fallback ? 0 : bottom * scale), oy + height];
        if (!this.effect) {
            this.effect = Skia.RuntimeEffect.Make(source) ?? undefined;
            if (!this.effect) {
                throw new Error('Skia nine-slice shader compilation failed.');
            }
        }
        const imageShader = image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp,
            bitmap.smoothing ? FilterMode.Linear : FilterMode.Nearest, MipmapMode.None);
        try {
            // Clamp each region to its texel centers, matching strict source-rect sampling.
            const shader = this.effect.makeShaderWithChildren([...sx, ...sy, ...dx, ...dy], [imageShader]);
            try {
                this.paint.setShader(shader);
                this.paint.setAlphaf(alpha);
                canvas.drawRect({ x: ox, y: oy, width, height }, this.paint);
                return 1;
            } finally {
                this.paint.reset();
                this.paint.setAntiAlias(true);
                shader.dispose();
            }
        } finally {
            imageShader.dispose();
        }
    }

    public dispose(): void {
        this.paint.dispose();
        this.effect?.dispose();
        this.effect = undefined;
    }
}
