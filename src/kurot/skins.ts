import { parseUIStyleSheet } from '@kurot/ui-document';
import type { UIStyleSheet } from '@kurot/ui-document';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { compileSkin } from './compiler.js';
import { modulePath, posix, scanFiles } from './paths.js';
import { generatedHeader } from './types.js';
import type { ProjectResources } from './resources.js';

interface SkinModule {
    readonly className: string;
    readonly factoryName: string;
    readonly file: string;
}

export interface ProjectSkins {
    readonly files: Map<string, string>;
    readonly classNames: readonly string[];
    readonly theme: { readonly skins: Record<string, string>; readonly skinsJs: string };
}

const defaultHosts = new Set([
    'Button', 'CheckBox', 'ComboBox', 'HScrollBar', 'HSlider', 'ItemRenderer', 'Panel',
    'ProgressBar', 'RadioButton', 'Scroller', 'TextInput', 'ToggleButton', 'ToggleSwitch', 'VScrollBar', 'VSlider',
]);

export async function collectSkins(directory: string, output: string, resources: ProjectResources,
    styleFile: string, explicit: Readonly<Record<string, string>>, mode: 'metro' | 'url',
    optionalStyle: boolean): Promise<ProjectSkins> {
    let style: UIStyleSheet | undefined;
    try {
        const text = await readFile(styleFile, 'utf8');
        style = parseUIStyleSheet(JSON.parse(text));
    } catch (error) {
        if (!optionalStyle || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw new Error(`${styleFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const files = new Map<string, string>();
    const modules: SkinModule[] = [];
    const names = new Set<string>();
    const themeSkins: Record<string, string> = {};
    for (const source of (await scanFiles(directory)).filter(file => file.endsWith('.kui.xml'))) {
        let compiled;
        try {
            compiled = compileSkin(await readFile(source, 'utf8'), resources.entries, style);
        } catch (error) {
            throw new Error(`${source}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (names.has(compiled.className)) {
            throw new Error(`Duplicate skin class: ${compiled.className} (${source})`);
        }
        names.add(compiled.className);
        const relative = posix(path.relative(directory, source)).slice(0, -'.kui.xml'.length);
        const file = `skins/${relative}.ts`;
        files.set(file, generatedHeader + compiled.source);
        modules.push({ className: compiled.className, factoryName: compiled.factoryName, file });
        const shortName = compiled.className.split('.').at(-1) ?? '';
        const host = shortName.endsWith('Skin') ? shortName.slice(0, -4) : '';
        if (defaultHosts.has(host) && !Object.hasOwn(explicit, host)) {
            if (Object.hasOwn(themeSkins, host)) {
                throw new Error(`Ambiguous default ${host} skin. Choose one with themeSkins.`);
            }
            themeSkins[host] = compiled.className;
        }
    }
    for (const [host, skin] of Object.entries(explicit)) {
        if (!host || !names.has(skin)) {
            throw new Error(`Invalid theme mapping: ${host} → ${skin}`);
        }
        Object.defineProperty(themeSkins, host, { value: skin, enumerable: true, configurable: true, writable: true });
    }
    const theme = { skins: themeSkins, skinsJs: './skins.js' };
    files.set('skins.ts', emitRegistry(modules, output, theme, mode));
    files.set('theme.json', JSON.stringify(theme, undefined, 2) + '\n');
    return { files, classNames: [...names], theme };
}

function emitRegistry(modules: readonly SkinModule[], output: string, theme: ProjectSkins['theme'], mode: 'metro' | 'url'): string {
    const lines = [generatedHeader, 'import type { Skin } from "@kurot/ui";'];
    modules.forEach((skin, index) => {
        const specifier = modulePath(path.join(output, 'skins.ts'), path.join(output, skin.file))
            .replace(/\.ts$/, mode === 'metro' ? '' : '.js');
        lines.push(`import { ${skin.factoryName} as skin${index} } from ${JSON.stringify(specifier)};`);
    });
    lines.push('', 'export type SkinFactory = () => Skin;', '', 'export const skinFactories = {');
    modules.forEach((skin, index) => lines.push(`    [${JSON.stringify(skin.className)}]: skin${index},`));
    lines.push('} as const satisfies Readonly<Record<string, SkinFactory>>;', '',
        `export const theme = ${JSON.stringify(theme)};`, '',
        '/**', ' * Registers all compiled factories and returns a restoration callback.', ' */',
        'export function registerSkinFactories(',
        '    registry: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,',
        '): () => void {',
        '    const previous = new Map<string, PropertyDescriptor | undefined>();',
        '    const factories: Readonly<Record<string, SkinFactory>> = skinFactories;',
        '    for (const [name, factory] of Object.entries(factories)) {',
        '        previous.set(name, Object.getOwnPropertyDescriptor(registry, name));',
        '        Object.defineProperty(registry, name, { value: factory, configurable: true, writable: true, enumerable: true });',
        '    }',
        '    return (): void => {',
        '        for (const [name, descriptor] of previous) {',
        '            if (registry[name] !== factories[name]) { continue; }',
        '            if (descriptor) { Object.defineProperty(registry, name, descriptor); }',
        '            else { delete registry[name]; }',
        '        }',
        '    };',
        '}', '');
    return lines.join('\n');
}
