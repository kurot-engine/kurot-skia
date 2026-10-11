# Native acceptance host

This private Expo application installs the checkout through `file:../../..`.
It never replaces the registry installation in `Kurot-Skia-Demo`. Published Core
2.5.3/UI 3.5.0/Game 2.0.0 and Spine 4.0–4.3 are tested without SDK edits.

From the library:

```sh
pnpm build
pnpm --dir tests/native/app install
pnpm --dir tests/native/app generate:project
pnpm --dir tests/native/app typecheck
pnpm --dir tests/native/app lint
pnpm dev --project tests/native/app -- expo start --dev-client --clear
```

Use a native development build containing Skia 3.3.0. The test host has the same
native dependency set as the Demo, so its existing simulator client can load this
Metro project. New native test builds use separate iOS/Android application IDs
and do not replace the Demo. A separate test device/client is preferable when
preserving a running Demo. For a new client, run `expo run:ios` or `expo run:android`
in this app after generation. Platform projects are ignored.

On launch, functional checks run against real Skia JSI. GPU fixtures use
`MakeOffscreen`, wait for GPU completion, require a texture-backed snapshot and
read RGBA pixels. Raster fixtures do not replace the original 48 GPU nine-slice
oracles. The additional checks cover 24 image combinations, Mesh, compositing,
cache invalidation/disposal, bitmap fonts, Game, four Spine versions and weighted
Spine clipping, DragonBones image/weighted/deformed/nested geometry, ScrollView,
all 16 original UI skins, binding, 5,000-item virtualization, font loading/reload,
the editing-controller and optional audio contracts. RenderTexture regressions
modify Graphics, cached subtrees and Mesh geometry before an independent capture,
then check that the main renderer draws the updated pixels. Sprite batches are compared
with the individual painter at the same pixel tolerance, including atlas edges.
Ordered Mesh batches also compare every pixel with a fresh individual painter:
translucency, rotated/density frames, tint, additive blending, local fallbacks,
dirty topology, pixel-hit invalidation, actor buffer sharing and eviction. Each
Spine version additionally compares its real weighted pose with that painter.
Particles are compared against an independently authored upright source frame for
fractional scaling, density, rotation, trim, tint, alpha and blend; this regression
reproduced atlas bleeding before isolated-frame caching was added.
After benchmarks, three actual RN Graphite view mounts exercise updates, changed
logical dimensions, profiling and native scene cleanup before showing the gallery.
Each mount replaces its stats/error callbacks and requires the same scene to
continue updating and reporting through the replacement callback.
The mounts also focus and switch Core fields through actual RN TextInput views,
then require native focus release within 500 ms of unmount. This checks mounted
editing state; it does not certify real keystrokes, IME candidates or preedit.
The separate [manual keyboard record](../../docs/native-input-acceptance.md)
documents screen-keyboard checks on iOS 18.2 and 26.5.

The performance suite then reports `KUROT_BENCHMARK` JSON lines: 30 warm-up frames
and 120 measured frames at 720×1280, with update/record/synchronous GPU-wait/total
p50/p95/p99, draw operations and over-budget percentage. Populations are asserted;
particles set `maxParticles` explicitly and list virtualization is enabled after
assigning its layout. The bitmap-font counter uses a synthetic one-page font;
its timing is not a visual-quality comparison with dynamic text.
The original 15 fixtures retain their populations, resolution and updates.
A sixteenth fixture offsets all 20 Spineboy animation phases; it exposes the
cost of different poses separately from the original synchronized scene.
Two additional fixtures use the opt-in 60 Hz shared cache with the same 20
actors, transforms, update steps and phase offsets. A separate record captures
one-time bake cost and geometry payload. Four-version native cache checks use
sample-time GPU oracles and count actual JSI vertex allocations across frames;
sampling is not asserted equal to continuous poses. See the
[cache guide](../../docs/native-spine-shared-cache.md) for API/ownership limits.

The Picture suite adds GPU comparisons with ordinary drawing for text/Graphics,
overlap opacity, transforms, sorting, external masks, fonts and resources. It checks
actual Picture disposal, replay after primitive eviction, nested ownership,
count/draw limits, failed recordings and restoring existing dirty callbacks.
Separate `picture-benchmark` records compare the same 16 UI skins, 100 TextFields
and 160 Graphics objects (nine fills each) in ordinary/image/Picture modes, both
stationary and continuously transformed. Every fixture uses the same 720×1280
target, 30 warm-up frames and 120 samples; cold record/GPU-wait timing is separate.
Picture fixtures assert exactly one rebuild. Their stats count owned recordings
and adapter operations, not hardware draw calls or native memory bytes.
External mask coverage includes changes inside a mask container and transforms
of its ancestors. Final Release distributions and exact passing backends are in
[the Picture measurement record](../../docs/native-picture-cache-2026-10-11.json);
explicit SwiftShader's existing batching-oracle failure is recorded separately.

For production JavaScript diagnostics, use:

```sh
pnpm dev --project tests/native/app -- expo start --dev-client --no-dev --minify --clear
```

For the interactive Spineboy 4.2 demo, use:

```sh
EXPO_PUBLIC_KUROT_SPINE_DEMO=1 pnpm dev --project tests/native/app -- expo start --dev-client --no-dev --minify --clear
```

This mode shows one or 20 independently animated actors, walk/run/jump,
pause/resume and synchronized or offset phases. It reuses the bundled binary
skeleton and atlas and the published Spine adapter. Its counter reports view
submissions, not measured GPU presentation. It skips the acceptance suite and
does not emit a test pass. Remove the variable before full tests or benchmark
Release builds. Prefix the simulator Release build below with the variable to
embed this demo and run it without Metro.

This still uses a Debug native client. It is not a physical Release-device gate
or a presented-FPS/memory/thermal trace. Background other simulators while
measuring. The recorded Android API 36 emulator uses software Vulkan (llvmpipe /
SwiftShader); its GPU API path does not measure a phone's GPU silicon. iOS simulator
Metal timings use the Mac GPU. The final gallery allows manual touch and actual RN keyboard checks;
Custom editing fonts, keyboard avoidance and physical-device IME need
host/device acceptance. Fast Refresh runs are serialized and cancelled during
benchmarks; acceptance records should come from a fresh launch.

To retain production-JS diagnostics independently of console output, start the
optional loopback collector from the library (the compilation works on Node 20):

```sh
pnpm exec tsc -p tests/native/tsconfig.collector.json
node .native-tools/collector.js
```

It accepts synthetic test records at `127.0.0.1:9085` and appends them under the
ignored `tests/native/results/` directory. For Android emulator runs, configure
`adb reverse tcp:9085 tcp:9085` and the corresponding Metro port. iOS simulators
can reach the Mac's loopback directly. The collector is not an application service
and does not ship in npm. A complete run contains functional pass, the original 18 benchmark
records, 18 separately typed picture-benchmark records, three native-view records
and final complete pass. Failed or interrupted
runs must not be used as completed acceptance records.

For isolated mounted input/view debugging, prefix the development command with
`EXPO_PUBLIC_KUROT_PROBE_ONLY=1` and restart Metro. This mode emits `probe-complete`,
which must not count as a full functional/performance pass. Remove the variable
and restart Metro before running full acceptance or production exports.

For real keyboard checks, use the dedicated four-field fixture:

```sh
EXPO_PUBLIC_KUROT_INPUT_ONLY=1 pnpm dev --project tests/native/app -- expo start --dev-client --no-dev --minify --clear
```

It exposes plain, password/maxChars, commit-time restriction and multiline fields,
plus select/blur controls. Use the actual OS keyboard and candidate bar; inspect
both the native field and recorded Core text/UTF-16 selection. The collector emits
`manual-input-observation`, never an automatic IME pass. Remove both
`EXPO_PUBLIC_KUROT_INPUT_ONLY` and `EXPO_PUBLIC_KUROT_PROBE_ONLY` before full tests,
production exports or Release builds.

For a simulator-only iOS Release build, generate the native iOS project, then run:

```sh
cd tests/native/app/ios
xcodebuild -workspace KurotSkia.xcworkspace -scheme KurotSkia \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/kurot-skia-simulator-release CODE_SIGNING_ALLOWED=NO
```

Install the product with `xcrun simctl install <simulator> <app>` and launch
`com.irwinmc.KurotSkia.NativeTests`. Android uses `expo prebuild --platform android`,
then `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` in its
generated `android` directory with JDK 21 and the Android SDK configured. This
local test APK uses Expo's debug keystore and the separate
`com.irwinmc.KurotSkia.nativetests` ID. Its private build configuration permits
cleartext HTTP so the loopback collector works in Release; this setting belongs
to the test host and is not applied to consuming applications.
Start the collector and configure Android's
reverse port before launch; embedded Release JS needs no Metro server. Stop build
jobs and other test clients before measuring. These builds test simulator runtime
behavior; they do not establish phone frame rate, memory or thermal acceptance.

Build production bundles with `NODE_ENV=production expo export --platform ios
--platform android --source-maps`. Inspect the maps to confirm that Node tooling
is absent from both runtime bundles.
Generated entries, local installations, build directories and raw result logs
are ignored. Fixtures are authored inputs. KUI/fonts originate in the engine's
CLI game kit; font OFL is retained. Spineboy files come from the matching
versioned `Kurot-Spine/packages/spine-4.x/example/assets` fixtures; the Spine
Runtimes license and copyright notice are retained under `resource/spine/LICENSE`.

See [the assessment](../../docs/native-feature-assessment.md) for the actual
verification record and limits. No fixture/test source is shipped in npm.
