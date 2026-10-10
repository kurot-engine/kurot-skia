import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { CustomResolver, Resolution } from 'metro-resolver';

function hostPackage(root: string, name: string, version: string): string {
    const directory = realpathSync(path.join(root, 'node_modules', name));
    const info = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as { version: string };
    if (info.version !== version) {
        throw new Error(`@kurot/skia currently requires ${name} ${version}; found ${info.version}. Revalidate the native module mappings before upgrading.`);
    }
    return directory;
}

/**
 * Routes native rendering through the application's Core installation.
 * Unhandled requests compose with the application's resolver; web is unchanged.
 */
export function createKurotResolver(projectRoot: string, previous?: CustomResolver): CustomResolver {
    const root = path.resolve(projectRoot);
    const core = hostPackage(root, '@kurot/core', '2.5.3');
    const ui = existsSync(path.join(root, 'node_modules/@kurot/ui'))
        ? hostPackage(root, '@kurot/ui', '3.5.0') : undefined;
    const hostRequire = createRequire(path.join(root, 'package.json'));
    const native = path.dirname(hostRequire.resolve('@kurot/skia'));
    const ports = new Map([
        ['net/HttpRequest.js', 'NativeHttpRequest.js'],
        ['net/ImageLoader.js', 'NativeImageLoader.js'],
        ['text/TextMeasurer.js', 'NativeTextMeasurer.js'],
        ['text/TextSegmentation.js', 'NativeTextSegmentation.js'],
        ['text/InputController.js', 'NativeInputController.js'],
    ].map(([source, target]) => [path.join(core, 'dist/kurot', source), path.join(native, target)]));
    const browserCache = path.join(core, 'dist/kurot/player/canvas/DisplayList.js');
    const browserTheme = ui === undefined ? undefined : path.join(ui, 'dist/kurot/core/Theme.js');
    const source = (filePath: string): Resolution => ({ type: 'sourceFile', filePath });
    return (context, moduleName, platform): Resolution => {
        if (platform === 'android' || platform === 'ios') {
            if (moduleName === '@kurot/core') {
                return source(path.join(native, 'core-native.js'));
            }
            // Core only exports its browser barrel. These internal imports are
            // confined to the version-bound adapter and resolved from the host.
            if (context.originModulePath.startsWith(native + path.sep) && moduleName.startsWith('@kurot/core/dist/')) {
                const relative = moduleName.slice('@kurot/core/'.length);
                const file = path.resolve(core, relative);
                if (!file.startsWith(path.join(core, 'dist') + path.sep) || !existsSync(file)) {
                    throw new Error(`Invalid native Core module: ${moduleName}`);
                }
                return source(file);
            }
            const file = path.resolve(path.dirname(context.originModulePath), moduleName);
            if (file === browserCache) {
                return source(path.join(native, 'NativeDisplayList.js'));
            }
            if (file === browserTheme) {
                return source(path.join(native, 'NativeTheme.js'));
            }
            if (context.originModulePath.startsWith(core + path.sep)) {
                const port = ports.get(file);
                if (port) {
                    return source(port);
                }
            }
        }
        return (previous ?? context.resolveRequest)(context, moduleName, platform);
    };
}
