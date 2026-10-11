import { AnalyzerBase } from '@kurot/core/dist/kurot/resource/analyzers/AnalyzerBase.js';
import { Event } from '@kurot/core/dist/kurot/events/Event.js';
import { IOErrorEvent } from '@kurot/core/dist/kurot/events/IOErrorEvent.js';
import type { ResourceItem } from '@kurot/core';

import { Sound } from './NativeSound.js';

export class SoundAnalyzer extends AnalyzerBase {
	public override loadFile(item: ResourceItem): Promise<ResourceItem> {
		if (this.fileDic.has(item.name)) {
			item.loaded = true;
			return Promise.resolve(item);
		}
		return new Promise(resolve => {
			const sound = new Sound();
			const done = (success: boolean): void => {
				sound.removeEventListener(Event.COMPLETE, complete);
				sound.removeEventListener(IOErrorEvent.IO_ERROR, fail);
				item.loaded = success;
				if (success) this.fileDic.set(item.name, sound);
				else sound.close();
				resolve(item);
			};
			const complete = (): void => done(true);
			const fail = (): void => done(false);
			sound.addEventListener(Event.COMPLETE, complete);
			sound.addEventListener(IOErrorEvent.IO_ERROR, fail);
			sound.load(item.url);
		});
	}

	protected override onResourceDestroy(value: unknown): void {
		if (value instanceof Sound) value.close();
	}
}
