export type NativeAsset =
    | { readonly kind: 'json'; readonly value: unknown }
    | { readonly kind: 'text'; readonly value: string }
    | { readonly kind: 'image'; readonly source: number };

const assets = new Map<string, NativeAsset>();

/**
 * Metro requires literal require paths. URLs remain the manifest's logical paths.
 */
export function registerNativeAssets(entries: Readonly<Record<string, NativeAsset>>): void {
    for (const [url, asset] of Object.entries(entries)) {
        assets.set(url, asset);
    }
}

export function getNativeAsset(url: string): NativeAsset | undefined {
    return assets.get(url);
}

export function isNativeURI(url: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(url);
}
