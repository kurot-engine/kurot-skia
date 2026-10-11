import type { Stage } from '@kurot/core';
import { ClipOp, Skia } from 'react-native-skia';
import type { SkGraphiteContext } from 'react-native-skia';

import { recordNativeFrame } from './native-frame.js';
import type { NativeFrameResult } from './native-frame.js';
import { SkiaRenderer } from './SkiaRenderer.js';
import { createViewport } from './viewport.js';
import type { Viewport } from './viewport.js';

/**
 * Owns one view's Graphite context and renderer; canvases never escape a frame.
 */
export class NativeFrameRenderer {
	private readonly viewport: Viewport;
	private readonly renderer: SkiaRenderer;

	public constructor(
		private readonly context: SkGraphiteContext,
		private readonly width: number,
		private readonly height: number,
	) {
		this.viewport = createViewport(context.width, context.height, width, height);
		this.renderer = new SkiaRenderer(this.viewport.scale);
	}

	public draw(stage: Stage): NativeFrameResult {
		return recordNativeFrame(this.context, canvas => {
			canvas.clear(Skia.Color('#10192b'));
			canvas.translate(this.viewport.x, this.viewport.y);
			canvas.scale(this.viewport.scale, this.viewport.scale);
			canvas.clipRect({ x: 0, y: 0, width: this.width, height: this.height }, ClipOp.Intersect, true);
			return this.renderer.render(stage, canvas);
		});
	}

	public dispose(): void {
		this.renderer.dispose();
		this.context.dispose();
	}
}
