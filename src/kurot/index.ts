// ── View and frame lifecycle ──

export { KurotView } from './view/KurotView.js';
export type { KurotViewProps, NativeScene, FrameStats } from './view/KurotView.js';
export { createViewport } from './view/viewport.js';
export type { Viewport } from './view/viewport.js';
export type { FrameTiming, FrameProfile, TimingDistribution } from './view/frame-stats.js';

// ── Rendering ──

export { SkiaRenderer } from './rendering/SkiaRenderer.js';

// ── Caching ──

export { NativePictureCache } from './cache/NativePictureCache.js';
export type { NativePictureCacheLimits, NativePictureCacheStats } from './cache/NativePictureCacheRenderer.js';

// ── Text and fonts ──

export { measureText, measureTextMetrics } from './text/NativeTextMeasurer.js';
export type { NativeTextMetrics } from './text/NativeTextMeasurer.js';
export { createParagraph, nativeFontStyle } from './text/paragraph.js';
export { clearNativeFonts } from './text/NativeFontManager.js';

// ── Input ──

export { NativeTouch } from './input/NativeTouch.js';
export { NativeInputOverlay } from './input/NativeInputOverlay.js';
export type { NativeInputOverlayProps } from './input/NativeInputOverlay.js';
export { activeNativeInput, blurNativeInput, updateNativeInput } from './input/NativeInputController.js';

// ── Resources ──

export { createSkiaTexture, createSkiaBitmapData, getSkiaImage } from './resources/textures.js';
export { registerNativeAssets, getNativeAsset } from './resources/native-assets.js';
export type { NativeAsset } from './resources/native-assets.js';
export { registerNativeSkinModule } from './resources/NativeTheme.js';
export { ImageLoader as NativeImageLoader } from './resources/NativeImageLoader.js';
export { HttpRequest as NativeHttpRequest } from './resources/NativeHttpRequest.js';
export { registerNativeAudioBackend } from './resources/NativeSound.js';
export type { NativeAudioBackend, NativeAudioAsset, NativeAudioPlayback } from './resources/NativeSound.js';

// ── Spine ──

export { NativeSpineAnimationCache } from './spine/NativeSpineAnimationCache.js';
export type { NativeSpineAnimationCacheOptions, NativeSpineCacheSource } from './spine/NativeSpineAnimationCache.js';
export { NativeSpineCachedAnimation } from './spine/NativeSpineCachedAnimation.js';
