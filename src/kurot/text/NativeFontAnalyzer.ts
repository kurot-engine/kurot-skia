import { parseBitmapFont } from '@kurot/bitmap-font';
import { BitmapFont } from '@kurot/core/dist/kurot/text/BitmapFont.js';
import type { Texture } from '@kurot/core';
import { ResourceItem, ResourceType } from '@kurot/core/dist/kurot/resource/ResourceItem.js';
import { AnalyzerBase } from '@kurot/core/dist/kurot/resource/analyzers/AnalyzerBase.js';
import { TextAnalyzer } from '@kurot/core/dist/kurot/resource/analyzers/TextAnalyzer.js';
import { ImageAnalyzer } from '@kurot/core/dist/kurot/resource/analyzers/ImageAnalyzer.js';

/**
 * Preserve Core's separate page ownership while avoiding document.baseURI.
 * Local logical URLs retain the generator's authored sheet-relative spelling.
 */
export class FontAnalyzer extends AnalyzerBase {
	private readonly text = new TextAnalyzer();
	private readonly images = new ImageAnalyzer();
	private readonly pending = new Map<string, Promise<boolean>>();

	public override async loadFile(item: ResourceItem): Promise<ResourceItem> {
		if (this.hasRes(item.name)) {
			item.loaded = true;
			return item;
		}
		let pending = this.pending.get(item.name);
		if (!pending) {
			pending = this.load(item);
			this.pending.set(item.name, pending);
		}
		try {
			item.loaded = await pending;
		} finally {
			this.pending.delete(item.name);
		}
		return item;
	}
	public override destroyRes(name: string): boolean {
		const removed = super.destroyRes(name);
		if (removed) {
			this.text.destroyRes(name);
			this.images.destroyRes(name);
		}
		return removed;
	}
	protected override onResourceDestroy(value: unknown): void {
		if (value instanceof BitmapFont) value.dispose();
	}
	private async load(item: ResourceItem): Promise<boolean> {
		try {
			const descriptor = new ResourceItem(item.name, item.url, ResourceType.Text);
			await this.text.loadFile(descriptor);
			if (!descriptor.loaded) return false;
			const data = parseBitmapFont(this.text.getRes(item.name));
			if (!data.file) throw new TypeError('A bitmap font must reference its image page.');
			const file = data.file;
			const url = /^(?:https?:)?\/\//i.test(file)
				? file
				: /^(?:https?:)?\/\//i.test(item.url)
					? new URL(file, item.url).href
					: item.url.slice(0, item.url.lastIndexOf('/') + 1) + file;
			const image = new ResourceItem(item.name, url, ResourceType.Image);
			await this.images.loadFile(image);
			const texture = this.images.getRes<Texture>(item.name);
			if (!image.loaded || !texture) throw new Error('Unable to load bitmap font page.');
			this.fileDic.set(item.name, new BitmapFont(texture, data, { ownsTexture: false }));
			return true;
		} catch {
			this.text.destroyRes(item.name);
			this.images.destroyRes(item.name);
			return false;
		}
	}
}
