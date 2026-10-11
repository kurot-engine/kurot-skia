import { Event, Resource, Stage, TextField } from '@kurot/core';
import type { NativeScene } from '@kurot/skia';
import { installNativeUI } from '../src/ui/native-ui';
import { makeGallery } from './ui-gallery.test';
export function createGalleryScene(stage: Stage): NativeScene {
    const resources = new Resource(); let disposed = false; let restore: (() => void) | undefined;
    void resources.loadConfig('resource/resource.json', 'resource/').then(() => resources.loadGroup('preload')).then(async () => {
        if (disposed) return;
        restore = installNativeUI(resources); await Promise.resolve();
        if (!disposed) stage.addChild(makeGallery());
    }).catch((error: unknown) => { if (!disposed) console.error(String(error)); });
    const changed = (event: Event): void => {
        if (event.target instanceof TextField) console.info('KUROT_NATIVE_EDIT ' + event.target.text);
    };
    stage.addEventListener(Event.CHANGE, changed);
    return { update: (): void => {}, dispose: (): void => {
        disposed = true; stage.removeEventListener(Event.CHANGE, changed); restore?.(); resources.destroyAll();
    } };
}
