import { Event, EventDispatcher, IOErrorEvent } from '@kurot/core';
import type { Component, IThemeAdapter } from '@kurot/ui';

interface ThemeConfig {
    skins?: Record<string, string>;
    styles?: Record<string, unknown>;
    skinsJs?: string;
}

const modules = new Map<string, () => void | Promise<void>>();
let currentTheme: Theme | undefined;

/**
 * Registers a statically bundled module under the generated theme's skinsJs key.
 * Metro cannot import a module URL supplied at runtime.
 */
export function registerNativeSkinModule(path: string, load: () => void | Promise<void>): () => void {
    const previous = modules.get(path);
    modules.set(path, load);
    return (): void => {
        if (previous) {
            modules.set(path, previous);
        } else {
            modules.delete(path);
        }
    };
}

/**
 * Native port of UI 3.5.0's Theme registry and deferred skin assignment.
 * Configuration is supplied by IThemeAdapter; skin modules are Metro imports.
 */
export class Theme extends EventDispatcher {
    private initialized: boolean;
    private readonly skins: Record<string, string> = {};
    private styles: Record<string, unknown> = {};
    private readonly pending = new Set<Component>();

    public constructor(configURL: string, adapter?: IThemeAdapter) {
        super();
        this.initialized = !configURL;
        setTheme(this);
        if (configURL) {
            if (!adapter) {
                throw new Error('Native Theme requires an IThemeAdapter for its configuration.');
            }
            adapter.getTheme(configURL, (data) => {
                void this.load(data).catch((error: unknown) => this.fail(error));
            }, (error) => this.fail(error));
        }
    }

    public mapSkin(hostComponentKey: string, skinName: string): void {
        if (hostComponentKey && skinName) {
            this.skins[hostComponentKey] = skinName;
        }
    }

    public getSkinName(client: Component): string {
        if (!this.initialized) {
            this.pending.add(client);
            return '';
        }
        return this.skins[client.hostComponentKey] ?? this.findSkinName(client);
    }

    public getStyleConfig(style: string): unknown {
        return this.styles[style];
    }

    private async load(raw: unknown): Promise<void> {
        const config = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ThemeConfig;
        for (const [key, value] of Object.entries(config.skins ?? {})) {
            if (!this.skins[key]) {
                this.mapSkin(key, value);
            }
        }
        this.styles = config.styles ?? {};
        if (config.skinsJs) {
            const loader = modules.get(config.skinsJs);
            if (!loader) {
                throw new Error(`Theme skin module is not registered with Metro: ${config.skinsJs}`);
            }
            await loader();
        }
        this.initialized = true;
        this.flush();
        this.dispatchEventWith(Event.COMPLETE);
    }

    private fail(error: unknown): void {
        console.error('[Native Theme] Failed to load:', error);
        if (!this.initialized) {
            this.initialized = true;
            this.flush();
            IOErrorEvent.dispatchIOErrorEvent(this);
        }
    }

    private flush(): void {
        for (const client of this.pending) {
            if (!client.skinNameExplicitlySet) {
                const name = this.getSkinName(client);
                if (name) {
                    client._applySkinName(name);
                }
            }
        }
        this.pending.clear();
    }

    private findSkinName(value: object): string {
        let proto: object | undefined = value;
        while (proto && proto !== Object.prototype) {
            const name = proto.constructor.name;
            if (!name || name === 'Component') {
                return '';
            }
            if (this.skins[name]) {
                return this.skins[name];
            }
            proto = Object.getPrototypeOf(proto) ?? undefined;
        }
        return '';
    }
}

export function setTheme(theme: Theme): void {
    currentTheme = theme;
}

export function getTheme(): Theme | undefined {
    return currentTheme;
}
