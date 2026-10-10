/**
 * Core's scene objects import their browser cache factory. Native must reject
 * that capability before it allocates a DOM canvas; native caching is future work.
 */
export class DisplayList {
    public static create(): never {
        throw new Error('Skia prototype: cacheAsTexture/cacheAsBitmap needs a native cache implementation.');
    }

    public static release(): never {
        throw new Error('A browser DisplayList cannot be released by the Skia player.');
    }
}
