import { BitmapData as CoreBitmapData } from '@kurot/core/dist/kurot/display/texture/BitmapData.js';
import type { BitmapData, Texture } from '@kurot/core';
import { Texture as CoreTexture } from '@kurot/core/dist/kurot/display/texture/Texture.js';
import type { SkImage } from 'react-native-skia';

const images = new WeakMap<BitmapData, SkImage>();

class NativeBitmapData extends CoreBitmapData {
	public constructor(
		image: SkImage,
		private readonly ownsImage: boolean,
	) {
		// Spine's renderer-neutral Texture reads only source.width/source.height.
		// The image itself remains in the native map; no DOM object is created.
		super({ width: image.width(), height: image.height() } as HTMLImageElement);
		this.width = image.width();
		this.height = image.height();
		this.deleteSource = false;
		images.set(this, image);
	}

	public override dispose(): void {
		const image = images.get(this);
		images.delete(this);
		super.dispose();
		if (this.ownsImage) {
			image?.dispose();
		}
	}
}

/**
 * Resource loaders transfer ownership; SpriteSheet frames share this one source.
 */
export function createSkiaBitmapData(image: SkImage, ownsImage = true): BitmapData {
	return new NativeBitmapData(image, ownsImage);
}

/**
 * The caller owns the SkImage. BitmapData carries geometry without a DOM source.
 */
export function createSkiaTexture(image: SkImage, resolution = 1): Texture {
	const data = createSkiaBitmapData(image, false);
	const texture = new CoreTexture(resolution);
	texture.setBitmapData(data);
	return texture;
}

export function getSkiaImage(data: BitmapData): SkImage | undefined {
	return images.get(data);
}
