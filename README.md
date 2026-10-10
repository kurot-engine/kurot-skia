# Kurot Skia

`@kurot/skia` **0.1.0** — build-time resource and KUI skin entry generation for Kurot applications.

[简体中文](docs/README.zh-CN.md) · [Changelog](CHANGELOG.md)

Turn an existing `resource.json`, local assets and KUI XML skins into a static TypeScript entry that your bundler can resolve. The generator maintains the asset map, skin imports, factory registration and theme mapping for you, and updates them as you edit the project.

Version 0.1.0 provides a Node CLI and a build-script API. Native rendering, input and runtime resource/theme adapters currently live in the sibling `Kurot-Skia-Demo` project. This package is private and has not been published to npm; use a local development dependency.

## Install

The generator requires Node.js >=20 and pnpm. Your application has its own platform requirements; the Demo's Expo SDK 57 requires Node.js >=22.13 ([Expo SDK reference](https://docs.expo.dev/versions/v57.0.0/)).

Build the library checkout first:

```sh
# In Kurot-Skia
pnpm install
pnpm build
```

Then install it in an existing Kurot project located next to the library:

```sh
# In your application
pnpm add --save-dev '@kurot/skia@file:../Kurot-Skia'
```

For an Expo application, use [Expo's installer](https://docs.expo.dev/more/expo-cli/#install-dependencies) for that step:

```sh
pnpm exec expo install '@kurot/skia@file:../Kurot-Skia' --dev --pnpm
```

The existing Demo already declares this dependency. From `Kurot-Skia-Demo`, run `pnpm install` after building the library, then `pnpm start --dev-client` or `pnpm android`.

Run `pnpm build` in the library after editing its source. Run `pnpm install` in the application after adding compiled files or changing package metadata. Application scripts consume the installed package's command, without referring to a neighboring `dist` directory.

## Generate your project entry

A typical input tree is:

```text
resource/
├── resource.json
├── assets/
│   ├── logo.png
│   └── ui/
│       ├── ui.json
│       └── ui.png
├── config/
│   └── style.json             # optional project styles
└── ui/
    └── ButtonSkin.kui.xml
```

Keep your existing resource format. For example, a standalone image entry is:

```json
{
  "resources": [
    { "name": "logo", "type": "image", "url": "assets/logo.png" }
  ],
  "groups": [
    { "name": "preload", "keys": "logo" }
  ]
}
```

URLs are relative to the manifest directory. A sheet or bitmap-font descriptor resolves its image relative to its own file. Add resources to the manifest as usual; the generator follows those declarations and scans every `.kui.xml` under the skin directory.

Generate once from the application directory:

```sh
pnpm exec kurot-project --project .
```

Defaults are `resource/resource.json`, skins under `resource/`, optional styles at `resource/config/style.json`, and output under `src/generated/kurot/`. The resource and style defaults follow the manifest directory if you select a different manifest.

For a Kurot CLI game using `default.res.json`:

```sh
pnpm exec kurot-project --project . \
  --manifest resource/default.res.json \
  --skins resource/ui \
  --output src/generated/kurot
```

## Develop with watch

Watch without launching another program:

```sh
pnpm exec kurot-project --project . --watch
```

Or run the generator and your development server together:

```sh
pnpm exec kurot-project --project . --watch -- expo start --dev-client
```

Add these scripts to an Expo application's `package.json`:

```json
{
  "scripts": {
    "generate:project": "kurot-project --project .",
    "watch:project": "kurot-project --project . --watch",
    "start": "kurot-project --project . --watch -- expo start",
    "android": "kurot-project --project . --watch -- expo run:android",
    "ios": "kurot-project --project . --watch -- expo run:ios"
  }
}
```

`pnpm start --dev-client` now generates the entry and starts Expo. Saving the manifest, an image, a sheet descriptor, text, KUI or project styles regenerates it automatically. Skin additions, moves and removals update imports, registration and theme output. Referenced local assets outside the resource directory are watched too.

The watcher waits briefly for writes to settle, coalesces rapid saves and serializes generation. Invalid saves report an error and retain the last successful output; fixing the input resumes generation. Generated files and staging directories are excluded from watching.

The command after `--` starts in the project directory after the first successful generation, inherits the terminal/environment and stays running through subsequent saves. Its exit closes the watcher and forwards its exit code. Ctrl+C or SIGTERM closes the watcher and stops the command. Running Expo directly requires a separate watcher terminal.

## Use the generated entry

The generator creates:

| Output | Purpose |
| --- | --- |
| `assets.ts` | `bundledAssets`, `resourceConfigURL`, `resourceRoot` and `remoteURLs` |
| `skins/**/*.ts` | One compiled factory per KUI file, preserving its relative path |
| `skins.ts` | Static skin imports, `skinFactories`, `theme`, `themeConfigURL` and `registerSkinFactories()` |
| `theme.json` | Generated component-to-skin mapping and skin module reference |
| `index.ts` | Combined resource and skin exports |
| `.kurot-project.json` | Generator ownership and output file list |

Import this generated application entry in runtime code:

```ts
import {
    bundledAssets, resourceConfigURL, resourceRoot,
    skinFactories, theme, themeConfigURL, registerSkinFactories,
} from './generated/kurot';
```

Connect these values to your host adapters:

1. Register `bundledAssets` with the host's resource loader. JSON/text entries contain values; image/file entries contain bundler references. The loader must translate these entries into the platform's text and image loading contracts.
2. Use `resourceConfigURL` and `resourceRoot` with Kurot's `Resource.loadConfig()` after installing that loader. Resource names, groups and subkeys remain the project's own.
3. Call `registerSkinFactories()` and retain its returned restoration callback. It registers full skin class names on `globalThis` by default, or on a supplied `Record<string, unknown>`. `skinFactories` also supports a host that uses its own factory lookup.
4. Provide `theme` through the host's theme adapter and use `themeConfigURL` as its logical configuration URL. A static module loader can register the factories when `theme.skinsJs` is requested. Restore registrations when the host session is disposed.

The Demo implements these connections in `src/resources/bundled.ts` and `src/ui/native-ui.ts`, with native loaders in `src/skia/`. Creating a new native application also requires those runtime adapters and a renderer. Generated modules alone do not install them or start the engine.

Skin modules import `@kurot/core` and `@kurot/ui`; the host supplies those packages. The Demo's tested baseline is Core 2.5.3 and UI 3.5.0. The generator itself has no Core/UI runtime dependencies or peers.

### Theme mapping

A skin whose final class-name segment equals a built-in component's name plus `Skin` supplies that component's default skin. For example, `skins.ButtonSkin` maps `Button` to that factory. Other skins are compiled and registered by their full class names for explicit `skinName` use.

Use a JSON map when choosing among defaults or mapping a custom host key:

```json
{ "Button": "alternate.ButtonSkin" }
```

```sh
pnpm exec kurot-project --project . --theme-map config/theme-map.json --watch
```

Every mapped class must exist in the scanned KUI files. Duplicate full class names and ambiguous default skins are errors. The map is read again on every generation.

## How it works

```mermaid
flowchart LR
    A["resource.json + local assets"] --> G["kurot-project · Node"]
    B["KUI XML + style.json"] --> G
    G --> E["Generated TypeScript entry"]
    E --> M["Metro / ESM bundler"]
    M --> H["Host resource + theme adapters"]
    H --> K["Kurot UI + display tree"]
    K --> S["Skia renderer · Demo"]
```

The generator validates resource declarations, collects their local dependencies, and compiles all KUI using the pinned Kurot CLI compiler. Project styles resolve Label presets and color references during compilation. Authored manifests, names, groups, object subkeys, XML, nine-slice grids and sheet resolution are preserved.

JSON and text are embedded in TypeScript. Images and audio become static references: `--assets metro` emits literal `require(...)` calls and extensionless skin imports; `--assets url` emits `new URL(..., import.meta.url).href` and `.js` skin imports. Your bundler must support the chosen mode and compile the generated TypeScript. Neither mode copies the source assets.

All inputs must validate and compile before an owned output directory is replaced. Removed skins leave no stale factories. Missing resources, invalid KUI or unrecognized files in the output stop generation and preserve the previous result. Keep authored code out of the generated directory.

The phone consumes bundled code and assets, so it does not need to parse KUI XML or discover a theme's modules dynamically at runtime. Runtime resource caching, image decoding, theme application and rendering remain the host's responsibility.

## CLI reference

| Option | Default / meaning |
| --- | --- |
| `--project <dir>` | Current directory; project root |
| `--manifest <file>` | `resource/resource.json` |
| `--skins <dir>` | Manifest directory; recursively scan `.kui.xml` |
| `--style <file>` | `<manifest directory>/config/style.json`; optional unless explicitly supplied |
| `--output <dir>` | `src/generated/kurot` |
| `--assets metro\|url` | `metro`; generated asset-reference and import mode |
| `--theme-map <file>` | Optional JSON object of host keys to skin class names |
| `--watch`, `-w` | Generate initially and keep watching |
| `--help`, `-h` | Show command usage |

Manifest, skin, style and output paths are relative to `--project` and must stay inside that project. `--theme-map` is relative to the command's working directory. Paths may be absolute where they satisfy the same constraints. `-- <command> <args...>` is available only with `--watch`.

## Build-script API

Import the Node-only API from `@kurot/skia/project` in build scripts. Runtime applications import the generated files instead.

```ts
import { generateProject } from '@kurot/skia/project';

const result = await generateProject({
    projectRoot: '/path/to/game',
    manifest: 'resource/resource.json',
    outputDir: 'src/generated/kurot',
    assetMode: 'metro',
});
console.info(result.outputDir, result.assets, result.skins);
```

`ProjectOptions` also accepts `skinsDir`, `styleSheet` and either `themeSkins` (a host-to-class map) or `themeMapFile` (a JSON file). API paths are relative to `projectRoot`, including `themeMapFile`. `ProjectResult` provides `outputDir`, `resourceConfigURL`, `assets`, `remoteURLs`, `skins` and `files`; asset URLs are project-relative logical URLs, and output file paths are relative to the output directory.

For a long-running build script:

```ts
import { watchProject } from '@kurot/skia/project';

const stopped = new Promise<void>(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
});
const watcher = await watchProject({ projectRoot: '/path/to/game' }, {
    debounceMs: 100,
    onGenerated: result => console.info(result.outputDir),
    onError: error => console.error(error.message),
});
await stopped;
await watcher.close();
```

`watchProject()` performs an initial generation and returns a `ProjectWatcher`. Generation errors invoke `onError` and keep watching, including an invalid initial input. `onGenerated` runs after successful generation. `close()` is idempotent, cancels scheduled work and waits for an active generation. The API caller owns signal handling and any development-server process; the CLI handles those for you.

## Supported inputs and limits

The generator recognizes `image`, `sheet`, `json`, `text`, `font` and `sound`. Here, `font` means a bitmap-font descriptor and its image page. Sound is emitted as a `file` entry. Local resource URLs must be plain paths without query strings, fragments or backslashes, and resolve inside the project. Symlinks and special files in scanned skin directories are rejected.

Remote URLs are retained for runtime loading. They are not downloaded or watched, and dependencies inside remote sheet/font descriptors are not discovered. Unknown resource types and unknown KUI component namespaces require explicit build-time support.

Resource generation does not provide platform rendering support for every resource type. The Demo currently has no bitmap-font/audio runtime integration or bundled font registration; `style.json` is used for compilation. Its UI runtime validation focuses on Label and Button. Compiling additional skins does not establish native support for all their controls.

Compiler behavior comes from pinned `@kurot/cli` 3.6.0 and `@kurot/ui-document` 0.13.1. The compiler's internal import is isolated in `src/kurot/compiler.ts`; validate it when updating CLI.

## Develop the library

```sh
pnpm build
pnpm test
```

Tests cover resource discovery, KUI compilation, static registration/restoration, deterministic output, stale-file cleanup, failures and watch/command lifecycles. The implementation lives directly in `src/kurot/`.
