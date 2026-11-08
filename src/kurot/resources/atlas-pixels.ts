import { ColorType } from 'react-native-skia';
import type { SkImage } from 'react-native-skia';

const pixels = new WeakMap<SkImage, Uint8Array>();
const cropOpacity = new WeakMap<SkImage, boolean>();
const loading = new WeakMap<SkImage, Promise<void>>();

/**
 * Retain source-alpha RGBA bytes for synchronous atlas drawing. GPU snapshots
 * otherwise need an asynchronous read for each crop, and copying through a
 * premultiplied render target loses color precision on translucent texels.
 */
export function prepareNativeAtlas(image: SkImage): Promise<void> {
	if (pixels.has(image)) {
		return Promise.resolve();
	}
	const pending = loading.get(image);
	if (pending) {
		return pending;
	}
	const task = image.readPixels(0, 0, {
		width: image.width(), height: image.height(),
		colorType: ColorType.RGBA_8888, alphaType: image.getImageInfo().alphaType,
	}).then(bytes => {
		if (!(bytes instanceof Uint8Array)) {
			throw new Error('Skia could not read the atlas pixels.');
		}
		pixels.set(image, bytes);
	}).finally(() => loading.delete(image));
	loading.set(image, task);
	return task;
}

export function hasPreparedPixels(image: SkImage): boolean {
	return pixels.has(image);
}

export function cropAtlasPixels(image: SkImage, x: number, y: number, width: number, height: number, rotated: boolean): Uint8Array {
	const source = pixels.get(image);
	if (!source) {
		throw new Error('Await prepareNativeAtlas(image) before drawing a manually created atlas.');
	}
	const stride = image.width();
	const bytes = new Uint8Array(width * height * 4);
	for (let row = 0; row < height; row++) {
		if (!rotated) {
			const offset = ((y + row) * stride + x) * 4;
			bytes.set(source.subarray(offset, offset + width * 4), row * width * 4);
		} else {
			for (let col = 0; col < width; col++) {
				const offset = ((y + col) * stride + x + height - 1 - row) * 4;
				bytes.set(source.subarray(offset, offset + 4), (row * width + col) * 4);
			}
		}
	}
	return bytes;
}

export function rememberCropOpacity(image: SkImage, bytes: Uint8Array): void {
	if (bytes.length <= 256 * 256 * 4) {
		cropOpacity.set(image, allOpaque(bytes));
	}
}

export function preparedOpacity(image: SkImage): boolean | undefined {
	const bytes = pixels.get(image);
	return cropOpacity.get(image) ?? (bytes ? allOpaque(bytes) : undefined);
}

function allOpaque(bytes: Uint8Array): boolean {
	for (let alpha = 3; alpha < bytes.length; alpha += 4) {
		if (bytes[alpha] !== 255) {
			return false;
		}
	}
	return true;
}
