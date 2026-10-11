import type { Resource, Texture } from '@kurot/core';
import { getAssetAdapter, getTheme, setAssetAdapter, setTheme, Theme } from '@kurot/ui';
import type { IAssetAdapter } from '@kurot/ui';

import { registerSkinFactories, theme as config, themeConfigURL } from '../generated/kurot/skins';
import { registerNativeSkinModule } from '@kurot/skia';

/**
 * Shares the scene's Core resource cache with Image components in KUI skins.
 */
export class NativeUIAssetAdapter implements IAssetAdapter {
    public constructor(private readonly resources: Resource) {}

    public getAsset(source: string, callback: (content: Texture | undefined, source: string) => void): void {
        const cached = this.resources.get<Texture>(source);
        if (cached) {
            callback(cached, source);
        } else {
            void this.resources.load<Texture>(source).then(
                (texture) => callback(texture, source),
                () => callback(undefined, source),
            );
        }
    }
}

/**
 * Metro bundles skin factories statically. Theme consumes the generated mapping
 * after registration, using the native module loader for its skinsJs entry.
 */
export function installNativeUI(resources: Resource): () => void {
    const previousAdapter = getAssetAdapter();
    const previousTheme = getTheme();
    let restoreFactories = (): void => {};
    const restoreModule = registerNativeSkinModule(config.skinsJs, () => {
        restoreFactories = registerSkinFactories();
    });
    setAssetAdapter(new NativeUIAssetAdapter(resources));
    const theme = new Theme(themeConfigURL, {
        getTheme: (_url, onSuccess): void => onSuccess(config),
    });
    return (): void => {
        if (getTheme() === theme) {
            setTheme(previousTheme ?? new Theme(''));
            setAssetAdapter(previousAdapter);
        }
        restoreFactories();
        restoreModule();
    };
}
