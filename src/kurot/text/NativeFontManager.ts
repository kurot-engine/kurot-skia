import { Base64Util } from '@kurot/core/dist/kurot/utils/Base64Util.js';
import { Skia } from 'react-native-skia';
import type { SkTypeface, SkTypefaceFontProvider } from 'react-native-skia';

import { getNativeAsset } from '../resources/native-assets.js';

const buffers = new Map<string, ArrayBuffer>();
interface FontRecord {
	name: string;
	face: SkTypeface;
	source: string | ArrayBuffer;
}
const typefaces = new Map<string, FontRecord>();
let provider: SkTypefaceFontProvider | undefined;
let revision = 0;

export function cacheFontResource(url: string, buffer: ArrayBuffer): void {
	const previous = buffers.get(url);
	const bytes = new Uint8Array(buffer);
	if (
		previous &&
		previous.byteLength === buffer.byteLength &&
		new Uint8Array(previous).every((value, index) => value === bytes[index])
	)
		return;
	buffers.set(url, buffer.slice(0));
}

/**
 * Register before creating text, or call invalidateTextMetrics on existing
 * fields/labels after registration. System fallback remains in Skia's collection.
 */
export function registerFontMapping(name: string, path: string): void {
	const asset = getNativeAsset(path);
	const cached = buffers.get(path);
	const source = cached ?? (asset?.kind === 'binary' ? asset.base64 : undefined);
	const key = name + '\n' + path;
	const previous = typefaces.get(key);
	if (previous?.source === source && source !== undefined) return;
	const buffer = cached ?? (asset?.kind === 'binary' ? Base64Util.decode(asset.base64) : undefined);
	if (!buffer) throw new Error(`Native font data is not bundled or cached: ${path}`);
	const data = Skia.Data.fromBytes(new Uint8Array(buffer));
	try {
		const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
		if (!face) throw new Error(`Native font could not be decoded: ${path}`);
		const next = Skia.TypefaceFontProvider.Make();
		try {
			for (const [id, record] of typefaces) {
				if (id !== key) next.registerFont(record.face, record.name);
			}
			next.registerFont(face, name);
		} catch (error) {
			next.dispose();
			face.dispose();
			throw error;
		}
		provider?.dispose();
		provider = next;
		previous?.face.dispose();
		typefaces.set(key, { name, face, source: source! });
		revision++;
	} finally {
		data.dispose();
	}
}

export function nativeFontProvider(): SkTypefaceFontProvider | undefined {
	return provider;
}

export function nativeFontRevision(): number {
	return revision;
}

export function clearNativeFonts(): void {
	provider?.dispose();
	provider = undefined;
	for (const record of typefaces.values()) record.face.dispose();
	typefaces.clear();
	buffers.clear();
	revision++;
}
