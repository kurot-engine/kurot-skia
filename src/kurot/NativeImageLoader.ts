import { loadImage } from 'react-native-skia';

import { Event } from '@kurot/core/dist/kurot/events/Event.js';
import { EventDispatcher as Dispatcher } from '@kurot/core/dist/kurot/events/EventDispatcher.js';
import type { EventDispatcher as CoreEventDispatcher } from '@kurot/core';
import { IOErrorEvent } from '@kurot/core/dist/kurot/events/IOErrorEvent.js';
import type { BitmapData } from '@kurot/core';
import type { ImageLoaderEvents } from '@kurot/core';

import { getNativeAsset, isNativeURI } from './native-assets.js';
import { createSkiaBitmapData } from './textures.js';

const EventDispatcher: typeof CoreEventDispatcher = Dispatcher;

/**
 * Core ImageLoader contract backed by Skia's native asynchronous decoder.
 */
export class ImageLoader extends EventDispatcher<ImageLoaderEvents> {
    public static crossOrigin?: string;

    public data?: BitmapData;
    public crossOrigin?: string = ImageLoader.crossOrigin;
    private generation = 0;

    public load(url: string): void {
        this.close();
        void this.decode(url, this.generation);
    }

    public close(): void {
        this.generation++;
    }

    private async decode(url: string, generation: number): Promise<void> {
        let bitmapData: BitmapData;
        try {
            const asset = getNativeAsset(url);
            if (asset && asset.kind !== 'image') {
                throw new Error(`Expected an image asset: ${url}`);
            }
            if (!asset && !isNativeURI(url)) {
                throw new Error(`Image is absent from the Metro asset map: ${url}`);
            }
            const image = await loadImage(asset?.source ?? url);
            if (!image) {
                throw new Error(`Unable to decode image: ${url}`);
            }
            if (generation !== this.generation) {
                image.dispose();
                return;
            }
            bitmapData = createSkiaBitmapData(image);
        } catch {
            if (generation === this.generation) {
                IOErrorEvent.dispatchIOErrorEvent(this);
            }
            return;
        }
        this.data = bitmapData;
        this.dispatchEventWith(Event.COMPLETE);
    }
}
