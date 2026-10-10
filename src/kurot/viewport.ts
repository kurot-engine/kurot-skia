export interface Viewport {
    scale: number;
    x: number;
    y: number;
}

/**
 * Skia view dimensions are points; its native surface owns physical pixel density.
 */
export function createViewport(viewWidth: number, viewHeight: number, width: number, height: number): Viewport {
    const scale = Math.min(viewWidth / width, viewHeight / height);
    return { scale, x: (viewWidth - width * scale) / 2, y: (viewHeight - height * scale) / 2 };
}
