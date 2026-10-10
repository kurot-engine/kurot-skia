import type { Bitmap, Rectangle } from '@kurot/core';

type RegionDrawer = (sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number) => void;

/**
 * Mirrors Core 2.5.3's Canvas nine-slice geometry: physical sampling, logical
 * borders and trim margins, with a scale fallback below the fixed border size.
 */
export function drawNineSlice(bitmap: Bitmap, grid: Rectangle, draw: RegionDrawer): number {
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
    const middleWidth = grid.width / scale;
    const middleHeight = grid.height / scale;
    const right = bitmap.bitmapWidth - left - middleWidth;
    const bottom = bitmap.bitmapHeight - top - middleHeight;
    const borderLeft = left * scale;
    const borderTop = top * scale;
    const borderRight = right * scale;
    const borderBottom = bottom * scale;
    if (borderLeft + borderRight > width || borderTop + borderBottom > height) {
        draw(bitmap.bitmapX, bitmap.bitmapY, bitmap.bitmapWidth, bitmap.bitmapHeight,
            ox, oy, width, height);
        return 1;
    }
    const sx = [bitmap.bitmapX, bitmap.bitmapX + left, bitmap.bitmapX + left + middleWidth];
    const sy = [bitmap.bitmapY, bitmap.bitmapY + top, bitmap.bitmapY + top + middleHeight];
    const sw = [left, middleWidth, right];
    const sh = [top, middleHeight, bottom];
    const dx = [ox, ox + borderLeft, ox + width - borderRight];
    const dy = [oy, oy + borderTop, oy + height - borderBottom];
    const dw = [borderLeft, width - borderLeft - borderRight, borderRight];
    const dh = [borderTop, height - borderTop - borderBottom, borderBottom];
    let count = 0;
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            if (sw[column] <= 0 || sh[row] <= 0 || dw[column] <= 0 || dh[row] <= 0) {
                continue;
            }
            draw(sx[column], sy[row], sw[column], sh[row], dx[column], dy[row], dw[column], dh[row]);
            count++;
        }
    }
    return count;
}
