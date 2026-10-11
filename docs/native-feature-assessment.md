# Native feature assessment

Version 0.1.5 is prepared with an opt-in [Picture cache](native-runtime.md#picture-caching).
Its static UI/text/Graphics comparisons use independent fixtures and build
identities in [native-picture-cache-2026-10-11.json](native-picture-cache-2026-10-11.json). They do not replace the
historical live-Spine or shared-pose-cache measurements below. Publication and
physical-device performance acceptance remain separate.

The later opt-in [Spine shared-cache experiment](native-spine-shared-cache.md)
has separate Release records in `native-spine-cache-2026-10-11.json`. Its sampled
player leaves the live SDK path unchanged. The live-pose distributions and build
hashes below remain the earlier optimization record rather than being relabeled
as cache measurements.

Assessment date: 2026-10-11. Baseline: published `@kurot/skia@0.1.2`,
Core 2.5.3, UI 3.5.0, Game 2.0.0 and RN Skia 3.3.0.
This document separates SDK logic, native drawing and device acceptance.
The additions below ship in 0.1.3. Measurements retain the original pre-release
source fingerprints and build hashes; npm 0.1.2 does not include these features.

## Architecture and scope

Keep Core, UI, Game and the Spine adapters unchanged. Metro selects one host
Core installation and redirects browser capabilities to native modules in this
package. Resource manifests and KUI remain project inputs; the Node generator
turns them into Metro-visible assets and skin factories. No Node tool runs in RN.

Game animation, Spine pose evaluation, UI validation and input dispatch run in
Hermes on the JS thread. Skia receives drawing commands through JSI and renders
with its native Graphite GPU backend. This uses the phone's GPU, but does not
move game logic to a native thread. Neither API choice nor submission frequency
establishes a performance result.

The upstream [RN Skia v3 documentation](https://github.com/wcandillon/react-native-skia#v3-and-v2)
confirms Graphite with Metal on Apple platforms and Vulkan on Android.

## Coverage at the baseline

| Feature | Reusable SDK logic | Missing native work / acceptance |
| --- | --- | --- |
| Scene graph | Events, transforms, centered flips, sorting, bounds | Nested clips, blend modes, display masks and failure cleanup |
| Images / atlases | Immutable density, trim, SpriteSheet, disposal | Rotated frames, repeat/clip, tint, pixel hits |
| Nine-slice | Logical grids and density | Existing 48 iOS GPU cases must remain unchanged; Android regression |
| Graphics | Paths and hit testing | Gradients, dashes, resource lifecycle |
| Dynamic / rich text | Core wrapping, run metrics and alignment | Existing native shaping; expanded multilingual/layout regression |
| BitmapText / BitmapLabel | Headless bitmap-font layout and resource loader | Direct glyph drawing, font ownership and clipping tests |
| MovieClip | Factory, duration expansion, frame labels/events | Use Game as-is; explicitly drive `advanceFrame` in the scene |
| Tween / ScrollView | Shared Core ticker and touch events | Native integration, detach/cleanup and event tests |
| Particles | Game simulation and pooled particles | Render tag 6, atlas geometry, particle blend/alpha |
| Spine 4.0–4.3 | Published adapters and official versioned runtimes | Mesh drawing, shared Core identity, atlas source dimensions and binary assets |
| UI controls | Layouts, skins, states, bindings and collections | Gallery, controls, scrolling, virtual lists and input bridge |
| CacheAsTexture | Core dirty propagation and cache options | Native offscreen capture, invalidation, resolution and disposal |
| Built-in filters | Filter parameters and invalidation | Native color matrix / blur / glow / shadow; document kernel differences |
| Custom GPU effects | GLSL / multi-pass contracts | Requires a separately designed native effect; GLSL cannot be executed as SkSL |
| Resources / HTTP | Resource queue, analyzers, retries, ownership | Bundled binary/text/file transport, cancellation and Spine atlas pages |
| Fonts / text input | TextField / UI lifecycle | Bundled typeface registration, RN keyboard/selection/focus and IME acceptance |
| Sound / video | Browser media APIs | Optional native media backend; video texture and background/audio focus acceptance |
| DragonBones | Published runtime, Core display / Mesh adapter | Can share native primitives; needs its own animation/assets regression |
| Web / desktop | Existing Core browser player | Native work does not alter Web; desktop host support is a separate project |

Spine support must use the package matching the exported skeleton version.
The existing Spine adapters map additive slots, but do not map multiply/screen
slots or texture wrap hints. Those adapter limitations must remain visible;
a capable native blend implementation alone does not remove them.

## Implementation order

1. Complete shared image, Mesh, BitmapText, particle and compositing primitives.
2. Exercise real Game MovieClips/Tween, published Spine adapters and native UI.
3. Add deterministic GPU pixel and lifecycle regressions alongside the existing
   nine-slice suite. Keep original reference pixels and tolerances.
4. Run the native suite on iOS and Android. Validate generated production bundles.
5. Measure representative scene scales and identify the first limiting component.
   Add optimization only in response to measured bottlenecks.

## Performance acceptance

Default target: 60 FPS (16.67 ms frame budget). Record warm-up separately, then
report p50/p95/p99 for update, recording and submission, along with draw counts,
scene size and missed JS budgets. Include static UI, changing text, moving sprites,
particles, MovieClips, Spine meshes and a 5,000-item virtual list. Test resources
and mounting repeatedly to catch unbounded native allocations.

`FrameStats.fps` is the JS recording/submission frequency. GPU offscreen pixel
readback verifies rendering, and blocks for GPU work; it is not a presented FPS
measurement. A simulation benchmark is diagnostic, not device certification.
Final acceptance requires a Release build on named physical Android and iOS
devices, platform frame timelines, memory/CPU/GPU traces, and sustained thermal
testing. Without those measurements, record the device gate as **unverified**.

RN's official guidance specifies separate JS/UI frame rates, a 16.67 ms budget
at 60 Hz, and performance measurement in Release builds:
[React Native performance](https://reactnative.dev/docs/performance).

## Current native coverage

| Area | Implemented / exercised | Remaining boundary |
| --- | --- | --- |
| Images | 24 independent GPU cases: density × rotation × fill × tint; alpha, trim and pixel hits | HDR/wide gamut and arbitrary fractional nine-slice source splits |
| Nine-slice | Original 48 GPU oracles, source crops, skin switches and cache ownership | First-use GPU readback/upload needs physical-device profiling |
| Mesh / Spine | Textured triangles, ordered compatible Mesh batches, bounded exact-content native buffer sharing, uint16 remapping, dirty geometry, tint, additive; real binary Spineboy in all four versions, weighted meshes, native pixels, pose changes and completion | Published Spine multiply/screen slots and wrap hints; complex asset-specific regressions |
| Spine clipping | Official 4.2 clipper, weighted UV triangles, removed pixels | Representative clipping assets from other versions/projects |
| Game | MovieClip duration/labels/frame/completion events and pixels, Tween completion/removal, particles with isolated-frame GPU edge oracles and URLLoader | MovieClip remains externally scheduled; project-specific gravity/inertia feel |
| ScrollView | Native touch, bounds, scrolling, viewport GPU clip and cleanup | Sustained inertia and gesture conflict acceptance on phones |
| DragonBones | Published 0.1.0: image Mesh, rotated/trimmed atlases, weighted/deformed mesh, nested armatures, tint/alpha, animation/events and borrowed-page disposal | Real exported binary/Surface assets and large-scene profiling |
| Graphics / compositing | Gradient matrices, tint, dash pixels/hits, display masks, multiply/screen/erase, built-in filter pixels | Native Gaussian kernels differ from browser passes; custom GLSL remains unsupported |
| Cache / RenderTexture | GPU snapshots, density, nested dirty propagation, changed bounds, eviction, explicit local capture, clip/scale/readback and disposal; independent captures preserve pending main-renderer Graphics/cache/Mesh updates | Estimates exclude driver/transient storage; 4096² per capture and 64 MiB retained display captures |
| Text | Chinese/emoji wrapping, rich runs, outline, actual ink alignment, registered regular/bold faces and CJK fallback | No exact browser font-rasterization parity; RTL and IME need their own acceptance |
| Bitmap fonts | Kerning/bearings/wrapping/complete-row clipping, BitmapLabel, manifest font page loading, disposal and reload | String BitmapLabel font names use Core's global Resource; private Resource hosts pass the loaded BitmapFont |
| UI | 16 original KUI skins, layout, Label shrink, Button states, CheckBox, Slider, ComboBox, Panel close, bindings and 5,000-item List reuse (6 renderers) | Full application flows, accessibility, all gestures and optional/custom controls |
| Resources / fonts | Bundled binary font/skeleton bytes, multi-page Spine collection/watch, text/JSON/images, cancel/reopen, typeface registration/invalidation | Binary entries use ARRAY_BUFFER, not TextAnalyzer; explicit project font setup; large bytes increase JS bundle size; network/offline-update races |
| Input | RN TextInput overlay; focus, UTF-16 selection, commit-time restriction, hide/detach/background cleanup; mounted switching/unmount; actual iOS screen-keyboard Pinyin, password/maxChars, selected replacement and multiline checks | Android actual typing/IME and physical-device input remain unverified; RN editing font/outline/opacity/tint/effect parity, masks/clips and keyboard avoidance need host work |
| Audio | Optional native backend contract, not-ready/error/cancel/volume/loop/completion/disposal checks | No media engine, audio-focus/background or audio hardware acceptance |
| RN host | Actual Graphite view scene updates, repeated mount/resize/unmount, profiling callbacks and cleanup | Release-device frame timelines, memory traces and thermal endurance |
| Video / custom effects / desktop | Explicitly outside current validated adapter coverage | Native video texture/media host, SkSL effect design, desktop host and packaging |

Skia supplies native GPU drawing. Hermes still evaluates game logic, Spine poses,
UI and drawing traversal; JSI calls and shaping can exhaust the JS frame budget.
Moving the app to RN does not automatically move those tasks off the JS thread.
There is no justified numerical comparison with a C++/Metal/Vulkan game without
the same scene and physical device running both implementations.

## Verification record

The private host is `tests/native/app`, installed with `file:../../..` and exact
registry SDKs. Separate Release test builds contain Skia 3.3.0;
it does not rewrite the npm Demo. Functional rendering requires GPU-backed
snapshots and real RGBA readback. The original nine-slice test file is unchanged.

The final performance records use Release native applications with embedded
production Hermes JS on simulators/emulators. They supersede the earlier Debug
native-client diagnostics; neither set certifies phone performance. Android's
test APK uses a local debug keystore, while its native build type is Release.
Both test IDs are separate from the Demo. After unlocking the Mac, the actual screen keyboard was
tested on iOS 18.2 and 26.5. Pinyin candidate commits, password/maxChars, selected
replacement, multiline Return and focus switching pass. iOS 18.2 also verifies
commit-time restriction and emoji UTF-16 selection/deletion. See the
[manual acceptance record](native-input-acceptance.md) for precise per-OS coverage.
These manual checks used a Debug native client with production JS. Android's
emulator window is unavailable to the native UI tool, so its actual
keystrokes/IME remain unverified; automated focus checks do not close that gate.

Before the manual fixture was added, an independent iPhoneOS Release application
also compiled successfully with
`CODE_SIGNING_ALLOWED=NO`. Its native bundle identifier is separate from the Demo.
This checks native linking and embedded production JS, not installation or phone
performance. The user explicitly limited this round to simulators; physical
installation, signing and performance measurements are deferred.

Final tooling checks: `pnpm build`, 35/35 Node tests, private-host type checking
and lint (zero warnings/errors), Node 20-compatible collector compilation and
`git diff --check` pass. Production iOS/Android exports contain 4.9 MB Hermes
bundles. Their sourcemaps contain 1,672/1,670 sources and no generator, development
supervisor, CLI, ui-document, TypeScript compiler or Chokidar modules. These are
private-host bundles containing all four Spine runtimes and binary fixtures;
4.9 MB is not the size of the library or a minimal application. Package
inspection excludes native test sources/assets. Core, Demo and Spine repository
working trees remain clean.

See [the source-checkout test instructions](../tests/native/README.md) and the
recorded distributions below. No dependent SDK version bump or Web migration
is required. Existing Core/UI/Game/Spine/DragonBones installations, templates,
examples and the npm Demo remain unaffected. To adopt these capabilities later,
publish a new Skia version and explicitly update the consuming application's
installation/lock. The generator binary/type additions are optional adoption;
Game and skeletal packages remain project-owned dependencies.

## Measured scene limits

The original 15 fixtures keep their workloads; the added sixteenth scene offsets
20 Spineboy phases. All use a 720×1280 offscreen GPU surface, 30 warm-up frames and 120
measured frames. Every frame includes update, native recording and synchronous
GPU completion. The wait is part of this diagnostic and is not the asynchronous
submission cost in `KurotView`. Particle populations are asserted, and the virtual
list fixture scrolls a true 5,000-row collection while retaining fewer than 30
renderers. The bitmap counter uses a synthetic font and is a timing fixture.

Final fresh-launch Release runs completed at 04:02:41 / 04:04:04 / 04:05:34 UTC on
2026-10-11. Each contains a functional pass, all 16
benchmarks, three mounted RN focus/switch/unmount checks and final complete pass.
Failed/interrupted runs and `probe-complete` debugging records are excluded.

The host is an Apple M1 Max Mac. iOS uses simulator Metal; Android API 36 uses
software Vulkan (llvmpipe LLVM 21.1.4), rather than a phone GPU. Its visible emulator
advertises Apple M1 Max for GLES; that does not change its software Vulkan backend.
Only one test client was active at a time; desktop workload was not controlled.
The numbers diagnose these environments and must not rank phone models/platforms.
All values below are **p95 total milliseconds**, including synchronous GPU wait.
Full update/record/wait/total p50/p95/p99/max, over-budget percentages, native-view
profiles, versions and a source fingerprint are preserved in
[the measured distributions](native-benchmarks-2026-10-11.json).

| Fixture | iOS 26.5 p95 ms | iOS 18.2 p95 ms | Android software Vulkan p95 ms |
| --- | ---: | ---: | ---: |
| sprites-100 | 6.942 | 5.578 | 4.167 |
| sprites-500 | 7.696 | 7.660 | 11.829 |
| sprites-1000 | 8.498 | 8.876 | 22.077 |
| particles-1000 | 8.608 | 8.552 | 6.918 |
| particles-5000 | 11.725 | 11.831 | 28.742 |
| movieclips-100 | 6.013 | 6.551 | 3.280 |
| text-static-100 | 7.984 | 7.766 | 5.354 |
| text-changing-100 | 13.838 | 13.968 | 16.698 |
| text-cached-100 | 3.738 | 2.609 | 2.629 |
| bitmaptext-changing-100 | 8.336 | 8.712 | 5.173 |
| spine-4.2-1 | 6.414 | 5.982 | 3.928 |
| spine-4.2-5 | 9.124 | 8.567 | 6.069 |
| spine-4.2-20 | 13.240 | 13.131 | 18.242 |
| spine-4.2-20-staggered | 16.954 | 16.905 | 23.217 |
| ui-gallery-16 | 6.920 | 7.204 | 4.016 |
| ui-virtual-list-5000 | 8.192 | 8.636 | 4.436 |

The 16-skin gallery, scrolling virtual list, 100 MovieClips, 1,000 opaque
same-frame sprites, changing 100 text fields and 5,000 particles fit the iOS
diagnostic p95 budget. These are synthetic thresholds, not portable object-count
limits for arbitrary games. The current changing-text p99 is 16.397/16.519 ms;
its over-budget frame percentages are 0.8%/0.8%. A p95 pass does not imply zero
missed frames.

The original synchronized 20-Spineboy scene improves from 25.334/26.639/36.063 ms
to 13.240/13.131/18.242 ms p95. Ordered Mesh batches reduce adapter operations
from 360 to 20; exactly matching geometry may share immutable native buffers.
All 20 actors still update independently. The added different-phase scene costs
16.954/16.905/23.217 ms p95, revealing the cost of separate geometry. Both iOS
original-scene p95 values meet the budget; p99 is still 19.396/21.028 ms and
3.3%/1.7% of frames exceed it. Android software Vulkan remains over budget for
20 Spineboy, 1,000 sprites, 5,000 particles and changing text (16.698 ms p95).
See [the optimization report](native-spine-optimization.md) and
[the retained baseline](native-spine-baseline-2026-10-11.json) for provenance and
component measurements. The added fixture has no before measurement.

Actual mounted RN input/view checks pass functionally. Their three iOS p99 totals
are 5.795/6.640/3.069 ms and 10.162/2.986/3.643 ms. Android's cold mount/focus
checks have p99 16.330/41.224/4.166 ms. These profiles expose interaction tails;
no presented-FPS or input-performance acceptance is claimed from them.

The measured optimizations include bounded short-text numeric caches, GPU subtree
caches, retained particle transforms, ordinary sprite batches and ordered Mesh
batches with exact-content native geometry sharing. Native shaping still costs
large changing-text scenes; stable labels/cached panels and bitmap counters can
reduce it when they fit the design. Pose evaluation, different-pose vertex
construction and JS/JSI still need a project-specific budget. This implementation
does not establish an unrestricted 60 FPS guarantee.

Sprite batching is deliberately limited to opaque source frames of at most 256²
physical pixels, identical tint/filter/frame, uniform rotation/scale and full
inherited/sprite opacity. Transparent frames and fades use the individual painter:
the broader atlas path exceeded the existing two-channel-unit pixel tolerance on
iOS. Atlas frames are isolated first; a regression also reproduced neighboring
pixel bleeding in particles before their cached upright frame fix. First-use
readback/copy/source-alpha inspection is excluded by warm-up and needs a separate
resource-loading trace on phones. No oracle tolerance was relaxed.

## Remaining acceptance order

1. Named physical iOS/Android Release builds: presented frame timelines, p95/p99,
   CPU/GPU/memory/GC, resource peaks, repeated scene changes and thermal endurance.
2. Actual Android keyboard/IME, and physical-device input/backgrounding/keyboard
   avoidance; touch scrolling and gesture conflict on those same devices. Listed
   iOS simulator keyboard cases are already recorded separately.
3. Select a project-owned audio host and validate playback, focus, interruption,
   latency and background policy. Video needs a separate native texture contract.
4. Project-specific Spine/DragonBones exports, large particle simulation, custom
   controls, RTL/accessibility and effect fidelity. Design native custom effects
   separately from WebGL GLSL rather than treating them as interchangeable.
