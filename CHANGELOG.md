# Changelog

## 0.1.5 — 2026-10-11

Prepared for publication; registry publication is pending.

### Added and changed

- Group native runtime sources into view, rendering, cache, text, input, resources and Spine folders, and arrange both runtime barrels by responsibility. Update relative imports, Metro port mappings, internal test references and the source guide; preserve public entries/exports, implementation bodies and recorded performance identities.
- Add opt-in native `NativePictureCache` subtree command recordings with explicit invalidation/disposal. Preserve ordinary per-child opacity; root placement normally reuses recordings, while external mask relationships, effective alpha/tint and content changes rebuild them.
- Observe Core dirty/structure notifications without editing SDK sources; check recorded sorting state, font revision and source identity/content versions. Release owned Pictures on invalidation, disabled/absent caches, budget eviction and renderer disposal; failed recordings are never retained.
- Keep Picture recordings separate from image captures and Graphite frame transactions. Expose count/draw-operation limits and diagnostic stats without claiming these are GPU bytes or hardware draw calls.
- Add native GPU pixel/lifetime/failure regressions and separate stationary/transformed UI, text and Graphics comparisons against ordinary and image-cached drawing. Core/UI/Game/Spine requirements and the registry Demo are unchanged.
- Preserve complete iOS 26.5 / Android API 36 Release suite results from the Picture feature checkout before directory/export organization (`6259254`), on the recorded Metal / auto-selected llvmpipe backends. Preserve original benchmark/oracle contracts, comparison distributions, cold timings, source/build identities and the explicit SwiftShader batching-oracle failure in `docs/native-picture-cache-2026-10-11.json`. Reduced command recording does not ensure lower total frame time.

### Compatibility and adoption

- Existing public package entries/types, Core 2.5.3, UI 3.5.0 and Skia 3.3.0 requirements, and resource/KUI formats are unchanged. Picture caching is explicitly enabled per subtree; ordinary and image-cached drawing retain their existing contracts. No other Kurot SDK release or higher dependency minimum is required.
- The Demo remains on exact npm 0.1.4. Adopting 0.1.5 requires its explicit declaration/installation/lock update after publication; compatible 0.1.x ranges may adopt through installations/locks. Restart Metro with `--clear` and rebuild embedded Release bundles. Existing development builds with Skia 3.3.0 can be reused.
- The independent native test host retains its local `file:` dependency. Generator-only adoption is optional; engine packages, templates/examples and other applications are unaffected.

## 0.1.4 — 2026-10-11

Native rendering organization and stable notification callbacks. Published and registry/compiled-output verified on 2026-10-11.

### Changed

- Separate RN host/session lifecycle, headless frame timing, Graphite recording transactions and Graphics drawing/cache ownership into internal modules. Preserve display order, compositing, continuous Core ticker rendering, batching and cache budgets.
- Keep the native scene when `onStats` or `onError` changes, using the latest committed callbacks. Scene factory or viewport changes still recreate it.
- Centralize recording cleanup after drawing/submission failures, and test stopped/failed loops, resume clocks and profiling boundaries. Expand mounted native checks to replace both callbacks while retaining the scene and input session.
- Update English/Chinese usage guides, runtime responsibilities and the adaptation plan. Ignore local reference sources, native outputs, staging files and development caches.

### Compatibility and adoption

- Public package entries/types, Core 2.5.3, UI 3.5.0 and Skia 3.3.0 requirements, and resource/KUI formats are unchanged. No Core/UI/Game/Spine or other engine SDK release is required.
- The Demo now installs exact registry 0.1.4 with a matching lock. Other compatible 0.1.x consumers may adopt through their installations/locks. Restart Metro with `--clear`; rebuild embedded Release bundles. Existing development builds containing Skia 3.3.0 can be reused.
- The independent native test host retains its explicit `file:` dependency and refreshes that installation for source validation. Generator-only adoption is optional; engine packages, templates/examples and other applications are unaffected.

### Release verification

- `pnpm build`, all 45 Node tests and `git diff --check` pass. The independent native host passes type checking and zero-warning lint.
- `pnpm pack` cleanly rebuilds the 0.1.4 tarball. All package entry targets/declarations, four new internal modules and English/Chinese guides are present; private test hosts, reference sources and native outputs are excluded.
- A freshly rebuilt iOS 26.5 Release simulator host passes the complete functional/GPU suite, 18 benchmark fixtures and three mounted callback-replacement/input/cleanup checks. Historical iOS 18.2/Android results retain their original 0.1.3 source/build identity; this refactor was rerun on iOS 26.5.

## 0.1.3 — 2026-10-11

Native feature completion and opt-in shared Spine animation caching.

- Add opt-in shared Spine looping-action/skin caches, independent sampled clocks and bounded cross-frame native geometry reuse. Preserve live SDK playback and Core sources; cache mode does not expose live skeletons, mixing or timeline events. Add ownership/budget tests, four-version sample-time GPU oracles and separate cached 20-actor Release benchmarks.

- Add native rotated/repeated/clipped/tinted images, ordered opaque sprite batches with strict source-frame crops, Mesh with uint16 batch remapping, BitmapText/BitmapLabel, batched Game particles and explicit RenderTexture captures. Particle source crops prevent atlas bleeding during fractional scaling and retain rotation/trim/density.
- Add compositing, display masks, native color matrix/blur/glow/drop-shadow, texture caching with density/dirty propagation and bounded retained captures, gradient matrices and dashed strokes.
- Add bundled binary/Spine atlas-page collection and watch, binary HTTP transport, custom typefaces, bounded short-text metric caching and the RN TextInput focus/editing bridge.
- Remount the RN editing view when switching Core fields and explicitly clear Fabric focus after unregistering, with mounted focus/switch/unmount regressions on native clients.
- Expand native Core glue for published Game, Spine 4.0–4.3 and DragonBones without changing SDK sources or Web workflows. Add an optional media-backend contract; no audio/video host is included.
- Merge consecutive compatible identity-local Mesh objects into ordered native vertex draws. Share immutable buffers only for exactly matching positions/UVs/triangles/source frames, with independent actor transforms, paint and reference-counted disposal. Bound the per-frame content memo; retain every actor's pose update.
- Preserve nested cache dirty propagation and local capture semantics for anchored, hidden and singular roots. Independent RenderTexture captures retain the main renderer's pending Graphics, cached subtree and Mesh changes. Load manifest bitmap-font pages without browser globals; verify font disposal and reload.
- Add frame timing distributions and an isolated native GPU/UI/performance test host. Document measured limitations and remaining physical-device gates in the feature assessment.
- Add a manual screen-keyboard fixture and recorded iOS simulator checks for Pinyin candidates, password limits, selection replacement, multiline Return and emoji deletion. Android actual IME and physical-device acceptance remain pending.
- Validate complete native/GPU suites and 18 performance fixtures in independent iOS/Android Release simulation builds. Preserve the original live workloads and add separately named cached 20-Spineboy scenes. At 60 Hz sampling, different-phase cached playback measures p95 7.369 ms on iOS 26.5, 7.847 ms on iOS 18.2 and 10.137 ms on software-Vulkan Android, with 0/360 measured frames over 16.67 ms. Record original build hashes and sampling/bake costs; these are simulator diagnostics, not presented phone FPS.
- Pass all 40 Node tests, covering generation/watch/process cleanup, native geometry ownership and shared-cache budgets/lifecycle. Native JSI/GPU tests run in the separate host, not Node.

### Compatibility and adoption

- Core 2.5.3, UI 3.5.0 and Skia 3.3.0 requirements, package entries and resource/KUI formats remain unchanged. The 0.1.2 integer physical-pixel source-frame/nine-slice rule still applies. No Core/UI/Game/Spine SDK changes or releases are required.
- Native applications update their Skia installation/lockfile and restart Metro with `--clear`. Existing development builds containing Skia 3.3.0 can be reused; embedded Release bundles must be rebuilt. Exact 0.1.2 dependencies require an explicit declaration update. Compatible 0.1.x ranges can adopt through their installation/lockfile.
- Shared Spine playback is opt-in and uses existing skeletons/atlases. It caches one fixed looping action/skin, defaults to 60 Hz and retains independent actor clocks/transforms. Live skeleton edits, mixing, queues and timeline events continue to use the original SDK player. Dispose caches before their caller-owned atlases.
- Generator-only adoption is optional. Other SDK development locks, templates, examples and applications are unaffected. Actual audio/video requires a project-owned backend; physical-device performance, Android actual IME and custom shaders remain pending.

### Release verification

- `pnpm build`, all 40 Node tests with `FORCE_COLOR=1`, and `git diff --check` pass. The cleanly rebuilt tarball includes all runtime/Metro/generator targets, declarations and English/Chinese documentation; private test hosts, sources and native build outputs are excluded.
- Complete pre-release native GPU suites pass on iOS 18.2, iOS 26.5 and Android API 36, including the unchanged 48 nine-slice cases, four-version cached-pose pixel checks and native buffer disposal/reuse. Historical raw data retains its original tested package/source identity.

## 0.1.2 — 2026-10-11

Native nine-slice rendering and source-frame caching, prepared for npm publication.

### Changed

- Replace the custom SkSL/RuntimeEffect with native `drawImageNine` and cached atlas-frame images. Preserve logical borders, source density/trim, nearest/linear filtering, source/object opacity, collapsed destination centers and Core's small-size scale fallback for the validated integer source geometry.
- Copy a frame's source pixels on first use as RGBA_8888, retaining the source alpha representation and avoiding intermediate premultiplied render targets. Reuse the same image across destination/grid/filter changes and skin-state switches within an active atlas. Full-image textures need no crop.
- Release owned crops when their source is unused after a frame or the renderer is disposed; retain caller-owned source images. First use can block for GPU source readback and consumes additional crop storage. Performance is not benchmarked.

### Compatibility and migration

- Source frames must be integer physical pixels inside the image. A nine-slice center must be positive, inside the frame and have integer physical boundaries. Arbitrary fractional physical splits supported by 0.1.1 now fail explicitly; align those boundaries before upgrading or retain 0.1.1. Fractional logical grids remain valid when density conversion yields integer pixels, including half-pixel logical coordinates at 2×.
- Package entries/types, resource/KUI formats and dependencies/peers remain unchanged. Core 2.5.3, UI 3.5.0 when used, and Skia 3.3.0 remain the validated hosts; no Core/UI source changes or other Kurot SDK releases are required.
- After publication, native applications update their Skia installation/lockfile and restart Metro with `--clear`. Exact 0.1.0/0.1.1 declarations need an explicit version update; compatible 0.1.x ranges may adopt through their lockfile. Development builds containing Skia 3.3.0 can be reused. The current Demo keeps npm 0.1.0 until explicitly upgraded.
- Generator-only adoption is optional. Core/UI development locks, templates, examples and other applications are unaffected.

### Documentation and verification

- Update English/Chinese usage guides, native runtime guidance and the adaptation plan for 0.1.2, including cache lifecycle, first-use cost and the physical-pixel grid restriction.
- Release preparation passes `pnpm build`, all 24 Node tests with `FORCE_COLOR=1`, Demo type checking and `git diff --check`; Demo lint has no errors and 14 existing duplicate-import warnings. `pnpm pack` cleanly rebuilds the 0.1.2 tarball, whose native implementation, export targets/declarations, CLI and English/Chinese documentation are verified.
- The same unmodified 48 GPU cases and existing native suites pass on iPhone SE (3rd generation), iOS 18.2, and iPhone 17 Pro, iOS 26.5. Added native checks cover image reuse, skin switches, unused-source eviction, renderer disposal and fractional-split rejection. Normal button joins and clicks are verified.
- Android GPU, outer-edge AA comparison, HDR/wide-gamut crop fidelity and Release-device performance remain pending.

## 0.1.1 — 2026-10-11

GPU nine-slice rendering correction, published on npm. The Demo still installs npm 0.1.0.

### Fixed

- Eliminate horizontal/vertical joins on Graphite GPU surfaces at fractional scales and rotated transforms by sampling all nine regions in one image shader and blending one rectangle.
- Preserve physical source coordinates, logical borders, density, trim, strict region sampling, nearest/linear filtering, source/object opacity and outer-edge AA. Collapsed centers and Core's small-size scale fallback remain supported; the fix does not overlap patches or allocate offscreen textures.
- Compile the effect lazily per renderer and release per-draw shaders, paint and the runtime effect through their owners. `FrameStats.draws` now counts one operation for a nine-slice bitmap rather than up to nine region operations; it remains an adapter-operation count, not a hardware draw-call metric.

### Documentation and verification

- Update the English and Chinese README installation examples to 0.1.1, explain adoption from 0.1.0 and retain the distinction between source preparation and npm publication.
- Document GPU validation and correct the npm Demo workflow versus explicitly selected local file-package development.
- Release preparation passes `pnpm build`, all 24 Node tests with `FORCE_COLOR=1`, and `git diff --check`. `pnpm pack` performs a clean rebuild; the 0.1.1 tarball includes the corrected renderer, all export targets/declarations and both usage guides.
- Validate the fix with the Demo's 48 native GPU regression cases for fractional transforms, rotation/flip, transparency, atlas density/trim, fixed borders and original KUI button states. The regression fails on npm 0.1.0; the fix and existing native suites pass on iPhone SE (3rd generation), iOS 18.2, and iPhone 17 Pro, iOS 26.5. Normal button joins and touch interaction are also verified. Android GPU validation and Release-device performance remain pending.

### Compatibility and adoption

- Public package entries/APIs and resource/KUI formats are unchanged. Core 2.5.3, UI 3.5.0 when used, Skia 3.3.0 and other dependency/peer requirements are unchanged; no Kurot SDK source changes or dependent SDK releases are required.
- Native applications adopt the fix by updating their Skia installation/lockfile to 0.1.1 after publication and restarting Metro with `--clear`. An exact 0.1.0 declaration must be updated explicitly; compatible 0.1.x ranges can adopt through their lockfile.
- Existing development builds containing Skia 3.3.0 can be reused. No authored-resource, skin or generated-entry migration is required. Generator-only users may adopt the patch separately; Core/UI development locks, engine templates/examples and other applications remain unchanged.

## 0.1.0 — 2026-10-11

Initial native rendering adapter and build-time resource/KUI toolkit, prepared for a public npm release. Registry publication is verified separately from this release entry.

### Features

- Extract the Demo's renderer, canvas, dynamic text, textures, Graphics, touch and resource/theme ports into the runtime root entry `@kurot/skia`.
- Provide `createKurotResolver()` through `@kurot/skia/metro`, composing host resolution and selecting one version-bound Core/UI installation.
- Provide the `kurot-project` command and Node APIs `generateProject()` and `watchProject()` through `@kurot/skia/generator`.
- Collect manifest resources, local sheet/bitmap-font image dependencies and runtime remote URLs; emit static Metro or URL asset references and embedded JSON/text.
- Recursively compile KUI, resolve project styles, generate skin factory registration/restoration and theme mappings, and accept explicit theme-map files.
- Watch authored inputs, coalesce saves, serialize regeneration, preserve successful output on errors and clean up an accompanying development command on exit. Normalize filesystem aliases when comparing input fingerprints to suppress delayed duplicate events.
- Validate output ownership and remove stale generated files only after successful compilation.

### Documentation and packaging

- Establish an English usage guide and a matching Chinese guide at `docs/README.zh-CN.md`, covering installation, development, CLI/API usage, generated outputs and host integration.
- Add a native runtime guide and a public adaptation/performance test plan; include all guides, this changelog and compiled code in the package file list.
- Organize runtime adapters in `src/kurot/`, generator tools in `src/generator/`, Metro integration in `src/metro.cts`, and local development tooling in `src/development/`. Keep compiler access behind the pinned KUI integration.
- Add a single Demo `pnpm dev` command for library compilation, installed file-package synchronization, resource watch and Expo; preserve successful output on errors and clean up managed processes.
- Enable public scoped-package publication, record repository metadata, clean and rebuild before packing, and run tests before publishing. Document npm installation separately from local source development.
- Make the process-cleanup test record its PID directly instead of parsing colored console output, validate that PID, and accept only the expected missing-process error during cleanup polling.

### Compatibility

- Node.js >=20 for the generator; applications retain their own platform requirements.
- Existing local consumers retain the `file:` dependency and `kurot-project` command. The build API moves from `/project` to `/generator`; update imports, refresh installation and regenerate output to adopt the new ownership marker.
- Applications using the npm release consume installed package entries and commands without a neighboring library checkout. Joint source development remains available to applications declaring a local `file:` dependency.
- Core/UI host dependencies and other Kurot SDK versions require no migration or release for this package version.
- Native applications install the package as a runtime dependency and configure the library Metro resolver; the Demo migrates its imports and keeps its scenes and project-specific resource/theme initialization.
- Native peers are optional for generator-only users; the current adapter binds Core 2.5.3, UI 3.5.0 when used, and React Native Skia 3.3.0.
- Bitmap-font/audio rendering, text input, offscreen caches, filters and full component coverage remain future work documented in `docs/PLAN.md`.

### Release preparation verification — 2026-10-11

- Clean library build and all 24 Node tests pass; `git diff --check` passes.
- The npm prepublish hook passes all 24 tests with `FORCE_COLOR=1`; the descendant-cleanup regression passes 20 consecutive runs in that environment.
- Packed entry targets and declarations are present, with obsolete generator paths excluded. An independently installed tarball runs resource/KUI generation without Core or native peers.
- The original Demo passes type checking and lint. A separate Demo installation using only the tarball passes generation, type checking, lint and Android Hermes export, including both image assets.
- These packaging checks do not establish iOS support or Release-device performance; pending native validation remains in `docs/PLAN.md`.
