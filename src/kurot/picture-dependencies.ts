import { BitmapText, DisplayObjectContainer, Texture } from '@kurot/core';
import type { BitmapData, DisplayObject, Matrix } from '@kurot/core';
import type { SkImage } from 'react-native-skia';

import { getSkiaImage } from './textures.js';

interface ImageDependency {
	data: BitmapData;
	version: number;
	image?: SkImage;
}

interface OrderDependency {
	object: DisplayObjectContainer;
	sortable: boolean;
}

function matrixChanged(current: Matrix, previous: Matrix): boolean {
	return current.a !== previous.a || current.b !== previous.b || current.c !== previous.c ||
		current.d !== previous.d || current.tx !== previous.tx || current.ty !== previous.ty;
}

/**
 * Recorded commands retain source resources. Check their identities/versions
 * even for off-stage objects, which Core's BitmapData user registry omits.
 */
export class PictureDependencies {
	private readonly images: ImageDependency[] = [];
	private readonly orders: OrderDependency[] = [];
	private readonly externalMasks: { object: DisplayObject; matrix: Matrix }[] = [];
	private readonly externalMaskMatrix?: Matrix;

	public constructor(private readonly root: DisplayObject) {
		const seen = new Set<DisplayObject>();
		const sources = new Set<BitmapData>();
		const pending = [root];
		let externalMask = false;
		while (pending.length) {
			const object = pending.pop();
			if (!object || seen.has(object)) continue;
			seen.add(object);
			if (object instanceof DisplayObjectContainer) {
				this.orders.push({ object, sortable: object.sortableChildren });
			}
			if ('texture' in object && object.texture instanceof Texture) {
				const data = object.texture.bitmapData;
				if (data) {
					sources.add(data);
				}
			} else if (object instanceof BitmapText) {
				for (const glyph of object.getGlyphs()) {
					const data = object.font?.getTexture(glyph.character)?.bitmapData;
					if (data) {
						sources.add(data);
					}
				}
			}
			if (object.$mask) {
				let owner: DisplayObject | undefined = object.$mask;
				while (owner && owner !== root) {
					owner = owner.parent;
				}
				if (owner !== root) {
					externalMask = true;
					this.externalMasks.push({ object: object.$mask, matrix: object.$mask.$getConcatenatedMatrix().clone() });
				}
				pending.push(object.$mask);
			}
			pending.push(...object.$children ?? []);
		}
		for (const data of sources) {
			this.images.push({ data, version: data.contentVersion, image: getSkiaImage(data) });
		}
		if (externalMask) {
			this.externalMaskMatrix = root.$getConcatenatedMatrix().clone();
		}
	}

	public get changed(): boolean {
		const current = this.externalMaskMatrix ? this.root.$getConcatenatedMatrix() : undefined;
		const previous = this.externalMaskMatrix;
		const maskMoved = current && previous && matrixChanged(current, previous);
		return !!maskMoved || this.externalMasks.some(({ object, matrix }) =>
			matrixChanged(object.$getConcatenatedMatrix(), matrix)) ||
			this.orders.some(({ object, sortable }) => object.sortableChildren !== sortable ||
			(object.sortableChildren && object.$sortDirty)) ||
			this.images.some(({ data, version, image }) =>
				data.contentVersion !== version || getSkiaImage(data) !== image);
	}
}
