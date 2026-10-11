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

Install 0.1.3 as a runtime dependency in the Expo application. It includes native Mesh/game/UI support and shared Spine caches, retaining native nine-slice rendering and cached source-frame images:

```sh
# In the application
pnpm exec expo install '@kurot/skia@0.1.3' --pnpm
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

Applications using the npm package can run `pnpm start --dev-client --android` after configuring the resource-watch scripts in the [README](../README.md). No neighboring library checkout is needed. The Demo also consumes the npm package. For joint source development, explicitly install a local `file:` dependency in the target application and run the library's supervisor; use a separate Demo installation when preserving the registry consumer. See [library development](development.md).

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

Perform registration before calling `Resource.loadConfig()` / `loadGroup()`. The native loader reads embedded JSON/text and decodes Metro image references through Skia. Remote URI requests use the host transport. Version 0.1.3 adds bitmap-font drawing and an optional audio-backend contract; it does not include a media host.

For UI, retain project-owned setup that installs an `IAssetAdapter` backed by the scene's Resource instance and supplies generated theme configuration to `Theme`. Import `registerNativeSkinModule()` from `@kurot/skia` to associate `theme.skinsJs` with `registerSkinFactories()`. Metro selects the library's native Theme implementation. Restore the theme, asset adapter, skin factories and module registration when disposing the project session. The Demo's `src/ui/native-ui.ts` shows this composition without embedding its generated config in the library.

## Runtime exports

- `KurotView`, `KurotViewProps`, `NativeScene`, `FrameStats`: native canvas and scene lifecycle.
- `SkiaRenderer`: imperative rendering into a provided `SkCanvas`; owns Graphics hit testing and text/path/nine-slice caches. Dispose it when finished.
- `NativeTouch`, `createViewport`, `Viewport`: input forwarding and logical coordinate mapping.
- `createSkiaBitmapData`, `createSkiaTexture`, `getSkiaImage`: bind native images to Core geometry. The loader transfers image ownership; `createSkiaTexture()` leaves the image owned by its caller.
- `registerNativeAssets`, `getNativeAsset`, `NativeAsset`: register/query the application's static JSON/text/image table. The current registry is process-wide; scoped registration is future work.
- `registerNativeSkinModule`: static theme module registration with a restoration callback.
- `NativeImageLoader`, `NativeHttpRequest`: Core-compatible platform ports, also exposed for integration tests.
- `measureText`, `measureTextMetrics`, `NativeTextMetrics`, `createParagraph`, `nativeFontStyle`: native text helpers. Dispose Paragraph objects returned to the caller.

## Validation and limits

Node tests validate the generator and Metro mapping/composition. Demo tests under `tests/native/` exercise real Skia JSI, resources, dynamic text, Label/Button and KUI factories. Run them with `pnpm test:native --android --clear` or `pnpm test:native --ios --clear` in a development build. Successful compilation or bundling alone does not establish native rendering correctness.

`gpu-nine-slice.test.ts` allocates `Skia.Surface.MakeOffscreen()`, asserts that the snapshot is GPU-backed and reads RGBA pixels after submission. It has 48 cases covering fractional translation/scale, rotation, centered flip, nearest/linear filtering, source/object alpha, 1×/2× atlas frames, trim, collapsed centers, the small-size scale fallback and original KUI up/down/disabled textures. Uniform-frame cases compare interior pixels with a single scaled image; colored-region cases check fixed corners and source mapping. Raster-only or integer-coordinate tests cannot replace this coverage.

Version 0.1.2 replaces 0.1.1's custom image shader with native `drawImageNine`. The whole-image API receives a cached source-frame image, with a canvas density transform preserving logical borders and trim. A destination below the fixed border size uses one ordinary scaled image to retain Core's fallback. `Bitmap.smoothing` selects nearest/linear filtering; source alpha and inherited opacity remain active. `FrameStats.draws` counts one adapter operation, not hardware draws or crop work.

Atlas crops are copied on first use with `readPixels()` and `MakeImage()` as RGBA_8888, retaining the source alpha type. An intermediate 8-bit premultiplied GPU surface failed 12 transparency cases (230 versus 233 in one channel); source-pixel copying passes the unchanged pixel tolerance and also works on the existing CPU test canvas. Each renderer keys crops by source image identity and physical frame bounds. Destination size, grid and filter changes reuse them; earlier skin-state frames remain cached while their atlas is active. At frame end, unused source groups are evicted; renderer disposal releases all owned crops and paint. Source images remain caller-owned, and full-image frames bypass copying.

This adds crop storage and a synchronous first-use pixel copy; GPU sources require readback. Skia manages subsequent drawing/upload of the cached image. There is no custom RuntimeEffect or intermediate rendering surface, and no performance advantage has been established. HDR/wide-gamut and non-8-bit crop fidelity need separate validation.

The native API uses an integer center rectangle. Source frames must be integer physical pixels inside the source image, and the positive center must be inside the frame with integer physical boundaries. Logical fractional grids are accepted when density conversion yields integer pixels (for example half-pixel logical grids at 2×). Arbitrary fractional physical splits and invalid centers fail explicitly; this is a restriction relative to the shader implementation. Fractional destination positions, scales and rotations remain supported by the validated cases. Native edge coverage follows Skia's `drawImageNine` behavior; the interior tests do not compare outer-edge AA against the former shader.

On 2026-10-11 the regression failed against npm 0.1.0 (a solid join read alpha 197 instead of 255). The shader fix was published in 0.1.1. The 0.1.2 native implementation passes the same unmodified 48 GPU cases and existing native suites on iPhone SE (3rd generation), iOS 18.2, and iPhone 17 Pro, iOS 26.5. `nine-slice-cache.test.ts` additionally verifies actual native image identity across repeated draws, resize/filter/grid changes and skin switches, unused-source eviction, renderer disposal and fractional-split rejection. Published 0.1.0 still contains the seam defect; npm 0.1.1 does not include the new native implementation. To validate source fixes in an application already declaring the local `file:` dependency, run from the library:

```sh
KUROT_NATIVE_TESTS=1 pnpm dev --project ../MyGame -- expo start --dev-client --ios --clear
```

Stop that server before starting the ordinary scene, omit `KUROT_NATIVE_TESTS` and clear Metro when switching entries. The normal npm Demo installation is not synchronized by this command. Android GPU regression was pending at the 0.1.2 baseline; the [feature assessment](native-feature-assessment.md) records the expanded Android/iOS suite included in 0.1.3. Release-device performance remains unverified.

The 0.1.2 baseline supported only the validated cases and source geometry above. Version 0.1.3 extends those capabilities as described below. Unsupported rendering paths still fail explicitly; consult the assessment and plan for remaining acceptance gates.

## Native additions in 0.1.3

The optional [Spine cache player](native-spine-shared-cache.md) shares immutable
sampled poses and bounded native vertex buffers. Existing SDK players retain
their live evaluation/API; cached players have independent phases/clocks and a
fixed action/skin without mixing or timeline events. Bake during scene loading
and release caches before their caller-owned atlases.

See [native-feature-assessment.md](native-feature-assessment.md) and the isolated
[device test host](https://github.com/kurot-engine/kurot-skia/tree/main/tests/native). These additions are not in npm 0.1.2.

- Images support repeat/clip, tint, trim/density and clockwise atlas frames.
  Adjacent sprites with the same source frame/filter/tint and uniform rotation/scale
  can use native atlas batches. This path requires an opaque source frame of at most
  256² physical pixels and full inherited/sprite opacity. Transparent sources and
  fades retain individual drawing: native atlas color quantization did not pass
  the single-painter pixel oracle. Cached source-pixel copies prevent atlas bleeding;
  trim, flips, effects, clips and other fill modes also use individual drawing.
  First-use cropping and bounded source-alpha inspection are outside warm benchmarks.
  Particles retain per-particle tint/alpha/blend and use cached upright source frames
  to preserve rotated/trimmed/density geometry without neighboring-pixel sampling.
  Mesh uses native textured vertices, with triangle remapping below the uint16
  limit. Consecutive identity-local meshes merge when source image, sampling,
  effective tint, alpha and blend match. Triangle order and each physical atlas
  UV frame remain intact; local transforms, masks, effects, caches and intervening
  display kinds keep individual drawing. Parent transforms and layers remain on
  the canvas. Entirely identical positions/UVs/indices/source frames may share an
  immutable native buffer across actors, with independent paint/transforms and
  reference-counted ownership. The exact-content memo keeps at most 16 entries
  and 262,144 position/UV/index values (about 2 MiB of numeric payload, plus
  source-frame metadata and JS overhead) for one frame. Visible runs retain their
  native buffers until replaced or evicted.
  Published Spine/DragonBones adapters share the host Core and retain their own
  independent pose/clip updates; no animation frames are skipped. See the
  [Spine optimization measurements](native-spine-optimization.md).
- Game MovieClip keeps its external `advanceFrame()` contract: accumulate scene
  delta and advance at `1 / clip.frameRate`. `play()` alone does not create an
  animation timer. Tween and Spine use the shared ticker; remove staged objects
  and stop particles/tweens when disposing a scene.
- BitmapText/BitmapLabel retain the SDK layout, with a native FontAnalyzer for
  manifest pages. BitmapLabel string names use Core's global Resource; a private
  Resource host passes the loaded BitmapFont object instead of a string name.
  Gradient matrices and dashed strokes are native; display masks, blend modes
  and color matrix/blur/glow/drop-shadow use Skia layers and image filters.
  Gaussian kernels differ from Web; filter quality/resolution are not matching
  browser pass controls. Custom GLSL is unsupported and needs native design.
- `cacheAsTexture()` reuses GPU captures and Core dirty propagation. Default
  density follows the physical viewport scale. Each capture fits 4096²; retained
  captures are limited to approximately 64 MiB RGBA, evicting older captures.
  This estimate excludes textures, temporary surfaces and GPU-driver storage.
  `RenderTexture` supports explicit local captures, clip/scale, RGBA readback and
  disposal; its returned texture retains Core's physical size contract. Independent
  captures preserve pending Graphics, Mesh and cached-subtree changes for the
  main renderer, including dirty state in descendant display masks.
- Short text metrics use a 1,024-entry LRU with a 256-character admission limit.
  Values are copied for callers; font registration changes invalidate them.
  Paragraph caches remain per-field and are removed when unused.
- Declare `.ttf`/`.otf`/`.skel`/`.dbbin`/`.bin` as existing `text` manifest entries to
  statically bundle binary bytes, then load them with `HttpResponseType.ARRAY_BUFFER`.
  These entries cannot be read by TextAnalyzer as strings. `.atlas` text entries
  automatically include each page image. Local URLs are still manifest-relative;
  remote URLs need an explicit URI scheme because RN has no browser base URL.
- `registerFontMapping(name, logicalFontURL)` registers bundled/cached faces;
  `cacheFontResource(url, arrayBuffer)` also supports downloaded faces. Register
  before creating text, or invalidate existing text metrics afterwards. Repeated
  identical registration is idempotent. `clearNativeFonts()` is session cleanup.
- `KurotView` mounts one RN TextInput for the focused Core INPUT field. Unfocused
  text/chrome stay in Skia. RN owns the keyboard, caret and IME; Core receives text,
  selection and focus events. Restrict applies when committing/blur, preserving
  preedit. Hide/detach/background releases focus. Use `NativeInputOverlay` when
  embedding an imperative renderer yourself. Editing uses RN system fonts;
  Skia-registered fonts do not automatically register with RN. Editing font/outline,
  inherited tint/opacity/effects, display masks, rich text, complex ancestor clips
  and keyboard avoidance need host treatment; the RN editing view is not a complete
  visual replica of Skia text.
  Each controller mounts its own editing view, and overlay cleanup explicitly
  blurs that native instance so an old field's blur cannot close the next field.
  The [manual keyboard record](native-input-acceptance.md) covers actual iOS
  simulator Pinyin, passwords, selection and multiline input; Android IME and
  physical-device input remain unverified.
- `registerNativeAudioBackend()` lets a project connect a media engine through
  `NativeAudioBackend`. Missing audio reports IOError instead of entering browser
  code. Audio focus, background playback, video and actual audio hardware are
  not implemented or accepted by these tests.
- `FrameStats.profile` adds update/record/submit/total p50/p95/p99 per reporting
  interval when `onStats` is supplied. Update covers scene/input work, not the
  Core ticker's earlier listeners. Submission does not wait for GPU completion.
  Neither this profile nor the diagnostic offscreen benchmark is presented FPS.

`SkiaRenderer.renderLocal()` captures root content with ordinary descendant
semantics. The third constructor argument can disable bitmap and Mesh batching for pixel
oracles and diagnostics; ordinary applications keep its default enabled.
