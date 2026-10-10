# Native runtime

The experimental `@kurot/skia` runtime renders a Kurot display tree into React Native Skia's Graphite canvas on Android and iOS. It includes the existing Demo adapters for images, dynamic text, Graphics, touch input and statically bundled themes. See [PLAN.md](PLAN.md) for pending adaptation and performance tests.

## Package entries

| Entry | Environment | Purpose |
| --- | --- | --- |
| `@kurot/skia` | React Native | `KurotView`, renderer and platform helpers |
| `@kurot/skia/metro` | Node / Metro config | `createKurotResolver()` |
| `@kurot/skia/generator` | Node build scripts | Resource/KUI generation and watch |

Keep the Node entries out of application runtime imports. The runtime entry does not import the generator, Node APIs, TypeScript compiler or watcher.

## Install in an application

Install the npm release as a runtime dependency in the Expo application:

```sh
# In the application
pnpm exec expo install '@kurot/skia@0.1.0' --pnpm
```

The tested host is Core 2.5.3, UI 3.5.0, React Native Skia 3.3.0, React 19.2.3 and React Native 0.86.3 with Expo 57. Core and Skia are currently bound to those exact package versions because this adapter uses their internal/rendering contracts. UI 3.5.0 is required when installing UI. Core, UI, React, React Native and Skia are host peers; their optional metadata lets generator-only consumers omit native packages. A native application supplies Core, React, React Native and Skia, plus UI if it uses KUI controls.

For a new Expo host that does not yet contain the engine/Skia packages:

```sh
pnpm exec expo install '@kurot/core@2.5.3' 'react-native-skia@3.3.0' \
    react-native-reanimated react-native-worklets --pnpm
# When using KUI controls:
pnpm exec expo install '@kurot/ui@3.5.0' --pnpm
```

This package adds JavaScript adapters to the application's existing Skia native module. A new application needs a development build containing that module; the generator alone does not install native code. Android uses Skia's Vulkan backend and requires API 26 or newer; iOS uses Metal. Web and desktop runtime integration are not validated here.

Applications using the npm package can run `pnpm start --dev-client --android` after configuring the resource-watch scripts in the [README](../README.md). No neighboring library checkout is needed. For joint source development, build the library and install `@kurot/skia@file:../Kurot-Skia` instead; the current Demo's `pnpm dev --android` compiles and synchronizes local changes. See [library development](development.md).

## Configure Metro

```js
const { getDefaultConfig } = require('expo/metro-config');
const { createKurotResolver } = require('@kurot/skia/metro');

const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = createKurotResolver(
    __dirname,
    config.resolver.resolveRequest ?? undefined,
);
module.exports = config;
```

The project directory must contain its host dependencies in `node_modules`. The helper locates the installed library through package resolution and the application's physical Core/UI installations. All Core objects, native textures and generated UI factories then share those installations.

On Android and iOS it selects a native Core barrel and replaces browser image/text/cache/theme modules. Deep Core imports are allowed only from the library adapter and are resolved from the host. It checks the Core/UI versions before configuring mappings. Other requests delegate to the supplied resolver, or Metro's default resolver; other platforms keep the original resolution behavior.

The Demo composes this resolver with its own test-entry selection. Applications do not need TypeScript aliases to a copied `core-native.ts`, special watch folders, or references to a neighboring library `dist` directory.

This is a version-bound integration using Core's existing published internal modules. Native support stays in this package's resolver and adapters; it does not require new Core platform entries, modify the Core/UI SDKs or create separate display-object implementations. Before supporting another Core/UI version, revalidate the internal mappings, shared object identity and native regression scenes. Core's future WebGPU backend design is separate from this integration; see the [plan](PLAN.md).

## Create a scene

```tsx
import { Shape } from '@kurot/core';
import type { Stage } from '@kurot/core';
import { KurotView } from '@kurot/skia';
import type { NativeScene } from '@kurot/skia';
import type { ReactElement } from 'react';

function createScene(stage: Stage): NativeScene {
    const shape = new Shape();
    shape.graphics.beginFill(0x67e3bb);
    shape.graphics.drawCircle(0, 0, 24);
    shape.x = stage.stageWidth / 2;
    shape.y = stage.stageHeight / 2;
    stage.addChild(shape);
    return {
        update(deltaSeconds): void {
            shape.rotation += deltaSeconds * 30;
        },
        dispose(): void {
            stage.removeChild(shape);
        },
    };
}

function reportError(message: string): void {
    console.error(message);
}

export function Game(): ReactElement {
    return <KurotView width={360} createScene={createScene} onError={reportError} />;
}
```

Omit `height` to use the view's full aspect ratio with a logical width. Set `height` for a fixed logical stage fitted into the native view. The view's parent must allocate space, typically with `flex: 1`.

Keep `createScene`, `onError` and optional `onStats` callbacks stable, using module functions or `useCallback`. Changed callbacks or viewport dimensions recreate the scene. `KurotView` creates the Stage and renderer, runs Core's ticker at a target of 60 fps, forwards touch input, stops in the background, and disposes the scene and native recording context on unmount.

Use one active `KurotView`. The current ticker, Graphics hit-test hook and UI Theme contain global state; concurrent views are future work. `FrameStats.fps` counts recording/submission callbacks and `draws` counts adapter operations. Neither is a GPU timing or hardware draw-call measurement.

## Connect generated resources and UI

```ts
import { registerNativeAssets } from '@kurot/skia';
import { bundledAssets } from './generated/kurot';

registerNativeAssets(bundledAssets);
```

Perform registration before calling `Resource.loadConfig()` / `loadGroup()`. The native loader reads embedded JSON/text and decodes Metro image references through Skia. Remote URI requests use the host transport. Bitmap-font/audio rendering is not implemented, even though the generator can collect those resources.

For UI, retain project-owned setup that installs an `IAssetAdapter` backed by the scene's Resource instance and supplies generated theme configuration to `Theme`. Import `registerNativeSkinModule()` from `@kurot/skia` to associate `theme.skinsJs` with `registerSkinFactories()`. Metro selects the library's native Theme implementation. Restore the theme, asset adapter, skin factories and module registration when disposing the project session. The Demo's `src/ui/native-ui.ts` shows this composition without embedding its generated config in the library.

## Runtime exports

- `KurotView`, `KurotViewProps`, `NativeScene`, `FrameStats`: native canvas and scene lifecycle.
- `SkiaRenderer`: imperative rendering into a provided `SkCanvas`; owns Graphics hit testing and text/path caches. Dispose it when finished.
- `NativeTouch`, `createViewport`, `Viewport`: input forwarding and logical coordinate mapping.
- `createSkiaBitmapData`, `createSkiaTexture`, `getSkiaImage`: bind native images to Core geometry. The loader transfers image ownership; `createSkiaTexture()` leaves the image owned by its caller.
- `registerNativeAssets`, `getNativeAsset`, `NativeAsset`: register/query the application's static JSON/text/image table. The current registry is process-wide; scoped registration is future work.
- `registerNativeSkinModule`: static theme module registration with a restoration callback.
- `NativeImageLoader`, `NativeHttpRequest`: Core-compatible platform ports, also exposed for integration tests.
- `measureText`, `measureTextMetrics`, `NativeTextMetrics`, `createParagraph`, `nativeFontStyle`: native text helpers. Dispose Paragraph objects returned to the caller.

## Validation and limits

Node tests validate the generator and Metro mapping/composition. Demo tests under `tests/native/` exercise real Skia JSI, resources, dynamic text, Label/Button and KUI factories. Run them with `pnpm test:native --android` in a development build. Successful compilation or bundling alone does not establish native rendering correctness.

This migration preserves the existing supported subset. Rotated/repeated/clipped Bitmaps, bitmap fonts, native text input, display-object masks, filters, offscreen caches, extended blend modes, gradient/dashed Graphics and every UI/game extension still need separate adaptation or validation. Unsupported rendering paths fail explicitly. Consult the plan before treating this runtime as a complete engine backend.
